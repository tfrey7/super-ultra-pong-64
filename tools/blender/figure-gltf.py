"""
Super Ultra Pong 64: Remastered -- a figure as a standard glTF file (item 1274).

The worked example of the contract in tools/blender/README.md: builds the
proof player of item 1248 (the same parts, the same six poses, borrowed from
player-proof.py) as ONE rigged mesh -- an armature with a bone per body part,
every vertex bound to its part's bone -- keys the six clips the 3D layer plays,
and writes it with Blender's own glTF exporter as a binary .glb, plus a
one-line plain script of the same bytes (<name>.glb.js) so a page opened off
disk can load it (file:// refuses fetch).

Run it headless only, never with the Blender window:

    blender --background --factory-startup --python tools/blender/figure-gltf.py -- assets/models/player-proof-lo.glb --detail lo

The clips (names are the contract; src/field3d.js maps the game's beats onto
them): idle (loops), move_up and move_down (loop while the paddle moves),
swing (once, SWING_S long), celebrate and lose (once, eased in, then held).

Axes, as authored in Blender: +X is forward (the figure faces the ball), -Y
is the table's near edge (Blender's front view is the game camera's side),
+Z is up; one Blender unit is one table unit; the origin is the floor under
the figure. The glTF exporter turns that into glTF's +Y up, so in the file x
is forward, y up and z toward the near edge -- the 3D layer's own world axes.
The idle paddle hand, the height and the palette slots ride on the scene as
glTF extras ({ "pong": {...} }).
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


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out, detail, i = None, 'lo', 0
    while i < len(argv):
        if argv[i] == '--detail':
            detail = argv[i + 1]
            i += 2
            continue
        out = argv[i]
        i += 1
    if not out or not out.endswith('.glb'):
        raise SystemExit('usage: blender --background --python figure-gltf.py -- <out.glb> [--detail lo|mid|hi]')
    if detail not in proof.DETAIL:
        raise SystemExit('detail must be lo, mid or hi, not ' + detail)
    return out, detail


# ----------------------------------------------------------------- the pose
def pose(beat, stride=1.0, toward=None, t=1.0):
    """Joint positions: a beat of player-proof.py's skeleton, its stride scaled,
    optionally mixed t of the way from idle toward it."""
    j = proof.skeleton(beat)
    if stride != 1.0 and beat in ('up', 'down'):
        # the same pose with the legs' stride scaled (-1 swaps the feet)
        base = proof.skeleton(beat)
        idle = proof.skeleton('idle')
        for k in ('knee_n', 'ankle_n', 'knee_f', 'ankle_f'):
            j[k] = idle[k] + (base[k] - idle[k]) * stride
    if t != 1.0:
        idle = proof.skeleton('idle')
        j = {k: idle[k].lerp(j[k], t) for k in j}
    return j


# The parts: (bone, slot, how it is made, the bone's two ends as joints).
# A limb's bone runs from its first joint to its second and stretches with
# them; a rigid part (a head, a shoe, a hand) only moves with its centre.
def parts(d):
    L, T = d['limb'], d['torso']
    up = lambda k, dz: (lambda j: j[k] + Vector((0, 0, dz)))
    out = [
        ('pelvis', 'pants', ('limb', 9.0, 10.0, T), up('pelvis', -4), up('pelvis', 6), True),
        ('spine', 'ink', ('limb', 10.0, 12.5, T), up('pelvis', 4), lambda j: j['chest'], True),
        ('neck', 'ink', ('limb', 6.0, 3.5, T), lambda j: j['chest'], lambda j: j['neck'], True),
        ('head', 'skin', ('sphere', 8.0, d['head'], 1.1, Vector((0, 0, 0))), lambda j: j['head'], None, False),
        ('head', 'hair', ('sphere', 7.2, (max(4, d['head'][0] - 2), max(3, d['head'][1] - 1)), 0.75,
                          Vector((-1.5, 0, 3.5))), lambda j: j['head'], None, False),
    ]
    for s in ('n', 'f'):
        g = lambda name, s=s: (lambda j: j[name + '_' + s])
        out += [
            ('thigh_' + s, 'pants', ('limb', 5.0, 4.0, L), g('hip'), g('knee'), True),
            ('shin_' + s, 'pants', ('limb', 4.0, 3.0, L), g('knee'), g('ankle'), True),
            ('foot_' + s, 'shoes', ('cube', (11.0, 5.5, 4.0), Vector((3.0, 0, -2.0))), g('ankle'), None, False),
            ('arm_' + s, 'ink', ('limb', 3.6, 3.0, L), g('shoulder'), g('elbow'), True),
            ('forearm_' + s, 'skin', ('limb', 3.0, 2.4, L), g('elbow'), g('hand'), True),
            ('hand_' + s, 'glove', ('sphere', 3.2, d['hand'], 1.0, Vector((0, 0, 0))) if d['hand']
             else ('cube', (5.0, 5.0, 5.0), Vector((0, 0, 0))), g('hand'), None, False),
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


def build_mesh(d, rest):
    bm = bmesh.new()
    tags = []          # (vertex list, bone, slot) per part
    for part in parts(d):
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
    out, detail = args()
    d = proof.DETAIL[detail]
    name = os.path.splitext(os.path.basename(out))[0]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS

    rest = pose('idle')
    bm, tags = build_mesh(d, rest)
    slot_of_vert = {}
    bone_of_vert = {}
    for vs, bone, slot in tags:
        for v in vs:
            slot_of_vert[v] = slot
            bone_of_vert[v] = bone
    mesh = bpy.data.meshes.new(name)
    bm.verts.index_update()
    faces_slot = [proof.SLOTS.index(slot_of_vert[f.verts[0]]) for f in bm.faces]
    vert_bone = [bone_of_vert[v] for v in bm.verts]
    bm.to_mesh(mesh)
    bm.free()
    for slot, colour in zip(proof.SLOTS, proof.PALETTE):
        mat = bpy.data.materials.new(slot)      # the slot named 'ink' is repainted by the game
        rgb = [int(colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        if bpy.app.version < (5, 0, 0):
            mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (lin[0], lin[1], lin[2], 1.0)
        bsdf.inputs['Roughness'].default_value = 0.6
        mat.diffuse_color = (lin[0], lin[1], lin[2], 1.0)
        mesh.materials.append(mat)
    for poly, s in zip(mesh.polygons, faces_slot):
        poly.material_index = s
        poly.use_smooth = detail != 'lo'
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
    for part in parts(d):
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
            for part in parts(d):
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
        'by': 'tools/blender/figure-gltf.py --detail ' + detail,
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
        f.write('/* ' + name + '.glb: exported by tools/blender/figure-gltf.py (item 1274); the same bytes, base64 */\n')
        f.write('(globalThis.PongFigureFiles = globalThis.PongFigureFiles || {})[' + json.dumps(name) +
                '] = "' + base64.b64encode(raw).decode('ascii') + '";\n')
    print('figure-gltf: %s -- %d vertices, %d triangles, %d clips, %d bytes, blender %s' % (
        out, len(mesh.vertices), len(mesh.polygons), len(CLIPS), len(raw), bpy.app.version_string))


main()
