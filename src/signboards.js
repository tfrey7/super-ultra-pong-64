/*
 * Super Ultra Pong 64: Remastered -- the era signboards.
 *
 * The name card that comes up as the ring brings a machine in ("1985 · NES")
 * is that machine's signboard, and each machine letters its own the way a
 * title screen on it would have: the arcade cabinet in bare white blocks with
 * the net for a frame, the Atari 2600 on scanlines over its warm rainbow
 * bands, the NES in a double-framed dialog box, the Genesis in chrome over a
 * bevelled blue window, the Super Nintendo in a lit purple window over its
 * four buttons. Every signboard routine lives in this one file; the ring
 * engine (src/erachange.js) looks the arriving rung's routine up here and
 * falls back to the plain card for a rung that has none yet.
 *
 * THE SIGNBOARD HOOK -- how a rung gets its own signboard.
 *
 *   SIGNBOARDS[era] = function (ctx, k) { ... }
 *
 * k is the kit the engine hands every routine:
 *   k.rect     { x, y, w, h }: the card's rectangle, the same for every rung's
 *              text. EVERYTHING a routine draws stays inside it: the Super
 *              Nintendo's arrival crops exactly this rectangle, and the playtest
 *              leaves exactly this band out of its "new era draws" check.
 *   k.era      the rung arriving        k.text  "1985 · NES", from Pong.ERAS
 *   k.year     "1985"                   k.rest  " · NES"
 *   k.mid      the field's centre x     k.textW the name's width in the block font
 *   k.style    the card's colours: STYLES in src/erachange.js, under the look's own `card`
 *   k.ink(key) that style's colour for a key, 'paddle-left' / 'paddle-right' resolved
 *   k.t        seconds since the point that moved the machine up
 *   k.state    the live state, READ-ONLY
 * A routine sets k.nameTop to the row its name is lettered on (the legibility
 * test reads it), and letters the name with nameLine() from the block font, in
 * code, so it is always spelled right. Rectangles, paths, gradients and
 * transforms only: no per-pixel work at draw time.
 *
 * Loaded by index.html before src/erachange.js; under node --test the engine
 * requires it.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // The card's geometry: the same numbers the plain card has always had, so the
  // rectangle every rung's signboard sits in has not moved.
  var CARD = { height: 170, pad: 36, cell: 7, gap: 5, labelCell: 4, labelGap: 3, frame: 6 };

  // The screen each machine drew, in its own pixels. A lit block of a
  // signboard's name is never narrower or shorter than one of them. The arcade
  // cabinet had no frame buffer at all: its sync counters draw about 240
  // visible lines, and its width is taken to match.
  var RESOLUTION = {
    0: { w: 256, h: 240 },
    1: { w: 160, h: 192 },
    2: { w: 256, h: 240 },
    3: { w: 320, h: 224 },
    4: { w: 256, h: 224 }
  };

  // The words a signboard letters besides its name, blinking the way an
  // attract screen's did.
  var WORDS = { 0: 'INSERT COIN', 2: 'PUSH START' };

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

  /** Can the block font letter every character of text? */
  function canSpell(text) {
    for (var i = 0; i < text.length; i++) {
      if (text[i] !== ' ' && !GLYPHS[text[i]]) return false;
    }
    return true;
  }

  /**
   * One line of block text starting at left; returns where it ended. part, if
   * given, lights less of each block: { h } the lit height (a scanline gap under
   * it), { from, to } only those glyph rows.
   */
  function drawRun(ctx, text, left, top, cell, gap, part) {
    var h = part && part.h > 0 ? part.h : cell;
    var from = part && part.from > 0 ? part.from : 0;
    var to = part && part.to > 0 ? part.to : 99;
    var x = left;
    for (var i = 0; i < text.length; i++) {
      var rows = GLYPHS[text[i]];
      if (rows) {
        for (var r = from; r < rows.length && r < to; r++) {
          for (var c = 0; c < rows[r].length; c++) {
            if (rows[r][c] === '1') ctx.fillRect(x + c * cell, top + r * cell, cell, h);
          }
        }
      }
      x += cells(text[i]) * cell + gap;
    }
    return x;
  }

  /** Small text centred on the field, e.g. the ERA n line; returns its left edge. */
  function centred(ctx, k, text, top, part) {
    var left = k.mid - textWidth(text, CARD.labelCell, CARD.labelGap) / 2;
    drawRun(ctx, text, left, top, CARD.labelCell, CARD.labelGap, part);
    return left;
  }

  /** "1985 · NES" centred at top: the year in one ink, the rest in another. dx shifts it (a shadow). */
  function nameLine(ctx, k, top, yearInk, nameInk, part, dx) {
    var x = k.mid - k.textW / 2 + (dx || 0);
    ctx.fillStyle = yearInk;
    x = drawRun(ctx, k.year, x, top, CARD.cell, CARD.gap, part);
    ctx.fillStyle = nameInk;
    drawRun(ctx, k.rest, x, top, CARD.cell, CARD.gap, part);
  }

  /** On for the first half of every period seconds. */
  function blinkOn(t, period) {
    return !(t > 0) || (t % period) < period / 2;
  }

  // ------------------------------------------------- the plain card
  /** The card every rung had before it had a signboard of its own: eras 5 to 10 until item 1184. */
  function plain(ctx, k) {
    var r = k.rect, s = k.style, f = CARD.frame;
    if (s.border) {
      ctx.fillStyle = s.border;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.fillStyle = s.box;
    ctx.fillRect(r.x + f, r.y + f, r.w - 2 * f, r.h - 2 * f);
    if (s.inner) {
      ctx.fillStyle = s.inner;
      var o = f + 6;
      ctx.fillRect(r.x + o, r.y + o, r.w - 2 * o, 2);
      ctx.fillRect(r.x + o, r.y + r.h - o - 2, r.w - 2 * o, 2);
      ctx.fillRect(r.x + o, r.y + o, 2, r.h - 2 * o);
      ctx.fillRect(r.x + r.w - o - 2, r.y + o, 2, r.h - 2 * o);
    }
    ctx.fillStyle = k.ink('label');
    centred(ctx, k, 'ERA ' + k.era, r.y + 30);
    k.nameTop = r.y + 72;
    nameLine(ctx, k, k.nameTop, k.ink('year'), k.ink('name'));
    if (s.dots) {
      var size = 12;
      var spacing = 22;
      var dx = k.mid - (s.dots.length * spacing - (spacing - size)) / 2;
      for (var i = 0; i < s.dots.length; i++) {
        ctx.fillStyle = s.dots[i];
        ctx.fillRect(dx + i * spacing, r.y + r.h - 36, size, size);
      }
    }
  }

  // ------------------------------------------------- 1972 arcade Pong
  // No windows and no colour: nothing but the white blocks the cabinet built
  // its score and net from. The frame IS the net, dashed round the card; a
  // paddle stands either side of the name, the square ball waits at the top to
  // serve, and INSERT COIN blinks the way the attract screen did.
  function arcade(ctx, k) {
    var r = k.rect;
    var white = k.ink('border') || k.ink('name');
    ctx.fillStyle = k.style.box;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    var dash = 14, space = 10, t = 5;
    ctx.fillStyle = white;
    for (var x = r.x; x < r.x + r.w; x += dash + space) {
      var len = Math.min(dash, r.x + r.w - x);
      ctx.fillRect(x, r.y, len, t);
      ctx.fillRect(x, r.y + r.h - t, len, t);
    }
    for (var y = r.y + dash + space; y + dash <= r.y + r.h - t; y += dash + space) {
      ctx.fillRect(r.x, y, t, dash);
      ctx.fillRect(r.x + r.w - t, y, t, dash);
    }

    ctx.fillStyle = k.ink('label');
    centred(ctx, k, 'ERA ' + k.era, r.y + 28);

    k.nameTop = r.y + 72;
    ctx.fillStyle = white;
    ctx.fillRect(r.x + 14, k.nameTop - 7, 8, 49);              // the paddles, either side
    ctx.fillRect(r.x + r.w - 22, k.nameTop - 7, 8, 49);
    ctx.fillRect(r.x + r.w - 64, r.y + 30, 8, 8);              // the ball, waiting to serve
    nameLine(ctx, k, k.nameTop, k.ink('year'), k.ink('name'));

    if (blinkOn(k.t, 0.8)) {
      ctx.fillStyle = white;
      centred(ctx, k, WORDS[0], r.y + r.h - 40);
    }
  }

  // ------------------------------------------------- 1977 Atari 2600
  // Black, the gold frame, and the warm rainbow bands the 2600's boxes and
  // title screens ran across them. The machine drew short, wide pixels on a
  // television's scanlines, so every block of the lettering leaves a dark line
  // under it. The year and name wear the two paddles' colours, as the session
  // earned them on its first point.
  var ATARI_BANDS = ['#b82c0c', '#d8501c', '#e47c28', '#d8a038', '#e8c050', '#f0dc78'];

  function atari(ctx, k) {
    var r = k.rect, f = CARD.frame;
    ctx.fillStyle = k.ink('border');
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = k.style.box;
    ctx.fillRect(r.x + f, r.y + f, r.w - 2 * f, r.h - 2 * f);

    var bh = 4;
    var by = r.y + r.h - f - 10 - bh * ATARI_BANDS.length;
    for (var i = 0; i < ATARI_BANDS.length; i++) {
      ctx.fillStyle = ATARI_BANDS[i];
      ctx.fillRect(r.x + f, by + i * bh, r.w - 2 * f, bh);
    }

    // The ERA line in blocks one Atari pixel wide (800 / 160 = 5), not the
    // other rungs' 4, or the 2600's own screen smears it to a smudge.
    var label = 'ERA ' + k.era, lc = 5;
    ctx.fillStyle = k.ink('label');
    drawRun(ctx, label, k.mid - textWidth(label, lc, lc) / 2, r.y + 22, lc, lc, { h: 4 });
    k.nameTop = r.y + 62;
    nameLine(ctx, k, k.nameTop, k.ink('year'), k.ink('name'), { h: 5 });
  }

  // ------------------------------------------------- 1985 NES
  // The black dialog box an NES role-playing game opened its menus in: a double
  // white frame with its corners stepped off in whole blocks, the ERA line in
  // the machine's red with the arrow cursor blinking beside it, and PUSH START
  // under the name.
  function nes(ctx, k) {
    var r = k.rect, s = k.style, f = CARD.frame, step = 6;
    ctx.fillStyle = k.ink('border');
    ctx.fillRect(r.x + step, r.y, r.w - 2 * step, r.h);
    ctx.fillRect(r.x, r.y + step, r.w, r.h - 2 * step);
    ctx.fillStyle = s.box;
    ctx.fillRect(r.x + f, r.y + f, r.w - 2 * f, r.h - 2 * f);
    if (s.inner) {
      ctx.fillStyle = s.inner;
      var o = f + 5, th = 3;
      ctx.fillRect(r.x + o, r.y + o, r.w - 2 * o, th);
      ctx.fillRect(r.x + o, r.y + r.h - o - th, r.w - 2 * o, th);
      ctx.fillRect(r.x + o, r.y + o, th, r.h - 2 * o);
      ctx.fillRect(r.x + r.w - o - th, r.y + o, th, r.h - 2 * o);
    }

    var label = 'ERA ' + k.era;
    ctx.fillStyle = k.ink('label');
    var left = centred(ctx, k, label, r.y + 30);
    if (blinkOn(k.t, 0.5)) {
      // The cursor: a right-pointing arrow of blocks, as tall as the label.
      var cx = left - 18, cy = r.y + 30;
      var widths = [4, 8, 12, 8, 4];
      for (var i = 0; i < widths.length; i++) ctx.fillRect(cx, cy + i * 4, widths[i], 4);
    }

    k.nameTop = r.y + 70;
    nameLine(ctx, k, k.nameTop, k.ink('year'), k.ink('name'));

    if (blinkOn(k.t, 1)) {
      ctx.fillStyle = k.ink('name');
      centred(ctx, k, WORDS[2], r.y + r.h - 46);
    }
  }

  // ------------------------------------------------- 1989 Sega Genesis
  // The arcade brought home: a deep blue window lit from above inside a
  // bevelled white frame, speed lines streaking off either side of the ERA
  // line, and big lettering with a hard drop shadow and a chrome shine across
  // the lower rows of the machine's name.
  function genesis(ctx, k) {
    var r = k.rect, s = k.style, f = CARD.frame;
    ctx.fillStyle = k.ink('border');
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = s.box;
    ctx.fillRect(r.x + f, r.y + f, r.w - 2 * f, r.h - 2 * f);

    var lit = ctx.createLinearGradient(0, r.y + f, 0, r.y + r.h / 2);
    lit.addColorStop(0, 'rgba(110,160,255,0.5)');
    lit.addColorStop(1, 'rgba(110,160,255,0)');
    ctx.fillStyle = lit;
    ctx.fillRect(r.x + f, r.y + f, r.w - 2 * f, r.h / 2 - f);

    var b = 3;
    ctx.fillStyle = '#a8c8ff';                                     // the bevel's lit edges
    ctx.fillRect(r.x + f, r.y + f, r.w - 2 * f, b);
    ctx.fillRect(r.x + f, r.y + f, b, r.h - 2 * f);
    ctx.fillStyle = '#0c1c5c';                                     // and its shaded ones
    ctx.fillRect(r.x + f, r.y + r.h - f - b, r.w - 2 * f, b);
    ctx.fillRect(r.x + r.w - f - b, r.y + f, b, r.h - 2 * f);

    var label = 'ERA ' + k.era;
    var labelTop = r.y + 28;
    ctx.fillStyle = k.ink('label');
    var left = centred(ctx, k, label, labelTop);
    var right = left + textWidth(label, CARD.labelCell, CARD.labelGap);
    var lines = [60, 44, 28];
    for (var i = 0; i < lines.length; i++) {
      var ly = labelTop + 2 + i * 6;
      ctx.fillRect(left - 14 - lines[i], ly, lines[i], 3);
      ctx.fillRect(right + 14, ly, lines[i], 3);
    }

    k.nameTop = r.y + 68;
    nameLine(ctx, k, k.nameTop + 4, '#08104a', '#08104a', null, 4);  // the drop shadow
    nameLine(ctx, k, k.nameTop, k.ink('year'), k.ink('name'));
    nameLine(ctx, k, k.nameTop, k.ink('year'), '#9cc8ff', { from: 3 }); // the chrome shine
  }

  // ------------------------------------------------- 1991 Super Nintendo
  // The purple window of its menus, lit lighter at the top as its translucency
  // did, a lavender frame with a bright rule inside it, softly shadowed white
  // lettering, and the controller's four buttons as the diamond they sit in on
  // the pad, between two rules.
  function snes(ctx, k) {
    var r = k.rect, s = k.style, f = CARD.frame;
    if (s.border) {
      // The frame first and exactly the card: the arrival crops this rectangle.
      ctx.fillStyle = s.border;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.fillStyle = s.box;
    ctx.fillRect(r.x + f, r.y + f, r.w - 2 * f, r.h - 2 * f);
    var lit = ctx.createLinearGradient(0, r.y + f, 0, r.y + r.h * 0.6);
    lit.addColorStop(0, 'rgba(170,150,235,0.45)');
    lit.addColorStop(1, 'rgba(170,150,235,0)');
    ctx.fillStyle = lit;
    ctx.fillRect(r.x + f, r.y + f, r.w - 2 * f, r.h * 0.6 - f);

    var o = f + 4;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(r.x + o, r.y + o, r.w - 2 * o, 2);
    ctx.fillRect(r.x + o, r.y + r.h - o - 2, r.w - 2 * o, 2);

    ctx.fillStyle = k.ink('label');
    centred(ctx, k, 'ERA ' + k.era, r.y + 26);

    k.nameTop = r.y + 62;
    nameLine(ctx, k, k.nameTop + 3, '#1c1238', '#1c1238', null, 3);   // the soft shadow
    nameLine(ctx, k, k.nameTop, k.ink('year'), k.ink('name'));

    if (s.dots && s.dots.length >= 4) {
      var cx = k.mid, cy = r.y + r.h - 34, reach = 11, rad = 6;
      ctx.fillStyle = k.ink('label');
      ctx.fillRect(r.x + f + 24, cy - 1, cx - reach - rad - 14 - (r.x + f + 24), 3);
      ctx.fillRect(cx + reach + rad + 14, cy - 1, r.x + r.w - f - 24 - (cx + reach + rad + 14), 3);
      // X on top (blue), A on the right (red), B underneath (yellow), Y on the left (green).
      var at = [[0, -reach, 3], [reach, 0, 0], [0, reach, 1], [-reach, 0, 2]];
      for (var i = 0; i < at.length; i++) {
        ctx.fillStyle = s.dots[at[i][2]];
        ctx.beginPath();
        ctx.arc(cx + at[i][0], cy + at[i][1], rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  var SIGNBOARDS = { 0: arcade, 1: atari, 2: nes, 3: genesis, 4: snes };

  // ------------------------------------------------- the hook
  /** The rectangle a card for text sits in, on a width x height field. Pure. */
  function signboardRect(width, height, text) {
    var w = Math.min(width - 40, textWidth(text, CARD.cell, CARD.gap) + CARD.pad * 2);
    return { x: width / 2 - w / 2, y: height / 2 - CARD.height / 2, w: w, h: CARD.height };
  }

  /** The routine that letters a rung's signboard: its own, or the plain card. */
  function signboardFor(era) {
    return typeof SIGNBOARDS[era] === 'function' ? SIGNBOARDS[era] : plain;
  }

  function invisible(c) {
    return !c || c === 'transparent' || /^rgba\([^)]*,\s*0(\.0*)?\s*\)$/.test(String(c));
  }

  /**
   * Draw the signboard for an era change moment m ({ era, text, t }) in a card
   * style. Returns the kit it drew with (rect, nameTop), or null when the style
   * is held back invisible -- the Super Nintendo holds the engine's card while
   * its own copy spins in, and a held card draws nothing at all.
   */
  function drawSignboard(ctx, state, m, style) {
    if (invisible(style.box) && invisible(style.year) && invisible(style.name)) return null;
    var text = m.text;
    var year = text.split(' ')[0];
    var k = {
      era: m.era, text: text, year: year, rest: text.slice(year.length),
      rect: signboardRect(state.width, state.height, text),
      mid: state.width / 2, textW: textWidth(text, CARD.cell, CARD.gap),
      style: style, state: state, t: m.t || 0, nameTop: null,
      ink: function (key) {
        var v = style[key];
        if (v === 'paddle-left') return R.paddleInk(state, 'left');
        if (v === 'paddle-right') return R.paddleInk(state, 'right');
        return v;
      }
    };
    signboardFor(m.era)(ctx, k);
    return k;
  }

  R.SIGNBOARDS = SIGNBOARDS;
  R.signboardFor = signboardFor;
  R.drawSignboard = drawSignboard;
  R.SIGNBOARD = {
    card: CARD, resolution: RESOLUTION, words: WORDS, glyphs: GLYPHS,
    rect: signboardRect, textWidth: textWidth, canSpell: canSpell,
    blinkOn: blinkOn, plain: plain
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
