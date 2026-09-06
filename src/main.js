/*
 * Super Ultra Pong 64: Remastered -- the loop.
 *
 * Ties the three modules together: read the hands, advance the rules by the
 * REAL elapsed time, draw the result. Nothing about the game lives here.
 */
(function (root) {
  'use strict';

  function start() {
    var canvas = document.getElementById('field');
    var ctx = canvas.getContext('2d');
    var game = Pong.createGame();

    // The canvas is a fixed field of logical units, scaled to fit by CSS, so
    // one canvas pixel is one field unit and nothing has to be converted here.
    canvas.width = game.width;
    canvas.height = game.height;

    var input = PongInput.attach(canvas, game.height);
    var last = 0;

    function frame(now) {
      var dt = last ? (now - last) / 1000 : 0;
      last = now;
      Pong.step(game, dt, input.read());
      PongRender.draw(ctx, game);
      root.requestAnimationFrame(frame);
    }

    PongRender.draw(ctx, game);
    root.requestAnimationFrame(frame);

    // A handle for a person (or a screenshot script) to look at the live state.
    root.__pong = game;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
