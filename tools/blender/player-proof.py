"""
Super Ultra Pong 64: Remastered -- the proof player figure (item 1248).

Builds one low-poly player out of Blender's own mesh primitives (bmesh cones,
UV spheres and cubes), poses it six times -- idle, up, down, swing, miss, win,
the six beats src/characters.js already runs -- and exports it as one compact
JSON model the game draws with src/models3d.js, plus a one-line .js wrapper of
the same data so the page can load it off disk (file:// refuses fetch).

Run it headless only, never with the Blender window:

    blender --background --python tools/blender/player-proof.py -- assets/models/player-proof-lo.json --detail lo

--detail picks the triangle budget: lo (244, the PlayStation and the N64),
mid (548, the Dreamcast and the PS2), hi (1128, the Xbox and the 360). tools/blender/README.md says where Blender is on this machine.

Model space is the table's own: x forward (toward the ball, the figure faces
+x), y across the table (+y toward the near edge), z up, in table units; the
origin is the floor under the figure. The paddle hand's idle position is
exported as `hand`, so the game can put that point on the paddle.

The format (every number rounded to 0.1):

    { "format": "pong-model-1", "name": ..., "by": ..., "blender": ...,
      "palette": ["#rrggbb", ...], "slots": ["skin", "ink", ...],
      "tris": [a, b, c, a, b, c, ...],          one entry per corner
      "colors": [slot, slot, ...],              one palette index per triangle
      "hand": [x, y, z], "height": h,
      "beats": { "idle": [x, y, z, x, y, z, ...], "up": [...], ... } }

Every beat has the same vertices in the same order, so the game blends two
beats by mixing their arrays. No add-on is used.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win']
SLOTS = ['skin', 'ink', 'pants', 'shoes', 'hair', 'glove']
PALETTE = ['#d8a888', '#c0c0c0', '#2a3040', '#1a1a1a', '#3a2418', '#e8e8e8']

DETAIL = {
    #        limb sides, torso sides, head (u, v), hand sphere (u, v)
    'lo':  {'limb': 3, 'torso': 5, 'head': (6, 3), 'hand': None},
    'mid': {'limb': 6, 'torso': 8, 'head': (10, 6), 'hand': (6, 4)},
    'hi':  {'limb': 9, 'torso': 12, 'head': (16, 10), 'hand': (8, 6)},
}


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = None
    detail = 'lo'
    i = 0
    while i < len(argv):
        if argv[i] == '--detail':
            detail = argv[i + 1]
            i += 2
            continue
        out = argv[i]
        i += 1
    if not out:
        raise SystemExit('usage: blender --background --python player-proof.py -- <out.json> [--detail lo|mid|hi]')
    if detail not in DETAIL:
        raise SystemExit('detail must be lo, mid or hi, not ' + detail)
    return out, detail


# ------------------------------------------------------------------ skeleton
def skeleton(beat):
    """The joint positions of one pose, in model space. The paddle arm is the
    near one (+y); the hand rests on the paddle's outer edge at idle."""
    bob, lean, stride, reach, other = 0.0, 0.0, 0.0, (22.0, 9.0, 34.0), None
    if beat == 'up':
        lean, stride, reach = -2.0, 7.0, (22.0, 3.0, 36.0)
    elif beat == 'down':
        lean, stride, reach = 2.0, -7.0, (22.0, 15.0, 32.0)
    elif beat == 'swing':
        lean, reach = 7.0, (30.0, 9.0, 36.0)
        bob = -3.0
    elif beat == 'miss':
        bob, lean, reach = -6.0, 10.0, (14.0, 14.0, 20.0)
        other = (6.0, -10.0, 26.0)
    elif beat == 'win':
        bob, lean, reach = 2.0, -4.0, (4.0, 13.0, 94.0)
        other = (4.0, -13.0, 94.0)
    hip = 42.0 + bob
    top = 68.0 + bob
    j = {}
    j['pelvis'] = Vector((0.0, 0.0, hip))
    j['chest'] = Vector((lean, 0.0, top))
    j['neck'] = Vector((lean * 1.2, 0.0, top + 4.0))
    j['head'] = Vector((lean * 1.3 + 1.0, 0.0, top + 13.0))
    for s, sy in (('n', 6.0), ('f', -6.0)):
        step = stride if s == 'n' else -stride
        j['hip_' + s] = Vector((0.0, sy, hip))
        j['knee_' + s] = Vector((3.0 + step * 0.5, sy, 22.0 + max(0.0, bob) * 0.5))
        j['ankle_' + s] = Vector((step, sy, 4.0))
    j['shoulder_n'] = Vector((lean, 12.0, top - 4.0))
    j['shoulder_f'] = Vector((lean, -12.0, top - 4.0))
    hand_n = Vector(reach)
    j['hand_n'] = hand_n
    j['elbow_n'] = (j['shoulder_n'] + hand_n) / 2 + Vector((-4.0, 2.0, -3.0))
    hand_f = Vector(other) if other else Vector((lean + 4.0, -15.0, top - 30.0))
    j['hand_f'] = hand_f
    j['elbow_f'] = (j['shoulder_f'] + hand_f) / 2 + Vector((-2.0, -2.0, 0.0))
    return j


# ---------------------------------------------------------------- primitives
def aligned(a, b):
    """The matrix that stands a unit-depth cone (centred, along z) between a and b."""
    d = b - a
    length = max(0.001, d.length)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    return Matrix.Translation((a + b) / 2) @ rot @ Matrix.Diagonal((1, 1, length, 1))


def limb(bm, a, b, r1, r2, sides):
    before = set(bm.verts)
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=sides,
                          radius1=r1, radius2=r2, depth=1.0, matrix=aligned(a, b))
    return [v for v in bm.verts if v not in before]


def sphere(bm, c, r, uv, squash=1.0):
    before = set(bm.verts)
    m = Matrix.Translation(c) @ Matrix.Diagonal((1, 1, squash, 1))
    bmesh.ops.create_uvsphere(bm, u_segments=uv[0], v_segments=uv[1], radius=r, matrix=m)
    return [v for v in bm.verts if v not in before]


def cube(bm, c, size):
    before = set(bm.verts)
    m = Matrix.Translation(c) @ Matrix.Diagonal((size[0], size[1], size[2], 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return [v for v in bm.verts if v not in before]


def build(beat, d):
    """One posed figure as a triangulated bmesh, and each face's palette slot."""
    j = skeleton(beat)
    bm = bmesh.new()
    slot_of = {}

    def tag(verts, slot):
        for v in verts:
            slot_of[v] = slot

    L, T = d['limb'], d['torso']
    tag(limb(bm, j['pelvis'] - Vector((0, 0, 4)), j['pelvis'] + Vector((0, 0, 6)), 9.0, 10.0, T), 'pants')
    tag(limb(bm, j['pelvis'] + Vector((0, 0, 4)), j['chest'], 10.0, 12.5, T), 'ink')
    tag(limb(bm, j['chest'], j['neck'], 6.0, 3.5, T), 'ink')
    tag(sphere(bm, j['head'], 8.0, d['head'], 1.1), 'skin')
    tag(sphere(bm, j['head'] + Vector((-1.5, 0, 3.5)), 7.2, (max(4, d['head'][0] - 2), max(3, d['head'][1] - 1)), 0.75), 'hair')
    for s in ('n', 'f'):
        tag(limb(bm, j['hip_' + s], j['knee_' + s], 5.0, 4.0, L), 'pants')
        tag(limb(bm, j['knee_' + s], j['ankle_' + s], 4.0, 3.0, L), 'pants')
        tag(cube(bm, j['ankle_' + s] + Vector((3.0, 0, -2.0)), (11.0, 5.5, 4.0)), 'shoes')
        tag(limb(bm, j['shoulder_' + s], j['elbow_' + s], 3.6, 3.0, L), 'ink')
        tag(limb(bm, j['elbow_' + s], j['hand_' + s], 3.0, 2.4, L), 'skin')
        if d['hand']:
            tag(sphere(bm, j['hand_' + s], 3.2, d['hand']), 'glove')
        else:
            tag(cube(bm, j['hand_' + s], (5.0, 5.0, 5.0)), 'glove')
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.index_update()
    return bm, slot_of, j


def r1(x):
    v = round(x, 1)
    return int(v) if v == int(v) else v


def main():
    out, detail = args()
    d = DETAIL[detail]
    beats = {}
    tris = colors = None
    hand = height = None
    for beat in BEATS:
        bm, slot_of, j = build(beat, d)
        flat = []
        for v in bm.verts:
            flat.extend(r1(c) for c in v.co)
        beats[beat] = flat
        if beat == 'idle':
            tris, colors = [], []
            for f in bm.faces:
                tris.extend(v.index for v in f.verts)
                colors.append(SLOTS.index(slot_of[f.verts[0]]))
            hand = [r1(c) for c in j['hand_n']]
            height = r1(max(v.co.z for v in bm.verts))
        bm.free()
    counts = {len(v) for v in beats.values()}
    if len(counts) != 1:
        raise SystemExit('the beats disagree on the vertex count: %s' % counts)
    name = os.path.splitext(os.path.basename(out))[0]
    model = {
        'format': 'pong-model-1',
        'name': name,
        'by': 'tools/blender/player-proof.py --detail ' + detail,
        'blender': bpy.app.version_string,
        'palette': PALETTE,
        'slots': SLOTS,
        'tris': tris,
        'colors': colors,
        'hand': hand,
        'height': height,
        'beats': beats,
    }
    text = json.dumps(model, separators=(',', ':'))
    os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True)
    with open(out, 'w', newline='\n') as f:
        f.write(text + '\n')
    # The same data as a plain script, so a page opened off disk can load it.
    js = os.path.splitext(out)[0] + '.js'
    with open(js, 'w', newline='\n') as f:
        f.write('/* ' + name + ': exported by tools/blender/player-proof.py (item 1248); the same data as ' + name + '.json */\n')
        f.write('(globalThis.PongModelFiles = globalThis.PongModelFiles || {})[' + json.dumps(name) + '] = ' + text + ';\n')
    print('player-proof: %s -- %d vertices, %d triangles, %d beats, blender %s' % (
        out, counts.pop() // 3, len(colors), len(BEATS), bpy.app.version_string))


# Run as a script (blender --python), not when figure-gltf.py borrows the skeleton (item 1274).
if __name__ == '__main__':
    main()
