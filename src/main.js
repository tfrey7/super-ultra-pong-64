/*
 * Super Ultra Pong 64: Remastered -- the loop.
 *
 * Ties the three modules together: read the hands, advance the rules by the
 * REAL elapsed time, draw the result. Nothing about the game lives here.
 *
 * Two states reach the screen. A fresh game sits on the TITLE screen, where the
 * rules module refuses to move anything, and behind the title a second,
 * throwaway game plays itself in dim ink -- the attract rally an idle cabinet
 * ran all day. Any key or any click starts the real one.
 */
(function (root) {
  'use strict';

  // The attract rally is the same rules, slowed right down and barely speeding
  // up: it is scenery, and a fast ball behind the title reads as noise.
  var ATTRACT_RULES = {
    ballStartSpeed: 215,
    ballSpeedStep: 4,
    ballMaxSpeed: 300,
    cpuSpeed: 240,
    cpuMaxAimError: 34,
    serveDelay: 1.3
  };
  var ATTRACT_INK = '#3a3a3a';   // lit phosphor, well behind the title
  var ATTRACT_LAG = 3.0;         // how loosely the demo hand follows the ball

  function start() {
    var canvas = document.getElementById('field');
    var ctx = canvas.getContext('2d');
    var game = Pong.createGame();

    // The canvas is a fixed field of logical units, scaled to fit by CSS, so
    // one canvas pixel is one field unit and nothing has to be converted here.
    canvas.width = game.width;
    canvas.height = game.height;

    var attract = Pong.createGame({ phase: 'playing', rules: ATTRACT_RULES });
    var attractHand = attract.height / 2;

    /** The demo's hand: chases the ball, loosely enough to miss now and then. */
    function attractIntent(dt) {
      var target = attract.ball.y + attract.ball.size / 2;
      attractHand += (target - attractHand) * Math.min(1, dt * ATTRACT_LAG);
      return { pointerY: attractHand, up: false, down: false };
    }

    var input = PongInput.attach(canvas, game.height);
    var last = 0;

    function drawFrame() {
      if (game.phase === 'title') {
        PongRender.draw(ctx, attract, { ink: ATTRACT_INK });
        PongRender.drawTitle(ctx, game);
      } else {
        PongRender.draw(ctx, game);
      }
    }

    function frame(now) {
      var dt = last ? (now - last) / 1000 : 0;
      last = now;

      // In the title phase this only advances the clock the blink reads.
      Pong.step(game, dt, input.read());
      if (game.phase === 'title') Pong.step(attract, dt, attractIntent(dt));

      drawFrame();
      root.requestAnimationFrame(frame);
    }

    /** Any key, any click, any tap. Does nothing once the game is under way. */
    function begin() {
      Pong.startGame(game);
    }

    root.addEventListener('keydown', begin);
    root.addEventListener('mousedown', begin);
    canvas.addEventListener('touchstart', begin);

    drawFrame();
    root.requestAnimationFrame(frame);

    // A handle for a person (or a screenshot script) to look at the live state,
    // and to leave the title screen without a keyboard.
    root.__pong = game;
    root.__pongStart = begin;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
