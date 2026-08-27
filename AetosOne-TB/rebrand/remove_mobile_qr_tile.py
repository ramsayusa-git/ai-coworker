#!/usr/bin/env python3
"""Remove the upstream "Connect mobile app" QR tile from the home-page dashboards.

The tile lives in the `mobile_app_qr_code` dashboard state, stacked under the
"Getting started" widget. We drop the QR widget and grow "Getting started" to
fill the space it vacated. Idempotent.
"""
import json
import os
import sys

DASH = ("/run/media/krishna/data-backup/claude-cowork/AetosOne-TB/thingsboard"
        "/ui-ngx/src/assets/dashboard")
FILES = ("tenant_admin_home_page.json", "sys_admin_home_page.json",
         "customer_user_home_page.json")
QR_FQN = "system.mobile_app_qr_code"


def strip(path):
    with open(path) as f:
        doc = json.load(f)
    cfg = doc.get("configuration", {})
    widgets = cfg.get("widgets", {})

    qr_ids = {wid for wid, w in widgets.items() if w.get("typeFullFqn") == QR_FQN}
    if not qr_ids:
        return 0

    removed = 0
    for state in cfg.get("states", {}).values():
        for layout in state.get("layouts", {}).values():
            lw = layout.get("widgets", {})
            for qid in qr_ids & set(lw):
                freed = lw[qid].get("sizeY", 0) + lw[qid].get("row", 0)
                del lw[qid]
                removed += 1
                # grow whatever sat directly above it to reclaim the space
                for pos in lw.values():
                    if pos.get("row", 0) + pos.get("sizeY", 0) < freed:
                        pos["sizeY"] = freed - pos.get("row", 0)

    for qid in qr_ids:
        widgets.pop(qid, None)

    with open(path, "w") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
    return removed


def main():
    total = 0
    for name in FILES:
        p = os.path.join(DASH, name)
        if not os.path.exists(p):
            continue
        n = strip(p)
        total += n
        print(f"{name}: {'removed ' + str(n) + ' QR tile(s)' if n else 'already clean'}")
    return 0 if total or True else 1


if __name__ == "__main__":
    sys.exit(main())
