"""
Super Ultra Pong 64: Remastered -- era 5's two fighters (item 1253).

The PlayStation rung's players, built in Blender from primitives and exported
to the contract in tools/blender/README.md: ONE skinned mesh on an armature,
the six clips the 3D layer plays (idle, move_up, move_down, swing, celebrate,
lose), one material named `ink` (the game repaints it in the paddle's colour),
written as assets/models/<name>.glb plus the one-line <name>.glb.js of the
same bytes. It also writes the no-WebGL fallback beside it (`pong-model-1`,
drawn by src/models3d.js) so the era never falls back to a placeholder.

Two fighters, docs/ART.md's era 5 PLAYERS page (Ridge Racer and Tekken, item
1291's look): `red`, the karateka in a gi with flared sleeves, a heavy belt
and a headband, and `blue`, the taller kickboxer in a sleeveless top, wide
trousers and a top-knot. They share item 1248's skeleton -- the same six
poses, so the bat stays in the same hand -- and differ in build, gear and
palette, which is where a PlayStation-budget figure has to carry its
silhouette.

The budget is the machine's: about 200 triangles a figure, three-sided limbs
and a six-by-three head, flat-shaded. Run headless only, never with the
Blender window (that one is Tim's):

    blender --background --factory-startup --python tools/blender/era5-players.py -- assets/models/era5-fighter-red.glb --who red

Axes and scale are the contract's: +X forward, -Y the table's near edge, +Z
up in Blender, one Blender unit one table unit, the origin on the floor.
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
SLOTS = ['skin', 'ink', 'pants', 'shoes', 'hair', 'glove']

# The PlayStation's budget: three-sided limbs, a four-sided torso, a 5 x 3
# head, a 4 x 2 crop of hair and cube hands and feet -- about 200 triangles a
# figure, every face flat. Nothing here is smoothed and nothing is textured:
# at this count a curve costs more than the machine can spend, so the shapes
# are prisms and boxes and the silhouette does the work.
BUILD = {'limb': 3, 'torso': 4, 'head': (5, 3), 'hair': (4, 2)}

# The two fighters. `ink` is the gi or the top, repainted by the game in that
# paddle's colour, so the silhouette and the other five slots carry who is who.
FIGHTERS = {
    # docs/ART.md era 5: "left in a red gi with a black belt, skin #c8906a"
    'red': {
        'palette': ['#c8906a', '#b4322a', '#1a1a1f', '#141418', '#2a1c14', '#e4d8c8'],
        'build': {'sleeve': 6.4, 'cuff': 5.6, 'skirt': 12.5, 'leg': 6.0, 'shin': 4.6,
                  'chest': 12.0, 'head': 8.0, 'foot': (10.0, 5.5, 3.6), 'lift': 0.0},
        'belt': 11.6,          # the black belt: a wide flat band at the waist
        'band': 8.4,           # the headband
        'knot': None,
    },
    # "right in a blue sleeveless top and grey trousers, skin #a8704a"
    'blue': {
        'palette': ['#a8704a', '#2e5aa8', '#6a6e78', '#23242a', '#181a20', '#d0c4b0'],
        'build': {'sleeve': 3.4, 'cuff': 2.9, 'skirt': 10.0, 'leg': 6.6, 'shin': 4.2,
                  'chest': 13.6, 'head': 7.4, 'foot': (9.0, 5.0, 5.5), 'lift': 3.0},
        'belt': None,
        'band': None,
        'knot': (3.4, 7.0),    # the top-knot: radius and how far above the crown
    },
}


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out, who, i = None, None, 0
    while i < len(argv):
        if argv[i] == '--who':
            who = argv[i + 1]
            i += 2
            continue
        out = argv[i]
        i += 1
    if not out or not out.endswith('.glb'):
        raise SystemExit('usage: blender --background --python era5-players.py -- <out.glb> --who red|blue')
    if who not in FIGHTERS:
        raise SystemExit('--who must be red or blue, not %s' % who)
    return out, who


# ----------------------------------------------------------------- the pose
def pose(beat, stride=1.0, t=1.0, lift=0.0):
    """Item 1248's skeleton for a beat, its stride scaled, optionally mixed t
    of the way from idle toward it, and the whole figure raised by `lift`."""
    j = proof.skeleton(beat)
    if stride != 1.0 and beat in ('up', 'down'):
        base = proof.skeleton(beat)
        idle = proof.skeleton('idle')
        for k in ('knee_n', 'ankle_n', 'knee_f', 'ankle_f'):
            j[k] = idle[k] + (base[k] - idle[k]) * stride
    if t != 1.0:
        idle = proof.skeleton('idle')
        j = {k: idle[k].lerp(j[k], t) for k in j}
    if lift:
        # the taller fighter: everything but the feet rises
        j = {k: (v if k.startswith('ankle') else v + Vector((0, 0, lift))) for k, v in j.items()}
    return j


# The parts: (bone, slot, how it is made, the bone's two ends, does it stretch).
def parts(fig):
    b, d = fig['build'], BUILD
    L, T = d['limb'], d['torso']
    up = lambda k, dz: (lambda j: j[k] + Vector((0, 0, dz)))
    out = [
        ('pelvis', 'pants', ('limb', 9.0, b['skirt'], T), up('pelvis', -4), up('pelvis', 6), True),
        ('spine', 'ink', ('limb', 10.0, b['chest'], T), up('pelvis', 4), lambda j: j['chest'], True),
        ('neck', 'skin', ('limb', 5.0, 3.5, L), lambda j: j['chest'], lambda j: j['neck'], True),
        ('head', 'skin', ('sphere', b['head'], d['head'], 1.12, Vector((0, 0, 0))), lambda j: j['head'], None, False),
        ('head', 'hair', ('sphere', b['head'] * 0.92, d['hair'], 0.72,
                          Vector((-1.5, 0, 3.2))), lambda j: j['head'], None, False),
    ]
    if fig['belt']:
        out.append(('pelvis', 'shoes', ('limb', fig['belt'], fig['belt'], T), up('pelvis', 4), up('pelvis', 7), False))
    if fig['band']:
        out.append(('head', 'ink', ('limb', fig['band'], fig['band'], T),
                    up('head', 2.0), up('head', 4.4), False))
    if fig['knot']:
        out.append(('head', 'hair', ('sphere', fig['knot'][0], (5, 3), 1.0, Vector((-2.0, 0, fig['knot'][1]))),
                    lambda j: j['head'], None, False))
    for s in ('n', 'f'):
        g = lambda name, s=s: (lambda j: j[name + '_' + s])
        out += [
            ('thigh_' + s, 'pants', ('limb', b['leg'], b['shin'] + 0.6, L), g('hip'), g('knee'), True),
            ('shin_' + s, 'pants', ('limb', b['shin'], 3.2, L), g('knee'), g('ankle'), True),
            ('foot_' + s, 'shoes', ('cube', b['foot'], Vector((3.0, 0, -2.0))), g('ankle'), None, False),
            ('arm_' + s, 'ink', ('limb', b['sleeve'], b['cuff'], L), g('shoulder'), g('elbow'), True),
            ('forearm_' + s, 'skin', ('limb', 3.0, 2.4, L), g('elbow'), g('hand'), True),
            ('hand_' + s, 'glove', ('cube', (5.0, 5.0, 5.0), Vector((0, 0, 0))), g('hand'), None, False),
        ]
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


def build_mesh(fig, rest, flip=True):
    """One triangulated mesh of the figure in a pose, and each part's vertices."""
    bm = bmesh.new()
    tags = []          # (vertex list, bone, slot) per part
    for part in parts(fig):
        bone, slot, how = part[0], part[1], part[2]
        head, tail = ends(part, rest)
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


def fallback(fig, who, out, lift):
    """The no-WebGL fallback (src/models3d.js's `pong-model-1`): the same parts
    in the same order, one vertex list a beat, written beside the .glb."""
    name = os.path.splitext(os.path.basename(out))[0]
    beats, tris, colors, hand, height = {}, None, None, None, None
    for beat in proof.BEATS:
        bm, tags = build_mesh(fig, pose(beat, lift=lift), flip=False)
        slot_of = {}
        for vs, _, slot in tags:
            for v in vs:
                slot_of[v] = slot
        flat = []
        for v in bm.verts:
            flat.extend(proof.r1(c) for c in v.co)
        beats[beat] = flat
        if beat == 'idle':
            tris, colors = [], []
            for f in bm.faces:
                tris.extend(v.index for v in f.verts)
                colors.append(SLOTS.index(slot_of[f.verts[0]]))
            j = pose('idle', lift=lift)
            hand = [proof.r1(c) for c in j['hand_n']]
            height = proof.r1(max(v.co.z for v in bm.verts))
        bm.free()
    if len({len(v) for v in beats.values()}) != 1:
        raise SystemExit('the beats disagree on the vertex count')
    model = {'format': 'pong-model-1', 'name': name,
             'by': 'tools/blender/era5-players.py --who ' + who,
             'blender': bpy.app.version_string, 'palette': fig['palette'], 'slots': SLOTS,
             'tris': tris, 'colors': colors, 'hand': hand, 'height': height, 'beats': beats}
    text = json.dumps(model, separators=(',', ':'))
    base = os.path.splitext(out)[0]
    with open(base + '.json', 'w', newline='\n') as f:
        f.write(text + '\n')
    with open(base + '.js', 'w', newline='\n') as f:
        f.write('/* ' + name + ': exported by tools/blender/era5-players.py (item 1253); the same data as ' + name + '.json */\n')
        f.write('(globalThis.PongModelFiles = globalThis.PongModelFiles || {})[' + json.dumps(name) + '] = ' + text + ';\n')
    return len(colors)


def main():
    out, who = args()
    fig = FIGHTERS[who]
    lift = fig['build']['lift']
    name = os.path.splitext(os.path.basename(out))[0]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS

    rest = pose('idle', lift=lift)
    bm, tags = build_mesh(fig, rest)
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
    for slot, colour in zip(SLOTS, fig['palette']):
        mat = bpy.data.materials.new(slot)      # the slot named 'ink' is repainted by the game
        rgb = [int(colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        if bpy.app.version < (5, 0, 0):
            mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (lin[0], lin[1], lin[2], 1.0)
        bsdf.inputs['Roughness'].default_value = 0.65
        mat.diffuse_color = (lin[0], lin[1], lin[2], 1.0)
        mesh.materials.append(mat)
    for poly, s in zip(mesh.polygons, faces_slot):
        poly.material_index = s
        poly.use_smooth = False          # the PlayStation's flat shading
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
    for part in parts(fig):
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

    # One action a clip, each a list of (seconds, joints). Era 5's animation is
    # docs/ART.md's "no in-betweens": the clips are short and hold their keys.
    moving = lambda beat: [(0.0, pose(beat, 1.0, lift=lift)), (0.2, pose(beat, -1.0, lift=lift)),
                           (0.4, pose(beat, 1.0, lift=lift))]
    clips = {
        'idle': [(0.0, pose('idle', lift=lift)), (1.0, pose('up', 1.0, t=0.1, lift=lift)),
                 (2.0, pose('idle', lift=lift))],
        'move_up': moving('up'),
        'move_down': moving('down'),
        'swing': [(0.0, pose('idle', lift=lift)), (SWING_S * 0.4, pose('swing', lift=lift)),
                  (SWING_S, pose('idle', lift=lift))],
        'celebrate': [(0.0, pose('idle', lift=lift)), (EASE_S, pose('win', lift=lift)),
                      (EASE_S + 0.3, pose('win', t=0.85, lift=lift)), (EASE_S + 0.6, pose('win', lift=lift))],
        'lose': [(0.0, pose('idle', lift=lift)), (EASE_S, pose('miss', lift=lift)),
                 (EASE_S + 0.6, pose('miss', t=0.92, lift=lift))],
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
            for part in parts(fig):
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
        'by': 'tools/blender/era5-players.py --who ' + who,
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
        f.write('/* ' + name + '.glb: exported by tools/blender/era5-players.py (item 1253); the same bytes, base64 */\n')
        f.write('(globalThis.PongFigureFiles = globalThis.PongFigureFiles || {})[' + json.dumps(name) +
                '] = "' + base64.b64encode(raw).decode('ascii') + '";\n')
    back = fallback(fig, who, out, lift)
    print('era5-players: %s -- %d vertices, %d triangles, %d clips, %d bytes, fallback %d triangles, blender %s' % (
        out, len(mesh.vertices), len(mesh.polygons), len(CLIPS), len(raw), back, bpy.app.version_string))


main()
