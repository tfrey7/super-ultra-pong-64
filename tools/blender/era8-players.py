"""
Super Ultra Pong 64: Remastered -- era 8's two operatives as glTF figures (item 1256).

The PlayStation 2's players: two operatives in sneaking suits, one behind each
end of the table, built from Blender primitives and exported to the contract in
tools/blender/README.md (item 1274) -- one skinned mesh on an armature, the six
clips the 3D layer plays, a material named `ink` the game repaints in the
paddle's colour, written as assets/models/<name>.glb plus the one-line
<name>.glb.js a page opened off disk can load.

    blender --background --factory-startup --python tools/blender/era8-players.py -- \
        assets/models/era8-operative-left.glb --side left

Two sides, distinct silhouettes and gear (docs/ART.md, era 8 PLAYERS):

    left   the midnight operative -- midnight navy suit, AMBER visor, a comms
           backpack between the shoulders and a raised collar
    right  the slate operative    -- slate suit, FLARE-BLUE visor, a chest rig
           with two thigh pouches and a low-slung shoulder pad

Both are lean and tall with a tactical belt, the visor a box across the head's
front, the bat hand low and ready at hip height and the other hand open beside
it. The bat itself is not in the file: the 3D layer draws each paddle as a slab
under the hand that grips it.

Budget: the PlayStation 2's, about 800 triangles a figure (`--detail ps2`, the
default; `lo` and `hi` are there for an A/B). The machine drew 2.352 gigapixels
a second through 4 MB of eDRAM but had no pixel shaders, so the period's
character detail is in the SILHOUETTE and in flat gear boxes, not in shading.

Model space is player-proof.py's, so the whole figure-gltf.py machinery can be
borrowed unchanged: x forward (the figure faces the ball), +y toward the
table's near edge, z up, in table units, the origin on the floor under the
figure. The figure stands 250 units tall, the realism ladder's height for a 3D
era's player (docs/ART.md section 8), so era 8's block in src/characters.js
carries `modelScale: 1`.

`--json <path>` also writes the no-WebGL fallback (`pong-model-1`, the format
src/models3d.js draws with canvas 2D), so era 8 shows its own operatives with
`?gl=off` too and needs no sprite stand-in at all.
"""
import base64
import importlib.util
import json
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

sys.dont_write_bytecode = True   # leave no __pycache__ beside the scripts
HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('player_proof', os.path.join(HERE, 'player-proof.py'))
proof = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(proof)   # its main() only runs as a script; we borrow the primitives

FPS = 30
SWING_S = 0.3      # src/characters.js SWING_S
EASE_S = 0.25      # how long celebrate and lose take to arrive, then hold
CLIPS = ['idle', 'move_up', 'move_down', 'swing', 'celebrate', 'lose']
BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win']

# The slots, in the order the fallback's palette lists them. `ink` is the one
# the game repaints each frame in the paddle's colour (the chest rig and cuffs).
SLOTS = ['skin', 'ink', 'suit', 'gear', 'visor', 'boots']

SIDES = {
    # the midnight operative, the player's end: navy suit, amber visor
    'left':  {'palette': ['#c99a74', '#b8c0cc', '#141a2c', '#2a3342', '#ffb020', '#0e1118'],
              'pack': True, 'pouches': False, 'collar': True},
    # the slate operative, the computer's end: slate suit, flare-blue visor
    'right': {'palette': ['#b98a66', '#b8c0cc', '#3c4654', '#222a36', '#5aa8ff', '#14181e'],
              'pack': False, 'pouches': True, 'collar': False},
}

DETAIL = {
    #         limb sides, torso sides, head (u, v), hand (u, v)
    'lo':   {'limb': 4, 'torso': 5, 'head': (8, 5), 'hand': None},
    'ps2':  {'limb': 7, 'torso': 9, 'head': (14, 8), 'hand': (7, 5)},
    'hi':   {'limb': 9, 'torso': 12, 'head': (16, 10), 'hand': (8, 6)},
}


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out, side, detail, js_out = None, None, 'ps2', None
    i = 0
    while i < len(argv):
        if argv[i] == '--detail':
            detail, i = argv[i + 1], i + 2
            continue
        if argv[i] == '--side':
            side, i = argv[i + 1], i + 2
            continue
        if argv[i] == '--json':
            js_out, i = argv[i + 1], i + 2
            continue
        out, i = argv[i], i + 1
    if not out or not out.endswith('.glb'):
        raise SystemExit('usage: blender --background --python era8-players.py -- <out.glb> '
                         '[--side left|right] [--detail lo|ps2|hi] [--json <out.json>]')
    if side is None:                      # era8-operative-right.glb -> right
        side = 'right' if os.path.basename(out).find('right') >= 0 else 'left'
    if side not in SIDES:
        raise SystemExit('side must be left or right, not ' + side)
    if detail not in DETAIL:
        raise SystemExit('detail must be lo, ps2 or hi, not ' + detail)
    return out, side, detail, js_out


# ----------------------------------------------------------------- the poses
def skeleton(beat):
    """The joint positions of one pose, in model space. Lean and tall: the feet
    on the floor, the head's top at about 250. The bat is in the near (+y) hand,
    held low and ready at hip height; the far hand is open beside it."""
    bob, lean, stride, turn = 0.0, 0.0, 0.0, 0.0
    reach = (58.0, 20.0, 130.0)          # the bat hand at idle: low and ready
    other = (30.0, -30.0, 118.0)         # the open hand
    crouch = 0.0
    if beat == 'up':                     # a crouched run toward the far edge
        lean, stride, crouch = -6.0, 34.0, 10.0
        reach, other = (56.0, 6.0, 136.0), (26.0, -34.0, 126.0)
    elif beat == 'down':                 # the same run toward the near edge
        lean, stride, crouch = 6.0, -34.0, 10.0
        reach, other = (56.0, 36.0, 122.0), (26.0, -22.0, 110.0)
    elif beat == 'swing':                # a shoulder charge into the paddle
        lean, bob, crouch = 26.0, -6.0, 8.0
        reach, other = (92.0, 22.0, 142.0), (10.0, -34.0, 128.0)
    elif beat == 'miss':                 # the head turns to follow the ball out
        lean, bob, crouch, turn = 16.0, -18.0, 16.0, 26.0
        reach, other = (34.0, 34.0, 74.0), (14.0, -30.0, 78.0)
    elif beat == 'win':                  # a two-finger salute, one arm to 120
        lean, bob = -8.0, 6.0
        reach, other = (20.0, 24.0, 232.0), (26.0, -28.0, 116.0)
    hip = 130.0 + bob - crouch
    top = 202.0 + bob - crouch           # the chest
    j = {}
    j['pelvis'] = Vector((0.0, 0.0, hip))
    j['chest'] = Vector((lean, 0.0, top))
    j['neck'] = Vector((lean * 1.15, 0.0, top + 12.0))
    j['head'] = Vector((lean * 1.3 + 3.0, turn * 0.5, top + 30.0))
    for s, sy in (('n', 13.0), ('f', -13.0)):
        step = stride if s == 'n' else -stride
        j['hip_' + s] = Vector((0.0, sy, hip))
        j['knee_' + s] = Vector((6.0 + step * 0.5, sy, 70.0 - crouch * 0.8))
        j['ankle_' + s] = Vector((step, sy, 13.0))
    j['shoulder_n'] = Vector((lean, 26.0, top - 6.0))
    j['shoulder_f'] = Vector((lean, -26.0, top - 6.0))
    hand_n, hand_f = Vector(reach), Vector(other)
    j['hand_n'], j['hand_f'] = hand_n, hand_f
    j['elbow_n'] = (j['shoulder_n'] + hand_n) / 2 + Vector((-9.0, 5.0, -7.0))
    j['elbow_f'] = (j['shoulder_f'] + hand_f) / 2 + Vector((-5.0, -5.0, -2.0))
    return j


def pose(beat, stride=1.0, t=1.0):
    """A beat, its stride scaled (-1 swaps the feet), optionally mixed t of the
    way from idle toward it -- so a clip can breathe or ease into its hold."""
    j = skeleton(beat)
    if stride != 1.0 and beat in ('up', 'down'):
        base, idle = skeleton(beat), skeleton('idle')
        for k in ('knee_n', 'ankle_n', 'knee_f', 'ankle_f'):
            j[k] = idle[k] + (base[k] - idle[k]) * stride
    if t != 1.0:
        idle = skeleton('idle')
        j = {k: idle[k].lerp(j[k], t) for k in j}
    return j


# ----------------------------------------------------------------- the parts
# (bone, slot, how it is made, the bone's two ends as joints, does it stretch
# [, 'tail' to hang the shape off the bone's far end rather than its near one]).
# A limb runs between its two joints and stretches with them; a rigid part
# (a visor, a pouch, a boot) rides its bone without turning. Several parts may
# share one bone -- the FIRST of them defines it, the rest just ride it.
def parts(d, side):
    L, T = d['limb'], d['torso']
    cfg = SIDES[side]
    up = lambda k, dz: (lambda j: j[k] + Vector((0, 0, dz)))
    out = [
        ('pelvis', 'suit', ('limb', 22.0, 25.0, T), up('pelvis', -10), up('pelvis', 14), True),
        # the tactical belt: a flat box at the waist, both operatives
        ('pelvis', 'gear', ('cube', (26.0, 42.0, 8.0), Vector((0, 0, 12.0))), lambda j: j['pelvis'], None, False),
        ('spine', 'suit', ('limb', 25.0, 31.0, T), up('pelvis', 12), lambda j: j['chest'], True),
        # the chest rig, in the paddle's ink: the one part the game repaints
        ('spine', 'ink', ('cube', (12.0, 44.0, 26.0), Vector((11.0, 0, -26.0))), lambda j: j['chest'], None, False),
        ('neck', 'suit', ('limb', 12.0, 8.0, L), lambda j: j['chest'], lambda j: j['neck'], True),
        # the head turns with the neck-to-head bone, so a miss can look away
        ('head', 'suit', ('sphere', 15.0, d['head'], 1.12, Vector((0, 0, 0))), lambda j: j['neck'], lambda j: j['head'], True, 'tail'),
        ('head', 'skin', ('sphere', 9.5, (max(5, d['head'][0] - 4), max(3, d['head'][1] - 3)), 0.9,
                          Vector((6.0, 0, -7.0))), lambda j: j['neck'], lambda j: j['head'], True, 'tail'),
        # the visor: a box across the head's front (ART.md)
        ('head', 'visor', ('cube', (6.0, 24.0, 9.0), Vector((13.0, 0, 1.0))), lambda j: j['neck'], lambda j: j['head'], True, 'tail'),
    ]
    if cfg['collar']:      # the midnight operative's raised collar
        out.append(('spine', 'gear', ('cube', (18.0, 34.0, 12.0), Vector((-4.0, 0, -6.0))),
                    lambda j: j['neck'], None, False))
    if cfg['pack']:        # and the comms backpack between the shoulders
        out.append(('spine', 'gear', ('cube', (16.0, 34.0, 40.0), Vector((-24.0, 0, -16.0))),
                    lambda j: j['chest'], None, False))
    for s in ('n', 'f'):
        g = lambda name, s=s: (lambda j: j[name + '_' + s])
        out += [
            ('thigh_' + s, 'suit', ('limb', 13.0, 10.0, L), g('hip'), g('knee'), True),
            ('shin_' + s, 'suit', ('limb', 10.0, 7.0, L), g('knee'), g('ankle'), True),
            ('foot_' + s, 'boots', ('cube', (26.0, 13.0, 11.0), Vector((7.0, 0, -5.0))), g('ankle'), None, False),
            ('arm_' + s, 'suit', ('limb', 9.0, 7.0, L), g('shoulder'), g('elbow'), True),
            ('forearm_' + s, 'ink', ('limb', 7.0, 5.5, L), g('elbow'), g('hand'), True),
            ('hand_' + s, 'gear', ('sphere', 7.0, d['hand'], 1.0, Vector((0, 0, 0))) if d['hand']
             else ('cube', (11.0, 11.0, 11.0), Vector((0, 0, 0))), g('hand'), None, False),
        ]
        if cfg['pouches']:     # the slate operative's thigh pouches
            out.append(('thigh_' + s, 'gear', ('cube', (11.0, 9.0, 18.0), Vector((10.0, 0, -22.0))),
                        g('hip'), None, False))
        else:                  # the midnight operative's shoulder pads
            out.append(('arm_' + s, 'gear', ('cube', (20.0, 17.0, 13.0), Vector((-1.0, 0, 3.0))),
                        g('shoulder'), None, False))
    return out


def ends(part, j):
    """A part's bone head and tail for a pose (a rigid part points straight up)."""
    a, b = part[3], part[4]
    head = a(j)
    tail = b(j) if b else head + Vector((0, 0, 10.0))
    return head, tail


def anchor(part, head, tail):
    """Where a sphere or a cube hangs: its bone's near end, or its far end for a
    part written 'tail' (the head and its visor ride the neck-to-head bone)."""
    return tail if len(part) > 6 and part[6] == 'tail' else head


def build_mesh(d, side, rest):
    """The figure as one triangulated bmesh, each vertex tagged with its bone
    and its palette slot."""
    bm = bmesh.new()
    tags = []
    for part in parts(d, side):
        bone, slot, how = part[0], part[1], part[2]
        head, tail = ends(part, rest)
        at = anchor(part, head, tail)
        if how[0] == 'limb':
            vs = proof.limb(bm, head, tail, how[1], how[2], how[3])
        elif how[0] == 'sphere':
            vs = proof.sphere(bm, at + how[4], how[1], how[2], how[3])
        else:
            vs = proof.cube(bm, at + how[2], how[1])
        tags.append((vs, bone, slot))
    for v in bm.verts:
        v.co = Vector((v.co.x, -v.co.y, v.co.z))     # model space's +y near edge is Blender's -Y
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return bm, tags


def flip_y(v):
    return Vector((v.x, -v.y, v.z))


# -------------------------------------------------- the no-WebGL fallback
def fallback(out_json, d, side, name):
    """The same figure in `pong-model-1`, the compact JSON src/models3d.js draws
    with canvas 2D when the page has no WebGL. Every beat lists the same
    vertices in the same order, so the game blends two beats by mixing them."""
    beats, tris, colors, hand, height = {}, None, None, None, None
    for beat in BEATS:
        bm, tags = build_mesh(d, side, skeleton(beat))
        slot_of = {}
        for vs, _bone, slot in tags:
            for v in vs:
                slot_of[v] = slot
        bm.verts.index_update()
        flat = []
        for v in bm.verts:
            # back to model space (+y toward the near edge), rounded like player-proof
            flat.extend(proof.r1(c) for c in (v.co.x, -v.co.y, v.co.z))
        beats[beat] = flat
        if beat == 'idle':
            tris, colors = [], []
            for f in bm.faces:
                tris.extend(v.index for v in f.verts)
                colors.append(SLOTS.index(slot_of[f.verts[0]]))
            j = skeleton('idle')
            hand = [proof.r1(c) for c in j['hand_n']]
            height = proof.r1(max(v.co.z for v in bm.verts))
        bm.free()
    counts = {len(v) for v in beats.values()}
    if len(counts) != 1:
        raise SystemExit('the beats disagree on the vertex count: %s' % counts)
    model = {'format': 'pong-model-1', 'name': name,
             'by': 'tools/blender/era8-players.py --side ' + side,
             'blender': bpy.app.version_string,
             'palette': SIDES[side]['palette'], 'slots': SLOTS,
             'tris': tris, 'colors': colors, 'hand': hand, 'height': height, 'beats': beats}
    text = json.dumps(model, separators=(',', ':'))
    os.makedirs(os.path.dirname(os.path.abspath(out_json)) or '.', exist_ok=True)
    with open(out_json, 'w', newline='\n') as f:
        f.write(text + '\n')
    with open(os.path.splitext(out_json)[0] + '.js', 'w', newline='\n') as f:
        f.write('/* ' + name + ': exported by tools/blender/era8-players.py (item 1256); the same data as ' +
                name + '.json */\n')
        f.write('(globalThis.PongModelFiles = globalThis.PongModelFiles || {})[' + json.dumps(name) +
                '] = ' + text + ';\n')
    return len(colors)


# --------------------------------------------------------------------- main
def main():
    out, side, detail, js_out = args()
    d = DETAIL[detail]
    name = os.path.splitext(os.path.basename(out))[0]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS

    rest = skeleton('idle')
    bm, tags = build_mesh(d, side, rest)
    slot_of_vert, bone_of_vert = {}, {}
    for vs, bone, slot in tags:
        for v in vs:
            slot_of_vert[v] = slot
            bone_of_vert[v] = bone
    mesh = bpy.data.meshes.new(name)
    bm.verts.index_update()
    faces_slot = [SLOTS.index(slot_of_vert[f.verts[0]]) for f in bm.faces]
    vert_bone = [bone_of_vert[v] for v in bm.verts]
    bm.to_mesh(mesh)
    bm.free()
    for slot, colour in zip(SLOTS, SIDES[side]['palette']):
        mat = bpy.data.materials.new(slot)       # the slot named 'ink' is repainted by the game
        rgb = [int(colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        if bpy.app.version < (5, 0, 0):
            mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (lin[0], lin[1], lin[2], 1.0)
        # the visor is the brightest thing on the figure and the only lit part
        bsdf.inputs['Roughness'].default_value = 0.25 if slot == 'visor' else 0.55
        if slot == 'visor' and 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (lin[0], lin[1], lin[2], 1.0)
            bsdf.inputs['Emission Strength'].default_value = 0.8
        mat.diffuse_color = (lin[0], lin[1], lin[2], 1.0)
        mesh.materials.append(mat)
    for poly, s in zip(mesh.polygons, faces_slot):
        poly.material_index = s
        poly.use_smooth = True          # era 8's render settings are smooth-shaded
    body = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(body)

    # The armature: a root on the floor and one free bone per part.
    arm_data = bpy.data.armatures.new(name + '-rig')
    rig = bpy.data.objects.new(name + '-rig', arm_data)
    scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    root = arm_data.edit_bones.new('root')
    root.head, root.tail = (0, 0, 0), (0, 0, 20)
    rest_ends = {}
    for part in parts(d, side):
        bone = part[0]
        if bone in rest_ends:
            continue
        head, tail = ends(part, rest)
        eb = arm_data.edit_bones.new(bone)
        eb.head, eb.tail = flip_y(head), flip_y(tail)
        eb.parent = root
        eb.use_connect = False
        rest_ends[bone] = (head, tail)
    bpy.ops.object.mode_set(mode='OBJECT')

    for bone in rest_ends:
        g = body.vertex_groups.new(name=bone)
        g.add([i for i, b in enumerate(vert_bone) if b == bone], 1.0, 'REPLACE')
    body.parent = rig
    mod = body.modifiers.new('rig', 'ARMATURE')
    mod.object = rig

    # One action a clip, each a list of (seconds, joints). A loop's first and
    # last keys match; a one-shot starts and ends near idle, except celebrate
    # and lose, which hold where they end.
    running = lambda beat: [(0.0, pose(beat, 1.0)), (0.2, pose(beat, -1.0)), (0.4, pose(beat, 1.0))]
    clips = {
        # ART.md: a slow breath, every 2 s -- half the shared rate
        'idle': [(0.0, pose('idle')), (1.0, pose('up', 1.0, t=0.08)), (2.0, pose('idle'))],
        'move_up': running('up'),
        'move_down': running('down'),
        'swing': [(0.0, pose('idle')), (SWING_S * 0.4, pose('swing')), (SWING_S, pose('idle'))],
        'celebrate': [(0.0, pose('idle')), (EASE_S, pose('win')), (EASE_S + 0.3, pose('win', t=0.85)),
                      (EASE_S + 0.6, pose('win'))],
        'lose': [(0.0, pose('idle')), (EASE_S, pose('miss')), (EASE_S + 0.6, pose('miss', t=0.92))],
    }
    rig.animation_data_create()
    bpy.ops.object.mode_set(mode='POSE')
    rest_mat = {b.name: b.matrix_local.copy() for b in arm_data.bones}
    for clip in CLIPS:
        act = bpy.data.actions.new(clip)
        act.use_fake_user = True
        rig.animation_data.action = act
        last_q = {}
        for seconds, j in clips[clip]:
            frame = 1 + round(seconds * FPS)
            done = set()
            for part in parts(d, side):
                bone = part[0]
                if bone in done:
                    continue
                done.add(bone)
                h0, t0 = rest_ends[bone]
                h1, t1 = ends(part, j)
                d0, d1 = flip_y(t0) - flip_y(h0), flip_y(t1) - flip_y(h1)
                stretch = part[5]
                q = d0.rotation_difference(d1) if stretch else Quaternion()
                k = (d1.length / d0.length) if stretch else 1.0
                B = rest_mat[bone]
                M = Matrix.Translation(flip_y(h1)) @ q.to_matrix().to_4x4() @ B.to_quaternion().to_matrix().to_4x4() \
                    @ Matrix.Diagonal((1.0, k, 1.0, 1.0))
                pb = rig.pose.bones[bone]
                pb.rotation_mode = 'QUATERNION'
                pb.matrix = M
                bpy.context.view_layer.update()
                if bone in last_q:
                    pb.rotation_quaternion.make_compatible(last_q[bone])
                last_q[bone] = pb.rotation_quaternion.copy()
                for path in ('location', 'rotation_quaternion', 'scale'):
                    pb.keyframe_insert(path, frame=frame)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        track.strips.new(clip, 1, act)
        rig.animation_data.action = None
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix()

    height = max((rig.matrix_world @ v.co).z for v in mesh.vertices)
    hand = flip_y(rest['hand_n'])
    scene['pong'] = {
        'format': 'pong-figure-1',
        'name': name,
        'by': 'tools/blender/era8-players.py --side ' + side + ' --detail ' + detail,
        'blender': bpy.app.version_string,
        # the idle paddle hand in the file's own axes (x forward, y up, z near)
        'hand': [round(hand.x, 2), round(hand.z, 2), round(-hand.y, 2)],
        'height': round(height, 2),
        'ink': 'ink',
        'clips': CLIPS,
    }
    os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out), export_format='GLB', export_yup=True, export_extras=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True,
        export_force_sampling=True, export_frame_step=2, export_def_bones=False,
        export_materials='EXPORT', export_image_format='NONE', export_texcoords=False,
        export_normals=True, export_apply=False)
    raw = open(out, 'rb').read()
    with open(out + '.js', 'w', newline='\n') as f:
        f.write('/* ' + name + '.glb: exported by tools/blender/era8-players.py (item 1256); the same bytes, base64 */\n')
        f.write('(globalThis.PongFigureFiles = globalThis.PongFigureFiles || {})[' + json.dumps(name) +
                '] = "' + base64.b64encode(raw).decode('ascii') + '";\n')
    extra = ''
    if js_out:
        extra = ', fallback %d triangles' % fallback(js_out, d, side, os.path.splitext(os.path.basename(js_out))[0])
    print('era8-players: %s (%s) -- %d vertices, %d triangles, %d clips, %d bytes%s, blender %s' % (
        out, side, len(mesh.vertices), len(mesh.polygons), len(CLIPS), len(raw), extra, bpy.app.version_string))


main()
