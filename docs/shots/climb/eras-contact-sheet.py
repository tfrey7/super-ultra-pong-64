"""Lay the eleven era reference frames side by side, 1972 to 2005 (item 1157).

Reads docs/shots/eras/era0-arcade.png .. era10-xbox360.png, the frames one
climb of `node tools/playtest.mjs --ladder --reference` took, and writes
eras-contact-sheet.png beside this script: four frames a row, each labelled
with its rung. Run from anywhere: py -3.10 docs/shots/climb/eras-contact-sheet.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ERAS = os.path.join(HERE, '..', 'eras')
RUNGS = [('era0-arcade', '0  1972 ARCADE PONG'), ('era1-atari2600', '1  1977 ATARI 2600'),
         ('era2-nes', '2  1985 NES'), ('era3-genesis', '3  1989 SEGA GENESIS'),
         ('era4-snes', '4  1991 SUPER NINTENDO'), ('era5-playstation', '5  1994 SONY PLAYSTATION'),
         ('era6-n64', '6  1996 NINTENDO 64'), ('era7-dreamcast', '7  1999 SEGA DREAMCAST'),
         ('era8-ps2', '8  2000 PLAYSTATION 2'), ('era9-xbox', '9  2001 XBOX'),
         ('era10-xbox360', '10  2005 XBOX 360')]
W, H, LABEL, GAP, COLS = 441, 331, 34, 10, 4

try:
    font = ImageFont.truetype('arialbd.ttf', 20)
except OSError:
    font = ImageFont.load_default()

# The six new arrivals, PlayStation to Xbox 360, each caught mid-ring by the same climb.
ARRIVALS = [('change-era4-to-era5', 'SUPER NINTENDO -> PLAYSTATION'),
            ('change-era5-to-era6', 'PLAYSTATION -> NINTENDO 64'),
            ('change-era6-to-era7', 'NINTENDO 64 -> DREAMCAST'),
            ('change-era7-to-era8', 'DREAMCAST -> PLAYSTATION 2'),
            ('change-era8-to-era9', 'PLAYSTATION 2 -> XBOX'),
            ('change-era9-to-era10', 'XBOX -> XBOX 360')]


def sheet_of(frames, cols, name):
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * W + (cols + 1) * GAP, rows * (H + LABEL) + (rows + 1) * GAP), '#15151a')
    draw = ImageDraw.Draw(sheet)
    for i, (png, label) in enumerate(frames):
        frame = Image.open(os.path.join(ERAS, png + '.png')).convert('RGB').resize((W, H), Image.LANCZOS)
        x = GAP + (i % cols) * (W + GAP)
        y = GAP + (i // cols) * (H + LABEL + GAP)
        draw.text((x + 4, y + 6), label, fill='#f0f0f0', font=font)
        sheet.paste(frame, (x, y + LABEL))
    out = os.path.join(HERE, name)
    sheet.save(out)
    print(out, sheet.size, len(frames), 'frames')


sheet_of(RUNGS, COLS, 'eras-contact-sheet.png')
sheet_of(ARRIVALS, 3, 'arrivals-contact-sheet.png')
