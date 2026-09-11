/*
 * A scripted rally that scores against the computer -- the hand the playtest's
 * "the player can score against the computer" check plays with, and the
 * 'scripted' row of tools/beatability-sample.mjs.
 *
 * A plain ball-chase scores in 22 seconds only 44% of the time, which is the
 * computer being beatable BY DESIGN, not a fault -- but it made that playtest
 * check a coin flip. This hand does not chase. For every ball coming its way it
 * asks the real rules (src/game.js, the same file the page loads) where to
 * stand: each paddle position that could meet the ball is played forward
 * against a spread of the aim errors the computer can roll, and scored by how
 * many of them it beats -- together with its neighbours, so a few units of
 * browser timing either way still lands the same shot. It stands at the best
 * one. What it
 * exploits is the computer's own documented weakness -- it only chases once the
 * ball heads its way, and cannot match a steep shot from the paddle tip.
 *
 * Nothing here changes the computer. If the rules ever make it unbeatable, no
 * position is certain, the hand falls back to its best guess, and the check
 * fails -- which is what a perfect computer deserves (bootstrap, section 8).
 *
 * Node only (CommonJS, no dependencies). Nothing in src/ knows it exists.
 */
'use strict';

const DT = 1 / 60;
// The computer's aim error is (u * 2 - 1) * cpuMaxAimError; these span it.
const AIM_ROLLS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.9999];
const HAND_STEP = 3;   // field units between the paddle positions tried
const SPREAD = 2;      // neighbours each side a position is judged with

/**
 * The shape the playtest reads off the page. snapshotOf() makes the same shape
 * from a state held in Node, so the sampler and the harness share one planner.
 */
function snapshotOf(g) {
  return {
    width: g.width, height: g.height, rules: g.rules,
    serveDelay: g.serveDelay, rally: g.rally,
    score: { left: g.score.left, right: g.score.right },
    ball: { x: g.ball.x, y: g.ball.y, vx: g.ball.vx, vy: g.ball.vy,
      spin: g.ball.spin || 0, burst: g.ball.burst || 0 },
    leftY: g.left.y, rightY: g.right.y
  };
}

/** A private copy of the moment in `snap`, with the computer's next aim pinned to `u`. */
function copyOf(Pong, snap, u) {
  const g = Pong.createGame({
    width: snap.width, height: snap.height, rules: snap.rules,
    phase: 'playing', rng: () => u
  });
  g.ball.x = snap.ball.x; g.ball.y = snap.ball.y;
  g.ball.vx = snap.ball.vx; g.ball.vy = snap.ball.vy;
  g.ball.spin = snap.ball.spin || 0; g.ball.burst = snap.ball.burst || 0;   // item 1208
  g.left.y = snap.leftY; g.right.y = snap.rightY;
  g.serveDelay = snap.serveDelay; g.rally = snap.rally;
  return g;
}

/** Where the ball's centre will be when it reaches the player's paddle face, or null. */
function arrivalY(Pong, snap) {
  const g = copyOf(Pong, snap, 0.5);
  const face = g.left.x + g.left.w;
  g.left.x = -1e6;   // out of the way, so the ball flies on through
  for (let t = 0; t < 10; t += DT) {
    Pong.step(g, DT, null);
    if (g.ball.x < face) return g.ball.y + g.ball.size / 2;
    if (g.score.left || g.score.right) return null;
  }
  return null;
}

/** Does standing at `hand` score, if the computer rolls aim `u` on the return? */
function scores(Pong, snap, hand, u) {
  const g = copyOf(Pong, snap, u);
  const intent = { pointerY: hand, up: false, down: false };
  for (let t = 0; t < 12; t += DT) {
    Pong.step(g, DT, intent);
    if (g.score.left > 0) return true;
    if (g.score.right > 0 || g.rally > snap.rally + 1) return false;   // missed, or returned
  }
  return false;
}

/**
 * Where to stand for the ball now coming at the player. Returns
 * { hand, certain, chance } -- chance is the share of (aim roll, neighbouring
 * position) pairs that score from there, and certain means all of them do.
 */
function plan(Pong, snap) {
  const at = arrivalY(Pong, snap);
  if (at === null) return { hand: snap.height / 2, certain: false, width: 0 };
  const rules = snap.rules || Pong.RULES;
  const reach = rules.paddleHeight / 2 + rules.ballSize;
  // The paddle stops at the walls, so a hand past these edges stands exactly
  // where the edge does -- and a hand kept on the field keeps the harness's
  // mouse on the canvas.
  const lo = Math.max(at - reach, rules.paddleHeight / 2);
  const hi = Math.min(at + reach, snap.height - rules.paddleHeight / 2);
  const hands = [];
  for (let hand = lo; hand <= hi; hand += HAND_STEP) hands.push(hand);
  // How many of the computer's possible aims each position beats...
  const wins = hands.map((hand) => AIM_ROLLS.filter((u) => scores(Pong, snap, hand, u)).length);
  // ...judged with its neighbours, because the browser meets the ball a few
  // units either side of where the rules put it. Past the ends of the list the
  // paddle is against a wall, which is the end position again.
  const near = (i) => {
    let sum = 0;
    for (let j = i - SPREAD; j <= i + SPREAD; j++) sum += wins[Math.max(0, Math.min(wins.length - 1, j))];
    return sum;
  };
  let best = 0;
  for (let i = 1; i < hands.length; i++) if (near(i) > near(best)) best = i;
  const full = AIM_ROLLS.length * (2 * SPREAD + 1);
  return { hand: hands[best], certain: near(best) === full, chance: near(best) / full };
}

/**
 * One player's hand for one session. Call it with each fresh snapshot; it
 * answers the field height to put the hand at. A ball heading away gets the
 * middle; a ball heading in gets one plan, made the first time it is seen and
 * kept until the rally or the score moves, so the paddle never jumps across
 * the ball's path on its way in.
 */
function createScorer(Pong) {
  let key = null;
  let current = null;
  const aim = (snap) => {
    if (!(snap.ball.vx < 0)) { key = null; return snap.height / 2; }
    const k = snap.score.left + '-' + snap.score.right + '-' + snap.rally;
    if (k !== key) {
      key = k;
      current = plan(Pong, snap);
      aim.planned += 1;
      if (current.certain) aim.certain += 1;
    }
    return current.hand;
  };
  aim.planned = 0;
  aim.certain = 0;
  return aim;
}

module.exports = { createScorer, plan, snapshotOf, arrivalY };
