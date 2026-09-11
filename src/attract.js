/*
 * Super Ultra Pong 64: Remastered -- the cabinet (item 1207).
 *
 * What a Pong machine in a bar did before anyone put a quarter in, drawn over
 * the loop's own attract rally (src/main.js):
 *
 *   1. POWER ON. The tube warms up: a dot blooms in the middle of the black
 *      glass, stretches into a line across it, and the line opens into the
 *      picture, over-bright for a moment before the phosphor settles.
 *   2. ATTRACT. PONG in the machine's own block lettering, INSERT COIN blinking
 *      under it, CREDIT 0 in the corner, and behind it the machine playing
 *      itself, computer against computer, score ticking.
 *   3. THE COIN. Any click or key is a quarter: the clunk (the arcade voice's
 *      `coin` row in src/sound.js, with the cabinet hum under it), CREDIT 1,
 *      then PLAYER 1 READY -- all inside the first serve's hold, so the game is
 *      already 'playing' and the ball simply waits at the centre until READY
 *      goes out.
 *
 * The rules own the phase: this file never decides a game has started or
 * ended, it calls Pong.startGame(game, hold) and reads game.phase. A finished
 * match goes back here with Pong.backToTitle(game) and nothing else.
 *
 * ?title=off, or any ?era=N, skips the cabinet and opens straight into play
 * (for the playtest and quick looks); ?title=on keeps it even with ?era=N.
 */
(function (root) {
  'use strict';

  var WARM = 1.5;          // seconds the tube takes from black to the picture
  var COIN_HOLD = 2.1;     // seconds from the coin to the first serve
  var CREDIT_FOR = 0.85;   // ...of which CREDIT 1 is alone on the glass
  var INK = '#ffffff';

  var TITLE = {
    over: { text: 'SUPER ULTRA', cell: 8, gap: 6, top: 104 },
    name: { text: 'PONG', cell: 30, gap: 20, top: 148 },
    under: { text: '64  REMASTERED', cell: 7, gap: 5, top: 326 },
    coin: { text: 'INSERT COIN', cell: 10, gap: 8, top: 430 },
    how: { text: 'MOUSE OR ARROW KEYS TO PLAY', cell: 4, gap: 3, top: 520 },
    credit: { cell: 4, gap: 3, top: 566 }
  };

  /** Does this query string skip the cabinet and open straight into play? */
  function straightIn(search) {
    var q = String(search || '');
    if (/[?&]title=on\b/.test(q)) return false;
    return /[?&]title=off\b/.test(q) || /[?&]era=/.test(q);
  }

  function ease(u) {
    u = u < 0 ? 0 : (u > 1 ? 1 : u);
    return 1 - Math.pow(1 - u, 3);
  }

  function text(ctx, line, mid, str) {
    root.PongRender.drawText(ctx, str || line.text, mid, line.top, line.cell, line.gap);
  }

  /** A CRT's scanlines and dark corners: a few dozen fills, no pixel loops. */
  function glass(ctx, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (var y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    var g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function create() {
    var cab = {
      warm: false,      // has the tube finished warming up? (latched)
      credits: 0,       // quarters in; the corner counter reads it
      coinAt: -1,       // real play: how the coin overlay knows it is on
      WARM: WARM,
      COIN_HOLD: COIN_HOLD,
      straightIn: straightIn,
      coin: coin,
      drawTitle: drawTitle,
      drawOver: drawOver,
      stage: stage
    };

    /** 'warming' | 'attract' | 'credit' | 'ready' | 'play' -- what is on the glass. */
    function stage(game) {
      if (game.phase === 'title') return cab.warm || game.time >= WARM ? 'attract' : 'warming';
      if (cab.coinAt >= 0 && game.time < COIN_HOLD) return game.time < CREDIT_FOR ? 'credit' : 'ready';
      return 'play';
    }

    /**
     * A quarter in the slot. Only on the attract screen (or while the tube is
     * still warming); any other time it does nothing, so a fistful of keys
     * cannot restart a rally. True if it started a game.
     */
    function coin(game, sound) {
      if (game.phase !== 'title') return false;
      cab.warm = true;
      cab.credits += 1;
      if (!root.Pong.startGame(game, COIN_HOLD)) return false;
      cab.coinAt = game.time;
      if (sound && typeof sound.play === 'function') sound.play({ type: 'coin', era: 0 });
      return true;
    }

    /**
     * The title screen, whole: paint() draws the attract rally under it and the
     * cabinet adds its own scanlines. With paint null the picture is already
     * underneath (src/display.js draws it, with its own tube over it), so this
     * draws only the lettering and the warm-up's black, on a clear layer.
     */
    function drawTitle(ctx, game, paint) {
      var w = game.width, h = game.height, t = game.time;
      if (!cab.warm && t >= WARM) cab.warm = true;
      if (cab.warm) {
        scene(ctx, game, paint);
        if (paint) glass(ctx, w, h);
        return;
      }
      var cx = w / 2, cy = h / 2;
      if (t < 0.7) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.save();
      if (t < 0.35) {
        // The dot: a pin of light blooming out of the black.
        var r = 2 + 16 * ease(t / 0.35);
        var dot = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3);
        dot.addColorStop(0, 'rgba(255,255,255,1)');
        dot.addColorStop(0.25, 'rgba(210,240,255,0.8)');
        dot.addColorStop(1, 'rgba(120,180,255,0)');
        ctx.fillStyle = dot;
        ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);
      } else if (t < 0.7) {
        // The line: the dot pulled out sideways across the glass.
        var half = (w / 2) * ease((t - 0.35) / 0.35);
        ctx.shadowColor = '#bfe4ff';
        ctx.shadowBlur = 22;
        ctx.fillStyle = INK;
        ctx.fillRect(cx - half, cy - 2, half * 2, 4);
        ctx.fillRect(cx - 6, cy - 5, 12, 10);
      } else {
        // The picture: the line opens top and bottom, over-bright at first.
        var u = (t - 0.7) / (WARM - 0.7);
        var band = Math.min(h, Math.max(4, h * ease(u / 0.75)));
        var top = cy - band / 2, bottom = cy + band / 2;
        scene(ctx, game, paint);
        ctx.fillStyle = 'rgba(220,240,255,' + (0.75 * (1 - ease(u))).toFixed(3) + ')';
        ctx.fillRect(0, top, w, band);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, top);
        ctx.fillRect(0, bottom, w, h - bottom);
        ctx.shadowColor = '#bfe4ff';
        ctx.shadowBlur = 16;
        ctx.fillStyle = INK;
        if (band < h) {
          ctx.fillRect(0, cy - band / 2 - 2, w, 3);
          ctx.fillRect(0, cy + band / 2 - 1, w, 3);
        }
      }
      ctx.restore();
      if (paint) glass(ctx, w, h);
    }

    /** The attract picture: the rally, then PONG and the invitation over it. */
    function scene(ctx, game, paint) {
      var mid = game.width / 2;
      if (paint) paint();
      ctx.save();
      ctx.fillStyle = INK;
      text(ctx, TITLE.over, mid);
      ctx.shadowColor = 'rgba(255,255,255,0.85)';
      ctx.shadowBlur = 24;
      text(ctx, TITLE.name, mid);
      ctx.shadowBlur = 0;
      text(ctx, TITLE.under, mid);
      if (root.PongRender.promptLit(game)) text(ctx, TITLE.coin, mid);
      ctx.fillStyle = '#9a9a9a';
      text(ctx, TITLE.how, mid);
      creditLine(ctx, game, 0);   // the quarter is spent the moment it starts a game
      ctx.restore();
    }

    function creditLine(ctx, game, n) {
      var c = TITLE.credit;
      var str = 'CREDIT ' + n;
      ctx.fillStyle = INK;
      // In the corner, where a cabinet kept its counter (about 113 units wide).
      root.PongRender.drawText(ctx, str, game.width - 24 - 60, c.top, c.cell, c.gap);
    }

    /** Over real play: CREDIT 1, then PLAYER 1 READY, while the first serve holds. */
    function drawOver(ctx, game) {
      var s = stage(game);
      if (s !== 'credit' && s !== 'ready') return;
      var w = game.width, t = game.time, mid = w / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 214, w, 150);
      ctx.fillStyle = INK;
      ctx.shadowColor = 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = 14;
      if (s === 'credit') {
        root.PongRender.drawText(ctx, 'CREDIT 1', mid, 254, 14, 10);
      } else if (t > COIN_HOLD - 0.5 ? Math.floor(t / 0.1) % 2 === 0 : true) {
        root.PongRender.drawText(ctx, 'PLAYER 1', mid, 236, 11, 8);
        root.PongRender.drawText(ctx, 'READY', mid, 310, 9, 7);
      }
      ctx.shadowBlur = 0;
      // The coin flash: the whole glass jumps as the credit lands.
      if (t < 0.18) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.45 * (1 - t / 0.18)).toFixed(3) + ')';
        ctx.fillRect(0, 0, w, game.height);
      }
      creditLine(ctx, game, 1);
      ctx.restore();
    }

    return cab;
  }

  root.PongAttract = { create: create, straightIn: straightIn, WARM: WARM, COIN_HOLD: COIN_HOLD };
  if (typeof module === 'object' && module.exports) module.exports = root.PongAttract;
})(typeof globalThis !== 'undefined' ? globalThis : this);
