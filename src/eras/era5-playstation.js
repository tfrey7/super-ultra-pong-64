/*
 * Era 5 -- 1994 Sony PlayStation: for now, the plain 3D table.
 *
 * The first rung drawn on the shared 3D table (src/table3d.js, docs/ERAS.md
 * section 2). The same 2D state every other era draws, laid onto a tilted
 * table: the camera stands in front of the bottom wall, looking across to the
 * top wall, so the near edge is wide and low on screen and the far edge narrow
 * and high. The paddles are flat-shaded boxes standing on exactly the
 * rectangles the rules collide with, and the ball stands on its footprint
 * with a contact shadow under it -- white, drawn last, the brightest and
 * sharpest thing on screen (rules R1, R2, R5).
 *
 * This is the placeholder card 1144 lands: no wobble, no texture swim, no
 * chunky buffer. Card 1145 replaces this file with the real PlayStation look
 * (chapter 6 of the bible). Eras 6 to 10 are `like: 5` until their own cards,
 * so each of them draws this table under its own name card.
 *
 * Control is untouched: the mouse's height over the canvas is still the
 * paddle's field height (bible rule 1.2), nothing un-projects the pointer.
 * The attract rally behind the title keeps the stock dimmed frame.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // The bible's measured camera for era 5, at rest (section 12).
  var CAMERA = { tilt: 28, height: 1150, fov: 30, screenY: 306 };

  var VOID = '#07070c';
  var TABLE = {
    surface: '#2b3a55',
    line: '#7d879c',      // the centre line: well under the ball's white (R1)
    rail: '#4a4e59',
    railTop: '#8a8f9c',
    nearLip: '#4a4e59'
  };
  var PADDLE = { z: 22, light: { top: 0.3, near: 0, side: -0.4 } };
  var HUD = { cell: 7, gap: 6, top: 24, offset: 110, shadow: '#000000' };

  var cached = { spec: null, cam: null };
  function cameraFor(T, spec) {
    if (cached.spec !== spec) {
      cached.spec = spec;
      cached.cam = T.camera(spec);
    }
    return cached.cam;
  }

  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);
    var T = P.table3d;
    if (!T) return P.drawBase(ctx, state, opts);
    var cam = cameraFor(T, P.eraLook(state.era).camera || CAMERA);

    ctx.save();
    ctx.globalAlpha = 1;

    // 1. backdrop
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, state.width, state.height);

    // 2. the table
    T.table(ctx, cam, TABLE);

    // 4. paddles, the far one (smaller rect.y + rect.h) first
    var sides = ['left', 'right'];
    if (state.right.y + state.right.h < state.left.y + state.left.h) sides.reverse();
    for (var i = 0; i < sides.length; i++) {
      T.box(ctx, cam, state[sides[i]], 0, PADDLE.z,
        { ink: P.paddleInk(state, sides[i]), shade: 'flat', light: PADDLE.light });
    }

    // 7. the ball, last of everything on the table; hidden in the serve pause
    if (state.serveDelay <= 0) T.ball(ctx, cam, state.ball, { fill: '#ffffff' });

    // 8. the HUD, in the band above the far edge (R8)
    var mid = state.width / 2;
    for (var s = 0; s < 2; s++) {
      var side = s ? 'right' : 'left';
      var at = mid + (s ? 1 : -1) * HUD.offset;
      var text = String(state.score[side]);
      ctx.fillStyle = HUD.shadow;
      P.drawText(ctx, text, at + 2, HUD.top + 2, HUD.cell, HUD.gap);
      ctx.fillStyle = P.paddleInk(state, side);
      P.drawText(ctx, text, at, HUD.top, HUD.cell, HUD.gap);
    }
    ctx.restore();
  }

  R.registerEra({
    era: 5,
    name: '1994 Sony PlayStation',
    like: 1,              // paddle colours: the ones the session earned on its first point
    camera: CAMERA,
    card: { flash: '#ffffff', wipe: ['#e03a3e', '#f3c300', '#00a99d', '#2e6db4'], box: '#1a1a1f',
            border: '#8a8f9c', inner: null, year: '#f3c300', name: '#ffffff', label: '#8a8f9c', dots: null },
    draw: draw
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
