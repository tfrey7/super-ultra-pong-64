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

  // The era ladder. Every point either side scores moves the machine up one
  // rung, and it stops at the top. This list is the single agreement every era
  // card works to: the rules only ever carry the NUMBER, and src/eras/ holds
  // one file per rung saying what that number looks like.
  var ERAS = [
    { era: 0, year: 1972, machine: 'arcade Pong' },       // black and white
    { era: 1, year: 1977, machine: 'Atari 2600' },        // the turn to colour
    { era: 2, year: 1985, machine: 'NES' },
    { era: 3, year: 1989, machine: 'Sega Genesis' },
    { era: 4, year: 1991, machine: 'Super Nintendo' },
    // The climb to the Xbox 360, drawn on the shared 3D table (docs/ERAS.md).
    { era: 5, year: 1994, machine: 'Sony PlayStation' },
    { era: 6, year: 1996, machine: 'Nintendo 64' },
    { era: 7, year: 1999, machine: 'Sega Dreamcast' },
    { era: 8, year: 2000, machine: 'PlayStation 2' },
    { era: 9, year: 2001, machine: 'Xbox' },
    { era: 10, year: 2005, machine: 'Xbox 360' }
  ];
  var TOP_ERA = ERAS.length - 1;

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
    eraChangePause: 1.8,    // ...stretched to this after a point that moved the
                            // machine up an era, so the era change (a 1.5 s
                            // ring wipe, src/erachange.js) plays inside it
    paletteSize: 12,        // how many paddle colours the renderer offers.
                            // The rules pick an INDEX; the hex lives in
                            // src/render.js, which is the only place that
                            // knows what a colour looks like.
    titleBlink: 0.62,       // seconds the 'press any key' line stays on, then off
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
  /**
   * A rung number made safe: whole, not below 0, not above the top of the
   * ladder. Anything that is not a number at all is era 0.
   */
  function clampEra(n) {
    n = Math.floor(Number(n));
    if (!(n >= 0)) return 0;
    return n > TOP_ERA ? TOP_ERA : n;
  }

  /**
   * Read a starting era out of a page's query string, e.g. '?era=3'. Takes the
   * STRING and nothing else, so the rules still never touch the page: the loop
   * hands it location.search. No era asked for (or a nonsense one) is era 0.
   */
  function eraFromQuery(search) {
    var m = /[?&]era=([^&#]*)/.exec(String(search || ''));
    return m ? clampEra(decodeURIComponent(m[1])) : 0;
  }

  function createGame(opts) {
    opts = opts || {};
    var rules = Object.assign({}, RULES, opts.rules || {});
    var width = opts.width || FIELD.width;
    var height = opts.height || FIELD.height;
    var startEra = clampEra(opts.era || 0);

    var state = {
      width: width,
      height: height,
      rules: rules,
      rng: opts.rng || Math.random,
      // Which rung of ERAS the machine is on. 0 is the 1972 machine; every
      // point moves it up one, capped at TOP_ERA. `eraChangedAt` is the game
      // time (state.time) of the last move, so a transition can be timed off
      // it. `startEra` is where a session begins -- 0 unless the page was
      // opened at a later era for a screenshot or a playtest.
      era: startEra,
      eraChangedAt: 0,
      startEra: startEra,
      // Where the ball left the field on the last point: { x, y } in field
      // units, x being the edge it crossed (0 or width) and y the height of the
      // ball's centre as it went. Null until a point is scored. The era change
      // spreads out from here.
      missAt: null,
      // Where a fresh machine sits. In 'title' the field exists but NOTHING
      // moves: the ball holds still and no point can be scored until
      // startGame() is called. 'playing' is the game proper.
      phase: opts.phase === 'playing' ? 'playing' : 'title',
      time: 0,                // seconds of simulated play
      // Evolution step one: the machine boots in black and white and turns
      // colour the instant the first point of the session lands. `colour` is
      // plain readable state, so the headless suite can ask "has it turned
      // yet?" without a canvas anywhere near it.
      colour: false,
      paddleColour: { left: 0, right: 0 },
      rally: 0,               // paddle hits since the last serve
      serveDelay: 0,
      score: { left: 0, right: 0 },
      lastEvent: null,        // 'wall' | 'paddle' | 'score' | 'serve' | null
      // Everything that happened during the LAST step(), in order, emptied at
      // the start of every step. lastEvent keeps only the final one; a sound
      // (or anything else that reacts) wants every hit and bounce, so it reads
      // this. Each entry is plain data: { type: 'paddle' | 'wall' | 'score',
      // side, era, time } -- era is the rung it happened on, and for a point
      // it is the rung that point moved the machine up TO.
      events: [],
      ball: {
        x: 0, y: 0, vx: 0, vy: 0,
        size: rules.ballSize
      },
      left: makePaddle(rules.paddleInset, rules, height),
      right: makePaddle(width - rules.paddleInset - rules.paddleWidth, rules, height)
    };

    serve(state, 1);
    // A machine opened past era 0 has already earned its colours.
    if (startEra >= 1) flipToColour(state);
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

  /**
   * Leave the title screen and start a real game: paddles home, score back to
   * nothing, a fresh serve, and the clock restarted. Calling it while already
   * playing does nothing, so a fistful of keypresses cannot restart a rally.
   * Returns true only if it actually started something.
   * hold (seconds, optional) keeps the first serve waiting at least that long:
   * the cabinet's coin moment -- CREDIT 1, PLAYER 1 READY -- plays inside it.
   */
  function startGame(state, hold) {
    if (state.phase !== 'title') return false;
    state.phase = 'playing';
    state.time = 0;
    state.score.left = 0;
    state.score.right = 0;
    state.left.y = (state.height - state.left.h) / 2;
    state.right.y = (state.height - state.right.h) / 2;
    // A fresh session starts monochrome again, and earns its own colours --
    // back at the era it was opened at, which is era 0 unless asked otherwise.
    state.colour = false;
    state.paddleColour = { left: 0, right: 0 };
    state.era = clampEra(state.startEra || 0);
    state.eraChangedAt = 0;
    state.missAt = null;
    serve(state, 1);
    if (state.era >= 1) flipToColour(state);
    if (hold > 0) state.serveDelay = Math.max(state.serveDelay, hold);
    return true;
  }

  /**
   * Back to the attract screen: the one call a finished match makes. The field
   * stops dead and the cabinet shows INSERT COIN again (src/attract.js); the
   * next coin is a fresh startGame(). Returns true only if a game was running.
   */
  function backToTitle(state) {
    if (state.phase === 'title') return false;
    state.phase = 'title';
    state.events = [];
    return true;
  }

  /**
   * One point scored: the machine moves up one era, unless it is already at
   * the top of the ladder. Reaching era 1 is the turn to colour. Returns true
   * only if the era actually moved.
   */
  function advanceEra(state) {
    var next = clampEra((state.era || 0) + 1);
    if (next === state.era) return false;
    state.era = next;
    state.eraChangedAt = state.time;
    if (next >= 1) flipToColour(state);
    return true;
  }

  /**
   * The first point of the session turns the machine colour, and it stays
   * colour until a new session starts. Each paddle draws a palette index;
   * the two are re-picked until they differ, so the paddles never share a
   * colour. (Nothing can vanish into the black field: every entry the
   * renderer offers is a bright one.)
   */
  function flipToColour(state) {
    if (state.colour) return false;
    var n = state.rules.paletteSize;
    var pick = function () { return Math.min(n - 1, Math.floor(state.rng() * n)); };
    var left = pick();
    var right = pick();
    for (var tries = 0; right === left && tries < 16; tries++) right = pick();
    if (right === left) right = (left + 1) % n;   // a pinned rng, say
    state.colour = true;
    state.paddleColour = { left: left, right: right };
    return true;
  }

  /** Note something that happened this step on state.events (see createGame). */
  function emit(state, type, side) {
    if (!state.events) state.events = [];
    state.events.push({ type: type, side: side || null, era: state.era || 0, time: state.time });
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
    emit(state, 'paddle', dirX > 0 ? 'left' : 'right');
    rerollCpuAim(state);
  }

  function bounceOffWalls(state) {
    var b = state.ball;
    if (b.y < 0) {
      b.y = -b.y;
      b.vy = Math.abs(b.vy);
      state.lastEvent = 'wall';
      emit(state, 'wall', 'top');
    } else if (b.y + b.size > state.height) {
      b.y = 2 * (state.height - b.size) - b.y;
      b.vy = -Math.abs(b.vy);
      state.lastEvent = 'wall';
      emit(state, 'wall', 'bottom');
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
      pointScored(state, 'right', 0, 1);
      return true;
    }
    if (b.x > state.width) {
      pointScored(state, 'left', state.width, -1);
      return true;
    }
    return false;
  }

  /**
   * A point: the score, where the ball went out, the era ladder, the event, and
   * the next serve. A point that moved the machine up an era waits the longer
   * eraChangePause instead of the plain serveDelay, so the era change has room.
   */
  function pointScored(state, side, edgeX, direction) {
    var b = state.ball;
    state.score[side] += 1;
    state.lastEvent = 'score';
    state.missAt = { x: edgeX, y: clamp(b.y + b.size / 2, 0, state.height) };
    var moved = advanceEra(state);
    emit(state, 'score', side);
    serve(state, direction);
    if (moved) state.serveDelay = Math.max(state.serveDelay, state.rules.eraChangePause || 0);
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
    state.events = [];

    // The title screen is a real state, not a paused game. The clock above
    // keeps running -- the blinking prompt reads it -- and nothing else
    // happens at all until startGame() is called.
    if (state.phase === 'title') return state;

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
    ERAS: ERAS,
    TOP_ERA: TOP_ERA,
    createGame: createGame,
    startGame: startGame,
    backToTitle: backToTitle,
    flipToColour: flipToColour,
    advanceEra: advanceEra,
    clampEra: clampEra,
    eraFromQuery: eraFromQuery,
    step: step,
    serve: serve,
    ballSpeed: ballSpeed,
    clamp: clamp
  };
});
