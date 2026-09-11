/*
 * Super Ultra Pong 64: Remastered -- game feel, and how much of it each era gets.
 *
 * The juice layer: hit-stop, screen shake, a flash on a hit, paddle squash on
 * a hit and a squashed print where the ball meets a wall, a ball trail that
 * thickens as a rally speeds up, a rally counter from the fifth hit with a
 * callout at 5, 10, 15 and 20, and slow motion on match point.
 *
 * It is era-agnostic. What changes from era to era is only HOW MUCH: the
 * INTENSITY table runs from 0 at the 1972 arcade (the honest machine: nothing
 * at all) to 1 at the Xbox 360, and each effect switches on at its own point
 * along it (THRESHOLD), so the machine feels more alive with every rung:
 *
 *   0.1 Atari 2600      a one-frame flash on every paddle hit
 *   0.2 NES             + paddle squash and the ball's wall squash
 *   0.3 Genesis         + screen shake
 *   0.4 Super Nintendo  + slow motion on match point
 *   0.5 PlayStation     + hit-stop and the ball trail
 *   0.6 Nintendo 64     + the rally counter and its callouts
 *   ...and every effect grows with the intensity from there to the Xbox 360.
 *
 * An effect an era file already draws for itself is left to it (OWNED): the
 * Genesis, Super Nintendo, Dreamcast and PlayStation 2 draw their own ball
 * trails, and the Nintendo 64 its own rumble.
 *
 * The loop calls two things and nothing else: step() in place of Pong.step for
 * the real game, and draw() around the frame. Neither is ever used for the
 * attract rally behind the title. Hit-stop and slow motion work by handing the
 * rules less time -- none during a freeze, a third during slow motion -- and a
 * freeze never starts inside the serve pause, where the ring wipe and an era's
 * arrival play, so neither is ever paused. Shake is an offset on the whole
 * finished frame (the display layer of item 1198 had not landed when this was
 * cut); the counter and callouts sit still above it, like a HUD.
 *
 * Plain script: window.PongFeel in the page, module.exports under node --test.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PongFeel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function rules() {
    if (root.Pong) return root.Pong;
    if (typeof require === 'function') return require('./game.js');
    return null;
  }

  // ------------------------------------------------------------ the table
  /** How alive each rung feels, 0 (the 1972 machine) to 1 (the Xbox 360). */
  var INTENSITY = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

  /** The intensity at which each effect switches on. */
  var THRESHOLD = {
    flash: 0.1,     // the Atari: a one-frame flash, and nothing else
    squash: 0.2,    // the NES
    shake: 0.3,     // the Genesis
    slowmo: 0.4,    // the Super Nintendo
    hitstop: 0.5,   // the PlayStation, where the 3D eras start piling it on
    trail: 0.5,
    counter: 0.6    // the Nintendo 64
  };

  /** Effects an era file already draws itself; this layer leaves them alone. */
  var OWNED = {
    3: ['trail'],   // the Genesis ball's motion trail
    4: ['trail'],   // the Super Nintendo's afterimages
    6: ['shake'],   // the Nintendo 64's rumble
    7: ['trail'],   // the Dreamcast's comic speed lines
    8: ['trail']    // the PlayStation 2's glow trail
  };

  var EFFECTS = ['flash', 'squash', 'shake', 'slowmo', 'hitstop', 'trail', 'counter'];

  var HITSTOP = { minFrames: 2, maxFrames: 4, frame: 1 / 60 };
  var SHAKE = { hit: 7, wall: 2.5, point: 12, len: 0.22 };   // px at intensity 1
  var SQUASH = { len: 0.16, paddle: 0.45, wall: 0.1 };
  var SLOWMO = { scale: 1 / 3, window: 0.8 };   // seconds on screen before the line
  var TRAIL = { min: 3, max: 12, alpha: 0.42 };
  var CALLOUTS = { 5: 'NICE', 10: 'GREAT', 15: 'AMAZING', 20: 'UNREAL' };
  var CALLOUT_LEN = 1.1;
  var COUNTER_FROM = 5;

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function intensity(era) {
    var e = Math.floor(Number(era)) || 0;
    if (e < 0) e = 0;
    if (e >= INTENSITY.length) e = INTENSITY.length - 1;
    return INTENSITY[e];
  }

  /** Which effects are on in an era: { intensity, flash: bool, ... }. */
  function effects(era) {
    var k = intensity(era);
    var owned = OWNED[Math.floor(Number(era)) || 0] || [];
    var out = { era: era, intensity: k };
    for (var i = 0; i < EFFECTS.length; i++) {
      var name = EFFECTS[i];
      out[name] = k > 0 && k >= THRESHOLD[name] - 1e-9 && owned.indexOf(name) < 0;
    }
    return out;
  }

  /** How hard a hit was, 0 (a serve-speed ball) to 1 (the top speed). */
  function hardness(state) {
    var P = rules();
    var r = state.rules;
    var span = (r.ballMaxSpeed - r.ballStartSpeed) || 1;
    return clamp01((P.ballSpeed(state) - r.ballStartSpeed) / span);
  }

  /** A paddle hit freezes the ball and paddles for 2 to 4 frames, the hardest longest. */
  function hitStopFrames(hard) {
    return HITSTOP.minFrames + Math.round((HITSTOP.maxFrames - HITSTOP.minFrames) * clamp01(hard));
  }
  function hitStopSeconds(hard) { return hitStopFrames(hard) * HITSTOP.frame; }

  // --------------------------------------------------------- match point
  /** The match card defines match point formally; until then, the point that reaches era 10. */
  function isMatchPoint(state) {
    var P = rules();
    if (P && typeof P.isMatchPoint === 'function') return !!P.isMatchPoint(state);
    return state.phase === 'playing' && state.era === P.TOP_ERA - 1;
  }

  /** Seconds of game time until the ball crosses the line it is heading for. */
  function secondsToLine(state) {
    var b = state.ball;
    if (state.serveDelay > 0 || !b.vx) return Infinity;
    return b.vx < 0 ? (b.x + b.size) / -b.vx : (state.width - b.x) / b.vx;
  }

  /** Where the ball's centre will be, height-wise, when it reaches x (walls folded in). */
  function heightAt(state, x) {
    var b = state.ball;
    if (!b.vx) return b.y + b.size / 2;
    var t = (x - (b.x + b.size / 2)) / b.vx;
    if (t < 0) return b.y + b.size / 2;
    var span = state.height - b.size;
    var y = b.y + b.vy * t;
    var period = 2 * span;
    y = ((y % period) + period) % period;
    if (y > span) y = period - y;
    return y + b.size / 2;
  }

  /** Is the defending paddle, where it stands right now, across the ball's path? */
  function defenderCovers(state) {
    var b = state.ball;
    var p = b.vx < 0 ? state.left : state.right;
    var face = b.vx < 0 ? p.x + p.w : p.x;
    var past = b.vx < 0 ? b.x + b.size / 2 < face : b.x + b.size / 2 > face;
    if (past) return false;
    var y = heightAt(state, face);
    return y >= p.y - b.size / 2 && y <= p.y + p.h + b.size / 2;
  }

  // ------------------------------------------------------------- memory
  var memories = typeof WeakMap === 'function' ? new WeakMap() : null;
  var fallback = null;

  function fresh() {
    return {
      clock: 0,         // real seconds this layer has seen
      hitStop: 0,       // real seconds of freeze still owed
      flash: 0, flashLen: 0, flashAmp: 0,
      shakeAmp: 0, shakeLeft: 0,
      squash: { left: 0, right: 0, leftAmp: 0, rightAmp: 0 },
      prints: [],       // the ball's squashed prints on a wall: { x, y, left }
      trail: [],        // recent ball centres, newest last
      callout: null,    // { text, left }
      slow: false,
      lastRally: 0
    };
  }

  function memo(state) {
    if (!memories) return fallback || (fallback = fresh());
    var m = memories.get(state);
    if (!m) { m = fresh(); memories.set(state, m); }
    return m;
  }

  function reset(state) {
    if (memories) memories.delete(state); else fallback = null;
  }

  // -------------------------------------------------------------- update
  function decay(m, dt) {
    m.clock += dt;
    m.flash = Math.max(0, m.flash - dt);
    m.shakeLeft = Math.max(0, m.shakeLeft - dt);
    m.squash.left = Math.max(0, m.squash.left - dt);
    m.squash.right = Math.max(0, m.squash.right - dt);
    for (var i = m.prints.length - 1; i >= 0; i--) {
      m.prints[i].left -= dt;
      if (m.prints[i].left <= 0) m.prints.splice(i, 1);
    }
    if (m.callout) {
      m.callout.left -= dt;
      if (m.callout.left <= 0) m.callout = null;
    }
  }

  function shake(m, amp) {
    if (amp > m.shakeAmp * (m.shakeLeft / SHAKE.len)) {
      m.shakeAmp = amp;
      m.shakeLeft = SHAKE.len;
    }
  }

  /** React to what the last rules step produced. */
  function observe(state, m, fx) {
    var ev = state.events || [];
    var k = fx.intensity;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'paddle') {
        var hard = hardness(state);
        var impact = 0.45 + 0.55 * hard;
        if (fx.hitstop && state.serveDelay <= 0) m.hitStop = hitStopSeconds(hard);
        if (fx.flash) {
          m.flashLen = (1 + Math.floor(k * 2.5)) * HITSTOP.frame;
          m.flash = m.flashLen;
          m.flashAmp = (0.16 + 0.22 * k) * impact;
        }
        if (fx.squash) {
          var side = e.side === 'left' ? 'left' : 'right';
          m.squash[side] = SQUASH.len;
          m.squash[side + 'Amp'] = SQUASH.paddle * (0.5 + 0.5 * k) * impact;
        }
        if (fx.shake) shake(m, SHAKE.hit * k * impact);
        if (fx.counter && CALLOUTS[state.rally]) {
          m.callout = { text: CALLOUTS[state.rally], left: CALLOUT_LEN, rally: state.rally };
        }
      } else if (e.type === 'wall') {
        if (fx.squash) {
          var b = state.ball;
          m.prints.push({
            x: b.x + b.size / 2,
            y: e.side === 'top' ? 0 : state.height,
            side: e.side,
            left: SQUASH.len,
            amp: 0.5 + 0.5 * k
          });
          if (m.prints.length > 4) m.prints.shift();
        }
        if (fx.shake) shake(m, SHAKE.wall * k);
      } else if (e.type === 'score') {
        if (fx.shake) shake(m, SHAKE.point * k);
        m.trail.length = 0;
        m.slow = false;
      }
    }
    // The trail: the ball's centre, one sample a frame, while it is in play.
    if (fx.trail && state.serveDelay <= 0) {
      var bb = state.ball;
      m.trail.push({ x: bb.x + bb.size / 2, y: bb.y + bb.size / 2 });
      var keep = trailLength(state, fx);
      while (m.trail.length > keep + 1) m.trail.shift();
    } else if (m.trail.length) {
      m.trail.length = 0;
    }
    m.lastRally = state.rally;
  }

  /** How many ghosts behind the ball: more, and thicker, as the rally speeds up. */
  function trailLength(state, fx) {
    return Math.round(TRAIL.min + (TRAIL.max - TRAIL.min) * hardness(state) * fx.intensity);
  }

  /** The time scale slow motion asks for this frame: 1, or a third on match point. */
  function slowScale(state, m, fx) {
    if (!fx.slowmo || !isMatchPoint(state) || state.serveDelay > 0) { m.slow = false; return 1; }
    var t = secondsToLine(state);
    if (m.slow) {
      // Hold it until the ball is saved (it turns round) or crosses.
      if (!(t < Infinity) || m.slowDir !== (state.ball.vx < 0 ? -1 : 1)) m.slow = false;
    } else if (t <= SLOWMO.window * SLOWMO.scale && !defenderCovers(state)) {
      m.slow = true;
      m.slowDir = state.ball.vx < 0 ? -1 : 1;
    }
    return m.slow ? SLOWMO.scale : 1;
  }

  /**
   * One frame of the real game: the rules advanced by the real time, less during
   * a hit-stop (none) or match-point slow motion (a third), then the frame's
   * events turned into feel. Use it in place of Pong.step for the real game only.
   */
  function step(state, dt, intent, stepFn) {
    var P = rules();
    var advance = stepFn || P.step;
    var m = memo(state);
    if (!(dt > 0)) return advance(state, dt, intent);
    decay(m, dt);
    var fx = effects(state.era);
    if (state.phase !== 'playing' || fx.intensity <= 0) {
      m.hitStop = 0; m.slow = false; m.trail.length = 0;
      advance(state, dt, intent);
      return state;
    }
    // (The half-millisecond slack keeps float dust from owing a fifth frame.)
    if (m.hitStop > 5e-4 && state.serveDelay <= 0) {
      // The freeze: ball and paddles hold, and nothing this frame is an event
      // (the rules keep last step's list when they are handed no time, and the
      // voice would play the hit again every frozen frame).
      m.hitStop = Math.max(0, m.hitStop - dt);
      state.events = [];
      state.lastEvent = null;
      return state;
    }
    m.hitStop = 0;
    var scale = slowScale(state, m, fx);
    advance(state, dt * scale, intent);
    observe(state, m, fx);
    return state;
  }

  // ---------------------------------------------------------------- draw
  var cams = {};

  /** Field point to canvas: through the era's own 3D camera where it has one. */
  function toScreen(state, x, y, z) {
    var R = root.PongRender;
    var look = R && R.eraLook ? R.eraLook(state.era) : null;
    var T = look && look.camera && R ? R.table3d : null;
    if (!T) return { x: x, y: y, scale: 1 };
    var key = state.era;
    if (!cams[key] || cams[key].spec !== look.camera) cams[key] = { spec: look.camera, cam: T.camera(look.camera) };
    var p = T.project(cams[key].cam, x, y, z || 0);
    return { x: p.x, y: p.y, scale: p.scale };
  }

  /** The shake offset this frame, in canvas pixels, or null. */
  function shakeOffset(m) {
    if (!(m.shakeLeft > 0) || !(m.shakeAmp > 0)) return null;
    var a = m.shakeAmp * (m.shakeLeft / SHAKE.len);
    return { x: a * Math.sin(m.clock * 97.3), y: a * Math.cos(m.clock * 71.9) };
  }

  /** Squash a paddle for the draw only: narrower along the hit, taller across it. */
  function squashPaddle(p, amount) {
    var saved = { x: p.x, y: p.y, w: p.w, h: p.h };
    var w = p.w * (1 - amount);
    var h = p.h * (1 + amount * 0.5);
    p.x = saved.x + (saved.w - w) / 2;
    p.y = saved.y - (h - saved.h) / 2;
    p.w = w;
    p.h = h;
    return saved;
  }

  function restorePaddle(p, saved) {
    p.x = saved.x; p.y = saved.y; p.w = saved.w; p.h = saved.h;
  }

  function drawTrail(ctx, state, m, fx) {
    var n = m.trail.length - 1;       // the newest sample is the ball itself
    if (n < 1) return;
    var b = state.ball;
    var thick = 0.35 + 0.65 * hardness(state);
    ctx.save();
    for (var i = 0; i < n; i++) {
      var s = m.trail[i];
      var age = (i + 1) / (n + 1);                 // 0 oldest .. 1 newest
      var p = toScreen(state, s.x, s.y, b.size / 2);
      var size = b.size * p.scale * thick * (0.35 + 0.65 * age);
      ctx.globalAlpha = TRAIL.alpha * age * (0.5 + 0.5 * fx.intensity);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.restore();
  }

  function drawPrints(ctx, state, m) {
    if (!m.prints.length) return;
    var s = state.ball.size;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < m.prints.length; i++) {
      var pr = m.prints[i];
      var f = pr.left / SQUASH.len;             // 1 at the bounce, fading to 0
      var y = pr.side === 'top' ? s * 0.25 : state.height - s * 0.25;
      var p = toScreen(state, pr.x, y, s / 2);
      var w = s * p.scale * (1 + 0.8 * pr.amp * f);
      var h = s * p.scale * (1 - 0.6 * pr.amp * f);
      ctx.globalAlpha = 0.55 * f;
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
    }
    ctx.restore();
  }

  function drawHud(ctx, state, m, fx) {
    var R = root.PongRender;
    if (!fx.counter || !R || !R.drawText) return;
    ctx.save();
    if (state.rally >= COUNTER_FROM && state.serveDelay <= 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#000000';
      var label = 'RALLY ' + state.rally;
      var cell = 5, gap = 4;
      var w = label.length * (3 * cell + gap) - gap;   // block font: 3 cells a glyph
      ctx.fillRect(state.width / 2 - w / 2 - 10, state.height - 54, w + 20, 5 * cell + 16);
      ctx.fillStyle = '#ffffff';
      R.drawText(ctx, label, state.width / 2, state.height - 46, cell, gap);
    }
    if (m.callout) {
      var f = m.callout.left / CALLOUT_LEN;             // 1 fresh .. 0 gone
      var pop = f > 0.85 ? 1 + (f - 0.85) * 2 : 1;       // a quick pop in
      var c = Math.round((8 + 4 * fx.intensity) * pop);
      ctx.globalAlpha = Math.min(1, f * 2.5);
      ctx.fillStyle = '#000000';
      R.drawText(ctx, m.callout.text, state.width / 2 + 3, 143, c, Math.round(c * 0.7));
      ctx.fillStyle = '#ffe14a';
      R.drawText(ctx, m.callout.text, state.width / 2, 140, c, Math.round(c * 0.7));
    }
    ctx.restore();
  }

  /**
   * Draw the frame with its feel: drawField(ctx, state, opts) paints the era's
   * own frame (shaken, with squashed paddles), then the trail and wall prints,
   * then the flash and the HUD, which do not shake.
   */
  function draw(ctx, state, drawField, opts) {
    var fx = effects(state.era);
    if (state.phase !== 'playing' || fx.intensity <= 0) return drawField(ctx, state, opts);
    var m = memo(state);
    var off = fx.shake ? shakeOffset(m) : null;
    var savedL = null, savedR = null;
    if (fx.squash && m.squash.left > 0) savedL = squashPaddle(state.left, m.squash.leftAmp * m.squash.left / SQUASH.len);
    if (fx.squash && m.squash.right > 0) savedR = squashPaddle(state.right, m.squash.rightAmp * m.squash.right / SQUASH.len);
    try {
      if (off) {
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, state.width, state.height);
        ctx.translate(off.x, off.y);
      }
      drawField(ctx, state, opts);
      if (fx.trail && state.serveDelay <= 0) drawTrail(ctx, state, m, fx);
      if (fx.squash) drawPrints(ctx, state, m);
      if (off) ctx.restore();
    } finally {
      if (savedL) restorePaddle(state.left, savedL);
      if (savedR) restorePaddle(state.right, savedR);
    }
    if (fx.flash && m.flash > 0) {
      ctx.save();
      ctx.globalAlpha = m.flashAmp;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, state.width, state.height);
      ctx.restore();
    }
    drawHud(ctx, state, m, fx);
  }

  /** What this layer is doing right now, for the playtest and a curious reader. */
  function moment(state) {
    var m = memo(state);
    var fx = effects(state.era);
    return {
      era: state.era, intensity: fx.intensity, effects: fx,
      hitStop: m.hitStop, slow: m.slow, shaking: !!shakeOffset(m),
      counter: fx.counter && state.phase === 'playing' && state.rally >= COUNTER_FROM && state.serveDelay <= 0
        ? state.rally : 0,
      callout: m.callout ? m.callout.text : null,
      trail: m.trail.length
    };
  }

  return {
    INTENSITY: INTENSITY,
    THRESHOLD: THRESHOLD,
    OWNED: OWNED,
    EFFECTS: EFFECTS,
    HITSTOP: HITSTOP,
    SLOWMO: SLOWMO,
    CALLOUTS: CALLOUTS,
    COUNTER_FROM: COUNTER_FROM,
    intensity: intensity,
    effects: effects,
    hitStopFrames: hitStopFrames,
    hitStopSeconds: hitStopSeconds,
    isMatchPoint: isMatchPoint,
    secondsToLine: secondsToLine,
    defenderCovers: defenderCovers,
    step: step,
    draw: draw,
    moment: moment,
    reset: reset
  };
});
