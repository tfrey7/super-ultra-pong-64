/*
 * Era 0 -- 1972 arcade Pong.
 *
 * The machine every later era grows out of: black field, everything drawn in
 * white. It uses the renderer's stock frame unchanged, so this look is only
 * the ink. One file, one registerEra() call; index.html loads it after
 * src/render.js.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  R.registerEra({
    era: 0,
    name: '1972 arcade Pong',
    paddleInk: function () { return R.INK; }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
