/*
 * Super Ultra Pong 64: Remastered -- polygon players on the 3D table (item 1248).
 *
 * Tim, on the pixel sprites the 3D eras first wore: "if you are trying to do
 * sprites in the 3d eras uh...that is not gonna look AAA here dude". So from
 * the PlayStation up a player is a polygon model: built in Blender by a
 * checked-in script (tools/blender/), exported as one compact JSON file under
 * assets/models/, and drawn here with the game's own canvas 2D -- no WebGL.
 *
 *   model file   pong-model-1 (tools/blender/README.md): a palette, triangles
 *                with a palette slot each, the paddle hand's idle spot, and
 *                one vertex set per beat -- idle, up, down, swing, miss, win.
 *   keyframes    the six vertex sets; a figure is two of them mixed, idle and
 *                the beat src/characters.js says is playing, by a weight that
 *                runs over the beat's own time (keyframes() below).
 *   placing      the model's hand goes on the middle of the paddle's outer
 *                edge; the right player is the same model mirrored in x.
 *   the slab     the paddle itself, as a 3D slab over its unchanged hit
 *                rectangle, shaded like the figure in the paddle's own ink.
 *   sorting      every visible triangle of both figures, every visible face
 *                of both slabs and -- when it is in front of a figure -- the
 *                ball, go into one list sorted far to near (painter's order).
 *                The table is the floor under all of it and was drawn first.
 *   shading      one mode per era, all flat fills of triangles:
 *                  flat      PlayStation: one colour a face, few levels,
 *                            dithered between two, vertices on the camera's
 *                            snapped grid (the era's camera wobbles and snaps)
 *                  gouraud   N64: smooth normals, fogged, soft edges
 *                  cel       Dreamcast: two bands and an ink outline
 *                  specular  PS2: smooth with a white highlight
 *                  vertex    Xbox: two lights a vertex, a hard shadow blob,
 *                            a metal sheen on the shirt
 *                  hd        Xbox 360: key and rim light, the highlights
 *                            drawn again with 'lighter' so they glow
 *
 * Nothing here loops over pixels: a frame is one fill (and at most one stroke)
 * a visible triangle. It reads the state it is handed and writes none of it.
 *
 * Loading: in the page a model file reaches the game the way every script
 * does -- assets/models/<name>.js, the same data wrapped in one assignment,
 * added as a <script> tag the first time the model is asked for (file://
 * refuses fetch, and GitHub Pages serves the file beside index.html either
 * way). Until it has run, get() answers null and src/characters.js draws its
 * sprite stand-in. Under node --test, loadFile() reads the .json itself.
 *
 * A plain script with a UMD tail: window.PongModels3D in the page,
 * require('../src/models3d.js') under node --test.
 */
(function (root) {
  'use strict';

  var FORMAT = 'pong-model-1';
  var BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
  var MODES = ['flat', 'gouraud', 'cel', 'specular', 'vertex', 'hd'];
  var DIR = 'assets/models/';
  var NAME = /^[a-z0-9][a-z0-9_-]*$/;

  // The beats' timing, the same numbers src/characters.js runs its sheets on.
  var SWING_S = 0.3;
  var REACT_S = 1.2;
  var EASE_S = 0.2;        // a miss or a win takes this long to reach its pose
  var MOVE = 60;           // paddle speed that reads as moving (characters.js MOVE)
  var FULL_MOVE = 360;     // paddle speed at which up/down is fully posed

  var SLAB_Z = 40;         // the paddle slab's height: the hand grips it at 34
  var W = 800, H = 600;

  // Light, in field space (x right, y toward the near edge, z up), pointing
  // at the light: from the left, a little toward the eye, high.
  var KEY = norm([-0.45, 0.4, 0.8]);
  var FILL = norm([0.7, 0.3, 0.2]);

  function norm(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function hexRgb(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  var HEX = {};
  function rgbHex(r, g, b) {
    r = r < 0 ? 0 : r > 255 ? 255 : r & 252;
    g = g < 0 ? 0 : g > 255 ? 255 : g & 252;
    b = b < 0 ? 0 : b > 255 ? 255 : b & 252;
    var k = (r << 16) | (g << 8) | b;
    return HEX[k] || (HEX[k] = '#' + (0x1000000 | k).toString(16).slice(1));
  }

  // ------------------------------------------------------------ loading
  /**
   * Check a pong-model-1 object and turn it into what the drawer uses:
   * typed arrays, and triangles wound so their normals point out. Throws
   * with a sentence naming what is wrong.
   */
  function parse(data) {
    if (!data || data.format !== FORMAT) throw new Error('not a ' + FORMAT + ' model');
    var tris = data.tris, colors = data.colors, beats = data.beats;
    if (!Array.isArray(tris) || tris.length % 3) throw new Error('tris must be a flat list of whole triangles');
    var nt = tris.length / 3;
    if (!Array.isArray(colors) || colors.length !== nt) throw new Error('colors must name one palette slot a triangle');
    if (!Array.isArray(data.palette) || !data.palette.length) throw new Error('the model has no palette');
    if (!beats || !Array.isArray(beats.idle)) throw new Error('the model has no idle beat');
    var nv = beats.idle.length / 3;
    var frames = {};
    for (var b = 0; b < BEATS.length; b++) {
      var list = beats[BEATS[b]] || beats.idle;
      if (list.length !== beats.idle.length) throw new Error('beat ' + BEATS[b] + ' has ' + list.length / 3 + ' vertices, idle has ' + nv);
      frames[BEATS[b]] = Float32Array.from(list);
    }
    var t = new Uint16Array(tris.length);
    for (var i = 0; i < tris.length; i++) {
      if (!(tris[i] >= 0 && tris[i] < nv)) throw new Error('triangle corner ' + i + ' names vertex ' + tris[i] + ' of ' + nv);
      t[i] = tris[i];
    }
    for (var c = 0; c < colors.length; c++) {
      if (!(colors[c] >= 0 && colors[c] < data.palette.length)) throw new Error('triangle ' + c + ' names palette slot ' + colors[c]);
    }
    var model = {
      name: data.name || '',
      palette: data.palette.map(hexRgb),
      slots: data.slots || [],
      ink: (data.slots || []).indexOf('ink'),
      tris: t,
      colors: Uint8Array.from(colors),
      beats: frames,
      count: nv,
      triangles: nt,
      hand: (data.hand || [0, 0, 0]).slice(0, 3),
      height: data.height || 0
    };
    // Wind every triangle outward: a mesh whose signed volume is negative was
    // exported inside out, and is turned the right way here once.
    if (signedVolume(model, frames.idle) < 0) {
      for (var k = 0; k < t.length; k += 3) { var s = t[k + 1]; t[k + 1] = t[k + 2]; t[k + 2] = s; }
    }
    return model;
  }

  /** Six times the signed volume the triangles enclose, over a vertex set. */
  function signedVolume(model, v) {
    var t = model.tris, sum = 0;
    for (var i = 0; i < t.length; i += 3) {
      var a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      sum += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1])
           - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c])
           + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
    }
    return sum;
  }

  var models = {};        // name -> parsed model
  var pending = {};       // name -> the script tag added for it

  function files() { return root.PongModelFiles || null; }

  /** Parse and keep a model under a name; answers the model. */
  function register(name, data) {
    models[name] = parse(data);
    return models[name];
  }

  function hasDocument() {
    return typeof root.document !== 'undefined' && root.document && typeof root.document.createElement === 'function';
  }

  /**
   * The model for a name, or null while it is loading (or has none). In the
   * page the first ask adds assets/models/<name>.js as a script.
   */
  function get(name) {
    if (typeof name !== 'string' || !NAME.test(name)) return null;
    if (models[name]) return models[name];
    var f = files();
    if (f && f[name]) {
      try { return register(name, f[name]); } catch (e) { models[name] = null; return null; }
    }
    if (!pending[name] && hasDocument() && root.document.body) {
      var s = root.document.createElement('script');
      s.src = DIR + name + '.js?v=' + Math.floor(Date.now() / 60000);
      s.async = true;
      pending[name] = s;
      root.document.body.appendChild(s);
    }
    return null;
  }

  /** Under node: read assets/models/<name>.json (or any path) and register it. */
  function loadFile(file, name) {
    var fs = require('fs');
    var data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return register(name || data.name, data);
  }

  // ----------------------------------------------------------- keyframes
  /**
   * The two keyframes a figure shows and how far between them it is:
   * { from, to, t }. beat is src/characters.js's beat, age how long it has
   * been held, vy the paddle's speed, time the game clock.
   *   idle   a slow breath: a tenth of the way toward 'up' and back
   *   up/down  toward the beat by how fast the paddle moves
   *   swing  out to the swing and back over SWING_S
   *   miss/win  eased in over EASE_S, held
   */
  function keyframes(beat, age, vy, time) {
    age = Math.max(0, age || 0);
    if (beat === 'swing') return { from: 'idle', to: 'swing', t: Math.sin(Math.PI * Math.min(1, age / SWING_S)) };
    if (beat === 'miss' || beat === 'win') return { from: 'idle', to: beat, t: Math.min(1, age / EASE_S) };
    if (beat === 'up' || beat === 'down') {
      var s = Math.abs(vy || 0);
      return { from: 'idle', to: beat, t: Math.max(0.35, Math.min(1, (s - MOVE) / (FULL_MOVE - MOVE) + 0.35)) };
    }
    return { from: 'idle', to: 'up', t: 0.05 + 0.05 * Math.sin((time || 0) * 2 * Math.PI * 0.5) };
  }

  /** Mix two beats' vertex sets: out[i] = from + (to - from) * t. */
  function blend(model, from, to, t, out) {
    var a = model.beats[from] || model.beats.idle;
    var b = model.beats[to] || a;
    out = out && out.length === a.length ? out : new Float32Array(a.length);
    t = Math.max(0, Math.min(1, t || 0));
    for (var i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
    return out;
  }

  // ------------------------------------------------------------ geometry
  /** Where the eye is, in field space, for a table3d camera. */
  function eyeOf(cam) {
    return [W / 2 + (cam.panX || 0), H / 2 + cam.back, cam.height];
  }

  /**
   * One figure's vertices placed on the table: the model's idle hand on the
   * anchor point, mirrored in x for the right-hand player. Answers a flat
   * Float32Array of field-space x, y, z.
   */
  function place(model, pose, anchor, mirror, scale, out) {
    var n = pose.length;
    out = out && out.length === n ? out : new Float32Array(n);
    var k = scale || 1, h = model.hand;
    for (var i = 0; i < n; i += 3) {
      out[i] = anchor.x + mirror * (pose[i] - h[0]) * k;
      out[i + 1] = anchor.y + (pose[i + 1] - h[1]) * k;
      out[i + 2] = anchor.z + (pose[i + 2] - h[2]) * k;
    }
    return out;
  }

  /** Face normal (unnormalised) of triangle a, b, c from a flat vertex array. */
  function faceNormal(v, a, b, c, out) {
    var ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    var wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    out[0] = uy * wz - uz * wy;
    out[1] = uz * wx - ux * wz;
    out[2] = ux * wy - uy * wx;
    return out;
  }

  /** Smooth vertex normals: each face's normal added to its three corners. */
  function vertexNormals(model, v, mirror, out) {
    out = out && out.length === v.length ? out : new Float32Array(v.length);
    out.fill(0);
    var t = model.tris, n = [0, 0, 0];
    for (var i = 0; i < t.length; i += 3) {
      var a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      faceNormal(v, a, b, c, n);
      for (var j = 0; j < 3; j++) {
        var q = t[i + j] * 3;
        out[q] += n[0] * mirror; out[q + 1] += n[1] * mirror; out[q + 2] += n[2] * mirror;
      }
    }
    for (var k = 0; k < out.length; k += 3) {
      var l = Math.sqrt(out[k] * out[k] + out[k + 1] * out[k + 1] + out[k + 2] * out[k + 2]) || 1;
      out[k] /= l; out[k + 1] /= l; out[k + 2] /= l;
    }
    return out;
  }

  // ------------------------------------------------------------- shading
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  /**
   * One triangle's (or slab face's) lighting under a mode: { lum, spec, rim }.
   * n is the unit normal, view the unit vector toward the eye.
   */
  function light(mode, n, view, metal) {
    var d = Math.max(0, dot(n, KEY));
    var half = norm([KEY[0] + view[0], KEY[1] + view[1], KEY[2] + view[2]]);
    var nh = Math.max(0, dot(n, half));
    switch (mode) {
      case 'flat':
        // Six levels, the dither between two of them decided by the caller.
        return { lum: 0.4 + 0.75 * d, spec: 0, rim: 0 };
      case 'gouraud':
        return { lum: 0.45 + 0.65 * d, spec: 0, rim: 0 };
      case 'cel':
        return { lum: d > 0.35 ? 1.05 : 0.62, spec: 0, rim: 0 };
      case 'specular':
        return { lum: 0.38 + 0.7 * d, spec: 0.75 * Math.pow(nh, 24), rim: 0 };
      case 'vertex':
        return { lum: 0.32 + 0.62 * d + 0.25 * Math.max(0, dot(n, FILL)),
                 spec: metal ? 0.9 * Math.pow(nh, 40) : 0.15 * Math.pow(nh, 12), rim: 0 };
      case 'hd':
        return { lum: 0.34 + 0.66 * d + 0.12 * Math.max(0, dot(n, FILL)),
                 spec: (metal ? 0.9 : 0.5) * Math.pow(nh, 32),
                 rim: 0.45 * Math.pow(1 - Math.max(0, dot(n, view)), 3) };
      default:
        return { lum: 0.4 + 0.7 * d, spec: 0, rim: 0 };
    }
  }

  var FLAT_LEVELS = 6;

  /**
   * The fill for one lit surface: a colour string, or for 'flat' when the
   * light falls between two levels a dither pattern of the two (table3d's
   * ditherTile). fog is { colour: [r,g,b], amount }.
   */
  function fillFor(mode, rgb, lit, fog, T) {
    var lum = lit.lum, r, g, b;
    if (mode === 'flat') {
      var x = Math.max(0, Math.min(1, (lum - 0.4) / 0.75)) * (FLAT_LEVELS - 1);
      var lo = Math.floor(x), f = x - lo;
      var l0 = 0.4 + 0.75 * lo / (FLAT_LEVELS - 1);
      var c0 = rgbHex(rgb[0] * l0, rgb[1] * l0, rgb[2] * l0);
      if (f < 0.3 || f > 0.7 || lo >= FLAT_LEVELS - 1 || !T || !T.ditherTile) {
        var lq = f > 0.7 ? 0.4 + 0.75 * (lo + 1) / (FLAT_LEVELS - 1) : l0;
        return rgbHex(rgb[0] * lq, rgb[1] * lq, rgb[2] * lq);
      }
      var l1 = 0.4 + 0.75 * (lo + 1) / (FLAT_LEVELS - 1);
      var c1 = rgbHex(rgb[0] * l1, rgb[1] * l1, rgb[2] * l1);
      return T.ditherTile(c0, c1, 8, 2.5) || c0;
    }
    var s = lit.spec + lit.rim;
    r = rgb[0] * lum + (255 - rgb[0] * lum) * s;
    g = rgb[1] * lum + (255 - rgb[1] * lum) * s;
    b = rgb[2] * lum + (255 - rgb[2] * lum) * s;
    if (fog && fog.amount > 0) {
      r += (fog.colour[0] - r) * fog.amount;
      g += (fog.colour[1] - g) * fog.amount;
      b += (fog.colour[2] - b) * fog.amount;
    }
    return rgbHex(r, g, b);
  }

  // -------------------------------------------------------------- the list
  /**
   * Sort draw items far to near: the larger the depth along the view axis,
   * the earlier it is drawn. Ties keep their order. Sorts in place.
   */
  function sortItems(items) {
    for (var i = 0; i < items.length; i++) items[i].order = i;
    items.sort(function (a, b) { return (b.depth - a.depth) || (a.order - b.order); });
    return items;
  }

  /**
   * One figure's visible triangles as draw items. fig is
   * { model, world (placed vertices), mirror, ink, group }. Back faces are
   * dropped. Each item: { kind: 'tri', pts, depth, fill, lit, group, n }.
   */
  function figureItems(fig, cam, T, mode, opts, items) {
    var model = fig.model, v = fig.world, t = model.tris, mirror = fig.mirror;
    var eye = eyeOf(cam);
    var smooth = mode !== 'flat';
    var vn = smooth ? vertexNormals(model, v, mirror, fig.normals) : null;
    if (smooth) fig.normals = vn;
    var proj = new Array(model.count);
    for (var p = 0; p < model.count; p++) proj[p] = T.project(cam, v[p * 3], v[p * 3 + 1], v[p * 3 + 2]);
    var ink = fig.ink ? hexRgb(fig.ink) : null;
    var fog = opts.fog || null;
    var n = [0, 0, 0];
    for (var i = 0; i < t.length; i += 3) {
      var a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      faceNormal(v, a, b, c, n);
      n[0] *= mirror; n[1] *= mirror; n[2] *= mirror;
      var cx = (v[a] + v[b] + v[c]) / 3, cy = (v[a + 1] + v[b + 1] + v[c + 1]) / 3, cz = (v[a + 2] + v[b + 2] + v[c + 2]) / 3;
      var view = [eye[0] - cx, eye[1] - cy, eye[2] - cz];
      if (dot(n, view) <= 0) continue;                  // facing away
      var unit;
      if (smooth) {
        unit = norm([vn[a] + vn[b] + vn[c], vn[a + 1] + vn[b + 1] + vn[c + 1], vn[a + 2] + vn[b + 2] + vn[c + 2]]);
      } else {
        unit = norm(n);
      }
      var slot = model.colors[i / 3];
      var rgb = slot === model.ink && ink ? ink : model.palette[slot];
      var lit = light(mode, unit, norm(view), slot === model.ink);
      var fogAt = fog ? { colour: fog.rgb, amount: Math.min(fog.cap, T.fogAmount(cy, fog.spec)) } : null;
      var pa = proj[t[i]], pb = proj[t[i + 1]], pc = proj[t[i + 2]];
      items.push({
        kind: 'tri', group: fig.group, pts: [pa, pb, pc],
        depth: (pa.depth + pb.depth + pc.depth) / 3,
        fill: fillFor(mode, rgb, lit, fogAt, T), lit: lit
      });
    }
    return items;
  }

  /** The paddle as a slab over its hit rectangle: its visible faces as items. */
  function slabItems(rect, ink, cam, T, mode, opts, group, items) {
    var x0 = rect.x, x1 = rect.x + rect.w, y0 = rect.y, y1 = rect.y + rect.h, z0 = 0, z1 = opts.slabZ || SLAB_Z;
    var faces = [
      { n: [0, 0, 1], q: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },   // top
      { n: [0, 1, 0], q: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] },   // near
      { n: [0, -1, 0], q: [[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1]] },  // far
      { n: [-1, 0, 0], q: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]] },  // left
      { n: [1, 0, 0], q: [[x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]] }    // right
    ];
    var eye = eyeOf(cam), rgb = hexRgb(ink || '#c0c0c0');
    var fog = opts.fog || null;
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      var c = [0, 0, 0];
      for (var j = 0; j < 4; j++) { c[0] += f.q[j][0] / 4; c[1] += f.q[j][1] / 4; c[2] += f.q[j][2] / 4; }
      var view = [eye[0] - c[0], eye[1] - c[1], eye[2] - c[2]];
      if (dot(f.n, view) <= 0) continue;
      var pts = f.q.map(function (q) { return T.project(cam, q[0], q[1], q[2]); });
      var lit = light(mode, f.n, norm(view), true);
      var fogAt = fog ? { colour: fog.rgb, amount: Math.min(fog.cap, T.fogAmount(c[1], fog.spec)) } : null;
      var depth = 0;
      for (var k = 0; k < 4; k++) depth += pts[k].depth / 4;
      items.push({ kind: 'slab', group: group, pts: pts, depth: depth, fill: fillFor(mode, rgb, lit, fogAt, T), lit: lit });
    }
    return items;
  }

  /** Screen-space bounds of a list of items. */
  function boundsOf(items) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (var i = 0; i < items.length; i++) {
      var p = items[i].pts;
      for (var j = 0; j < p.length; j++) {
        if (p[j].x < b.x0) b.x0 = p[j].x;
        if (p[j].x > b.x1) b.x1 = p[j].x;
        if (p[j].y < b.y0) b.y0 = p[j].y;
        if (p[j].y > b.y1) b.y1 = p[j].y;
      }
    }
    return b;
  }

  /**
   * Every item of a scene, sorted far to near. scene is
   * { figures: [...], slabs: [{ rect, ink, group }], ball: { x, y, r, depth, fill } | null }.
   * The ball goes into the list only where its disc overlaps a figure or slab
   * on screen: the era has drawn it already, and it is drawn again only where
   * something of ours would otherwise cover it wrongly.
   */
  function buildScene(scene, cam, T, mode, opts) {
    opts = opts || {};
    var items = [];
    for (var i = 0; i < scene.figures.length; i++) figureItems(scene.figures[i], cam, T, mode, opts, items);
    for (var s = 0; s < (scene.slabs || []).length; s++) {
      var sl = scene.slabs[s];
      slabItems(sl.rect, sl.ink, cam, T, mode, opts, sl.group, items);
    }
    var ball = scene.ball;
    if (ball && items.length) {
      var bb = boundsOf(items);
      if (ball.x + ball.r > bb.x0 && ball.x - ball.r < bb.x1 && ball.y + ball.r > bb.y0 && ball.y - ball.r < bb.y1) {
        items.push({ kind: 'ball', group: -1, pts: [ball], depth: ball.depth, fill: ball.fill || '#ffffff', r: ball.r });
      }
    }
    return sortItems(items);
  }

  // -------------------------------------------------------------- drawing
  function trace(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  /** A hard shadow blob on the floor under a figure (the Xbox's). */
  function shadowBlob(ctx, cam, T, at, radius) {
    var c = T.project(cam, at.x, at.y, 0);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, Math.max(0.05, cam.cos));
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.5, radius * c.scale), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw a scene built by buildScene onto ctx. The modes' extras: soft edges
   * (gouraud: each triangle stroked in its own colour), the ink outline (cel:
   * every item stroked wide in ink before any is filled, so only the
   * silhouette's outer half shows), and the glow (hd: the brightest faces
   * filled again with 'lighter').
   */
  function drawItems(ctx, items, mode, opts) {
    opts = opts || {};
    if (mode === 'cel' && opts.outline) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = opts.outline.colour;
      for (var o = 0; o < items.length; o++) {
        var it = items[o];
        if (it.kind === 'ball') continue;
        trace(ctx, it.pts);
        ctx.lineWidth = 2 * opts.outline.width * it.pts[0].scale;
        ctx.stroke();
      }
    }
    var soft = mode === 'gouraud';
    if (soft) { ctx.lineJoin = 'round'; }
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.kind === 'ball') {
        ctx.beginPath();
        ctx.arc(item.pts[0].x, item.pts[0].y, Math.max(0.5, item.r), 0, Math.PI * 2);
        ctx.fillStyle = item.fill;
        ctx.fill();
        continue;
      }
      trace(ctx, item.pts);
      ctx.fillStyle = item.fill;
      ctx.fill();
      if (soft) {
        ctx.strokeStyle = item.fill;
        ctx.lineWidth = 1.2 * item.pts[0].scale;
        ctx.stroke();
      }
    }
    if (mode === 'hd') {
      var prevOp = ctx.globalCompositeOperation, prevA = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      for (var h = 0; h < items.length; h++) {
        var g = items[h];
        var glow = g.lit ? g.lit.spec + g.lit.rim : 0;
        if (g.kind === 'ball' || glow < 0.35) continue;
        ctx.globalAlpha = prevA * Math.min(0.6, glow * 0.6);
        trace(ctx, g.pts);
        ctx.fillStyle = '#fff4dc';
        ctx.fill();
      }
      ctx.globalCompositeOperation = prevOp;
      ctx.globalAlpha = prevA;
    }
    return items.length;
  }

  /**
   * The whole job for one frame: both figures and both slabs, sorted and
   * drawn. figures: [{ model, pose (a blended vertex set), anchor {x,y,z},
   * mirror, scale, ink, rect, group }]. opts: { mode, fog (an era's fog spec),
   * outline ({ width, colour }), ball ({ x, y, r, depth, fill }), shadow }.
   * Answers the number of items drawn.
   */
  function drawScene(ctx, T, cam, figures, opts) {
    opts = opts || {};
    var mode = MODES.indexOf(opts.mode) >= 0 ? opts.mode : 'flat';
    var fog = opts.fog && opts.fog.colour ? { spec: opts.fog, rgb: hexRgb(opts.fog.colour), cap: opts.fogCap === undefined ? 0.6 : opts.fogCap } : null;
    var scene = { figures: [], slabs: [], ball: opts.ball || null };
    for (var i = 0; i < figures.length; i++) {
      var f = figures[i];
      f.world = place(f.model, f.pose, f.anchor, f.mirror, f.scale, f.world);
      scene.figures.push(f);
      if (f.rect) scene.slabs.push({ rect: f.rect, ink: f.ink, group: f.group });
    }
    if (mode === 'vertex' || opts.shadow) {
      for (var s = 0; s < figures.length; s++) {
        var fg = figures[s];
        shadowBlob(ctx, cam, T, { x: fg.anchor.x - fg.mirror * fg.model.hand[0] * (fg.scale || 1), y: fg.anchor.y - fg.model.hand[1] * (fg.scale || 1) }, 16 * (fg.scale || 1));
      }
    }
    var items = buildScene(scene, cam, T, mode, { fog: fog, slabZ: opts.slabZ });
    return drawItems(ctx, items, mode, { outline: opts.outline });
  }

  var api = {
    FORMAT: FORMAT,
    BEATS: BEATS,
    MODES: MODES,
    DIR: DIR,
    SLAB_Z: SLAB_Z,
    SWING_S: SWING_S,
    REACT_S: REACT_S,
    parse: parse,
    register: register,
    get: get,
    loadFile: loadFile,
    signedVolume: signedVolume,
    keyframes: keyframes,
    blend: blend,
    place: place,
    eyeOf: eyeOf,
    vertexNormals: vertexNormals,
    light: light,
    fillFor: fillFor,
    sortItems: sortItems,
    figureItems: figureItems,
    slabItems: slabItems,
    buildScene: buildScene,
    drawItems: drawItems,
    drawScene: drawScene
  };

  root.PongModels3D = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
