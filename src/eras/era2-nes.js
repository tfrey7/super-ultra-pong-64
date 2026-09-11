/*
 * Era 2 -- 1985 NES: the 8-bit machine.
 *
 * The second point of the session lands the machine here, and it has to read
 * at a glance as a different box under the television: a dark tiled court with
 * a white border instead of a black void, paddles and ball as chunky sprites
 * with a lit side and a shaded side, a dotted net between two posts, and the
 * score in the NES's own kind of pixel font -- thick two-pixel strokes with a
 * drop shadow, not the 1972 machine's 3x5 blocks.
 *
 * It changes nothing about play. Every sprite is drawn over the exact box the
 * rules hit-test, snapped to the sprite grid, and nothing here reads or writes
 * anything but the state it is handed.
 *
 * Colours come only from the NES's own palette (NES below), named by the index
 * NES code uses for them ($0C, $30 ...). Each paddle keeps the hue the rules
 * picked for it at the turn to colour: its Atari colour becomes the nearest
 * NES hue column, lit ($2x) on the body and shaded ($1x) on the right-hand
 * side, so the change of machine does not swap anyone's colour.
 *
 * Like every renderer here it only sets fillStyle and calls fillRect, so the
 * headless suite can record a frame without a browser.
 *
 * Arrival flourish: none yet, so the plain ring brings this era in. An era
 * brings its own by adding `flourish: function (ctx, p, origin, fromEra, toEra,
 * info)` to its look -- called every frame of the ring that brings THIS era in,
 * drawn over the ring's edge; the header of src/erachange.js is the contract.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // The 2C02 picture chip's 64 entries, $00-$3F, as the widely used RGB
  // approximation gives them (a composite signal has no one true RGB; this is
  // the table most emulators and references start from).
  var NES = [
    '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400',
    '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#000000', '#000000',
    '#bcbcbc', '#0078f8', '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10',
    '#ac7c00', '#00b800', '#00a800', '#00a844', '#008888', '#000000', '#000000', '#000000',
    '#f8f8f8', '#3cbcfc', '#6888fc', '#9878f8', '#f878f8', '#f85898', '#f87858', '#fca044',
    '#f8b800', '#b8f818', '#58d854', '#58f898', '#00e8d8', '#787878', '#000000', '#000000',
    '#fcfcfc', '#a4e4fc', '#b8b8f8', '#d8b8f8', '#f8b8f8', '#f8a4c0', '#f0d0b0', '#fce0a8',
    '#f8d878', '#d8f878', '#b8f8b8', '#b8f8d8', '#00fcfc', '#f8d8f8', '#000000', '#000000'
  ];

  var COURT = NES[0x0C];        // dark teal floor tiles
  var MORTAR = NES[0x0F];       // black: the lines between tiles, and shadows
  var LINE = NES[0x30];         // court border, net dots, ball
  var LINE_SHADE = NES[0x10];   // their shaded side
  var POST = NES[0x2D];         // the net posts

  var PX = 4;                   // one sprite pixel, in field units
  var TILE = 40;                // one floor tile (10 sprite pixels)

  // The rules' colour slot (era 1's palette order) -> the nearest NES hue
  // column: orange, gold, olive, grass, teal, sky, indigo, violet, magenta,
  // red, salmon, pale blue.
  var HUE_FOR_SLOT = [0x7, 0x8, 0x9, 0xA, 0xB, 0x1, 0x2, 0x3, 0x4, 0x6, 0x5, 0xC];
  // A machine that somehow reached this era without its colours still gets a
  // blue player and a red computer rather than two identical sprites.
  var UNCOLOURED_SLOT = { left: 5, right: 9 };

  /** A side's sprite inks: the lit body ($2x) and its shaded side ($1x). */
  function spriteInks(state, side) {
    var slot = state.colour
      ? ((state.paddleColour && state.paddleColour[side]) || 0)
      : UNCOLOURED_SLOT[side];
    var hue = HUE_FOR_SLOT[slot % HUE_FOR_SLOT.length];
    return { body: NES[0x20 + hue], shade: NES[0x10 + hue] };
  }

  function snap(v) {
    return Math.round(v / PX) * PX;
  }

  // The score font: six columns by seven rows, two-pixel strokes, the shape an
  // NES scoreboard had. A 1 is a lit pixel.
  var FONT = {
    '0': ['011110', '110011', '110011', '110011', '110011', '110011', '011110'],
    '1': ['001100', '011100', '001100', '001100', '001100', '001100', '111111'],
    '2': ['011110', '110011', '000011', '001110', '011000', '110000', '111111'],
    '3': ['111110', '000011', '000011', '011110', '000011', '000011', '111110'],
    '4': ['000111', '001111', '011011', '110011', '111111', '000011', '000011'],
    '5': ['111111', '110000', '111110', '000011', '000011', '110011', '011110'],
    '6': ['011110', '110000', '111110', '110011', '110011', '110011', '011110'],
    '7': ['111111', '000011', '000110', '001100', '001100', '001100', '001100'],
    '8': ['011110', '110011', '110011', '011110', '110011', '110011', '011110'],
    '9': ['011110', '110011', '110011', '011111', '000011', '000011', '011110']
  };
  var FONT_CELL = 6;
  var FONT_GAP = 6;
  var SCORE_TOP = 32;
  var SCORE_OFFSET = 110;

  // ------------------------------------------------------------ the court
  function drawCourt(ctx, state) {
    var w = state.width, h = state.height, v;
    ctx.fillStyle = COURT;
    ctx.fillRect(0, 0, w, h);
    // Tiles: one sprite pixel of black mortar along each tile's right and
    // bottom edge.
    ctx.fillStyle = MORTAR;
    for (v = TILE - PX; v < w; v += TILE) ctx.fillRect(v, 0, PX, h);
    for (v = TILE - PX; v < h; v += TILE) ctx.fillRect(0, v, w, PX);
  }

  function drawBorder(ctx, state) {
    var w = state.width, h = state.height;
    ctx.fillStyle = LINE;
    ctx.fillRect(0, 0, w, PX);
    ctx.fillRect(0, h - PX, w, PX);
    ctx.fillRect(0, 0, PX, h);
    ctx.fillRect(w - PX, 0, PX, h);
    // The shaded inner edge, so the border reads as a raised line.
    ctx.fillStyle = LINE_SHADE;
    ctx.fillRect(PX, PX, w - 2 * PX, PX);
    ctx.fillRect(PX, h - 2 * PX, w - 2 * PX, PX);
    ctx.fillRect(PX, PX, PX, h - 2 * PX);
    ctx.fillRect(w - 2 * PX, PX, PX, h - 2 * PX);
  }

  function netDots(state) {
    var dots = [];
    for (var y = 32; y + 2 * PX <= state.height - 32; y += 6 * PX) dots.push(y);
    return dots;
  }

  function drawNet(ctx, state) {
    var mid = state.width / 2;
    var dots = netDots(state);
    var i;
    ctx.fillStyle = POST;
    ctx.fillRect(mid - 6, 2 * PX, 12, 12);
    ctx.fillRect(mid - 6, state.height - 2 * PX - 12, 12, 12);
    ctx.fillStyle = LINE;
    for (i = 0; i < dots.length; i++) ctx.fillRect(mid - PX, dots[i], 2 * PX, 2 * PX);
    ctx.fillStyle = LINE_SHADE;
    for (i = 0; i < dots.length; i++) ctx.fillRect(mid, dots[i] + PX, PX, PX);
  }

  // ------------------------------------------------------------ the sprites
  /**
   * A paddle: four sprite pixels wide, centred on the rules' box, rounded off
   * at the corners. Lit body, shaded right-hand column and bottom row, two
   * shaded grip bands, and a black drop shadow one pixel down and right.
   */
  function drawPaddle(ctx, p, inks) {
    var rows = Math.max(6, Math.round(p.h / PX));
    var hh = rows * PX;
    var ox = snap(p.x + p.w / 2) - 2 * PX;
    var oy = snap(p.y);

    ctx.fillStyle = MORTAR;
    ctx.fillRect(ox + 4 * PX, oy + 2 * PX, PX, hh - 2 * PX);
    ctx.fillRect(ox + 3 * PX, oy + hh - PX, PX, PX);
    ctx.fillRect(ox + 2 * PX, oy + hh, 2 * PX, PX);

    ctx.fillStyle = inks.body;
    ctx.fillRect(ox + PX, oy, 2 * PX, hh - PX);
    ctx.fillRect(ox, oy + PX, PX, hh - 2 * PX);

    ctx.fillStyle = inks.shade;
    ctx.fillRect(ox + 3 * PX, oy + PX, PX, hh - 2 * PX);
    ctx.fillRect(ox + PX, oy + hh - PX, 2 * PX, PX);
    ctx.fillRect(ox + PX, oy + 4 * PX, 2 * PX, PX);
    ctx.fillRect(ox + PX, oy + hh - 5 * PX, 2 * PX, PX);
  }

  /**
   * The ball: a four-by-four sprite over its own box -- corners off so it
   * reads round -- lit top-left, shaded bottom-right, with a drop shadow.
   * It blinks out while the serve waits, as every era's ball does.
   */
  function drawBall(ctx, state) {
    if (state.serveDelay > 0) return;
    var b = state.ball;
    var c = b.size / 4;
    var ox = Math.round(b.x);
    var oy = Math.round(b.y);

    ctx.fillStyle = MORTAR;
    ctx.fillRect(ox + 4 * c, oy + 2 * c, c, 2 * c);
    ctx.fillRect(ox + 3 * c, oy + 3 * c, c, c);
    ctx.fillRect(ox + 2 * c, oy + 4 * c, 2 * c, c);

    ctx.fillStyle = LINE;
    ctx.fillRect(ox + c, oy, 2 * c, c);
    ctx.fillRect(ox, oy + c, 3 * c, c);
    ctx.fillRect(ox, oy + 2 * c, 2 * c, c);

    ctx.fillStyle = LINE_SHADE;
    ctx.fillRect(ox + 3 * c, oy + c, c, 2 * c);
    ctx.fillRect(ox + 2 * c, oy + 2 * c, c, c);
    ctx.fillRect(ox + c, oy + 3 * c, 2 * c, c);
  }

  // ------------------------------------------------------------ the score
  function scoreWidth(text) {
    return text.length * 6 * FONT_CELL + (text.length - 1) * FONT_GAP;
  }

  /** One pass of a number: each lit run of a row is one rectangle. */
  function paintNumber(ctx, text, left, top) {
    for (var i = 0; i < text.length; i++) {
      var rows = FONT[text[i]];
      var gx = left + i * (6 * FONT_CELL + FONT_GAP);
      if (!rows) continue;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        for (var c = 0; c < row.length; c++) {
          if (row[c] !== '1') continue;
          var run = c;
          while (run < row.length && row[run] === '1') run++;
          ctx.fillRect(gx + c * FONT_CELL, top + r * FONT_CELL, (run - c) * FONT_CELL, FONT_CELL);
          c = run;
        }
      }
    }
  }

  /** A score in its paddle's lit colour, over a black drop shadow. */
  function drawScore(ctx, value, centreX, ink) {
    var text = String(value);
    var left = Math.round(centreX - scoreWidth(text) / 2);
    ctx.fillStyle = MORTAR;
    paintNumber(ctx, text, left + FONT_CELL, SCORE_TOP + FONT_CELL);
    ctx.fillStyle = ink;
    paintNumber(ctx, text, left, SCORE_TOP);
  }

  // ------------------------------------------------------------ the frame
  function draw(ctx, state, opts, api) {
    // A dimmed frame (the attract rally behind a title) stays the stock
    // monochrome frame, exactly as era 1's does, so the title stays readable.
    if (opts && opts.ink) return (api || R).drawBase(ctx, state, opts);

    var left = spriteInks(state, 'left');
    var right = spriteInks(state, 'right');
    var mid = state.width / 2;

    drawCourt(ctx, state);
    drawBorder(ctx, state);
    drawNet(ctx, state);
    drawScore(ctx, state.score.left, mid - SCORE_OFFSET, left.body);
    drawScore(ctx, state.score.right, mid + SCORE_OFFSET, right.body);
    drawPaddle(ctx, state.left, left);
    drawPaddle(ctx, state.right, right);
    drawBall(ctx, state);
  }

  R.registerEra({
    era: 2,
    name: '1985 NES',
    nesPalette: NES,
    font: FONT,
    spriteInks: spriteInks,
    paddleInk: function (state, side) {
      return spriteInks(state, side).body;
    },
    draw: draw
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
