/*
 * Era 7 -- 1999 Sega Dreamcast: crisp, loud and graphic, like a comic cover.
 *
 * Chapter 8 of docs/ERAS.md, drawn on the shared 3D table (src/table3d.js).
 * Everything goes straight onto the main canvas at full resolution -- no low
 * resolution buffer, no smoothing, no post pass -- so next to the Nintendo 64's
 * smear the first thing a player sees is how sharp it got.
 *
 *   cel shading    the camera's outline mode strokes every shape in thick ink
 *                  before it fills, so the ink sits outside each silhouette;
 *                  paddles are two hard bands a face, the ball two bands
 *   poster colour  flat fills only: three sky bands, a skyline of flat
 *                  buildings, and a table in three flat depth bands
 *   graffiti       the score in the block font, skewed and tilted, with a
 *                  magenta extrusion, a fat ink outline and yellow drips
 *   comic motion   ink speed lines trail a fast ball (never ahead of it), and a
 *                  yellow starburst pops where a paddle hits it
 *   voice          slap bass, claps and synth stabs through a short echo
 *
 * Readability (bible section 5): the ball is the only pure white and is drawn
 * last (R1, R2) with its contact shadow on the true footprint (R5); each
 * paddle's near face wears its earned colour exactly (R4); the score stays in
 * the band above the far edge (R8); nothing moves the camera (R3, R7). The
 * rules are untouched: this file reads the state and never writes it. Its only
 * memory is the rally count it last saw, for the starburst.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;
  var RAD = Math.PI / 180;

  // The bible's camera: the flattest, longest lens of the six, outlined in ink.
  var CAMERA = { tilt: 22, height: 1500, fov: 23.5, screenY: 314, outline: { width: 3, colour: '#111111' } };

  var PALETTE = {
    ink: '#111111', paper: '#ffffff', orange: '#ee5a24', blue: '#1e73d8',
    yellow: '#ffd400', magenta: '#ff2e88', cyan: '#00c8f0',
    sky: ['#ffd400', '#ff8a3d', '#ff2e88'], skyline: '#5b2a86',
    teal: '#2ec4b6', tableShadow: '#1f9e93', tableLight: '#8ff0e6',
    ballCore: '#ffffff', ballShade: '#d8f4ff'
  };

  // Three flat depth bands, far to near (bible 8.3).
  var BANDS = [
    { y0: 0, y1: 200, fill: PALETTE.tableLight },
    { y0: 200, y1: 400, fill: PALETTE.teal },
    { y0: 400, y1: 600, fill: PALETTE.tableShadow }
  ];

  var PADDLE = { z: 24, edge: 0.4 };

  // The graffiti score. The bible's cell 13 at y 14 hangs to about screen y 100
  // with its extrusion and drips, past R8's limit of the far edge (82.1) less 6.
  // Cell 10 from y 4, with drips of 8 to 14, keeps the whole tag above y 76.
  var SCORE = { cell: 10, gap: 8, top: 4, offset: 120, skew: -0.25, tilt: -6,
    extrude: [8, 6, 4, 2], outline: 6, drips: 2, dripW: 3, dripMin: 8, dripMax: 14, dripOutline: 4 };

  var SPEED_LINES = { over: 400, offsets: [-8, -4, 0, 4, 8], widths: [3, 2, 3, 2, 1] };
  var BURST = { points: 8, inner: 18, outer: 34, life: 0.15 };

  /** A small seeded generator, so the skyline, the line lengths and the drips never flicker. */
  function lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return ((s >>> 8) & 0xffffff) / 0x1000000;
    };
  }

  // Nine flat buildings behind the far wall, 40 to 120 units tall (bible 8.3).
  var SKYLINE = (function () {
    var rnd = lcg(1999);
    var out = [];
    var x = -220;
    var step = 1240 / 9;
    for (var i = 0; i < 9; i++) {
      var w = step * (0.75 + 0.3 * rnd());
      out.push({ x0: x, x1: x + w, h: 40 + 80 * rnd() });
      x += step;
    }
    return out;
  })();
  var SKYLINE_Y = -19;     // just behind the far rail, so its base tucks under the rail's top

  // Each speed line's base length, 30 to 70 pixels, before the speed scales it.
  var LINE_LENGTHS = (function () {
    var rnd = lcg(640480);
    return SPEED_LINES.offsets.map(function () { return 30 + 40 * rnd(); });
  })();

  // ------------------------------------------------ the rooftop (item 1231)
  // docs/ART.md, era 7 SCENE: a rooftop skate spot above a city at sunset. Three
  // poster billboards stand on the skyline, a water tower behind it, twelve
  // window lights switch on and off on their own and a blimp crosses the sky.
  // All of it drawn in code, in flat poster colour and ink -- no gradients.
  var SCENE = {
    poster: { w: 60, h: 30, legs: 3 },
    posters: [
      { x: 20, z: 34, bg: PALETTE.magenta, fg: PALETTE.yellow, art: 'disc' },
      { x: 370, z: 26, bg: PALETTE.cyan, fg: PALETTE.ink, art: 'bolt' },
      { x: 720, z: 40, bg: PALETTE.yellow, fg: PALETTE.orange, art: 'stripes' }
    ],
    tower: { x: 700, y: -80, w: 40, legs: 40, top: 100, leg: 4, tank: PALETTE.orange, band: PALETTE.yellow },
    windows: { count: 12, size: 7, min: 0.5, max: 2 },
    blimp: { w: 80, h: 24, speed: 12, y: 9, flash: 1, body: PALETTE.blue, panel: PALETTE.yellow }
  };

  // Twelve window lights on the skyline, each on its own seeded period.
  var WINDOWS = (function () {
    var rnd = lcg(1127);
    var out = [];
    for (var i = 0; i < SCENE.windows.count; i++) {
      var b = SKYLINE[Math.floor(rnd() * SKYLINE.length)];
      var s = SCENE.windows.size;
      var period = SCENE.windows.min + (SCENE.windows.max - SCENE.windows.min) * rnd();
      out.push({
        x: b.x0 + 8 + (b.x1 - b.x0 - 16 - s) * rnd(),
        z: 8 + Math.max(0, b.h - 16 - s) * rnd(),
        period: period, phase: period * 2 * rnd()
      });
    }
    return out;
  })();

  /** Whether window i is lit at time t: each toggles every `period` seconds. Pure. */
  function windowLit(i, t) {
    var w = WINDOWS[i];
    return Math.floor((Math.max(0, t) + w.phase) / w.period) % 2 === 0;
  }

  /**
   * The blimp's left edge at time t, in field units: 12 a second, left to right,
   * round again once it is wholly off the right edge -- every 73 s, not the
   * bible's 70, because at 12 a second a 70 s lap would pop it back into view. Pure.
   */
  function blimpX(t) {
    var B = SCENE.blimp;
    return -B.w + (Math.max(0, t) * B.speed) % (800 + B.w);
  }

  /** Whether the match is on its match point, by the rules' own test. */
  function matchPoint(state) {
    var G = root.Pong;
    try { return !!(G && typeof G.isMatchPoint === 'function' && G.isMatchPoint(state)); } catch (e) { return false; }
  }

  /** The sky bands, top to bottom: swapped (magenta on top) at match point. Pure. */
  function skyOrder(isMatch) {
    return isMatch ? PALETTE.sky.slice().reverse() : PALETTE.sky.slice();
  }

  var cached = { spec: null, cam: null };
  function cameraFor(T, spec) {
    if (cached.spec !== spec) {
      cached.spec = spec;
      cached.cam = T.camera(spec);
    }
    return cached.cam;
  }

  /** A crisp one-pixel line: on a half-pixel coordinate. */
  function crisp(v) { return Math.round(v) + 0.5; }

  // ------------------------------------------------------------ 1. backdrop
  /** A flat poster shape: (u, v) points on the billboard's face, filled and inked. */
  function posterShape(ctx, T, cam, p, uv, fill) {
    var pts = uv.map(function (q) { return [p.x + q[0], SKYLINE_Y + 1, p.z + q[1]]; });
    T.path(ctx, cam, pts);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.ink;
    ctx.stroke();
  }

  /** Each billboard's own original graphic (no real logo): a disc, a bolt or stripes. */
  function posterArt(p) {
    var W = SCENE.poster.w, H = SCENE.poster.h;
    if (p.art === 'disc') {
      var out = [];
      for (var k = 0; k < 12; k++) {                      // 12 sides: never the starburst's 16
        var a = k * Math.PI / 6;
        out.push([W / 2 + 11 * Math.cos(a), H / 2 + 11 * Math.sin(a)]);
      }
      return [out];
    }
    if (p.art === 'bolt') return [[[34, 27], [22, 14], [30, 14], [24, 3], [38, 17], [30, 17]]];
    return [0, 1, 2].map(function (i) {
      var x = 6 + i * 18;
      return [[x, 3], [x + 8, 3], [x + 16, H - 3], [x + 8, H - 3]];
    });
  }

  function drawPosters(ctx, T, cam) {
    var S = SCENE.poster;
    for (var i = 0; i < SCENE.posters.length; i++) {
      var p = SCENE.posters[i];
      // Two ink legs down to the roof, then the board, then its graphic.
      [10, S.w - 10 - S.legs].forEach(function (u) {
        T.quad(ctx, cam, [[p.x + u, SKYLINE_Y + 1, 0], [p.x + u + S.legs, SKYLINE_Y + 1, 0],
          [p.x + u + S.legs, SKYLINE_Y + 1, p.z], [p.x + u, SKYLINE_Y + 1, p.z]], { fill: PALETTE.ink, outline: false });
      });
      T.quad(ctx, cam, [[p.x, SKYLINE_Y + 1, p.z], [p.x + S.w, SKYLINE_Y + 1, p.z],
        [p.x + S.w, SKYLINE_Y + 1, p.z + S.h], [p.x, SKYLINE_Y + 1, p.z + S.h]], { fill: p.bg });
      var art = posterArt(p);
      for (var k = 0; k < art.length; k++) posterShape(ctx, T, cam, p, art[k], p.fg);
    }
  }

  function drawTower(ctx, T, cam) {
    var W = SCENE.tower;
    var legs = [[0, 0], [W.w - W.leg, 0], [0, W.w - W.leg], [W.w - W.leg, W.w - W.leg]];
    for (var i = 0; i < legs.length; i++) {
      T.box(ctx, cam, { x: W.x + legs[i][0], y: W.y + legs[i][1], w: W.leg, h: W.leg }, 0, W.legs, { fill: PALETTE.ink });
    }
    var faces = { top: W.band, near: W.tank, side: T.shade(W.tank, -0.35) };
    T.box(ctx, cam, { x: W.x, y: W.y, w: W.w, h: W.w }, W.legs, W.top,
      { fill: function (face) { return faces[face] || W.tank; } });
  }

  function drawWindows(ctx, T, cam, t) {
    var s = SCENE.windows.size;
    for (var i = 0; i < WINDOWS.length; i++) {
      if (!windowLit(i, t)) continue;
      var w = WINDOWS[i];
      T.quad(ctx, cam, [[w.x, SKYLINE_Y + 0.5, w.z], [w.x + s, SKYLINE_Y + 0.5, w.z],
        [w.x + s, SKYLINE_Y + 0.5, w.z + s], [w.x, SKYLINE_Y + 0.5, w.z + s]], { fill: PALETTE.yellow, outline: false });
    }
  }

  /** The blimp: a flat blue envelope in ink, fins, a gondola, and a side panel that flashes the score. */
  function drawBlimp(ctx, P, state, flash) {
    var B = SCENE.blimp;
    var x = blimpX(state.time || 0), y = B.y;
    var cx = x + B.w / 2, cy = y + B.h / 2;
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineJoin = 'round';
    ctx.fillStyle = PALETTE.orange;                                   // the tail fins
    ctx.beginPath();
    ctx.moveTo(x + 8, cy); ctx.lineTo(x - 4, y - 3); ctx.lineTo(x + 14, y + 4); ctx.closePath();
    ctx.moveTo(x + 8, cy); ctx.lineTo(x - 4, y + B.h + 3); ctx.lineTo(x + 14, y + B.h - 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = PALETTE.ink;                                      // the gondola
    ctx.fillRect(cx - 7, y + B.h - 1, 14, 5);
    ovalPath(ctx, cx, cy, B.w / 2, B.h / 2, 0, Math.PI * 2);          // the envelope
    ctx.fillStyle = B.body;
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = T_shadeSafe(B.body);                              // its one cel band, the lower third
    ovalPath(ctx, cx, cy + B.h * 0.22, B.w / 2 - 6, B.h * 0.2, 0, Math.PI);
    ctx.fill();
    var pw = 36, ph = 12, px = cx - pw / 2, py = cy - ph / 2;          // the side panel
    ctx.fillStyle = flash ? PALETTE.ink : B.panel;
    ctx.fillRect(px, py, pw, ph);
    ctx.lineWidth = 1.5;
    rectPath(ctx, px, py, pw, ph);
    ctx.stroke();
    if (flash) blockText(ctx, P, flash, cx, py + 1, 2, PALETTE.yellow);
    else {
      ctx.fillStyle = PALETTE.magenta;
      for (var i = 0; i < 3; i++) ctx.fillRect(px + 5 + i * 10, py + 3, 6, ph - 6);
    }
  }

  /** A rectangle as a path (no strokeRect: not every recorder the tests use has it). */
  function rectPath(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  /** An oval (or part of one) as a 24-sided path: every context has lineTo. */
  function ovalPath(ctx, cx, cy, rx, ry, a0, a1) {
    ctx.beginPath();
    for (var k = 0; k <= 24; k++) {
      var a = a0 + (a1 - a0) * k / 24;
      if (k) ctx.lineTo(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
      else ctx.moveTo(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
    }
    ctx.closePath();
  }

  function T_shadeSafe(hex) {
    var T = R && R.table3d;
    return T && T.shade ? T.shade(hex, -0.3) : hex;
  }

  /** Text in the score's block font, centred on cx, `cell` units a cell. */
  function blockText(ctx, P, text, cx, top, cell, fill) {
    var glyphs = String(text).split('').map(function (ch) { return P.DIGITS[ch] || P.LETTERS[ch] || null; });
    var width = 0;
    glyphs.forEach(function (g, i) { width += (i ? cell : 0) + (g ? g[0].length : 2) * cell; });
    var left = cx - width / 2;
    ctx.fillStyle = fill;
    glyphs.forEach(function (g) {
      if (g) {
        for (var r = 0; r < g.length; r++) {
          for (var c = 0; c < g[r].length; c++) if (g[r][c] === '1') ctx.fillRect(left + c * cell, top + r * cell, cell, cell);
        }
      }
      left += (g ? g[0].length : 2) * cell + cell;
    });
  }

  function backdrop(ctx, T, cam, state, P, flash) {
    var horizon = T.project(cam, 400, SKYLINE_Y, 0).y;
    ctx.fillStyle = PALETTE.blue;                       // the floor around the table
    ctx.fillRect(0, 0, state.width, state.height);
    var sky = skyOrder(matchPoint(state));
    var band = horizon / sky.length;
    for (var i = 0; i < sky.length; i++) {
      ctx.fillStyle = sky[i];
      ctx.fillRect(0, Math.round(i * band), state.width, Math.round((i + 1) * band) - Math.round(i * band));
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = PALETTE.ink;
    for (var j = 1; j <= PALETTE.sky.length; j++) {
      var y = crisp(j * band);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(state.width, y);
      ctx.stroke();
    }
    drawBlimp(ctx, P, state, flash);                    // in the sky, behind the city
    drawTower(ctx, T, cam);                             // behind the skyline
    for (var k = 0; k < SKYLINE.length; k++) {
      var b = SKYLINE[k];
      T.quad(ctx, cam, [[b.x0, SKYLINE_Y, 0], [b.x1, SKYLINE_Y, 0], [b.x1, SKYLINE_Y, b.h], [b.x0, SKYLINE_Y, b.h]],
        { fill: PALETTE.skyline });
    }
    drawWindows(ctx, T, cam, state.time || 0);
    drawPosters(ctx, T, cam);
  }

  // The pixellab tiles (item 1187), laid over the era's own flat bands through
  // the shared table and kept light: a cel-shaded game's textures were flat
  // colour with a little printed grain, so the bands and the ink stay in
  // charge. Filtered smooth, as the Dreamcast's were.
  var TEXTURE = {
    court: { name: 'court-grain', alpha: 0.35, blend: 'soft-light', period: 110, strip: 2, smooth: true },
    trim: { name: 'trim', alpha: 0.3, blend: 'soft-light', period: 28, smooth: true },
    paddle: { name: 'paddle', alpha: 0.25, blend: 'soft-light', period: 20, smooth: true },
    ball: { name: 'ball', alpha: 0.3, blend: 'soft-light', period: 12, smooth: true }
  };

  // --------------------------------------------------------------- 2. table
  function tableStyle(T) {
    return {
      surface: function (ctx, cam) {
        // The whole surface once with its ink outline, then the flat bands on top.
        T.quad(ctx, cam, [[0, 0, 0], [800, 0, 0], [800, 600, 0], [0, 600, 0]], { fill: BANDS[1].fill });
        for (var i = 0; i < BANDS.length; i++) {
          var b = BANDS[i];
          T.quad(ctx, cam, [[0, b.y0, 0], [800, b.y0, 0], [800, b.y1, 0], [0, b.y1, 0]], { fill: b.fill, outline: false });
        }
      },
      line: PALETTE.ink,
      rail: PALETTE.orange,
      railTop: PALETTE.yellow,
      nearLip: PALETTE.ink,
      texture: TEXTURE.court,
      trim: TEXTURE.trim
    };
  }

  // ------------------------------------------------------------- 4. paddles
  /**
   * Two hard bands a face, the edge 40% down. The helper's own 'banded' mode
   * lightens its lit band, which would take the near face off the earned
   * colour; here the near face's lit band IS the earned colour (R4).
   */
  function paddleStyle(ctx, T, ink) {
    var faces = {
      top: [T.shade(ink, 0.3), ink],
      near: [ink, T.shade(ink, -0.35)],
      side: [T.shade(ink, -0.35), T.shade(ink, -0.6)]
    };
    return {
      ink: ink,
      shade: 'banded',
      bands: 2,
      texture: TEXTURE.paddle,
      fill: function (face, pts) {
        var pair = faces[face] || faces.near;
        var top = Infinity, bottom = -Infinity;
        for (var i = 0; i < pts.length; i++) {
          if (pts[i].y < top) top = pts[i].y;
          if (pts[i].y > bottom) bottom = pts[i].y;
        }
        if (bottom <= top) bottom = top + 1;
        var g = ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, pair[0]);
        g.addColorStop(PADDLE.edge, pair[0]);
        g.addColorStop(PADDLE.edge, pair[1]);
        g.addColorStop(1, pair[1]);
        return g;
      }
    };
  }

  // -------------------------------------------------------- 5. behind ball
  /** The speed lines' geometry for this frame: [] when slow or serving. Pure. */
  function speedLines(T, cam, state) {
    var b = state.ball;
    var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (state.serveDelay > 0 || !(speed > SPEED_LINES.over)) return [];
    var s = T.ballScreen(cam, state);
    var cx = b.x + b.size / 2, cy = b.y + b.size / 2, r = b.size * 0.6;
    var back = T.project(cam, cx - b.vx * 0.05, cy - b.vy * 0.05, r);
    var dx = back.x - s.x, dy = back.y - s.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len; dy /= len;                         // pointing back along -velocity
    var px = -dy, py = dx;
    var out = [];
    for (var i = 0; i < SPEED_LINES.offsets.length; i++) {
      var off = SPEED_LINES.offsets[i];
      var l = LINE_LENGTHS[i] * speed / 720;
      var x0 = s.x + dx * s.r + px * off, y0 = s.y + dy * s.r + py * off;
      out.push({ x0: x0, y0: y0, x1: x0 + dx * l, y1: y0 + dy * l, width: SPEED_LINES.widths[i] });
    }
    return out;
  }

  // The starburst's memory: the rally count last seen, and the last hit.
  var memo = { time: null, rally: 0, hitAt: -Infinity, x: 0, y: 0 };

  function noteHits(T, cam, state) {
    if (memo.time === null || state.time < memo.time || state.rally < memo.rally) {
      memo.rally = state.rally;
      memo.hitAt = -Infinity;
    } else if (state.rally > memo.rally) {
      var s = T.ballScreen(cam, state);
      memo.rally = state.rally;
      memo.hitAt = state.time;
      memo.x = s.x;
      memo.y = s.y;
    }
    memo.time = state.time;
  }

  function drawBurst(ctx, state) {
    var age = state.time - memo.hitAt;
    if (!(age >= 0 && age < BURST.life)) return;
    var prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * (1 - age / BURST.life);
    ctx.beginPath();
    for (var i = 0; i < BURST.points * 2; i++) {
      var a = i * Math.PI / BURST.points - Math.PI / 2;
      var rad = i % 2 ? BURST.inner : BURST.outer;
      var x = memo.x + Math.cos(a) * rad, y = memo.y + Math.sin(a) * rad;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2 * CAMERA.outline.width;
    ctx.strokeStyle = PALETTE.ink;
    ctx.stroke();
    ctx.fillStyle = PALETTE.yellow;
    ctx.fill();
    ctx.globalAlpha = prev;
  }

  // ------------------------------------------------------------- 7. the ball
  function drawBall(ctx, T, cam, state) {
    var s = T.ball(ctx, cam, state.ball, {
      fill: PALETTE.ballCore,
      shadow: T.rgba(PALETTE.ink, 0.35),
      outline: { width: 2, colour: PALETTE.ink },
      texture: TEXTURE.ball
    });
    // The shade band: the same circle offset (+0.35r, +0.35r), inside the ball.
    // Drawn as the lens where the two circles overlap -- two arcs, no clip.
    var d = 0.35 * Math.SQRT2;                 // centre offset, in radii
    var half = Math.acos(d / 2);               // half the lens's angle on each circle
    var dir = Math.PI / 4;                     // down and to the right
    var bx = s.x + 0.35 * s.r, by = s.y + 0.35 * s.r;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, dir - half, dir + half);
    ctx.arc(bx, by, s.r, dir + Math.PI - half, dir + Math.PI + half);
    ctx.closePath();
    ctx.fillStyle = PALETTE.ballShade;
    ctx.fill();
    return s;
  }

  // ---------------------------------------------------------------- 8. HUD
  /** The lit cells, drips and centre of one graffiti number, in canvas units. Pure. */
  function graffiti(P, text, cx, side) {
    var cell = SCORE.cell;
    var glyphs = String(text).split('').map(function (ch) { return P.DIGITS[ch] || P.LETTERS[ch]; });
    var width = 0;
    glyphs.forEach(function (rows, i) { width += (i ? SCORE.gap : 0) + (rows ? rows[0].length : 2) * cell; });
    var left = cx - width / 2;
    var cells = [];
    var open = [];
    glyphs.forEach(function (rows) {
      if (!rows) { left += 2 * cell + SCORE.gap; return; }
      for (var r = 0; r < rows.length; r++) {
        for (var c = 0; c < rows[r].length; c++) {
          if (rows[r][c] !== '1') continue;
          var at = { x: left + c * cell, y: SCORE.top + r * cell, w: cell, h: cell };
          cells.push(at);
          if (r === rows.length - 1 || rows[r + 1][c] !== '1') open.push(at);
        }
      }
      left += rows[0].length * cell + SCORE.gap;
    });
    var seed = side === 'right' ? 7 : 3;
    for (var i = 0; i < String(text).length; i++) seed = seed * 31 + String(text).charCodeAt(i);
    var rnd = lcg(seed);
    var drips = [];
    var pool = open.slice();
    for (var d = 0; d < SCORE.drips && pool.length; d++) {
      var from = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      drips.push({ x: from.x + cell / 2 - SCORE.dripW / 2, y: from.y + cell, w: SCORE.dripW,
        h: SCORE.dripMin + Math.round((SCORE.dripMax - SCORE.dripMin) * rnd()) });
    }
    return { cells: cells, drips: drips, cx: cx, cy: SCORE.top + 2.5 * cell, width: width };
  }

  /**
   * A point of a tag, sprayed: skewed (x leans with height) and tilted 6
   * degrees about the number's centre. Applied to each corner, so the frame
   * needs no canvas transform. Pure.
   */
  function sprayPoint(tag, x, y) {
    var qx = x - tag.cx, qy = y - tag.cy;
    qx += SCORE.skew * qy;
    var a = SCORE.tilt * RAD;
    return { x: tag.cx + qx * Math.cos(a) - qy * Math.sin(a), y: tag.cy + qx * Math.sin(a) + qy * Math.cos(a) };
  }

  /** One path through every rectangle, each grown by pad and shifted by off, sprayed. */
  function tracePath(ctx, tag, rects, off, pad) {
    ctx.beginPath();
    for (var i = 0; i < rects.length; i++) {
      var c = rects[i];
      var x0 = c.x + off - pad, y0 = c.y + off - pad, x1 = c.x + c.w + off + pad, y1 = c.y + c.h + off + pad;
      var p = [sprayPoint(tag, x0, y0), sprayPoint(tag, x1, y0), sprayPoint(tag, x1, y1), sprayPoint(tag, x0, y1)];
      ctx.moveTo(p[0].x, p[0].y);
      ctx.lineTo(p[1].x, p[1].y);
      ctx.lineTo(p[2].x, p[2].y);
      ctx.lineTo(p[3].x, p[3].y);
      ctx.closePath();
    }
  }

  function drawGraffiti(ctx, tag) {
    // The extrusion, deepest first.
    ctx.fillStyle = PALETTE.magenta;
    for (var k = 0; k < SCORE.extrude.length; k++) {
      tracePath(ctx, tag, tag.cells, SCORE.extrude[k], 0);
      ctx.fill();
    }
    // The fat ink outline round every cell and drip, then the yellow over it.
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineJoin = 'miter';
    ctx.lineWidth = SCORE.outline;
    tracePath(ctx, tag, tag.cells, 0, 0);
    ctx.stroke();
    ctx.lineWidth = SCORE.dripOutline;
    tracePath(ctx, tag, tag.drips, 0, 0);
    ctx.stroke();
    ctx.fillStyle = PALETTE.yellow;
    tracePath(ctx, tag, tag.cells.concat(tag.drips), 0, 0);
    ctx.fill();
  }

  /** The lowest screen y any part of a tag reaches: extrusion, outline and drips, sprayed. Pure. */
  function tagBottom(tag) {
    var low = -Infinity;
    function reach(rects, off, pad) {
      for (var i = 0; i < rects.length; i++) {
        var c = rects[i];
        var xs = [c.x + off - pad, c.x + c.w + off + pad];
        var ys = [c.y + off - pad, c.y + c.h + off + pad];
        for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) low = Math.max(low, sprayPoint(tag, xs[a], ys[b]).y);
      }
    }
    reach(tag.cells, SCORE.extrude[0], 0);
    reach(tag.cells, 0, SCORE.outline / 2);
    reach(tag.drips, 0, SCORE.dripOutline / 2);
    return low;
  }

  // ------------------------------------------- tags, cans and the splat (item 1231)
  // docs/ART.md, era 7 SCOREBOARD and MOMENTS. Beside each number, on the inside
  // (not under it: under would cross R8's line at y 76), a spray tag -- P1 and CPU in the block
  // font at cell 4, the number's skew, poster cyan and ink -- over a row of three
  // spray cans, one filled per three rally hits. A point stamps a magenta paint
  // splat behind the scorer's number, fading over 1.2 s, and the blimp's panel
  // shows the new score for 1 s. At match point both tags blink 4 times a second.
  var HUD = { tagCell: 4, tagTop: 20, tagGap: 12, tagOutline: 3,
    can: { w: 10, h: 18, gap: 4, top: 50, per: 3, count: 3, empty: '#6a4a8a' /* (new) an empty can, skyline lifted */ },
    splat: { w: 90, h: 60, life: 1.2, points: 14, drops: 5 }, blink: 4 };

  /** How many of the three cans are full for a rally count. Pure. */
  function cansFilled(rally) {
    return Math.max(0, Math.min(HUD.can.count, Math.floor((rally || 0) / HUD.can.per)));
  }

  /** The splat's opacity `age` seconds after the point: 1 fading to 0 over 1.2 s. Pure. */
  function splatAlpha(age) {
    return age >= 0 && age < HUD.splat.life ? 1 - age / HUD.splat.life : 0;
  }

  /** Whether the tags show this frame: always, but at match point 4 blinks a second. Pure. */
  function tagsShown(isMatch, t) {
    return !isMatch || Math.floor(t * HUD.blink * 2) % 2 === 0;
  }

  // The points' memory: the score last seen and the last splat.
  var points = { time: null, left: 0, right: 0, splat: null };

  /**
   * Fold the score into the memory: a side whose score went up gets a splat
   * now. On arrival (the first frame this era sees, within 0.8 s of the change)
   * the point that brought it here is splatted too, from the rules' last event.
   */
  function notePoints(state) {
    var sc = state.score || { left: 0, right: 0 };
    var t = state.time || 0;
    if (points.time === null || t < points.time) {
      points.splat = null;
      var since = t - (state.eraChangedAt || 0);
      var ev = state.lastEvent;
      if (state.eraChangedAt > 0 && since >= 0 && since < 0.8 && ev && ev.type === 'score' &&
          (ev.side === 'left' || ev.side === 'right')) {
        points.splat = { side: ev.side, at: state.eraChangedAt };
      }
    } else if (sc.left > points.left) points.splat = { side: 'left', at: t };
    else if (sc.right > points.right) points.splat = { side: 'right', at: t };
    points.left = sc.left;
    points.right = sc.right;
    points.time = t;
    return points.splat;
  }

  /** The splat's outline round (cx, cy): 14 seeded lobes, 90 x 60 at most. Pure. */
  function splatShape(cx, cy, seed) {
    var rnd = lcg(seed);
    var S = HUD.splat;
    var pts = [];
    for (var k = 0; k < S.points; k++) {
      var a = k * 2 * Math.PI / S.points;
      var f = k % 2 ? 0.55 + 0.2 * rnd() : 0.8 + 0.2 * rnd();
      pts.push({ x: cx + Math.cos(a) * S.w / 2 * f, y: cy + Math.sin(a) * S.h / 2 * f });
    }
    return pts;
  }

  function drawSplat(ctx, cx, cy, alpha, seed) {
    if (!(alpha > 0)) return;
    var prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    polyline(ctx, splatShape(cx, cy, seed), true);
    ctx.fillStyle = PALETTE.magenta;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.ink;
    ctx.stroke();
    var rnd = lcg(seed + 7);
    for (var d = 0; d < HUD.splat.drops; d++) {                   // a few flung drops
      var a = rnd() * Math.PI * 2, r = HUD.splat.w * (0.5 + 0.1 * rnd());
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.45, 3 + 2 * rnd(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = prev;
  }

  /** A spray tag's cells: the text in the block font at cell 4, centred on cx. Pure. */
  function tagCells(P, text, cx) {
    var cell = HUD.tagCell;
    var glyphs = String(text).split('').map(function (ch) { return P.DIGITS[ch] || P.LETTERS[ch]; });
    var width = 0;
    glyphs.forEach(function (rows, i) { width += (i ? cell : 0) + rows[0].length * cell; });
    var left = cx - width / 2;
    var cells = [];
    glyphs.forEach(function (rows) {
      for (var r = 0; r < rows.length; r++) {
        for (var c = 0; c < rows[r].length; c++) {
          if (rows[r][c] === '1') cells.push({ x: left + c * cell, y: HUD.tagTop + r * cell, w: cell, h: cell });
        }
      }
      left += rows[0].length * cell + cell;
    });
    return { cells: cells, drips: [], cx: cx, cy: HUD.tagTop + 2.5 * cell, width: width };
  }

  /**
   * Where a side's tag goes: beside its number, on the inside, toward the
   * middle -- the outside of the right number is where the opponent's name
   * plate sits. Pure.
   */
  function tagCentre(P, number, side) {
    var text = side === 'left' ? 'P1' : 'CPU';
    var probe = tagCells(P, text, 0);
    var dir = side === 'left' ? 1 : -1;
    return { text: text, cx: number.cx + dir * (number.width / 2 + HUD.tagGap + probe.width / 2) };
  }

  function drawTag(ctx, tag) {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineJoin = 'miter';
    ctx.lineWidth = HUD.tagOutline;
    tracePath(ctx, tag, tag.cells, 0, 0);
    ctx.stroke();
    ctx.fillStyle = PALETTE.cyan;
    ctx.fill();
  }

  function drawCans(ctx, cx, filled) {
    var C = HUD.can;
    var width = C.count * C.w + (C.count - 1) * C.gap;
    var x = cx - width / 2;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.ink;
    for (var i = 0; i < C.count; i++) {
      var cx0 = x + i * (C.w + C.gap);
      ctx.fillStyle = PALETTE.ink;                                // cap and nozzle
      ctx.fillRect(cx0 + 3, C.top, 4, 3);
      ctx.fillRect(cx0 + 6, C.top - 1, 3, 2);
      ctx.fillStyle = i < filled ? PALETTE.magenta : HUD.can.empty;
      ctx.fillRect(cx0, C.top + 3, C.w, C.h - 3);                 // the can
      rectPath(ctx, cx0, C.top + 3, C.w, C.h - 3);
      ctx.stroke();
      if (i < filled) {                                           // its cel band and label
        ctx.fillStyle = PALETTE.yellow;
        ctx.fillRect(cx0 + 1, C.top + 9, C.w - 2, 4);
      }
    }
  }

  // ------------------------------------------------------------------ frame
  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);
    var T = P.table3d;
    if (!T) return P.drawBase(ctx, state, opts);
    var cam = cameraFor(T, CAMERA);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    noteHits(T, cam, state);
    var splat = notePoints(state);
    var t = state.time || 0;
    var flash = splat && t - splat.at >= 0 && t - splat.at < SCENE.blimp.flash
      ? state.score.left + '-' + state.score.right : null;

    backdrop(ctx, T, cam, state, P, flash);                       // 1
    T.table(ctx, cam, tableStyle(T));                             // 2

    var sides = ['left', 'right'];                                // 4, the far paddle first
    if (state.right.y + state.right.h < state.left.y + state.left.h) sides.reverse();
    for (var i = 0; i < sides.length; i++) {
      T.box(ctx, cam, state[sides[i]], 0, PADDLE.z, paddleStyle(ctx, T, P.paddleInk(state, sides[i])));
    }

    if (state.serveDelay <= 0) {                                  // 5, behind the ball
      var lines = speedLines(T, cam, state);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineCap = 'round';
      for (var j = 0; j < lines.length; j++) {
        ctx.lineWidth = lines[j].width;
        ctx.beginPath();
        ctx.moveTo(lines[j].x0, lines[j].y0);
        ctx.lineTo(lines[j].x1, lines[j].y1);
        ctx.stroke();
      }
      drawBurst(ctx, state);
      drawBall(ctx, T, cam, state);                               // 7, last on the table
    }

    var mid = state.width / 2;                                    // 8, above the far edge
    var numbers = {
      left: graffiti(P, state.score.left, mid - SCORE.offset, 'left'),
      right: graffiti(P, state.score.right, mid + SCORE.offset, 'right')
    };
    if (splat) {                                                  // the splat, behind the scorer's number
      var n = numbers[splat.side];
      drawSplat(ctx, n.cx, n.cy, splatAlpha(t - splat.at), splat.side === 'left' ? 11 : 23);
    }
    drawGraffiti(ctx, numbers.left);
    drawGraffiti(ctx, numbers.right);
    var showTags = tagsShown(matchPoint(state), t);
    var filled = cansFilled(state.rally);
    ['left', 'right'].forEach(function (side) {
      var at = tagCentre(P, numbers[side], side);
      if (showTags) drawTag(ctx, tagCells(P, at.text, at.cx));
      drawCans(ctx, at.cx, filled);
    });
    ctx.restore();
  }

  // --------------------------------------------------------------- arrival
  /*
   * The Dreamcast arrives (bible chapter 8, "Arrival flourish"; item 1153),
   * drawn over the ring's edge every frame of the ring that brings era 7 in.
   * Three beats on the ring's eased progress p:
   *   1 ignition  p 0-0.25   a paper-white page inside the ring and a swirl-
   *                          orange dot dropping onto the miss, bouncing twice
   *   2 the edge  p 0.25-0.8 a thick ink line rides the ring and traces every
   *                          shape it crosses, a hard flat band sits just
   *                          behind it, the three-arm swirl turns on the edge,
   *                          and the logo-style orange spiral turns at the centre
   *   3 arrival   p 0.8-1    comic panel snap: an ink frame round the canvas and
   *                          sixteen action lines from the miss, fading after 0.9
   * The inking starts with the ring itself (the eased ring is under a unit
   * wide for its first frames), so the whole change reads as the ink drawing
   * the new era. Drawn only: no sound (the modem-into-swirl sting is the
   * voice's boot list below), no state, no camera move. Nothing goes further
   * than 60 pixels past the ring, and all of it is gone by p = 1, before the
   * serve. Behind the title (info.dim) the plain ring plays.
   */
  var ARRIVAL = {
    ignite: 0.25, snap: 0.8, fade: 0.9,
    page: 0.9, dot: 14, bounce: 40,
    inkWidth: 5, inkLead: 40, inkTrail: 12, edgeInk: 6,
    band: { inner: 40, outer: 28, alpha: 0.35 },
    swirl: { arms: 3, points: 24, width: 14, ink: 20, depth: 50, inside: 60, outside: 10 },
    spiral: { size: 46, turns: 1.6, points: 40, width: 9, ink: 15, spin: 5 * Math.PI },
    frame: { x: 5, y: 5, w: 790, h: 590, width: 10 },
    action: { lines: 16, inner: 24, length: 80, width: 3 }
  };

  /** The bouncing dot's height above the miss, in pixels: two bounces, landed by p 0.25. Pure. */
  function dotHeight(p) {
    if (!(p >= 0) || p >= ARRIVAL.ignite) return 0;
    var q = p / ARRIVAL.ignite;
    return ARRIVAL.bounce * Math.abs(Math.cos(q * 2 * Math.PI)) * (1 - q);
  }

  /** One arm of the edge swirl: its 24 points, from R-50 out to R, turning with p. Pure. */
  function swirlArm(origin, radius, p, arm) {
    var S = ARRIVAL.swirl;
    var pts = [];
    for (var k = 0; k < S.points; k++) {
      var theta = 2 * Math.PI * k / (S.points - 1);
      var r = Math.max(0, radius - S.depth + S.depth * theta / (2 * Math.PI));
      var a = theta + arm * 2 * Math.PI / S.arms + p * 6 * Math.PI;
      pts.push({ x: origin.x + r * Math.cos(a), y: origin.y + r * Math.sin(a) });
    }
    return pts;
  }

  /** The logo-style spiral at the centre of the ring: one arm winding out, turning with p. Pure. */
  function centreSpiral(origin, radius, p) {
    var S = ARRIVAL.spiral;
    var size = Math.min(S.size, radius * 0.7);
    var pts = [];
    if (!(size > 2)) return pts;
    var sweep = S.turns * 2 * Math.PI;
    for (var k = 0; k < S.points; k++) {
      var f = k / (S.points - 1);
      var a = f * sweep + p * S.spin;
      pts.push({ x: origin.x + size * f * Math.cos(a), y: origin.y + size * f * Math.sin(a) });
    }
    return pts;
  }

  /** Which beat a progress falls in: 1, 2 or 3. Pure. */
  function arrivalBeat(p) {
    return p < ARRIVAL.ignite ? 1 : (p < ARRIVAL.snap ? 2 : 3);
  }

  function polyline(ctx, pts, close) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i].x, pts[i].y); else ctx.moveTo(pts[i].x, pts[i].y);
    }
    if (close) ctx.closePath();
  }

  /** An ink line over an orange one: the swirl's two strokes. */
  function swirlStroke(ctx, pts, ink, width) {
    polyline(ctx, pts, false);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = ink;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.orange;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /** The ink tracing every shape of the era-7 frame: table, bands, rails, skyline, paddles. */
  function inkShapes(ctx, T, cam, state) {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = ARRIVAL.inkWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    T.path(ctx, cam, [[0, 0, 0], [800, 0, 0], [800, 600, 0], [0, 600, 0]]);
    ctx.stroke();
    for (var i = 1; i < BANDS.length; i++) {
      var y = BANDS[i].y0;
      var a = T.project(cam, 0, y, 0), b = T.project(cam, 800, y, 0);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    T.path(ctx, cam, [[0, -18, 22], [800, -18, 22], [800, 0, 22], [0, 0, 22]]);
    ctx.stroke();
    for (var k = 0; k < SKYLINE.length; k++) {
      var s = SKYLINE[k];
      T.path(ctx, cam, [[s.x0, SKYLINE_Y, 0], [s.x1, SKYLINE_Y, 0], [s.x1, SKYLINE_Y, s.h], [s.x0, SKYLINE_Y, s.h]]);
      ctx.stroke();
    }
    var ghost = { fill: 'rgba(0,0,0,0)', outline: false };
    ['left', 'right'].forEach(function (side) {
      var faces = T.box(ctx, cam, state[side], 0, PADDLE.z, ghost);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = ARRIVAL.inkWidth;
      ['top', 'near', 'side'].forEach(function (f) {
        if (faces && faces[f]) { polyline(ctx, faces[f], true); ctx.stroke(); }
      });
    });
  }

  function annulus(ctx, o, outer, inner) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, Math.max(0, outer), 0, Math.PI * 2);
    ctx.arc(o.x, o.y, Math.max(0, inner), 0, Math.PI * 2, true);
  }

  function flourish(ctx, p, origin, fromEra, toEra, info) {
    if (toEra !== 7 || (info && info.dim)) return;          // behind the title, and a borrowed look: the plain ring
    var T = R.table3d;
    var state = info && info.state;
    var radius = info && info.radius > 0 ? info.radius : 0;
    var o = origin;
    var width = (info && info.width) || 800, height = (info && info.height) || 600;
    var cam = T ? cameraFor(T, CAMERA) : null;

    // Beat 1: the white page and the bouncing dot.
    if (p < ARRIVAL.ignite) {
      if (radius > 0) {
        ctx.globalAlpha = ARRIVAL.page;
        ctx.fillStyle = PALETTE.paper;
        ctx.beginPath();
        ctx.arc(o.x, o.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      var dx = Math.min(width - ARRIVAL.dot, Math.max(ARRIVAL.dot, o.x));
      var dy = Math.min(height - ARRIVAL.dot, Math.max(ARRIVAL.dot, o.y)) - dotHeight(p);
      ctx.beginPath();
      ctx.arc(dx, dy, ARRIVAL.dot / 2 + 2, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.ink;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dx, dy, ARRIVAL.dot / 2, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.orange;
      ctx.fill();
    }

    // The ink line, from the first frame: it runs just AHEAD of the ring and
    // traces every shape it crosses, so each shape is inked before its colour
    // arrives -- 40 pixels ahead at most, inside the 60-pixel limit.
    if (radius > 0 && p < 1) {
      if (cam && state) {
        ctx.save();
        annulus(ctx, o, radius + ARRIVAL.inkLead, radius - ARRIVAL.inkTrail);
        ctx.clip();
        inkShapes(ctx, T, cam, state);
        ctx.restore();
      }
      // The flat cel band behind it, hard-edged (no gradients in this era).
      var B = ARRIVAL.band;
      if (radius > B.inner) {
        ctx.globalAlpha = B.alpha;
        ctx.fillStyle = PALETTE.orange;
        annulus(ctx, o, radius - B.outer, radius - B.inner);
        ctx.fill('evenodd');
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(o.x, o.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = ARRIVAL.edgeInk;
      ctx.stroke();
    }

    // Beat 2: the swirl on the edge, and the spiral at the centre.
    if (p >= ARRIVAL.ignite && p < ARRIVAL.snap && radius > 0) {
      var S = ARRIVAL.swirl;
      ctx.save();
      annulus(ctx, o, radius + S.outside, radius - S.inside);
      ctx.clip('evenodd');
      for (var arm = 0; arm < S.arms; arm++) swirlStroke(ctx, swirlArm(o, radius, p, arm), S.ink, S.width);
      ctx.restore();
    }
    if (p >= ARRIVAL.ignite * 0.6 && p < 1) {
      var spiral = centreSpiral(o, radius, p);
      if (spiral.length) {
        var fadeIn = Math.min(1, (p - ARRIVAL.ignite * 0.6) / (ARRIVAL.ignite * 0.4));
        var fadeOut = p < ARRIVAL.fade ? 1 : Math.max(0, (1 - p) / (1 - ARRIVAL.fade));
        ctx.globalAlpha = fadeIn * fadeOut;
        swirlStroke(ctx, spiral, ARRIVAL.spiral.ink, ARRIVAL.spiral.width);
        ctx.globalAlpha = 1;
      }
    }

    // Beat 3: comic panel snap.
    if (p >= ARRIVAL.snap && p < 1) {
      var alpha = p < ARRIVAL.fade ? 1 : Math.max(0, (1 - p) / (1 - ARRIVAL.fade));
      var F = ARRIVAL.frame, L = ARRIVAL.action;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = F.width;
      ctx.lineJoin = 'miter';
      ctx.strokeRect(F.x, F.y, F.w, F.h);
      ctx.lineWidth = L.width;
      ctx.lineCap = 'round';
      for (var j = 0; j < L.lines; j++) {
        var ang = j * 2 * Math.PI / L.lines;
        ctx.beginPath();
        ctx.moveTo(o.x + L.inner * Math.cos(ang), o.y + L.inner * Math.sin(ang));
        ctx.lineTo(o.x + (L.inner + L.length) * Math.cos(ang), o.y + (L.inner + L.length) * Math.sin(ang));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  R.registerEra({
    era: 7,
    name: '1999 Sega Dreamcast',
    like: 1,              // paddle colours: the ones the session earned on its first point
    camera: CAMERA,
    card: { flash: '#ffffff', wipe: ['#ee5a24', '#ffffff', '#111111'], box: '#ffffff', border: '#111111',
            inner: null, year: '#ee5a24', name: '#111111', label: '#1e73d8', dots: null },
    // Punchy synth-funk: slap bass, claps, stabs and a short echo (bible chapter 8).
    voice: {
      paddle: [ { wave: 'sawtooth', freq: 110, slideTo: 82, dur: 0.14, gain: 0.30, filter: { type: 'lowpass', freq: 2200, q: 8, to: 300 } },
                { wave: 'noise', dur: 0.06, gain: 0.18, filter: { type: 'bandpass', freq: 1500, q: 1.2 } } ],
      wall:   [ { wave: 'square', freq: 880, dur: 0.05, gain: 0.10, filter: { type: 'lowpass', freq: 3000 } },
                { wave: 'noise', dur: 0.03, gain: 0.12, filter: { type: 'highpass', freq: 6000 } } ],
      score:  [ { wave: 'sawtooth', freq: 311, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
                { wave: 'sawtooth', freq: 392, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
                { wave: 'sawtooth', freq: 466, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
                { wave: 'sawtooth', freq: 587, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
                { wave: 'noise', at: 0.12, dur: 0.08, gain: 0.20, filter: { type: 'bandpass', freq: 1800, q: 1 } },
                { wave: 'sawtooth', freq: 311, at: 0.24, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
                { wave: 'sawtooth', freq: 466, at: 0.24, dur: 0.16, gain: 0.06, unison: { voices: 3, spread: 10 }, filter: { type: 'lowpass', freq: 3500 } },
                { wave: 'sawtooth', freq: 78, dur: 0.10, gain: 0.25 },
                { wave: 'sawtooth', freq: 78, at: 0.24, dur: 0.10, gain: 0.25 } ],
      boot:   [ // the modem answering and screeching, then the startup chime, drops and drum hits
                { wave: 'sine', freq: 2100, dur: 0.5, gain: 0.06 },
                { wave: 'noise', at: 0.5, dur: 0.45, gain: 0.06, filter: { type: 'bandpass', freq: 1800, q: 2 } },
                { wave: 'square', freq: 1200, at: 0.55, dur: 0.3, gain: 0.03 },
                { wave: 'square', freq: 2400, at: 0.6, dur: 0.3, gain: 0.03 },
                { wave: 'sine', freq: 1568, at: 1.0, attack: 0.35, dur: 0.45, gain: 0.12 },
                { wave: 'sine', freq: 1760, slideTo: 2640, at: 1.35, dur: 0.06, gain: 0.10 },
                { wave: 'sine', freq: 1760, slideTo: 2640, at: 1.45, dur: 0.06, gain: 0.10 },
                { wave: 'sine', freq: 1760, slideTo: 2640, at: 1.55, dur: 0.06, gain: 0.10 },
                { wave: 'sine', freq: 110, slideTo: 55, at: 1.75, dur: 0.25, gain: 0.35 },
                { wave: 'sine', freq: 110, slideTo: 55, at: 1.95, dur: 0.25, gain: 0.35 } ],
      effects: { echo: { time: 0.12, feedback: 0.25, mix: 0.2 } }
    },
    draw: draw,
    flourish: flourish,
    // For the arrival's own test (item 1153).
    ARRIVAL: ARRIVAL,
    dotHeight: dotHeight,
    swirlArm: swirlArm,
    centreSpiral: centreSpiral,
    arrivalBeat: arrivalBeat,
    // For the era's own test: the numbers and the pure geometry behind the frame.
    PALETTE: PALETTE,
    BANDS: BANDS,
    SCORE: SCORE,
    SPEED_LINES: SPEED_LINES,
    BURST: BURST,
    SKYLINE: SKYLINE,
    speedLines: speedLines,
    graffiti: graffiti,
    sprayPoint: sprayPoint,
    tagBottom: tagBottom,
    // The rooftop, the tags, the cans and the splat (item 1231).
    SCENE: SCENE,
    WINDOWS: WINDOWS,
    HUD: HUD,
    windowLit: windowLit,
    blimpX: blimpX,
    skyOrder: skyOrder,
    cansFilled: cansFilled,
    splatAlpha: splatAlpha,
    splatShape: splatShape,
    tagsShown: tagsShown,
    tagCells: tagCells,
    tagCentre: tagCentre
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
