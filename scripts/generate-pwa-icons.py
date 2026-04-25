#!/usr/bin/env python3
"""Generate PWA icon set for Overdive.

Renders a simple branded glyph (stylized wave + 'O') with a teal→green
gradient on a dark background, then exports the sizes referenced by
static/manifest.webmanifest and src/app.html.

Run: python3 scripts/generate-pwa-icons.py
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "static" / "icons"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BG = (10, 15, 20, 255)            # var(--color-bg-card-solid) #0a0f14
PRIMARY = (20, 184, 166)          # teal-500 #14b8a6
SECONDARY = (16, 185, 129)        # green-500 #10b981


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render_master(size: int, *, padded: bool, bg=BG) -> Image.Image:
    """Render a square icon at `size` px.

    padded=True keeps glyph inside ~70% safe zone (for maskable icons).
    """
    img = Image.new("RGBA", (size, size), bg)

    # Diagonal gradient overlay (subtle)
    grad = Image.new("RGBA", (size, size))
    gpx = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            c = lerp(PRIMARY, SECONDARY, t)
            gpx[x, y] = (c[0], c[1], c[2], 30)
    img = Image.alpha_composite(img, grad)

    draw = ImageDraw.Draw(img)

    # Inner safe area
    inset_ratio = 0.18 if padded else 0.10
    inset = int(size * inset_ratio)

    # Outer ring "O"
    ring_outer = inset
    ring_thickness = max(2, int(size * 0.075))
    # Draw ring with gradient by stacking many thin arcs
    steps = 60
    bbox = [ring_outer, ring_outer, size - ring_outer, size - ring_outer]
    for i in range(steps):
        t0 = i / steps
        t1 = (i + 1) / steps
        c = lerp(PRIMARY, SECONDARY, t0)
        # Two halves: top-left → bottom-right
        start = -90 + 360 * t0
        end = -90 + 360 * t1 + 1  # overlap to avoid hairlines
        draw.arc(bbox, start=start, end=end, fill=(c[0], c[1], c[2], 255), width=ring_thickness)

    # Inner stylized wave (single sine line) representing a dive
    wave_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    wdraw = ImageDraw.Draw(wave_layer)
    cx, cy = size / 2, size / 2
    radius = (size / 2) - ring_outer - ring_thickness - max(2, int(size * 0.025))
    wave_w = radius * 1.55
    amp = radius * 0.42
    samples = 240
    pts = []
    for i in range(samples + 1):
        t = i / samples
        x = cx - wave_w / 2 + wave_w * t
        # Two-cycle sine, slightly damped at the ends so it sits inside the ring
        damp = math.sin(math.pi * t)
        y = cy + amp * math.sin(2 * math.pi * 2 * t) * damp
        pts.append((x, y))

    wave_thickness = max(2, int(size * 0.055))
    # Draw wave with gradient by segmenting
    seg = 40
    for i in range(seg):
        a = int(i / seg * samples)
        b = int((i + 1) / seg * samples) + 1
        c = lerp(PRIMARY, SECONDARY, i / seg)
        wdraw.line(pts[a:b], fill=(c[0], c[1], c[2], 255), width=wave_thickness)

    # Soft glow under wave
    glow = wave_layer.filter(ImageFilter.GaussianBlur(radius=size * 0.012))
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, wave_layer)

    return img


def save(img: Image.Image, name: str) -> None:
    p = OUT_DIR / name
    img.save(p, "PNG", optimize=True)
    print(f"  wrote {p.relative_to(ROOT)} ({img.size[0]}×{img.size[1]})")


def main() -> None:
    print("Generating PWA icons →", OUT_DIR.relative_to(ROOT))

    # Standard (full-bleed-ish) icons
    save(render_master(512, padded=False), "icon-512.png")
    save(render_master(192, padded=False), "icon-192.png")

    # Maskable icon: glyph confined to 80% safe zone, full bg bleed
    save(render_master(512, padded=True), "icon-maskable-512.png")

    # Apple touch icon (no transparency, square corners — iOS rounds them)
    apple = render_master(180, padded=False).convert("RGB")
    apple_path = OUT_DIR / "apple-touch-icon-180.png"
    apple.save(apple_path, "PNG", optimize=True)
    print(f"  wrote {apple_path.relative_to(ROOT)} (180×180)")

    # Favicons
    save(render_master(32, padded=False), "favicon-32.png")
    save(render_master(16, padded=False), "favicon-16.png")

    # Top-level favicon.png referenced by SvelteKit default
    fav_top = ROOT / "static" / "favicon.png"
    render_master(64, padded=False).save(fav_top, "PNG", optimize=True)
    print(f"  wrote {fav_top.relative_to(ROOT)} (64×64)")


if __name__ == "__main__":
    main()
