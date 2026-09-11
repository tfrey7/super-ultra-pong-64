/*
 * Super Ultra Pong 64: Remastered -- the shared 3D table (docs/ERAS.md, section 2).
 *
 * The 3D eras (5 to 10) do not simulate anything in 3D. The rules' flat
 * 800 x 600 field is a table lying on the floor of a scene, and this file is
 * the one camera and the handful of polygon helpers that draw the SAME 2D
 * state onto it: paddles are boxes standing on their exact collision
 * rectangles, the ball stands on its footprint with a contact shadow under it.
 *
 *   field x  0 (the player's wall, left) .. 800
 *   field y  0 (the top wall, the FAR edge) .. 600 (the bottom wall, the NEAR edge)
 *   z        height up off the table, in the same units
 *
 * Canvas 2D, no per-pixel loops: paths, gradients, and tiles built once from
 * rectangles. It reads nothing but its arguments and writes no state. Since
 * item 1273 field() hands the table, net, bats and ball to the real 3D layer
 * (src/field3d.js, three.js on WebGL) when the page has one, and everything
 * below is the fallback it paints when it does not.
 *
 * UMD like src/game.js: window.PongTable3D in the page (loaded after
 * src/render.js and before the era files), require('../src/table3d.js') under
 * node --test, and PongRender.table3d either way, so an era's draw reaches it
 * as api.table3d.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PongTable3D = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var W = 800;
  var H = 600;
  var RAD = Math.PI / 180;

  // ---------------------------------------------------------------- camera
  /**
   * A camera from the numbers an era gives. The derived fields are what
   * project() reads; building a fresh one every frame is cheap.
   */
  function camera(spec) {
    spec = spec || {};
    var tilt = spec.tilt || 0;
    var t = tilt * RAD;
    var fov = spec.fov === undefined ? 30 : spec.fov;
    var cam = {
      tilt: tilt,
      height: spec.height,
      fov: fov,
      screenY: spec.screenY === undefined ? H / 2 : spec.screenY,
      panX: spec.panX || 0,
      snap: spec.snap || 0,
      outline: spec.outline || null,
      sin: Math.sin(t),
      cos: Math.cos(t),
      focal: (H / 2) / Math.tan((fov * RAD) / 2),
      view: { w: W, h: H }
    };
    if (cam.height === undefined) cam.height = cam.focal;
    cam.back = cam.height * Math.tan(t);     // how far in front of the table centre the eye stands
    cam.distance = cam.height / cam.cos;     // eye to the table centre
    return cam;
  }

  /** Field point to screen: { x, y, scale (px per field unit there), depth }. */
  function project(cam, x, y, z) {
    var X = x - W / 2 - cam.panX;
    var Y = H / 2 - y + cam.back;              // toward the far wall is +Y
    var Z = (z || 0) - cam.height;
    var yc = Y * cam.cos + Z * cam.sin;        // up, in the camera's frame
    var zc = Y * cam.sin - Z * cam.cos;        // depth along the view axis
    var k = cam.focal / zc;
    var sx = W / 2 + X * k;
    var sy = cam.screenY - yc * k;
    if (cam.snap > 0) {
      sx = Math.round(sx / cam.snap) * cam.snap;
      sy = Math.round(sy / cam.snap) * cam.snap;
    }
    return { x: sx, y: sy, scale: k, depth: zc };
  }

  // --------------------------------------------------------------- colours
  function parse(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function toHex(ch) {
    return '#' + ((1 << 24) | (ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).slice(1);
  }

  function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }

  /** Blend a #rrggbb toward white (t > 0) or black (t < 0): era 4's shade. */
  function shade(hex, t) {
    if (!isHex(hex) || !t) return hex;
    var end = t > 0 ? 255 : 0;
    var a = Math.min(1, Math.abs(t));
    return toHex(parse(hex).map(function (c) { return Math.round(c + (end - c) * a); }));
  }

  /** '#rrggbb' part way from a to b. */
  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t || 0));
    var pa = parse(a), pb = parse(b);
    return toHex([0, 1, 2].map(function (i) { return Math.round(pa[i] + (pb[i] - pa[i]) * t); }));
  }

  function rgba(hex, a) {
    var p = parse(hex);
    return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }

  // ----------------------------------------------------------------- paths
  function projectAll(cam, points) {
    return points.map(function (p) { return project(cam, p[0], p[1], p[2]); });
  }

  function tracePath(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i].x, pts[i].y);
      else ctx.moveTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  }

  /** Begin and close a path through projected points; no fill. T.path(...); ctx.clip(). */
  function path(ctx, cam, points) {
    var pts = projectAll(cam, points);
    tracePath(ctx, pts);
    return pts;
  }

  var DEFAULT_LIGHT = { top: 0.25, near: 0, side: -0.35 };

  function screenSpan(pts) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].y < lo) lo = pts[i].y;
      if (pts[i].y > hi) hi = pts[i].y;
    }
    return { top: lo, bottom: hi === lo ? lo + 1 : hi };
  }

  /** The fillStyle for one face under a style (docs/ERAS.md 2.4). */
  function faceFill(ctx, face, pts, style) {
    if (typeof style.fill === 'function') return style.fill(face, pts);
    if (style.fill) return style.fill;
    var light = Object.assign({}, DEFAULT_LIGHT, style.light || {});
    var ink = shade(style.ink || '#ffffff', face === 'shape' ? 0 : light[face] || 0);
    var mode = style.shade || 'flat';
    if (mode === 'flat' || !isHex(ink)) return ink;
    var span = screenSpan(pts);
    var g = ctx.createLinearGradient(0, span.top, 0, span.bottom);
    if (mode === 'gradient') {
      g.addColorStop(0, shade(ink, 0.2));
      g.addColorStop(1, shade(ink, -0.3));
      return g;
    }
    // 'banded': hard-edged bands, lit to dark, top of the face to bottom. The
    // first edge sits 40% down a two-band face (the cel look), and the rest
    // share what is left evenly.
    var n = Math.max(1, Math.floor(style.bands || 2));
    var edge = function (j) { return j <= 0 ? 0 : j >= n ? 1 : (n === 2 ? 0.4 : j / n); };
    for (var i = 0; i < n; i++) {
      var c = n === 1 ? ink : shade(ink, 0.15 - 0.45 * i / (n - 1));
      g.addColorStop(edge(i), c);
      g.addColorStop(edge(i + 1), c);
    }
    return g;
  }

  function outlineOf(cam, style) {
    if (style && style.outline === false) return null;
    return (style && style.outline) || cam.outline || null;
  }

  /**
   * Fill (and outline) the path already traced through pts. Outline mode
   * strokes first at twice the width, so the fill covers the inner half and
   * the ink sits outside the silhouette.
   */
  function paint(ctx, cam, pts, face, style) {
    style = style || {};
    var alpha = style.alpha;
    var prevAlpha = ctx.globalAlpha;
    if (alpha !== undefined) ctx.globalAlpha = prevAlpha * alpha;
    var line = outlineOf(cam, style);
    if (line && pts.length) {
      ctx.lineWidth = 2 * line.width * pts[0].scale;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = line.colour;
      ctx.stroke();
    }
    ctx.fillStyle = faceFill(ctx, face, pts, style);
    ctx.fill();
    if (alpha !== undefined) ctx.globalAlpha = prevAlpha;
  }

  // --------------------------------------------------------------- helpers
  /** A filled polygon of 3 or more table points. */
  function quad(ctx, cam, points, style) {
    var pts = path(ctx, cam, points);
    paint(ctx, cam, pts, 'shape', style);
    return pts;
  }

  /**
   * A box standing on the table over footprint rect, from z0 to z1. Draws only
   * the faces the eye can see: the side facing the eye (if any), the near face,
   * then the top. side is null when neither side face shows.
   */
  function box(ctx, cam, rect, z0, z1, style) {
    var x0 = rect.x, x1 = rect.x + rect.w, y0 = rect.y, y1 = rect.y + rect.h;
    var mid = W / 2 + cam.panX;
    var out = { top: null, near: null, side: null };
    var sideX = x1 < mid ? x1 : (x0 > mid ? x0 : null);
    if (sideX !== null) {
      out.side = path(ctx, cam, [[sideX, y0, z0], [sideX, y1, z0], [sideX, y1, z1], [sideX, y0, z1]]);
      paint(ctx, cam, out.side, 'side', style);
      if (style && style.texture) texturePart(ctx, out.side, style.texture);
    }
    out.near = path(ctx, cam, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
    paint(ctx, cam, out.near, 'near', style);
    if (style && style.texture) texturePart(ctx, out.near, style.texture);
    out.top = path(ctx, cam, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
    paint(ctx, cam, out.top, 'top', style);
    if (style && style.texture) texturePart(ctx, out.top, style.texture);
    return out;
  }

  function ballAt(cam, ball, radius) {
    var cx = ball.x + ball.size / 2;
    var cy = ball.y + ball.size / 2;
    var r = ball.size * (radius || 0.6);
    var foot = project(cam, cx, cy, 0);
    var centre = project(cam, cx, cy, r);
    return { x: centre.x, y: centre.y, r: r * centre.scale, footX: foot.x, footY: foot.y, footR: r * foot.scale };
  }

  /** Where the ball is on screen: a pure function of the camera and the state. */
  function ballScreen(cam, state) {
    var s = ballAt(cam, state.ball);
    return { x: s.x, y: s.y, r: s.r, footX: s.footX, footY: s.footY };
  }

  /** The ball standing on the table, its contact shadow first. */
  function ball(ctx, cam, b, style) {
    style = style || {};
    var s = ballAt(cam, b, style.radius);
    var prevAlpha = ctx.globalAlpha;
    if (style.alpha !== undefined) ctx.globalAlpha = prevAlpha * style.alpha;

    // The contact shadow: an ellipse at the true footprint (rule R5). Drawn as a
    // scaled circle so it needs nothing past arc().
    ctx.save();
    ctx.translate(s.footX, s.footY);
    ctx.scale(1, Math.max(0.05, cam.cos));
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.5, s.footR), 0, Math.PI * 2);
    ctx.fillStyle = style.shadow || 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(0.5, s.r), 0, Math.PI * 2);
    var line = outlineOf(cam, style);
    if (line) {
      ctx.lineWidth = 2 * line.width * s.footR / (b.size * (style.radius || 0.6));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = line.colour;
      ctx.stroke();
    }
    ctx.fillStyle = typeof style.fill === 'function' ? style.fill(s.x, s.y, s.r)
      : (style.fill || style.ink || '#ffffff');
    ctx.fill();
    if (style.texture) ballTexture(ctx, s, b, style.texture, style.radius);
    if (style.alpha !== undefined) ctx.globalAlpha = prevAlpha;
    return { x: s.x, y: s.y, r: s.r, footX: s.footX, footY: s.footY };
  }

  var TABLE_DEFAULTS = {
    surface: '#203048', line: '#9aa3b5', rail: '#8a8f9c', railTop: '#b4b8c2', nearLip: '#4a4e59'
  };

  /** One table shape: a colour through paint(), or a function that fills it itself. */
  function tablePart(ctx, cam, points, fill, face) {
    if (typeof fill === 'function') {
      var pts = projectAll(cam, points);
      fill(ctx, cam, pts);
      return pts;
    }
    var traced = path(ctx, cam, points);
    paint(ctx, cam, traced, face || 'shape', { fill: fill, outline: face === 'mark' ? false : undefined });
    return traced;
  }

  /**
   * The court: surface, the centre line as 6-wide dashes (20 on, 16 off, the 2D
   * line exactly), the far rail as a box from z 0 to 22, and the near rail as a
   * FLAT strip (rule R6). The centre-line dashes are paint on the surface and
   * never take the outline.
   */
  function table(ctx, cam, style) {
    var s = Object.assign({}, TABLE_DEFAULTS, style || {});
    var out = { surface: null, line: [], farRail: { near: null, top: null }, nearLip: null };
    out.surface = tablePart(ctx, cam, [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]], s.surface);
    if (s.texture) courtTexture(ctx, cam, s.texture);
    var lx = (W - 6) / 2;
    for (var y = 6; y < H; y += 36) {
      var y1 = Math.min(y + 20, H);
      out.line.push(tablePart(ctx, cam, [[lx, y, 0], [lx + 6, y, 0], [lx + 6, y1, 0], [lx, y1, 0]], s.line, 'mark'));
    }
    // The far rail (0, -18, 800, 18), z 0 to 22: it spans the centre, so no side face.
    out.farRail.near = tablePart(ctx, cam, [[0, 0, 0], [W, 0, 0], [W, 0, 22], [0, 0, 22]], s.rail);
    out.farRail.top = tablePart(ctx, cam, [[0, -18, 22], [W, -18, 22], [W, 0, 22], [0, 0, 22]], s.railTop);
    out.nearLip = tablePart(ctx, cam, [[0, H, 0], [W, H, 0], [W, H + 10, 0], [0, H + 10, 0]], s.nearLip);
    if (s.trim) {
      texturePart(ctx, out.farRail.near, s.trim);
      texturePart(ctx, out.farRail.top, s.trim);
      texturePart(ctx, out.nearLip, s.trim);
    }
    return out;
  }

  /**
   * The field, through the real 3D layer (src/field3d.js, item 1273) when the
   * page has WebGL: the table, its centre line, the net, both bats, the ball
   * and its shadow, rendered lit and copied into ctx exactly where table()
   * paints -- the same camera, the same field-to-screen mapping. Answers true
   * when it drew, and the era then skips its own paddles and ball; otherwise it
   * paints table() and answers false, so today's canvas drawing is the
   * fallback (no WebGL, ?gl=off, node --test). style is table()'s; its #rrggbb
   * surface, line and rail colour the slab. The era's `render` knobs ride along.
   */
  function field(ctx, cam, style, state, api) {
    var F = root.PongField3D;
    if (F && typeof F.draw === 'function' && state) {
      var s = style || {};
      var look = api && typeof api.eraLook === 'function' ? api.eraLook(state.era) : {};
      var ink = api && typeof api.paddleInk === 'function'
        ? { left: api.paddleInk(state, 'left'), right: api.paddleInk(state, 'right') } : null;
      if (F.draw(ctx, cam, state, { surface: s.surface, line: s.line, rail: s.rail, ink: ink, render: look.render })) return true;
    }
    table(ctx, cam, style);
    return false;
  }

  // ------------------------------------------------------------------- fog
  /** 0 at the near edge, 1 at the far edge (and past), shaped by the fog spec. */
  function fogAmount(y, fog) {
    var d = (H - y) / H;
    var span = (fog.end - fog.start) || 1;
    var a = Math.max(0, Math.min(1, (d - fog.start) / span));
    return Math.pow(a, fog.power || 1) * (fog.max === undefined ? 1 : fog.max);
  }

  function fogColour(hex, y, fog) {
    return mix(hex, fog.colour, fogAmount(y, fog));
  }

  /** One vertical gradient over the table: thickest at the far edge, gone at fog.start. */
  function fogBand(ctx, cam, fog) {
    var yStart = H - fog.start * H;
    var farY = project(cam, W / 2, 0, 0).y;
    var startY = project(cam, W / 2, yStart, 0).y;
    var g = ctx.createLinearGradient(0, farY, 0, startY);
    for (var i = 0; i <= 4; i++) {
      var fy = yStart * i / 4;                  // 0 (far edge) .. yStart
      g.addColorStop(i / 4, rgba(fog.colour, fogAmount(fy, fog)));
    }
    path(ctx, cam, [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]]);
    ctx.fillStyle = g;
    ctx.fill();
    return g;
  }

  // ----------------------------------------------------- tiles and buffers
  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var TILES = {};
  var BUFFERS = {};

  function hasDocument() {
    return typeof root.document !== 'undefined' && root.document && typeof root.document.createElement === 'function';
  }

  /**
   * A 4 x 4 ordered-dither pattern of two colours: a cell whose BAYER4 value is
   * below level (0..16) is b, the rest a. Built once per key from 16 fillRects.
   * Null with no document (node --test).
   */
  function ditherTile(a, b, level, cell) {
    cell = cell || 1;
    var key = a + b + level + cell;
    if (TILES[key]) return TILES[key];
    if (!hasDocument()) return null;
    var canvas = root.document.createElement('canvas');
    canvas.width = canvas.height = Math.max(1, Math.round(4 * cell));
    var c = canvas.getContext('2d');
    if (!c) return null;
    for (var i = 0; i < 16; i++) {
      c.fillStyle = BAYER4[i] < level ? b : a;
      c.fillRect((i % 4) * cell, Math.floor(i / 4) * cell, cell, cell);
    }
    TILES[key] = c.createPattern(canvas, 'repeat');
    return TILES[key];
  }

  /** A named offscreen canvas, made once and reused; null with no document. */
  function offscreen(key, w, h) {
    if (!hasDocument()) return null;
    var buf = BUFFERS[key];
    if (!buf) {
      var canvas = root.document.createElement('canvas');
      var c = canvas.getContext('2d');
      if (!c) return null;
      buf = BUFFERS[key] = { canvas: canvas, ctx: c };
    }
    if (buf.canvas.width !== w) buf.canvas.width = w;
    if (buf.canvas.height !== h) buf.canvas.height = h;
    return buf;
  }

  // -------------------------------------------------------------- textures
  // Pixel-art tiles from pixellab.ai (item 1187), handed over as data: URIs by
  // src/textures3d.js (window.PongTextures3D.TILES) so the canvas of a page
  // opened off disk stays readable. A texture is laid OVER a surface the era
  // has already painted, through a blend mode (overlay by default) at an alpha,
  // so the era's own palette, lighting and treatment stay what they were and
  // the tile adds grain, tread or stitching on top. Nothing loops over pixels:
  // a tile is mirrored 2 x 2 once with four drawImage calls (which makes it
  // seamless), the court is one strip-mapped canvas built once per camera and
  // canvas size, and paddles, rails and the ball take a pattern.
  //
  //   texture spec: { name: 'court-grain', alpha: 0.5, blend: 'overlay',
  //                   period: 64,        field units one mirrored tile spans
  //                   strip: 2,          court only: device px per strip
  //                   fade: 0.6,         court only: alpha lost by the far edge
  //                   smooth: false }    bilinear (true) or blocky (false)
  //
  // Headless (no document or no Image), before a tile has decoded, or with no
  // such tile, every helper draws nothing and answers false/null: the era's
  // plain surface is the fallback, and the recorded draw calls do not change.
  var TEX = {};
  var COURTS = {};
  var COURT_KEYS = [];
  var COURT_CACHE = 12;

  function texSource(name) {
    var t = root.PongTextures3D && root.PongTextures3D.TILES;
    return (t && typeof name === 'string' && t[name]) || null;
  }

  /** The decoded, mirrored tile for a name, or null. */
  function textureTile(name) {
    if (!hasDocument() || typeof root.Image !== 'function') return null;
    var t = TEX[name];
    if (!t) {
      var src = texSource(name);
      if (!src) return null;
      t = TEX[name] = { image: new root.Image(), tile: null, pattern: null, field: {} };
      t.image.src = src;
    }
    if (t.tile) return t;
    var img = t.image;
    if (!img.complete || !(img.naturalWidth > 0)) return null;
    var w = img.naturalWidth, h = img.naturalHeight;
    var canvas = root.document.createElement('canvas');
    canvas.width = 2 * w;
    canvas.height = 2 * h;
    var c = canvas.getContext('2d');
    if (!c) return null;
    c.imageSmoothingEnabled = false;
    for (var i = 0; i < 4; i++) {
      var fx = i & 1, fy = i >> 1;
      c.setTransform(fx ? -1 : 1, 0, 0, fy ? -1 : 1, fx ? 2 * w : 0, fy ? 2 * h : 0);
      c.drawImage(img, 0, 0);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    t.tile = canvas;
    return t;
  }

  /** True once a texture name can draw (for tests and eras that care). */
  function textureReady(name) { return !!textureTile(name); }

  /** Start decoding every tile now, so the first 3D frame has them. */
  function preloadTextures() {
    var t = root.PongTextures3D && root.PongTextures3D.TILES;
    if (t) Object.keys(t).forEach(textureTile);
  }

  function blendIn(ctx, tex) {
    ctx.globalCompositeOperation = tex.blend || 'overlay';
    ctx.globalAlpha = ctx.globalAlpha * (tex.alpha === undefined ? 0.5 : tex.alpha);
    ctx.imageSmoothingEnabled = !!tex.smooth;
  }

  /**
   * Lay a texture over the path already traced through pts (a face, a rail),
   * anchored at pts[0] so it travels with the shape. k is screen px per field
   * unit there. Answers true when it drew.
   */
  function overlayPath(ctx, pts, tex, k) {
    var t = tex && textureTile(tex.name);
    if (!t || !pts || !pts.length || typeof ctx.createPattern !== 'function') return false;
    var pat = t.pattern || (t.pattern = ctx.createPattern(t.tile, 'repeat'));
    if (!pat) return false;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      x0 = Math.min(x0, pts[i].x); x1 = Math.max(x1, pts[i].x);
      y0 = Math.min(y0, pts[i].y); y1 = Math.max(y1, pts[i].y);
    }
    var s = Math.max(0.05, (tex.period || 32) * (k || 1) / t.tile.width);
    ctx.save();
    ctx.clip();
    blendIn(ctx, tex);
    ctx.translate(pts[0].x, pts[0].y);
    ctx.scale(s, s);
    ctx.fillStyle = pat;
    ctx.fillRect((x0 - pts[0].x) / s - 1, (y0 - pts[0].y) / s - 1, (x1 - x0) / s + 2, (y1 - y0) / s + 2);
    ctx.restore();
    return true;
  }

  /** Trace pts and lay a texture over them: a face or a rail. */
  function texturePart(ctx, pts, tex) {
    if (!tex || !pts || !pts.length || !textureTile(tex.name)) return false;
    tracePath(ctx, pts);
    return overlayPath(ctx, pts, tex, pts[0].scale);
  }

  /** The field y the floor shows at screen row sy (the inverse of project at z 0). */
  function floorYAt(cam, sy) {
    var u = (cam.screenY - sy) / cam.focal;
    var Y = cam.height * (cam.sin + u * cam.cos) / (cam.cos - u * cam.sin);
    return H / 2 + cam.back - Y;
  }

  /** The texture laid flat over the whole field, 1 px per field unit, built once. */
  function fieldTexture(t, tex) {
    var key = (tex.period || 64) + (tex.smooth ? 's' : 'b');
    if (t.field[key]) return t.field[key];
    var canvas = root.document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var c = canvas.getContext('2d');
    if (!c) return null;
    var s = (tex.period || 64) / t.tile.width;
    c.imageSmoothingEnabled = !!tex.smooth;
    c.scale(s, s);
    c.fillStyle = c.createPattern(t.tile, 'repeat');
    c.fillRect(0, 0, W / s, H / s);
    t.field[key] = canvas;
    return canvas;
  }

  /**
   * The court's texture in perspective, as the PlayStation did it: the floor
   * cut into horizontal screen strips, each an affine copy of one band of the
   * flat field texture scaled to the width the camera gives that depth. Built
   * once per camera, texture and canvas size and kept; a frame is then one
   * drawImage.
   */
  function courtCanvas(ctx, cam, tex, t) {
    var d = 1;
    if (typeof ctx.getTransform === 'function') {
      var m = ctx.getTransform();
      d = Math.max(0.1, Math.sqrt(m.a * m.a + m.b * m.b)) || 1;
    }
    var cw = Math.max(1, Math.round(W * d)), ch = Math.max(1, Math.round(H * d));
    var strip = Math.max(1, Math.round(tex.strip || 2));
    var key = [tex.name, tex.period, strip, tex.fade || 0, tex.smooth ? 1 : 0,
      cam.tilt, cam.height, cam.fov, cam.screenY, cam.panX, cw, ch].join('|');
    if (COURTS[key]) return COURTS[key];
    var field = fieldTexture(t, tex);
    if (!field) return null;
    // A drifting camera (the PS2's) misses every frame: past the cache's size
    // the oldest canvas is cleared and reused rather than a new one made.
    var canvas = null;
    if (COURT_KEYS.length >= COURT_CACHE) {
      var old = COURT_KEYS.shift();
      canvas = COURTS[old];
      delete COURTS[old];
    }
    if (!canvas) canvas = root.document.createElement('canvas');
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    var c = canvas.getContext('2d');
    if (!c) return null;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, cw, ch);
    c.imageSmoothingEnabled = !!tex.smooth;
    var top = Math.max(0, Math.floor(project(cam, W / 2, 0, 0).y * d));
    var bottom = Math.min(ch, Math.ceil(project(cam, W / 2, H, 0).y * d));
    for (var sy = top; sy < bottom; sy += strip) {
      var ya = Math.max(0, floorYAt(cam, sy / d));
      var yb = Math.min(H, floorYAt(cam, (sy + strip) / d));
      if (!(yb > ya)) continue;
      var mid = project(cam, 0, (ya + yb) / 2, 0);
      c.globalAlpha = 1 - (tex.fade || 0) * (1 - (ya + yb) / 2 / H);
      c.drawImage(field, 0, ya, W, yb - ya, mid.x * d, sy, W * mid.scale * d, strip);
    }
    COURTS[key] = canvas;
    COURT_KEYS.push(key);
    return canvas;
  }

  /** Lay a texture over the court surface (already painted). Answers true when it drew. */
  function courtTexture(ctx, cam, tex) {
    var t = tex && textureTile(tex.name);
    if (!t) return false;
    var canvas = courtCanvas(ctx, cam, tex, t);
    if (!canvas) return false;
    ctx.save();
    blendIn(ctx, tex);
    ctx.drawImage(canvas, 0, 0, W, H);
    ctx.restore();
    return true;
  }

  /** Lay a texture over the ball's disc, anchored to the ball so it rides with it. */
  function ballTexture(ctx, s, b, tex, radius) {
    if (!tex || !textureTile(tex.name)) return false;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(0.5, s.r), 0, Math.PI * 2);
    var k = s.r / Math.max(0.01, b.size * (radius || 0.6));
    return overlayPath(ctx, [{ x: s.x - s.r, y: s.y - s.r }, { x: s.x + s.r, y: s.y + s.r }], tex, k);
  }

  preloadTextures();

  return {
    W: W,
    H: H,
    camera: camera,
    project: project,
    path: path,
    quad: quad,
    box: box,
    ball: ball,
    ballScreen: ballScreen,
    table: table,
    field: field,
    shade: shade,
    mix: mix,
    rgba: rgba,
    fogAmount: fogAmount,
    fogColour: fogColour,
    fogBand: fogBand,
    BAYER4: BAYER4,
    ditherTile: ditherTile,
    offscreen: offscreen,
    textureReady: textureReady,
    textureOver: texturePart,
    courtTexture: courtTexture,
    floorYAt: floorYAt
  };
});
