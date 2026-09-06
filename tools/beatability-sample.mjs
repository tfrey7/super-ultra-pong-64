/*
 * How often does 22 seconds of ball-tracking play score a point?
 *
 * The playtest's "the player can score against the computer" check gives the
 * player 22 seconds of tracking play and asks for at least one point. The
 * bootstrap doc measured a point roughly every 32 seconds of exactly that
 * play, so the check is marginal BY DESIGN and a single run tells you very
 * little. This samples it properly, and can compare two copies of the rules --
 * which is how the title-screen branch checked it had not made the computer
 * harder to beat.
 *
 *   node tools/beatability-sample.mjs
 *   node tools/beatability-sample.mjs --trials 400 --against ../other/src/game.js
 *
 * Writes tools/beatability-sample.json beside itself. No dependencies, no
 * browser: this drives the pure rules the same way the harness drives the page.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const TRIALS = Number(arg('trials', 300));
const WINDOW = Number(arg('seconds', 22));   // the harness's tracking window
const POLL = Number(arg('poll', 0.045));     // it re-aims the mouse every 45ms
const DT = 1 / 60;
const CORNER = Number(arg('corner', 0.8)); // how near the paddle tip to take it

/** A small deterministic generator, so a run can be repeated exactly. */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** One 22-second session of tracking play. Returns the player's score. */
function trial(Pong, seed, aimStyle) {
  const rng = seeded(seed);
  // Either shape of the module: an older one has no phase and no startGame.
  const g = Pong.createGame({ rng, phase: 'playing' });
  if (g.phase === 'title' && Pong.startGame) Pong.startGame(g);
  g.aimStyle = aimStyle;   // read by aim(); the rules themselves ignore it

  let hand = g.height / 2;
  let sincePoll = 0;
  for (let t = 0; t < WINDOW; t += DT) {
    sincePoll += DT;
    if (sincePoll >= POLL) {
      sincePoll = 0;
      hand = aim(g);
    }
    Pong.step(g, DT, { pointerY: hand, up: false, down: false });
  }
  return g.score.left;
}

/**
 * Where to put the hand. 'track' is the flat ball-chase the harness has always
 * done. 'corner' still intercepts, but off centre, so the ball leaves at a
 * steep angle AWAY from where the computer is standing -- the play the
 * bootstrap doc says scores roughly every 20 seconds instead of every 32.
 */
function aim(g) {
  const centre = g.ball.y + g.ball.size / 2;
  if (g.aimStyle !== 'corner') return centre;
  const away = (g.right.y + g.right.h / 2) < g.height / 2 ? 1 : -1;  // +1 = downwards
  return centre - away * (g.left.h / 2) * CORNER;
}

function sample(modulePath, label, aimStyle) {
  const Pong = require(modulePath);
  let scored = 0;
  let points = 0;
  for (let i = 1; i <= TRIALS; i++) {
    const s = trial(Pong, i * 2654435761, aimStyle);
    points += s;
    if (s > 0) scored += 1;
  }
  return {
    label,
    aim: aimStyle,
    module: modulePath,
    trials: TRIALS,
    windowSeconds: WINDOW,
    sessionsThatScored: scored,
    passRate: scored / TRIALS,
    pointsPerMinute: (points / TRIALS) * (60 / WINDOW)
  };
}

const modules = [[path.join(HERE, '..', 'src', 'game.js'), 'this checkout']];
const against = arg('against', null);
if (against) modules.push([path.resolve(against), 'comparison']);

const runs = [];
for (const style of ['track', 'corner']) {
  for (const [mod, label] of modules) runs.push(sample(mod, label, style));
}

for (const r of runs) {
  console.log(`${r.aim.padEnd(6)} ${r.label}: ${r.sessionsThatScored}/${r.trials} ` +
    `sessions scored in ${r.windowSeconds}s (${(r.passRate * 100).toFixed(1)}%), ` +
    `${r.pointsPerMinute.toFixed(2)} player points per minute`);
}

const out = path.join(HERE, 'beatability-sample.json');
writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), runs }, null, 2));
console.log('wrote ' + out);
