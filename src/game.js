/*
 * Super Ultra Pong 64: Remastered -- pure game logic.
 *
 * This file is the whole simulation and NOTHING else: no canvas, no DOM, no
 * timers, no input devices. It is loaded both by the browser (as a plain
 * script, exposing `window.Pong`) and by `node --test` (as CommonJS), which is
 * why it ends in the small UMD wrapper rather than using ES module syntax --
 * ES modules cannot be opened straight off disk with file://.
 *
 * Later eras are meant to bolt on here: add fields to the state, add rules to
 * step(), and the renderer and input keep working because they only ever read
 * the state they are handed.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Pong = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  // Logical field units. The canvas happens to be 1:1 with these today; keep
  // everything below in field units so a future era can rescale the view.
  var FIELD = {
    width: 800,
    height: 600
  };

  var RULES = {
    ballSize: 12,
    paddleWidth: 14,
    paddleHeight: 84,
    paddleInset: 32,        // gap between the wall and the paddle's outer edge
    playerKeySpeed: 480,    // field units per second, keyboard control
    cpuSpeed: 300,          // the CPU is deliberately slower than a hard shot
    cpuHomeSpeed: 0.55,     // fraction of cpuSpeed used when drifting home
    cpuDeadZone: 9,         // it will not chase an error smaller than this
    cpuMaxAimError: 52,     // re-rolled each rally: the beatable part.
                            // Measured over 8 x 2 minutes of tracking play: a
                            // point roughly every 32s, or every 20s once the
                            // player starts aiming for the corners.
    ballStartSpeed: 340,
    ballSpeedStep: 22,      // added on every paddle hit
    ballMaxSpeed: 720,
    maxBounceAngle: Math.PI / 3,  // 60 degrees off the horizontal
    serveDelay: 0.9,        // seconds the ball waits at the centre
    maxSubstep: 6           // never move the ball further than this in one go
  };

  // ------------------------------------------------------------------ helpers
  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function sign(v) {
    return v < 0 ? -1 : 1;
  }

  function makePaddle(x, rules, height) {
    return {
      x: x,
      y: (height - rules.paddleHeight) / 2,
      w: rules.paddleWidth,
      h: rules.paddleHeight,
      aimError: 0
    };
  }

  /**
   * Build a fresh game state.
   * opts.rng lets tests pin the randomness down; it defaults to Math.random.
   */
  function createGame(opts) {
    opts = opts || {};
    var rules = Object.assign({}, RULES, opts.rules || {});
    var width = opts.width || FIELD.width;
    var height = opts.height || FIELD.height;

    var state = {
      width: width,
      height: height,
      rules: rules,
      rng: opts.rng || Math.random,
      era: 0,                 // era zero: the 1972 machine
      time: 0,                // seconds of simulated play
      rally: 0,               // paddle hits since the last serve
      serveDelay: 0,
      score: { left: 0, right: 0 },
      lastEvent: null,        // 'wall' | 'paddle' | 'score' | 'serve' | null
      ball: {
        x: 0, y: 0, vx: 0, vy: 0,
        size: rules.ballSize
      },
      left: makePaddle(rules.paddleInset, rules, height),
      right: makePaddle(width - rules.paddleInset - rules.paddleWidth, rules, height)
    };

    serve(state, 1);
    return state;
  }

  /**
   * Put the ball back in the middle and wait out the serve delay.
   * direction is -1 (towards the player) or +1 (towards the CPU).
   */
  function serve(state, direction) {
    var b = state.ball;
    var r = state.rules;
    b.x = (state.width - b.size) / 2;
    b.y = (state.height - b.size) / 2;
    // A shallow opening angle, like the machine: never a flat horizontal shot.
    var angle = (state.rng() * 2 - 1) * (r.maxBounceAngle * 0.4);
    b.vx = Math.cos(angle) * r.ballStartSpeed * direction;
    b.vy = Math.sin(angle) * r.ballStartSpeed;
    state.rally = 0;
    state.serveDelay = r.serveDelay;
    state.lastEvent = 'serve';
    rerollCpuAim(state);
  }

  function rerollCpuAim(state) {
    var r = state.rules;
    state.right.aimError = (state.rng() * 2 - 1) * r.cpuMaxAimError;
  }

  function ballSpeed(state) {
    var b = state.ball;
    return Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  }

  // ------------------------------------------------------------------ paddles
  function movePaddleTo(state, paddle, targetCentre) {
    paddle.y = clamp(targetCentre - paddle.h / 2, 0, state.height - paddle.h);
  }

  function stepPlayer(state, dt, intent) {
    var p = state.left;
    var r = state.rules;
    if (intent && typeof intent.pointerY === 'number') {
      // The mouse is absolute: the paddle goes where the hand is.
      movePaddleTo(state, p, intent.pointerY);
      return;
    }
    var dir = 0;
    if (intent && intent.up) dir -= 1;
    if (intent && intent.down) dir += 1;
    if (dir === 0) return;
    p.y = clamp(p.y + dir * r.playerKeySpeed * dt, 0, state.height - p.h);
  }

  function stepCpu(state, dt) {
    var p = state.right;
    var r = state.rules;
    var b = state.ball;
    var incoming = b.vx > 0 && state.serveDelay <= 0;
    // Chasing the ball only once it is on its way over, aiming slightly off,
    // and moving slower than a steep shot travels, is what makes it beatable.
    var target = incoming
      ? b.y + b.size / 2 + p.aimError
      : state.height / 2;
    var speed = incoming ? r.cpuSpeed : r.cpuSpeed * r.cpuHomeSpeed;
    var centre = p.y + p.h / 2;
    var diff = target - centre;
    if (Math.abs(diff) <= r.cpuDeadZone) return;
    var move = sign(diff) * Math.min(Math.abs(diff), speed * dt);
    p.y = clamp(p.y + move, 0, state.height - p.h);
  }

  // ------------------------------------------------------------------- bounce
  function overlaps(b, p) {
    return b.x < p.x + p.w &&
           b.x + b.size > p.x &&
           b.y < p.y + p.h &&
           b.y + b.size > p.y;
  }

  /**
   * Reflect the ball off a paddle. The outgoing angle comes from WHERE on the
   * paddle it landed: dead centre goes straight back, the tips go steep.
   */
  function bounceOffPaddle(state, paddle, dirX) {
    var b = state.ball;
    var r = state.rules;
    var hit = (b.y + b.size / 2) - (paddle.y + paddle.h / 2);
    var rel = clamp(hit / (paddle.h / 2), -1, 1);
    var angle = rel * r.maxBounceAngle;
    var speed = Math.min(ballSpeed(state) + r.ballSpeedStep, r.ballMaxSpeed);

    b.vx = Math.cos(angle) * speed * dirX;
    b.vy = Math.sin(angle) * speed;
    // Nudge clear of the paddle so the next frame cannot re-collide.
    b.x = dirX > 0 ? paddle.x + paddle.w : paddle.x - b.size;

    state.rally += 1;
    state.lastEvent = 'paddle';
    rerollCpuAim(state);
  }

  function bounceOffWalls(state) {
    var b = state.ball;
    if (b.y < 0) {
      b.y = -b.y;
      b.vy = Math.abs(b.vy);
      state.lastEvent = 'wall';
    } else if (b.y + b.size > state.height) {
      b.y = 2 * (state.height - b.size) - b.y;
      b.vy = -Math.abs(b.vy);
      state.lastEvent = 'wall';
    }
  }

  /** One small slice of ball movement. Returns true if a point was scored. */
  function moveBall(state, dt) {
    var b = state.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    bounceOffWalls(state);

    if (b.vx < 0 && overlaps(b, state.left)) bounceOffPaddle(state, state.left, 1);
    else if (b.vx > 0 && overlaps(b, state.right)) bounceOffPaddle(state, state.right, -1);

    if (b.x + b.size < 0) {
      state.score.right += 1;
      state.lastEvent = 'score';
      serve(state, 1);
      return true;
    }
    if (b.x > state.width) {
      state.score.left += 1;
      state.lastEvent = 'score';
      serve(state, -1);
      return true;
    }
    return false;
  }

  /**
   * Advance the whole game by dt seconds.
   *
   * dt is real elapsed time -- nothing here assumes 60fps. Long frames are cut
   * into substeps so a fast ball can never tunnel through a paddle.
   */
  function step(state, dt, intent) {
    if (!(dt > 0)) return state;
    dt = Math.min(dt, 0.05);     // a tab that was in the background, say
    state.time += dt;
    state.lastEvent = null;

    stepPlayer(state, dt, intent);
    stepCpu(state, dt);

    if (state.serveDelay > 0) {
      state.serveDelay -= dt;
      return state;
    }

    var speed = ballSpeed(state) || 1;
    var slices = Math.max(1, Math.ceil((speed * dt) / state.rules.maxSubstep));
    var slice = dt / slices;
    for (var i = 0; i < slices; i++) {
      if (moveBall(state, slice)) break;   // a serve is waiting; stop here
    }
    return state;
  }

  return {
    FIELD: FIELD,
    RULES: RULES,
    createGame: createGame,
    step: step,
    serve: serve,
    ballSpeed: ballSpeed,
    clamp: clamp
  };
});
