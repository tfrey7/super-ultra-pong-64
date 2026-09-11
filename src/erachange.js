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
 * src/game.js). Each rung's card colours are in STYLES below; an era file may
 * carry its own `card` object on its look (same fields) and that wins. HOW the
 * card is drawn -- the arriving machine's signboard -- is src/signboards.js.
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

  // Every signboard routine, and the block-font lettering they share, live in
  // src/signboards.js. The page loads it first; under node --test there are no
  // script tags, so it is required here, the way ladderEntry reaches the rules.
  if (typeof R.drawSignboard !== 'function' && typeof module === 'object' && typeof require === 'function') {
    require('./signboards.js');
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

  /**
   * The name card is the arriving machine's signboard: src/signboards.js holds
   * one routine per rung (R.SIGNBOARDS[era]) and the plain card for a rung that
   * has none yet, all inside the same rectangle. This is the per-era hook.
   */
  function drawCard(ctx, state, m, style) {
    return R.drawSignboard(ctx, state, m, style);
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
    // The layers match the canvas they land on, pixel for pixel, and draw in
    // its scale -- the page's own 800 x 600, or the display's native frame
    // (src/display.js) at whatever resolution the era on screen has.
    var into = ctx.canvas && ctx.canvas.width > 0 && typeof ctx.getTransform === 'function' ? ctx.canvas : null;
    var lw = into ? into.width : w;
    var lh = into ? into.height : h;
    var a = layer(0, lw, lh);
    var b = a && layer(1, lw, lh);
    if (a && b) {
      if (into) {
        var t = ctx.getTransform();
        a.setTransform(t); b.setTransform(t);
        a.imageSmoothingEnabled = b.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
      }
      drawEra(a, state, m.from, opts);
      drawEra(b, state, m.era, opts);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(a.canvas, 0, 0);
      ctx.restore();
      ctx.save();
      clipRing(ctx, m);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    var clock = root.performance && typeof root.performance.now === 'function' ? root.performance : Date;
    var began = clock.now(), flourishesFrom = began;
    var P = root.Pong;
    var top = P && typeof P.TOP_ERA === 'number' ? P.TOP_ERA : 4;
    var origin = { x: -8, y: state.height / 4 };
    var reach = ringReach(origin, state.width, state.height);
    var fracs = [0.04, 0.3, 0.6, 1];
    // The real looks, never the dimmed ones (item 1203). The page's first framed
    // draw is the attract rally behind the title, whose opts carry the dimming
    // ink -- and every era look handed that ink falls back to the plain dimmed
    // frame. Warmed with it, not one era's own gradients, rounded paddles or
    // shaded ball ever reached the GPU, so the first real ring still built about
    // ten GPU programs in its first frame (~100 ms, docs/measure/item-1203/).
    var real = null;
    ctx.save();
    try {
      for (var k = 1; k <= top; k++) {
        for (var f = 0; f < fracs.length; f++) {
          composite(ctx, state, real,
            { from: k - 1, era: k, origin: origin, radius: fracs[f] * reach }, cardStyle(k));
        }
      }
      warmTurnedPicture(ctx);
      flourishesFrom = clock.now();
      warmFlourishes(ctx, state, top);
    } catch (e) {
      // A warm-up is only ever an optimisation: never let it stop the page.
    } finally {
      // What it cost, on the page's own thread, for a measurement to read.
      R.ERA_CHANGE.warmMs = { total: +(clock.now() - began).toFixed(1), flourishes: +(clock.now() - flourishesFrom).toFixed(1) };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }

  /**
   * A copy of the canvas drawn TURNED -- rotated, scaled and faded, through a
   * thin strip of clip -- the way an arrival flourish moves the picture the ring
   * composited (the Super Nintendo's Mode 7 tilt draws its field as seventy-odd
   * such strips). None of the ring's own draws turn a picture, so the first ring
   * whose flourish did built that GPU program in its first turned frame: a
   * 13-25 ms frame at raw progress 0.12 of the change to era 4 on 15 of 20 fresh
   * pages, 24-30 ms under trace, all of it one D3D shader compile
   * (docs/measure/item-1218/). One small draw of each kind here pays it at load.
   * A layer canvas is the picture, so it is the same kind of image a flourish copies.
   */
  function warmTurnedPicture(ctx) {
    var pic = layers[0], into = layers[1];
    if (!pic || !into) return;
    var x = into.getContext('2d');
    if (!x || typeof x.transform !== 'function') return;
    var W = into.width, H = into.height;
    var m = [0.62, 0.21, -0.35, 0.44, 0.225 * W, 0.233 * H];
    // Each strip is placed across a corner of the turned picture. That matters:
    // a strip the picture crosses edge to edge is cropped on the CPU into one
    // plain quad and builds nothing new; only a strip with a corner of the
    // picture inside it needs the textured, clipped program the receding field does.
    var strips = [[m[5], 1], [m[1] * W + m[5], 0.7]];
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, W, H);
    for (var i = 0; i < strips.length; i++) {
      x.save();
      x.beginPath();
      x.rect(0, strips[i][0] - 3.5, W, 7.4);
      x.clip();
      x.globalAlpha = strips[i][1];
      x.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      x.drawImage(pic, 0, 0, pic.width, pic.height, 0, 0, W, H);
      x.restore();
    }
    // Drawn on a layer, then that layer copied once onto the canvas: the copy is
    // what makes Chrome rasterise the layer's draws. Draws made straight onto the
    // canvas would be thrown away unrasterised by the clear that ends the
    // warm-up -- which is why the first attempt, drawing there, changed nothing
    // (docs/measure/item-1218/timing-turned.json, timing-corner.json).
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(into, 0, 0);
    ctx.restore();
  }

  /**
   * Every arrival's flourish, drawn at the moments of its own ring where it
   * first draws something new (item 1285). The ring's composite above warms
   * the two eras and the edge, but no flourish; a flourish's draws change kind
   * as its ring grows -- era 1's television switches its rolled picture,
   * scanlines, colour bleed and glowing band on only once the ring is wider
   * than one field unit, and its rings open holes once it is wider than its
   * band -- and Chrome's graphics process builds a GPU program (rounded-rect
   * and circle fills, `FillRRectOp`) the first time each kind reaches the
   * screen. At 1920 x 1080 with the GPU on, the first change (0 to 1) had two
   * 58-83 ms frames at 0.18 s and 0.57 s into its ring on 3 of 3 fresh climbs,
   * 29 ms with every flourish switched off (docs/measure/item1285/).
   *
   * Each sample is the ring's own moment (its raw progress, eased), drawn on a
   * layer shaped like the canvas the real ring lands on then -- the leaving
   * era's until the ring covers the centre, the arriving era's after, as the
   * display sizes them -- and the layer copied onto the canvas, which is what
   * makes Chrome rasterise it (a draw made straight onto the canvas is thrown
   * away by the clear that ends the warm-up). A flourish only draws, so
   * drawing it here plays nothing and writes no state.
   */
  var WARM_RAWS = [0.03, 0.06, 0.1, 0.14, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 0.95];
  function warmFlourishes(ctx, state, top) {
    var D = root.PongDisplay && root.PongDisplay.enabled ? root.PongDisplay : null;
    var W = state.width, H = state.height;
    var origin = { x: -8, y: H / 4 };
    var cx = W / 2 - origin.x, cy = H / 2 - origin.y;
    for (var k = 1; k <= top; k++) {
      var look = R.eraLook(k);
      if (!look || typeof look.flourish !== 'function') continue;
      // eraChangedAt -1: no real change ever has it, so an era's private memory of
      // "which arrival is playing" (the PlayStation's lift, its old picture) never
      // mistakes this for one.
      var s = Object.assign({}, state, { era: k, eraChangedAt: -1 });
      for (var i = 0; i < WARM_RAWS.length; i++) {
        var raw = WARM_RAWS[i];
        var p = easeWipe(raw);
        var radius = ringRadius(p, origin, W, H);
        var on = radius >= Math.sqrt(cx * cx + cy * cy) ? k : k - 1;
        var row = D ? D.row(on) : null;
        var smooth = !!(row && row.smooth);
        var lw = smooth ? row.w : (D ? W : ctx.canvas.width);
        var lh = smooth ? row.h : (D ? H : ctx.canvas.height);
        var x = layer(2, lw, lh);
        if (!x) return;
        x.save();
        try {
          if (smooth) D.prepare(x, on, W, H);
          else if (!D && typeof ctx.getTransform === 'function') x.setTransform(ctx.getTransform());
          look.flourish(x, p, { x: origin.x, y: origin.y }, k - 1, k, {
            radius: radius, t: raw * WIPE_S, duration: WIPE_S,
            width: W, height: H, state: s, dim: null
          });
        } catch (e) {
          // one flourish's failure never stops the others warming
        } finally {
          x.restore();
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(x.canvas, 0, 0);
        ctx.restore();
      }
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
    ringReach: ringReach, ringRadius: ringRadius, wipeOrigin: wipeOrigin,
    composite: composite   // the finale's rewind (src/match.js) runs the ring backwards
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
