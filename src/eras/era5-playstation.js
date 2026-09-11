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
  var CAMERA = { tilt: 28, height: 1150, fov: 30, screenY: 306 };
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
  function cameraAt(T, state, spec) {
    spec = spec || CAMERA;
    var t = state.time || 0;
    return T.camera({
      tilt: spec.tilt,
      height: spec.height + MOTION.height * Math.sin(t * MOTION.heightRate),
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

  /** 4. A paddle: a flat-shaded box, its top face given a stippled sheen. */
  function paddle(c, T, cam, sp, rect, ink) {
    var faces = T.box(c, cam, rect, 0, PADDLE.z, { ink: ink, shade: 'flat', light: PADDLE.light });
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

  /** Steps 1 to 4 and the HUD, into whichever context is the low-resolution picture. */
  function scene(c, state, cam, T, P, sp) {
    // 1. backdrop, in buffer pixels
    if (sp.field) c.setTransform(1, 0, 0, 1, 0, 0);
    backdrop(c, T, sp);
    if (sp.field) c.setTransform(sp.field, 0, 0, sp.field, 0, 0);

    // 2. the table. Void under the footprint, so a seam between two snapped
    // triangles shows a hairline of void rather than being papered over.
    var tex = sp.field ? textureTile(T) : null;
    T.path(c, cam, [[0, 0, 0], [800, 0, 0], [800, 600, 0], [0, 600, 0]]);
    c.fillStyle = PAL.void;
    c.fill();
    T.table(c, cam, {
      surface: tex ? surface(T, sp, tex) : PAL.base,
      line: PAL.line,
      rail: gouraud(PAL.rail, PAL.railShadow),
      railTop: gouraud(PAL.railShadow, PAL.rail),
      nearLip: gouraud(PAL.rail, PAL.railShadow)
    });

    // 3. the contact shadow at the ball's true footprint (R5); hidden with the ball
    if (state.serveDelay <= 0) {
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
    for (var i = 0; i < sides.length; i++) paddle(c, T, cam, sp, state[sides[i]], P.paddleInk(state, sides[i]));

    // 8. the score goes INTO the buffer on purpose, so it is as chunky as the rest (R8: above the far edge)
    score(c, state, sp, P);
  }

  /**
   * 7. The ball: a low-poly gem. An octagon of the ball's screen radius cut into
   * 8 facets from its centre -- the two upper-left facets white, the next two
   * light grey, the rest grey -- drawn darkest first so white is the last fill.
   */
  function gem(c, s) {
    var pts = [];
    for (var i = 0; i < 8; i++) {
      var a = Math.PI + i * Math.PI / 4;       // from due left, clockwise on screen
      pts.push([s.x + s.r * Math.cos(a), s.y + s.r * Math.sin(a)]);
    }
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

  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);
    var T = P.table3d;
    if (!T) return P.drawBase(ctx, state, opts);
    var cam = cameraAt(T, state, P.eraLook(state.era).camera);
    var buf = T.offscreen(BUFFER.key, BUFFER.w, BUFFER.h);
    if (buf && typeof buf.ctx.setTransform !== 'function') buf = null;

    ctx.save();
    ctx.globalAlpha = 1;
    if (buf) {
      var b = buf.ctx;
      b.save();
      b.globalAlpha = 1;
      b.imageSmoothingEnabled = false;    // nearest texels: no bilinear filtering on this machine
      scene(b, state, cam, T, P, { px: 1, field: BUFFER.scale });
      b.restore();
      b.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;  // scaled up sharp: every chunk 2.5 pixels, hard-edged
      ctx.drawImage(buf.canvas, 0, 0, state.width, state.height);
    } else {
      scene(ctx, state, cam, T, P, { px: 1 / BUFFER.scale, field: 0 });
    }

    // 7. the ball, full resolution and last of everything (R1, R2); hidden in the serve pause
    if (state.serveDelay <= 0) gem(ctx, T.ballScreen(cam, state));
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
    draw: draw
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
