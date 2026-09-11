'use strict';
/*
 * The shared 3D table's cameras, measured.
 *
 *   node tools/table3d-cameras.js          measure every era camera, at rest and at the
 *                                          extremes of its own motion (drift, wobble, flourish)
 *   node tools/table3d-cameras.js --fit    re-solve each era's fov and screenY for its tilt,
 *                                          height and screen bounds (how the numbers were found)
 *
 * docs/ERAS.md specifies one projection (section 2, "The shared 3D table") and
 * one camera per era. This script is that projection written out in the fewest
 * lines, so every number the bible quotes -- where the table's corners land,
 * how much the far wall shrinks, how tall a paddle is at the far wall, and the
 * steepest tilt that still reads -- comes from running it, not from a guess.
 * It draws nothing and loads nothing from src/. test/eras-bible.test.js
 * requires it to prove every camera passes rule R3.
 */

const W = 800;
const H = 600;
const RAD = Math.PI / 180;

/** Derive the fields project() needs from the numbers an era gives. */
function camera(spec) {
  const t = spec.tilt * RAD;
  const c = {
    tilt: spec.tilt, height: spec.height, fov: spec.fov,
    panX: spec.panX || 0, screenY: spec.screenY === undefined ? H / 2 : spec.screenY,
    sin: Math.sin(t), cos: Math.cos(t),
    focal: (H / 2) / Math.tan((spec.fov * RAD) / 2)
  };
  c.back = spec.height * Math.tan(t);     // how far in front of the table centre the eye is
  c.distance = spec.height / c.cos;       // eye to the table centre
  return c;
}

/** Field point (x, y on the 800x600 field; z up off the table) to the screen. */
function project(c, x, y, z) {
  const X = x - W / 2 - c.panX;
  const Y = H / 2 - y + c.back;             // toward the far wall is +Y
  const Z = (z || 0) - c.height;
  const yc = Y * c.cos + Z * c.sin;
  const zc = Y * c.sin - Z * c.cos;          // depth along the view axis
  const k = c.focal / zc;
  return { x: W / 2 + X * k, y: c.screenY - yc * k, scale: k, depth: zc };
}

/** Everything rule R3 asks about one camera. bounds: { top, bottom } screen y the table must stay inside. */
function measure(spec, bounds) {
  const b = Object.assign({ top: 64, bottom: 592 }, bounds || spec.bounds || {});
  const c = camera(spec);
  const nl = project(c, 0, H), nr = project(c, W, H);
  const fl = project(c, 0, 0), fr = project(c, W, 0);
  const depthScale = (y) => project(c, W / 2, y + 0.5).y - project(c, W / 2, y - 0.5).y;
  return {
    nearLeftX: +nl.x.toFixed(1), nearRightX: +nr.x.toFixed(1), nearY: +nl.y.toFixed(1),
    farLeftX: +fl.x.toFixed(1), farY: +fl.y.toFixed(1),
    widthRatio: +((fr.x - fl.x) / (nr.x - nl.x)).toFixed(3),
    depthRatio: +(depthScale(0) / depthScale(H)).toFixed(3),
    farPaddlePx: +(project(c, 32, 84).y - project(c, 32, 0).y).toFixed(1),
    nearPaddlePx: +(project(c, 32, H).y - project(c, 32, H - 84).y).toFixed(1),
    inside: nl.x >= 8 && nr.x <= W - 8 && nl.y <= b.bottom && fl.y >= b.top
  };
}

/** Rule R3 of docs/ERAS.md. */
function readable(m) {
  return m.inside && m.widthRatio >= 0.7 && m.depthRatio >= 0.55 && m.farPaddlePx >= 44;
}

// ------------------------------------------------ the realism ladder's players
// docs/ART.md section 8 (item 1265): a player 250 units tall on a floor 110 units
// below the table top, the front foot 30 units behind its end, centred on its
// paddle's y. The box is the whole standing figure: 80 units of body behind the
// front foot, 30 either side of the paddle's y, feet to the top of the head.
const PLAYER = { height: 250, floor: -110, front: 30, depth: 80, halfWidth: 30 };

/** The eight corners of one standing player's box, with its paddle at field y py. */
function playerBox(side, py, P) {
  P = P || PLAYER;
  const x0 = side === 'left' ? -P.front - P.depth : W + P.front;
  const x1 = side === 'left' ? -P.front : W + P.front + P.depth;
  const z0 = P.floor, z1 = P.floor + P.height;
  const out = [];
  for (const x of [x0, x1]) for (const y of [py - P.halfWidth, py + P.halfWidth]) for (const z of [z0, z1]) out.push([x, y, z]);
  return out;
}

/**
 * Whether a camera holds both players whole (the ladder's camera rule). bounds
 * is the era's own: top is the HUD band's lower edge, bottom the picture's (or
 * the letterbox's). With the paddles at y 300 both figures, feet to head, are
 * inside the picture and below the HUD band with `headroom` pixels to spare; with
 * the paddles at a wall, only the head (the top 36 units) may pass behind the HUD.
 */
function players(spec, bounds) {
  const b = Object.assign({ top: 64, bottom: 592 }, bounds || spec.bounds || {});
  const c = camera(spec);
  const headroom = spec.headroom === undefined ? 8 : spec.headroom;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const side of ['left', 'right']) {
    for (const p of playerBox(side, H / 2)) {
      const s = project(c, p[0], p[1], p[2]);
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
  }
  // Paddle at the far wall: the neck (36 units under the head's top) stays below the HUD band.
  const neck = project(c, -PLAYER.front, 0 - PLAYER.halfWidth, PLAYER.floor + PLAYER.height - 36).y;
  const feet = project(c, -PLAYER.front, H / 2 + PLAYER.halfWidth, PLAYER.floor);
  const head = project(c, -PLAYER.front, H / 2, PLAYER.floor + PLAYER.height);
  return {
    left: +minX.toFixed(1), right: +maxX.toFixed(1), top: +minY.toFixed(1), bottom: +maxY.toFixed(1),
    neckAtFarWall: +neck.toFixed(1),
    figurePx: +(feet.y - head.y).toFixed(1),
    whole: minX >= 4 && maxX <= W - 4 && minY >= b.top + headroom && maxY <= b.bottom && neck >= b.top
  };
}

/** The share of the picture the arena gets: everything outside the table top's quad (0..1). */
function arenaShare(spec) {
  const c = camera(spec);
  const q = [project(c, 0, 0), project(c, W, 0), project(c, W, H), project(c, 0, H)];
  let a = 0;
  for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p.x * n.y - n.x * p.y; }
  const table = Math.abs(a) / 2;
  const above = Math.max(0, Math.min(q[0].y, q[1].y));   // rows wholly above the far edge
  return { share: +(1 - table / (W * H)).toFixed(3), rowsAboveFarEdge: +above.toFixed(1) };
}

/**
 * The ladder camera for an era: keep its tilt and lens as near as they will go
 * (tilt within 4 degrees, fov within 6), pull back until both players are whole,
 * and among the cameras that pass R3 in every pose take the one with the biggest
 * table, set as low on the picture as the players' feet and the near edge allow
 * so the arena gets the rows above. Null when none passes.
 */
function solvePlayers(e) {
  const b = Object.assign({ top: 64, bottom: 592 }, e.bounds || {});
  let best = null;
  const reach = e.reach || { tilt: 4, fov: 6 };
  for (let tilt = e.tilt - reach.tilt; tilt <= e.tilt + reach.tilt; tilt += 1) {
    for (let fov = Math.max(12, e.fov - reach.fov); fov <= e.fov + reach.fov; fov += 0.5) {
      for (let height = 800; height <= 4000; height += 25) {
        // the lowest placement that keeps the players' feet and the near edge inside
        const probe = camera({ tilt, height, fov, screenY: H / 2 });
        const low = Math.max(project(probe, 0, H).y, players({ tilt, height, fov, screenY: H / 2 }, b).bottom);
        // lifted a few pixels at a time, so a camera that drifts keeps every pose inside
        let found = null;
        for (let lift = 0; lift <= 40 && !found; lift += 2) {
          const screenY = Math.floor(H / 2 + (b.bottom - low)) - lift;
          const spec = rebase(e, { tilt, height, fov, screenY });
          const all = poses(spec);
          if (all.every((p) => readable(measure(p, b))) && all.every((p) => players(p, b).whole)) found = screenY;
        }
        if (found === null) continue;
        const m = measure(rebase(e, { tilt, height, fov, screenY: found }), b);
        const score = m.nearRightX - m.nearLeftX;
        if (!best || score > best.score) best = { tilt, height, fov, screenY: found, score };
        break;    // the first height that holds them is the biggest table at this tilt and lens
      }
    }
  }
  return best && { tilt: best.tilt, height: best.height, fov: best.fov, screenY: best.screenY };
}

// The six eras' cameras exactly as docs/ERAS.md gives them. `motion` lists the
// extremes of anything that moves the camera during play or the arrival
// flourish; every one of them must pass R3 too.
const ERAS = [
  { era: 5, name: 'Sony PlayStation', tilt: 28, height: 1150, fov: 30, screenY: 306,
    motion: [{ height: 1156, panX: 1.5 }, { height: 1144, panX: -1.5 }, { height: 1190 }] },
  { era: 6, name: 'Nintendo 64', tilt: 26, height: 900, fov: 39.5, screenY: 301,
    motion: [{ tilt: 28 }] },
  { era: 7, name: 'Sega Dreamcast', tilt: 22, height: 1500, fov: 23.5, screenY: 314, motion: [] },
  { era: 8, name: 'PlayStation 2', tilt: 30, height: 1250, fov: 29, screenY: 281,
    bounds: { top: 60, bottom: 540 },
    motion: [{ tilt: 31.5, panX: 10, height: 1290 }, { tilt: 28.5, panX: -10, height: 1210 },
      { tilt: 31.5, panX: -10, height: 1210 }, { tilt: 28.5, panX: 10, height: 1290 }] },
  { era: 9, name: 'Xbox', tilt: 27, height: 1000, fov: 35, screenY: 303, motion: [] },
  { era: 10, name: 'Xbox 360', tilt: 32, height: 1600, fov: 20.5, screenY: 312, motion: [] }
];

/** Every pose an era's camera takes: at rest, then each motion extreme. */
function poses(e) {
  return [e].concat((e.motion || []).map((m) => Object.assign({}, e, m)));
}

/**
 * An era moved to a new rest pose, its motion carried along: every motion
 * extreme keeps its offset from the rest pose (the era files add their wobble,
 * drift and flourish to the camera they are given), so the extremes move with it.
 */
function rebase(e, rest) {
  const motion = (e.motion || []).map((m) => {
    const o = {};
    for (const k of Object.keys(m)) o[k] = k === 'panX' ? m[k] : rest[k] + (m[k] - e[k]);
    return o;
  });
  return Object.assign({}, e, rest, { motion });
}

/** The smallest fov (largest table) whose table fits the bounds, centred between them. */
function fit(e) {
  const b = Object.assign({ top: 64, bottom: 592 }, e.bounds || {});
  for (let fov = 10; fov <= 70; fov += 0.5) {
    const c = camera(Object.assign({}, e, { fov, screenY: H / 2 }));
    const mid = (project(c, 0, H).y + project(c, 0, 0).y) / 2;
    const screenY = Math.round(H / 2 + ((b.top + 8 + b.bottom - 2) / 2 - mid));
    const all = poses(Object.assign({}, e, { fov, screenY })).map((p) => measure(p, b));
    if (all.every(readable) && all.every((m) => m.nearLeftX >= 12)) return { fov, screenY };
  }
  return null;
}

if (require.main === module) {
  if (process.argv.includes('--fit')) {
    for (const e of ERAS) console.log(`${e.era} ${e.name}: ${JSON.stringify(fit(e))}`);
    process.exit(0);
  }
  if (process.argv.includes('--players')) {
    for (const e of ERAS) {
      const s = solvePlayers(e);
      const before = { p: players(e), a: arenaShare(e) };
      const after = s && rebase(e, s);
      console.log(`${e.era} ${e.name}: ${JSON.stringify(s)}\n   before ${JSON.stringify(before)}` +
        (after ? `\n   after  ${JSON.stringify({ p: players(after), a: arenaShare(after), m: measure(after) })}` : ''));
    }
    process.exit(0);
  }
  // 1. tilt 0 with focal = height is today's flat 2D frame, to the unit.
  const flat = camera({ tilt: 0, height: 300 / Math.tan(30 * RAD), fov: 60 });
  const a = project(flat, 0, 0);
  const z = project(flat, W, H);
  console.log(`flat check: tilt 0, height = focal -> (0,0) at (${a.x.toFixed(3)}, ${a.y.toFixed(3)}), ` +
    `(800,600) at (${z.x.toFixed(3)}, ${z.y.toFixed(3)})`);

  console.log('\nera cameras (at rest; then the worst motion extreme):');
  for (const e of ERAS) {
    const ms = poses(e).map((p) => measure(p));
    const m = ms[0];
    const worst = ms.reduce((w, x) => (x.depthRatio < w.depthRatio ? x : w), m);
    console.log(`  ${String(e.era).padStart(2)} ${e.name.padEnd(17)} tilt ${e.tilt} height ${e.height} fov ${e.fov} ` +
      `screenY ${e.screenY} | near x ${m.nearLeftX}..${m.nearRightX} y ${m.nearY} | far x ${m.farLeftX} y ${m.farY} | ` +
      `width ${m.widthRatio} depth ${m.depthRatio} | paddle far ${m.farPaddlePx}px near ${m.nearPaddlePx}px | ` +
      `worst motion depth ${worst.depthRatio} | ${ms.every(readable) ? 'READABLE in every pose' : 'FAILS R3'}`);
  }

  console.log('\nsteepest readable tilt for each camera, holding its height, fov and screenY:');
  for (const e of ERAS) {
    let best = 0;
    for (let t = 0; t <= 60; t += 0.5) if (readable(measure(Object.assign({}, e, { tilt: t })))) best = t;
    console.log(`  ${String(e.era).padStart(2)} ${e.name.padEnd(17)} ${best} deg (rests at ${e.tilt})`);
  }
}

module.exports = { camera, project, measure, readable, poses, fit, ERAS, W, H,
  PLAYER, playerBox, players, arenaShare, solvePlayers, rebase };
