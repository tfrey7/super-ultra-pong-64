'use strict';
/*
 * The shared 3D table's cameras, measured.
 *
 *   node tools/table3d-cameras.js
 *
 * docs/ERAS.md specifies one projection (the section "The shared 3D table")
 * and one camera per era. This script is that projection, written out in the
 * fewest lines, so every number the bible quotes -- where the table's corners
 * land, how much the far wall shrinks, how tall a paddle is at the far wall,
 * and the steepest tilt that still reads -- comes from running it rather than
 * from anybody's head. It draws nothing and loads nothing from src/.
 */

const W = 800;
const H = 600;
const RAD = Math.PI / 180;

/** Derive the fields project() needs from the three numbers an era gives. */
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

/** Everything the readability rules ask about one camera. */
function measure(spec) {
  const c = camera(spec);
  const nl = project(c, 0, H), nr = project(c, W, H);
  const fl = project(c, 0, 0), fr = project(c, W, 0);
  const nearW = nr.x - nl.x;
  const farW = fr.x - fl.x;
  const depthScale = (y) => project(c, W / 2, y + 0.5).y - project(c, W / 2, y - 0.5).y;
  const farPaddle = project(c, 32, 84).y - project(c, 32, 0).y;
  const nearPaddle = project(c, 32, H).y - project(c, 32, H - 84).y;
  return {
    spec,
    nearLeftX: +nl.x.toFixed(1), nearY: +nl.y.toFixed(1),
    farLeftX: +fl.x.toFixed(1), farY: +fl.y.toFixed(1),
    widthRatio: +(farW / nearW).toFixed(3),
    depthRatio: +(depthScale(0) / depthScale(H)).toFixed(3),
    tableOnScreen: +(nl.y - fl.y).toFixed(1),
    farPaddlePx: +farPaddle.toFixed(1),
    nearPaddlePx: +nearPaddle.toFixed(1),
    inside: nl.x >= 8 && nr.x <= W - 8 && nl.y <= H - 8 && fl.y >= 64
  };
}

/** The readability gate from docs/ERAS.md, rule R3. */
function readable(m) {
  return m.inside && m.widthRatio >= 0.7 && m.depthRatio >= 0.55 && m.farPaddlePx >= 44;
}

// The six eras' cameras, exactly as docs/ERAS.md gives them.
const ERAS = [
  { era: 5, name: 'Sony PlayStation', tilt: 30, height: 1150, fov: 38, screenY: 322 },
  { era: 6, name: 'Nintendo 64', tilt: 34, height: 900, fov: 48, screenY: 330 },
  { era: 7, name: 'Sega Dreamcast', tilt: 24, height: 1500, fov: 26, screenY: 316 },
  { era: 8, name: 'PlayStation 2', tilt: 36, height: 1250, fov: 34, screenY: 334 },
  { era: 9, name: 'Xbox', tilt: 32, height: 1000, fov: 44, screenY: 326 },
  { era: 10, name: 'Xbox 360', tilt: 38, height: 1600, fov: 27, screenY: 336 }
];

if (require.main === module) {
  // 1. tilt 0 with focal = height is today's flat 2D frame, to the unit.
  const flat = camera({ tilt: 0, height: 519.6152422706632, fov: 60 });
  const corner = project(flat, 0, 0);
  const far = project(flat, W, H);
  console.log(`flat check: tilt 0, height = focal -> (0,0) at (${corner.x.toFixed(3)}, ${corner.y.toFixed(3)}), ` +
    `(800,600) at (${far.x.toFixed(3)}, ${far.y.toFixed(3)})`);

  // 2. every era's camera.
  console.log('\nera cameras:');
  for (const e of ERAS) {
    const m = measure(e);
    console.log(`  ${String(e.era).padStart(2)} ${e.name.padEnd(17)} tilt ${e.tilt} h ${e.height} fov ${e.fov} ` +
      `| near x ${m.nearLeftX} y ${m.nearY} | far x ${m.farLeftX} y ${m.farY} | width ${m.widthRatio} ` +
      `depth ${m.depthRatio} | paddle far ${m.farPaddlePx}px near ${m.nearPaddlePx}px | ` +
      `${readable(m) ? 'READABLE' : 'FAILS R3'}`);
  }

  // 3. the steepest tilt that passes, holding each era's height, fov and screenY.
  console.log('\nsteepest readable tilt per camera (whole degrees):');
  for (const e of ERAS) {
    let best = 0;
    for (let t = 0; t <= 60; t++) if (readable(measure(Object.assign({}, e, { tilt: t })))) best = t;
    console.log(`  ${String(e.era).padStart(2)} ${e.name.padEnd(17)} ${best} deg (uses ${e.tilt})`);
  }
}

module.exports = { camera, project, measure, readable, ERAS, W, H };
