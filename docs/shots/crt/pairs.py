"""Before-and-after pairs for the CRT overlays (item 1199).

Each pair puts an era's reference frame from before the overlays (the tree
item 1198 landed at, 1c8c0c3, where eras 0-4 drew with no screen over them)
beside the same era's reference frame on this tree, re-taken by
`node tools/playtest.mjs --ladder --reference`.

    py -3.10 docs/shots/crt/pairs.py [--before <git ref>]

Writes docs/shots/crt/eraN-<name>-before-after.png, one per era 0-4.
Needs Pillow. Run from the repo root.
"""
import argparse
import io
import os
import subprocess

from PIL import Image, ImageDraw

ERAS = ['era0-arcade', 'era1-atari2600', 'era2-nes', 'era3-genesis', 'era4-snes']
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--before', default='1c8c0c3', help='the git ref whose frames are "before"')
    a = ap.parse_args()
    for name in ERAS:
        rel = 'docs/shots/eras/%s.png' % name
        old = subprocess.run(['git', 'show', '%s:%s' % (a.before, rel)], cwd=ROOT,
                             capture_output=True, check=True).stdout
        before = Image.open(io.BytesIO(old)).convert('RGB')
        after = Image.open(os.path.join(ROOT, rel)).convert('RGB')
        h = max(before.height, after.height)
        gap, label = 12, 28
        out = Image.new('RGB', (before.width + after.width + gap, h + label), (24, 24, 24))
        out.paste(before, (0, label))
        out.paste(after, (before.width + gap, label))
        d = ImageDraw.Draw(out)
        d.text((8, 8), 'before: %s, no screen' % name, fill=(220, 220, 220))
        d.text((before.width + gap + 8, 8), 'after: on the CRT of its day', fill=(220, 220, 220))
        path = os.path.join(HERE, '%s-before-after.png' % name)
        out.save(path)
        print(path, out.size)


if __name__ == '__main__':
    main()
