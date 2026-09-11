/*
 * Era 1 -- 1977 Atari 2600: the turn to colour.
 *
 * The first point of the session lands the machine here. The field and the
 * frame stay the 1972 machine's; each paddle, and its score, wears the colour
 * the rules picked for it (state.paddleColour holds a palette INDEX).
 *
 * A dozen colours picked by eye to sit in the range a 2600 could show -- warm
 * and slightly muddy, no pure #ff channels anywhere. This is NOT the real
 * 128-entry NTSC palette and does not pretend to be; when an era genuinely
 * needs that, that era can go and look it up.
 *
 * Every entry is deliberately bright, because the field is black and a paddle
 * that vanishes into it is a broken game. PongRender.isLegible() is the check
 * that keeps a future addition honest, and the palette's length must match
 * RULES.paletteSize in src/game.js (a test pins that join).
 *
 * Arrival flourish: the television coming alive. The first era change is the
 * black-and-white cabinet turning into a living-room set, drawn over the
 * engine's ring (src/erachange.js is the contract) every frame it grows:
 *   - a power-on line: the bright horizontal line a tube opens with, flung
 *     across the whole field at the height the ball went out, for 0.28 s;
 *   - inside the ring, a rolling picture that settles: the new picture rolls
 *     up one whole frame, slowing, with the dark frame bar at the seam, and its
 *     red and blue-green fields drift apart and back together (RF chroma
 *     fringing), locking by eased progress 0.8 -- faint scanlines over it fade
 *     as the set warms;
 *   - colour bleeding in just behind the edge, the paddles' palette smeared
 *     round the ring;
 *   - on the ring's edge itself, a bright band of horizontal scanlines with a
 *     green-white phosphor glow.
 * All of it is copies of the canvas, gradients, patterns and composite
 * operations -- no per-pixel work. The roll and the fringe need the page's
 * canvas, so the headless suite draws everything but them. The ring stays the
 * truth of which era draws where; this only paints over it, and the state it is
 * handed is never written.
 *
 * The sting: a soft TV warble in the Atari voice (a square hum sliding up with
 * a wobble, then two coarse TIA steps), added to era 1's row of
 * PongSound.VOICES as `sting` and played once per change through the page's own
 * player -- never behind the title, where the demo rally is silent.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  var PADDLE_INKS = [
    '#c85c14',   // burnt orange
    '#d8a038',   // gold
    '#c8cc30',   // olive yellow
    '#68bc40',   // grass
    '#40b898',   // teal
    '#4890d8',   // sky blue
    '#7068d4',   // indigo
    '#a858c8',   // violet
    '#d0589c',   // magenta
    '#cc4444',   // red
    '#d88860',   // salmon
    '#8cc8e8'    // pale blue
  ];

  var PALETTE = PADDLE_INKS.filter(R.isLegible);

  // ---------------------------------------------- arrival: the set comes on
  var PHOSPHOR = [184, 255, 216];  // the green-white of a freshly lit tube
  var BAND = 34;           // the scanline band, just inside the ring's edge
  var BLEED = 78;          // how far behind the band the colour bleeds
  var LINE_PITCH = 3;      // one lit scanline in every three rows
  var SETTLED_AT = 0.8;    // eased progress by which the picture has locked
  var FRINGE = 8;          // widest the colour fields drift apart, field units
  var BAR = 34;            // half the height of the frame bar at the roll's seam
  var FLASH_S = 0.28;      // how long the power-on line lasts
  var BLEED_INKS = ['#d8a038', '#d0589c', '#4890d8', '#68bc40', '#c85c14', '#a858c8'];

  // The warble: a square hum sliding up an octave with a slow wobble, like a
  // set not yet on its channel, then two coarse TIA steps as the picture locks.
  // Soft -- a third of the loudness of a paddle hit.
  var STING = [
    { wave: 'square', freq: 110, slideTo: 220, at: 0.00, dur: 0.46, gain: 0.07,
      fm: { ratio: 0.06, index: 0.09 } },
    { wave: 'square', freq: 294, at: 0.40, dur: 0.10, gain: 0.07 },
    { wave: 'square', freq: 440, slideTo: 392, at: 0.52, dur: 0.34, gain: 0.06,
      fm: { ratio: 0.016, index: 0.025 } }
  ];

  function phosphor(a) {
    return 'rgba(' + PHOSPHOR.join(',') + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }

  function clamp01(v) {
    return v > 0 ? (v < 1 ? v : 1) : 0;
  }

  function circle(ctx, o, r) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, Math.max(0, r), 0, Math.PI * 2);
  }

  /** A ring-shaped path between two radii (the inner arc runs backwards: a hole). */
  function annulus(ctx, o, outer, inner) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, Math.max(0, outer), 0, Math.PI * 2);
    ctx.arc(o.x, o.y, Math.max(0, inner), 0, Math.PI * 2, true);
  }

  // Offscreen canvases, made once and reused; none off the page.
  var buffers = {};
  function buffer(name, w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = buffers[name];
    if (!c) c = buffers[name] = document.createElement('canvas');
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return c.getContext('2d');
  }

  /** Scanlines as a repeating pattern: one row of `ink` in every LINE_PITCH. */
  function scanlines(ctx, ink) {
    var src = buffer('lines-' + ink, 1, LINE_PITCH);
    if (!src || typeof ctx.createPattern !== 'function') return null;
    src.clearRect(0, 0, 1, LINE_PITCH);
    src.fillStyle = ink;
    src.fillRect(0, 0, 1, 1);
    return ctx.createPattern(src.canvas, 'repeat');
  }

  /** One colour field of the frame so far: the canvas multiplied by a pure tint. */
  function colourField(x, canvas, tint, w, h) {
    x.globalCompositeOperation = 'copy';
    x.drawImage(canvas, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = tint;
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  }

  /**
   * Inside the ring, the picture rolls up one whole frame and locks, its red
   * and blue-green fields drifting apart and back. Rebuilt from two tinted
   * copies of the frame, added back together: with no drift they add up to the
   * frame exactly. Needs the page's canvas at field size; false when it has none.
   */
  function rollAndFringe(ctx, o, r, s, w, h) {
    var canvas = ctx.canvas;
    if (!canvas || canvas.width !== w || canvas.height !== h || s >= 1) return false;
    var red = buffer('red', w, h);
    var cyan = red && buffer('cyan', w, h);
    if (!red || !cyan) return false;
    var loose = 1 - s;
    var dy = h * loose * loose * loose;
    var dx = FRINGE * loose * loose * (0.75 + 0.25 * Math.sin(s * 19));
    colourField(red, canvas, '#ff0000', w, h);
    colourField(cyan, canvas, '#00ffff', w, h);

    ctx.save();
    circle(ctx, o, r - 1);
    ctx.clip();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(red.canvas, -dx, dy);
    ctx.drawImage(red.canvas, -dx, dy - h);
    ctx.drawImage(cyan.canvas, dx, dy);
    ctx.drawImage(cyan.canvas, dx, dy - h);
    ctx.globalCompositeOperation = 'source-over';
    // The frame bar: the dark gap between one picture and the next, at the seam.
    var bar = ctx.createLinearGradient(0, dy - BAR, 0, dy + BAR);
    var dark = 0.85 * clamp01(loose * 3);
    bar.addColorStop(0, 'rgba(0,0,0,0)');
    bar.addColorStop(0.5, 'rgba(0,0,0,' + dark.toFixed(3) + ')');
    bar.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bar;
    ctx.fillRect(0, dy - BAR, w, BAR * 2);
    ctx.restore();
    return true;
  }

  /** Faint dark scanlines over the new picture, fading as the set warms. */
  function warmingLines(ctx, o, r, p, w, h) {
    var lines = scanlines(ctx, '#000000');
    if (!lines) return;
    ctx.save();
    circle(ctx, o, r);
    ctx.clip();
    ctx.globalAlpha = 0.5 * (1 - p);
    ctx.fillStyle = lines;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** The paddles' palette smeared round the ring just behind its edge, thinning inward. */
  function colourBleed(ctx, o, r, t) {
    var g = typeof ctx.createConicGradient === 'function'
      ? ctx.createConicGradient(t * 1.7, o.x, o.y)
      : ctx.createLinearGradient(o.x - r, o.y, o.x + r, o.y);
    for (var i = 0; i < BLEED_INKS.length; i++) g.addColorStop(i / BLEED_INKS.length, BLEED_INKS[i]);
    g.addColorStop(1, BLEED_INKS[0]);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    var steps = [0.62, 0.36, 0.16];
    var start = r - BAND * 0.4;
    var each = BLEED / steps.length;
    for (var k = 0; k < steps.length; k++) {
      ctx.globalAlpha = steps[k];
      annulus(ctx, o, start - k * each, start - (k + 1) * each);
      ctx.fill();
    }
    ctx.restore();
  }

  /** The bright band of horizontal scanlines riding the ring's edge, with its glow. */
  function scanBand(ctx, o, r, t, w, h, dim) {
    var inner = Math.max(0, r - BAND);
    var flicker = 0.86 + 0.14 * Math.sin(t * 97);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (!dim) {
      var r0 = Math.max(0, inner - 44);
      var r1 = r + 24;
      var glow = ctx.createRadialGradient(o.x, o.y, r0, o.x, o.y, r1);
      glow.addColorStop(0, phosphor(0));
      glow.addColorStop(clamp01((r - r0) / (r1 - r0)), phosphor(0.42 * flicker));
      glow.addColorStop(1, phosphor(0));
      ctx.fillStyle = glow;
      annulus(ctx, o, r1, r0);
      ctx.fill();
    }
    annulus(ctx, o, r + 3, inner);
    ctx.clip();
    ctx.globalAlpha = (dim ? 0.5 : 0.95) * flicker;
    ctx.fillStyle = scanlines(ctx, dim || '#f0fff6') || (dim || phosphor(0.55));
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.save();
    circle(ctx, o, r);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = dim || '#ffffff';
    ctx.shadowBlur = dim ? 0 : 18;
    ctx.shadowColor = phosphor(1);
    ctx.stroke();
    ctx.restore();
  }

  /** The line a tube opens with, flung across the field at the height of the miss. */
  function powerOnLine(ctx, o, t, w) {
    if (!(t >= 0 && t < FLASH_S)) return;
    var k = t / FLASH_S;
    var half = 2 + 44 * k;
    var a = Math.pow(1 - k, 1.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createLinearGradient(0, o.y - half, 0, o.y + half);
    g.addColorStop(0, phosphor(0));
    g.addColorStop(0.5, phosphor(0.9 * a));
    g.addColorStop(1, phosphor(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, o.y - half, w, half * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    ctx.fillRect(0, o.y - 1.5, w, 3);
    ctx.restore();
  }

  // The sting plays once per change: remembered by which game and when.
  var stung = { state: null, at: null };

  function soundModule() {
    if (root.PongSound) return root.PongSound;
    return typeof module === 'object' && typeof require === 'function' ? require('../sound.js') : null;
  }

  /** Era 1's row of voices gains its sting; then the page's player plays it once. */
  function playSting(state) {
    var at = state.eraChangedAt;
    if (stung.state === state && stung.at === at) return false;
    stung.state = state;
    stung.at = at;
    var player = root.__pongSound;
    if (!player || typeof player.play !== 'function') return false;
    try {
      var S = soundModule();
      if (S && S.VOICES && S.VOICES[1] && !S.VOICES[1].sting) S.VOICES[1].sting = STING;
      return !!player.play({ type: 'sting', era: 1 });
    } catch (e) {
      return false;
    }
  }

  /** The flourish hook: see the header of src/erachange.js for the contract. */
  function tvComesAlive(ctx, p, origin, fromEra, toEra, info) {
    // Only the arrival of THIS era: the Super Nintendo borrows era 1's look
    // (`like: 1`, for the paddle colours) and with it this hook, and the set
    // has already come on by then.
    if (toEra !== 1) return;
    var o = origin;
    var r = info.radius;
    var w = info.width;
    var h = info.height;
    if (info.dim) {
      // Behind the title: just the scanline band, in the demo's dim ink, silent.
      if (r > 1) scanBand(ctx, o, r, info.t, w, h, info.dim);
      return;
    }
    playSting(info.state);
    // The eased ring is barely a point for its first frames -- exactly when the
    // power-on line belongs -- so only the ring's own layers wait for it to open.
    if (r > 1) {
      var s = clamp01(p / SETTLED_AT);
      rollAndFringe(ctx, o, r, s, w, h);
      warmingLines(ctx, o, r, p, w, h);
      colourBleed(ctx, o, r, info.t);
      scanBand(ctx, o, r, info.t, w, h, null);
    }
    powerOnLine(ctx, o, info.t, w);
  }

  R.registerEra({
    era: 1,
    name: '1977 Atari 2600',
    palette: PALETTE,
    paddleInk: function (state, side) {
      if (!state.colour) return R.INK;
      var i = (state.paddleColour && state.paddleColour[side]) || 0;
      return PALETTE[i % PALETTE.length];
    },
    flourish: tvComesAlive,
    sting: STING
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
