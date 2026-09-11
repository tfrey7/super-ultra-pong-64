"""
assets/pixellab/era6-n64-sheets.py -- era 6's two player sheets, derived (item 1230).

    py -3.10 assets/pixellab/era6-n64-sheets.py      (Pillow; offline only, the game never runs it)

pixflux does not draw sprite sheets. Asked for "3 columns and 6 rows" at 60 x 270 it gave the frog
as ONE pose repeated down a single column (era6-frog-sheet-raw.png) and the penguin as fourteen
10-pixel figures in two columns (era6-penguin-sheet-raw.png). What it does draw well is one figure.
So each player is built here from single figures -- a stand (era6-penguin-raw2.png, and the frog
cut from its sheet) and a jump for joy (era6-*-win-raw.png) -- into the rig's six rows (idle, up,
down, swing, miss, win; docs/ART.md, Era 6, PLAYERS), with the beats drawn as the bible gives them:

    idle   a waddle-bob: up a pixel, then down squashed 5% (Super Mario 64's squash)
    up     a hop-step tilting 12 degrees into the travel, second frame landed and squashed
    down   the same, tilting the other way
    swing  a belly bump: wind back, lunge 3 sheet pixels (6 table units) toward the paddle, settle
    miss   a spin-out drawn mid-turn -- the figure turned edge-on -- with 3 toy-yellow stars round the head
    win    the jump: up 6 sheet pixels (z 12), then landed squashed

Each frame is FRAME wide and tall, facing right (the rig mirrors the right-hand player), the figure
standing on the frame's bottom with its chest at HAND. Writes tex3d-era6-penguin.png and
tex3d-era6-frog.png, which assets/pixellab/tex3d-embed.mjs embeds as data: URIs in src/textures3d.js.
A derived file costs no generations.
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
FRAME = (32, 44)          # sheet pixels; drawn at scale 2 -> 64 x 88 table units
FIG_H = 34                # a standing figure's height in the frame
FLOOR = 43                # the row the feet stand on
TOY_YELLOW = (255, 199, 44, 255)
COLS = 3
ROWS = ['idle', 'up', 'down', 'swing', 'miss', 'win']


def crop_alpha(im):
    box = im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    return im.crop(box)


def fit(im, h):
    w = max(1, round(im.width * h / im.height))
    return im.resize((w, h), Image.BICUBIC)


def drop_shadow(im):
    """Take out the grey ground shadow pixflux sometimes paints under a jumping figure."""
    px = im.load()
    for y in range(im.height - 6, im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) - min(r, g, b) < 24:
                px[x, y] = (0, 0, 0, 0)
    return im


def frame(fig, dx=0, lift=0, sx=1.0, sy=1.0, angle=0.0):
    """One frame: fig scaled (sx, sy), turned angle degrees, feet on the floor, shifted dx and lifted."""
    f = fig.resize((max(1, round(fig.width * sx)), max(1, round(fig.height * sy))), Image.BICUBIC)
    if angle:
        f = f.rotate(angle, resample=Image.BICUBIC, expand=True)
        f = crop_alpha(f)
    out = Image.new('RGBA', FRAME, (0, 0, 0, 0))
    x = (FRAME[0] - f.width) // 2 + dx
    y = FLOOR - f.height - lift
    out.alpha_composite(f, (max(0, min(FRAME[0] - f.width, x)), max(0, y)))
    return out


def star(draw, cx, cy):
    """A 5-pixel toy star: a plus with a bright centre."""
    draw.point([(cx, cy - 1), (cx - 1, cy), (cx, cy), (cx + 1, cy), (cx, cy + 1)], fill=TOY_YELLOW)


def sheet(stand, joy):
    stand = fit(crop_alpha(stand), FIG_H)
    joy = fit(crop_alpha(drop_shadow(joy)), FIG_H + 2)
    frames = {
        'idle': [frame(stand, lift=1), frame(stand, sx=1.05, sy=0.95)],
        'up': [frame(stand, lift=3, angle=12), frame(stand, sx=1.05, sy=0.95, angle=6)],
        'down': [frame(stand, lift=3, angle=-12), frame(stand, sx=1.05, sy=0.95, angle=-6)],
        'swing': [frame(stand, dx=-2, sx=1.03, sy=0.97), frame(stand, dx=3, sx=1.08, sy=0.94),
                  frame(stand, dx=2)],
        'miss': [None],
        'win': [frame(joy, lift=6, sx=0.97, sy=1.03), frame(joy, sx=1.05, sy=0.95)],
    }
    # the spin-out: the figure turned edge-on (mirrored, 60% wide), tipped, stars round the head
    spun = stand.transpose(Image.FLIP_LEFT_RIGHT)
    miss = frame(spun, sx=0.6, angle=-8)
    d = ImageDraw.Draw(miss)
    top = FLOOR - FIG_H
    for cx, cy in [(8, top + 1), (16, top - 3), (24, top + 1)]:
        star(d, cx, max(1, cy))
    frames['miss'] = [miss]
    out = Image.new('RGBA', (FRAME[0] * COLS, FRAME[1] * len(ROWS)), (0, 0, 0, 0))
    for r, beat in enumerate(ROWS):
        for c, f in enumerate(frames[beat]):
            out.alpha_composite(f, (c * FRAME[0], r * FRAME[1]))
    return out


def load(name):
    return Image.open(os.path.join(HERE, name)).convert('RGBA')


if __name__ == '__main__':
    penguin = sheet(load('era6-penguin-raw2.png'),
                    load('era6-penguin-win-raw.png').transpose(Image.FLIP_LEFT_RIGHT))
    # The frog's stand is one of the seven identical figures its sheet came back as (the second,
    # rows 17-46 of columns 32-55); both frog images face left, so they are turned to face right.
    frog_stand = load('era6-frog-sheet-raw.png').crop((32, 17, 55, 46)).transpose(Image.FLIP_LEFT_RIGHT)
    frog = sheet(frog_stand, load('era6-frog-win-raw.png').transpose(Image.FLIP_LEFT_RIGHT))
    for name, im in (('tex3d-era6-penguin.png', penguin), ('tex3d-era6-frog.png', frog)):
        im.save(os.path.join(HERE, name))
        print('wrote', name, im.size)
