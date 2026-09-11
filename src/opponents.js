/*
 * Super Ultra Pong 64: Remastered -- the computer opponent, one per era (item 1209).
 *
 * The opponent grows up with the machine. The 1972 cabinet's COMPUTER is slow
 * and moves in steps, like a paddle driven by a counter; the Atari's CPU sees
 * the ball late; the NES and Genesis opponents are quicker; the Super Nintendo's
 * is the first to read where the ball is GOING rather than where it is; and
 * the six 3D machines climb to the Xbox 360, a fast, sharp opponent that is a
 * real fight. Every one of them stays beatable: `node tools/beatability-sample.mjs
 * --eras` measures each rung with the era pinned, and the test suite holds every
 * era between 30 and 65 percent.
 *
 * Two halves, both plain functions of the state:
 *   - stepCpu(state, dt): how the computer's paddle moves this frame. The rules
 *     (src/game.js) call it; it writes only state.right, never draws, never
 *     touches a timer or Math.random, so the headless suite runs it as is.
 *   - drawName(ctx, state, api): the opponent's name under its score, in the
 *     era's own lettering. The renderer calls it after the era's look.
 * From the Xbox on the opponent taunts on a point it wins -- through the
 * gamertag over its paddle and the Xbox 360's achievement toast -- and the
 * taunts are clean by construction: a short fixed list, nothing generated.
 *
 * Plain script with a UMD tail, like src/game.js: window.PongOpponents on the
 * page, module.exports under node.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PongOpponents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The stock rules the profiles are written against (src/game.js RULES).
  // A game made with other rules -- the slowed attract rally behind the title,
  // say -- scales every profile by its own cpuSpeed and cpuMaxAimError.
  var BASE = { speed: 300, aim: 52 };

  /*
   * One row per rung of the era ladder.
   *   name       what the opponent is called, where its score is
   *   reaction   seconds from the ball turning its way to the first move
   *   speed      top speed chasing, field units a second (at the stock rules)
   *   home       fraction of that speed used drifting back to the middle
   *   aim        the widest it aims off the ball, re-rolled every hit and serve
   *   tick       seconds between moves: above 0 it moves in jumps, not glides
   *   anticipate 0 chases the ball where it is; 1 goes where it will arrive,
   *              walls and all
   */
  var PROFILES = [
    { era: 0,  name: 'COMPUTER',     reaction: 0.22, speed: 250, home: 0.45, aim: 58, tick: 0.12, anticipate: 0 },
    { era: 1,  name: 'CPU',          reaction: 0.30, speed: 285, home: 0.50, aim: 58, tick: 0,    anticipate: 0 },
    { era: 2,  name: 'PLAYER 2',     reaction: 0.20, speed: 297, home: 0.55, aim: 56, tick: 0,    anticipate: 0 },
    { era: 3,  name: 'BLAST PROCESSOR', reaction: 0.16, speed: 300, home: 0.60, aim: 56, tick: 0, anticipate: 0 },
    { era: 4,  name: 'MODE 7',       reaction: 0.15, speed: 296, home: 0.60, aim: 55, tick: 0,    anticipate: 0.35 },
    { era: 5,  name: 'POLYGON',      reaction: 0.14, speed: 301, home: 0.65, aim: 54.5, tick: 0,    anticipate: 0.45 },
    { era: 6,  name: 'RUMBLE PAK',   reaction: 0.13, speed: 307, home: 0.65, aim: 53.5, tick: 0,    anticipate: 0.55 },
    { era: 7,  name: 'DREAM CPU',    reaction: 0.12, speed: 310, home: 0.70, aim: 53, tick: 0,    anticipate: 0.65 },
    { era: 8,  name: 'EMOTION ENGINE', reaction: 0.11, speed: 313, home: 0.70, aim: 53, tick: 0,  anticipate: 0.75 },
    { era: 9,  name: 'CPU 2001',     reaction: 0.10, speed: 317, home: 0.75, aim: 52, tick: 0,    anticipate: 0.85 },
    { era: 10, name: 'XENON',        reaction: 0.08, speed: 320, home: 0.80, aim: 52, tick: 0,    anticipate: 1 }
  ];

  // Said on a point the computer wins, from the Xbox up. Clean words only, and
  // only letters the block font can spell (A-Z, digits, space, colon, full stop).
  var TAUNTS = ['TOO SLOW', 'NICE TRY', 'GG', 'MY POINT', 'SO CLOSE', 'NOT TODAY', 'OWNED', 'BOOM'];
  var TAUNT_FROM_ERA = 9;
  var TAUNT_SECONDS = 2.5;

  function profileFor(era) {
    var n = Math.floor(Number(era));
    if (!(n >= 0)) n = 0;
    if (n > PROFILES.length - 1) n = PROFILES.length - 1;
    return PROFILES[n];
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /**
   * Where the ball's centre will be when it reaches the computer's paddle,
   * bouncing off the top and bottom walls on the way. The ball's own height
   * if it is not coming over at all.
   */
  function predictY(state) {
    var b = state.ball;
    var p = state.right;
    var cy = b.y + b.size / 2;
    if (!(b.vx > 0)) return cy;
    var t = Math.max(0, (p.x - (b.x + b.size)) / b.vx);
    var lo = b.size / 2;
    var span = state.height - b.size;
    if (!(span > 0)) return cy;
    var u = (cy + b.vy * t - lo) % (2 * span);
    if (u < 0) u += 2 * span;
    return lo + (u > span ? 2 * span - u : u);
  }

  /**
   * Move the computer's paddle for dt seconds, the way this era's opponent
   * plays. Everything it remembers lives on state.right as plain numbers:
   * `watch` (how long the ball has been coming its way), `tickLeft` (time to
   * its next jump, on a stepping machine) and `taunt` (what it last said).
   */
  function stepCpu(state, dt) {
    var p = state.right;
    var r = state.rules;
    var b = state.ball;
    var prof = profileFor(state.era);
    noticePoint(state, p);

    var incoming = b.vx > 0 && state.serveDelay <= 0;
    p.watch = incoming ? (p.watch || 0) + dt : 0;
    // It has not seen the ball turn yet: it stays where it was.
    if (incoming && p.watch < prof.reaction) return;

    var scale = (r.cpuSpeed || BASE.speed) / BASE.speed;
    var aimScale = BASE.aim > 0 ? prof.aim / BASE.aim : 1;
    var target;
    if (incoming) {
      var here = b.y + b.size / 2;
      var there = prof.anticipate > 0 ? predictY(state) : here;
      target = here + (there - here) * prof.anticipate + (p.aimError || 0) * aimScale;
    } else {
      target = state.height / 2;
    }
    var speed = prof.speed * scale * (incoming ? 1 : prof.home);

    // A stepping machine saves its movement up and spends it in one jump.
    var budget = dt;
    if (prof.tick > 0) {
      p.tickLeft = (p.tickLeft === undefined ? prof.tick : p.tickLeft) - dt;
      if (p.tickLeft > 0) return;
      budget = prof.tick;
      p.tickLeft += prof.tick;
      if (p.tickLeft < 0) p.tickLeft = 0;
    }

    var centre = p.y + p.h / 2;
    var diff = target - centre;
    if (Math.abs(diff) <= (r.cpuDeadZone || 0)) return;
    var move = (diff < 0 ? -1 : 1) * Math.min(Math.abs(diff), speed * budget);
    p.y = clamp(p.y + move, 0, state.height - p.h);
  }

  /**
   * The computer's score went up since it last looked: that was its point.
   * From the Xbox up it says so, picking from the list by the score itself
   * (never state.rng, so the rules' random sequence is untouched).
   */
  function noticePoint(state, p) {
    var mine = state.score ? state.score.right : 0;
    if (p.seenScore === undefined || mine < p.seenScore) p.seenScore = mine;
    if (mine > p.seenScore) {
      p.seenScore = mine;
      if ((state.era || 0) >= TAUNT_FROM_ERA) {
        p.taunt = { text: TAUNTS[(mine - 1) % TAUNTS.length], at: state.time };
      }
    }
  }

  /** The taunt showing this instant, or null. */
  function tauntFor(state) {
    var t = state && state.right && state.right.taunt;
    if (!t || (state.era || 0) < TAUNT_FROM_ERA) return null;
    var age = state.time - t.at;
    return age >= 0 && age < TAUNT_SECONDS ? t.text : null;
  }

  /** What the Xbox's gamertag over a paddle says: the taunt, for a moment, else its name. */
  function tagText(state, side, fallback) {
    return (side === 'right' && tauntFor(state)) || fallback;
  }

  /**
   * What the Xbox 360's point toast says. A point the computer won is not an
   * achievement for you, so its toast is the computer's taunt, worth nothing.
   */
  function toastText(state, fallback) {
    var line = tauntFor(state);
    return line ? '0G - ' + line : fallback;
  }

  // ------------------------------------------------------------- the name
  /*
   * Each era letters the name the way it letters its score. `at` is the centre
   * of the name, `size` the height of a letter in field units.
   *   block: the 3x5 score font; hd: the system font, with a block fallback
   *   ink: a colour, or 'paddle' for the computer's own paddle colour
   */
  var LETTERING = [
    { font: 'block', at: [510, 124], size: 10, ink: '#ffffff' },                                  // 1972: the score's own blocks
    { font: 'block', at: [510, 124], size: 10, ink: 'paddle' },                                  // Atari: in its colour
    { font: 'block', at: [510, 124], size: 10, ink: '#fcfcfc', shadow: '#000000' },              // NES: white on a hard shadow
    { font: 'block', at: [510, 124], size: 10, ink: '#ffffff', shadow: '#0038a8', skew: -0.25 }, // Genesis: italic, blue drop
    { font: 'block', at: [510, 124], size: 10, ink: '#f8f8f8', outline: '#302070' },             // SNES: outlined
    { font: 'hd', at: [510, 118], size: 15, ink: '#e8e8f0', weight: 700, family: 'Arial, sans-serif' },
    { font: 'hd', at: [510, 118], size: 15, ink: '#ffd800', weight: 700, family: 'Arial Black, Arial, sans-serif', shadow: '#c00018' },
    { font: 'hd', at: [510, 118], size: 15, ink: '#ff7a1a', weight: 700, family: 'Verdana, sans-serif' },
    { font: 'hd', at: [510, 118], size: 15, ink: '#9ec9ff', weight: 400, family: 'Arial, sans-serif', glow: '#2a6cff' },
    { font: 'hd', at: [600, 70], size: 14, ink: '#b8ff3c', weight: 700, family: 'Arial, sans-serif', glow: '#5cff2a' },
    { font: 'hd', at: [600, 70], size: 16, ink: '#ffffff', weight: 600, family: 'Segoe UI, Arial, sans-serif', glow: '#7ad73c' }
  ];

  function letteringFor(era) {
    var n = profileFor(era).era;
    return LETTERING[n];
  }

  function blockText(ctx, api, text, x, top, cell) {
    api.drawText(ctx, text, x, top, cell, cell);
  }

  /**
   * Draw the opponent's name for the state's era, under where its score sits.
   * Draws only in play (not over the title or the dimmed attract rally).
   */
  function drawName(ctx, state, api, opts) {
    if (!ctx || !state || state.phase === 'title' || (opts && opts.ink)) return;
    var prof = profileFor(state.era);
    var L = letteringFor(state.era);
    var x = L.at[0] * (state.width / 800);
    var y = L.at[1] * (state.height / 600);
    var text = prof.name;
    ctx.save();
    if (L.font === 'hd' && 'fillText' in ctx) {
      ctx.font = (L.weight || 600) + ' ' + L.size + 'px ' + L.family;
      var m = 'measureText' in ctx ? ctx.measureText(text) : null;
      if (m && m.width > 0) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (L.glow) { ctx.shadowColor = L.glow; ctx.shadowBlur = 8; }
        if (L.shadow) { ctx.fillStyle = L.shadow; ctx.fillText(text, x + 2, y + 2); }
        ctx.fillStyle = L.ink;
        ctx.fillText(text, x, y);
        ctx.restore();
        return;
      }
    }
    // The block font: 5 cells tall, centred on x.
    var cell = Math.max(1, Math.round(L.size / 5));
    var top = Math.round(y - 2.5 * cell);
    var ink = L.ink === 'paddle' && api.paddleInk ? api.paddleInk(state, 'right') : L.ink;
    if (L.skew) ctx.transform(1, 0, L.skew, 1, -L.skew * y, 0);
    if (L.outline) {
      ctx.fillStyle = L.outline;
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          if (dx || dy) blockText(ctx, api, text, x + dx, top + dy, cell);
        }
      }
    }
    if (L.shadow) {
      ctx.fillStyle = L.shadow;
      blockText(ctx, api, text, x + cell / 2 + 1, top + cell / 2 + 1, cell);
    }
    ctx.fillStyle = ink;
    blockText(ctx, api, text, x, top, cell);
    ctx.restore();
  }

  return {
    BASE: BASE,
    PROFILES: PROFILES,
    TAUNTS: TAUNTS,
    TAUNT_FROM_ERA: TAUNT_FROM_ERA,
    TAUNT_SECONDS: TAUNT_SECONDS,
    LETTERING: LETTERING,
    profileFor: profileFor,
    predictY: predictY,
    stepCpu: stepCpu,
    tauntFor: tauntFor,
    tagText: tagText,
    toastText: toastText,
    drawName: drawName
  };
});
