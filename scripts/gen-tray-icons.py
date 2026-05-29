#!/usr/bin/env python3
"""Generate src/main/tray-icons.ts from build/icon.png.

The tray needs its icon embedded as base64 because packaged builds bundle only
dist/** (tsc does not copy PNGs). This emits a base variant plus badged
variants for counts 1-9 and a 9+ overflow badge.

Requires Pillow. Run from the repo root:

    python3 scripts/gen-tray-icons.py

Regenerate whenever build/icon.png changes.
"""
import base64
import io
import json

from PIL import Image, ImageDraw, ImageFont

SIZE = 48
FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
BADGE_RED = (239, 68, 68, 255)
WHITE = (255, 255, 255, 255)

base = Image.open('build/icon.png').convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)


def badged(label: str, font_px: int) -> Image.Image:
    img = base.copy()
    draw = ImageDraw.Draw(img)
    cx, cy, r = 33, 33, 14
    draw.ellipse([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], fill=WHITE)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BADGE_RED)
    font = ImageFont.truetype(FONT_PATH, font_px)
    tb = draw.textbbox((0, 0), label, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    draw.text((cx - tw / 2 - tb[0], cy - th / 2 - tb[1]), label, font=font, fill=WHITE)
    return img


def to_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def main() -> None:
    variants = {'base': base}
    for n in range(1, 10):
        variants[str(n)] = badged(str(n), 22)
    variants['9+'] = badged('9+', 16)

    lines = [
        '// GENERATED from build/icon.png by scripts/gen-tray-icons.py (Pillow) — do not hand-edit.',
        '// Regenerate when the app icon changes. Keys: "base", "1".."9", "9+".',
        '// Each value is a PNG data URL consumed via nativeImage.createFromDataURL.',
        '',
        'export const TRAY_ICONS: Record<string, string> = {',
    ]
    for key, img in variants.items():
        lines.append('  ' + json.dumps(key) + ': ' + json.dumps(to_data_url(img)) + ',')
    lines.append('};')

    with open('src/main/tray-icons.ts', 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print('wrote src/main/tray-icons.ts with keys:', list(variants.keys()))


if __name__ == '__main__':
    main()
