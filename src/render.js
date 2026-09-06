/*
 * Super Ultra Pong 64: Remastered -- the look of era zero.
 *
 * Draws a game state onto a canvas and nothing else: it READS the state and
 * never changes it, and it knows none of the rules. A later era should be able
 * to add its own draw pass here without the rules or the input noticing.
 *
 * Era zero is the 1972 machine: black field, white shapes, a dashed line down
 * the middle, a square ball, and chunky block digits across the top.
 */
(function (root) {
  'use strict';

  var INK = '#ffffff';
  var FIELD_INK = '#000000';

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

  var SCORE_CELL = 14;    // one block of a digit, in field units
  var SCORE_GAP = 12;     // between digits of the same number
  var SCORE_TOP = 40;     // distance from the top wall
  var SCORE_OFFSET = 110; // how far each score sits from the centre line

  function drawDigit(ctx, ch, left, top, cell) {
    var rows = DIGITS[ch];
    if (!rows) return;
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < 3; c++) {
        if (rows[r][c] === '1') {
          ctx.fillRect(left + c * cell, top + r * cell, cell, cell);
        }
      }
    }
  }

  function digitsWidth(text, cell) {
    return text.length * 3 * cell + (text.length - 1) * SCORE_GAP;
  }

  function drawNumber(ctx, value, centreX, top, cell) {
    var text = String(value);
    var x = centreX - digitsWidth(text, cell) / 2;
    for (var i = 0; i < text.length; i++) {
      drawDigit(ctx, text[i], x, top, cell);
      x += 3 * cell + SCORE_GAP;
    }
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

  /** Draw one frame of the given state. */
  function draw(ctx, state) {
    ctx.fillStyle = FIELD_INK;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.fillStyle = INK;
    drawCentreLine(ctx, state);
    drawNumber(ctx, state.score.left, state.width / 2 - SCORE_OFFSET, SCORE_TOP, SCORE_CELL);
    drawNumber(ctx, state.score.right, state.width / 2 + SCORE_OFFSET, SCORE_TOP, SCORE_CELL);

    ctx.fillRect(state.left.x, state.left.y, state.left.w, state.left.h);
    ctx.fillRect(state.right.x, state.right.y, state.right.w, state.right.h);

    // The ball blinks out while the serve waits, the way a reset reads.
    if (state.serveDelay <= 0) {
      ctx.fillRect(state.ball.x, state.ball.y, state.ball.size, state.ball.size);
    }
  }

  root.PongRender = { draw: draw, DIGITS: DIGITS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
