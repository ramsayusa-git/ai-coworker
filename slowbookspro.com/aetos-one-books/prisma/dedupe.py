#!/usr/bin/env python3
"""Drop duplicate field declarations inside each model block (prisma format can
emit a back-relation twice when several named relations target one model)."""
import re
import sys
import pathlib

p = pathlib.Path(sys.argv[1])
out, seen, depth, removed = [], set(), 0, 0
for line in p.read_text().splitlines():
    stripped = line.strip()
    if re.match(r'^(model|enum|type|generator|datasource)\s+\w*\s*\{?', stripped) and stripped.endswith('{'):
        depth += 1
        seen = set()
        out.append(line)
        continue
    if stripped == '}':
        depth = max(0, depth - 1)
        out.append(line)
        continue
    m = re.match(r'^(\w+)\s+\S', stripped)
    if depth and m and not stripped.startswith('@@') and not stripped.startswith('//'):
        name = m.group(1)
        if name in seen:
            removed += 1
            continue
        seen.add(name)
    out.append(line)
p.write_text("\n".join(out) + "\n")
print(f"removed {removed} duplicate field lines")
