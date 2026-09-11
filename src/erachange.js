/*
 * Super Ultra Pong 64: Remastered -- the era change, as a moment.
 *
 * When a point moves the machine up a rung, the new machine SPREADS across the
 * field from the spot where the ball went out: a ring grows from that point,
 * and inside it the field is drawn by the new era's renderer while outside it
 * the old era's renderer keeps drawing. Both draw the same live state every
 * frame, so nothing disappears and the paddles stay in the player's hands the
 * whole way. Once the ring has passed the centre of the field the new era's
 * name card ("1985 · NES") comes up in that era's own style, and it stays until
 * the ball launches.
 *
 * Timing. The rules stretch the serve pause after an era-change point to
 * rules.eraChangePause (1.8 s, src/game.js); the ring takes WIPE_S (1.5 s) of
 * it, eased, and reaches past the far corner, so the whole field is the new
 * era with a beat to spare. Nothing here ever holds the ball: the moment is
 * gone the frame the serve launches.
 *
 * Technique. Two offscreen canvases, one per era, each draw the full frame;
 * the old one is copied on, the new one is copied on through a circular clip,
 * then the ring's edge and the flourish are drawn over it. Clip paths,
 * gradients and transforms only -- no per-pixel work. Under node --test there
 * is no document, so the same composite goes straight onto the given context.
 *
 * THE FLOURISH HOOK -- how an era gives its arrival its own look.
 * An era file may put a `flourish` function on the look it registers:
 *
 *   R.registerEra({ era: 2, ..., flourish: function (ctx, p, origin, fromEra, toEra, info) {} })
 *
 * It is the ARRIVING era's hook that plays (entering era 2 plays era 2's). It
 * is called once per frame while the ring is growing, after the ring's plain
 * edge has been drawn, inside ctx.save()/restore() so it cannot leak state:
 *   ctx      the page's canvas context, in field units (800 x 600)
 *   p        eased progress, 0 at the point to 1 when the ring covers the field
 *   origin   { x, y } where the ball left the field (state.missAt)
 *   fromEra  the rung being left      toEra  the rung arriving
 *   info     { radius, t, duration, width, height, state, dim } -- radius is the
 *            ring's edge in field units; state is READ-ONLY; dim is the ink when
 *            this is the attract rally behind the title (null in a real game)
 * With no hook the plain ring plays. A hook draws, and nothing else.
 *
 * The year and the machine's name come from the ladder (Pong.ERAS in
 * src/game.js). Each rung's card style is in STYLES below; an era file may
 * carry its own `card` object on its look (same fields) and that wins.
 *
 * Loaded by index.html after the era files, before the loop. The loop draws
 * every frame through PongRender.drawEraFrame(ctx, state, opts).
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  var WIPE_S = 1.5;       // how long the ring takes to cover the field
  var EDGE_PAD = 40;      // the ring's reach past the far corner, so its edge leaves the screen
  var GLOW_W = 26;        // the soft band just inside the ring's edge

  // ------------------------------------------------- the pure part: timing
  /** Raw progress of the wipe, 0..1, at t seconds after the point. */
  function wipeProgress(t, duration) {
    var d = duration === undefined ? WIPE_S : duration;
    if (!(d > 0)) return 1;
    if (!(t > 0)) return 0;
    return t >= d ? 1 : t / d;
  }

  /** Ease in and out (cubic): slow off the mark, fast across, settling at the far corner. */
  function easeWipe(p) {
    if (!(p > 0)) return 0;
    if (p >= 1) return 1;
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  /** How far the ring must reach from origin to cover a width x height field. */
  function ringReach(origin, width, height) {
    var dx = Math.max(origin.x, width - origin.x);
    var dy = Math.max(origin.y, height - origin.y);
    return Math.sqrt(dx * dx + dy * dy) + EDGE_PAD;
  }

  /** The ring's radius for an eased progress: 0 at the point, past the far corner at 1. */
  function ringRadius(eased, origin, width, height) {
    var e = eased > 0 ? (eased < 1 ? eased : 1) : 0;
    return e * ringReach(origin, width, height);
  }

  /** Where the change spreads from: where the ball went out, or the centre. */
  function wipeOrigin(state) {
    var m = state.missAt;
    if (m && typeof m.x === 'number' && typeof m.y === 'number') return { x: m.x, y: m.y };
    return { x: state.width / 2, y: state.height / 2 };
  }

  // How each rung's name card looks, and the colour of its ring's edge.
  //   edge    the ring's bright leading line
  //   box     the card's fill        border  its frame (null: no frame)
  //   inner   a second, inner frame line (the NES dialog box), or null
  //   year    ink for the year       name    ink for the machine
  //   label   ink for the small ERA n line above
  //   dots    optional little squares under the name (the SNES buttons)
  var STYLES = {
    0: { edge: '#ffffff', box: '#000000', border: '#ffffff',
         inner: null, year: '#ffffff', name: '#ffffff', label: '#ffffff' },
    // 1977 Atari 2600: black, gold frame, the year and name in the paddles' colours.
    1: { edge: '#d8a038', box: '#000000', border: '#d8a038', inner: null,
         year: 'paddle-left', name: 'paddle-right', label: '#d88860' },
    // 1985 NES: the black dialog box with the double white frame.
    2: { edge: '#e40058', box: '#000000', border: '#fcfcfc', inner: '#fcfcfc',
         year: '#fcfcfc', name: '#fcfcfc', label: '#e40058' },
    // 1989 Sega Genesis: a deep blue window, white frame, yellow year.
    3: { edge: '#3c78ff', box: '#1e3cb4', border: '#ffffff', inner: null,
         year: '#f8d800', name: '#ffffff', label: '#8cb4ff' },
    // 1991 Super Nintendo: a purple window, lavender frame, the four buttons.
    4: { edge: '#f8c000', box: '#403070', border: '#b4a0dc', inner: null,
         year: '#ffffff', name: '#ffffff', label: '#b4a0dc',
         dots: ['#d82800', '#f8c000', '#00a844', '#2058d8'] }
  };

  // The score's block font, plus a one-column middle dot for "1985 · NES".
  var GLYPHS = Object.assign({}, R.DIGITS, R.LETTERS, {
    '·': ['0', '0', '1', '0', '0']
  });
  var SPACE_CELLS = 2;

  function cells(ch) {
    var rows = GLYPHS[ch];
    return rows ? rows[0].length : SPACE_CELLS;
  }

  function textWidth(text, cell, gap) {
    var w = 0;
    for (var i = 0; i < text.length; i++) w += (i ? gap : 0) + cells(text[i]) * cell;
    return w;
  }

  /** One line of block text starting at left; returns where it ended. */
  function drawRun(ctx, text, left, top, cell, gap) {
    var x = left;
    for (var i = 0; i < text.length; i++) {
      var rows = GLYPHS[text[i]];
      if (rows) {
        for (var r = 0; r < rows.length; r++) {
          for (var c = 0; c < rows[r].length; c++) {
            if (rows[r][c] === '1') ctx.fillRect(x + c * cell, top + r * cell, cell, cell);
          }
        }
      }
      x += cells(text[i]) * cell + gap;
    }
    return x;
  }

  function rgba(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }

  /** The rung's entry in the ladder, from the rules' own table. */
  function ladderEntry(era) {
    // The page has window.Pong; under node --test the rules are a CommonJS
    // module and set no global, so reach them the way the tests do.
    var P = root.Pong ||
      (typeof module === 'object' && typeof require === 'function' ? require('./game.js') : null);
    var eras = (P && P.ERAS) || [];
    for (var i = 0; i < eras.length; i++) if (eras[i].era === era) return eras[i];
    return null;
  }

  /** What the card says for a rung: "1985 · NES". */
  function cardText(era) {
    var e = ladderEntry(era);
    return e ? e.year + ' · ' + String(e.machine).toUpperCase() : '';
  }

  /** The card style for a rung: the look's own `card` over the built-in one. */
  function cardStyle(era) {
    var base = STYLES[era] || STYLES[4];
    var look = R.eraLook(era);
    return Object.assign({}, base, (look && look.card) || {});
  }

  /**
   * Is an era change on screen this instant, and where has it got to? Null
   * when nothing is showing. It shows only when a POINT moved the machine (the
   * era is above the one the session started at), only in play, and only while
   * the serve pause that point started is still running -- so it can never
   * outlast the pause or hold the ball back.
   */
  function eraChangeMoment(state) {
    if (!state || state.phase !== 'playing') return null;
    if (!(state.era > (state.startEra || 0))) return null;
    if (!(state.serveDelay > 0)) return null;
    var rules = state.rules || {};
    var length = Math.max(rules.serveDelay || 0, rules.eraChangePause || 0);
    var t = state.time - (state.eraChangedAt || 0);
    if (!(t >= 0) || t >= length) return null;
    var origin = wipeOrigin(state);
    var raw = wipeProgress(t, WIPE_S);
    var p = easeWipe(raw);
    var radius = ringRadius(p, origin, state.width, state.height);
    var cx = state.width / 2 - origin.x;
    var cy = state.height / 2 - origin.y;
    return {
      era: state.era, from: state.era - 1, t: t, length: length, duration: WIPE_S,
      text: cardText(state.era), origin: origin, raw: raw, p: p, radius: radius,
      wiping: raw < 1, cardUp: radius >= Math.sqrt(cx * cx + cy * cy)
    };
  }

  function ink(style, key, state) {
    var v = style[key];
    if (v === 'paddle-left') return R.paddleInk(state, 'left');
    if (v === 'paddle-right') return R.paddleInk(state, 'right');
    return v;
  }

  var CARD = { height: 170, pad: 36, cell: 7, gap: 5, labelCell: 4, labelGap: 3, frame: 6 };

  function drawCard(ctx, state, m, style) {
    var mid = state.width / 2;
    var textW = textWidth(m.text, CARD.cell, CARD.gap);
    var w = Math.min(state.width - 40, textW + CARD.pad * 2);
    var h = CARD.height;
    var left = mid - w / 2;
    var top = state.height / 2 - h / 2;
    var f = CARD.frame;

    // The window: frame, then fill, then (NES) the inner frame line.
    if (style.border) {
      ctx.fillStyle = style.border;
      ctx.fillRect(left, top, w, h);
    }
    ctx.fillStyle = style.box;
    ctx.fillRect(left + f, top + f, w - 2 * f, h - 2 * f);
    if (style.inner) {
      ctx.fillStyle = style.inner;
      var o = f + 6;
      ctx.fillRect(left + o, top + o, w - 2 * o, 2);
      ctx.fillRect(left + o, top + h - o - 2, w - 2 * o, 2);
      ctx.fillRect(left + o, top + o, 2, h - 2 * o);
      ctx.fillRect(left + w - o - 2, top + o, 2, h - 2 * o);
    }

    // ERA n, small, above.
    var label = 'ERA ' + m.era;
    ctx.fillStyle = ink(style, 'label', state);
    drawRun(ctx, label, mid - textWidth(label, CARD.labelCell, CARD.labelGap) / 2,
            top + 30, CARD.labelCell, CARD.labelGap);

    // "1985 · NES": the year in its ink, the rest in the machine's.
    var textTop = top + 72;
    var year = m.text.split(' ')[0];
    var rest = m.text.slice(year.length);
    var x = mid - textW / 2;
    ctx.fillStyle = ink(style, 'year', state);
    x = drawRun(ctx, year, x, textTop, CARD.cell, CARD.gap);
    ctx.fillStyle = ink(style, 'name', state);
    drawRun(ctx, rest, x, textTop, CARD.cell, CARD.gap);

    if (style.dots) {
      var size = 12;
      var spacing = 22;
      var dx = mid - (style.dots.length * spacing - (spacing - size)) / 2;
      for (var i = 0; i < style.dots.length; i++) {
        ctx.fillStyle = style.dots[i];
        ctx.fillRect(dx + i * spacing, top + h - 36, size, size);
      }
    }
  }

  // ------------------------------------------------- the two layers
  var layers = [];

  /** An offscreen canvas the size of the field, made once and reused; null off-page. */
  function layer(i, w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = layers[i];
    if (!c) {
      c = layers[i] = document.createElement('canvas');
      c.getContext('2d');
    }
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, w, h);
    return x;
  }

  /** One era's full frame of the live state, on ctx, with nothing leaking out. */
  function drawEra(ctx, state, era, opts) {
    var s = era === state.era ? state : Object.assign({}, state, { era: era });
    ctx.save();
    R.draw(ctx, s, opts);
    ctx.restore();
  }

  function clipRing(ctx, m) {
    ctx.beginPath();
    ctx.arc(m.origin.x, m.origin.y, Math.max(0, m.radius), 0, Math.PI * 2);
    ctx.clip();
  }

  /** The plain ring: a soft glow inside the edge and a bright line on it. */
  function drawEdge(ctx, m, colour) {
    var r = m.radius;
    if (!(r > 1)) return;
    var o = m.origin;
    var inner = Math.max(0, r - GLOW_W);
    ctx.save();
    var glow = ctx.createRadialGradient(o.x, o.y, inner, o.x, o.y, r);
    glow.addColorStop(0, rgba(colour, 0));
    glow.addColorStop(1, rgba(colour, 0.45));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    ctx.arc(o.x, o.y, inner, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = colour;
    ctx.stroke();
    ctx.restore();
  }

  function drawRing(ctx, state, opts, m, style) {
    var dim = composite(ctx, state, opts, m, style);
    var look = R.eraLook(m.era);
    if (look && typeof look.flourish === 'function') {
      ctx.save();
      look.flourish(ctx, m.p, { x: m.origin.x, y: m.origin.y }, m.from, m.era, {
        radius: m.radius, t: m.t, duration: m.duration,
        width: state.width, height: state.height, state: state, dim: dim
      });
      ctx.restore();
    }
  }

  /** The two eras through the ring, and its plain edge; returns the dim ink. */
  function composite(ctx, state, opts, m, style) {
    var w = state.width;
    var h = state.height;
    var a = layer(0, w, h);
    var b = a && layer(1, w, h);
    if (a && b) {
      drawEra(a, state, m.from, opts);
      drawEra(b, state, m.era, opts);
      ctx.drawImage(a.canvas, 0, 0);
      ctx.save();
      clipRing(ctx, m);
      ctx.drawImage(b.canvas, 0, 0);
      ctx.restore();
    } else {
      // No document (node --test): the same composite, straight onto ctx.
      drawEra(ctx, state, m.from, opts);
      ctx.save();
      clipRing(ctx, m);
      drawEra(ctx, state, m.era, opts);
      ctx.restore();
    }
    var dim = (opts && opts.ink) || null;
    drawEdge(ctx, m, dim || style.edge || '#ffffff');
    return dim;
  }

  // ------------------------------------------------- the first ring, paid up front
  var warmed = false;

  /**
   * The first ring on a fresh page used to stall: about 125 ms for its first
   * frame from a cold Chrome profile (item 1164), the canvas making the two
   * layers, compiling the clip, copy and gradient work, and each era's renderer
   * drawing off-screen for the first time -- all in the serve pause, with the
   * paddle frozen. So the page's first framed draw pays that instead, before
   * anything has been shown: every rung's ring at a spread of radii, onto the
   * page's own canvas (a layer that is never copied anywhere is never
   * rasterised, so it would warm nothing), then the canvas is cleared and the
   * ordinary frame draws on a blank field. No flourish runs, no state is
   * written, and nothing of it reaches the screen. Off-page (node --test) it
   * does nothing at all.
   */
  function warmUp(ctx, state, opts) {
    warmed = true;
    if (typeof document === 'undefined' || !document.createElement || !ctx || !ctx.canvas) return;
    var P = root.Pong;
    var top = P && typeof P.TOP_ERA === 'number' ? P.TOP_ERA : 4;
    var origin = { x: -8, y: state.height / 4 };
    var reach = ringReach(origin, state.width, state.height);
    var fracs = [0.04, 0.3, 0.6, 1];
    ctx.save();
    try {
      for (var k = 1; k <= top; k++) {
        for (var f = 0; f < fracs.length; f++) {
          composite(ctx, state, opts,
            { from: k - 1, era: k, origin: origin, radius: fracs[f] * reach }, cardStyle(k));
        }
      }
    } catch (e) {
      // A warm-up is only ever an optimisation: never let it stop the page.
    } finally {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }

  /**
   * Draw one whole frame of a playing state: the plain frame, or -- while an
   * era change is on -- the ring between the two eras, then the name card.
   * opts are the renderer's (opts.ink dims the attract rally); opts.card
   * false leaves the card off, which is how the rally behind the title plays
   * its ring without a card under the title. Returns whether a change showed.
   */
  function drawEraFrame(ctx, state, opts) {
    if (!warmed) warmUp(ctx, state, opts);
    var m = eraChangeMoment(state);
    if (!m) {
      R.draw(ctx, state, opts);
      return false;
    }
    var style = cardStyle(m.era);
    if (m.wiping) drawRing(ctx, state, opts, m, style);
    else R.draw(ctx, state, opts);
    if (m.cardUp && !(opts && opts.card === false)) drawCard(ctx, state, m, style);
    return true;
  }

  R.eraChangeMoment = eraChangeMoment;
  R.drawEraFrame = drawEraFrame;
  R.eraCardText = cardText;
  R.eraCardStyle = cardStyle;
  R.ERA_CHANGE = {
    wipe: WIPE_S, edgePad: EDGE_PAD, styles: STYLES,
    wipeProgress: wipeProgress, easeWipe: easeWipe,
    ringReach: ringReach, ringRadius: ringRadius, wipeOrigin: wipeOrigin
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
