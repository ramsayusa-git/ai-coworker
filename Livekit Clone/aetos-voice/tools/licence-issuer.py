#!/usr/bin/env python3
"""Lattice Net licence issuer — vendor-side tool.

This is the ONLY place the Ed25519 private half exists. It never ships with a
customer install; the runtime only ever holds the public half, which is why
verification stays offline (no network call in any code path).

    keygen                       create the signing keypair (once, ever)
    pubkey                       print the public half to configure runtimes
    issue --licensee "Acme Ltd"  mint a signed licence file

Key locations (outside the repo, deliberately — a signing key in git is a
product-wide compromise):
    ~/.aetos/issuer/signing.key   private, 0600
    ~/.aetos/issuer/public.key    public hex, safe to publish
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import pathlib
import sys

from nacl.signing import SigningKey, VerifyKey

ISSUER = pathlib.Path.home() / ".aetos" / "issuer"
PRIV = ISSUER / "signing.key"
PUB = ISSUER / "public.key"

# Every capability the platform gates on. "enterprise" gets all of them; the
# lower tiers are subsets. Keep this list in step with licensing.has_feature
# call sites.
ALL_FEATURES = [
    "multi_tenant", "white_label", "reseller", "sso", "scim",
    "byo_models", "self_hosted", "on_premises", "cloud_hosted",
    "agent_designer", "agent_versioning", "voice_cloning",
    "call_recording", "analytics", "webhooks", "api_keys",
    "sip_trunking", "number_provisioning", "audit_log",
    "priority_support", "custom_domain", "air_gapped",
]

TIERS = {
    "starter":    {"tenants_max": 1,    "concurrent_sessions_max": 10,
                   "features": ["agent_designer", "analytics", "api_keys"]},
    "business":   {"tenants_max": 5,    "concurrent_sessions_max": 100,
                   "features": ["multi_tenant", "agent_designer", "agent_versioning",
                                "analytics", "api_keys", "webhooks", "call_recording",
                                "sip_trunking", "number_provisioning", "audit_log"]},
    "enterprise": {"tenants_max": None, "concurrent_sessions_max": None,
                   "features": ALL_FEATURES},
}


def canonical(payload: dict) -> bytes:
    """Must match licensing.canonical byte for byte or nothing verifies."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def load_key() -> SigningKey:
    if not PRIV.exists():
        sys.exit("No signing key. Run:  licence-issuer.py keygen")
    return SigningKey(bytes.fromhex(PRIV.read_text().strip()))


def keygen(args) -> None:
    ISSUER.mkdir(parents=True, exist_ok=True)
    if PRIV.exists() and not args.force:
        sys.exit(str(PRIV) + " already exists. Rotating it invalidates every "
                 "licence already issued. Pass --force only if you mean that.")
    sk = SigningKey.generate()
    PRIV.write_text(sk.encode().hex())
    PRIV.chmod(0o600)
    pub = sk.verify_key.encode().hex()
    PUB.write_text(pub)
    ISSUER.chmod(0o700)
    print("Signing key written to " + str(PRIV) + " (0600). Back it up offline.")
    print("")
    print("Configure every runtime with:")
    print("  LATTICE_LICENCE_PUBKEY=" + pub)


def pubkey(args) -> None:
    if not PUB.exists():
        sys.exit("No key yet. Run:  licence-issuer.py keygen")
    print(PUB.read_text().strip())


def _cap(explicit, tier_default):
    """-1 means unlimited; None means take the tier default."""
    if explicit is None:
        return tier_default
    return None if explicit < 0 else explicit


def issue(args) -> None:
    sk = load_key()
    tier = TIERS[args.tier]

    if args.expires:
        expires = args.expires
    elif args.years:
        expires = (dt.datetime.now(dt.timezone.utc)
                   + dt.timedelta(days=365 * args.years)).isoformat()
    else:
        expires = None  # perpetual

    lic_id = args.licence_id or ("lic_" + base64.b32encode(
        SigningKey.generate().encode()[:10]).decode().lower().rstrip("="))

    payload = {
        "licence_id": lic_id,
        "licensee": args.licensee,
        "owner_email": args.owner_email,
        "tier": args.tier,
        "tenants_max": _cap(args.tenants_max, tier["tenants_max"]),
        "concurrent_sessions_max": _cap(args.sessions_max,
                                        tier["concurrent_sessions_max"]),
        "features": sorted(set(tier["features"]) | set(args.feature or [])),
        "issued_at": dt.datetime.now(dt.timezone.utc)
                       .replace(microsecond=0).isoformat(),
        "expires_at": expires,
        "grace_days": args.grace_days,
        "deployment": args.deployment,
    }

    sig = base64.b64encode(sk.sign(canonical(payload)).signature).decode()
    doc = {"payload": payload, "signature": sig}

    # Prove it verifies with the public half before handing it to anyone.
    VerifyKey(sk.verify_key.encode()).verify(canonical(payload),
                                             base64.b64decode(sig))

    out = pathlib.Path(args.out)
    out.write_text(json.dumps(doc, indent=2) + "\n")
    print("Issued " + payload["tier"] + " licence to " + payload["licensee"]
          + " <" + payload["owner_email"] + ">")
    print("  licence:  " + lic_id)
    print("  tenants:  " + str(payload["tenants_max"] or "unlimited"))
    print("  sessions: " + str(payload["concurrent_sessions_max"] or "unlimited"))
    print("  expires:  " + str(payload["expires_at"] or "never (perpetual)"))
    print("  features: " + str(len(payload["features"])))
    print("  file:     " + str(out))


def main() -> None:
    p = argparse.ArgumentParser(prog="licence-issuer")
    sub = p.add_subparsers(dest="cmd", required=True)

    kg = sub.add_parser("keygen")
    kg.add_argument("--force", action="store_true")
    kg.set_defaults(func=keygen)

    pk = sub.add_parser("pubkey")
    pk.set_defaults(func=pubkey)

    iss = sub.add_parser("issue")
    iss.add_argument("--licensee", required=True)
    iss.add_argument("--owner-email", required=True)
    iss.add_argument("--tier", choices=sorted(TIERS), default="enterprise")
    iss.add_argument("--years", type=int, default=0,
                     help="omit for a perpetual licence")
    iss.add_argument("--expires", default="", help="explicit ISO-8601 expiry")
    iss.add_argument("--grace-days", type=int, default=30)
    iss.add_argument("--tenants-max", type=int, default=None,
                     help="-1 for unlimited; omit for the tier default")
    iss.add_argument("--sessions-max", type=int, default=None,
                     help="-1 for unlimited; omit for the tier default")
    iss.add_argument("--feature", action="append",
                     help="extra feature flag; repeatable")
    iss.add_argument("--deployment", default="any",
                     choices=["any", "cloud", "self_hosted", "on_premises"])
    iss.add_argument("--licence-id", default="")
    iss.add_argument("--out", default="licence.json")
    iss.set_defaults(func=issue)

    a = p.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
