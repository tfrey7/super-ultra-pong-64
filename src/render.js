/*
 * Super Ultra Pong 64: Remastered -- the look, era by era.
 *
 * Draws a game state onto a canvas and nothing else: it READS the state and
 * never changes it, and it knows none of the rules. It holds the table of era
 * looks (see "the era table" below); each era's own look is one file in
 * src/eras/, so a later era adds its own draw pass there without the rules,
 * the input, or any other era noticing.
 *
 * Era zero is the 1972 machine: black field, white shapes, a dashed line down
 * the middle, a square ball, and chunky block digits across the top. The
 * title screen is drawn from the same 3x5 blocks as the score, at bigger cell
 * sizes -- there is no HTML text anywhere on the page.
 */
(function (root) {
  'use strict';

  var INK = '#ffffff';
  var FIELD_INK = '#000000';

  /** Bright enough to read against the black field. No contrast maths. */
  function isLegible(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return (r * 0.30 + g * 0.59 + b * 0.11) > 70;
  }

  // ------------------------------------------------------------ the era table
  // The rules carry an era NUMBER (state.era); what each number looks like
  // lives in its own plain-script file under src/eras/, loaded by index.html
  // after this one, and each file makes exactly one registerEra() call. An era
  // card edits its own file and nobody else's.
  //
  // A look is an object:
  //   era        its rung on the ladder (Pong.ERAS in src/game.js)
  //   name       what it is, for a reader
  //   paddleInk  function (state, side) -> the colour a paddle and its score wear
  //   like       optional: another era whose fields fill in anything this one
  //              leaves out -- how a placeholder draws an earlier era's look
  //   draw       optional: function (ctx, state, opts, PongRender) that takes
  //              over the whole frame; PongRender.drawBase is the stock frame
  //              an era can paint over.
  //   card       optional: this era's name-card style (src/erachange.js STYLES)
  //   flourish   optional: function (ctx, p, origin, fromEra, toEra, info),
  //              called every frame while the ring that brings THIS era in is
  //              growing, drawn over the ring's edge. p is the eased progress
  //              0..1, origin {x, y} is where the ball went out. The header of
  //              src/erachange.js is the full contract; no hook, plain ring.
  var LOOKS = [];
  var RESOLVED = [];

  // What draws when no era file has been loaded at all: the plain machine.
  var BARE_LOOK = { era: -1, name: 'no era loaded', paddleInk: function () { return INK; } };

  function registerEra(look) {
    if (!look || !(look.era >= 0) || Math.floor(look.era) !== look.era) {
      throw new Error('registerEra needs a look with a whole era number');
    }
    LOOKS[look.era] = look;
    RESOLVED = [];
    return look;
  }

  /**
   * The look for an era number: its own entry, with anything it leaves out
   * borrowed from the era it is `like`. A rung with no file at all falls back
   * to the nearest registered one below it, so a missing file draws an older
   * machine rather than nothing.
   */
  function eraLook(era) {
    var e = Math.floor(era) || 0;
    if (RESOLVED[e]) return RESOLVED[e];
    var found = BARE_LOOK;
    for (var i = e; i >= 0; i--) {
      if (!LOOKS[i]) continue;
      found = LOOKS[i];
      if (found.like !== undefined && found.like < i) {
        found = Object.assign({}, eraLook(found.like), found);
      }
      break;
    }
    if (e >= 0) RESOLVED[e] = found;
    return found;
  }

  /** What a paddle (and its score) is wearing, in whatever era the state is in. */
  function paddleInk(state, side) {
    return eraLook(state.era).paddleInk(state, side);
  }

  // A 3x5 block font -- the same shape the original score was built from.
  // Each row is three cells; a 1 is a lit block.
  var DIGITS = {
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'],
    '7': ['111', '001', '001', '010', '010'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111']
  };

  // The same blocks, extended to letters, so the title screen is built out of
  // the score's own font instead of borrowing the browser's. Five rows tall
  // and three columns wide like the digits -- except M, N and W, which get
  // five columns because in three they are indistinguishable smudges.
  var LETTERS = {
    'A': ['111', '101', '111', '101', '101'],
    'B': ['110', '101', '110', '101', '110'],
    'C': ['111', '100', '100', '100', '111'],
    'D': ['110', '101', '101', '101', '110'],
    'E': ['111', '100', '111', '100', '111'],
    'F': ['111', '100', '111', '100', '100'],
    'G': ['111', '100', '101', '101', '111'],
    'H': ['101', '101', '111', '101', '101'],
    'I': ['111', '010', '010', '010', '111'],
    'J': ['001', '001', '001', '101', '111'],
    'K': ['101', '101', '110', '101', '101'],
    'L': ['100', '100', '100', '100', '111'],
    'M': ['10001', '11011', '10101', '10001', '10001'],
    'N': ['10001', '11001', '10101', '10011', '10001'],
    'O': ['111', '101', '101', '101', '111'],
    'P': ['111', '101', '111', '100', '100'],
    'Q': ['111', '101', '101', '111', '011'],
    'R': ['111', '101', '111', '110', '101'],
    'S': ['111', '100', '111', '001', '111'],
    'T': ['111', '010', '010', '010', '010'],
    'U': ['101', '101', '101', '101', '111'],
    'V': ['101', '101', '101', '101', '010'],
    'W': ['10001', '10001', '10101', '11011', '01010'],
    'X': ['101', '101', '010', '101', '101'],
    'Y': ['101', '101', '111', '010', '010'],
    'Z': ['111', '001', '010', '100', '111'],
    ':': ['000', '010', '000', '010', '000'],
    '.': ['000', '000', '000', '000', '010'],
    ' ': null
  };

  var GLYPHS = Object.assign({}, DIGITS, LETTERS);

  var SCORE_CELL = 14;    // one block of a digit, in field units
  var SCORE_GAP = 12;     // between digits of the same number
  var SCORE_TOP = 40;     // distance from the top wall
  var SCORE_OFFSET = 110; // how far each score sits from the centre line

  function drawGlyph(ctx, ch, left, top, cell) {
    var rows = GLYPHS[ch];
    if (!rows) return;
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) {
        if (rows[r][c] === '1') {
          ctx.fillRect(left + c * cell, top + r * cell, cell, cell);
        }
      }
    }
  }

  var SPACE_CELLS = 2;    // a word gap, in font columns

  /** How many font columns a character takes. */
  function glyphCells(ch) {
    var rows = GLYPHS[ch];
    return rows ? rows[0].length : SPACE_CELLS;
  }

  /** How wide a run of glyphs comes out, in field units. */
  function textWidth(text, cell, gap) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      if (i) w += gap;
      w += glyphCells(text[i]) * cell;
    }
    return w;
  }

  /** One line of block text, centred on centreX. */
  function drawText(ctx, text, centreX, top, cell, gap) {
    var x = centreX - textWidth(text, cell, gap) / 2;
    for (var i = 0; i < text.length; i++) {
      drawGlyph(ctx, text[i], x, top, cell);
      x += glyphCells(text[i]) * cell + gap;
    }
  }

  function drawNumber(ctx, value, centreX, top, cell) {
    drawText(ctx, String(value), centreX, top, cell, SCORE_GAP);
  }

  function drawCentreLine(ctx, state) {
    var dash = 20;
    var gap = 16;
    var w = 6;
    var x = (state.width - w) / 2;
    for (var y = 6; y < state.height; y += dash + gap) {
      ctx.fillRect(x, y, w, Math.min(dash, state.height - y));
    }
  }

  /**
   * Draw one frame of the given state, in the look of the era it is in. An era
   * whose look brings its own draw takes the whole frame; every other era gets
   * the stock frame below, wearing its own paddle inks.
   */
  function draw(ctx, state, opts) {
    var look = eraLook(state.era);
    if (typeof look.draw === 'function') return look.draw(ctx, state, opts, api);
    drawBase(ctx, state, opts);
  }

  /**
   * The stock frame: the 1972 machine's field, centre line, block scores,
   * paddles and ball, with each paddle and score in its era's ink.
   * opts.ink dims the whole field, which is how the attract rally sits behind
   * the title without competing with it.
   */
  function drawBase(ctx, state, opts) {
    ctx.fillStyle = FIELD_INK;
    ctx.fillRect(0, 0, state.width, state.height);

    var ink = (opts && opts.ink) || INK;
    var dim = !!(opts && opts.ink);   // the attract rally behind the title
    ctx.fillStyle = ink;
    drawCentreLine(ctx, state);

    // Once the machine has turned colour each score wears its own paddle's
    // colour, so the flip reads across the whole screen and not just at the
    // edges. Dimmed (attract) frames stay monochrome whatever the state says.
    ctx.fillStyle = dim ? ink : paddleInk(state, 'left');
    drawNumber(ctx, state.score.left, state.width / 2 - SCORE_OFFSET, SCORE_TOP, SCORE_CELL);
    ctx.fillRect(state.left.x, state.left.y, state.left.w, state.left.h);

    ctx.fillStyle = dim ? ink : paddleInk(state, 'right');
    drawNumber(ctx, state.score.right, state.width / 2 + SCORE_OFFSET, SCORE_TOP, SCORE_CELL);
    ctx.fillRect(state.right.x, state.right.y, state.right.w, state.right.h);

    ctx.fillStyle = ink;

    // The ball blinks out while the serve waits, the way a reset reads.
    if (state.serveDelay <= 0) {
      ctx.fillRect(state.ball.x, state.ball.y, state.ball.size, state.ball.size);
    }
  }

  // The title screen, laid out in field units on the 800x600 field. Three
  // sizes of the same block font: the machine's name, what your hand does, and
  // the blinking invitation -- exactly the three things a cabinet told you.
  var TITLE = {
    name: [
      { text: 'SUPER ULTRA', cell: 9, gap: 7, top: 118 },
      { text: 'PONG 64', cell: 19, gap: 13, top: 178 },
      { text: 'REMASTERED', cell: 8, gap: 6, top: 296 }
    ],
    how: [
      { text: 'MOVE THE MOUSE TO STEER YOUR PADDLE', cell: 4, gap: 3, top: 386 },
      { text: 'THE CURSOR HIDES WHILE YOU PLAY', cell: 4, gap: 3, top: 418 },
      { text: 'ARROW KEYS OR W AND S ALSO WORK', cell: 4, gap: 3, top: 450 }
    ],
    prompt: { text: 'PRESS ANY KEY OR CLICK', cell: 6, gap: 5, top: 504 },
    rule: { top: 344, width: 300, thickness: 4 }   // hairline under the name
  };

  function drawLine(ctx, line, centreX) {
    drawText(ctx, line.text, centreX, line.top, line.cell, line.gap);
  }

  /**
   * Draw the title over whatever is already on the canvas -- the caller paints
   * the field (or a dimmed attract rally) first. Reads state.time for the
   * blink and nothing else, so it works on any state in the title phase.
   */
  function drawTitle(ctx, state) {
    var mid = state.width / 2;
    var i;

    ctx.fillStyle = INK;
    for (i = 0; i < TITLE.name.length; i++) drawLine(ctx, TITLE.name[i], mid);

    ctx.fillRect(mid - TITLE.rule.width / 2, TITLE.rule.top,
                 TITLE.rule.width, TITLE.rule.thickness);

    for (i = 0; i < TITLE.how.length; i++) drawLine(ctx, TITLE.how[i], mid);

    if (promptLit(state)) drawLine(ctx, TITLE.prompt, mid);
  }

  /**
   * Whether the invitation is showing this instant. The blink is the
   * renderer's business, so anything that needs to know -- the playtest
   * harness catching a screenshot with the prompt lit, say -- asks here rather
   * than re-deriving it. A blink period of 0, or a state without the rule at
   * all, simply leaves it lit.
   */
  function promptLit(state) {
    var period = (state.rules && state.rules.titleBlink) || 0;
    return !period || Math.floor(state.time / period) % 2 === 0;
  }

  var api = root.PongRender = {
    INK: INK,
    FIELD_INK: FIELD_INK,
    registerEra: registerEra,
    eraLook: eraLook,
    draw: draw,
    drawBase: drawBase,
    drawTitle: drawTitle,
    drawText: drawText,
    promptLit: promptLit,
    paddleInk: paddleInk,
    isLegible: isLegible,
    DIGITS: DIGITS,
    LETTERS: LETTERS,
    TITLE: TITLE
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
