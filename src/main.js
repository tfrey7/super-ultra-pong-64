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
    serveDelay: 1.3,
    matchPoints: 0          // the demo never finishes a match
  };
  var ATTRACT_INK = '#3a3a3a';   // lit phosphor, well behind the title
  var ATTRACT_LAG = 3.0;         // how loosely the demo hand follows the ball

  function start() {
    var canvas = document.getElementById('field');
    var ctx = canvas.getContext('2d');
    // ?era=3 opens the machine at that rung of the ladder -- for screenshots
    // and the playtest. No query is era 0, the 1972 machine.
    var game = Pong.createGame({
      era: Pong.eraFromQuery(root.location && root.location.search)
    });

    // The canvas is a fixed field of logical units, scaled to fit by CSS, so
    // one canvas pixel is one field unit and nothing has to be converted here.
    canvas.width = game.width;
    canvas.height = game.height;

    // The cabinet (src/attract.js): power-on, INSERT COIN, the coin moment.
    // ?title=off or ?era=N skips it and opens straight into play.
    var cabinet = root.PongAttract ? root.PongAttract.create() : null;
    if (cabinet && cabinet.straightIn(root.location && root.location.search)) Pong.startGame(game);

    var attract = Pong.createGame({ phase: 'playing', rules: ATTRACT_RULES });
    var attractHand = attract.height / 2;

    /** The demo's hand: chases the ball, loosely enough to miss now and then. */
    function attractIntent(dt) {
      var target = attract.ball.y + attract.ball.size / 2;
      attractHand += (target - attractHand) * Math.min(1, dt * ATTRACT_LAG);
      return { pointerY: attractHand, up: false, down: false };
    }

    var input = PongInput.attach(canvas, game.height);
    // The voice plays the REAL game's events only -- never the attract rally --
    // and stays silent until begin() unlocks it from a click or key.
    var sound = root.PongSound ? root.PongSound.createPlayer() : null;
    var last = 0;

    // Every frame goes through the era change (src/erachange.js): a plain
    // frame, or -- after a point that moved the machine up an era -- the new
    // era spreading across the field in a ring from where the ball went out,
    // then its name card, all inside the serve pause.
    var drawField = PongRender.drawEraFrame || PongRender.draw;
    // The real game's frame goes through game feel (src/feel.js): shake, squash,
    // trail, flash and the rally counter, drawn into the machine's own picture.
    function drawGame(c, g) { if (root.PongFeel) root.PongFeel.draw(c, g, drawField); else drawField(c, g); }

    // The display (src/display.js): each era drawn at its own machine's
    // resolution, then scaled up onto this canvas. ?display=off skips it and
    // draws straight on, in field units, the way the page did before.
    var display = root.PongDisplay && root.PongDisplay.enabled ? root.PongDisplay : null;

    /** The page canvas's pixels match the screen's, so one scale-up is all there is. */
    function fitCanvas() {
      var box = canvas.getBoundingClientRect();
      var w = Math.max(game.width, Math.round(box.width * (root.devicePixelRatio || 1)));
      var h = Math.round(w * game.height / game.width);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }

    var titleCanvas = null;

    function drawFrame() {
      if (display) {
        fitCanvas();
        var shown = game.phase === 'title' ? attract : game;
        var era = display.shownEra(shown);
        var native = display.begin(era, game.width, game.height);
        if (game.phase === 'title') drawField(native, attract, { ink: ATTRACT_INK, card: false });
        else drawGame(native, game);
        display.present(ctx, era, game.time);
        if (game.phase === 'title' || (cabinet && cabinet.stage(game) !== 'play')) {
          // The title is the cabinet's own lettering, kept sharp over the
          // machine's picture rather than squeezed into its pixels: drawn at
          // field size and scaled up hard, so its blocks have no seams.
          if (!titleCanvas) {
            titleCanvas = document.createElement('canvas');
            titleCanvas.width = game.width;
            titleCanvas.height = game.height;
          }
          var tctx = titleCanvas.getContext('2d');
          tctx.clearRect(0, 0, game.width, game.height);
          // The cabinet's warm-up, attract screen and coin moment ride this
          // layer; with paint null it leaves the picture to the display.
          if (!cabinet) PongRender.drawTitle(tctx, game);
          else if (game.phase === 'title') cabinet.drawTitle(tctx, game, null);
          else cabinet.drawOver(tctx, game);
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(titleCanvas, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        return;
      }
      if (game.phase === 'title') {
        // The demo rally climbs the ladder too: its ring plays, dimmed, with no
        // card under the title.
        var paint = function () { drawField(ctx, attract, { ink: ATTRACT_INK, card: false }); };
        if (cabinet) cabinet.drawTitle(ctx, game, paint);
        else { paint(); PongRender.drawTitle(ctx, game); }
      } else {
        drawGame(ctx, game);
        if (cabinet) cabinet.drawOver(ctx, game);   // CREDIT 1, PLAYER 1 READY
      }
    }

    function frame(now) {
      var dt = last ? (now - last) / 1000 : 0;
      last = now;

      // In the title phase this only advances the clock the blink reads.
      // Through the feel layer, which owns hit-stop and match-point slow motion.
      (root.PongFeel ? root.PongFeel.step : Pong.step)(game, dt, input.read());
      if (sound) sound.handle(game);
      if (game.phase === 'title') Pong.step(attract, dt, attractIntent(dt));

      drawFrame();
      root.requestAnimationFrame(frame);
    }

    /** Any key, any click, any tap. Does nothing once the game is under way. */
    function begin() {
      // Browsers only let a page make sound from inside a gesture like this one.
      if (sound) sound.unlock();
      // On the cabinet, a click or key is a quarter in the slot.
      if (cabinet) cabinet.coin(game, sound);
      else Pong.startGame(game);
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
    root.__pongSound = sound;
    root.__pongCabinet = cabinet;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
