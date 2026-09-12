"""
Super Ultra Pong 64: Remastered -- era 6's two players (item 1254).

The Nintendo 64's pair, to docs/ART.md's era 6 page: on the left a round
PENGUIN in a scarf, on the right a round FROG in a cap -- "a big round head on
a pear-shaped body, stubby arms, drawn smooth", each about 350 triangles, the
N64's budget (about 100,000 polygons a second at 60 frames, two players, a
table, a ball and a park to draw as well).

Built to tools/blender/README.md's contract (item 1274) and shaped after
tools/blender/figure-gltf.py, which is the worked example: ONE rigged mesh per
figure -- an armature with a bone per body part, every vertex bound to its
part's bone -- the six clips the 3D layer plays, exported by Blender's own
glTF exporter as a binary .glb, plus a one-line plain script of the same bytes
(<name>.glb.js) so a page opened off disk can load it (file:// refuses fetch).

Run it headless only, never with the Blender window (the MCP tools drive Tim's
own window and are never used from a worker):

    blender --background --factory-startup --python tools/blender/era6-players.py -- assets/models/era6-penguin.glb --who penguin
    blender --background --factory-startup --python tools/blender/era6-players.py -- assets/models/era6-frog.glb --who frog

Axes, scale and the clip names are the contract's: +X forward (the figure
faces the ball), -Y the table's near edge, +Z up, one Blender unit one table
unit, the origin the floor under the figure. The skeleton is the one
player-proof.py poses (so the six beats read the same on every era's figure);
only the body hung on it is this era's.
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
_spec.loader.exec_module(proof)   # its main() only runs as a script

FPS = 30
SWING_S = 0.3      # src/characters.js SWING_S
EASE_S = 0.25      # how long celebrate and lose take to arrive, then hold
CLIPS = ['idle', 'move_up', 'move_down', 'swing', 'celebrate', 'lose']

# The machine's budget, spent as segment counts. L limb sides, T body sides,
# HEAD a uv sphere's (u, v). Raising these is how a later machine's figure
# would be made from the same script; era 6 stays here.
DETAIL = {
    'n64': {'limb': 3, 'torso': 6, 'head': (7, 4), 'eye': (4, 3)},
    'lo':  {'limb': 3, 'torso': 6, 'head': (6, 4), 'eye': (4, 3)},
    'hi':  {'limb': 6, 'torso': 12, 'head': (12, 7), 'eye': (6, 4)},
}

V = Vector


def at(key, dx=0.0, dy=0.0, dz=0.0):
    """A joint, offset: the head or tail of a part's bone, for any pose."""
    return lambda j: j[key] + V((dx, dy, dz))


# --------------------------------------------------------------- the two
# A part is (bone, slot, how it is made, bone head, bone tail or None, stretch).
# A limb's bone runs between its two joints and stretches with them; a rigid
# part (a head, a foot, an eye) only moves with its first joint.
def penguin(d):
    """The player's side: a blue penguin, cream belly, orange beak and feet,
    a scarf in the paddle's ink."""
    L, T, H, E = d['limb'], d['torso'], d['head'], d['eye']
    out = [
        # a pear: wide at the hips, narrowing to the shoulders
        ('pelvis', 'body', ('limb', 13.5, 15.0, T), at('pelvis', dz=-9), at('pelvis', dz=6), True),
        ('spine', 'body', ('limb', 15.0, 10.0, T), at('pelvis', dz=4), at('chest'), True),
        ('spine', 'belly', ('sphere', 10.5, (T, 4), 1.35, V((6.0, 0, 6.0))), at('pelvis'), None, False),
        ('neck', 'ink', ('limb', 8.5, 7.0, T), at('chest', dz=-1), at('neck', dz=1), True),   # the scarf
        ('head', 'body', ('sphere', 11.0, H, 1.0, V((0, 0, 0))), at('head'), None, False),
        ('head', 'belly', ('sphere', 8.4, (max(4, H[0] - 2), max(3, H[1] - 1)), 0.95, V((4.5, 0, -1.5))),
         at('head'), None, False),
        ('head', 'beak', ('limb', 3.4, 0.8, 4), at('head', dx=7, dz=-2), at('head', dx=14, dz=-3), False),
        ('head', 'eye', ('sphere', 1.9, E, 1.0, V((7.5, 3.4, 4.0))), at('head'), None, False),
        ('head', 'eye', ('sphere', 1.9, E, 1.0, V((7.5, -3.4, 4.0))), at('head'), None, False),
    ]
    for s in ('n', 'f'):
        g = lambda name, s=s: at(name + '_' + s)
        out += [
            ('thigh_' + s, 'body', ('limb', 5.0, 4.2, L), g('hip'), g('knee'), True),
            ('shin_' + s, 'body', ('limb', 4.2, 3.4, L), g('knee'), g('ankle'), True),
            ('foot_' + s, 'foot', ('cube', (12.0, 6.5, 3.5), V((3.5, 0, -1.5))), g('ankle'), None, False),
            # stubby flippers, not arms
            ('arm_' + s, 'body', ('limb', 3.4, 2.6, L), g('shoulder'), g('elbow'), True),
            ('forearm_' + s, 'body', ('limb', 2.6, 2.0, L), g('elbow'), g('hand'), True),
            ('hand_' + s, 'beak', ('cube', (4.5, 3.0, 4.5), V((0, 0, 0))), g('hand'), None, False),
        ]
    return out


def frog(d):
    """The computer's side: a green frog, pale belly, eyes on top of its head,
    a cap in the paddle's ink."""
    L, T, H, E = d['limb'], d['torso'], d['head'], d['eye']
    wide = (H[0], max(3, H[1] - 1))
    out = [
        ('pelvis', 'body', ('limb', 14.5, 15.5, T), at('pelvis', dz=-10), at('pelvis', dz=6), True),
        ('spine', 'body', ('limb', 15.5, 10.5, T), at('pelvis', dz=4), at('chest'), True),
        ('spine', 'belly', ('sphere', 11.0, (T, 4), 1.25, V((6.5, 0, 5.0))), at('pelvis'), None, False),
        ('neck', 'body', ('limb', 7.5, 6.5, T), at('chest'), at('neck'), True),
        ('head', 'body', ('sphere', 11.5, wide, 0.78, V((0, 0, -1.0))), at('head'), None, False),
        ('head', 'belly', ('sphere', 8.2, (max(4, H[0] - 2), 3), 0.6, V((5.0, 0, -3.5))), at('head'), None, False),
        # the frog's own silhouette: two eye domes standing on top of the head
        ('head', 'eye', ('sphere', 4.2, E, 1.0, V((2.5, 5.2, 7.0))), at('head'), None, False),
        ('head', 'eye', ('sphere', 4.2, E, 1.0, V((2.5, -5.2, 7.0))), at('head'), None, False),
        ('head', 'pupil', ('sphere', 1.7, (E[0], 2), 1.0, V((5.4, 5.2, 8.0))), at('head'), None, False),
        ('head', 'pupil', ('sphere', 1.7, (E[0], 2), 1.0, V((5.4, -5.2, 8.0))), at('head'), None, False),
        # the cap: a squashed dome in the paddle's ink, with a brim over the eyes
        ('head', 'ink', ('sphere', 10.0, (H[0], 3), 0.42, V((-0.5, 0, 9.5))), at('head'), None, False),
        ('head', 'ink', ('cube', (9.0, 13.0, 1.6), V((8.5, 0, 9.0))), at('head'), None, False),
    ]
    for s in ('n', 'f'):
        g = lambda name, s=s: at(name + '_' + s)
        out += [
            ('thigh_' + s, 'body', ('limb', 5.4, 4.4, L), g('hip'), g('knee'), True),
            ('shin_' + s, 'body', ('limb', 4.4, 3.6, L), g('knee'), g('ankle'), True),
            ('foot_' + s, 'foot', ('cube', (14.0, 8.0, 3.0), V((4.5, 0, -1.5))), g('ankle'), None, False),
            ('arm_' + s, 'body', ('limb', 3.2, 2.4, L), g('shoulder'), g('elbow'), True),
            ('forearm_' + s, 'body', ('limb', 2.4, 1.9, L), g('elbow'), g('hand'), True),
            ('hand_' + s, 'belly', ('cube', (5.0, 3.2, 5.0), V((0, 0, 0))), g('hand'), None, False),
        ]
    return out


# Each figure's palette. The slot named `ink` is the one the game repaints in
# its paddle's colour every frame, so the pair always wears the score's colours.
WHO = {
    'penguin': {
        'parts': penguin,
        'slots': ['body', 'belly', 'ink', 'beak', 'eye', 'foot'],
        # docs/ART.md era 6: HUD-outline blue body, cloud-soft belly, rail-red scarf
        'palette': ['#1f3fbf', '#f4f0e0', '#c8281e', '#f0a030', '#101018', '#f0a030'],
    },
    'frog': {
        'parts': frog,
        'slots': ['body', 'belly', 'ink', 'eye', 'pupil', 'foot'],
        # toy green, pale-green belly, toy-yellow cap
        'palette': ['#3fb84a', '#9ee6a0', '#e8d24a', '#f4f0e0', '#101018', '#2c8c38'],
    },
}


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out, who, detail, i = None, None, 'n64', 0
    while i < len(argv):
        if argv[i] == '--who':
            who = argv[i + 1]
            i += 2
            continue
        if argv[i] == '--detail':
            detail = argv[i + 1]
            i += 2
            continue
        out = argv[i]
        i += 1
    if not out or not out.endswith('.glb'):
        raise SystemExit('usage: blender --background --python era6-players.py -- <out.glb> --who penguin|frog')
    if who not in WHO:
        raise SystemExit('--who must be penguin or frog, not ' + str(who))
    if detail not in DETAIL:
        raise SystemExit('--detail must be one of ' + ', '.join(DETAIL))
    return out, who, detail


# ----------------------------------------------------------------- the pose
def pose(beat, stride=1.0, t=1.0):
    """Joint positions: a beat of player-proof.py's skeleton, its stride scaled,
    optionally mixed t of the way from idle toward it."""
    j = proof.skeleton(beat)
    if stride != 1.0 and beat in ('up', 'down'):
        base = proof.skeleton(beat)
        idle = proof.skeleton('idle')
        for k in ('knee_n', 'ankle_n', 'knee_f', 'ankle_f'):
            j[k] = idle[k] + (base[k] - idle[k]) * stride
    if t != 1.0:
        idle = proof.skeleton('idle')
        j = {k: idle[k].lerp(j[k], t) for k in j}
    return j


def ends(part, j):
    """A part's bone head and tail for a pose (a rigid part points straight up)."""
    _, _, _, a, b, _ = part
    head = a(j)
    tail = b(j) if b else head + V((0, 0, 6.0))
    return head, tail


def flip_y(v):
    """player-proof's model space has +y toward the near edge; Blender's front is -Y."""
    return V((v.x, -v.y, v.z))


def build_mesh(parts, rest):
    bm = bmesh.new()
    tags = []          # (vertex list, bone, slot) per part
    for part in parts:
        bone, slot, how = part[0], part[1], part[2]
        head, tail = ends(part, rest)
        if how[0] == 'limb':
            vs = proof.limb(bm, head, tail, how[1], how[2], how[3])
        elif how[0] == 'sphere':
            vs = proof.sphere(bm, head + how[4], how[1], how[2], how[3])
        else:
            vs = proof.cube(bm, head + how[2], how[1])
        tags.append((vs, bone, slot))
    for v in bm.verts:
        v.co = flip_y(v.co)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return bm, tags


def main():
    out, who, detail = args()
    spec = WHO[who]
    d = DETAIL[detail]
    parts = spec['parts'](d)
    slots, palette = spec['slots'], spec['palette']
    name = os.path.splitext(os.path.basename(out))[0]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS

    rest = pose('idle')
    bm, tags = build_mesh(parts, rest)
    slot_of_vert, bone_of_vert = {}, {}
    for vs, bone, slot in tags:
        for v in vs:
            slot_of_vert[v] = slot
            bone_of_vert[v] = bone
    mesh = bpy.data.meshes.new(name)
    bm.verts.index_update()
    faces_slot = [slots.index(slot_of_vert[f.verts[0]]) for f in bm.faces]
    vert_bone = [bone_of_vert[v] for v in bm.verts]
    bm.to_mesh(mesh)
    bm.free()
    for slot, colour in zip(slots, palette):
        mat = bpy.data.materials.new(slot)      # the slot named 'ink' is repainted by the game
        rgb = [int(colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        if bpy.app.version < (5, 0, 0):
            mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (lin[0], lin[1], lin[2], 1.0)
        bsdf.inputs['Roughness'].default_value = 0.75
        mat.diffuse_color = (lin[0], lin[1], lin[2], 1.0)
        mesh.materials.append(mat)
    for poly, s in zip(mesh.polygons, faces_slot):
        poly.material_index = s
        poly.use_smooth = True      # era 6's own render settings: smooth shading under the fog
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
    for part in parts:
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
    moving = lambda beat: [(0.0, pose(beat, 1.0)), (0.2, pose(beat, -1.0)), (0.4, pose(beat, 1.0))]
    clips = {
        'idle': [(0.0, pose('idle')), (1.0, pose('up', 1.0, t=0.1)), (2.0, pose('idle'))],
        'move_up': moving('up'),
        'move_down': moving('down'),
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
            for part in parts:
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
    # glTF extras: the idle paddle hand in the file's own axes (x fwd, y up, z near).
    scene['pong'] = {
        'format': 'pong-figure-1',
        'name': name,
        'by': 'tools/blender/era6-players.py --who ' + who + ' --detail ' + detail,
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
    js = out + '.js'
    with open(js, 'w', newline='\n') as f:
        f.write('/* ' + name + '.glb: exported by tools/blender/era6-players.py (item 1254); the same bytes, base64 */\n')
        f.write('(globalThis.PongFigureFiles = globalThis.PongFigureFiles || {})[' + json.dumps(name) +
                '] = "' + base64.b64encode(raw).decode('ascii') + '";\n')
    print('era6-players: %s -- %d vertices, %d triangles, %d clips, %d bytes, blender %s' % (
        out, len(mesh.vertices), len(mesh.polygons), len(CLIPS), len(raw), bpy.app.version_string))


main()
