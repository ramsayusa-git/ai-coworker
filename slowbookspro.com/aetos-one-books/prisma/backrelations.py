#!/usr/bin/env python3
"""Add every missing opposite relation field, naming every relation explicitly.

`prisma format` gives up as soon as the schema has other validation errors, and
it picks colliding names when several relations point at the same model. This
does the job deterministically:

  * every forward relation (the side carrying `fields:`) gets an explicit
    relation name `<Model>_<field>` if it has none
  * the target model gets an opposite field named `<model><Field>` (list, or
    single for a @unique FK) carrying the same relation name
"""
import re
import sys
import pathlib

path = pathlib.Path(sys.argv[1])
text = path.read_text()

# --- split into blocks -------------------------------------------------------
blocks, cur, depth = [], [], 0
for line in text.splitlines(keepends=True):
    cur.append(line)
    depth += line.count("{") - line.count("}")
    if depth == 0 and line.strip().endswith("}"):
        blocks.append("".join(cur))
        cur = []
if cur:
    blocks.append("".join(cur))

models = {}
for i, b in enumerate(blocks):
    m = re.search(r'^\s*model\s+(\w+)\s*\{', b, re.M)
    if m:
        models[m.group(1)] = i

FWD = re.compile(
    r'^(\s*)(\w+)\s+(\w+)(\[\])?(\?)?\s+@relation\(([^)]*)\)\s*$'
)

additions = {}          # target model -> [line, ...]
changed_blocks = {}

def field_names(block):
    names = set()
    for line in block.splitlines():
        s = line.strip()
        m = re.match(r'^(\w+)\s+\S', s)
        if m and not s.startswith('@@'):
            names.add(m.group(1))
    return names

def uniquely_named(block, fk_field):
    """True when the FK column carries @unique -> opposite side is 1:1."""
    for line in block.splitlines():
        s = line.strip()
        if s.startswith(fk_field + " ") and "@unique" in s:
            return True
    return False

for name, idx in list(models.items()):
    block = blocks[idx]
    lines = block.splitlines()
    out_lines = []
    for line in lines:
        m = FWD.match(line)
        if not m:
            out_lines.append(line)
            continue
        indent, field, target, is_list, optional, args = m.groups()
        if "fields:" not in args or target not in models:
            out_lines.append(line)
            continue
        rel = re.search(r'^\s*"([^"]+)"', args)
        rel_name = rel.group(1) if rel else f"{name}_{field}"
        if not rel:
            args = f'"{rel_name}", ' + args.strip()
            line = f'{indent}{field} {target}{is_list or ""}{optional or ""} @relation({args})'
        fk = re.search(r'fields:\s*\[(\w+)\]', args)
        fk_field = fk.group(1) if fk else None
        one_to_one = fk_field and uniquely_named(block, fk_field)
        back_name = name[0].lower() + name[1:] + field[0].upper() + field[1:]
        additions.setdefault(target, []).append(
            (back_name, name, rel_name, one_to_one)
        )
        out_lines.append(line)
    changed_blocks[idx] = "\n".join(out_lines) + ("\n" if block.endswith("\n") else "")

for idx, b in changed_blocks.items():
    blocks[idx] = b

added = 0
for target, items in additions.items():
    idx = models[target]
    block = blocks[idx]
    existing_rel_names = set(re.findall(r'@relation\("([^"]+)"', block))
    names = field_names(block)
    new_lines = []
    for back_name, src, rel_name, one_to_one in items:
        # already present? (an explicit opposite carrying this relation name)
        if re.search(r'@relation\("%s"' % re.escape(rel_name), block) and rel_name in existing_rel_names:
            # present only if it is not the forward side inside this same model
            if block.count(f'@relation("{rel_name}"') > 1 or f'fields:' not in block:
                continue
        candidate = back_name
        n = 2
        while candidate in names:
            candidate = f"{back_name}{n}"
            n += 1
        names.add(candidate)
        typ = f"{src}?" if one_to_one else f"{src}[]"
        new_lines.append(f'  {candidate} {typ} @relation("{rel_name}")')
        added += 1
    if not new_lines:
        continue
    lines = block.rstrip().splitlines()
    # insert before the trailing } and any @@ attributes
    insert_at = len(lines) - 1
    while insert_at > 0 and (lines[insert_at - 1].strip().startswith("@@") or not lines[insert_at - 1].strip()):
        insert_at -= 1
    lines = lines[:insert_at] + new_lines + lines[insert_at:]
    blocks[idx] = "\n".join(lines) + "\n"

path.write_text("".join(blocks))
print(f"added {added} opposite relation fields")
