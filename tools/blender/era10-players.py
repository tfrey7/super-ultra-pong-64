"""
Super Ultra Pong 64: Remastered -- era 10's two players (item 1258).

The Xbox 360 rung's pair of heavy armoured soldiers, in the manner of the
era's reference game (docs/ART.md, "Reference games", era 10: Gears of War --
bulky silhouettes, a brown-grey palette, everything read through bloom and a
grade), never a copy of it: no cog, no real armour, no Locust.

Two figures, one per side, deliberately different in silhouette, colour and
gear so the two ends of the table are two characters:

    era10-vanguard  the player's side: WIDE. A domed helmet with a lit visor
                    band, a slab chest plate over the undersuit, huge round
                    pauldrons, a back tank, heavy greaves and boots. Olive
                    gunmetal, a cold visor.
    era10-ranger    the computer's side: TALL and angular. A flat-topped
                    helmet with a crest fin, one big square pauldron on the
                    bat arm, a shoulder tank on the other, belt pouches, thin
                    shin plates. Cold blue steel, an amber visor.

Built to tools/blender/README.md's contract (item 1274), the same shape as
tools/blender/figure-gltf.py: ONE rigged mesh on an armature with a bone per
part, the six clips the 3D layer plays keyed as NLA tracks, exported as a
binary .glb with the scene's `pong` extras, plus <name>.glb.js, the same bytes
as base64, because a page opened off disk cannot fetch. It also writes the
canvas fallback's <name>.json and <name>.js (the pong-model-1 format), so a
page with no WebGL draws these soldiers too rather than the sprite stand-ins.

Run it headless only, never with the Blender window (and never through the
Blender MCP tools -- that window is Tim's):

    blender --background --factory-startup --python tools/blender/era10-players.py -- assets/models/era10-vanguard.glb --side left
    blender --background --factory-startup --python tools/blender/era10-players.py -- assets/models/era10-ranger.glb --side right

--detail picks the budget; era 10 is the highest rung, so `hi` (about 1200
triangles) is the default. Axes, scale and the extras are the contract's:
+X forward, -Y the table's near edge, +Z up, one Blender unit one table unit.
"""
import base64
import importlib.util
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

sys.dont_write_bytecode = True   # leave no __pycache__ beside the scripts
HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('player_proof', os.path.join(HERE, 'player-proof.py'))
proof = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(proof)   # its main() only runs as a script

FPS = 30
SWING_S = 0.3      # src/characters.js SWING_S
EASE_S = 0.25      # how long celebrate and lose take to arrive, then hold
CLIPS = ['idle', 'move_up', 'move_down', 'swing', 'celebrate', 'lose']
BEATS = proof.BEATS                      # the fallback format's six poses
SLOTS = ['skin', 'ink', 'armour', 'trim', 'visor', 'shoes']

DETAIL = {
    #        limb sides, torso sides, helmet (u, v), hand (u, v)
    'lo':  {'limb': 4, 'torso': 6, 'head': (7, 4), 'hand': (5, 3)},
    'mid': {'limb': 7, 'torso': 9, 'head': (10, 6), 'hand': (6, 4)},
    'hi':  {'limb': 10, 'torso': 12, 'head': (12, 8), 'hand': (6, 4)},
}

# The two soldiers. `tall` stretches the skeleton upward, `bulk` widens every
# limb and plate, and the palette is the era's brown-grey with one warm or cold
# accent. `ink` is repainted by the game in that paddle's colour every frame.
SOLDIERS = {
    'left': {
        'name': 'vanguard', 'tall': 1.0, 'bulk': 1.18, 'helmet': 'dome',
        'palette': {'skin': '#c08c6c', 'ink': '#c0c0c0', 'armour': '#6d6a5c',
                    'trim': '#37342c', 'visor': '#86b6c6', 'shoes': '#22201b'},
    },
    'right': {
        'name': 'ranger', 'tall': 1.08, 'bulk': 0.96, 'helmet': 'flat',
        'palette': {'skin': '#a87f66', 'ink': '#c0c0c0', 'armour': '#4f5a66',
                    'trim': '#22272d', 'visor': '#e0a755', 'shoes': '#191b1e'},
    },
}


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out, detail, side, i = None, 'hi', None, 0
    while i < len(argv):
        if argv[i] == '--detail':
            detail, i = argv[i + 1], i + 2
            continue
        if argv[i] == '--side':
            side, i = argv[i + 1], i + 2
            continue
        out = argv[i]
        i += 1
    if not out or not out.endswith('.glb'):
        raise SystemExit('usage: blender --background --python era10-players.py -- <out.glb> '
                         '[--side left|right] [--detail lo|mid|hi]')
    if detail not in DETAIL:
        raise SystemExit('detail must be lo, mid or hi, not ' + detail)
    if side is None:                       # the file name names the side
        stem = os.path.basename(out)
        side = 'right' if 'ranger' in stem else 'left'
    if side not in SOLDIERS:
        raise SystemExit('side must be left or right, not ' + side)
    return out, detail, side


# ----------------------------------------------------------------- the pose
def pose(beat, who, stride=1.0, t=1.0):
    """Joint positions: one beat of player-proof.py's skeleton, this soldier's
    stature, its stride scaled, optionally mixed t of the way from idle."""
    def stand(b):
        j = proof.skeleton(b)
        if who['tall'] != 1.0:
            j = {k: Vector((v.x, v.y, v.z * who['tall'])) for k, v in j.items()}
        return j
    j = stand(beat)
    if stride != 1.0 and beat in ('up', 'down'):
        base, idle = stand(beat), stand('idle')
        for k in ('knee_n', 'ankle_n', 'knee_f', 'ankle_f'):
            j[k] = idle[k] + (base[k] - idle[k]) * stride
    if t != 1.0:
        idle = stand('idle')
        j = {k: idle[k].lerp(j[k], t) for k in j}
    return j


# The parts: (bone, slot, how it is made, the bone's two ends, does it stretch).
# Several parts may share a bone -- the plates bolted to a limb ride it. A
# limb's bone runs between its joints and stretches with them; a rigid part
# (a helmet, a boot, a pouch) only moves with its joint.
def parts(d, who):
    L, T, b = d['limb'], d['torso'], who['bulk']
    at = lambda k, off=(0, 0, 0): (lambda j: j[k] + Vector(off))
    tween = lambda a, c, f, off=(0, 0, 0): (lambda j: j[a].lerp(j[c], f) + Vector(off))
    flat = who['helmet'] == 'flat'
    out = [
        # hips, the undersuit torso, and the chest plate bolted over it
        ('pelvis', 'armour', ('limb', 10.0 * b, 11.0 * b, T), at('pelvis', (0, 0, -5)), at('pelvis', (0, 0, 6)), True),
        ('spine', 'ink', ('limb', 10.5 * b, 12.5 * b, T), at('pelvis', (0, 0, 4)), at('chest'), True),
        ('spine', 'armour', ('limb', 13.5 * b, 16.0 * b, T), tween('pelvis', 'chest', 0.45), at('chest', (0, 0, 2)), True),
        ('spine', 'trim', ('cube', (7.0, 20.0 * b, 16.0), Vector((-11.0 * b, 0, -2.0))), at('chest'), None, True),
        ('neck', 'ink', ('limb', 7.0 * b, 5.0 * b, T), at('chest'), at('neck'), True),
    ]
    if flat:
        # the ranger: a flat-topped helmet, a crest fin, a jaw guard
        out += [
            ('head', 'armour', ('cube', (17.0, 16.0, 15.0), Vector((0.5, 0, 0.5))), at('head'), None, False),
            ('head', 'armour', ('cube', (13.0, 3.0, 9.0), Vector((-1.0, 0, 9.0))), at('head'), None, False),
            ('head', 'visor', ('cube', (4.0, 14.5, 4.5), Vector((7.5, 0, 1.5))), at('head'), None, False),
            ('head', 'trim', ('cube', (8.0, 11.0, 5.0), Vector((5.0, 0, -6.5))), at('head'), None, False),
        ]
    else:
        # the vanguard: a domed helmet, a visor band across it, a respirator
        out += [
            ('head', 'armour', ('sphere', 9.6, d['head'], 1.05, Vector((0, 0, 1.0))), at('head'), None, False),
            ('head', 'visor', ('cube', (4.0, 15.0, 5.0), Vector((7.0, 0, 1.0))), at('head'), None, False),
            ('head', 'trim', ('cube', (8.5, 10.0, 6.0), Vector((5.5, 0, -6.0))), at('head'), None, False),
            ('head', 'trim', ('cube', (5.0, 4.0, 11.0), Vector((-7.0, 0, 3.0))), at('head'), None, False),
        ]
    for s in ('n', 'f'):
        g = lambda name, s=s, off=(0, 0, 0): (lambda j: j[name + '_' + s] + Vector(off))
        knee = lambda f, off=(0, 0, 0), s=s: (lambda j: j['knee_' + s].lerp(j['ankle_' + s], f) + Vector(off))
        big = (s == 'n') or not flat          # the ranger's big pauldron is on its bat arm only
        out += [
            ('thigh_' + s, 'armour', ('limb', 6.5 * b, 5.5 * b, L), g('hip'), g('knee'), True),
            ('shin_' + s, 'trim', ('limb', 5.0 * b, 4.0 * b, L), g('knee'), g('ankle'), True),
            ('shin_' + s, 'armour', ('cube', (5.0, 9.5 * b, 15.0), Vector((3.0, 0, 0))), knee(0.45), None, True),
            ('foot_' + s, 'shoes', ('cube', (12.0, 7.0 * b, 5.0), Vector((3.0, 0, -2.0))), g('ankle'), None, False),
            ('arm_' + s, 'ink', ('limb', 4.6 * b, 3.8 * b, L), g('shoulder'), g('elbow'), True),
            ('arm_' + s, 'armour',
             ('sphere', 8.6 * b, (d['head'][0] - 4, d['head'][1] - 3), 0.85, Vector((0, 0, 1.5))) if not flat
             else (('cube', (11.0, 13.0, 12.0), Vector((0, 1.5 if s == 'n' else -1.5, 2.0))) if big
                   else ('cube', (8.0, 8.0, 7.0), Vector((0, 0, 2.0)))),
             g('shoulder'), None, True),
            ('forearm_' + s, 'armour', ('limb', 4.2 * b, 3.4 * b, L), g('elbow'), g('hand'), True),
            ('hand_' + s, 'trim', ('sphere', 3.6 * b, d['hand'], 1.0, Vector((0, 0, 0))), g('hand'), None, False),
        ]
    if flat:
        # the ranger's shoulder tank, and two belt pouches
        out += [('arm_f', 'trim', ('limb', 4.0, 4.0, 6), lambda j: j['shoulder_f'] + Vector((-3, -2, 2)),
                 lambda j: j['shoulder_f'] + Vector((-7, -2, 16)), True),
                ('pelvis', 'trim', ('cube', (5.0, 6.0, 7.0), Vector((7.0, 9.0, 2.0))), at('pelvis'), None, True),
                ('pelvis', 'trim', ('cube', (5.0, 6.0, 7.0), Vector((7.0, -9.0, 2.0))), at('pelvis'), None, True)]
    else:
        # the vanguard's back tank and its two belt plates
        out += [('spine', 'armour', ('limb', 5.5, 4.5, 7), lambda j: j['chest'] + Vector((-13, 6, -6)),
                 lambda j: j['chest'] + Vector((-13, 6, 10)), True),
                ('pelvis', 'armour', ('cube', (6.0, 22.0, 5.0), Vector((6.5, 0, 5.0))), at('pelvis'), None, True)]
    return out


def ends(part, j):
    """A part's bone head and tail for a pose (a rigid part points straight up)."""
    _, _, _, a, b, _ = part
    head = a(j)
    tail = b(j) if b else head + Vector((0, 0, 6.0))
    return head, tail


# --------------------------------------------------------------- building
def flip_y(v):
    """player-proof's model space has +y toward the near edge; Blender's front is -Y."""
    return Vector((v.x, -v.y, v.z))


def build_mesh(d, who, at_pose, flip=True):
    """One posed figure as a triangulated bmesh, plus (vertices, bone, slot) per part."""
    bm = bmesh.new()
    tags = []
    for part in parts(d, who):
        bone, slot, how = part[0], part[1], part[2]
        head, tail = ends(part, at_pose)
        if how[0] == 'limb':
            vs = proof.limb(bm, head, tail, how[1], how[2], how[3])
        elif how[0] == 'sphere':
            vs = proof.sphere(bm, head + how[4], how[1], how[2], how[3])
        else:
            vs = proof.cube(bm, head + how[2], how[1])
        tags.append((vs, bone, slot))
    if flip:
        for v in bm.verts:
            v.co = flip_y(v.co)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.index_update()
    return bm, tags


def fallback_json(out, name, detail, who, d):
    """The canvas fallback's pong-model-1 file (tools/blender/README.md), so a
    page with no WebGL draws this soldier rather than a sprite stand-in."""
    r1 = proof.r1
    beats, tris, colors, hand, height = {}, None, None, None, None
    palette = [who['palette'][s] for s in SLOTS]
    for beat in BEATS:
        bm, tags = build_mesh(d, who, pose(beat, who), flip=False)   # model space: +y near
        slot_of = {}
        for vs, _bone, slot in tags:
            for v in vs:
                slot_of[v] = slot
        flat = []
        for v in bm.verts:
            flat.extend(r1(c) for c in v.co)
        beats[beat] = flat
        if beat == 'idle':
            tris, colors = [], []
            for f in bm.faces:
                tris.extend(v.index for v in f.verts)
                colors.append(SLOTS.index(slot_of[f.verts[0]]))
            j = pose('idle', who)
            hand = [r1(c) for c in j['hand_n']]
            height = r1(max(v.co.z for v in bm.verts))
        bm.free()
    counts = {len(v) for v in beats.values()}
    if len(counts) != 1:
        raise SystemExit('the beats disagree on the vertex count: %s' % counts)
    model = {'format': 'pong-model-1', 'name': name,
             'by': 'tools/blender/era10-players.py --side ' + ('right' if who['helmet'] == 'flat' else 'left') +
                   ' --detail ' + detail,
             'blender': bpy.app.version_string, 'palette': palette, 'slots': SLOTS,
             'tris': tris, 'colors': colors, 'hand': hand, 'height': height, 'beats': beats}
    text = json.dumps(model, separators=(',', ':'))
    base = os.path.splitext(out)[0]
    with open(base + '.json', 'w', newline='\n') as f:
        f.write(text + '\n')
    with open(base + '.js', 'w', newline='\n') as f:
        f.write('/* ' + name + ': exported by tools/blender/era10-players.py (item 1258); the same data as ' +
                name + '.json */\n')
        f.write('(globalThis.PongModelFiles = globalThis.PongModelFiles || {})[' + json.dumps(name) +
                '] = ' + text + ';\n')
    return len(colors)


def main():
    out, detail, side = args()
    d = DETAIL[detail]
    who = SOLDIERS[side]
    name = os.path.splitext(os.path.basename(out))[0]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS

    rest = pose('idle', who)
    bm, tags = build_mesh(d, who, rest)
    slot_of_vert, bone_of_vert = {}, {}
    for vs, bone, slot in tags:
        for v in vs:
            slot_of_vert[v] = slot
            bone_of_vert[v] = bone
    mesh = bpy.data.meshes.new(name)
    faces_slot = [SLOTS.index(slot_of_vert[f.verts[0]]) for f in bm.faces]
    vert_bone = [bone_of_vert[v] for v in bm.verts]
    bm.to_mesh(mesh)
    bm.free()
    for slot in SLOTS:
        mat = bpy.data.materials.new(slot)      # the slot named 'ink' is repainted by the game
        colour = who['palette'][slot]
        rgb = [int(colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        if bpy.app.version < (5, 0, 0):
            mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (lin[0], lin[1], lin[2], 1.0)
        # the era's own surfaces: armour eats the light, the visor throws it back at the bloom
        bsdf.inputs['Roughness'].default_value = 0.25 if slot == 'visor' else (0.85 if slot == 'trim' else 0.62)
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = 0.55 if slot in ('armour', 'visor') else 0.0
        mat.diffuse_color = (lin[0], lin[1], lin[2], 1.0)
        mesh.materials.append(mat)
    for poly, s in zip(mesh.polygons, faces_slot):
        poly.material_index = s
        poly.use_smooth = True          # the 360 rung is the smoothest of the ladder
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
    root.head, root.tail = (0, 0, 0), (0, 0, 10)
    rest_ends = {}
    for part in parts(d, who):
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

    # One action a clip, each a list of (seconds, joints).
    p = lambda beat, stride=1.0, t=1.0: pose(beat, who, stride, t)
    moving = lambda beat: [(0.0, p(beat, 1.0)), (0.2, p(beat, -1.0)), (0.4, p(beat, 1.0))]
    clips = {
        'idle': [(0.0, p('idle')), (1.0, p('up', 1.0, t=0.1)), (2.0, p('idle'))],
        'move_up': moving('up'),
        'move_down': moving('down'),
        'swing': [(0.0, p('idle')), (SWING_S * 0.4, p('swing')), (SWING_S, p('idle'))],
        'celebrate': [(0.0, p('idle')), (EASE_S, p('win')), (EASE_S + 0.3, p('win', t=0.85)),
                      (EASE_S + 0.6, p('win'))],
        'lose': [(0.0, p('idle')), (EASE_S, p('miss')), (EASE_S + 0.6, p('miss', t=0.92))],
    }
    rig.animation_data_create()
    bpy.ops.object.mode_set(mode='POSE')
    rest_mat = {bn.name: bn.matrix_local.copy() for bn in arm_data.bones}
    for clip in CLIPS:
        act = bpy.data.actions.new(clip)
        act.use_fake_user = True
        rig.animation_data.action = act
        last_q = {}
        for seconds, j in clips[clip]:
            frame = 1 + round(seconds * FPS)
            done = set()
            for part in parts(d, who):
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
        'by': 'tools/blender/era10-players.py --side ' + side + ' --detail ' + detail,
        'blender': bpy.app.version_string,
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
        f.write('/* ' + name + '.glb: exported by tools/blender/era10-players.py (item 1258); the same bytes, base64 */\n')
        f.write('(globalThis.PongFigureFiles = globalThis.PongFigureFiles || {})[' + json.dumps(name) +
                '] = "' + base64.b64encode(raw).decode('ascii') + '";\n')
    tris = fallback_json(out, name, detail, who, d)
    print('era10-players: %s (%s) -- %d vertices, %d triangles, %d clips, %d bytes, fallback %d triangles, blender %s' % (
        out, side, len(mesh.vertices), len(mesh.polygons), len(CLIPS), len(raw), tris, bpy.app.version_string))


main()
