/*
 * Era 6 -- 1996 Nintendo 64 (docs/ERAS.md chapter 7, card 1146).
 *
 * Smooth, round, soft and foggy, in toybox colours. The same 2D state every
 * era draws, on the shared 3D table (src/table3d.js), from the closest camera
 * of the six:
 *
 *   - bilinear-blurred textures: the whole world behind play (sky, hills,
 *     table, rails, fog) is drawn at half resolution into a 400 x 300 buffer,
 *     the grass textured from a tiny 16 x 16 tile through 8 x 6 finely cut
 *     quads, and copied up with smoothing ON -- a soft, smeared table;
 *   - heavy distance fog: the far end of the table fades into a pale wall and
 *     the scenery behind it is all but swallowed;
 *   - smooth, rounded low-poly: Gouraud paddles with rounded caps, half-
 *     cylinder rails, and a big smooth ball with a hot specular dot, the
 *     opposite of the PlayStation's faceted gem;
 *   - a saturated cartoon world: blue sky, rolling hills, drifting clouds;
 *   - rumble as screen shake: a brief shake on every paddle hit and a bigger
 *     one on a point, DRAWN only (a translate around the frame), never
 *     applied to the state;
 *   - a muffled, sample-style voice with a bassy thud on hits (voice below).
 *
 * Readability (bible section 5): the paddles and the ball are drawn on the
 * main canvas AFTER the blurred buffer is copied up, so they stay crisp (R2,
 * R4); the ball is last of everything on the table and its core is the only
 * pure white (R1); the shake is 3 pixels or less on a hit, 6 or less on a
 * point, and gone within 0.25 s (R7); the HUD does not shake and sits above
 * the far edge (R8). No per-pixel loops: clips, affine transforms, a pattern,
 * gradients and one drawImage (R10).
 *
 * The file keeps private memory only for the rumble (the last score total and
 * rally count it saw, keyed off state.time). It never writes the state.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // The bible's measured camera for era 6, at rest (section 12).
  var CAMERA = { tilt: 24, height: 1250, fov: 35, screenY: 382 };   // the ladder camera (item 1266)

  var PAL = {
    skyTop: '#3a8ee6', skyHorizon: '#bfe3ff',
    fog: '#b9d4ec', cloud: '#ffffff',
    hillsNear: '#2e9e3e', hillsFar: '#5cbf6a',
    grass: '#3cb93c', grassLight: '#56c96b', grassDark: '#1f7d35',
    rail: '#e4232b', railDark: '#9e1219',
    toyYellow: '#ffc72c', toyBlue: '#1f5fd6', toyGreen: '#15a74a',
    hudFill: '#ffd23c', hudOutline: '#1f3fbf',
    ballCore: '#ffffff', ballRim: '#ffe9a8', ballEdge: '#f0b020'
  };

  // Thick before the far rail (item 1197): the last stretch of court is all but
  // gone at d = 0.85, where the fog is already at its maximum, and mid-court
  // (d = 0.5) is only lightly hazed. The paddle cap below keeps the far paddle
  // legible and the ball is drawn after all of it, so neither is ever lost.
  var FOG = { start: 0.25, end: 0.85, power: 1.4, max: 0.97, colour: PAL.fog };
  var PADDLE_FOG_CAP = 0.35;     // the far paddle is paler, never illegible
  var PADDLE_Z = 24;             // R6: 28 or less
  var BALL_RADIUS = 0.9;         // a big round ball: half as wide again as the stock 0.6 (item 1197)
  var BUFFER = { key: 'n64', w: 400, h: 300 };
  // Checker cells two texels wide: every cell is only two texels across when
  // the table magnifies it, so the smoothing smears half of each cell -- the
  // blur exaggerated, as the ladder asks, rather than a crisp checker.
  var TILE = { key: 'n64-grass', size: 16, cell: 2 };
  var TEXELS_PER_UNIT = 16 / 200;   // one 16-texel tile every 200 field units
  var QUADS = { x: 8, y: 6 };       // fine subdivision: nearly perspective-correct

  var HUD = { cell: 12, gap: 9, top: 20, offset: 110, spread: 3 };

  // ------------------------------------------------ the AAA dressing (item 1230)
  // docs/ART.md, Era 6: a grassy toy park on a sunny afternoon, in the manner of
  // Super Mario 64 / Wave Race 64 / Pilotwings 64. All of it drawn in code.
  //
  // Two flagpoles just beyond the end rails, toy-yellow poles with a waving
  // pennant, fogged at their depth like the rails; three toy-yellow butterflies
  // circling over the far hills. Both go into the half-resolution world, so the
  // bilinear smear takes them with the table.
  var POLES = [
    { x: -40, y: 150, pennant: PAL.toyBlue, out: -1 },
    { x: 840, y: 150, pennant: PAL.toyGreen, out: 1 }
  ];
  // fogged at their depth like the rails, but capped (as the paddles are) so the set dressing still
  // reads: at y 150 the full fog is 0.9, and the first browser look showed bare lines and no cloth.
  var POLE = { height: 90, width: 4, pennant: { w: 30, h: 20 }, swing: 6, rate: 1.5, fogCap: 0.45 };
  // Over the pale wall the world ends in, drawn after it and fogged to 0.4: under it, at the hills'
  // own depth, the first browser look lost them entirely.
  var BUTTERFLIES = { loop: 30, period: 8, wing: 4, flap: 14, fog: 0.4,
                      at: [[190, -74, 0], [430, -86, 2.7], [630, -70, 5.3]] };
  // The power meter: a round pie of 8 slices, one lit per rally hit, reset at
  // the serve (it reads state.rally). The bible puts it UNDER each score; this
  // camera's far edge is at y 102, so under the score (which ends at y 80) it
  // would cross R8's line at 96. It sits beside each score, on its inner side (the outer side of the
  // right-hand score is where the computer's name is written).
  var METER = { r: 14, slices: 8, outline: 2, beside: 22, lit: PAL.toyYellow, unlit: PAL.toyBlue, unlitAlpha: 0.6 };
  // A point: 5 toy-yellow stars pop from the scorer's paddle and arc up and out.
  var STARS = { n: 5, size: 8, life: 0.6, speed: 230, gravity: 420, spread: 120 };
  // Match point: the meters spin once a second, the horizon pulses toy yellow.
  var MATCH = { spin: 1, pulse: 0.15 };

  // The players' sheets (docs/ART.md, Era 6, ASSETS) are embedded as data: URIs
  // in src/textures3d.js like the table's tiles, so they never taint the canvas;
  // src/characters.js asks the sprite loader for them by name, and this hands
  // the loader the embedded picture before it goes looking on disk.
  var SHEETS = ['era6-penguin', 'era6-frog'];
  function primeSheets() {
    var S = root.PongSprites, X = root.PongTextures3D;
    if (!S || !X || !X.TILES || typeof root.Image !== 'function') return 0;
    var n = 0;
    for (var i = 0; i < SHEETS.length; i++) {
      var uri = X.TILES[SHEETS[i]];
      if (!uri || S.status(SHEETS[i]) !== 'unloaded') continue;
      try {
        S.load(SHEETS[i]).src = uri;   // replaces the file load the loader just began
        n++;
      } catch (e) { /* no real Image here (a test's stand-in): the rig draws its placeholder */ }
    }
    return n;
  }
  primeSheets();

  function isMatchPoint(state) {
    var G = root.Pong;
    return !!(G && typeof G.isMatchPoint === 'function' && G.isMatchPoint(state));
  }

  var SHAKE = {
    point: { amp: 6, len: 0.25 },   // R7: 6 px or less, 0.25 s or less
    hit: { amp: 3, len: 0.12 },     // R7: 3 px or less on a hit
    softHit: { amp: 2, len: 0.12 }, // a slow ball's hit rumbles gentler
    fastBall: 600
  };

  // ------------------------------------------------------------------ camera
  var cached = { spec: null, cam: null };
  function cameraFor(T, spec) {
    if (cached.spec !== spec) {
      cached.spec = spec;
      cached.cam = T.camera(spec);
    }
    return cached.cam;
  }

  // ------------------------------------------------------------------ rumble
  // Private memory of what the last frame looked like, so a rise in the rally
  // (a paddle hit) or the score total (a point) starts a shake. A clock that
  // runs backwards is a new game: forget, and do not shake for it.
  var memory = { time: -Infinity, total: null, rally: null, at: -Infinity, amp: 0, len: 0, pointAt: -Infinity };

  function ballSpeed(state) {
    return Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
  }

  /** The frame's shake offset { x, y }, in canvas pixels. Reads state only. */
  function rumble(state) {
    var total = state.score.left + state.score.right;
    var rally = state.rally || 0;
    if (memory.total === null || state.time < memory.time) {
      memory.at = -Infinity;
      memory.pointAt = -Infinity;
    } else if (state.time > memory.time) {
      if (total > memory.total) {
        memory.at = state.time; memory.amp = SHAKE.point.amp; memory.len = SHAKE.point.len;
        memory.pointAt = state.time;
      } else if (rally > memory.rally) {
        var kind = ballSpeed(state) > SHAKE.fastBall ? SHAKE.hit : SHAKE.softHit;
        memory.at = state.time; memory.amp = kind.amp; memory.len = kind.len;
      }
    }
    memory.total = total;
    memory.rally = rally;
    memory.time = state.time;

    var age = state.time - memory.at;
    if (!(age >= 0 && age < memory.len)) return { x: 0, y: 0 };
    var a = memory.amp * Math.pow(1 - age / memory.len, 2);
    var x = a * Math.sin(state.time * 83);
    var y = a * Math.cos(state.time * 71);
    var d = Math.sqrt(x * x + y * y);
    if (d > a && d > 0) { x *= a / d; y *= a / d; }   // never past the amplitude, diagonals included
    return { x: x, y: y };
  }

  // ---------------------------------------------------------------- texture
  var grass = { canvas: null, pattern: null, owner: null };

  /** The 16 x 16 grass tile as a repeating pattern on target; null headless. */
  function grassPattern(T, target) {
    var tile = T.offscreen(TILE.key, TILE.size, TILE.size);
    if (!tile || typeof target.createPattern !== 'function') return null;
    if (grass.canvas !== tile.canvas) {
      var c = tile.ctx;
      var n = TILE.size / TILE.cell;
      for (var i = 0; i < n * n; i++) {
        var cx = i % n, cy = Math.floor(i / n);
        c.fillStyle = (cx + cy) % 2 ? PAL.grassLight : PAL.grass;
        c.fillRect(cx * TILE.cell, cy * TILE.cell, TILE.cell, TILE.cell);
      }
      // A few dark tufts: single texels the bilinear filter smears into soft dots.
      c.fillStyle = PAL.grassDark;
      c.fillRect(5, 1, 1, 1); c.fillRect(1, 10, 1, 1); c.fillRect(13, 6, 1, 1); c.fillRect(10, 13, 1, 1);
      grass.canvas = tile.canvas;
      grass.pattern = null;
    }
    if (!grass.pattern || grass.owner !== target) {
      grass.pattern = target.createPattern(tile.canvas, 'repeat');
      grass.owner = target;
    }
    return grass.pattern;
  }

  /**
   * One screen triangle filled with the pattern through the affine map from
   * texture space (u, v) -- docs/ERAS.md chapter 6's formula. The triangles are
   * small, so the map is nearly perspective-correct.
   */
  function texturedTriangle(ctx, pattern, s, uv) {
    var u0 = uv[0], v0 = uv[1], u1 = uv[2], v1 = uv[3], u2 = uv[4], v2 = uv[5];
    var du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
    var det = du1 * dv2 - du2 * dv1;
    if (!det) return;
    var a = ((s[1].x - s[0].x) * dv2 - (s[2].x - s[0].x) * dv1) / det;
    var b = ((s[1].y - s[0].y) * dv2 - (s[2].y - s[0].y) * dv1) / det;
    var c = ((s[2].x - s[0].x) * du1 - (s[1].x - s[0].x) * du2) / det;
    var d = ((s[2].y - s[0].y) * du1 - (s[1].y - s[0].y) * du2) / det;
    var e = s[0].x - a * u0 - c * v0;
    var f = s[0].y - b * u0 - d * v0;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(s[0].x, s[0].y);
    ctx.lineTo(s[1].x, s[1].y);
    ctx.lineTo(s[2].x, s[2].y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.fillStyle = pattern;
    var uLo = Math.min(u0, u1, u2), vLo = Math.min(v0, v1, v2);
    ctx.fillRect(uLo, vLo, Math.max(u0, u1, u2) - uLo, Math.max(v0, v1, v2) - vLo);
    ctx.restore();
  }

  /** The grass surface: a base fill (no seam sparkle here), then 8 x 6 textured quads. */
  function surface(T, pattern) {
    return function (ctx, cam, pts) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i) ctx.lineTo(pts[i].x, pts[i].y); else ctx.moveTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = PAL.grass;
      ctx.fill();
      if (!pattern) return;
      var sw = T.W / QUADS.x, sh = T.H / QUADS.y, k = TEXELS_PER_UNIT;
      for (var qy = 0; qy < QUADS.y; qy++) {
        for (var qx = 0; qx < QUADS.x; qx++) {
          var x0 = qx * sw, x1 = x0 + sw, y0 = qy * sh, y1 = y0 + sh;
          var p00 = T.project(cam, x0, y0, 0), p10 = T.project(cam, x1, y0, 0);
          var p11 = T.project(cam, x1, y1, 0), p01 = T.project(cam, x0, y1, 0);
          texturedTriangle(ctx, pattern, [p00, p10, p11], [x0 * k, y0 * k, x1 * k, y0 * k, x1 * k, y1 * k]);
          texturedTriangle(ctx, pattern, [p00, p11, p01], [x0 * k, y0 * k, x1 * k, y1 * k, x0 * k, y1 * k]);
        }
      }
    };
  }

  function tracePts(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i].x, pts[i].y); else ctx.moveTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  }

  function ySpan(pts) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < pts.length; i++) { lo = Math.min(lo, pts[i].y); hi = Math.max(hi, pts[i].y); }
    return { top: lo, bottom: hi > lo ? hi : lo + 1 };
  }

  /** The far rail's near face as a half-cylinder: dark, red, dark, fogged at its depth. */
  function railFace(T) {
    return function (ctx, cam, pts) {
      var span = ySpan(pts);
      var g = ctx.createLinearGradient(0, span.top, 0, span.bottom);
      g.addColorStop(0, T.fogColour(PAL.railDark, 0, FOG));
      g.addColorStop(0.5, T.fogColour(PAL.rail, 0, FOG));
      g.addColorStop(1, T.fogColour(PAL.railDark, 0, FOG));
      tracePts(ctx, pts);
      ctx.fillStyle = g;
      ctx.fill();
    };
  }

  // --------------------------------------------------- set dressing (item 1230)
  /** The two flagpoles and their pennants, fogged at their depth; the tip waves. */
  function flagpoles(target, T, cam, t) {
    var P = POLE, w = 2 * Math.PI * P.rate;
    var fog = Math.min(P.fogCap, T.fogAmount(POLES[0].y, FOG));
    function fogged(ink) { return T.mix(ink, FOG.colour, fog); }
    for (var i = 0; i < POLES.length; i++) {
      var pole = POLES[i];
      var foot = T.project(cam, pole.x, pole.y, 0), top = T.project(cam, pole.x, pole.y, P.height);
      target.strokeStyle = fogged(PAL.toyYellow);
      target.lineWidth = Math.max(1, P.width * top.scale);
      target.lineCap = 'round';
      target.beginPath();
      target.moveTo(foot.x, foot.y);
      target.lineTo(top.x, top.y);
      target.stroke();
      // the knob on top
      target.fillStyle = fogged(T.shade(PAL.toyYellow, 0.3));
      target.beginPath();
      target.arc(top.x, top.y, Math.max(1, 2.5 * top.scale), 0, Math.PI * 2);
      target.fill();
      // the pennant: from the pole's top 20 units down, out 30, the tip waving
      var wave = Math.sin(t * w + i * 1.3);
      var hi = T.project(cam, pole.x, pole.y, P.height - 1);
      var lo = T.project(cam, pole.x, pole.y, P.height - 1 - P.pennant.h);
      var mid = T.project(cam, pole.x + pole.out * P.pennant.w * 0.5, pole.y + P.swing * 0.5 * Math.sin(t * w + i * 1.3 - 0.8),
                          P.height - 1 - P.pennant.h * 0.3);
      var tip = T.project(cam, pole.x + pole.out * P.pennant.w, pole.y + P.swing * wave,
                          P.height - 1 - P.pennant.h * 0.5 + 2 * Math.cos(t * w + i * 1.3));
      target.fillStyle = fogged(pole.pennant);
      target.beginPath();
      target.moveTo(hi.x, hi.y);
      target.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
      target.lineTo(lo.x, lo.y);
      target.closePath();
      target.fill();
      // a lighter fold where the cloth turns toward the sun
      target.fillStyle = fogged(T.shade(pole.pennant, 0.3));
      target.beginPath();
      target.moveTo(hi.x, hi.y);
      target.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
      target.lineTo((hi.x + lo.x) / 2, (hi.y + lo.y) / 2);
      target.closePath();
      target.fill();
    }
  }

  /** Three toy-yellow butterflies circling a 60-unit loop over the far hills every 8 s, fogged. */
  function butterflies(target, T, farY, t) {
    var B = BUTTERFLIES;
    target.fillStyle = T.mix(PAL.toyYellow, FOG.colour, B.fog);
    for (var i = 0; i < B.at.length; i++) {
      var a = 2 * Math.PI * t / B.period + B.at[i][2];
      var x = B.at[i][0] + B.loop * Math.cos(a), y = farY + B.at[i][1] + B.loop * 0.4 * Math.sin(a);
      var open = 0.35 + 0.65 * Math.abs(Math.sin(t * B.flap + i));   // the wings beat
      for (var s = -1; s <= 1; s += 2) {
        target.save();
        target.translate(x + s * B.wing * 0.3 * open, y);
        target.scale(open, 1);
        target.beginPath();
        target.arc(0, 0, B.wing * 0.5, 0, Math.PI * 2);
        target.fill();
        target.restore();
      }
    }
  }

  /** Match point: the sky's horizon pulses toward toy yellow, once a second. */
  function horizonPulse(target, T, farY, t) {
    var k = MATCH.pulse * (0.5 - 0.5 * Math.cos(2 * Math.PI * t));
    if (!(k > 0.005)) return;
    var g = target.createLinearGradient(0, farY * 0.3, 0, farY);
    g.addColorStop(0, T.rgba(PAL.toyYellow, 0));
    g.addColorStop(1, T.rgba(PAL.toyYellow, k));
    target.fillStyle = g;
    target.fillRect(0, farY * 0.3, T.W, farY * 0.7);
  }

  // ------------------------------------------------------------- the world
  /**
   * Steps 1 to 3 of the painter's order, in field units on target: the sky,
   * clouds, fogged hills and the pale wall the world ends in, the ground
   * beside the table, the textured table and its rails, and the fog band.
   */
  function world(target, T, cam, state, pattern) {
    var W = T.W, H = T.H;
    var farY = T.project(cam, W / 2, 0, 0).y;
    var nearY = T.project(cam, W / 2, H, 0).y;

    // 1. the sky, saturated at the top, pale at the horizon
    var sky = target.createLinearGradient(0, 0, 0, farY);
    sky.addColorStop(0, PAL.skyTop);
    sky.addColorStop(1, PAL.skyHorizon);
    target.fillStyle = sky;
    target.fillRect(0, 0, W, H);
    if (isMatchPoint(state)) horizonPulse(target, T, farY, state.time);

    // two clouds, three overlapping circles each, drifting 4 units a second.
    // A breath off pure white, so the ball stays the brightest thing (R1).
    target.fillStyle = T.mix(PAL.cloud, PAL.skyHorizon, 0.15);
    var clouds = [[140, 30, 1], [560, 52, 0.8]];
    for (var ci = 0; ci < clouds.length; ci++) {
      var span = W + 240;
      var cx = ((clouds[ci][0] + state.time * 4) % span + span) % span - 120;
      var cs = clouds[ci][2];
      var puffs = [[-26, 6, 18], [0, 0, 24], [28, 6, 17]];
      for (var pi = 0; pi < puffs.length; pi++) {
        target.beginPath();
        target.arc(cx + puffs[pi][0] * cs, clouds[ci][1] + puffs[pi][1] * cs, puffs[pi][2] * cs, 0, Math.PI * 2);
        target.fill();
      }
    }

    // three rolling hills behind the far wall, far ones first, taking the fog
    // at their depth: the farther, the closer to the fog wall itself
    var hills = [
      { cx: 170, rx: 300, top: 44, depth: -90, ink: PAL.hillsFar },
      { cx: 640, rx: 330, top: 34, depth: -45, ink: PAL.hillsFar },
      { cx: 400, rx: 380, top: 18, depth: -20, ink: PAL.hillsNear }
    ];
    for (var hi = 0; hi < hills.length; hi++) {
      var h = hills[hi];
      // a half-ellipse, as an arc under a vertical squash (no ctx.ellipse needed)
      target.save();
      target.translate(h.cx, farY + 40);
      target.scale(1, (h.top + 40) / h.rx);
      target.beginPath();
      target.arc(0, 0, h.rx, Math.PI, Math.PI * 2);
      target.closePath();
      target.fillStyle = T.fogColour(h.ink, h.depth, FOG);
      target.fill();
      target.restore();
    }

    // the world ends in a pale wall: fully fogged from d = 0.85, before the far rail
    var wall = target.createLinearGradient(0, farY - 60, 0, farY);
    wall.addColorStop(0, T.rgba(PAL.fog, 0));
    wall.addColorStop(1, T.rgba(PAL.fog, FOG.max));
    target.fillStyle = wall;
    target.fillRect(0, farY - 60, W, 60);
    butterflies(target, T, farY, state.time);

    // the ground beside the table, fogged along its depth
    var ground = target.createLinearGradient(0, farY, 0, nearY);
    for (var gi = 0; gi <= 4; gi++) {
      ground.addColorStop(gi / 4, T.fogColour(PAL.hillsNear, H * gi / 4, FOG));
    }
    target.fillStyle = ground;
    target.fillRect(0, farY, W, H - farY);

    // 2. the table: through the real 3D layer when the page has WebGL (item 1273),
    // which then draws the bats and the ball too
    var gl = T.field(target, cam, {
      surface: surface(T, pattern),
      line: T.fogColour(PAL.toyYellow, 300, FOG),
      rail: railFace(T),
      railTop: T.fogColour(T.shade(PAL.rail, 0.3), -18, FOG),
      nearLip: PAL.railDark,
      texture: TEXTURE.court,
      trim: TEXTURE.trim
    }, state, R);
    flagpoles(target, T, cam, state.time);

    // 3. on the table: the fog band swallowing the far end
    T.fogBand(target, cam, FOG);
    return gl;
  }

  // The pixellab tiles (item 1187), laid over the era's own fills through the
  // shared table: bilinear-filtered (the N64 smoothed every texel), drawn into
  // the half-resolution world so the blur takes them too, and the court's
  // grain fades into the fog before the far end, as the cartridge's did.
  var TEXTURE = {
    court: { name: 'court-grain', alpha: 0.55, blend: 'overlay', period: 120, strip: 1, fade: 0.85, smooth: true },
    trim: { name: 'trim', alpha: 0.35, blend: 'soft-light', period: 30, smooth: true },
    paddle: { name: 'paddle', alpha: 0.3, blend: 'soft-light', period: 20, smooth: true },
    ball: { name: 'ball', alpha: 0.35, blend: 'soft-light', period: 12, smooth: true }
  };

  // --------------------------------------------------------------- paddles
  /** A smooth-shaded box with rounded caps, fogged at its depth up to the cap. */
  function paddle(ctx, T, cam, rect, ink) {
    var fogged = T.mix(ink, FOG.colour, Math.min(PADDLE_FOG_CAP, T.fogAmount(rect.y + rect.h, FOG)));
    var faces = T.box(ctx, cam, rect, 0, PADDLE_Z,
      { ink: fogged, shade: 'gradient', light: { top: 0.3, near: 0, side: -0.3 }, outline: false, texture: TEXTURE.paddle });
    // Rounded ends: a projected half-ellipse cap on the top face at each end.
    var r = rect.w / 2, cx = rect.x + r;
    var ends = [[rect.y + r, Math.PI], [rect.y + rect.h - r, 0]];
    ctx.fillStyle = T.shade(fogged, 0.35);
    for (var e = 0; e < ends.length; e++) {
      var pts = [];
      for (var i = 0; i <= 8; i++) {
        var a = ends[e][1] + Math.PI * i / 8;
        pts.push([cx + r * Math.cos(a), ends[e][0] + r * Math.sin(a), PADDLE_Z]);
      }
      T.path(ctx, cam, pts);
      ctx.fill();
    }
    return faces;
  }

  // ------------------------------------------------------------------ ball
  function ballStyle(ctx) {
    return {
      radius: BALL_RADIUS,
      shadow: 'rgba(12,56,24,0.55)',
      outline: false,
      texture: TEXTURE.ball,
      fill: function (sx, sy, sr) {
        // a smooth sphere: the hot spot at the upper-left third, rim to gold
        var g = ctx.createRadialGradient(sx - sr / 3, sy - sr / 3, 0, sx, sy, sr);
        g.addColorStop(0, PAL.ballCore);
        g.addColorStop(0.45, PAL.ballRim);
        g.addColorStop(1, PAL.ballEdge);
        return g;
      }
    };
  }

  // ------------------------------------------------------------------- HUD
  /** The score, outlined toy-style: 8 offset passes in outline blue, then the fill. */
  function hud(ctx, P, state) {
    var mid = state.width / 2;
    var d = HUD.spread;
    var offsets = [[-d, -d], [0, -d], [d, -d], [-d, 0], [d, 0], [-d, d], [0, d], [d, d]];
    for (var s = 0; s < 2; s++) {
      var side = s ? 'right' : 'left';
      var at = mid + (s ? 1 : -1) * HUD.offset;
      var text = String(state.score[side]);
      ctx.fillStyle = PAL.hudOutline;
      for (var o = 0; o < offsets.length; o++) {
        P.drawText(ctx, text, at + offsets[o][0], HUD.top + offsets[o][1], HUD.cell, HUD.gap);
      }
      ctx.fillStyle = PAL.hudFill;
      P.drawText(ctx, text, at, HUD.top, HUD.cell, HUD.gap);
      // the power meter, on the score's inner side (item 1230)
      var half = (text.length * 3 * HUD.cell + (text.length - 1) * HUD.gap) / 2;
      powerMeter(ctx, at - (s ? 1 : -1) * (half + METER.beside), HUD.top + 2.5 * HUD.cell,
                 state.rally || 0, isMatchPoint(state) ? state.time * MATCH.spin * 2 * Math.PI : 0);
    }
  }

  /** How many of the meter's slices are lit: one per rally hit, all 8 at most. */
  function meterLit(rally) { return Math.max(0, Math.min(METER.slices, Math.floor(rally) || 0)); }

  /** A round pie-slice power meter: lit slices toy yellow, the rest toy blue at 0.6, outlined. */
  function powerMeter(ctx, cx, cy, rally, turn) {
    var M = METER, lit = meterLit(rally), step = 2 * Math.PI / M.slices;
    for (var i = 0; i < M.slices; i++) {
      var a0 = -Math.PI / 2 + turn + i * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, M.r, a0, a0 + step);
      ctx.closePath();
      ctx.globalAlpha = i < lit ? 1 : M.unlitAlpha;
      ctx.fillStyle = i < lit ? M.lit : M.unlit;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PAL.hudOutline;
    ctx.lineWidth = M.outline;
    for (var j = 0; j < M.slices; j++) {   // the slice lines, then the rim
      var a = -Math.PI / 2 + turn + j * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + M.r * Math.cos(a), cy + M.r * Math.sin(a));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, M.r, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // ------------------------------------------------------ the point (item 1230)
  /**
   * The point moment's stars: { side, age } while they fly, else null. Every
   * point below the Xbox 360 moves the machine up an era, so the point is at
   * state.eraChangedAt, and the side that scored is the one the ball did NOT
   * go out past (state.missAt). The rumble's own memory covers a point with no
   * era change (a match made longer than the ladder).
   */
  function starsAt(state) {
    var at = -Infinity;
    if (state.eraChangedAt > 0) at = state.eraChangedAt;
    if (memory.pointAt > at) at = memory.pointAt;
    var age = state.time - at;
    if (!(age >= 0 && age < STARS.life) || !state.missAt) return null;
    return { side: state.missAt.x < state.width / 2 ? 'right' : 'left', age: age };
  }

  function starPath(ctx, x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
      else ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath();
  }

  /** Five toy-yellow stars popping from the scorer's paddle, arcing up and out over 0.6 s. */
  function pointStars(ctx, T, cam, state) {
    var st = starsAt(state);
    if (!st) return false;
    var p = state[st.side], out = st.side === 'left' ? -1 : 1;
    var from = T.project(cam, p.x + p.w / 2, p.y + p.h / 2, PADDLE_Z);
    var u = st.age / STARS.life, fade = 1 - Math.max(0, (u - 0.6) / 0.4);
    ctx.fillStyle = PAL.toyYellow;
    ctx.strokeStyle = T.shade(PAL.toyYellow, -0.4);
    ctx.lineWidth = 1;
    ctx.globalAlpha = fade;
    for (var i = 0; i < STARS.n; i++) {
      // fanned from straight up to STARS.spread degrees out, away from the table's middle
      var a = (-90 + out * STARS.spread * (i / (STARS.n - 1)) * 0.5 - out * 15) * Math.PI / 180;
      var x = from.x + Math.cos(a) * STARS.speed * st.age;
      var y = from.y + Math.sin(a) * STARS.speed * st.age + 0.5 * STARS.gravity * st.age * st.age;
      starPath(ctx, x, y, STARS.size / 2 * (1 + 0.3 * Math.sin(st.age * 30 + i)));
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return true;
  }

  // ------------------------------------------------------------------ draw
  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);
    var T = P.table3d;
    if (!T) return P.drawBase(ctx, state, opts);
    var cam = cameraFor(T, CAMERA);
    var shake = rumble(state);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(shake.x, shake.y);   // the rumble: drawn, never applied to the state

    // what a shaken frame uncovers at the canvas edge
    ctx.fillStyle = PAL.skyHorizon;
    ctx.fillRect(-8, -8, state.width + 16, state.height + 16);

    // 1-3. the world, at half resolution, copied up smoothed: the blur
    var buf = T.offscreen(BUFFER.key, BUFFER.w, BUFFER.h);
    var gl;
    if (buf) {
      var b = buf.ctx;
      b.setTransform(BUFFER.w / state.width, 0, 0, BUFFER.h / state.height, 0, 0);
      b.imageSmoothingEnabled = true;
      gl = world(b, T, cam, state, grassPattern(T, b));
      b.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buf.canvas, 0, 0, state.width, state.height);
    } else {
      // headless: the same world straight onto the canvas, flat grass
      gl = world(ctx, T, cam, state, null);
    }

    // 4. paddles, crisp on the main canvas, the far one first
    var sides = ['left', 'right'];
    if (state.right.y + state.right.h < state.left.y + state.left.h) sides.reverse();
    for (var i = 0; !gl && i < sides.length; i++) {
      paddle(ctx, T, cam, state[sides[i]], P.paddleInk(state, sides[i]));
    }

    // 7. the ball, last of everything on the table; hidden in the serve pause
    if (!gl && state.serveDelay <= 0) {
      var s = T.ball(ctx, cam, state.ball, ballStyle(ctx));
      // the specular dot: the hottest, sharpest point on screen
      ctx.beginPath();
      ctx.arc(s.x - s.r * 0.38, s.y - s.r * 0.4, Math.max(1.2, s.r * 0.22), 0, Math.PI * 2);
      ctx.fillStyle = PAL.ballCore;
      ctx.fill();
    }

    // the point moment: stars from the scorer's paddle (item 1230); they shake with the world
    pointStars(ctx, T, cam, state);
    ctx.restore();

    // 8. the HUD, above the far edge, not shaking
    ctx.save();
    hud(ctx, P, state);
    ctx.restore();
  }

  // ------------------------------------------------------------ the arrival (item 1152)
  /*
   * THE NINTENDO 64 ARRIVES (docs/ERAS.md chapter 7, "Arrival flourish"), drawn
   * over the engine's ring, which stays the truth of which era draws where.
   * Three beats on the ring's eased progress p:
   *   1. ignition (p 0 to 0.25): the world fades up out of fog at the spot the
   *      ball went out -- a pale fog disc at 0.9 in the middle, thinning to
   *      nothing by p = 0.25. Keyed off the time too, because the ring is under
   *      a unit wide for its first frames.
   *   2. the edge (p 0.25 to 0.8): the crisp, jittery PlayStation picture goes
   *      SOFT from the origin outward -- the frame just outside the ring is
   *      copied down to a fifth of its size and back up smoothed, so the old
   *      picture melts into a blur as the ring reaches it (the melt) -- under
   *      the chapter's soft fat band (white at 0.5, then fog at 0.8), with four
   *      smooth toy balls riding the edge. Fog POURS over the far end of the
   *      table, rolling down from the far wall toward the player and drawing
   *      back into the era's own fog band as the ring finishes.
   *   3. arrival (p 0.8 to 1): once the ring has passed the middle of the field,
   *      a cube in the field's own colours (grass, rail red, toy yellow, toy
   *      blue) pops in above the name card and spins once, smooth-shaded, in
   *      the manner of the era's logo intros. It is a plain cube -- no letter,
   *      no maker's mark (bible rule 1.9) -- and it is done spinning, and gone,
   *      by the time the ring is.
   * The boot sting, with its soft swoop, is the voice's `boot` list below,
   * sounded by the player for the point; a flourish plays nothing. Everything
   * stays within 60 of the ring (section 4's law) and the whole flourish ends
   * with the ring, inside the serve pause.
   */
  var ARRIVAL = {
    ignition: 0.25, settle: 0.8,
    fogCore: 0.9, fogOpen: 300, reach: 60,
    melt: { scale: 5, inside: 16, outside: 56, key: 'n64-melt' },
    band: { inside: 28, outside: 12, white: 0.5, fog: 0.8 },
    balls: { r: 10, turns: 2, colours: [PAL.rail, PAL.toyYellow, PAL.toyGreen, PAL.toyBlue] },
    pour: { from: 0.18, depth: 0.5, alpha: 0.55, spill: 60, wisps: 6 },
    cube: { x: 400, y: 150, size: 30, tilt: 0.5, eye: 7, spinTo: 0.85, pop: 0.2,
            faces: [PAL.grass, PAL.rail, PAL.toyYellow, PAL.toyBlue], top: PAL.grassLight, bottom: PAL.grassDark }
  };

  function clamp01(v) { return v > 0 ? (v < 1 ? v : 1) : 0; }
  function smooth(u) { u = clamp01(u); return u * u * (3 - 2 * u); }

  /** How strongly beat 2 shows at p: in over the ignition, full across the field, out by the end. */
  function edgeStrength(p) {
    return clamp01(p / ARRIVAL.ignition) * (1 - clamp01((p - 0.9) / 0.1));
  }

  /** The fog pour at p: { k, alpha } -- how far it has rolled (0 to 1 of its depth) and how thick it is. */
  function pourAt(p) {
    var A = ARRIVAL.pour;
    var u = clamp01((p - A.from) / (1 - A.from));
    var k = Math.sin(Math.PI * u);           // rolls in, then draws back to the era's own band
    return { k: k, alpha: A.alpha * k };
  }

  /** The cube's life at p: null before the ring has reached it; else { u, angle, scale, alpha }. */
  function cubeAt(p, origin, radius) {
    var C = ARRIVAL.cube;
    var dx = C.x - origin.x, dy = C.y - origin.y;
    var need = Math.sqrt(dx * dx + dy * dy) + C.size * 2;   // the whole cube inside the ring
    if (!(radius >= need)) return null;
    // p when the ring reached it: the ring grows in proportion to p, so R / p is its reach.
    var reach = p > 0 ? radius / p : 0;
    var start = reach > 0 ? Math.min(0.95, need / reach) : 0.95;
    var u = clamp01((p - start) / (1 - start));
    var spin = smooth(u / C.spinTo);
    var pop = clamp01(u / C.pop);
    var scale = pop < 1 ? 1 + 2.2 * Math.pow(pop - 1, 3) + 1.2 * Math.pow(pop - 1, 2) : 1;   // one springy overshoot
    return { u: u, angle: 2 * Math.PI * spin, scale: Math.max(0, scale),
             alpha: 1 - clamp01((u - C.spinTo) / (1 - C.spinTo)) };
  }

  var CUBE_FACES = [   // corner indices, and which colour; corners are (+-1, +-1, +-1)
    { v: [0, 1, 3, 2], c: 'bottom' }, { v: [4, 6, 7, 5], c: 'top' },
    { v: [0, 4, 5, 1], c: 0 }, { v: [1, 5, 7, 3], c: 1 },
    { v: [3, 7, 6, 2], c: 2 }, { v: [2, 6, 4, 0], c: 3 }
  ];

  /** The cube's six faces on screen, back to front, the hidden ones left out. */
  function cubeFaces(cx, cy, size, angle) {
    var C = ARRIVAL.cube;
    var ca = Math.cos(angle + Math.PI / 4), sa = Math.sin(angle + Math.PI / 4);
    var ct = Math.cos(C.tilt), st = Math.sin(C.tilt);
    var pts = [];
    for (var i = 0; i < 8; i++) {
      var x = i & 1 ? 1 : -1, y = i & 4 ? 1 : -1, z = i & 2 ? 1 : -1;   // y is up
      var rx = x * ca - z * sa, rz = x * sa + z * ca;                     // spin about the vertical
      var ry = y * ct - rz * st, rz2 = y * st + rz * ct;                  // lean the top toward the eye
      var k = C.eye / (C.eye + rz2);
      pts.push({ x: cx + rx * size * k, y: cy - ry * size * k, z: rz2 });
    }
    var out = [];
    for (var f = 0; f < CUBE_FACES.length; f++) {
      var q = CUBE_FACES[f].v.map(function (n) { return pts[n]; });
      var cross = (q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[1].y - q[0].y) * (q[2].x - q[0].x);
      if (cross >= 0) continue;                                           // facing away
      out.push({ pts: q, colour: CUBE_FACES[f].c, depth: (q[0].z + q[1].z + q[2].z + q[3].z) / 4 });
    }
    out.sort(function (a, b) { return b.depth - a.depth; });
    return out;
  }

  /** The melt: the frame just outside the ring, smeared by a fifth-size copy, fading out past the edge. */
  function melt(ctx, origin, r, k, W, H) {
    var M = ARRIVAL.melt, T = R.table3d, src = ctx.canvas;
    if (!T || !src || !(src.width > 0) || typeof ctx.drawImage !== 'function') return false;
    var sw = Math.ceil(W / M.scale), sh = Math.ceil(H / M.scale);
    var buf = T.offscreen(M.key, sw, sh);
    if (!buf || typeof buf.ctx.createRadialGradient !== 'function') return false;
    var b = buf.ctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.clearRect(0, 0, sw, sh);
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = 'high';
    b.drawImage(src, 0, 0, src.width, src.height, 0, 0, sw, sh);
    // keep only a soft ring around the edge: none inside, strongest just past it, gone by +56
    var inner = Math.max(0, r - M.inside), outer = r + M.outside;
    var g = b.createRadialGradient(origin.x / M.scale, origin.y / M.scale, inner / M.scale,
                                   origin.x / M.scale, origin.y / M.scale, outer / M.scale);
    var peak = (r + 6 - inner) / (outer - inner);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(clamp01(peak), 'rgba(0,0,0,' + (0.95 * k).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    b.globalCompositeOperation = 'destination-in';
    b.fillStyle = g;
    b.fillRect(0, 0, sw, sh);
    b.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buf.canvas, 0, 0, sw, sh, 0, 0, W, H);
    return true;
  }

  function ring(ctx, x, y, r0, r1) {
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, Math.PI * 2);
    if (r0 > 0) ctx.arc(x, y, r0, 0, Math.PI * 2, true);
  }

  /** The flourish hook (the header of src/erachange.js is the contract). */
  function arrival(ctx, p, origin, fromEra, toEra, info) {
    if (toEra !== 6 || !info || info.dim) return;   // this era's arrival only, never behind the title
    var A = ARRIVAL, T = R.table3d, r = Math.max(0, info.radius || 0), t = info.t || 0;
    var W = info.width || 800, H = info.height || 600, ox = origin.x, oy = origin.y;
    var TAU = Math.PI * 2;

    // 2a. the melt, first, so everything after sits crisp on the softened picture
    var k = edgeStrength(p);
    if (r > 1 && k > 0) melt(ctx, origin, r, k, W, H);

    // 2b. fog pours over the far end of the table, inside the ring
    var pour = pourAt(p);
    if (T && pour.alpha > 0.01 && r > 1) {
      var cam = cameraFor(T, CAMERA);
      var farY = T.project(cam, W / 2, 0, 0).y, nearY = T.project(cam, W / 2, H, 0).y;
      var front = farY + (nearY - farY) * A.pour.depth * pour.k;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ox, oy, r + A.reach * 0.5, 0, TAU);
      ctx.clip();
      var sheet = ctx.createLinearGradient(0, farY - A.pour.spill, 0, front);
      sheet.addColorStop(0, T.rgba(PAL.fog, pour.alpha));
      sheet.addColorStop(0.55, T.rgba(PAL.fog, pour.alpha * 0.8));
      sheet.addColorStop(1, T.rgba(PAL.fog, 0));
      ctx.fillStyle = sheet;
      ctx.fillRect(0, farY - A.pour.spill, W, front - farY + A.pour.spill);
      // billows along the front, rolling toward the player
      for (var i = 0; i < A.pour.wisps; i++) {
        var wx = ((i + 0.5) / A.pour.wisps) * W + 22 * Math.sin(t * 2.2 + i * 1.9);
        var wr = 46 + 14 * Math.sin(i * 2.7);
        var puff = ctx.createRadialGradient(wx, front - wr * 0.3, 0, wx, front - wr * 0.3, wr);
        puff.addColorStop(0, T.rgba(PAL.fog, pour.alpha * 0.7));
        puff.addColorStop(1, T.rgba(PAL.fog, 0));
        ctx.fillStyle = puff;
        ctx.beginPath();
        ctx.arc(wx, front - wr * 0.3, wr, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // 1. ignition: the world fades up out of fog at the point
    var lift = 1 - clamp01(p / A.ignition);
    if (lift > 0) {
      var fr = Math.max(r, Math.min(A.reach, A.fogOpen * t));
      if (fr > 0.5) {
        var disc = ctx.createRadialGradient(ox, oy, 0, ox, oy, fr);
        disc.addColorStop(0, T ? T.rgba(PAL.fog, A.fogCore * lift) : PAL.fog);
        disc.addColorStop(1, T ? T.rgba(PAL.fog, 0) : PAL.fog);
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(ox, oy, fr, 0, TAU);
        ctx.fill();
      }
    }

    // 2c. the soft fat band on the edge, and four toy balls riding it
    if (r > 1 && k > 0 && T) {
      var B = A.band, b0 = Math.max(0, r - B.inside), b1 = r + B.outside;
      var soft = ctx.createRadialGradient(ox, oy, b0, ox, oy, b1);
      soft.addColorStop(0, T.rgba(PAL.fog, 0));
      soft.addColorStop(0.45, T.rgba('#ffffff', B.white * k));
      soft.addColorStop(0.75, T.rgba(PAL.fog, B.fog * k));
      soft.addColorStop(1, T.rgba(PAL.fog, 0));
      ctx.fillStyle = soft;
      ring(ctx, ox, oy, b0, b1);
      ctx.fill();

      var balls = A.balls;
      for (var j = 0; j < balls.colours.length; j++) {
        var a = p * balls.turns * TAU + j * Math.PI / 2;
        var bx = ox + Math.cos(a) * r, by = oy + Math.sin(a) * r;
        var shine = ctx.createRadialGradient(bx - balls.r / 3, by - balls.r / 3, 0, bx, by, balls.r);
        shine.addColorStop(0, T.mix('#ffffff', balls.colours[j], 0.25));
        shine.addColorStop(0.5, balls.colours[j]);
        shine.addColorStop(1, T.shade(balls.colours[j], -0.35));
        ctx.globalAlpha = k;
        ctx.fillStyle = shine;
        ctx.beginPath();
        ctx.arc(bx, by, balls.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 3. the cube: pops in once the ring has reached it, spins once, bows out with the ring
    var cube = cubeAt(p, origin, r);
    if (cube && cube.alpha > 0 && cube.scale > 0 && T) {
      var C = A.cube, size = C.size * cube.scale;
      ctx.globalAlpha = cube.alpha;
      var halo = ctx.createRadialGradient(C.x, C.y, 0, C.x, C.y, size * 2.6);
      halo.addColorStop(0, T.rgba(PAL.fog, 0.6));
      halo.addColorStop(1, T.rgba(PAL.fog, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(C.x, C.y, size * 2.6, 0, TAU);
      ctx.fill();
      var faces = cubeFaces(C.x, C.y, size, cube.angle);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      for (var f = 0; f < faces.length; f++) {
        var q = faces[f].pts;
        var ink = typeof faces[f].colour === 'number' ? C.faces[faces[f].colour] : C[faces[f].colour];
        var shade = ctx.createLinearGradient(q[0].x, q[0].y, q[2].x, q[2].y);   // Gouraud across the face
        shade.addColorStop(0, T.shade(ink, 0.3));
        shade.addColorStop(1, T.shade(ink, -0.25));
        ctx.beginPath();
        ctx.moveTo(q[0].x, q[0].y);
        for (var n = 1; n < 4; n++) ctx.lineTo(q[n].x, q[n].y);
        ctx.closePath();
        ctx.fillStyle = shade;
        ctx.fill();
        ctx.strokeStyle = T.shade(ink, -0.45);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  R.registerEra({
    era: 6,
    name: '1996 Nintendo 64',
    like: 1,              // paddle colours: the ones the session earned on its first point
    camera: CAMERA,
    fog: FOG,
    palette: PAL,
    shake: SHAKE,
    card: { flash: '#ffffff', wipe: ['#b9d4ec', '#3cb93c', '#1f5fd6'], box: '#1f5fd6', border: '#ffc72c',
            inner: null, year: '#ffc72c', name: '#ffffff', label: '#bfe3ff', dots: null },
    // Low sample rate, rounded, springy; everything through the muffling bus.
    // The filter, noise, unison, reverb and bus fields are the bible's voice
    // grammar (section 3); the player sounds the plain notes today and picks
    // the rest up when they are built.
    voice: {
      paddle: [ { wave: 'square', freq: 392, dur: 0.12, gain: 0.18, filter: { type: 'lowpass', freq: 1400, q: 4, to: 500 } },
                { wave: 'sine', freq: 98, slideTo: 70, dur: 0.10, gain: 0.30 } ],
      wall:   [ { wave: 'triangle', freq: 587, slideTo: 880, dur: 0.09, gain: 0.20 } ],
      score:  [ { wave: 'square', freq: 784, dur: 0.08, gain: 0.12, filter: { type: 'lowpass', freq: 2500 } },
                { wave: 'square', freq: 1047, at: 0.08, dur: 0.40, gain: 0.12, filter: { type: 'lowpass', freq: 2500 } },
                { wave: 'sine', freq: 1047, at: 0.08, dur: 0.50, gain: 0.12 } ],
      boot:   [ // the cartridge snap, then a bright chorus chord (invented: the machine had no boot sound)
                { wave: 'noise', dur: 0.02, gain: 0.25, filter: { type: 'bandpass', freq: 1800, q: 3 } },
                { wave: 'sawtooth', freq: 523, at: 0.12, attack: 0.01, dur: 0.9, gain: 0.06, unison: { voices: 3, spread: 15 }, filter: { type: 'lowpass', freq: 2800 } },
                { wave: 'sawtooth', freq: 659, at: 0.12, attack: 0.01, dur: 0.9, gain: 0.06, unison: { voices: 3, spread: 15 }, filter: { type: 'lowpass', freq: 2800 } },
                { wave: 'sawtooth', freq: 784, at: 0.12, attack: 0.01, dur: 0.9, gain: 0.06, unison: { voices: 3, spread: 15 }, filter: { type: 'lowpass', freq: 2800 } },
                { wave: 'sine', freq: 131, at: 0.12, dur: 0.9, gain: 0.25 },
                // the soft swoop the arrival rides on (item 1152): a rounded sine gliding up
                // an octave and a half as the fog rolls in, a quieter one an octave under it
                { wave: 'sine', freq: 262, slideTo: 784, at: 0.04, attack: 0.18, dur: 0.7, gain: 0.12,
                  filter: { type: 'lowpass', freq: 1600 } },
                { wave: 'triangle', freq: 131, slideTo: 392, at: 0.04, attack: 0.18, dur: 0.7, gain: 0.07 } ],
      effects: { bus: { type: 'lowpass', freq: 3200, q: 0.7 }, reverb: { seconds: 1.0, decay: 3, mix: 0.2 } }
    },
    draw: draw,
    arrival: { spec: ARRIVAL, pourAt: pourAt, cubeAt: cubeAt, cubeFaces: cubeFaces, edgeStrength: edgeStrength },
    flourish: arrival,
    // the AAA dressing (item 1230, docs/ART.md Era 6), for the tests
    dressing: { POLES: POLES, POLE: POLE, BUTTERFLIES: BUTTERFLIES, METER: METER, STARS: STARS, MATCH: MATCH,
                SHEETS: SHEETS, meterLit: meterLit, starsAt: starsAt, primeSheets: primeSheets }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
