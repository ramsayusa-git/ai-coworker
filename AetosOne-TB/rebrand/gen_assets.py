#!/usr/bin/env python3
"""Aetos One Cloud - generate ThingsBoard UI brand assets from logo-work/ sources.

The circular badge is the mark used everywhere in the UI chrome. Its white
interior is knocked out so the toolbar colour shows through; the small white
dots inside the shield become holes, which is the original design intent
(they read as toolbar-coloured nodes against the white shield).

Favicons and PWA icons deliberately keep the opaque white disc: a transparent
interior makes the navy shield disappear on dark browser tab bars, and maskable
icons are required to be opaque.
"""
import base64
import io
import os
import shutil

from PIL import Image

SRC = "/run/media/krishna/data-backup/claude-cowork/AetosOne-TB/logo-work"
UI = "/run/media/krishna/data-backup/claude-cowork/AetosOne-TB/thingsboard/ui-ngx/src"
ASSETS = os.path.join(UI, "assets")

ORANGE = (0xE6, 0x70, 0x1C)
WHITE_CUTOFF = 232

LICENSE = """<!--

    Copyright (c) 2026 Aetos One Cloud

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

-->
"""


def dist(a, b):
    return sum((a[i] - b[i]) ** 2 for i in range(3)) ** 0.5


def trim(im):
    bbox = im.split()[3].getbbox()
    return im.crop(bbox) if bbox else im


def knockout_white(im):
    """Every near-white pixel becomes transparent, inside and outside the badge."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r > WHITE_CUTOFF and g > WHITE_CUTOFF and b > WHITE_CUTOFF:
                px[x, y] = (255, 255, 255, 0)
    return im


def to_white_artwork(im):
    """Navy artwork -> white, accent orange preserved. For dark backgrounds."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 12 or dist((r, g, b), ORANGE) < 110:
                continue
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            px[x, y] = (255, 255, 255, int(a * (1.0 - lum * 0.55)))
    return im


def svg_from_image(im, path):
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    w, h = im.size
    svg = (
        LICENSE
        + f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{w}" height="{h}" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet">\n'
        f"  <title>Aetos One Cloud</title>\n"
        f'  <image width="{w}" height="{h}" x="0" y="0" xlink:href="data:image/png;base64,{b64}"/>\n'
        f"</svg>\n"
    )
    with open(path, "w") as f:
        f.write(svg)
    print(f"wrote {os.path.basename(path)} ({w}x{h}, {len(svg)//1024} KB)")


def main():
    badge = Image.open(os.path.join(SRC, "AetosOne_badge.jpg")).convert("RGBA")

    knocked = trim(knockout_white(badge.copy()))
    # UI chrome: toolbar and login sit on dark surfaces
    svg_from_image(to_white_artwork(knocked.copy()), os.path.join(ASSETS, "logo_title_white.svg"))
    svg_from_image(to_white_artwork(knocked.copy()), os.path.join(ASSETS, "logo_white.svg"))
    # light surfaces: keep the navy shield and orange ring
    svg_from_image(knocked.copy(), os.path.join(ASSETS, "logo_title_color.svg"))
    svg_from_image(knocked.copy(), os.path.join(ASSETS, "logo_color.svg"))

    # favicon + PWA icons keep the opaque white disc
    icons = os.path.join(ASSETS, "icons")
    os.makedirs(icons, exist_ok=True)
    opaque = badge.convert("RGB")
    for size in (16, 32, 180, 192, 384, 512):
        resized = opaque.resize((size, size), Image.LANCZOS)
        name = f"apple-180.png" if size == 180 else f"favicon-{size}x{size}.png"
        resized.save(os.path.join(icons, name))
        if size in (192, 512):
            resized.save(os.path.join(icons, f"maskable-{size}.png"))
    opaque.resize((64, 64), Image.LANCZOS).save(
        os.path.join(UI, "aetosone.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote aetosone.ico and PWA icons")

    # keep the previous full lockup available for documents and email
    full = os.path.join(SRC, "AetosOne_logo_full.png")
    if os.path.exists(full):
        svg_from_image(trim(knockout_white(Image.open(full).convert("RGBA"))),
                       os.path.join(ASSETS, "logo_lockup_color.svg"))


if __name__ == "__main__":
    main()
