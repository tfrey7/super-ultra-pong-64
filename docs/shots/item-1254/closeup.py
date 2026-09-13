"""Item 1254: the two Nintendo 64 players, close up.

Crops both ends of the playtest's era 6 rally frame (rally-era6-n64.png, kept
from docs/shots/playtest/feel-era6-n64.png) and blows them up so the two
silhouettes can be told apart on the card: the penguin at the player's end, the
frog in its cap at the computer's.

    py -3.10 docs/shots/item-1254/closeup.py
"""
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'rally-era6-n64.png')
OUT = os.path.join(HERE, 'players-closeup.png')
LEFT = (40, 240, 220, 440)      # the player's end of the table in the 882 x 662 frame
RIGHT = (700, 240, 880, 440)    # the computer's end
ZOOM = 3


def crop(im, box):
    w, h = box[2] - box[0], box[3] - box[1]
    return im.crop(box).resize((w * ZOOM, h * ZOOM), Image.NEAREST)


def main():
    im = Image.open(SRC)
    a, b = crop(im, LEFT), crop(im, RIGHT)
    gap = 20
    out = Image.new('RGB', (a.width + gap + b.width, a.height), (255, 255, 255))
    out.paste(a, (0, 0))
    out.paste(b, (a.width + gap, 0))
    out.save(OUT)
    print('closeup: %s -- %d x %d, from %s' % (OUT, out.width, out.height, os.path.basename(SRC)))


main()
