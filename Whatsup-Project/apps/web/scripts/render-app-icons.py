"""Renders the raster app icons (Apple touch icon, PWA icons) from the same geometry as
src/app/icon.svg. Kept as a script rather than hand-exported binaries so the mark can be
changed in one place and re-rendered: `python3 scripts/render-app-icons.py`."""
from PIL import Image, ImageDraw

G0, G1 = (16, 185, 129), (4, 120, 87)   # brand-500 -> brand-700
SS = 4                                   # supersample factor for clean edges


def render(size: int) -> Image.Image:
    s = size * SS
    # Diagonal gradient tile
    grad = Image.new("RGB", (s, s))
    px = grad.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s - 2)
            px[x, y] = tuple(int(a + (b - a) * t) for a, b in zip(G0, G1))

    # Rounded-square mask
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.25), fill=255)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    u = s / 32.0                      # one unit of the 32x32 SVG viewBox
    w = 3.2 * u                       # stroke width, matching the SVG
    cx, cy, r = 13.4 * u, 13.2 * u, 6.1 * u
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 255), width=int(round(w)))
    d.line([(19.5 * u, 12.4 * u), (19.5 * u, 25.4 * u)], fill=(255, 255, 255, 255), width=int(round(w)))
    # Round the tail's ends the way stroke-linecap="round" does in the SVG
    for (px_, py_) in [(19.5 * u, 12.4 * u), (19.5 * u, 25.4 * u)]:
        d.ellipse([px_ - w / 2, py_ - w / 2, px_ + w / 2, py_ + w / 2], fill=(255, 255, 255, 255))

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    render(180).save("src/app/apple-icon.png")
    render(192).save("public/brand/icon-192.png")
    render(512).save("public/brand/icon-512.png")
    print("wrote src/app/apple-icon.png, public/brand/icon-192.png, public/brand/icon-512.png")
