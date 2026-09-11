/*
 * Era 5 -- 1994 Sony PlayStation (docs/ERAS.md chapter 6, card 1145).
 *
 * The first 3D most people owned, and it wobbled. Every flaw of that machine is
 * drawn on purpose, and exaggerated:
 *
 *   1. 320 x 240 chunkiness. Backdrop, table, shadow, paddles and the score are
 *      drawn into a 320 x 240 buffer (field units still address it through a
 *      0.4 transform) and copied up to the canvas with smoothing OFF, so every
 *      chunk is 2.5 pixels and hard-edged.
 *   2. Affine texture swim. The table is textured through only 8 big triangles,
 *      each mapped with ONE affine transform and no perspective correction, so
 *      the checker kinks along every diagonal and slides as the camera moves.
 *   3. Vertex snapping. The camera rounds every projected vertex to the 2.5
 *      pixel chunk grid, and it wobbles a little every frame, so edges pop
 *      between chunks constantly, even on a still rally.
 *   4. Flat and Gouraud shading. Paddles are flat-shaded boxes (one colour a
 *      face, a stippled sheen on top); the rails are Gouraud gradients; the ball
 *      is a low-poly gem of 8 facets.
 *   5. Ordered dithering. The backdrop ramp is 6 flat bands with Bayer-stippled
 *      seams, and a pool of light on the table is 3 stippled bands.
 *   6. Seam sparkle. The triangles are clipped and filled separately with no base
 *      fill under them, so a snapped edge leaves a hairline of void showing.
 *
 * Readability (bible section 5) is kept: the ball is drawn last, at full
 * resolution, never in the buffer, and its brightest facet is the only white on
 * screen (R1, R2); paddles stand on their exact collision rectangles and are
 * snapped but never smoothed (R4, R5); the score sits above the far edge (R8).
 * The camera at rest is the pose section 12 measures, and the wobble is the
 * chapter's own amplitude. Canvas 2D only, no per-pixel loops: the texture and
 * dither tiles are built once from rectangles.
 *
 * Control is untouched (bible rule 1.2) and the attract rally keeps the stock
 * dimmed frame. With no document (node --test) there is no buffer and no tile,
 * and the same scene is drawn straight onto the canvas in flat colours.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // The bible's camera at rest (section 12 measures this pose), and the per-frame
  // wobble and vertex snap chapter 6 puts on top of it.
  var CAMERA = { tilt: 30, height: 1550, fov: 26.5, screenY: 388 };   // the ladder camera (item 1266)
  var MOTION = { snap: 2.5, height: 6, heightRate: 1.3, pan: 1.5, panRate: 2.1 };
  var BUFFER = { key: 'ps1', w: 320, h: 240, scale: 0.4 };

  var PAL = {
    void: '#07070c',
    base: '#2b3a55',
    texLight: '#3c4f78',
    texDark: '#24324f',
    scuff: '#1a2236',
    rail: '#8a8f9c',
    railShadow: '#4a4e59',
    line: '#7d879c',              // the centre line: well under the ball's white (R1)
    pool: '#4b5f8f',              // the stippled pool of light on the table
    accents: ['#e03a3e', '#f3c300', '#00a99d', '#2e6db4'],
    ball: '#ffffff',
    facetLight: '#dcdcdc',
    facetDark: '#b4b4b4',
    hud: '#e8e8e8',
    hudShadow: '#000000'
  };

  var PADDLE = { z: 22, light: { top: 0.3, near: 0, side: -0.4 } };

  // The texture: a 64 x 64 tile, an 8 x 8 checker of the two texture colours and
  // one diagonal scuff, repeated 4 times across the table's width.
  var TEX = { size: 64, cells: 8, repeats: 4 };
  var UV = TEX.size * TEX.repeats / 800;

  // The table cut into 2 x 2 quads, 8 triangles: big triangles, big kinks.
  var TRIANGLES = (function () {
    var out = [];
    for (var j = 0; j < 2; j++) {
      for (var i = 0; i < 2; i++) {
        var x0 = 400 * i, x1 = x0 + 400, y0 = 300 * j, y1 = y0 + 300;
        out.push([[x0, y0], [x1, y0], [x1, y1]]);
        out.push([[x0, y0], [x1, y1], [x0, y1]]);
      }
    }
    return out;
  })();

  // The pool of light: three nested bands, densest in the middle.
  var POOL = [{ rx: 340, ry: 250, level: 4 }, { rx: 240, ry: 175, level: 8 }, { rx: 130, ry: 95, level: 12 }];

  // The score, in buffer pixels: bold 3-pixel cells, a 1-pixel drop shadow.
  var HUD = { cell: 3, gap: 2, top: 9, offset: 44, shadow: 1 };

  /** The wobbling, snapping camera for this frame: a pure function of state.time. */
  function cameraAt(T, state, spec, lift) {
    spec = spec || CAMERA;
    var t = state.time || 0;
    return T.camera({
      tilt: spec.tilt,
      height: spec.height + (lift || 0) + MOTION.height * Math.sin(t * MOTION.heightRate),
      fov: spec.fov,
      screenY: spec.screenY,
      panX: (spec.panX || 0) + MOTION.pan * Math.sin(t * MOTION.panRate),
      snap: MOTION.snap
    });
  }

  /**
   * The one affine transform taking texture points (u, v) to screen points
   * (x, y) for a triangle: [a, b, c, d, e, f] for ctx.transform, or null for a
   * degenerate triangle. No perspective divide: that is the swim.
   */
  function affine(u0, v0, u1, v1, u2, v2, x0, y0, x1, y1, x2, y2) {
    var du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
    var det = du1 * dv2 - du2 * dv1;
    if (!det) return null;
    var a = ((x1 - x0) * dv2 - (x2 - x0) * dv1) / det;
    var c = ((x2 - x0) * du1 - (x1 - x0) * du2) / det;
    var b = ((y1 - y0) * dv2 - (y2 - y0) * dv1) / det;
    var d = ((y2 - y0) * du1 - (y1 - y0) * du2) / det;
    return [a, b, c, d, x0 - a * u0 - c * v0, y0 - b * u0 - d * v0];
  }

  var texture = null;
  /** The texture tile, built once from rectangles; null with no document. */
  function textureTile(T) {
    if (texture) return texture;
    var off = T.offscreen('ps1-texture', TEX.size, TEX.size);
    if (!off || typeof off.ctx.createPattern !== 'function') return null;
    var c = off.ctx;
    var cell = TEX.size / TEX.cells;
    for (var i = 0; i < TEX.cells * TEX.cells; i++) {
      var col = i % TEX.cells, row = Math.floor(i / TEX.cells);
      c.fillStyle = (col + row) % 2 ? PAL.texDark : PAL.texLight;
      c.fillRect(col * cell, row * cell, cell, cell);
    }
    c.fillStyle = PAL.scuff;   // one diagonal scuff, stair-stepped, meeting itself across the repeat
    for (var s = 0; s < TEX.size / 2; s++) c.fillRect(s * 2, TEX.size - 2 - s * 2, 2, 2);
    var pattern = c.createPattern(off.canvas, 'repeat');
    if (!pattern) return null;
    texture = { canvas: off.canvas, pattern: pattern };
    return texture;
  }

  function trace(c, pts) {
    c.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i) c.lineTo(pts[i].x, pts[i].y);
      else c.moveTo(pts[i].x, pts[i].y);
    }
    c.closePath();
  }

  /** Fill the traced path with a pattern laid in buffer pixels, not field units. */
  function fillPixels(c, sp, style) {
    if (sp.field) c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = style;
    c.fill();
    if (sp.field) c.setTransform(sp.field, 0, 0, sp.field, 0, 0);
  }

  /** A Gouraud face: one linear gradient from `from` to `to`, top of the face to bottom. */
  function gouraud(from, to) {
    return function (c, cam, pts) {
      var lo = Infinity, hi = -Infinity;
      for (var i = 0; i < pts.length; i++) {
        lo = Math.min(lo, pts[i].y);
        hi = Math.max(hi, pts[i].y);
      }
      var g = c.createLinearGradient(0, lo, 0, hi > lo ? hi : lo + 1);
      g.addColorStop(0, from);
      g.addColorStop(1, to);
      trace(c, pts);
      c.fillStyle = g;
      c.fill();
    };
  }

  // ------------------------------------------------------------ the scene
  /** 1. The backdrop: 6 flat bands from void to table base, stippled across each seam. */
  function backdrop(c, T, sp) {
    var k = sp.px, n = 6;
    var w = BUFFER.w * k, band = (BUFFER.h / n) * k;
    var colours = [];
    for (var i = 0; i < n; i++) {
      colours.push(T.mix(PAL.void, PAL.base, i / (n - 1)));
      c.fillStyle = colours[i];
      c.fillRect(0, i * band, w, band);
    }
    for (var s = 1; s < n; s++) {
      var y = s * band;
      var strips = [[4, y - 4 * k, 2 * k], [8, y - 2 * k, 4 * k], [12, y + 2 * k, 2 * k]];
      for (var j = 0; j < strips.length; j++) {
        var tile = T.ditherTile(colours[s - 1], colours[s], strips[j][0], k);
        if (!tile) continue;
        c.fillStyle = tile;
        c.fillRect(0, strips[j][1], w, strips[j][2]);
      }
    }
  }

  /** 2. The table surface: 8 affine-textured triangles, then the stippled pool of light. */
  function surface(T, sp, tex) {
    return function (c, cam) {
      for (var i = 0; i < TRIANGLES.length; i++) {
        var tri = TRIANGLES[i];
        var pts = T.path(c, cam, [[tri[0][0], tri[0][1], 0], [tri[1][0], tri[1][1], 0], [tri[2][0], tri[2][1], 0]]);
        var m = affine(tri[0][0] * UV, tri[0][1] * UV, tri[1][0] * UV, tri[1][1] * UV, tri[2][0] * UV, tri[2][1] * UV,
          pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
        if (!m) continue;
        var us = [tri[0][0] * UV, tri[1][0] * UV, tri[2][0] * UV];
        var vs = [tri[0][1] * UV, tri[1][1] * UV, tri[2][1] * UV];
        c.save();
        c.clip();
        c.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        c.fillStyle = tex.pattern;
        c.fillRect(Math.min.apply(null, us) - 1, Math.min.apply(null, vs) - 1,
          Math.max.apply(null, us) - Math.min.apply(null, us) + 2, Math.max.apply(null, vs) - Math.min.apply(null, vs) + 2);
        c.restore();
      }
      for (var p = 0; p < POOL.length; p++) {
        var tile = T.ditherTile('rgba(0,0,0,0)', PAL.pool, POOL[p].level, sp.px);
        if (!tile) continue;
        var ring = [];
        for (var a = 0; a < 16; a++) {
          var ang = a * Math.PI / 8;
          ring.push([400 + POOL[p].rx * Math.cos(ang), 300 + POOL[p].ry * Math.sin(ang), 0]);
        }
        T.path(c, cam, ring);
        fillPixels(c, sp, tile);
      }
    };
  }

  // The pixellab tiles (item 1187), laid over the era's own fills through the
  // shared table: coarse and blocky, never smoothed, one strip per buffer
  // pixel, so the grain is as chunky and as affine as everything else here.
  var TEXTURE = {
    court: { name: 'court-grain', alpha: 0.55, blend: 'overlay', period: 96, strip: 1 },
    trim: { name: 'trim', alpha: 0.5, blend: 'overlay', period: 24 },
    paddle: { name: 'paddle', alpha: 0.45, blend: 'overlay', period: 18 },
    ball: { name: 'ball', alpha: 0.5, blend: 'soft-light', period: 14 }
  };

  /** 4. A paddle: a flat-shaded box, its top face given a stippled sheen. */
  function paddle(c, T, cam, sp, rect, ink) {
    var faces = T.box(c, cam, rect, 0, PADDLE.z, { ink: ink, shade: 'flat', light: PADDLE.light, texture: TEXTURE.paddle });
    var sheen = T.ditherTile(T.shade(ink, PADDLE.light.top), T.shade(ink, 0.6), 4, sp.px);
    if (sheen && faces.top) {
      trace(c, faces.top);
      fillPixels(c, sp, sheen);
    }
  }

  /** 8. The score, in buffer pixels: bold 3-pixel block cells on whole chunks, a black drop shadow. */
  function score(c, state, sp, P) {
    if (sp.field) c.setTransform(1, 0, 0, 1, 0, 0);
    var k = sp.px, cell = HUD.cell * k, gap = HUD.gap * k;
    for (var s = 0; s < 2; s++) {
      var side = s ? 'right' : 'left';
      var text = String(state.score[side]);
      var w = text.length * 3 * cell + (text.length - 1) * gap;    // every digit is 3 cells wide
      var centre = (BUFFER.w / 2 + (s ? 1 : -1) * HUD.offset) * k;
      var cx = Math.round((centre - w / 2) / k) * k + w / 2;
      c.fillStyle = PAL.hudShadow;
      P.drawText(c, text, cx + HUD.shadow * k, (HUD.top + HUD.shadow) * k, cell, gap);
      c.fillStyle = PAL.hud;
      P.drawText(c, text, cx, HUD.top * k, cell, gap);
    }
    if (sp.field) c.setTransform(sp.field, 0, 0, sp.field, 0, 0);
  }

  // ------------------------------------------------------------ the arena (item 1228)
  /*
   * docs/ART.md, era 5: a harbour rooftop at night, a Toshinden arena with a
   * Ridge Racer city behind it. Behind the far wall, 10 flat-shaded boxes (the
   * skyline) with 24 windows in accent yellow that switch one at a time every
   * 0.7 s, and 2 searchlight beams in accent blue sweeping +-25 degrees every
   * 5 s from the roofline. At match point both beams swing onto the table's
   * centre line and stop. All drawn in code, into the 320 x 240 buffer, so the
   * city is as chunky, snapped and wobbling as the table.
   */
  // Nearer and lower than the bible's y -60 to -120 and 60 to 200 tall: under this
  // camera only the top 100 screen units lie behind the far wall, most of them
  // under the HUD, and the bible's city ran off the top of the frame (measured
  // with T.project: a 200-unit roof at y -90 lands at screen y -69).
  var SKYLINE = { count: 10, from: -260, to: 1060, wMin: 40, wMax: 90, hMin: 30, hMax: 90,
                  yNear: -20, yFar: -50, depth: 20, windows: 24, winW: 8, winH: 8, winAlpha: 0.5, switchS: 0.7 };
  var SEARCH = { from: [3, 6], width: 40, length: 320, swing: 25, period: 5, alpha: 0.18,
                 targets: [[400, 170], [400, 430]] };

  // Seeded, so the city is the same every frame and every run.
  var BOXES = (function () {
    var s = 1994 >>> 0;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    var slot = (SKYLINE.to - SKYLINE.from) / SKYLINE.count, out = [];
    for (var i = 0; i < SKYLINE.count; i++) {
      var w = SKYLINE.wMin + rnd() * (SKYLINE.wMax - SKYLINE.wMin);
      out.push({
        x: Math.round(SKYLINE.from + i * slot + rnd() * (slot - w)),
        w: Math.round(w),
        h: Math.round(SKYLINE.hMin + rnd() * (SKYLINE.hMax - SKYLINE.hMin)),
        y: Math.round(SKYLINE.yNear + rnd() * (SKYLINE.yFar - SKYLINE.yNear))
      });
    }
    return out;
  })();

  // The 24 windows: box i % 10, stacked up its front face.
  var WINDOWS = (function () {
    var out = [];
    for (var i = 0; i < SKYLINE.windows; i++) {
      var b = BOXES[i % SKYLINE.count], tier = Math.floor(i / SKYLINE.count);
      var room = Math.max(1, b.w - 2 * SKYLINE.winW);
      out.push({ box: i % SKYLINE.count, x: b.x + SKYLINE.winW / 2 + ((i * 23) % room),
                 z: b.h * (0.2 + 0.25 * tier), base: (i * 5) % 3 !== 0 });
    }
    return out;
  })();

  /** Whether window i is lit at t: each flips once every 24 switches, staggered so ONE flips each 0.7 s. */
  function windowLit(i, t) {
    var step = Math.floor(Math.max(0, t || 0) / SKYLINE.switchS);
    var flips = Math.floor((step + (i * 7) % SKYLINE.windows) / SKYLINE.windows);
    return WINDOWS[i].base !== (flips % 2 === 1);
  }

  /** The sweep of beam i at t, in degrees from straight up. */
  function beamAngle(i, t) {
    return SEARCH.swing * Math.sin(2 * Math.PI * (t || 0) / SEARCH.period + i * Math.PI);
  }

  /** Where beam i starts: street level behind the middle of its box, on screen (the box hides the foot). */
  function beamBase(T, cam, i) {
    var b = BOXES[SEARCH.from[i]];
    return T.project(cam, b.x + b.w / 2, b.y - SKYLINE.depth / 2, 0);
  }

  /** The beam's triangle: from its base, `length` along the angle, `width` across at the far end. */
  function beamTriangle(base, deg, length, width) {
    var a = (deg - 90) * Math.PI / 180, ex = base.x + Math.cos(a) * length, ey = base.y + Math.sin(a) * length;
    var nx = -Math.sin(a) * width / 2, ny = Math.cos(a) * width / 2;
    return [base, { x: ex + nx, y: ey + ny }, { x: ex - nx, y: ey - ny }];
  }

  /** A beam locked on the table's centre line at match point. */
  function lockedBeam(T, cam, i) {
    var base = beamBase(T, cam, i), tg = SEARCH.targets[i];
    var end = T.project(cam, tg[0], tg[1], 0);
    var dx = end.x - base.x, dy = end.y - base.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    return beamTriangle(base, deg, len, SEARCH.width * end.scale);
  }

  function fillPoly(c, pts, style, alpha) {
    trace(c, pts);
    c.globalAlpha = alpha;
    c.fillStyle = style;
    c.fill();
    c.globalAlpha = 1;
  }

  function beams(c, T, cam, t, locked) {
    for (var i = 0; i < SEARCH.from.length; i++) {
      var tri = locked ? lockedBeam(T, cam, i) : beamTriangle(beamBase(T, cam, i), beamAngle(i, t), SEARCH.length, SEARCH.width);
      fillPoly(c, tri, PAL.accents[3], SEARCH.alpha);
    }
  }

  /** The skyline, far boxes first: the side facing the centre, the front, the roof, then the windows. */
  function skyline(c, T, cam, t) {
    var order = BOXES.map(function (b, i) { return i; }).sort(function (a, b) { return BOXES[a].y - BOXES[b].y; });
    for (var n = 0; n < order.length; n++) {
      var b = BOXES[order[n]], y0 = b.y, y1 = b.y - SKYLINE.depth;
      var sx = b.x + b.w / 2 < 400 ? b.x + b.w : b.x;
      T.path(c, cam, [[sx, y0, 0], [sx, y1, 0], [sx, y1, b.h], [sx, y0, b.h]]);
      c.fillStyle = T.shade(PAL.texDark, -0.4);
      c.fill();
      T.path(c, cam, [[b.x, y0, 0], [b.x + b.w, y0, 0], [b.x + b.w, y0, b.h], [b.x, y0, b.h]]);
      c.fillStyle = PAL.texDark;
      c.fill();
      T.path(c, cam, [[b.x, y0, b.h], [b.x + b.w, y0, b.h], [b.x + b.w, y1, b.h], [b.x, y1, b.h]]);
      c.fillStyle = PAL.texLight;
      c.fill();
    }
    c.globalAlpha = SKYLINE.winAlpha;
    c.fillStyle = PAL.accents[1];
    for (var i = 0; i < WINDOWS.length; i++) {
      if (!windowLit(i, t)) continue;
      var w = WINDOWS[i], by = BOXES[w.box].y;
      T.path(c, cam, [[w.x, by, w.z], [w.x + SKYLINE.winW, by, w.z], [w.x + SKYLINE.winW, by, w.z + SKYLINE.winH], [w.x, by, w.z + SKYLINE.winH]]);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function isMatchPoint(state) {
    var G = root.Pong;
    try { return !!(G && typeof G.isMatchPoint === 'function' && G.isMatchPoint(state)); } catch (e) { return false; }
  }

  // ------------------------------------------------------------ the fight HUD (item 1228)
  /*
   * Tekken's long health bars, into the buffer with the score: 110 x 4 buffer
   * pixels from the score outward, accent yellow on the rail shadow, each
   * draining one tenth for every point the other side has taken, with P1 and
   * CPU under them. A point drains the conceding bar with a red chunk that
   * shrinks over 0.4 s, and POINT flashes in the middle for 0.8 s; at match
   * point FINAL ROUND is held there. Everything sits above the far edge (R8).
   */
  var BARS = { w: 110, h: 4, top: 4, inner: 14, frame: '#1a1a1f', back: '#4a4e59', per: 0.1, chunkS: 0.4 };
  // The labels have their own inks, a shade under the score's, so the score stays the only #e8e8e8 on screen.
  var LABELS = { cell: 2, gap: 2, top: 11, ink: '#c8ccd6', shadow: '#1a1a1f' };
  var CALL = { cell: 2, gap: 2, top: 12, lineTwo: 21, pointS: 0.8 };

  /** How full each player's bar is: 1 less a tenth per point the OTHER side has, never below 0. */
  function barFractions(state) {
    return {
      left: Math.max(0, 1 - BARS.per * (state.score.right || 0)),
      right: Math.max(0, 1 - BARS.per * (state.score.left || 0))
    };
  }

  // Private memory (bible rule 1.4), per game by its score object: the last score
  // total seen, when it last went up and which side conceded it.
  var points = typeof WeakMap === 'function' ? new WeakMap() : null;

  function concededBy(state) {
    return state.missAt ? (state.missAt.x < (state.width || 800) / 2 ? 'left' : 'right') : null;
  }

  /** { at, side } of the latest point this game: `at` -Infinity when none has been seen. */
  function pointMoment(state) {
    var total = (state.score.left || 0) + (state.score.right || 0), t = state.time || 0;
    var key = state.score, mem = points && key && points.get(key);
    if (!mem || total < mem.total || t < mem.t) {
      // First sight of this game: the point that just brought the machine here counts.
      var fresh = total > 0 && state.eraChangedAt > 0 && t - state.eraChangedAt < CALL.pointS;
      mem = { total: total, t: t, at: fresh ? state.eraChangedAt : -Infinity, side: fresh ? concededBy(state) : null };
    } else if (total > mem.total) {
      mem = { total: total, t: t, at: t, side: concededBy(state) };
    } else {
      mem = { total: mem.total, t: t, at: mem.at, side: mem.side };
    }
    if (points && key && typeof key === 'object') points.set(key, mem);
    return mem;
  }

  /** What the middle of the HUD calls at this moment: POINT, FINAL ROUND, or nothing. */
  function hudCall(state, moment) {
    var age = (state.time || 0) - moment.at;
    if (age >= 0 && age < CALL.pointS) return { lines: ['POINT'], ink: PAL.accents[1], shadow: PAL.accents[0] };
    if (isMatchPoint(state)) return { lines: ['FINAL', 'ROUND'], ink: PAL.accents[1], shadow: PAL.accents[0] };
    return null;
  }

  /** The red damage chunk on the conceding bar: its width as a fraction of the bar, 0 once shrunk. */
  function chunkOf(state, moment, side) {
    var age = (state.time || 0) - moment.at;
    if (moment.side !== side || !(age >= 0 && age < BARS.chunkS)) return 0;
    return BARS.per * (1 - age / BARS.chunkS);
  }

  function hud(c, state, sp, P) {
    if (sp.field) c.setTransform(1, 0, 0, 1, 0, 0);
    var k = sp.px, full = barFractions(state), moment = pointMoment(state);
    for (var s = 0; s < 2; s++) {
      var side = s ? 'right' : 'left', dir = s ? -1 : 1;
      var outer = s ? BUFFER.w / 2 + BARS.inner + BARS.w : BUFFER.w / 2 - BARS.inner - BARS.w;
      var x0 = s ? outer - BARS.w : outer;
      c.fillStyle = BARS.frame;
      c.fillRect((x0 - 1) * k, (BARS.top - 1) * k, (BARS.w + 2) * k, (BARS.h + 2) * k);
      c.fillStyle = BARS.back;
      c.fillRect(x0 * k, BARS.top * k, BARS.w * k, BARS.h * k);
      var fw = Math.round(BARS.w * full[side]);   // whole buffer pixels: the bar steps, it never slides
      c.fillStyle = PAL.accents[1];
      c.fillRect((s ? outer - fw : outer) * k, BARS.top * k, fw * k, BARS.h * k);
      var cw = Math.round(BARS.w * chunkOf(state, moment, side));
      if (cw > 0) {
        c.fillStyle = PAL.accents[0];
        c.fillRect((s ? outer - fw - cw : outer + fw) * k, BARS.top * k, cw * k, BARS.h * k);
      }
      var label = s ? 'CPU' : 'P1', lx = outer + dir * 11;
      c.fillStyle = LABELS.shadow;
      P.drawText(c, label, (lx + 1) * k, (LABELS.top + 1) * k, LABELS.cell * k, LABELS.gap * k);
      c.fillStyle = LABELS.ink;
      P.drawText(c, label, lx * k, LABELS.top * k, LABELS.cell * k, LABELS.gap * k);
    }
    var call = hudCall(state, moment);
    if (call) {
      for (var l = 0; l < call.lines.length; l++) {
        var top = (call.lines.length > 1 ? (l ? CALL.lineTwo : CALL.top - 4) : CALL.top) * k;
        c.fillStyle = call.shadow;
        P.drawText(c, call.lines[l], BUFFER.w / 2 * k + k, top + k, CALL.cell * k, CALL.gap * k);
        c.fillStyle = call.ink;
        P.drawText(c, call.lines[l], BUFFER.w / 2 * k, top, CALL.cell * k, CALL.gap * k);
      }
    }
    if (sp.field) c.setTransform(sp.field, 0, 0, sp.field, 0, 0);
  }

  /** Steps 1 to 4 and the HUD, into whichever context is the low-resolution picture. */
  function scene(c, state, cam, T, P, sp) {
    // 1. backdrop, in buffer pixels
    if (sp.field) c.setTransform(1, 0, 0, 1, 0, 0);
    backdrop(c, T, sp);
    if (sp.field) c.setTransform(sp.field, 0, 0, sp.field, 0, 0);

    // 1b. the city behind the far wall: the searchlights, then the skyline over them
    var t = state.time || 0, finalRound = isMatchPoint(state);
    if (!finalRound) beams(c, T, cam, t, false);
    skyline(c, T, cam, t);

    // 2. the table. Void under the footprint, so a seam between two snapped
    // triangles shows a hairline of void rather than being papered over.
    var tex = sp.field ? textureTile(T) : null;
    T.path(c, cam, [[0, 0, 0], [800, 0, 0], [800, 600, 0], [0, 600, 0]]);
    c.fillStyle = PAL.void;
    c.fill();
    // Through the real 3D layer when the page has WebGL (item 1273): it then
    // draws the table, bats, ball and shadow itself, and 3 and 4 are skipped.
    var gl = T.field(c, cam, {
      surface: tex ? surface(T, sp, tex) : PAL.base,
      line: PAL.line,
      rail: gouraud(PAL.rail, PAL.railShadow),
      railTop: gouraud(PAL.railShadow, PAL.rail),
      nearLip: gouraud(PAL.rail, PAL.railShadow),
      texture: TEXTURE.court,
      trim: TEXTURE.trim
    }, state, P);

    // 2b. match point: both searchlights locked on the centre line, on the table, under the paddles (R4)
    if (finalRound) beams(c, T, cam, t, true);

    // 3. the contact shadow at the ball's true footprint (R5); hidden with the ball
    if (!gl && state.serveDelay <= 0) {
      var b = state.ball;
      var foot = T.project(cam, b.x + b.size / 2, b.y + b.size / 2, 0);
      c.save();
      c.translate(foot.x, foot.y);
      c.scale(1, Math.max(0.05, cam.cos));
      c.beginPath();
      c.arc(0, 0, Math.max(0.5, b.size * 0.6 * foot.scale), 0, Math.PI * 2);
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fill();
      c.restore();
    }

    // 4. paddles, the far one (smaller rect.y + rect.h) first
    var sides = ['left', 'right'];
    if (state.right.y + state.right.h < state.left.y + state.left.h) sides.reverse();
    for (var i = 0; !gl && i < sides.length; i++) paddle(c, T, cam, sp, state[sides[i]], P.paddleInk(state, sides[i]));

    // 8. the score goes INTO the buffer on purpose, so it is as chunky as the rest (R8: above the far edge)
    score(c, state, sp, P);
    hud(c, state, sp, P);
    return gl;
  }

  /**
   * 7. The ball: a low-poly gem. An octagon of the ball's screen radius cut into
   * 8 facets from its centre -- the two upper-left facets white, the next two
   * light grey, the rest grey -- drawn darkest first so white is the last fill.
   */
  function gem(c, s, T) {
    var pts = [];
    for (var i = 0; i < 8; i++) {
      var a = Math.PI + i * Math.PI / 4;       // from due left, clockwise on screen
      pts.push([s.x + s.r * Math.cos(a), s.y + s.r * Math.sin(a)]);
    }
    if (T && T.textureReady && T.textureReady(TEXTURE.ball.name)) {
      c.save();
      gemFacets(c, s, pts);
      var k = s.r / 7.2;                       // px per field unit: the 12-unit ball at radius 0.6
      T.textureOver(c, pts.map(function (q) { return { x: q[0], y: q[1], scale: k }; }), TEXTURE.ball);
      c.restore();
      return;
    }
    gemFacets(c, s, pts);
  }

  function gemFacets(c, s, pts) {
    var order = [[3, PAL.facetDark], [4, PAL.facetDark], [5, PAL.facetDark], [6, PAL.facetDark],
      [7, PAL.facetLight], [2, PAL.facetLight], [0, PAL.ball], [1, PAL.ball]];
    for (var f = 0; f < order.length; f++) {
      var n = order[f][0];
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(pts[n][0], pts[n][1]);
      c.lineTo(pts[(n + 1) % 8][0], pts[(n + 1) % 8][1]);
      c.closePath();
      c.fillStyle = order[f][1];
      c.fill();
    }
  }

  // ------------------------------------------------------------ the arrival (item 1151)
  /*
   * THE PLAYSTATION ARRIVES (docs/ERAS.md chapter 6, "Arrival flourish"), three beats
   * on the ring's eased progress p:
   *   1. ignition (p 0 to 0.25): the Super Nintendo picture breaks into 12 polygons at
   *      the point. Each carries its own piece of that picture, mapped with ONE affine
   *      transform (so it swims), and tilts up into perspective as it flies outward --
   *      foreshortened, receding, turning -- with every vertex jittered and snapped to
   *      the 2.5-pixel chunk grid, flat-shaded in the four accents.
   *   2. the edge (p 0.25 to 0.8): the ring's edge is a wobbling, snapped 16-gon, red
   *      outside and yellow just inside, over a stippled band.
   *   3. arrival (p 0.8 to 1): the table pops in like a model loading. The camera, held
   *      back at 1190 while the ring grows, eases to 1150 with one small overshoot,
   *      under a white wash fading from 0.3.
   * The ring stays the truth of which era draws where; the boot chime is the voice's
   * `boot` list below, which the sound player sounds for the point (a flourish plays
   * nothing). The shards fly to the chapter's 1.6 R but are held inside R + 60
   * (section 4's law), and the overshoot is floored so every pose stays measured (R3).
   */
  var ARRIVAL = {
    ignition: 0.25, settle: 0.8,
    shards: 12, sizeMin: 18, sizeMax: 40, fly: 1.6, reach: 60, grow: 40,
    tiltMax: 1.25, recede: 0.8, snap: 2.5, jitter: 1.25, jitterRate: 30,
    sides: 16, wobble: 6, wobbleRate: 40, red: 5, yellow: 3, band: 10, inset: 4,
    from: CAMERA.height + 40, overshoot: 1.2, floor: -3, wash: 0.3
  };

  function clamp01(v) { return v > 0 ? (v < 1 ? v : 1) : 0; }
  function snapTo(v, g) { return Math.round(v / g) * g; }

  /** The 12 shards of an arrival at `origin`: a seeded LCG gives each a size, direction, spin and speed. */
  function shardsFor(origin) {
    var s = (1994 + Math.round(origin.x) * 7919 + Math.round(origin.y) * 104729) >>> 0;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    var out = [];
    for (var i = 0; i < ARRIVAL.shards; i++) {
      out.push({
        dir: (i + rnd() * 0.8) * 2 * Math.PI / ARRIVAL.shards,
        size: ARRIVAL.sizeMin + rnd() * (ARRIVAL.sizeMax - ARRIVAL.sizeMin),
        spin: (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 3),
        speed: 0.6 + rnd() * 0.4,
        turn: rnd() * 2 * Math.PI,
        home: 8 + rnd() * 24,
        accent: PAL.accents[i % PAL.accents.length]
      });
    }
    return out;
  }

  /**
   * One shard at eased progress p: `src`, its triangle in the old picture (field
   * units), `dst`, where that triangle is on screen this frame (jittered, snapped),
   * `alpha` and `shade` (how much flat accent covers the picture as it turns).
   */
  function shardPose(sh, origin, p, radius, t, index) {
    var u = clamp01(p / ARRIVAL.ignition);
    var size = sh.size * clamp01(radius / ARRIVAL.grow);           // pops in as the ring opens
    var far = Math.min(ARRIVAL.fly * radius, radius + ARRIVAL.reach - size);
    var dist = Math.max(sh.home, sh.speed * far);
    var hx = origin.x + Math.cos(sh.dir) * sh.home, hy = origin.y + Math.sin(sh.dir) * sh.home;
    var cx = origin.x + Math.cos(sh.dir) * dist, cy = origin.y + Math.sin(sh.dir) * dist;
    var k = 1 / (1 + ARRIVAL.recede * u);                           // recedes into perspective
    var lean = Math.cos(ARRIVAL.tiltMax * u);                       // tilts up off the picture plane
    var ca = Math.cos(sh.spin * u), sa = Math.sin(sh.spin * u);
    var frame = Math.floor((t || 0) * ARRIVAL.jitterRate);
    var src = [], dst = [];
    for (var v = 0; v < 3; v++) {
      var a = sh.turn + v * 2 * Math.PI / 3;
      var lx = Math.cos(a) * size, ly = Math.sin(a) * size;
      src.push({ x: hx + lx, y: hy + ly });
      var n = (index * 3 + v) * 12.9898 + frame * 78.233;
      dst.push({
        x: snapTo(cx + (lx * ca - ly * sa) * k + ARRIVAL.jitter * Math.sin(n), ARRIVAL.snap),
        y: snapTo(cy + (lx * sa + ly * ca) * lean * k + ARRIVAL.jitter * Math.cos(n * 1.7), ARRIVAL.snap)
      });
    }
    var alpha = u < 1 ? 1 - clamp01((u - 0.75) / 0.25) : 0;
    return { u: u, src: src, dst: dst, alpha: alpha, shade: 0.3 + 0.35 * (1 - Math.abs(ca)) };
  }

  /** The edge of beat 2: a 16-gon wobbling about the ring, `inset` inside it, snapped to the chunk grid. */
  function edgePolygon(origin, radius, time, inset) {
    var pts = [];
    for (var i = 0; i < ARRIVAL.sides; i++) {
      var a = i * 2 * Math.PI / ARRIVAL.sides;
      var r = Math.max(0, radius - (inset || 0) + ARRIVAL.wobble * Math.sin(i * 2.3 + (time || 0) * ARRIVAL.wobbleRate));
      pts.push({ x: snapTo(origin.x + r * Math.cos(a), ARRIVAL.snap), y: snapTo(origin.y + r * Math.sin(a), ARRIVAL.snap) });
    }
    return pts;
  }

  function easeOutBack(u) {
    var c1 = ARRIVAL.overshoot, c3 = c1 + 1;
    return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  }

  /** Field units the camera is held above its rest height at eased progress p: 40 until beat 3, then home with one overshoot. */
  function liftAt(p) {
    if (!(p < 1)) return 0;
    var hold = ARRIVAL.from - CAMERA.height;
    if (!(p >= ARRIVAL.settle)) return hold;
    var u = clamp01((p - ARRIVAL.settle) / (1 - ARRIVAL.settle));
    return Math.max(ARRIVAL.floor, hold * (1 - easeOutBack(u)));
  }

  // Private memory (bible rule 1.4): which point's arrival is playing, so the lift is
  // never put on era 5's picture while it is the one being LEFT.
  var arrivingAt = null;
  var oldPic = { at: null, from: null, dim: null };

  /** The picture being left, drawn once per arrival into its own buffer; null with no document. */
  function oldPicture(state, fromEra, W, H, dim) {
    var T = R.table3d;
    var off = T && T.offscreen('ps1-arrival-old', W, H);
    if (!off || typeof off.ctx.setTransform !== 'function') return null;
    if (oldPic.at !== state.eraChangedAt || oldPic.from !== fromEra || oldPic.dim !== dim) {
      off.ctx.setTransform(1, 0, 0, 1, 0, 0);
      off.ctx.clearRect(0, 0, W, H);
      off.ctx.save();
      R.draw(off.ctx, Object.assign({}, state, { era: fromEra }), dim ? { ink: dim } : undefined);
      off.ctx.restore();
      oldPic = { at: state.eraChangedAt, from: fromEra, dim: dim };
    }
    return off.canvas;
  }

  function polyPath(c, pts, reverse) {
    for (var i = 0; i < pts.length; i++) {
      var q = pts[reverse ? pts.length - 1 - i : i];
      if (i) c.lineTo(q.x, q.y);
      else c.moveTo(q.x, q.y);
    }
    c.closePath();
  }

  /** The flourish hook (the header of src/erachange.js is the contract). */
  function arrival(ctx, p, origin, fromEra, toEra, info) {
    if (toEra !== 5 || !info || !info.state) return;   // a look borrowed is not a flourish borrowed
    var T = R.table3d, state = info.state, r = info.radius, dim = info.dim || null;
    arrivingAt = state.eraChangedAt;

    if (p < ARRIVAL.ignition) {                         // 1. ignition: the old picture shatters and lifts
      var pic = oldPicture(state, fromEra, info.width, info.height, dim);
      var shards = shardsFor(origin);
      for (var i = 0; i < shards.length; i++) {
        var pose = shardPose(shards[i], origin, p, r, info.t, i);
        if (!(pose.alpha > 0)) continue;
        var s = pose.src, d = pose.dst;
        ctx.save();
        ctx.globalAlpha = pose.alpha;
        ctx.beginPath();
        polyPath(ctx, d);
        var m = pic && affine(s[0].x, s[0].y, s[1].x, s[1].y, s[2].x, s[2].y, d[0].x, d[0].y, d[1].x, d[1].y, d[2].x, d[2].y);
        if (m) {
          ctx.save();
          ctx.clip();
          ctx.imageSmoothingEnabled = false;
          ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
          ctx.drawImage(pic, 0, 0, info.width, info.height);
          ctx.restore();
          ctx.beginPath();
          polyPath(ctx, d);
          ctx.globalAlpha = pose.alpha * pose.shade;
        }
        ctx.fillStyle = dim || shards[i].accent;
        ctx.fill();
        ctx.restore();
      }
    } else if (p < ARRIVAL.settle) {                    // 2. the edge: a wobbling, snapped 16-gon
      if (!(r > 1)) return;
      var time = state.time || 0;
      var outer = edgePolygon(origin, r, time, 0);
      var tile = !dim && T ? T.ditherTile(PAL.void, PAL.base, 8, ARRIVAL.snap) : null;
      if (tile) {
        ctx.beginPath();
        polyPath(ctx, outer);
        polyPath(ctx, edgePolygon(origin, r, time, ARRIVAL.band), true);
        ctx.fillStyle = tile;
        ctx.fill('evenodd');
      }
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      polyPath(ctx, outer);
      ctx.lineWidth = ARRIVAL.red;
      ctx.strokeStyle = dim || PAL.accents[0];
      ctx.stroke();
      ctx.beginPath();
      polyPath(ctx, edgePolygon(origin, r, time, ARRIVAL.inset));
      ctx.lineWidth = ARRIVAL.yellow;
      ctx.strokeStyle = dim || PAL.accents[1];
      ctx.stroke();
    } else if (!dim) {                                  // 3. arrival: the model pops in under a white wash
      ctx.globalAlpha = ARRIVAL.wash * (1 - clamp01((p - ARRIVAL.settle) / (1 - ARRIVAL.settle)));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, info.width, info.height);
    }
  }

  /** The arrival's camera lift for this state: only while era 5's own arrival is on screen. */
  function arrivalLift(state) {
    if (arrivingAt === null || arrivingAt !== state.eraChangedAt || typeof R.eraChangeMoment !== 'function') return 0;
    var m = R.eraChangeMoment(state);
    return m && m.era === 5 && m.wiping ? liftAt(m.p) : 0;
  }

  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);
    var T = P.table3d;
    if (!T) return P.drawBase(ctx, state, opts);
    var cam = cameraAt(T, state, P.eraLook(state.era).camera, arrivalLift(state));
    var buf = T.offscreen(BUFFER.key, BUFFER.w, BUFFER.h);
    if (buf && typeof buf.ctx.setTransform !== 'function') buf = null;

    ctx.save();
    ctx.globalAlpha = 1;
    var gl;
    if (buf) {
      var b = buf.ctx;
      b.save();
      b.globalAlpha = 1;
      b.imageSmoothingEnabled = false;    // nearest texels: no bilinear filtering on this machine
      gl = scene(b, state, cam, T, P, { px: 1, field: BUFFER.scale });
      b.restore();
      b.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;  // scaled up sharp: every chunk 2.5 pixels, hard-edged
      ctx.drawImage(buf.canvas, 0, 0, state.width, state.height);
    } else {
      gl = scene(ctx, state, cam, T, P, { px: 1 / BUFFER.scale, field: 0 });
    }

    // 7. the ball, full resolution and last of everything (R1, R2); hidden in the serve pause.
    // The 3D layer drew its own (item 1273).
    if (!gl && state.serveDelay <= 0) gem(ctx, T.ballScreen(cam, state), T);
    ctx.restore();
  }

  R.registerEra({
    era: 5,
    name: '1994 Sony PlayStation',
    like: 1,              // paddle colours: the ones the session earned on its first point
    camera: CAMERA,
    motion: MOTION,
    buffer: BUFFER,
    palette: PAL,
    triangles: TRIANGLES,
    uv: UV,
    cameraAt: cameraAt,
    affine: affine,
    card: { flash: '#ffffff', wipe: ['#e03a3e', '#f3c300', '#00a99d', '#2e6db4'], box: '#1a1a1f',
            border: '#8a8f9c', inner: null, year: '#f3c300', name: '#ffffff', label: '#8a8f9c', dots: null },
    // The bible's voice, to the letter (chapter 6): clean CD-era samples, plucky, one room reverb.
    voice: {
      paddle: [ { wave: 'triangle', freq: 659, dur: 0.18, gain: 0.28, attack: 0.002 },
                { wave: 'sine', freq: 1318, dur: 0.09, gain: 0.10 },
                { wave: 'noise', dur: 0.015, gain: 0.12, filter: { type: 'highpass', freq: 3000 } } ],
      wall:   [ { wave: 'triangle', freq: 440, dur: 0.12, gain: 0.22, attack: 0.002 },
                { wave: 'noise', dur: 0.01, gain: 0.08, filter: { type: 'highpass', freq: 4000 } } ],
      score:  [ { wave: 'triangle', freq: 330, at: 0.00, dur: 0.30, gain: 0.16 },
                { wave: 'triangle', freq: 392, at: 0.07, dur: 0.30, gain: 0.16 },
                { wave: 'triangle', freq: 494, at: 0.14, dur: 0.30, gain: 0.16 },
                { wave: 'triangle', freq: 659, at: 0.21, dur: 0.40, gain: 0.16 },
                { wave: 'sine', freq: 165, at: 0.00, dur: 0.50, gain: 0.20 } ],
      boot:   [ // the shimmering swell, then the deep logo tone
                { wave: 'sine', freq: 1047, at: 0.00, attack: 0.4, dur: 1.2, gain: 0.06 },
                { wave: 'sine', freq: 1319, at: 0.05, attack: 0.4, dur: 1.2, gain: 0.06 },
                { wave: 'sine', freq: 1568, at: 0.10, attack: 0.4, dur: 1.2, gain: 0.06 },
                { wave: 'sine', freq: 2093, at: 0.15, attack: 0.4, dur: 1.2, gain: 0.05 },
                { wave: 'sawtooth', freq: 262, attack: 0.6, dur: 1.4, gain: 0.07,
                  unison: { voices: 3, spread: 12 }, filter: { type: 'lowpass', freq: 400, to: 2400 } },
                { wave: 'sine', freq: 65, at: 0.9, dur: 1.6, gain: 0.45, attack: 0.003 },
                { wave: 'sine', freq: 130, at: 0.9, dur: 1.0, gain: 0.20, attack: 0.003 },
                { wave: 'triangle', freq: 196, at: 0.9, dur: 0.6, gain: 0.08 } ],
      effects: { reverb: { seconds: 1.2, decay: 2.5, mix: 0.25 } }
    },
    draw: draw,
    flourish: arrival,
    // The arena and the fight HUD's pure parts, for the tests (item 1228).
    arena: {
      SKYLINE: SKYLINE, SEARCH: SEARCH, BOXES: BOXES, WINDOWS: WINDOWS, BARS: BARS, LABELS: LABELS, CALL: CALL,
      windowLit: windowLit, beamAngle: beamAngle, beamBase: beamBase, beamTriangle: beamTriangle,
      lockedBeam: lockedBeam, barFractions: barFractions, pointMoment: pointMoment, hudCall: hudCall, chunkOf: chunkOf
    },
    // The arrival's pure parts, for the tests (item 1151).
    arrival: {
      ARRIVAL: ARRIVAL, shardsFor: shardsFor, shardPose: shardPose,
      edgePolygon: edgePolygon, liftAt: liftAt, arrivalLift: arrivalLift
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
