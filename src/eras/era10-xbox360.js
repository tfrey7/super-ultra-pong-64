/*
 * Era 10 -- 2005 Xbox 360, the top of the ladder (docs/ERAS.md chapter 11).
 *
 * HD, and every post-process effect of the generation at once, turned up
 * until nobody could mistake it for the Xbox a rung below: a crisp concrete
 * slab under a long lens, bloom off every emissive thing (the HDR sun, the
 * rail light strips, the paddles' rim lights, the ball's halo, the score
 * blades), the brown-and-grey grade with a vignette, film grain, motion blur
 * behind the ball, depth of field softening the far end, the Blades HUD, and
 * an "Achievement Unlocked" toast on entering the era and on every point.
 *
 * Painter's order is the bible's section 2.5, with one move the readability
 * rules force: the depth-of-field copy of the far strip is taken BEFORE the
 * paddles go down, so no paddle is ever softened (R4).
 *
 *   1 backdrop      umber, and the scenery behind the far wall drawn into a
 *                   third-scale buffer and copied up soft (depth of field)
 *   2 table         concrete slab, 2-pixel grating, bevels, rail light strips
 *   3 on the table  the far strip (d 0.85..1) again from a half-scale copy
 *   4 paddles       far one first, rim lights into the bloom buffer
 *   5 behind ball   motion blur: a capsule 1/30 s long and three ghost discs
 *   6 post passes   bloom (two scales, 'lighter'), grade, vignette, grain,
 *                   then each paddle's earned ink restored at full saturation
 *   7 the ball      white core, after every post pass (R1, R2)
 *   8 HUD band      the blades, the gamerscore, the toast (R8)
 *
 * Canvas 2D only and no per-pixel loops: the grain and grating are tiles
 * built once from rectangles, the bloom is a small bright buffer scaled up.
 * Under node --test there is no document, so every buffer is null and the
 * file draws its stated fallbacks (scenery straight onto the frame, the ball
 * halo drawn directly at 0.35, no grain).
 *
 * The file reads the state and never writes it. Its one private memory is
 * the toast: the score total it last saw and when, keyed off state.time.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // The bible's measured camera (section 12): a long lens, nothing moves.
  var CAMERA = { tilt: 32, height: 1600, fov: 20.5, screenY: 312 };

  var C = {
    umber: '#3b342b', mud: '#5a5145', concrete: '#7d776c', ash: '#a8a296',
    tint: '#c9b89a', bloom: '#fff8e7', sun: '#ffd9a0',
    green: '#5dc21e', greenDark: '#2f6b12', silver: '#d9dcd6',
    toast: '#1b1b1b', toastText: '#ffffff', vignette: '#000000', grainMid: '#808080',
    core: '#ffffff', glow: '#fff8e7'
  };

  var FONT_FAMILY = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  var HUD_PX = 20;                     // '600 20px "Segoe UI", ...': the one system font on the ladder
  var TOAST = { x: 230, y: 8, w: 340, h: 52, rise: 0.25, hold: 2.0, fall: 0.25, alpha: 0.92 };
  var TOAST_TEXT = { welcome: '50G - WELCOME TO HD', point: '10G - POINT SCORED',
                     ladder: '100G · Top of the Ladder' };
  // The arrival (item 1156), on the ring's clock: seconds after the point.
  // The toast pops at 0.95 s, beat 3 (p 0.8): the ring has passed the centre
  // by 0.74 s from any origin on the field, so it always comes after the card.
  // The HUD blades slide in from x 800 one after another from the same beat.
  var ARRIVAL = { toastAt: 0.95, bladesAt: 0.95, bladeStagger: 0.09, bladeSlide: 0.25,
                  burst: 260, sweep: 5, sweepW: 46, sweepGap: 16, sweepLean: 110, sweepAlpha: 0.55,
                  pour: 200, pourAlpha: 0.3, grainAlpha: 0.3 };
  var BLADES = { x: 600, step: 44, w: 36, top: 14, bottom: 90, slant: 10 };
  var BLADE_FILLS = [C.green, C.silver, '#262626', '#1f1f1f'];
  var GRADE = { drain: '#6e6a60', drainAlpha: 0.55, tintAlpha: 0.35,
                vignetteIn: 250, vignetteOut: 520, vignetteAlpha: 0.65 };
  var GRAIN = { tiles: 3, size: 128, specks: 1400, fps: 24, alpha: 0.12 };
  var BLUR = { capsule: 1 / 30, capsuleAlpha: 0.5, ghosts: [[0.008, 0.3], [0.016, 0.2], [0.024, 0.1]] };
  var BLOOM = { main: 0.55, wide: 0.35, fallback: 0.35 };
  var DOF = { farY: 90, alpha: 0.6 };  // d 0.85 to 1 is field y 0 to 90
  var PADDLE = { z: 24, light: { top: 0.3, near: -0.05, side: -0.45 } };

  var TABLE_COLOURS = { line: '#9a9488', rail: '#4a4339', railTop: C.ash, nearLip: '#2b261f' };

  // ------------------------------------------------------------- utilities
  function lcg(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function trace(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i].x, pts[i].y);
      else ctx.moveTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  }

  var cached = { spec: null, cam: null };
  function cameraFor(T, spec) {
    if (cached.spec !== spec) {
      cached.spec = spec;
      cached.cam = T.camera(spec);
    }
    return cached.cam;
  }

  // ----------------------------------------------------------- tiles, once
  var tiles = { grating: undefined, grain: undefined };

  /** 16 x 16: 1-pixel rows of concrete and mud, and a mud seam down one side. */
  function gratingTile(T, ctx) {
    if (tiles.grating) return tiles.grating;
    var buf = T.offscreen('x360-grating', 16, 16);
    if (!buf || !('createPattern' in ctx)) return null;
    var g = buf.ctx;
    for (var y = 0; y < 16; y++) {
      g.fillStyle = y % 2 ? C.mud : C.concrete;
      g.fillRect(0, y, 16, 1);
    }
    g.fillStyle = C.umber;
    g.fillRect(0, 0, 1, 16);
    tiles.grating = ctx.createPattern(buf.canvas, 'repeat');
    return tiles.grating;
  }

  /** Three 128 x 128 noise tiles: 1400 black and white specks each on grain mid. */
  function grainTiles(T, ctx) {
    if (tiles.grain) return tiles.grain;
    // Ask for a buffer before touching the context: with no document there is
    // no grain, and a test's strict recording canvas is never asked for more.
    if (!T.offscreen('x360-grain0', GRAIN.size, GRAIN.size) || !('createPattern' in ctx)) return null;
    var list = [];
    for (var i = 0; i < GRAIN.tiles; i++) {
      var buf = T.offscreen('x360-grain' + i, GRAIN.size, GRAIN.size);
      if (!buf) return null;
      var g = buf.ctx;
      var rnd = lcg(0x360 + i * 7919);
      g.fillStyle = C.grainMid;
      g.fillRect(0, 0, GRAIN.size, GRAIN.size);
      for (var k = 0; k < GRAIN.specks; k++) {
        var s = rnd() < 0.5 ? 1 : 2;
        g.fillStyle = rnd() < 0.5 ? '#000000' : '#ffffff';
        g.fillRect(Math.floor(rnd() * GRAIN.size), Math.floor(rnd() * GRAIN.size), s, s);
      }
      list.push(ctx.createPattern(buf.canvas, 'repeat'));
    }
    tiles.grain = list;
    return list;
  }

  // ------------------------------------------------------------ the toast
  var memo = { lastTime: null, total: 0, at: 0, kind: null, changedAt: null };

  /**
   * Which achievement is showing, and how far through its 2.5 s. Climbing
   * here by a point is 100G · Top of the Ladder, popping 0.95 s after the
   * change (item 1156); opening the page at era 10 is WELCOME TO HD. Either
   * arrival is recognised by a new
   * era change stamped by the rules, or a frame that is not the next one
   * after the last this file drew (the first frame of the era, a new game, a
   * jump in time). Keying the arrival off the stamp matters: a page that drew
   * era 10 a moment ago and is then brought in again by a point would
   * otherwise read that point's rise as 10G - POINT SCORED. After an arrival
   * every rise in the score total is a point, and a new point replaces the
   * toast showing.
   */
  function toastFor(state) {
    var total = state.score.left + state.score.right;
    var changed = state.eraChangedAt || 0;
    var fresh = memo.lastTime === null || state.time < memo.lastTime || state.time - memo.lastTime > 0.5 ||
      changed !== memo.changedAt;
    memo.changedAt = changed;
    if (fresh) {
      var since = state.time - (state.eraChangedAt || 0);
      var arriving = state.eraChangedAt > 0 && since >= 0 && since < ARRIVAL.toastAt + TOAST.rise + TOAST.hold;
      // Climbed here by a point: the top of the ladder, popping at beat 3.
      // Opened here (?era=10, a new game at the top): welcome to HD, now.
      memo.kind = arriving ? 'ladder' : 'welcome';
      memo.at = arriving ? state.eraChangedAt + ARRIVAL.toastAt : state.time;
      memo.total = total;
    } else if (total > memo.total) {
      memo.kind = 'point';
      memo.at = state.time;
      memo.total = total;
    } else if (total < memo.total) {
      memo.total = total;
    }
    memo.lastTime = state.time;
    var t = state.time - memo.at;
    if (t < 0 || t >= TOAST.rise + TOAST.hold + TOAST.fall) return null;
    return { kind: memo.kind, text: TOAST_TEXT[memo.kind], t: t, y: toastY(t) };
  }

  /**
   * The arrival's toast, from the state alone (the flourish draws it over the
   * ring's edge and must not disturb the memo above): the same text and the
   * same y the look draws, or null before it pops and after it has gone.
   */
  function ladderToast(state) {
    if (!(state.eraChangedAt > 0)) return null;
    var t = state.time - state.eraChangedAt - ARRIVAL.toastAt;
    if (t < 0 || t >= TOAST.rise + TOAST.hold + TOAST.fall) return null;
    return { kind: 'ladder', text: TOAST_TEXT.ladder, t: t, y: toastY(t) };
  }

  /** Slides down from above the frame into the band, holds, slides back up. */
  function toastY(t) {
    var away = TOAST.y + TOAST.h + 4;
    if (t < TOAST.rise) {
      var e = t / TOAST.rise;
      return TOAST.y - away * Math.pow(1 - e, 3);
    }
    if (t < TOAST.rise + TOAST.hold) return TOAST.y;
    var o = (t - TOAST.rise - TOAST.hold) / TOAST.fall;
    return TOAST.y - away * o * o;
  }

  // ------------------------------------------------------------- HD text
  /**
   * HD text in the system font; the block font when the context cannot
   * measure it (measureText reporting zero width). Left, centre or right
   * of x, with y the baseline.
   */
  function hdText(ctx, P, text, x, y, px, align, colour) {
    ctx.fillStyle = colour;
    ctx.font = '600 ' + px + 'px ' + FONT_FAMILY;
    var m = 'measureText' in ctx ? ctx.measureText(text) : null;
    if (m && m.width > 0 && 'fillText' in ctx) {
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x, y);
      return;
    }
    var cell = Math.max(1, Math.round(px / 7));
    var width = text.length * 4 * cell;
    var cx = align === 'center' ? x : align === 'right' ? x - width / 2 : x + width / 2;
    P.drawText(ctx, text.toUpperCase(), cx, y - 5 * cell, cell, cell);
  }

  // ------------------------------------------------------------ the scene
  function scenery(c, farY) {
    var sky = c.createLinearGradient(0, 0, 0, farY + 10);
    sky.addColorStop(0, '#221d17');
    sky.addColorStop(0.65, C.mud);
    sky.addColorStop(1, C.ash);
    c.fillStyle = sky;
    c.fillRect(0, 0, 800, farY + 10);
    sun(c, farY, false);
    // A skyline of concrete blocks and one gantry, all behind the far wall.
    var rnd = lcg(2005);
    for (var i = 0; i < 11; i++) {
      var w = 34 + rnd() * 50;
      var h = 18 + rnd() * 52;
      var x = i * 76 - 10 + rnd() * 20;
      c.fillStyle = i % 3 ? C.umber : '#2c261f';
      c.fillRect(x, farY + 6 - h, w, h + 4);
      c.fillStyle = rgba(C.sun, 0.35);
      c.fillRect(x + 4, farY + 6 - h + 6, w - 8, 1);
    }
    c.fillStyle = '#2c261f';
    c.fillRect(120, farY - 64, 6, 70);
    c.fillRect(120, farY - 64, 170, 5);
  }

  function sun(c, farY, glowOnly) {
    var x = 560, y = farY - 40;
    var g = c.createRadialGradient(x, y, 0, x, y, glowOnly ? 150 : 90);
    g.addColorStop(0, rgba(C.sun, glowOnly ? 1 : 0.9));
    g.addColorStop(0.25, rgba(C.sun, glowOnly ? 0.6 : 0.4));
    g.addColorStop(1, rgba(C.sun, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, glowOnly ? 150 : 90, 0, Math.PI * 2);
    c.fill();
    if (!glowOnly) {
      c.fillStyle = C.sun;
      c.beginPath();
      c.arc(x, y, 15, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** 1: umber, then the scenery soft from a third-scale buffer. */
  function backdrop(ctx, T, farY) {
    ctx.fillStyle = C.umber;
    ctx.fillRect(0, 0, 800, 600);
    var buf = T.offscreen('dof', 267, 200);
    if (!buf) return scenery(ctx, farY);
    var b = buf.ctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, 267, 200);
    b.setTransform(267 / 800, 0, 0, 200 / 600, 0, 0);
    scenery(b, farY);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buf.canvas, 0, 0, 800, 600);
    ctx.restore();
  }

  /** 2: the slab, its grating, its bevels and light strips. */
  function tableStyle(T) {
    return Object.assign({}, TABLE_COLOURS, {
      surface: function (c, cam, pts) {
        trace(c, pts);
        var g = c.createLinearGradient(0, pts[0].y, 0, pts[2].y);
        g.addColorStop(0, C.mud);
        g.addColorStop(1, C.concrete);
        c.fillStyle = g;
        c.fill();
        var tile = gratingTile(T, c);
        if (tile) {
          c.save();
          c.globalAlpha = 0.45;
          c.fillStyle = tile;
          c.fill();
          c.restore();
        }
      }
    });
  }

  function line(c, a, b, width, colour, crisp) {
    c.strokeStyle = colour;
    c.lineWidth = width;
    c.beginPath();
    var ay = crisp ? Math.round(a.y) + 0.5 : a.y;
    var by = crisp ? Math.round(b.y) + 0.5 : b.y;
    c.moveTo(a.x, ay);
    c.lineTo(b.x, by);
    c.stroke();
  }

  function railDetail(ctx, T, cam, bloom) {
    ctx.save();
    // 1-pixel bevel highlights on half-pixel rows.
    line(ctx, T.project(cam, 0, 0, 22), T.project(cam, 800, 0, 22), 1, '#d6d0c2', true);
    line(ctx, T.project(cam, 0, -18, 22), T.project(cam, 800, -18, 22), 1, C.concrete, true);
    line(ctx, T.project(cam, 0, 600, 0), T.project(cam, 800, 600, 0), 1, C.ash, true);
    // The light strips: amber along the far rail, green along the near lip.
    var farA = T.project(cam, 0, 0, 11), farB = T.project(cam, 800, 0, 11);
    var nearA = T.project(cam, 0, 605, 0), nearB = T.project(cam, 800, 605, 0);
    line(ctx, farA, farB, 2, C.sun, false);
    line(ctx, nearA, nearB, 2, C.green, false);
    ctx.restore();
    if (bloom) {
      line(bloom.ctx, farA, farB, 10, C.sun, false);
      line(bloom.ctx, nearA, nearB, 10, C.green, false);
    }
  }

  /** 3: depth of field -- the far strip again, from a half-scale copy of the frame so far. */
  function farStripSoft(ctx, T, cam) {
    var half = T.offscreen('dof-half', 400, 300);
    if (!half || !('canvas' in ctx) || !ctx.canvas) return false;
    var h = half.ctx;
    h.setTransform(1, 0, 0, 1, 0, 0);
    h.clearRect(0, 0, 400, 300);
    h.imageSmoothingEnabled = true;
    h.drawImage(ctx.canvas, 0, 0, 400, 300);
    var edge = T.project(cam, 400, DOF.farY, 0).y;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 800, edge);
    ctx.clip();
    ctx.globalAlpha = DOF.alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(half.canvas, 0, 0, 800, 600);
    ctx.restore();
    return true;
  }

  /** 4: paddles, far first; rim lights into the bloom buffer. */
  function paddles(ctx, T, cam, state, P, bloom) {
    var sides = ['left', 'right'];
    if (state.right.y + state.right.h < state.left.y + state.left.h) sides.reverse();
    var out = [];
    for (var i = 0; i < sides.length; i++) {
      var ink = P.paddleInk(state, sides[i]);
      var faces = T.box(ctx, cam, state[sides[i]], 0, PADDLE.z, { ink: ink, shade: 'gradient', light: PADDLE.light });
      out.push({ ink: ink, faces: faces });
      if (bloom) {
        bloom.ctx.strokeStyle = C.glow;
        bloom.ctx.lineWidth = 6;
        trace(bloom.ctx, faces.top);
        bloom.ctx.stroke();
      }
    }
    return out;
  }

  /** 5: motion blur, all of it behind the ball. */
  function motionBlur(ctx, T, cam, state, now) {
    var b = state.ball;
    if (!b.vx && !b.vy) return;
    var at = function (dt) {
      return T.ballScreen(cam, { ball: { x: b.x - b.vx * dt, y: b.y - b.vy * dt, size: b.size } });
    };
    var back = at(BLUR.capsule);
    ctx.save();
    var g = ctx.createLinearGradient(back.x, back.y, now.x, now.y);
    g.addColorStop(0, rgba(C.glow, 0));
    g.addColorStop(1, rgba(C.glow, BLUR.capsuleAlpha));
    ctx.strokeStyle = g;
    ctx.lineWidth = 2 * now.r;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(back.x, back.y);
    ctx.lineTo(now.x, now.y);
    ctx.stroke();
    for (var i = 0; i < BLUR.ghosts.length; i++) {
      var p = at(BLUR.ghosts[i][0]);
      ctx.fillStyle = rgba(C.glow, BLUR.ghosts[i][1]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function halo(c, ball) {
    var r = ball.r * 3.2;
    var g = c.createRadialGradient(ball.x, ball.y, ball.r * 0.5, ball.x, ball.y, r);
    g.addColorStop(0, rgba(C.glow, 1));
    g.addColorStop(1, rgba(C.glow, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    c.fill();
  }

  function bloomBuffer(T) {
    var buf = T.offscreen('bloom', 200, 150);
    if (!buf) return null;
    var b = buf.ctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, 200, 150);
    b.setTransform(0.25, 0, 0, 0.25, 0, 0);
    return buf;
  }

  /** 6a: the bright layer added back twice, quarter and eighth scale. */
  function bloomPass(ctx, T, bloom, ball) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (bloom) {
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = BLOOM.main;
      ctx.drawImage(bloom.canvas, 0, 0, 800, 600);
      var wide = T.offscreen('bloom2', 100, 75);
      if (wide) {
        wide.ctx.setTransform(1, 0, 0, 1, 0, 0);
        wide.ctx.clearRect(0, 0, 100, 75);
        wide.ctx.imageSmoothingEnabled = true;
        wide.ctx.drawImage(bloom.canvas, 0, 0, 100, 75);
        ctx.globalAlpha = BLOOM.wide;
        ctx.drawImage(wide.canvas, 0, 0, 800, 600);
      }
    } else if (ball) {
      ctx.globalAlpha = BLOOM.fallback;
      halo(ctx, ball);
    }
    ctx.restore();
  }

  /** 6b: drain the colour, tint it brown, darken the corners. */
  function gradePass(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = GRADE.drainAlpha;
    ctx.fillStyle = GRADE.drain;
    ctx.fillRect(0, 0, 800, 600);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = GRADE.tintAlpha;
    ctx.fillStyle = C.tint;
    ctx.fillRect(0, 0, 800, 600);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    var v = ctx.createRadialGradient(400, 300, GRADE.vignetteIn, 400, 300, GRADE.vignetteOut);
    v.addColorStop(0, rgba(C.vignette, 0));
    v.addColorStop(1, rgba(C.vignette, GRADE.vignetteAlpha));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 800, 600);
    ctx.restore();
  }

  /** 6c: one of three grain tiles, 24 times a second, at a seeded offset. */
  function grainPass(ctx, T, state) {
    var list = grainTiles(T, ctx);
    if (!list) return;
    var n = Math.floor(state.time * GRAIN.fps);
    var tile = list[((n % GRAIN.tiles) + GRAIN.tiles) % GRAIN.tiles];
    var rnd = lcg((n * 2654435761) % 4294967296);
    var ox = Math.floor(rnd() * GRAIN.size), oy = Math.floor(rnd() * GRAIN.size);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = GRAIN.alpha;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = tile;
    ctx.fillRect(ox, oy, 800, 600);
    ctx.restore();
  }

  /** 6d: each paddle's earned ink back at full saturation, after the grade (R4). */
  function restoreInks(ctx, list) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    for (var i = 0; i < list.length; i++) {
      var f = list[i].faces;
      ctx.fillStyle = list[i].ink;
      ctx.strokeStyle = list[i].ink;
      trace(ctx, f.near);
      ctx.fill();
      ctx.stroke();
      trace(ctx, f.top);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD
  /**
   * How far right of its place blade i sits this frame: on an arrival by a
   * point each one waits off the right edge, then slides home from x 800,
   * one after another from beat 3. Zero at rest.
   */
  function bladeSlide(state, i) {
    if (!(state.eraChangedAt > 0)) return 0;
    var s = state.time - state.eraChangedAt - ARRIVAL.bladesAt - i * ARRIVAL.bladeStagger;
    if (s >= ARRIVAL.bladeSlide || state.time < state.eraChangedAt) return 0;
    var away = 810 - (BLADES.x + i * BLADES.step);
    if (s <= 0) return away;
    return away * Math.pow(1 - s / ARRIVAL.bladeSlide, 3);
  }

  function bladePath(c, i, dx) {
    var x = BLADES.x + i * BLADES.step + (dx || 0);
    var lean = (BLADES.bottom - BLADES.top) * Math.tan(BLADES.slant * Math.PI / 180);
    c.beginPath();
    c.moveTo(x + lean, BLADES.top);
    c.lineTo(x + lean + BLADES.w, BLADES.top);
    c.lineTo(x + BLADES.w, BLADES.bottom);
    c.lineTo(x, BLADES.bottom);
    c.closePath();
    return x + BLADES.w / 2 + lean * 0.2;
  }

  /** The blades: green with the left score, silver with the right, two dark. */
  function blades(c, state, P, glowOnly) {
    for (var i = 0; i < 4; i++) {
      if (glowOnly && i > 1) break;
      var dx = bladeSlide(state, i);
      if (dx >= 810 - (BLADES.x + i * BLADES.step)) continue;   // still waiting off the edge
      var cx = bladePath(c, i, dx);
      c.fillStyle = BLADE_FILLS[i];
      c.fill();
      if (glowOnly) continue;
      c.strokeStyle = i < 2 ? rgba('#ffffff', 0.5) : rgba(C.green, 0.45);
      c.lineWidth = 1;
      c.stroke();
      if (i === 0) hdText(c, P, String(state.score.left), cx, 80, HUD_PX, 'center', C.toastText);
      if (i === 1) hdText(c, P, String(state.score.right), cx, 80, HUD_PX, 'center', C.toast);
    }
  }

  function hud(ctx, state, P, bandBottom) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // The hairline under the whole band.
    // One row up from the band's bottom so the half-pixel rounding stays inside it (R8).
    line(ctx, { x: 0, y: bandBottom - 1 }, { x: 800, y: bandBottom - 1 }, 1, C.greenDark, true);
    blades(ctx, state, P, false);
    // A gamerscore that climbs with the match: 50G for arriving, 10G a point.
    var total = state.score.left + state.score.right;
    hdText(ctx, P, 'GAMERSCORE', 24, 34, 12, 'left', C.ash);
    hdText(ctx, P, (50 + 10 * total) + 'G', 24, 60, HUD_PX, 'left', C.silver);
    ctx.restore();
  }

  function roundedRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function badge(c, x, y, glowOnly) {
    var cx = x + 30, cy = y + TOAST.h / 2;
    var g = c.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 20);
    g.addColorStop(0, '#9ee86a');
    g.addColorStop(0.6, C.green);
    g.addColorStop(1, C.greenDark);
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 20, 0, Math.PI * 2);
    c.fill();
    if (glowOnly) return;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(cx, cy, 16, 0, Math.PI * 2);
    c.stroke();
  }

  function drawToast(ctx, P, toast) {
    var x = TOAST.x, y = toast.y;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    roundedRect(ctx, x, y, TOAST.w, TOAST.h, 10);
    ctx.fillStyle = rgba(C.toast, TOAST.alpha);
    ctx.fill();
    ctx.strokeStyle = rgba(C.green, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();
    badge(ctx, x, y, false);
    hdText(ctx, P, 'ACHIEVEMENT UNLOCKED', x + 62, y + 22, 12, 'left', C.silver);
    hdText(ctx, P, toast.text, x + 62, y + 43, 16, 'left', C.toastText);
    ctx.restore();
  }

  // --------------------------------------------------------------- draw
  function ballFill(ctx) {
    return function (sx, sy, sr) {
      var g = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, 0, sx, sy, sr);
      g.addColorStop(0, C.core);
      g.addColorStop(0.7, C.core);
      g.addColorStop(1, '#e4dfd2');
      return g;
    };
  }

  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);
    var T = P.table3d;
    if (!T) return P.drawBase(ctx, state, opts);
    var cam = cameraFor(T, CAMERA);
    var toast = toastFor(state);
    var ball = state.serveDelay <= 0 ? T.ballScreen(cam, state) : null;
    var farY = T.project(cam, 400, 0, 0).y;
    var bloom = bloomBuffer(T);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    backdrop(ctx, T, farY);                                    // 1
    if (bloom) sun(bloom.ctx, farY, true);
    T.table(ctx, cam, tableStyle(T));                          // 2
    railDetail(ctx, T, cam, bloom);
    farStripSoft(ctx, T, cam);                                 // 3
    var drawn = paddles(ctx, T, cam, state, P, bloom);         // 4
    if (ball) motionBlur(ctx, T, cam, state, ball);            // 5
    if (bloom) {
      if (ball) halo(bloom.ctx, ball);
      blades(bloom.ctx, state, P, true);
      if (toast) badge(bloom.ctx, TOAST.x, toast.y, true);
    }
    bloomPass(ctx, T, bloom, ball);                            // 6
    gradePass(ctx);
    grainPass(ctx, T, state);
    restoreInks(ctx, drawn);
    if (ball) T.ball(ctx, cam, state.ball, { fill: ballFill(ctx) });   // 7
    hud(ctx, state, P, farY - 6);                              // 8
    if (toast) drawToast(ctx, P, toast);
    ctx.restore();
  }

  // ------------------------------------------------------ the arrival
  /**
   * The ring that brings the Xbox 360 in (docs/ERAS.md chapter 11, item 1156),
   * the finale of the ladder, drawn over the ring's edge in three beats:
   *
   *   1 ignition  p 0 to 0.25   HDR white-out: a bloom-white burst at the
   *                             origin and a full-frame 'screen' wash, both
   *                             at 0.35 or less, fading as the eye adapts
   *   2 the edge  p 0.1 to 1    dashboard blades: five tall slanted panels in
   *                             blade green, silver and dark green ride just
   *                             inside the ring's edge across the field, and
   *                             behind them bloom pours in and the grain
   *                             comes up, where the new era's grade has
   *                             already taken the picture
   *   3 arrival   p 0.8 to 1    the panels fade, the HUD blades slide in
   *                             (the look does that), and the Achievement
   *                             Unlocked toast pops: 100G · Top of the Ladder
   *
   * Everything but the washes is clipped to 40 units past the ring. The toast
   * is drawn here only OUTSIDE the ring -- inside it the look draws the very
   * same toast -- so it slides in whole while the ring is still crossing the
   * band. The boot sting's blip is timed to that pop; the flourish plays no
   * sound. Behind the title (info.dim) the plain ring plays.
   */
  function flourish(ctx, p, origin, fromEra, toEra, info) {
    if (toEra !== 10 || !info || info.dim) return;
    var r = Math.max(0, info.radius || 0);
    var w = info.width || 800, h = info.height || 600;
    var state = info.state;
    var ox = origin.x, oy = origin.y;
    var dir = ox <= w / 2 ? 1 : -1;
    ctx.globalAlpha = 1;

    // 1 -- the white-out.
    if (p < 0.25) {
      var fade = 1 - p / 0.25;
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rgba(C.bloom, 0.35 * fade);
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      var burst = ctx.createRadialGradient(ox, oy, 0, ox, oy, ARRIVAL.burst);
      burst.addColorStop(0, rgba(C.bloom, 0.35 * fade));
      burst.addColorStop(0.4, rgba(C.sun, 0.2 * fade));
      burst.addColorStop(1, rgba(C.sun, 0));
      ctx.fillStyle = burst;
      ctx.beginPath();
      ctx.arc(ox, oy, ARRIVAL.burst, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // 2 -- bloom and grain pouring in behind the blades, then the blades.
    var fadeIn = Math.min(1, Math.max(0, (p - 0.05) / 0.1));
    var fadeOut = p > 0.8 ? Math.max(0, (1 - p) / 0.2) : 1;
    var k = fadeIn * fadeOut;
    if (k > 0 && r > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ox, oy, r + 40, 0, Math.PI * 2);
      ctx.clip();

      var inner = Math.max(0, r - ARRIVAL.pour);
      var pour = ctx.createRadialGradient(ox, oy, inner, ox, oy, r);
      pour.addColorStop(0, rgba(C.bloom, 0));
      pour.addColorStop(0.75, rgba(C.bloom, ARRIVAL.pourAlpha * k));
      pour.addColorStop(1, rgba(C.sun, 0.15 * k));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = pour;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.arc(ox, oy, inner, 0, Math.PI * 2, true);
      ctx.fill();

      var list = R.table3d && grainTiles(R.table3d, ctx);
      if (list) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = ARRIVAL.grainAlpha * k;
        ctx.fillStyle = list[Math.floor((state ? state.time : 0) * GRAIN.fps) % GRAIN.tiles];
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.arc(ox, oy, inner, 0, Math.PI * 2, true);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.globalCompositeOperation = 'source-over';
      var fills = [C.green, C.silver, C.greenDark, C.green, C.silver];
      for (var i = 0; i < ARRIVAL.sweep; i++) {
        // The leading panel sits at the edge; the rest trail back toward the origin.
        var reach = r - 6 - i * (ARRIVAL.sweepW + ARRIVAL.sweepGap);
        if (reach < ARRIVAL.sweepW) continue;   // not out of the origin yet
        var lead = ox + dir * reach;
        var tail = lead - dir * ARRIVAL.sweepW;
        var lean = dir * ARRIVAL.sweepLean;
        ctx.globalAlpha = ARRIVAL.sweepAlpha * k * (1 - i * 0.12);
        ctx.fillStyle = fills[i];
        ctx.beginPath();
        ctx.moveTo(tail + lean, 0);
        ctx.lineTo(lead + lean, 0);
        ctx.lineTo(lead, h);
        ctx.lineTo(tail, h);
        ctx.closePath();
        ctx.fill();
        // A crisp hairline on each panel's leading edge: HD, not a smear.
        ctx.globalAlpha = 0.8 * k;
        ctx.strokeStyle = C.silver;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lead + lean, 0);
        ctx.lineTo(lead, h);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3 -- the toast, wherever the ring has not reached yet.
    var toast = state ? ladderToast(state) : null;
    if (toast) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(ox, oy, r, 0, Math.PI * 2, true);
      ctx.clip('evenodd');
      drawToast(ctx, R, toast);
      ctx.restore();
    }
  }

  // The bible's Xbox 360 voice: big clean hits, and the achievement blip on every point.
  var VOICE = {
    paddle: [ { wave: 'sine', freq: 120, slideTo: 60, dur: 0.18, gain: 0.45 },
              { wave: 'noise', dur: 0.05, gain: 0.20, filter: { type: 'bandpass', freq: 2500, q: 0.8 } },
              { wave: 'triangle', freq: 1760, dur: 0.04, gain: 0.05 } ],
    wall:   [ { wave: 'noise', dur: 0.04, gain: 0.15, filter: { type: 'highpass', freq: 2000 } },
              { wave: 'sine', freq: 900, dur: 0.05, gain: 0.06 } ],
    score:  [ // the achievement blip: a soft click and two bright rising tones
              { wave: 'noise', dur: 0.01, gain: 0.10, filter: { type: 'highpass', freq: 5000 } },
              { wave: 'sine', freq: 1175, attack: 0.003, dur: 0.07, gain: 0.20 },
              { wave: 'sine', freq: 1568, at: 0.07, dur: 0.18, gain: 0.18 } ],
    boot:   [ // the whoosh, the swelling chord, the chime, the blip
              { wave: 'noise', attack: 1.1, dur: 1.4, gain: 0.12, filter: { type: 'bandpass', freq: 300, q: 1.5, to: 5000 } },
              { wave: 'sawtooth', freq: 220, attack: 0.9, dur: 1.8, gain: 0.04, unison: { voices: 5, spread: 20 }, filter: { type: 'lowpass', freq: 600, to: 4000 } },
              { wave: 'sawtooth', freq: 330, attack: 0.9, dur: 1.8, gain: 0.04, unison: { voices: 5, spread: 20 }, filter: { type: 'lowpass', freq: 600, to: 4000 } },
              { wave: 'sawtooth', freq: 440, attack: 0.9, dur: 1.8, gain: 0.04, unison: { voices: 5, spread: 20 }, filter: { type: 'lowpass', freq: 600, to: 4000 } },
              { wave: 'sine', freq: 55, at: 1.15, dur: 0.8, gain: 0.35 },
              { wave: 'sine', freq: 1760, at: 1.2, dur: 0.9, gain: 0.10 },
              { wave: 'sine', freq: 2637, at: 1.25, dur: 0.7, gain: 0.05 },
              { wave: 'sine', freq: 1175, at: 0.95, attack: 0.003, dur: 0.07, gain: 0.18 },
              { wave: 'sine', freq: 1568, at: 1.02, dur: 0.18, gain: 0.16 } ],
    effects: { reverb: { seconds: 2.5, decay: 2.5, mix: 0.4 } }
  };

  R.registerEra({
    era: 10,
    name: '2005 Xbox 360',
    like: 1,              // paddle colours: the ones the session earned on its first point
    camera: CAMERA,
    palette360: C,
    hudLayout: { toast: TOAST, toastText: TOAST_TEXT, blades: BLADES, font: '600 20px ' + FONT_FAMILY },
    toast: toastFor,
    card: { flash: '#fff8e7', wipe: ['#5dc21e', '#d9dcd6', '#3b342b'], box: '#1b1b1b', border: '#5dc21e',
            inner: null, year: '#5dc21e', name: '#ffffff', label: '#a8a296', dots: null },
    voice: VOICE,
    arrival: ARRIVAL,
    ladderToast: ladderToast,
    bladeSlide: bladeSlide,
    draw: draw,
    flourish: flourish
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
