/*
 * Super Ultra Pong 64: Remastered -- the era change, as a moment.
 *
 * When a point moves the machine up a rung, the player should SEE it happen:
 * a flash over the field, a wipe of the new machine's colours across it, and
 * a name card ("1985 · NES") in the new machine's own style.
 *
 * Drawing only. It reads two things the rules already leave in the state --
 * state.era and state.eraChangedAt -- and adds no rule of its own. The whole
 * moment lives INSIDE the serve pause the game already has (rules.serveDelay):
 * a point starts that pause, the card is up for its length, and it is gone the
 * frame the ball launches. So the serve is never delayed by so much as a frame.
 *
 * The year and the machine's name come from the ladder (Pong.ERAS in
 * src/game.js). Each rung's card style is in STYLES below; an era file may
 * carry its own `card` object on its look (same fields) and that wins, so an
 * era card can restyle its name card without editing this file.
 *
 * Loaded by index.html after the era files, before the loop. The loop calls
 * PongRender.drawEraChange(ctx, state) after drawing the frame.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  var FLASH_S = 0.12;     // the white-out at the instant of the point
  var WIPE_S = 0.32;      // the band of new colours crossing the field
  var CARD_FROM_S = 0.08; // the card comes up as the flash fades
  var BAND_W = 120;       // how wide the wipe band is, in field units

  // How each rung's name card looks. Plain colours, filled rectangles and the
  // score's own block font -- the only things the renderer ever draws with.
  //   flash   the colour the field whites out to
  //   wipe    the stripes of the band that crosses the field
  //   box     the card's fill        border  its frame (null: no frame)
  //   inner   a second, inner frame line (the NES dialog box), or null
  //   year    ink for the year       name    ink for the machine
  //   label   ink for the small ERA n line above
  //   dots    optional little squares under the name (the SNES buttons)
  var STYLES = {
    0: { flash: '#ffffff', wipe: ['#ffffff'], box: '#000000', border: '#ffffff',
         inner: null, year: '#ffffff', name: '#ffffff', label: '#ffffff' },
    // 1977 Atari 2600: black, with the woodgrain-era rainbow stripes, and the
    // year and name in the two paddles' own colours.
    1: { flash: '#ffffff', wipe: ['#c85c14', '#d8a038', '#c8cc30'], box: '#000000',
         border: '#d8a038', inner: null, year: 'paddle-left', name: 'paddle-right',
         label: '#d88860' },
    // 1985 NES: the black dialog box with the double white frame.
    2: { flash: '#fcfcfc', wipe: ['#e40058', '#fcfcfc', '#7c7c7c'], box: '#000000',
         border: '#fcfcfc', inner: '#fcfcfc', year: '#fcfcfc', name: '#fcfcfc',
         label: '#e40058' },
    // 1989 Sega Genesis: a deep blue window, white frame, yellow year.
    3: { flash: '#ffffff', wipe: ['#1e3cb4', '#3c78ff', '#ffffff'], box: '#1e3cb4',
         border: '#ffffff', inner: null, year: '#f8d800', name: '#ffffff',
         label: '#8cb4ff' },
    // 1991 Super Nintendo: a purple window, lavender frame, and the four
    // coloured buttons under the name.
    4: { flash: '#e8e0ff', wipe: ['#d82800', '#f8c000', '#00a844', '#2058d8'],
         box: '#403070', border: '#b4a0dc', inner: null, year: '#ffffff',
         name: '#ffffff', label: '#b4a0dc',
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
   * Is an era change on screen this instant, and how far through is it?
   * Null when nothing is showing. It shows only when a POINT moved the machine
   * (the era is above the one the session started at), only in play, and only
   * while the serve pause that point started is still running -- so the card
   * can never outlast the pause or hold the ball back.
   */
  function eraChangeMoment(state) {
    if (!state || state.phase !== 'playing') return null;
    if (!(state.era > (state.startEra || 0))) return null;
    if (!(state.serveDelay > 0)) return null;
    var length = (state.rules && state.rules.serveDelay) || 0;
    var t = state.time - (state.eraChangedAt || 0);
    if (!(t >= 0) || t >= length) return null;
    return { era: state.era, t: t, length: length, text: cardText(state.era) };
  }

  function ink(style, key, state) {
    var v = style[key];
    if (v === 'paddle-left') return R.paddleInk(state, 'left');
    if (v === 'paddle-right') return R.paddleInk(state, 'right');
    return v;
  }

  function drawFlash(ctx, state, m, style) {
    if (m.t >= FLASH_S) return;
    ctx.fillStyle = rgba(style.flash, 0.85 * (1 - m.t / FLASH_S));
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawWipe(ctx, state, m, style) {
    if (m.t >= WIPE_S) return;
    var x = (m.t / WIPE_S) * (state.width + BAND_W) - BAND_W;
    var stripe = BAND_W / style.wipe.length;
    for (var i = 0; i < style.wipe.length; i++) {
      ctx.fillStyle = style.wipe[i];
      ctx.fillRect(x + i * stripe, 0, stripe, state.height);
    }
  }

  var CARD = { height: 170, pad: 36, cell: 7, gap: 5, labelCell: 4, labelGap: 3, frame: 6 };

  function drawCard(ctx, state, m, style) {
    if (m.t < CARD_FROM_S) return;
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

  /**
   * Draw the era change over a frame that is already on the canvas. Does
   * nothing at all (not one draw call) when no change is showing.
   */
  function drawEraChange(ctx, state) {
    var m = eraChangeMoment(state);
    if (!m) return false;
    var style = cardStyle(m.era);
    drawWipe(ctx, state, m, style);
    drawCard(ctx, state, m, style);
    drawFlash(ctx, state, m, style);
    return true;
  }

  R.eraChangeMoment = eraChangeMoment;
  R.drawEraChange = drawEraChange;
  R.eraCardText = cardText;
  R.eraCardStyle = cardStyle;
  R.ERA_CHANGE = { flash: FLASH_S, wipe: WIPE_S, cardFrom: CARD_FROM_S, styles: STYLES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
