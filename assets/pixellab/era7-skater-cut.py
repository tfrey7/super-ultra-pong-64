"""
Era 7 (Dreamcast) skater sheets, cut offline from the four pixflux images (item 1231).

pixflux did not make the 3 x 6 grid it was asked for: `era7-skater-left.png` and
`era7-skater-right.png` (72 x 324) each came back as 2 columns x 4 rows of figures in
36 x 81 cells, and the left one has two ghosted frames (column 2, rows 1 and 3). One
re-roll per side asked for the action row alone (`era7-skater-*-action.png`, 108 x 80,
3 cells of 36 x 80): a spin, a stride and a jump. This script picks a cell for every
frame the rig needs and lays them out as the rig's six rows (idle, up, down, swing,
miss, win; 2, 2, 2, 3, 1, 2 frames), each frame 44 x 84 with the feet on the bottom row
and the figure centred on x 22. Figures are found as clusters of pixels (the pixflux
cells bleed into each other), and the action row, drawn smaller, is scaled to the
standing height. A derived file costs 0 generations.

It also takes paper white off the figures (docs/ART.md, era 7 PLAYERS: "no paper white
on a figure"; R1 keeps white for the ball): any pixel brighter than 232 in every channel
is pulled down to 224.

    py -3.10 assets/pixellab/era7-skater-cut.py

writes `era7-skater-left-sheet.png` and `era7-skater-right-sheet.png` beside itself.
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FW, FH = 44, 84                       # one frame of the output sheet
COUNTS = [('idle', 2), ('up', 2), ('down', 2), ('swing', 3), ('miss', 1), ('win', 2)]

# ('B', col, row) is a cell of the 72 x 324 sheet (36 x 81); ('A', col) a cell of the
# 108 x 80 action row (36 x 80). The third/second number after is the lift in pixels.
PLAN = {
    'left': {
        'idle':  [('B', 0, 0, 0), ('B', 0, 2, 0)],
        'up':    [('A', 1, 0), ('B', 0, 1, 0)],
        'down':  [('B', 0, 3, 0), ('A', 1, 0)],
        'swing': [('A', 0, 0), ('B', 1, 3, 0), ('B', 0, 0, 0)],
        'miss':  [('B', 1, 1, 0)],
        'win':   [('A', 2, 8), ('A', 2, 0)],
    },
    'right': {
        'idle':  [('B', 0, 0, 0), ('B', 1, 0, 0)],
        'up':    [('A', 0, 0), ('A', 1, 0)],
        'down':  [('A', 1, 0), ('A', 2, 0)],
        'swing': [('A', 1, 0), ('A', 0, 0), ('B', 0, 3, 0)],
        'miss':  [('B', 1, 3, 0)],
        'win':   [('A', 2, 8), ('B', 1, 1, 0)],
    },
}


def figures(img, col, width):
    """The figures in one 36-wide column of a pixflux image, top to bottom, each cropped
    to its own pixels: connected clusters of 12 pixels or more (specks dropped), grouped
    into one figure where their rows overlap or come within 3 pixels."""
    band = img.crop((col * width, 0, col * width + width, img.height))
    px = band.load()
    seen = set()
    comps = []
    for y in range(band.height):
        for x in range(band.width):
            if px[x, y][3] < 40 or (x, y) in seen:
                continue
            stack, pts = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1),
                               (cx + 1, cy + 1), (cx - 1, cy - 1), (cx + 1, cy - 1), (cx - 1, cy + 1)):
                    if 0 <= nx < band.width and 0 <= ny < band.height and (nx, ny) not in seen \
                            and px[nx, ny][3] >= 40:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(pts) >= 12:
                comps.append(pts)
    comps.sort(key=lambda c: min(p[1] for p in c))
    groups = []
    for c in comps:
        top, bot = min(p[1] for p in c), max(p[1] for p in c)
        if groups and top <= groups[-1]['bot'] + 3:
            groups[-1]['pts'] += c
            groups[-1]['bot'] = max(groups[-1]['bot'], bot)
        else:
            groups.append({'pts': list(c), 'bot': bot})
    out = []
    for g in groups:
        xs = [p[0] for p in g['pts']]
        ys = [p[1] for p in g['pts']]
        fig = Image.new('RGBA', (max(xs) - min(xs) + 1, max(ys) - min(ys) + 1), (0, 0, 0, 0))
        fp = fig.load()
        for (x, y) in g['pts']:
            fp[x - min(xs), y - min(ys)] = px[x, y]
        out.append(fig)
    return out


def cell(base, action, ref):
    if ref[0] == 'B':
        _, c, r, lift = ref
        return base[c][r], lift
    _, c, lift = ref
    return action[c][0], lift


def unwhite(img):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a and r > 232 and g > 232 and b > 232:
                px[x, y] = (224, 224, 224, a)
    return img


def build(side):
    base_img = Image.open(os.path.join(HERE, 'era7-skater-%s.png' % side)).convert('RGBA')
    action_img = Image.open(os.path.join(HERE, 'era7-skater-%s-action.png' % side)).convert('RGBA')
    base = [figures(base_img, c, 36) for c in range(2)]
    action = [figures(action_img, c, 36) for c in range(3)]
    # The action row came back drawn smaller: scale it so its standing stride (cell 1)
    # is as tall as the standing sheet's first figure, nearest-neighbour.
    k = base[0][0].height / float(action[1][0].height)
    action = [[f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.NEAREST)
               for f in col] for col in action]
    print(side, 'figures per base column', [len(c) for c in base], 'action scaled x%.2f' % k)
    cols = max(n for _, n in COUNTS)
    sheet = Image.new('RGBA', (FW * cols, FH * len(COUNTS)), (0, 0, 0, 0))
    for row, (beat, n) in enumerate(COUNTS):
        refs = PLAN[side][beat]
        assert len(refs) == n, (side, beat)
        for i, ref in enumerate(refs):
            img, lift = cell(base, action, ref)
            fig = unwhite(img.copy())
            if fig.height > FH - lift:
                fig = fig.resize((round(fig.width * (FH - lift) / fig.height), FH - lift), Image.NEAREST)
            x = i * FW + max(0, min(FW - fig.width, FW // 2 - fig.width // 2))
            y = row * FH + FH - fig.height - lift
            sheet.paste(fig, (x, max(row * FH, y)), fig)
    out = os.path.join(HERE, 'era7-skater-%s-sheet.png' % side)
    sheet.save(out)
    print('wrote', out, sheet.size)


if __name__ == '__main__':
    build('left')
    build('right')
