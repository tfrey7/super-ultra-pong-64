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

  R.registerEra({
    era: 1,
    name: '1977 Atari 2600',
    palette: PALETTE,
    paddleInk: function (state, side) {
      if (!state.colour) return R.INK;
      var i = (state.paddleColour && state.paddleColour[side]) || 0;
      return PALETTE[i % PALETTE.length];
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
