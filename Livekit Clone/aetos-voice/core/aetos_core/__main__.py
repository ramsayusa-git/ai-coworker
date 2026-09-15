"""Core CLI.

    python -m aetos_core seed-owner --email you@example.com [--tenant default]
    python -m aetos_core reset-password --email you@example.com
    python -m aetos_core list-users
    python -m aetos_core install-licence --file licence.json
"""
from __future__ import annotations

import argparse
import json
import sys

from .db import (DEFAULT_TENANT_ID, Licence, Membership, Session, Tenant, User,
                 ensure_tenancy, init_db, now, uid)
from .security import generate_password, hash_password, password_problem


def _tenant_by_slug(s, slug: str) -> Tenant:
    t = s.query(Tenant).filter(Tenant.slug == slug.lower()).first()
    if not t:
        sys.exit(f"No tenant with slug '{slug}'. Known: "
                 + ", ".join(x.slug for x in s.query(Tenant).all()))
    return t


def seed_owner(args) -> None:
    init_db()
    email = args.email.strip().lower()
    with Session() as s:
        ensure_tenancy(s)
        tenant = _tenant_by_slug(s, args.tenant)

        password = args.password or generate_password()
        problem = password_problem(password)
        if problem:
            sys.exit(problem)

        user = s.query(User).filter(User.email == email).first()
        created = user is None
        if created:
            user = User(email=email, name=args.name or email.split("@")[0],
                        password_hash=hash_password(password),
                        must_change_password=args.password is None)
            s.add(user)
            s.flush()
        elif args.password:
            user.password_hash = hash_password(password)

        m = s.query(Membership).filter(Membership.tenant_id == tenant.id,
                                       Membership.user_id == user.id).first()
        if m:
            m.role = "owner"
        else:
            s.add(Membership(tenant_id=tenant.id, user_id=user.id, role="owner"))
        s.commit()

        print(f"{'Created' if created else 'Updated'} owner {email} "
              f"on tenant '{tenant.slug}' ({tenant.id})")
        if created or args.password:
            print()
            print(f"  email:    {email}")
            print(f"  password: {password}")
            print()
            if args.password is None:
                print("  This password is shown once and must be changed at first login.")


def reset_password(args) -> None:
    init_db()
    with Session() as s:
        user = s.query(User).filter(User.email == args.email.lower()).first()
        if not user:
            sys.exit(f"No user {args.email}")
        password = args.password or generate_password()
        problem = password_problem(password)
        if problem:
            sys.exit(problem)
        user.password_hash = hash_password(password)
        user.must_change_password = args.password is None
        s.commit()
        print(f"Password reset for {user.email}")
        print(f"  password: {password}")


def list_users(args) -> None:
    init_db()
    with Session() as s:
        for u in s.query(User).order_by(User.email).all():
            roles = []
            for m in s.query(Membership).filter(Membership.user_id == u.id).all():
                t = s.get(Tenant, m.tenant_id)
                roles.append(f"{t.slug if t else m.tenant_id}:{m.role}")
            flag = "" if u.status == "active" else f" [{u.status}]"
            chg = " (must change password)" if u.must_change_password else ""
            print(f"{u.email:<38} {', '.join(roles) or '(no tenants)'}{flag}{chg}")


def install_licence(args) -> None:
    init_db()
    blob = open(args.file).read()
    try:
        json.loads(blob)
    except json.JSONDecodeError as e:
        sys.exit(f"Not valid JSON: {e}")
    from .licensing import verify_licence
    ok, data, err = verify_licence(blob)
    if not ok:
        sys.exit(f"Licence rejected: {err}")
    with Session() as s:
        row = s.get(Licence, 1)
        if row:
            row.blob = blob
            row.installed_at = now()
        else:
            s.add(Licence(id=1, blob=blob))
        s.commit()
    print(f"Licence installed: {data.get('licensee')} / {data.get('tier')} "
          f"expires {data.get('expires_at')}")


def main() -> None:
    p = argparse.ArgumentParser(prog="aetos_core")
    sub = p.add_subparsers(dest="cmd", required=True)

    so = sub.add_parser("seed-owner", help="create or promote an owner account")
    so.add_argument("--email", required=True)
    so.add_argument("--tenant", default="default")
    so.add_argument("--name", default="")
    so.add_argument("--password", default=None,
                    help="omit to generate one (recommended)")
    so.set_defaults(func=seed_owner)

    rp = sub.add_parser("reset-password")
    rp.add_argument("--email", required=True)
    rp.add_argument("--password", default=None)
    rp.set_defaults(func=reset_password)

    lu = sub.add_parser("list-users")
    lu.set_defaults(func=list_users)

    il = sub.add_parser("install-licence")
    il.add_argument("--file", required=True)
    il.set_defaults(func=install_licence)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
