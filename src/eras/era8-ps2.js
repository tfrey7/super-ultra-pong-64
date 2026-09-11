/*
 * Era 8 -- 2000 PlayStation 2: the machine that wanted to be a film
 * (docs/ERAS.md chapter 9).
 *
 * The same 2D state every era draws, laid on the shared 3D table
 * (src/table3d.js) and shot like a cutscene: black letterbox bars with the
 * score as a subtitle, a dark glossy slab that mirrors the paddles, a camera
 * that drifts slowly on three unrelated periods, dust hanging in the air,
 * sparks spraying off every paddle hit, an alpha-glow trail and halo behind
 * the ball, and a lens flare from a light just above the far rail.
 *
 * Nothing here feeds back into play. The file keeps private memory of its own
 * (a fixed pool of sparks, the last ten ball points) keyed off state.time, and
 * it never writes the state: a spark is born when the rally count rises, and
 * its position after that is a pure function of its birth and the clock, so
 * drawing the same moment twice draws the same frame.
 *
 * Painter's order (bible 2.5): backdrop, table, on-the-table (vignette,
 * reflections, dust), paddles, behind-ball (trail, halo, sparks), post
 * (flare), the ball, the letterbox and subtitle. The ball is the brightest and
 * sharpest thing on screen (R1, R2): white, after every glow, never blurred.
 * The paddles wear their earned colours at full strength, after the vignette
 * (R4). Control is untouched (bible 1.2).
 *
 * One number differs from chapter 9, for a stated reason: the flare's light
 * is the world point (120, -40, 60), not (120, -400, 600). The bible's point
 * projects 490 to 600 pixels ABOVE the canvas in every drift pose (a camera
 * looking 60 degrees below the horizon cannot see a light that high), so the
 * source never showed and only two of five ghosts reached the frame. The new
 * point sits just behind the far rail and lands at screen y 25 to 54, under
 * the edge of the top bar, so the glow spills out from behind the letterbox
 * and never sits over the table in any pose.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // ------------------------------------------------------------ the numbers
  var C = {
    letterbox: '#000000', navy: '#0b1020', midnight: '#141c33', slate: '#2d3e50',
    slab: '#1c2536', sheen: '#3a4a66', amber: '#ffb347', ember: '#ff7a1a',
    spark: '#ffd890', flare: '#9fc4ff', dust: '#d8d0c0', hud: '#c9d6e8',
    core: '#ffffff', glow: '#ffb347'
  };

  var CAMERA = { tilt: 30, height: 1250, fov: 29, screenY: 281 };
  // Slow drift, each term slower than one cycle in 12 s (R7); the four extremes
  // are the measured poses in tools/table3d-cameras.js.
  var DRIFT = { tilt: { amp: 1.5, period: 17 }, panX: { amp: 10, period: 23 }, height: { amp: 40, period: 29 } };

  var BAR = 52;                                  // letterbox, top and bottom
  var SUBTITLE = { cell: 5, gap: 4, top: 16, offset: 44, alpha: 0.85 };

  var SPARK = { pool: 48, burst: 24, life: 0.45, gravity: 900, speedMin: 120, speedMax: 420,
    fan: 140, streak: 0.02, width: 2, alpha: 0.7 };
  var TRAIL = { length: 10, radius: 1.4, alpha: 0.25, halo: 3, haloAlpha: 0.35 };
  var DUST = { count: 40, drift: 6, sway: 3, sizeMin: 1, sizeMax: 2.5, alphaMin: 0.15, alphaMax: 0.4 };
  var LIGHT = [120, -40, 60];                    // see the header: chapter 9 says (120, -400, 600)
  var FLARE = {
    radius: 90, alpha: 0.35,
    ghosts: [
      { t: 0.3, r: 18, ink: C.flare, alpha: 0.12 },
      { t: 0.55, r: 10, ink: C.amber, alpha: 0.10 },
      { t: 0.8, r: 26, ink: C.flare, alpha: 0.08 },
      { t: 1.2, r: 8, ink: C.amber, alpha: 0.14 },
      { t: 1.5, r: 40, ink: C.flare, alpha: 0.09 }
    ]
  };
  var PADDLE = { z: 24, reflection: 0.18, light: { top: 0.3, near: 0, side: -0.45 } };
  var TABLE_STYLE = {
    surface: slab,
    line: 'rgba(201,214,232,0.300)',
    rail: C.slate,
    railTop: C.sheen,
    nearLip: C.midnight
  };

  // --------------------------------------------------------- the camera drift
  /** The camera spec at game time t: rest at t = 0, never past the measured extremes. */
  function poseAt(t) {
    var w = 2 * Math.PI * (t || 0);
    return {
      tilt: CAMERA.tilt + DRIFT.tilt.amp * Math.sin(w / DRIFT.tilt.period),
      height: CAMERA.height + DRIFT.height.amp * Math.sin(w / DRIFT.height.period),
      fov: CAMERA.fov,
      screenY: CAMERA.screenY,
      panX: DRIFT.panX.amp * Math.sin(w / DRIFT.panX.period)
    };
  }

  // ------------------------------------------------------------- seeded draws
  /** A small LCG: the same seed gives the same sequence, 0..1. */
  function lcg(seed) {
    var s = ((seed | 0) * 2654435761 + 97) >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  var MOTES = (function () {
    var rnd = lcg(2000);
    var out = [];
    for (var i = 0; i < DUST.count; i++) {
      out.push({ x: rnd() * 800, y: rnd() * 600, size: DUST.sizeMin + rnd() * (DUST.sizeMax - DUST.sizeMin),
        phase: rnd() * Math.PI * 2, rate: 1.5 + rnd() * 3 });
    }
    return out;
  })();

  // ------------------------------------------------- private memory, fixed size
  var mem = { seen: false, time: 0, rally: 0, next: 0, sparks: [], trail: [], trailTime: -1 };
  for (var s0 = 0; s0 < SPARK.pool; s0++) mem.sparks.push({ born: -Infinity, x: 0, y: 0, vx: 0, vy: 0 });

  /** Forget every spark and trail point (a new game, a test). */
  function reset() {
    mem.seen = false;
    mem.time = 0;
    mem.rally = 0;
    mem.next = 0;
    mem.trail.length = 0;
    mem.trailTime = -1;
    for (var i = 0; i < mem.sparks.length; i++) mem.sparks[i].born = -Infinity;
  }

  /** A burst of sparks from the ball's screen point, fanned away from the paddle it left. */
  function spawnBurst(state, at) {
    var rnd = lcg(state.rally);
    var away = state.ball.vx >= 0 ? 0 : Math.PI;
    var fan = SPARK.fan * Math.PI / 180;
    for (var i = 0; i < SPARK.burst; i++) {
      var p = mem.sparks[mem.next];
      mem.next = (mem.next + 1) % SPARK.pool;
      var ang = away + (rnd() - 0.5) * fan;
      var speed = SPARK.speedMin + rnd() * (SPARK.speedMax - SPARK.speedMin);
      p.born = state.time;
      p.x = at.x;
      p.y = at.y;
      p.vx = Math.cos(ang) * speed;
      p.vy = Math.sin(ang) * speed;
    }
  }

  /** Bring the memory up to this moment. Reads the state; writes only this file's own variables. */
  function observe(state, T, cam) {
    var t = state.time || 0;
    if (!mem.seen || t < mem.time) {
      reset();
      mem.seen = true;
      mem.rally = state.rally || 0;
    }
    mem.time = t;
    var rally = state.rally || 0;
    if (rally > mem.rally) spawnBurst(state, T.ballScreen(cam, state));
    mem.rally = rally;

    if (state.serveDelay > 0) {
      mem.trail.length = 0;
      mem.trailTime = -1;
    } else if (mem.trailTime !== t) {
      var b = T.ballScreen(cam, state);
      mem.trail.unshift({ x: b.x, y: b.y, r: b.r });
      if (mem.trail.length > TRAIL.length) mem.trail.length = TRAIL.length;
      mem.trailTime = t;
    }
  }

  // ------------------------------------------------------------- the drawing
  function slab(ctx, cam, pts) {
    trace(ctx, pts);
    ctx.fillStyle = C.slab;
    ctx.fill();
    // The sheen: far-left corner to near-right, table sheen at 0.6 to nothing.
    var g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
    g.addColorStop(0, rgba(C.sheen, 0.6));
    g.addColorStop(1, rgba(C.sheen, 0));
    trace(ctx, pts);
    ctx.fillStyle = g;
    ctx.fill();
  }

  function trace(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i].x, pts[i].y);
      else ctx.moveTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
  }

  function backdrop(ctx, state, T, cam) {
    var g = ctx.createLinearGradient(0, 0, 0, state.height);
    g.addColorStop(0, C.navy);
    g.addColorStop(0.2, C.midnight);
    g.addColorStop(0.55, C.navy);
    g.addColorStop(1, C.letterbox);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.width, state.height);
    // The light's warm volume, hanging behind the far rail.
    var src = T.project(cam, LIGHT[0], LIGHT[1], LIGHT[2]);
    var haze = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, 320);
    haze.addColorStop(0, rgba(C.amber, 0.14));
    haze.addColorStop(1, rgba(C.amber, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  /** The mood: the slab's corners sink into navy. On the table, so under the paddles (R4). */
  function vignette(ctx, state, T, cam) {
    var g = ctx.createRadialGradient(400, 300, 180, 400, 300, 560);
    g.addColorStop(0, rgba(C.navy, 0));
    g.addColorStop(1, rgba(C.navy, 0.6));
    T.path(ctx, cam, [[0, 0, 0], [800, 0, 0], [800, 600, 0], [0, 600, 0]]);
    ctx.fillStyle = g;
    ctx.fill();
  }

  function paddleOrder(state) {
    var sides = ['left', 'right'];
    if (state.right.y + state.right.h < state.left.y + state.left.h) sides.reverse();
    return sides;
  }

  function reflections(ctx, state, T, cam, P) {
    ctx.save();
    T.path(ctx, cam, [[0, 0, 0], [800, 0, 0], [800, 600, 0], [0, 600, 0]]);
    ctx.clip();
    var sides = paddleOrder(state);
    for (var i = 0; i < sides.length; i++) {
      T.box(ctx, cam, state[sides[i]], 0, -PADDLE.z,
        { ink: P.paddleInk(state, sides[i]), shade: 'flat', light: PADDLE.light, alpha: PADDLE.reflection });
    }
    ctx.restore();
  }

  function dust(ctx, t) {
    for (var i = 0; i < MOTES.length; i++) {
      var m = MOTES[i];
      var x = ((m.x + DUST.drift * t) % 800 + 800) % 800;
      var y = ((m.y + DUST.sway * (Math.cos(i) - Math.cos(t + i))) % 600 + 600) % 600;
      var flicker = 0.5 + 0.5 * Math.sin(t * m.rate + m.phase);
      ctx.globalAlpha = DUST.alphaMin + (DUST.alphaMax - DUST.alphaMin) * flicker;
      ctx.fillStyle = C.dust;
      ctx.beginPath();
      ctx.arc(x, y, m.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function trail(ctx, state, T, cam) {
    if (state.serveDelay > 0 || !mem.trail.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = mem.trail.length - 1; i >= 0; i--) {
      var p = mem.trail[i];
      var k = 1 - i / TRAIL.length;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.r * TRAIL.radius * k), 0, Math.PI * 2);
      ctx.fillStyle = rgba(C.glow, TRAIL.alpha * k);
      ctx.fill();
    }
    var b = T.ballScreen(cam, state);
    var halo = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * TRAIL.halo);
    halo.addColorStop(0, rgba(C.glow, TRAIL.haloAlpha));
    halo.addColorStop(1, rgba(C.glow, 0));
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * TRAIL.halo, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Each live spark: a short streak along its velocity, placed and turned with a transform. */
  function sparks(ctx, T, t) {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < mem.sparks.length; i++) {
      var p = mem.sparks[i];
      var age = t - p.born;
      if (!(age >= 0 && age < SPARK.life)) continue;
      var k = age / SPARK.life;
      var vy = p.vy + SPARK.gravity * age;
      var x = p.x + p.vx * age;
      var y = p.y + p.vy * age + 0.5 * SPARK.gravity * age * age;
      var len = Math.max(SPARK.width, Math.sqrt(p.vx * p.vx + vy * vy) * SPARK.streak);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(vy, p.vx));
      ctx.globalAlpha = SPARK.alpha * (1 - k);
      ctx.fillStyle = T.mix(C.spark, C.ember, k);
      ctx.fillRect(-len, -SPARK.width / 2, len, SPARK.width);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function hexagon(ctx, x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 6 + i * Math.PI / 3;
      if (i) ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    ctx.closePath();
  }

  function flare(ctx, T, cam) {
    var src = T.project(cam, LIGHT[0], LIGHT[1], LIGHT[2]);
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, FLARE.radius);
    g.addColorStop(0, rgba(C.flare, FLARE.alpha));
    g.addColorStop(0.3, rgba(C.flare, FLARE.alpha * 0.35));
    g.addColorStop(1, rgba(C.flare, 0));
    ctx.beginPath();
    ctx.arc(src.x, src.y, FLARE.radius, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    for (var i = 0; i < FLARE.ghosts.length; i++) {
      var gh = FLARE.ghosts[i];
      hexagon(ctx, src.x + (400 - src.x) * gh.t, src.y + (300 - src.y) * gh.t, gh.r);
      ctx.fillStyle = rgba(gh.ink, gh.alpha);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return src;
  }

  function letterbox(ctx, state, P) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = C.letterbox;
    ctx.fillRect(0, 0, state.width, BAR);
    ctx.fillRect(0, state.height - BAR, state.width, BAR);
    // The score as a subtitle in the top bar.
    var mid = state.width / 2;
    ctx.globalAlpha = SUBTITLE.alpha;
    ctx.fillStyle = C.hud;
    P.drawText(ctx, String(state.score.left), mid - SUBTITLE.offset, SUBTITLE.top, SUBTITLE.cell, SUBTITLE.gap);
    P.drawText(ctx, String(state.score.right), mid + SUBTITLE.offset, SUBTITLE.top, SUBTITLE.cell, SUBTITLE.gap);
    ctx.fillRect(mid - 7, SUBTITLE.top + 2 * SUBTITLE.cell, 14, SUBTITLE.cell);
    ctx.globalAlpha = 1;
  }

  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);
    var T = P.table3d;
    if (!T) return P.drawBase(ctx, state, opts);
    var t = state.time || 0;
    var cam = T.camera(poseAt(t));
    observe(state, T, cam);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 1. backdrop
    backdrop(ctx, state, T, cam);
    // 2. the table: a dark glossy slab
    T.table(ctx, cam, TABLE_STYLE);
    // 3. on the table: the mood, the mirrored paddles, the dust in the air
    vignette(ctx, state, T, cam);
    reflections(ctx, state, T, cam, P);
    dust(ctx, t);
    // 4. paddles, far one first, in their earned colours (R4)
    var sides = paddleOrder(state);
    for (var i = 0; i < sides.length; i++) {
      T.box(ctx, cam, state[sides[i]], 0, PADDLE.z,
        { ink: P.paddleInk(state, sides[i]), shade: 'flat', light: PADDLE.light });
    }
    // 5. behind the ball: the glow trail and halo, the sparks
    trail(ctx, state, T, cam);
    sparks(ctx, T, t);
    // 6. post: the lens flare
    flare(ctx, T, cam);
    // 7. the ball, crisp and white over every glow; hidden in the serve pause
    if (state.serveDelay <= 0) T.ball(ctx, cam, state.ball, { fill: C.core });
    // 8. the letterbox over everything, the score as its subtitle
    letterbox(ctx, state, P);
    ctx.restore();
  }

  R.registerEra({
    era: 8,
    name: '2000 PlayStation 2',
    like: 1,              // paddle colours: the ones the session earned on its first point
    camera: CAMERA,
    drift: poseAt,
    card: { flash: '#9fc4ff', wipe: ['#000000', '#141c33', '#2d3e50'], box: '#0b1020', border: '#2d3e50',
            inner: '#3a4a66', year: '#ffb347', name: '#c9d6e8', label: '#6f84a3', dots: null },
    voice: {
      paddle: [ { wave: 'sine', freq: 80, slideTo: 50, dur: 0.30, gain: 0.45 },
                { wave: 'noise', dur: 0.08, gain: 0.15, filter: { type: 'lowpass', freq: 900 } },
                { wave: 'triangle', freq: 392, dur: 0.25, gain: 0.10 } ],
      wall:   [ { wave: 'sine', freq: 523, attack: 0.02, dur: 0.35, gain: 0.08 },
                { wave: 'sine', freq: 784, attack: 0.02, dur: 0.30, gain: 0.05 } ],
      score:  [ { wave: 'sine', freq: 55, slideTo: 35, dur: 1.0, gain: 0.50 },
                { wave: 'noise', dur: 0.5, gain: 0.25, filter: { type: 'lowpass', freq: 600, to: 120 } },
                { wave: 'sawtooth', freq: 131, attack: 0.03, dur: 1.2, gain: 0.05, unison: { voices: 5, spread: 18 }, filter: { type: 'lowpass', freq: 900, to: 2400 } },
                { wave: 'sawtooth', freq: 196, attack: 0.03, dur: 1.2, gain: 0.05, unison: { voices: 5, spread: 18 }, filter: { type: 'lowpass', freq: 900, to: 2400 } },
                { wave: 'sawtooth', freq: 262, attack: 0.03, dur: 1.2, gain: 0.05, unison: { voices: 5, spread: 18 }, filter: { type: 'lowpass', freq: 900, to: 2400 } },
                { wave: 'sawtooth', freq: 523, attack: 0.4, dur: 1.6, gain: 0.03, unison: { voices: 5, spread: 25 }, filter: { type: 'lowpass', freq: 1800 } },
                { wave: 'sawtooth', freq: 659, attack: 0.4, dur: 1.6, gain: 0.03, unison: { voices: 5, spread: 25 }, filter: { type: 'lowpass', freq: 1800 } } ],
      boot:   [ // the tower hum: a low swelling drone and crystal twinkles
                { wave: 'sawtooth', freq: 55, attack: 1.0, dur: 2.6, gain: 0.08, unison: { voices: 5, spread: 20 }, filter: { type: 'lowpass', freq: 200, to: 800 } },
                { wave: 'sine', freq: 110, attack: 1.2, dur: 2.6, gain: 0.10 },
                { wave: 'sine', freq: 1760, at: 1.2, attack: 0.3, dur: 1.0, gain: 0.03 },
                { wave: 'sine', freq: 2217, at: 1.4, attack: 0.3, dur: 1.0, gain: 0.03 },
                { wave: 'sine', freq: 2637, at: 1.6, attack: 0.3, dur: 1.0, gain: 0.03 } ],
      effects: { reverb: { seconds: 2.8, decay: 3, mix: 0.35 } }
    },
    // For the era's own test: the numbers, and a way to forget the particles.
    fx: { C: C, BAR: BAR, SPARK: SPARK, TRAIL: TRAIL, DUST: DUST, FLARE: FLARE, LIGHT: LIGHT, DRIFT: DRIFT,
          reset: reset, liveSparks: function (t) {
            return mem.sparks.filter(function (p) { var a = t - p.born; return a >= 0 && a < SPARK.life; }).length;
          } },
    draw: draw
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
