"""Item 1201: the eleven eras as they now appear, on one sheet, two rows.

Reads the tracked reference frames beside this file (era0-arcade.png to
era10-xbox360.png, which `node tools/playtest.mjs --ladder --reference` shoots
off the real page with the display layer and every screen overlay on) and lays
them out six on the top row and five below, each captioned with its machine,
the native resolution it is drawn at and the screen it is seen on.

    py -3.10 docs/shots/eras/contact-sheet.py

Writes contact-sheet.png beside itself. Pillow is the only thing it needs, and
only this script needs it -- the game itself has no dependencies.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

# era, file, machine, native w x h (src/display.js ROWS), the screen it is seen on
# (src/display-crt.js and src/display-tv.js).
ERAS = [
    (0, 'era0-arcade', '1972 arcade', '200 x 120', 'black-and-white arcade monitor'),
    (1, 'era1-atari2600', '1977 Atari 2600', '160 x 192', '1970s colour TV over RF'),
    (2, 'era2-nes', '1985 NES', '256 x 240', '1980s TV over composite'),
    (3, 'era3-genesis', '1989 Sega Genesis', '320 x 224', '1980s TV over composite'),
    (4, 'era4-snes', '1991 Super Nintendo', '256 x 224', 'TV over S-video'),
    (5, 'era5-playstation', '1994 PlayStation', '320 x 240', '1990s TV over composite, 4 x 4 dither'),
    (6, 'era6-n64', '1996 Nintendo 64', '320 x 240', '1990s TV over composite'),
    (7, 'era7-dreamcast', '1999 Dreamcast', '640 x 480', 'VGA box, sharp'),
    (8, 'era8-ps2', '2000 PlayStation 2', '512 x 448', 'late TV over component'),
    (9, 'era9-xbox', '2001 Xbox', '640 x 480', 'TV over component, sharp'),
    (10, 'era10-xbox360', '2005 Xbox 360', '960 x 720', '720p flat panel'),
]

TILE_W, TILE_H = 441, 331          # half the 882 x 662 reference frame
CAP_H, GAP, PAD = 44, 12, 16
PER_ROW = 6


def font(size):
    for name in ('segoeui.ttf', 'arial.ttf', 'DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main():
    rows = [ERAS[:PER_ROW], ERAS[PER_ROW:]]
    width = PAD * 2 + PER_ROW * TILE_W + (PER_ROW - 1) * GAP
    height = PAD * 2 + len(rows) * (TILE_H + CAP_H) + (len(rows) - 1) * GAP
    sheet = Image.new('RGB', (width, height), (17, 17, 17))
    draw = ImageDraw.Draw(sheet)
    bold, small = font(17), font(14)
    for r, row in enumerate(rows):
        # the five-tile bottom row is centred under the six above it
        x0 = PAD + (PER_ROW - len(row)) * (TILE_W + GAP) // 2
        y = PAD + r * (TILE_H + CAP_H + GAP)
        for c, (era, name, machine, native, screen) in enumerate(row):
            x = x0 + c * (TILE_W + GAP)
            frame = Image.open(os.path.join(HERE, name + '.png')).convert('RGB')
            sheet.paste(frame.resize((TILE_W, TILE_H), Image.LANCZOS), (x, y))
            draw.text((x, y + TILE_H + 4), '%d  %s' % (era, machine), fill=(255, 255, 255), font=bold)
            draw.text((x, y + TILE_H + 24), '%s  -  %s' % (native, screen), fill=(190, 190, 190), font=small)
    out = os.path.join(HERE, 'contact-sheet.png')
    sheet.save(out, optimize=True)
    print('wrote', out, sheet.size)


if __name__ == '__main__':
    main()
