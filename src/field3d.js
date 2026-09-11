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

  // The scene's sizes, in field units. Item 1266 builds the real table, net and
  // players on top of these; keep them as data so it can.
  var SIZES = {
    slab: 14,            // the table top's thickness under z 0
    rail: { depth: 18, z: 22 },
    lip: 10,
    line: { w: 6, dash: 20, gap: 16, lift: 0.4 },
    net: { z: 10, w: 2, post: 3, postZ: 14 },
    bat: { z: 22, handle: 26, handleR: 4 },
    ballRadius: 0.6,     // of ball.size, as table3d draws it
    shadow: 0.55
  };

  var COLOURS = { surface: '#203048', line: '#9aa3b5', rail: '#8a8f9c', net: '#e8e8e8', ball: '#ffffff', handle: '#6a4a2a' };

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
    p.surfaceMat = material(THREE, lighting, COLOURS.surface);
    p.railMat = material(THREE, lighting, COLOURS.rail);
    p.lineMat = material(THREE, lighting, COLOURS.line);
    p.slab = box(0, W, 0, H, -S.slab, 0, p.surfaceMat);
    p.farRail = box(0, W, -S.rail.depth, 0, -S.slab, S.rail.z, p.railMat);
    p.nearLip = box(0, W, H, H + S.lip, -S.slab, 0, p.railMat);
    var lx = (W - S.line.w) / 2;
    for (var y = 6; y < H; y += S.line.dash + S.line.gap) {
      var y1 = Math.min(y + S.line.dash, H);
      box(lx, lx + S.line.w, y, y1, 0, S.line.lift, p.lineMat);
    }
    // The net stands on the centre line, low and see-through, with a post at each end.
    p.netMat = material(THREE, lighting, COLOURS.net, { transparent: true, opacity: 0.45, depthWrite: false });
    p.net = box(W / 2 - S.net.w / 2, W / 2 + S.net.w / 2, 0, H, 0, S.net.z, p.netMat);
    p.postMat = material(THREE, lighting, COLOURS.rail);
    box(W / 2 - S.net.post, W / 2 + S.net.post, -S.net.post * 2, 0, 0, S.net.postZ, p.postMat);
    box(W / 2 - S.net.post, W / 2 + S.net.post, H, H + S.net.post * 2, 0, S.net.postZ, p.postMat);

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
    p.ballMat = material(THREE, lighting, COLOURS.ball);
    p.ball = add(new THREE.SphereGeometry(1, 20, 14), p.ballMat, 0, 0, 0);
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
    p.railMat.color.set(colourOf(look.rail, COLOURS.rail));

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
    if (switchedOff || !ctx || !cam || !state || !ensure()) return false;
    var t0 = root.performance && root.performance.now ? root.performance.now() : 0;
    look = look || {};
    var knobs = look.render || {};
    applyKnobs(knobs);
    pose(cam, state, look);
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
    /** The scene and renderer, for the cards that build inside this layer (item 1266, the model pipeline). */
    internals: function () { return ensure() ? { THREE: state3.three, renderer: state3.gl, scene: state3.scene, camera: state3.camera, parts: state3.parts } : null; }
  };
});
