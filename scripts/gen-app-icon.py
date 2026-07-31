#!/usr/bin/env python3
"""Generate src/main/app-icon.ts from build/icon.png.

Packaged builds bundle only dist/** (tsc does not copy PNGs), so the window
icon must be embedded as a base64 data URL. Downscales to 256x256 to keep the
embedded size reasonable while remaining high enough for taskbar/window use on
HiDPI displays.

Requires Pillow. Run from the repo root:

    python3 scripts/gen-app-icon.py

Regenerate whenever build/icon.png changes.
"""
import base64
import io
import json

from PIL import Image

SIZE = 256

img = Image.open('build/icon.png').convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)
buf = io.BytesIO()
img.save(buf, format='PNG')
data_url = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')

lines = [
    '// GENERATED from build/icon.png by scripts/gen-app-icon.py (Pillow) — do not hand-edit.',
    '// Regenerate when the app icon changes. PNG data URL consumed via',
    '// nativeImage.createFromDataURL and passed to new BrowserWindow({ icon }).',
    '',
    'export const APP_ICON: string = ' + json.dumps(data_url) + ';',
]

with open('src/main/app-icon.ts', 'w') as f:
    f.write('\n'.join(lines) + '\n')
print(f'wrote src/main/app-icon.ts ({len(data_url)} chars)')
