#!/usr/bin/env python3
"""Generate src/main/app-icon.ts from build/icon.png.

Emits two exports:
- DESKTOP_ICONS: base64 PNG data URLs at every hicolor size (16, 32, 48, 64,
  128, 256, 512). Consumed by src/main/desktop-install.ts to seed the user's
  ~/.local/share/icons/hicolor/*/apps/ tree when running as an AppImage.
- APP_ICON: the 256x256 data URL, used by main.ts for the BrowserWindow icon.

Packaged builds bundle only dist/** (tsc does not copy PNGs), so runtime code
cannot read build/icon.png directly. Embedding as base64 is the pattern set by
tray-icons.ts.

Requires Pillow. Run from the repo root:

    python3 scripts/gen-app-icon.py

Regenerate whenever build/icon.png changes.
"""
import base64
import io
import json

from PIL import Image

SIZES = [16, 32, 48, 64, 128, 256, 512]

src = Image.open('build/icon.png').convert('RGBA')

icons: dict[str, str] = {}
for size in SIZES:
    img = src.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    icons[str(size)] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')

lines = [
    '// GENERATED from build/icon.png by scripts/gen-app-icon.py (Pillow) — do not hand-edit.',
    '// Regenerate when the app icon changes.',
    '//',
    '// DESKTOP_ICONS: PNG data URLs keyed by pixel size — consumed by',
    '// desktop-install.ts to seed ~/.local/share/icons/hicolor/*/apps/.',
    '// APP_ICON: the 256x256 data URL — consumed by main.ts for the',
    '// BrowserWindow window icon via nativeImage.createFromDataURL.',
    '',
    'export const DESKTOP_ICONS: Record<string, string> = {',
]
for size in SIZES:
    lines.append('  ' + json.dumps(str(size)) + ': ' + json.dumps(icons[str(size)]) + ',')
lines.append('};')
lines.append('')
lines.append("export const APP_ICON: string = DESKTOP_ICONS['256'];")

with open('src/main/app-icon.ts', 'w') as f:
    f.write('\n'.join(lines) + '\n')

total = sum(len(v) for v in icons.values())
print(f'wrote src/main/app-icon.ts ({total} chars across {len(SIZES)} sizes)')
