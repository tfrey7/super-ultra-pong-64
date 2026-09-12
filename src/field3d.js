/*
 * Super Ultra Pong 64: Remastered -- the real 3D layer (item 1273).
 *
 * Eras 5 to 10 draw their FIELD -- the table, the centre line, the net, the
 * ball and its shadow, the two bats -- through three.js (vendor/three.js, one
 * plain script bundled once and checked in; window.THREE), onto a WebGL canvas
 * of its own that is then copied into the era's picture with one drawImage at
 * exactly the place src/table3d.js paints the table today. Everything else an
 * era draws -- its painted arena behind, its HUD, its effects in front -- stays
 * canvas 2D and never knows the difference; so do the display, the CRT and TV
 * overlays, the ring wipes and eras 0 to 4.
 *
 * The rules are still flat (docs/ERAS.md section 2): this reads the state and
 * draws it, and the paddle rectangle stays the hit zone. The camera is built
 * from the very numbers a table3d camera carries (tilt, height, fov, screenY,
 * panX), and matrices() turns them into the view and projection that put every
 * field point on the same pixel table3d.project() does -- test/field3d.test.js
 * pins that -- so the arenas painted around the table still line up with it.
 *
 *   world axes   x = field x - 400 (right), y = height z (up),
 *                z = field y - 300 (toward the near edge, the viewer)
 *
 * No WebGL (or no THREE, or ?gl=off, or node --test): draw() answers false and
 * the era paints today's canvas table instead -- table3d's projection and
 * src/models3d.js's polygon players are that fallback, untouched.
 *
 * Per-era render knobs, read from the era's look as `render` (none set yet):
 *   resolution  GL pixels per pixel of the picture it lands in (default 1)
 *   filter      true: smooth when the GL picture is scaled in; false: blocky
 *               (default: whatever the picture's context already says)
 *   fog         { colour: '#rrggbb', near, far } in field units of distance
 *   lighting    'standard' (default), 'phong', 'lambert', 'flat' or 'unlit'
 *
 * UMD like src/game.js: window.PongField3D in the page, require() under node.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PongField3D = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var W = 800;
  var H = 600;
  var RAD = Math.PI / 180;
  var NEAR = 10;
  var FAR = 20000;

  // The scene's sizes, in field units: the realism ladder's table (docs/ART.md
  // section 8, built by item 1266). The top is still the rules' field, 0..800 by
  // 0..600, its ends at x 0 and 800; the lines are paint on it, the net stands
  // across x 400 on two posts, and four legs stand inside the top's footprint
  // (R6: nothing between the camera and the near edge) down to a floor 110 below.
  var SIZES = {
    slab: 14,            // the table top's thickness under z 0
    rail: { depth: 18, z: 22 },
    lip: 10,
    line: { edge: 6, centre: 3, lift: 0.4 },
    net: { x: 400, z: 24, w: 1.5, y0: -20, y1: 620, tape: 2.5, opacity: 0.45, post: 4 },
    legs: { inset: { x: 70, y: 50 }, size: 12, floor: -110 },
    floorShadow: { pad: 30, opacity: 0.28 },
    bat: { z: 22, handle: 26, handleR: 4 },
    ballRadius: 0.6,     // of ball.size, as table3d draws it
    shadow: 0.55
  };

  var COLOURS = { surface: '#203048', line: '#9aa3b5', rail: '#8a8f9c', net: '#e8e8e8', ball: '#ffffff', handle: '#6a4a2a' };

  /**
   * The table's pieces as field-space boxes: { x0, x1, y0, y1, z0, z1 } each,
   * in the units the rules use (z up off the top). Pure, so node --test pins the
   * ladder's numbers without a WebGL context; rebuild() makes a mesh per box.
   */
  function tableGeometry() {
    var S = SIZES, L = S.line, N = S.net, G = S.legs;
    var lift = [0, L.lift];
    function b(x0, x1, y0, y1, z) { return { x0: x0, x1: x1, y0: y0, y1: y1, z0: z[0], z1: z[1] }; }
    var lines = [
      b(0, W, 0, L.edge, lift),                     // far edge line
      b(0, W, H - L.edge, H, lift),                 // near edge line
      b(0, L.edge, 0, H, lift),                     // the player's end
      b(W - L.edge, W, 0, H, lift),                 // the computer's end
      b(0, W, H / 2 - L.centre / 2, H / 2 + L.centre / 2, lift)   // the centre line, end to end
    ];
    var net = {
      body: b(N.x - N.w / 2, N.x + N.w / 2, N.y0, N.y1, [0, N.z - N.tape]),
      tape: b(N.x - N.w, N.x + N.w, N.y0, N.y1, [N.z - N.tape, N.z]),
      posts: [N.y0, N.y1].map(function (y) {
        return b(N.x - N.post / 2, N.x + N.post / 2, y - N.post / 2, y + N.post / 2, [-S.slab, N.z + 1]);
      })
    };
    var legs = [];
    [G.inset.x, W - G.inset.x].forEach(function (x) {
      [G.inset.y, H - G.inset.y].forEach(function (y) {
        legs.push(b(x - G.size / 2, x + G.size / 2, y - G.size / 2, y + G.size / 2, [G.floor, -S.slab]));
      });
    });
    var P = S.floorShadow.pad;
    return { lines: lines, net: net, legs: legs, floor: G.floor,
      floorShadow: b(-P, W + P, -P, H + P, [G.floor, G.floor + 0.5]) };
  }

  // ------------------------------------------------------------- the maths
  /**
   * The view and projection for a table3d camera: the eye in world axes, the
   * turn about x, and a column-major 4 x 4 projection whose principal point
   * sits at (400, screenY) as table3d's does. Pure: node --test reads it.
   */
  function matrices(cam) {
    var t = (cam.tilt || 0) * RAD;
    var fx = cam.focal / (W / 2);
    var fy = cam.focal / (H / 2);
    var off = -((H / 2) - cam.screenY) / (H / 2);
    var a = -(FAR + NEAR) / (FAR - NEAR);
    var b = -2 * FAR * NEAR / (FAR - NEAR);
    return {
      eye: [cam.panX || 0, cam.height, cam.back],
      rotX: t - Math.PI / 2,
      // column-major, as THREE.Matrix4.fromArray takes it
      projection: [fx, 0, 0, 0,  0, fy, 0, 0,  0, off, a, -1,  0, 0, b, 0]
    };
  }

  /** A field point through matrices(): { x, y } on the 800 x 600 field. For the tests. */
  function projectThrough(m, x, y, z) {
    var wx = x - W / 2 - m.eye[0], wy = (z || 0) - m.eye[1], wz = y - H / 2 - m.eye[2];
    // into the camera's frame: undo the turn about x
    var c = Math.cos(-m.rotX), s = Math.sin(-m.rotX);
    var vx = wx, vy = wy * c - wz * s, vz = wy * s + wz * c;
    var P = m.projection;
    var cx = P[0] * vx + P[4] * vy + P[8] * vz + P[12];
    var cy = P[1] * vx + P[5] * vy + P[9] * vz + P[13];
    var cw = P[3] * vx + P[7] * vy + P[11] * vz + P[15];
    return { x: W / 2 + (cx / cw) * (W / 2), y: H / 2 - (cy / cw) * (H / 2) };
  }

  // -------------------------------------------------------------- the page
  var state3 = { tried: false, ok: false, why: '', gl: null, three: null, scene: null, camera: null,
    parts: null, lighting: null, fogKey: '' };
  var switchedOff = !!(root.__pongGlOff ||
    (root.location && /[?&]gl=off\b/.test(String(root.location.search || ''))));
  var stats = { frames: 0, ms: 0 };

  function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }

  /** Make the renderer and the scene once. False (and why) when this page has no WebGL. */
  function ensure() {
    if (state3.tried) return state3.ok;
    state3.tried = true;
    var THREE = root.THREE;
    if (!THREE || !root.document || typeof root.document.createElement !== 'function') {
      state3.why = THREE ? 'no document' : 'no THREE';
      return false;
    }
    try {
      var canvas = root.document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var gl = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false,
        preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      gl.setClearColor(0x000000, 0);
      gl.setPixelRatio(1);
      gl.outputColorSpace = THREE.SRGBColorSpace;
      state3.gl = gl;
      state3.three = THREE;
      build(THREE);
      state3.ok = true;
    } catch (e) {
      state3.why = 'WebGL unavailable: ' + (e && e.message ? e.message : e);
      state3.ok = false;
    }
    return state3.ok;
  }

  function material(THREE, lighting, colour, extra) {
    var o = Object.assign({ color: colour }, extra || {});
    if (lighting === 'unlit') return new THREE.MeshBasicMaterial(o);
    if (lighting === 'lambert') return new THREE.MeshLambertMaterial(o);
    if (lighting === 'flat') return new THREE.MeshLambertMaterial(Object.assign(o, { flatShading: true }));
    if (lighting === 'phong') return new THREE.MeshPhongMaterial(Object.assign({ shininess: 40 }, o));
    return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.55, metalness: 0.05 }, o));
  }

  /** The scene: one light (with a low fill), the slab, the rails, the line, the net, two bats, the ball and its shadow. */
  function build(THREE) {
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, W / H, NEAR, FAR);
    camera.matrixAutoUpdate = true;

    var sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-260, 900, 420);
    scene.add(sun);
    scene.add(sun.target);
    var fill = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(fill);

    var group = new THREE.Group();
    scene.add(group);
    state3.scene = scene;
    state3.camera = camera;
    state3.parts = { group: group, sun: sun, fill: fill };
    rebuild(THREE, 'standard');
  }

  /** (Re)make the meshes for a lighting model: materials differ, the geometry does not. */
  function rebuild(THREE, lighting) {
    var p = state3.parts, g = p.group, S = SIZES;
    while (g.children.length) {
      var ch = g.children.pop();
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) ch.material.dispose();
    }
    function add(geo, mat, x, y, z) {
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    }
    // world position of a field box: x0..x1, fy0..fy1 (field y), z0..z1 (up)
    function box(x0, x1, fy0, fy1, z0, z1, mat) {
      return add(new THREE.BoxGeometry(x1 - x0, z1 - z0, fy1 - fy0), mat,
        (x0 + x1) / 2 - W / 2, (z0 + z1) / 2, (fy0 + fy1) / 2 - H / 2);
    }
    function part(g, mat) { return box(g.x0, g.x1, g.y0, g.y1, g.z0, g.z1, mat); }
    var geo = tableGeometry();
    p.surfaceMat = material(THREE, lighting, COLOURS.surface);
    p.railMat = material(THREE, lighting, COLOURS.rail);
    p.lineMat = material(THREE, lighting, COLOURS.line);
    // The floor under the table, as a soft shadow only: the era's painted arena
    // is the floor, and the players' (the polygon cards') feet stand on its level.
    p.floorShadow = part(geo.floorShadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true,
      opacity: S.floorShadow.opacity, depthWrite: false }));
    p.legs = geo.legs.map(function (g) { return part(g, p.railMat); });
    p.slab = box(0, W, 0, H, -S.slab, 0, p.surfaceMat);
    p.farRail = box(0, W, -S.rail.depth, 0, -S.slab, S.rail.z, p.railMat);
    p.nearLip = box(0, W, H, H + S.lip, -S.slab, 0, p.railMat);
    p.lines = geo.lines.map(function (g) { return part(g, p.lineMat); });
    // The net across x 400, on a post at each side edge: a see-through body and a
    // top tape in the line colour. Both are drawn before the ball (renderOrder,
    // and neither writes depth), so the ball always passes over it (docs/ART.md 8).
    p.netMat = material(THREE, lighting, COLOURS.net, { transparent: true, opacity: S.net.opacity, depthWrite: false });
    p.net = part(geo.net.body, p.netMat);
    p.tapeMat = material(THREE, lighting, COLOURS.line, { transparent: true, opacity: 1, depthWrite: false });
    p.tape = part(geo.net.tape, p.tapeMat);
    p.net.renderOrder = p.tape.renderOrder = 1;
    p.postMat = material(THREE, lighting, COLOURS.rail);
    p.posts = geo.net.posts.map(function (g) { return part(g, p.postMat); });

    // The bats: a blade standing on the paddle's own rectangle (a unit box,
    // scaled to the rect every frame) and a handle out toward the owner's wall.
    p.bats = {};
    ['left', 'right'].forEach(function (side) {
      var mat = material(THREE, lighting, '#ffffff');
      var blade = add(new THREE.BoxGeometry(1, 1, 1), mat, 0, 0, 0);
      var handle = add(new THREE.CylinderGeometry(S.bat.handleR, S.bat.handleR, S.bat.handle, 10),
        material(THREE, lighting, COLOURS.handle), 0, 0, 0);
      handle.rotation.z = Math.PI / 2;
      p.bats[side] = { blade: blade, handle: handle, mat: mat };
    });

    // The ball and its contact shadow (R5), a dark disc on the table at the true footprint.
    // The ball rides the transparent pass (at full opacity) after the net and its
    // tape, so nothing of the net is ever drawn over it (R1, R2).
    p.ballMat = material(THREE, lighting, COLOURS.ball, { transparent: true, opacity: 1 });
    p.ball = add(new THREE.SphereGeometry(1, 20, 14), p.ballMat, 0, 0, 0);
    p.ball.renderOrder = 2;
    p.shadow = add(new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: S.shadow, depthWrite: false }), 0, 0.6, 0);
    p.shadow.rotation.x = -Math.PI / 2;
    state3.lighting = lighting;
  }

  function colourOf(v, fallback) { return isHex(v) ? v : fallback; }

  /** Point the scene at this frame: camera, colours, bats, ball. */
  function pose(cam, state, look) {
    var THREE = state3.three, p = state3.parts, S = SIZES;
    var m = matrices(cam);
    var camera = state3.camera;
    camera.position.set(m.eye[0], m.eye[1], m.eye[2]);
    camera.rotation.set(m.rotX, 0, 0);
    camera.updateMatrixWorld(true);
    camera.projectionMatrix.fromArray(m.projection);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    p.surfaceMat.color.set(colourOf(look.surface, COLOURS.surface));
    p.lineMat.color.set(colourOf(look.line, COLOURS.line));
    p.tapeMat.color.set(colourOf(look.line, COLOURS.line));
    p.railMat.color.set(colourOf(look.rail, COLOURS.rail));
    p.postMat.color.set(colourOf(look.rail, COLOURS.rail));

    ['left', 'right'].forEach(function (side) {
      var r = state[side], bat = p.bats[side];
      bat.mat.color.set(colourOf(look.ink && look.ink[side], '#ffffff'));
      bat.blade.scale.set(r.w, S.bat.z, r.h);
      bat.blade.position.set(r.x + r.w / 2 - W / 2, S.bat.z / 2, r.y + r.h / 2 - H / 2);
      var out = side === 'left' ? -1 : 1;
      var hx = side === 'left' ? r.x : r.x + r.w;
      bat.handle.position.set(hx + out * S.bat.handle / 2 - W / 2, S.bat.z / 2, r.y + r.h / 2 - H / 2);
    });

    var shown = !(state.serveDelay > 0);
    var b = state.ball, rad = b.size * S.ballRadius;
    var cx = b.x + b.size / 2 - W / 2, cz = b.y + b.size / 2 - H / 2;
    p.ball.visible = p.shadow.visible = shown;
    p.ball.scale.setScalar(rad);
    p.ball.position.set(cx, rad, cz);
    p.ballMat.color.set(colourOf(look.ball, COLOURS.ball));
    p.shadow.scale.setScalar(rad);
    p.shadow.position.set(cx, 0.6, cz);
    return THREE;
  }

  function applyKnobs(knobs) {
    var THREE = state3.three;
    var lighting = knobs.lighting || 'standard';
    if (lighting !== state3.lighting) rebuild(THREE, lighting);
    var fogKey = knobs.fog ? [knobs.fog.colour, knobs.fog.near, knobs.fog.far].join('|') : '';
    if (fogKey !== state3.fogKey) {
      state3.scene.fog = knobs.fog ? new THREE.Fog(knobs.fog.colour || '#000000', knobs.fog.near || 0, knobs.fog.far || FAR) : null;
      state3.fogKey = fogKey;
    }
  }

  // ------------------------------------------------------------ figures
  // Item 1274: the players as standard glTF figures made in Blender
  // (tools/blender/README.md is the contract), rigged and animated, lit by the
  // table's own light. A figure's file is assets/models/<name>.glb, and the
  // page reads it from <name>.glb.js, the same bytes as base64 in
  // PongFigureFiles[name], because file:// refuses fetch. The name is the one
  // the era's block in src/characters.js already gives (`figure`, else
  // `model`), and until that name's file has loaded -- or when it has none --
  // the polygon figures of src/models3d.js draw exactly as before.
  var CLIP_OF = { idle: 'idle', up: 'move_up', down: 'move_down', swing: 'swing', win: 'celebrate', miss: 'lose' };
  var CLIPS = ['idle', 'move_up', 'move_down', 'swing', 'celebrate', 'lose'];
  var LOOPS = { idle: true, move_up: true, move_down: true };
  var ALL_BEATS = { frames: { idle: 1, up: 1, down: 1, swing: 1, miss: 1, win: 1 } };   // beatOf may pick any beat
  var BLEND_S = 0.12;          // a change of clip cross-fades over this long
  var FIG_DIR = 'assets/models/';
  var FIG_NAME = /^[a-z0-9][a-z0-9_-]*$/;
  var figFiles = {};            // name -> { state: 'loading' | 'ready' | 'failed', gltf, pong, why }
  var figAsked = {};            // name -> the script tag added for it
  var figKept = {};             // side + ':' + name -> one posed instance
  var figuresTaken = false;     // this draw stood the figures; src/models3d.js asks once (takeFigures)
  var figuresOff = !!(root.location && /[?&](models|characters|figures)=off\b/.test(String(root.location.search || '')));
  // Item 1299: what the first frame that draws a figure pays, in ms, and what
  // the warm-up paid instead. figureTimings() answers it; a measurement reads it.
  var figTimes = { parseMs: 0, buildMs: 0, compileMs: 0, warmMs: 0, warms: 0, warmed: [] };
  function nowMs() { return root.performance && root.performance.now ? root.performance.now() : 0; }

  /** The clip a src/characters.js beat plays. */
  function clipFor(beat) { return CLIP_OF[beat] || 'idle'; }

  /** How far into a clip: a loop runs on the game clock, a one-shot from its beat's start, then holds. */
  function clipTime(clip, duration, time, age) {
    if (!(duration > 0)) return 0;
    var at = LOOPS[clip] ? ((time % duration) + duration) % duration : Math.max(0, Math.min(duration, age || 0));
    return Math.min(at, duration * 0.999);   // never exactly the end: a repeating action wraps it to 0
  }

  function base64Buffer(s) {
    if (typeof root.atob === 'function') {
      var bin = root.atob(s), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    }
    var b = Buffer.from(s, 'base64');
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }

  /** A figure file, parsed, or null while it loads (or when there is none). The first ask loads it. */
  function figure(name) {
    if (typeof name !== 'string' || !FIG_NAME.test(name)) return null;
    var f = figFiles[name];
    if (f) return f.state === 'ready' ? f : null;
    var files = root.PongFigureFiles;
    if (files && typeof files[name] === 'string') {
      f = figFiles[name] = { state: 'loading', gltf: null, pong: null, why: '' };
      var t0 = nowMs();
      try {
        new state3.three.GLTFLoader().parse(base64Buffer(files[name]), '', function (gltf) {
          f.gltf = gltf;
          f.pong = (gltf.scene && gltf.scene.userData && gltf.scene.userData.pong) || {};
          f.state = 'ready';
        }, function (e) { f.state = 'failed'; f.why = String((e && e.message) || e); });
      } catch (e) { f.state = 'failed'; f.why = String((e && e.message) || e); }
      figTimes.parseMs += nowMs() - t0;
      return null;
    }
    if (!figAsked[name] && root.document && root.document.body) {
      var s = root.document.createElement('script');
      s.src = FIG_DIR + name + '.glb.js';
      s.async = true;
      s.onerror = function () { figFiles[name] = { state: 'failed', why: 'no ' + FIG_DIR + name + '.glb.js' }; };
      figAsked[name] = s;
      root.document.body.appendChild(s);
    }
    return null;
  }

  /** One side's posed copy of a figure: its own skeleton, mixer, ink materials and contact shadow. */
  function kept(side, name, f) {
    var key = side + ':' + name;
    if (figKept[key]) return figKept[key];
    var tBuild = nowMs();
    var THREE = state3.three;
    var body = THREE.SkeletonUtils.clone(f.gltf.scene);
    var ink = [];
    var inkName = f.pong.ink || 'ink';
    body.traverse(function (o) {
      if (!o.isMesh) return;
      o.frustumCulled = false;      // a skinned mesh's bounds are its rest pose
      var list = Array.isArray(o.material) ? o.material : [o.material];
      var own = list.map(function (m) { var c = m.clone(); if (c.name === inkName) ink.push(c); return c; });
      o.material = Array.isArray(o.material) ? own : own[0];
    });
    var mixer = new THREE.AnimationMixer(body);
    var actions = {};
    (f.gltf.animations || []).forEach(function (clip) {
      var a = mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(0);
      actions[clip.name] = a;
    });
    var shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    state3.scene.add(body);
    state3.scene.add(shadow);
    figKept[key] = { side: side, name: name, body: body, mixer: mixer, actions: actions, ink: ink, shadow: shadow,
      pong: f.pong, clip: null, since: 0, prev: null, prevAt: 0 };
    figTimes.buildMs += nowMs() - tBuild;
    return figKept[key];
  }

  /** Set a figure's clips for this frame, deterministically from the game clock: a frame drawn twice draws the same pose. */
  function animate(k, clip, time, age) {
    if (!k.actions[clip]) clip = k.actions.idle ? 'idle' : CLIPS.filter(function (c) { return k.actions[c]; })[0];
    if (!clip) return;
    if (k.clip === null || time < k.since) { k.clip = clip; k.since = time; k.prev = null; }
    else if (clip !== k.clip) {
      var was = k.actions[k.clip];
      k.prev = k.clip;
      k.prevAt = was ? was.time : 0;
      k.clip = clip;
      k.since = time;
    }
    var w = Math.min(1, (time - k.since) / BLEND_S);
    for (var name in k.actions) k.actions[name].setEffectiveWeight(0);
    var a = k.actions[clip];
    a.time = clipTime(clip, a.getClip().duration, time, age);
    a.setEffectiveWeight(k.prev && w < 1 ? w : 1);
    if (k.prev && w < 1 && k.actions[k.prev]) {
      k.actions[k.prev].time = k.prevAt;
      k.actions[k.prev].setEffectiveWeight(1 - w);
    }
    k.mixer.update(0);
  }

  /**
   * Stand both players' figures at their paddles for this frame. Answers true
   * when both sides' files are ready and drawn; false leaves the polygon
   * figures to src/characters.js. Placement is src/characters.js drawModels'
   * own: the idle paddle hand on the paddle's outer face, at the block's
   * modelScale, the right-hand player mirrored.
   */
  function poseFigures(state, look) {
    for (var key in figKept) { figKept[key].body.visible = false; figKept[key].shadow.visible = false; }
    var C = root.PongCharacters;
    if (figuresOff || look.figures === false || !C || typeof C.configFor !== 'function' || !C.enabled) return null;
    var era = Math.floor(state.era) || 0;
    var sides = ['left', 'right'], pick = [];
    for (var i = 0; i < 2; i++) {
      var cfg = C.configFor(era, sides[i]);
      if (!cfg || !cfg.is3d) return null;
      var name = cfg.figure || cfg.model;
      var f = figure(name);
      if (!f || !state[sides[i]]) return null;
      pick.push({ side: sides[i], cfg: cfg, f: f, name: name });
    }
    var mem = typeof C.memoryOf === 'function' ? C.memoryOf(state) : null;
    var t = state.time || 0;
    var slabs = {};
    pick.forEach(function (it) {
      var p = state[it.side], cfg = it.cfg;
      var k = kept(it.side, it.name, it.f);
      var mirror = it.side === 'right' ? -1 : 1;
      var scale = cfg.modelScale || 1;
      var hand = k.pong.hand || [0, 0, 0];      // file axes: x forward, y up, z toward the near edge
      var outerX = mirror > 0 ? p.x : p.x + p.w;
      var ax = outerX - mirror * 2.5, ay = p.y + p.h / 2;
      k.body.position.set(ax - mirror * hand[0] * scale - W / 2, 0, ay - hand[2] * scale - H / 2);
      k.body.scale.set(mirror * scale, scale, scale);
      k.body.visible = true;
      k.shadow.visible = true;
      k.shadow.position.set(k.body.position.x, 0.5, k.body.position.z);
      k.shadow.scale.set(16 * scale, 11 * scale, 1);
      var memo = mem && mem[it.side];
      var beat = typeof C.beatOf === 'function' ? C.beatOf(memo, t, p.vy || 0, ALL_BEATS).beat : 'idle';
      var age = memo && memo.held ? t - memo.since : 0;
      animate(k, clipFor(beat), t, age);
      var ink = isHex(look.ink && look.ink[it.side]) ? look.ink[it.side] : null;
      if (ink) k.ink.forEach(function (m) { m.color.set(ink); });
      slabs[it.side] = cfg.slabZ || (hand[1] * scale + 6);
    });
    return slabs;
  }

  /** How many device pixels the context draws per field unit. */
  function pixelScale(ctx) {
    if (typeof ctx.getTransform !== 'function') return 1;
    var t = ctx.getTransform();
    return Math.max(0.1, Math.sqrt(t.a * t.a + t.b * t.b)) || 1;
  }

  /**
   * Draw the field in 3D and copy it into ctx over the 800 x 600 field. look:
   * { surface, line, rail, ball, ink: { left, right } } colours (anything not a
   * #rrggbb keeps the default) and render: the era's knobs. Answers true when
   * it drew; false means the caller paints the canvas table as before.
   */
  function draw(ctx, cam, state, look) {
    figuresTaken = false;
    if (switchedOff || !ctx || !cam || !state || !ensure()) return false;
    var t0 = root.performance && root.performance.now ? root.performance.now() : 0;
    look = look || {};
    var knobs = look.render || {};
    applyKnobs(knobs);
    pose(cam, state, look);
    var slabs = poseFigures(state, look);
    if (slabs) {
      // The figures hold their bats: each blade stands as tall as the hand that grips it (src/models3d.js's slab).
      ['left', 'right'].forEach(function (side) {
        var bat = state3.parts.bats[side], h = slabs[side];
        bat.blade.scale.y = h;
        bat.blade.position.y = h / 2;
        bat.handle.position.y = Math.max(SIZES.bat.z / 2, h - 6);
      });
      figuresTaken = true;
    }
    var gl = state3.gl;
    var k = pixelScale(ctx) * (knobs.resolution || 1);
    var w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    var c = gl.domElement;
    if (c.width !== w || c.height !== h) gl.setSize(w, h, false);
    gl.render(state3.scene, state3.camera);
    var prevSmooth = ctx.imageSmoothingEnabled;
    if (knobs.filter !== undefined) ctx.imageSmoothingEnabled = !!knobs.filter;
    ctx.drawImage(c, 0, 0, w, h, 0, 0, W, H);
    ctx.imageSmoothingEnabled = prevSmooth;
    if (t0) { stats.frames++; stats.ms += root.performance.now() - t0; }
    return true;
  }

  return {
    SIZES: SIZES,
    COLOURS: COLOURS,
    tableGeometry: tableGeometry,
    matrices: matrices,
    projectThrough: projectThrough,
    draw: draw,
    /** Whether the 3D path can draw on this page (makes the renderer on first ask). */
    available: function () { return !switchedOff && ensure(); },
    /** Why it cannot, when it cannot. */
    why: function () { return switchedOff ? 'switched off (?gl=off or PongField3D.off())' : state3.why; },
    /** The A/B switch: off() draws every era through the canvas fallback, on() back through WebGL. */
    off: function () { switchedOff = true; },
    on: function () { switchedOff = false; },
    /** Frames drawn through WebGL and their total ms, for the playtest's A/B. */
    stats: function () { return { frames: stats.frames, ms: stats.ms }; },
    /** Figures (item 1274): the clip a beat plays, where in it, and a figure file's load state. */
    CLIPS: CLIPS,
    clipFor: clipFor,
    clipTime: clipTime,
    figureState: function (name) { var f = figFiles[name]; return f ? { state: f.state, why: f.why || '' } : null; },
    /** Item 1299: what unpacking, building and compiling the figures has cost this page, in ms. */
    figureTimings: function () {
      return { parseMs: +figTimes.parseMs.toFixed(2), buildMs: +figTimes.buildMs.toFixed(2),
        compileMs: +figTimes.compileMs.toFixed(2), warmMs: +figTimes.warmMs.toFixed(2),
        warms: figTimes.warms, warmed: figTimes.warmed.slice() };
    },
    /**
     * Whether the last draw stood the glTF figures, answered ONCE: src/models3d.js
     * asks as it is about to draw the polygon figures over the same frame, and
     * skips them when these are already there.
     */
    takeFigures: function () { var t = figuresTaken; figuresTaken = false; return t; },
    /** The scene and renderer, for the cards that build inside this layer (item 1266, the model pipeline). */
    internals: function () { return ensure() ? { THREE: state3.three, renderer: state3.gl, scene: state3.scene, camera: state3.camera, parts: state3.parts } : null; }
  };
});
