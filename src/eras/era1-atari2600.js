/*
 * Era 1 -- 1977 Atari 2600: the turn to colour.
 *
 * The first point of the session lands the machine here. The field and the
 * frame stay the 1972 machine's; each paddle, and its score, wears the colour
 * the rules picked for it (state.paddleColour holds a palette INDEX).
 *
 * A dozen colours, each a real entry of the 2600's 128-colour NTSC palette
 * (item 1287; named by hue and luminance where they are listed). A scanline
 * carries the TIA's four colour registers' worth and no more: COLUBK the black
 * field, COLUPF the wall, the stand, the net and the ball, COLUP0 and COLUP1
 * the two players' inks, which the score also wears (score mode).
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
 * The sound that goes with it, a soft TV warble, is not played from here. It is
 * the Atari voice's `boot` list in src/sound.js: the player sounds it in place
 * of the point's note on the change that brings era 1 in -- once, however many
 * times this hook is drawn, and never behind the title, whose demo rally the
 * player is never handed. This hook draws, and nothing else.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // Item 1287, to Combat: every ink is a real entry of the TIA's 128-colour
  // NTSC palette, 16 hues x 8 luminances, the colour byte the cartridge writes
  // being hue << 4 | luminance << 1. The RGB is Stella's standard NTSC table
  // (src/common/PaletteHandler.cxx, ourNTSCPalette, in the stella-emu/stella
  // repository); each was the legible entry nearest the ink it replaced, but
  // salmon: its nearest ($3A) sat 51 degrees of hue from its NES cousin in era
  // 2 (test/era2-nes.test.js allows 45), so it is the light red $4A, 24 off.
  // test/era1-atari2600.test.js holds the same table and fails on any ink off it.
  var PADDLE_INKS = [
    '#b55328',   // burnt orange  hue 3, luminance 2 ($34)
    '#d2a44a',   // gold          hue 2, luminance 5 ($2A)
    '#d2d240',   // olive yellow  hue 1, luminance 5 ($1A)
    '#5cba5c',   // grass         hue 12, luminance 4 ($C8)
    '#54b899',   // teal          hue 11, luminance 4 ($B8)
    '#548ad2',   // sky blue      hue 9, luminance 4 ($98)
    '#7f5cd5',   // indigo        hue 7, luminance 4 ($78)
    '#a459d0',   // violet        hue 6, luminance 4 ($68)
    '#c659b3',   // magenta       hue 5, luminance 4 ($58)
    '#c84848',   // red           hue 4, luminance 3 ($46)
    '#e46f6f',   // salmon        hue 4, luminance 5 ($4A)
    '#84c8fc'    // pale blue     hue 9, luminance 7 ($9E)
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
  // The paddles' own inks, smeared round the ring (gold, magenta, sky, grass, orange, violet).
  var BLEED_INKS = [1, 8, 5, 3, 0, 7].map(function (i) { return PADDLE_INKS[i]; });

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
    x.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = tint;
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  }

  /**
   * Inside the ring, the picture rolls up one whole frame and locks, its red
   * and blue-green fields drifting apart and back. Rebuilt from two tinted
   * copies of the frame, added back together: with no drift they add up to the
   * frame exactly. The canvas may be any size (the display draws each era at its
   * machine's own resolution): it is copied into field-sized buffers. False with no canvas.
   */
  function rollAndFringe(ctx, o, r, s, w, h) {
    var canvas = ctx.canvas;
    if (!canvas || !(canvas.width > 0) || !(canvas.height > 0) || s >= 1) return false;
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

  // ------------------------------------------ the match: a 1977 cartridge
  // Item 1224, to docs/ART.md's Era 1 page: not a Pong of 1977 but the best a
  // launch-year cartridge drew (Combat, Air-Sea Battle, Street Racer) that
  // happens to be Pong. A Combat arena -- black field, a playfield wall along
  // the top and bottom and a flickering stand of mirrored blocks -- two
  // one-colour players (src/characters.js, sheets from
  // assets/pixellab/era1-sheets.mjs), the picture chip's ball, and the score
  // in playfield-block digits with a rally meter under each. Everything is
  // laid on the 2600's own grid: 160 x 192, so one pixel is 5 x 3.125 field
  // units, and the display samples it down to exactly that.
  var PX = 5;              // one native pixel across, in field units
  var LINE = 3.125;        // one scanline, in field units
  // Four colour registers a line (item 1287). COLUPF is one colour for the whole
  // frame -- the wall, the stand, the net and the ball, because the TIA draws
  // its ball in the playfield's colour. The ball reaches every line from the top
  // wall to the bottom one, so the stand cannot sit on lines it never visits:
  // the stand SHARES the playfield colour, and a line where the ball crosses the
  // stand is still four colours. It is grey, hue 0 luminance 3 ($06), so the
  // ball stays a neutral like every other era's and matches no paddle ink.
  var PLAYFIELD = '#8e8e8e';   // COLUPF: hue 0, luminance 3 ($06), Stella's NTSC table
  var BALL_INK = PLAYFIELD;    // the TIA's ball object is drawn in COLUPF
  var WALL_LINES = 4;
  var STAND = { rows: 3, lines: 6, block: 4, swapS: 16 / 60, fastS: 4 / 60, fastFor: 1 };
  var SCORE = { top: 40, offset: 110, blockW: 4 * PX, blockH: 4 * LINE, gap: 2 * PX };
  var METER = { max: 20, gapLines: 2 };
  var FLASH = { on: 4 / 60, times: 3 };     // 4 frames lit, 4 dark, three times
  var ARRIVE_S = 0.8;

  // One memory per game (its score object, as the rig keys it): the rally hits
  // each side has made this serve, and the last point -- who and when. Kept
  // here because state.events is emptied every step; an event is taken once,
  // by its time, however many times a frame is drawn.
  var memories = typeof WeakMap === 'function' ? new WeakMap() : null;
  function memoryOf(state) {
    var key = state.score;
    var m = memories && key && typeof key === 'object' ? memories.get(key) : null;
    var fresh = !m;
    if (!m || (state.time || 0) < m.time) {
      m = { seen: -Infinity, time: 0, hits: { left: 0, right: 0 }, point: null };
    }
    if (fresh && state.eraChangedAt > 0 && (state.time - state.eraChangedAt) < ARRIVE_S &&
        state.score.left !== state.score.right) {
      // Arriving on the point that brought the machine here: the leader scored it.
      m.point = { side: state.score.left > state.score.right ? 'left' : 'right', time: state.eraChangedAt };
    }
    m.time = state.time || 0;
    var evs = state.events || [];
    var newest = m.seen;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (!ev || !(ev.time > m.seen)) continue;
      if (ev.time > newest) newest = ev.time;
      if (ev.type === 'paddle' && m.hits[ev.side] !== undefined) m.hits[ev.side] += 1;
      if (ev.type === 'score' && (ev.side === 'left' || ev.side === 'right')) {
        m.point = { side: ev.side, time: ev.time };
      }
    }
    m.seen = newest;
    if (!state.rally) { m.hits.left = 0; m.hits.right = 0; }   // a new serve
    if (memories && key && typeof key === 'object') memories.set(key, m);
    return m;
  }

  /** A paddle's palette index: which pair of player sheets matches its ink. */
  var lastInks = { left: 0, right: 0 };
  function inkIndex(state, side) {
    var ink = lookPaddleInk(state, side);
    var i = PADDLE_INKS.indexOf(ink);
    return i < 0 ? 0 : i;
  }
  function lookPaddleInk(state, side) {
    if (!state.colour) return R.INK;
    var i = (state.paddleColour && state.paddleColour[side]) || 0;
    return PALETTE[i % PALETTE.length];
  }

  /** The sheets the rig's era 1 players wear: each in its own paddle's ink (src/characters.js asks). */
  function playerSheets() {
    return { left: 'era1-left-' + lastInks.left, right: 'era1-right-' + lastInks.right };
  }

  function snapX(x) { return Math.round(x / PX) * PX; }
  function snapY(y) { return Math.round(y / LINE) * LINE; }

  /** The stand: 3 rows of mirrored 4-pixel blocks, every other one missing, two patterns swapping. */
  function drawStand(ctx, w, phase) {
    var bw = STAND.block * PX;
    var bh = STAND.lines * LINE;
    var top = WALL_LINES * LINE;
    var half = Math.floor(w / 2 / bw);
    ctx.fillStyle = PLAYFIELD;
    for (var row = 0; row < STAND.rows; row++) {
      for (var k = 0; k < half; k++) {
        if ((k + row + phase) % 2) continue;
        ctx.fillRect(k * bw, top + row * bh, bw, bh);              // left half
        ctx.fillRect(w - (k + 1) * bw, top + row * bh, bw, bh);    // mirrored, as the chip does it
      }
    }
  }

  /** One number in playfield blocks: 3 blocks wide, 5 tall, 4 pixels by 4 lines a block. */
  function drawScoreNumber(ctx, value, centreX) {
    var text = String(value);
    var digitW = 3 * SCORE.blockW;
    var width = text.length * digitW + (text.length - 1) * SCORE.gap;
    var x = snapX(centreX - width / 2);
    for (var n = 0; n < text.length; n++) {
      var rows = R.DIGITS[text[n]];
      for (var r = 0; rows && r < rows.length; r++) {
        for (var c = 0; c < rows[r].length; c++) {
          if (rows[r][c] === '1') ctx.fillRect(x + c * SCORE.blockW, SCORE.top + r * SCORE.blockH, SCORE.blockW, SCORE.blockH);
        }
      }
      x += digitW + SCORE.gap;
    }
    return { left: snapX(centreX - width / 2), bottom: SCORE.top + 5 * SCORE.blockH };
  }

  /** The whole era 1 frame (the rig draws the players over it). */
  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);   // behind the title: monochrome
    var w = state.width, h = state.height, t = state.time || 0;
    var mem = memoryOf(state);
    lastInks = { left: inkIndex(state, 'left'), right: inkIndex(state, 'right') };
    var inkL = lookPaddleInk(state, 'left');
    var inkR = lookPaddleInk(state, 'right');

    // The black field.
    ctx.fillStyle = R.FIELD_INK;
    ctx.fillRect(0, 0, w, h);

    // Match point: under the wall, the leader's ink for 2 lines every other frame.
    var Pong = root.Pong;
    if (Pong && typeof Pong.isMatchPoint === 'function' && Pong.isMatchPoint(state) &&
        state.score.left !== state.score.right && Math.floor(t * 60) % 2 === 0) {
      ctx.fillStyle = state.score.left > state.score.right ? inkL : inkR;
      ctx.fillRect(0, WALL_LINES * LINE, w, 2 * LINE);
      ctx.fillRect(0, h - (WALL_LINES + 2) * LINE, w, 2 * LINE);
    }

    // The stand flickers, faster for a second after a point.
    var sincePoint = mem.point ? t - mem.point.time : Infinity;
    var period = sincePoint >= 0 && sincePoint < STAND.fastFor ? STAND.fastS : STAND.swapS;
    drawStand(ctx, w, Math.floor(t / period) % 2);

    // The wall, 4 lines along the top and the bottom.
    ctx.fillStyle = PLAYFIELD;
    ctx.fillRect(0, 0, w, WALL_LINES * LINE);
    ctx.fillRect(0, h - WALL_LINES * LINE, w, WALL_LINES * LINE);

    // The net: a dashed playfield column one pixel wide, 4 lines on, 4 off.
    var nx = snapX(w / 2 - PX / 2);
    for (var y = (WALL_LINES + 4) * LINE; y < h - WALL_LINES * LINE; y += 8 * LINE) {
      ctx.fillRect(nx, y, PX, 4 * LINE);
    }

    // The scores, each in its player's ink, the scorer's flashing after a point.
    var sides = [['left', inkL, w / 2 - SCORE.offset], ['right', inkR, w / 2 + SCORE.offset]];
    for (var s = 0; s < sides.length; s++) {
      var side = sides[s][0];
      var lit = true;
      if (mem.point && mem.point.side === side) {
        var age = t - mem.point.time;
        if (age >= 0 && age < FLASH.on * 2 * FLASH.times) lit = Math.floor(age / FLASH.on) % 2 === 0;
      }
      ctx.fillStyle = sides[s][1];
      var box = null;
      if (lit) box = drawScoreNumber(ctx, state.score[side], sides[s][2]);
      // The rally meter: a pixel a hit this serve, to at most 20.
      var hits = Math.min(METER.max, mem.hits[side] || 0);
      if (hits > 0) {
        var num = box || { left: snapX(sides[s][2] - (3 * SCORE.blockW) / 2), bottom: SCORE.top + 5 * SCORE.blockH };
        ctx.fillRect(num.left, num.bottom + METER.gapLines * LINE, hits * PX, LINE);
      }
    }

    // The paddles: the hit zones, unchanged, in their earned inks.
    ctx.fillStyle = inkL;
    ctx.fillRect(state.left.x, state.left.y, state.left.w, state.left.h);
    ctx.fillStyle = inkR;
    ctx.fillRect(state.right.x, state.right.y, state.right.w, state.right.h);

    // The ball: the picture chip's ball object, 2 pixels by 4 lines, hidden while the serve waits.
    if (state.serveDelay <= 0) {
      ctx.fillStyle = BALL_INK;
      var b = state.ball;
      ctx.fillRect(snapX(b.x + b.size / 2 - PX), snapY(b.y + b.size / 2 - 2 * LINE), 2 * PX, 4 * LINE);
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
    paddleInk: lookPaddleInk,
    draw: draw,
    playerSheets: playerSheets,
    flourish: tvComesAlive
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
