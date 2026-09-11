/*
 * Era 2 -- 1985 NES: the 8-bit machine.
 *
 * The second point of the session lands the machine here, and it has to read
 * at a glance as a different box under the television: a dark tiled court with
 * a white border instead of a black void, paddles and ball as chunky sprites
 * with a lit side and a shaded side, a dotted net between two posts, and the
 * score in the NES's own kind of pixel font -- thick two-pixel strokes with a
 * drop shadow, not the 1972 machine's 3x5 blocks.
 *
 * It changes nothing about play. Every sprite is drawn over the exact box the
 * rules hit-test, snapped to the sprite grid, and nothing here reads or writes
 * anything but the state it is handed.
 *
 * Colours come only from the NES's own palette (NES below), named by the index
 * NES code uses for them ($0C, $30 ...). Each paddle keeps the hue the rules
 * picked for it at the turn to colour: its Atari colour becomes the nearest
 * NES hue column, lit ($2x) on the body and shaded ($1x) on the right-hand
 * side, so the change of machine does not swap anyone's colour.
 *
 * Like every renderer here it only sets fillStyle and calls fillRect, so the
 * headless suite can record a frame without a browser.
 *
 * Arrival flourish: the CONSOLE SWAP (consoleSwap below). The ring that brings
 * this era in is a cartridge reset: on its first frame the picture blinks black
 * for one frame, as a power switch does; then just ahead of the ring the old
 * picture breaks into the court's own 40-unit tiles, which turn over one by one
 * from the miss outward -- the old era on their front, the NES on their back --
 * so the mosaic IS the wipe's leading edge; and in a band just inside the edge
 * the new picture rolls, vertical hold slipping, and settles as the ring
 * covers the field. The NES power-on chime heard with it is not played from
 * here: it is the NES voice's `boot` list in src/sound.js, which the player
 * sounds for the point that brings this era in. Drawn only, inside the pause: the engine's ring still decides which era
 * draws where, and a turning tile is a sub-rectangle copy of a whole frame
 * scaled horizontally -- no per-pixel work. The dimmed rally behind the title
 * keeps the plain ring and makes no sound. src/erachange.js is the contract.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // The 2C02 picture chip's 64 entries, $00-$3F, as the widely used RGB
  // approximation gives them (a composite signal has no one true RGB; this is
  // the table most emulators and references start from).
  var NES = [
    '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400',
    '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#000000', '#000000',
    '#bcbcbc', '#0078f8', '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10',
    '#ac7c00', '#00b800', '#00a800', '#00a844', '#008888', '#000000', '#000000', '#000000',
    '#f8f8f8', '#3cbcfc', '#6888fc', '#9878f8', '#f878f8', '#f85898', '#f87858', '#fca044',
    '#f8b800', '#b8f818', '#58d854', '#58f898', '#00e8d8', '#787878', '#000000', '#000000',
    '#fcfcfc', '#a4e4fc', '#b8b8f8', '#d8b8f8', '#f8b8f8', '#f8a4c0', '#f0d0b0', '#fce0a8',
    '#f8d878', '#d8f878', '#b8f8b8', '#b8f8d8', '#00fcfc', '#f8d8f8', '#000000', '#000000'
  ];

  var COURT = NES[0x0C];        // dark teal floor tiles
  var MORTAR = NES[0x0F];       // black: the lines between tiles, and shadows
  var LINE = NES[0x30];         // court border, net dots, ball
  var LINE_SHADE = NES[0x10];   // their shaded side
  var POST = NES[0x2D];         // the net posts

  var PX = 4;                   // one sprite pixel, in field units
  var TILE = 40;                // one floor tile (10 sprite pixels)

  // ------------------------------------------------------------ generated art
  // The court and the ball are pixel art made with tools/pixellab.mjs (item
  // 1178; prompts, seeds and verdicts in assets/pixellab/manifest.json), boiled
  // down to the NES table above OFFLINE by assets/pixellab/era2-nes-quantize.mjs,
  // which also writes the two strings below from era2-court.png and
  // era2-ball.png. The game never loops over pixels: each is one drawImage.
  // Embedded as data: URIs rather than drawn through PongSprites off disk: a
  // page opened from file:// counts a file image as another origin and it
  // taints the canvas, so every getImageData read of the frame throws; a data:
  // image leaves it readable (measured in headless Chrome, item 1178). The
  // paddles stay hand-drawn: both generated paddles looked wrong (manifest).
  // Headless (no Image), or before an image has decoded, the hand-drawn court
  // and ball below are drawn instead.
  // BEGIN pixellab embeds (written by assets/pixellab/era2-nes-quantize.mjs)
  var ART = {
    court: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAACUCAYAAADWFGYSAAAE9ElEQVR42u3d223bMBQA0IzWMTpKPjKAh8puKRrAgazIMsX343xcFGmMK5nkMSmJvnl7u92+guLP36/g116JUnlHPGdt3F9enSevtgBEXm0MiIGsjQHRedoYEJ2njQHRedoYkKZ5DWRAAAEEEEAAAQQQQAABBBBApgJyH2hCzBbJQDSiWB1Js2WKEC0DECFqAzEli1mWVMWA3G5f7+/v3+GTSIwS3+M1CshVdWYTMVj8fKDHjN+YGaT4vfVVn4OM9qxikHHws9qptcQCBJChxsHZCmhZIKM+mQYEEEAAAcQSCxBAAAEEEEAAAcQ1CCCAmEEAAQQQQAABBBBAAAEEEEBcpAMCiBkEEEDMIIAAAgggtrsDAogZxDUIIIAAAggggFhiATInEEUFREpp0OJAUqqaZHwDZ2WE7lUpjsoN7X/38JpdmaLU2JaP2f787PxOz21XPmmfN6SMzbM2ObuTc3QOV4/1cNxd/716z2c5i8xMqVV5uphBLLHGXRL2fs5TLLEAAQQQnQcIIDoPEEAAkRcQQOQFZGIg/kYhIIAAAggggAACCCCAAAIIIIAAAgggbvPKCwgg8gICiLyAACIvIIAYyNoYEANZGwNiIAMCCCC38kULAAFkyM476qCjn3MdC5AGVU1WKR2Ts/POzuvs/1OPWRLIKGNgtKomL0vdxB7jnrMUkpicIecS8vvYY9eAkfO8LpRAWneJlQDk8N9WQEJfH/K6mMFY4v1v27YQENcgtYCUuLCe9bVXgQICSLcDOefMFHtMQBoDSVlSvLpLVBpI6aVQbSDP7rzF9hEgGT9FYj6JWwKpdTFd6lxC81wFEtqnUwDJcXv1SiNd7QRA+gJypT+ujqHY27wlgXx+fh5Gt0ByPuRbDcirZzSNgQSNxRZA7q+pAuTqgGgFJGWgl0DSA5CrfZEI5GF8tlxiVZ1BZgWy/xspuS/WFwSy/fBeZ4kVCyT3zYWcAzLHTZDaQGKeg1QG8vHxYYk1xQwyIpDOZ5DtmDSDTLTEKvY8xBJrkdu8s1+k97S5cjAgXd7mrb7VxHOQ4Z+DPOzQ9STdk3RAXuwEBqSTvVgtNivOthcr52ZFe7Hs5gXEbl5fmFrt+yCxz0EAAaTaJ33OO4W+Ubg4kJ6+kz7LV24rfSd97u3uqprkf35S6rgrVzUpWfbn/z3t1MiV51feXms2neHNcRu1UV2s7P2XYVwE7yHrteyPomaVZkCF4ya9Bpm980bPC4i/UQgIIGYQeQEBRF5AADGQtTEgrkEA6RrIT+V0nQcIIJZY8gICiLyAuAYBBBBAAAEEEANZGwNiBgEEEEAAAQQQQAABBBBAAJEXEEAAAcRtXnkBsVlRXkAqVzXJDkSIGgUrhqxqsousJX+elKRJOda25FFojmLv8UW+fYmm/euPcoT2y/aDsljZJtcgt7JT/4hLFkuscucHCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAgggswAZdesGIIAAAggglliAAAIIIIBYYgECCCCAAGKJBQgggJhBAAEEEEAAscQCBBBAAAEEEEDGBBJR1UQ1EjFkdZSqVU2EGC2qLLGEmGU2yQ5EiJlmE0CEqAFEiFXLmwZLE2LF2r9Tb9tQhV0bp+bVefJqC0Dk1caAGMjaGBCdp40B0XnaGBCdp40B0XmAAKLzAAFE58kLiM6TV1sAIq+2CIt/P942ata2awQAAAAASUVORK5CYII=',
    ball: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAAR0lEQVR42mNgoBTs2bPnPzLGq/jPnz//0TFOTdgUwzRgaAIJ4NIA01RTU/OfKA0wG+isAVtwImMMxfg04VQMAyAFyJjilAAAljgGtJaN/cEAAAAASUVORK5CYII='
  };
  // END pixellab embeds
  var art = {};

  /** A piece's decoded image, or null (headless, not decoded yet, or none). */
  function artImage(key) {
    if (!ART[key] || typeof root.Image !== 'function') return null;
    var img = art[key];
    if (!img) {
      img = art[key] = new root.Image();
      img.src = ART[key];
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  /** One drawImage, smoothing off, so the art stays as blocky as it was made. */
  function blit(ctx, img, x, y, w, h) {
    var smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, w, h);
    ctx.imageSmoothingEnabled = smooth;
  }
  // Start decoding as the page loads, so the art is ready by the first frame.
  artImage('court');
  artImage('ball');

  // The rules' colour slot (era 1's palette order) -> the nearest NES hue
  // column: orange, gold, olive, grass, teal, sky, indigo, violet, magenta,
  // red, salmon, pale blue.
  var HUE_FOR_SLOT = [0x7, 0x8, 0x9, 0xA, 0xB, 0x1, 0x2, 0x3, 0x4, 0x6, 0x5, 0xC];
  // A machine that somehow reached this era without its colours still gets a
  // blue player and a red computer rather than two identical sprites.
  var UNCOLOURED_SLOT = { left: 5, right: 9 };

  /** A side's sprite inks: the lit body ($2x) and its shaded side ($1x). */
  function spriteInks(state, side) {
    var slot = state.colour
      ? ((state.paddleColour && state.paddleColour[side]) || 0)
      : UNCOLOURED_SLOT[side];
    var hue = HUE_FOR_SLOT[slot % HUE_FOR_SLOT.length];
    return { body: NES[0x20 + hue], shade: NES[0x10 + hue] };
  }

  function snap(v) {
    return Math.round(v / PX) * PX;
  }

  // The score font: six columns by seven rows, two-pixel strokes, the shape an
  // NES scoreboard had. A 1 is a lit pixel.
  var FONT = {
    '0': ['011110', '110011', '110011', '110011', '110011', '110011', '011110'],
    '1': ['001100', '011100', '001100', '001100', '001100', '001100', '111111'],
    '2': ['011110', '110011', '000011', '001110', '011000', '110000', '111111'],
    '3': ['111110', '000011', '000011', '011110', '000011', '000011', '111110'],
    '4': ['000111', '001111', '011011', '110011', '111111', '000011', '000011'],
    '5': ['111111', '110000', '111110', '000011', '000011', '110011', '011110'],
    '6': ['011110', '110000', '111110', '110011', '110011', '110011', '011110'],
    '7': ['111111', '000011', '000110', '001100', '001100', '001100', '001100'],
    '8': ['011110', '110011', '110011', '011110', '110011', '110011', '011110'],
    '9': ['011110', '110011', '110011', '011111', '000011', '000011', '011110']
  };
  var FONT_CELL = 6;
  var FONT_GAP = 6;
  var SCORE_TOP = 32;
  var SCORE_OFFSET = 110;

  // ------------------------------------------------------------ the court
  function drawCourt(ctx, state) {
    var w = state.width, h = state.height, v;
    ctx.fillStyle = COURT;
    ctx.fillRect(0, 0, w, h);
    // The generated court: 200 sprite pixels across, scaled to the width at PX
    // and centred down the height (200x148 sits 4 units in from top and bottom,
    // under the border).
    var img = artImage('court');
    if (img) {
      var ch = w * img.naturalHeight / img.naturalWidth;
      blit(ctx, img, 0, Math.round((h - ch) / 2), w, ch);
      return;
    }
    // Tiles: one sprite pixel of black mortar along each tile's right and
    // bottom edge.
    ctx.fillStyle = MORTAR;
    for (v = TILE - PX; v < w; v += TILE) ctx.fillRect(v, 0, PX, h);
    for (v = TILE - PX; v < h; v += TILE) ctx.fillRect(0, v, w, PX);
  }

  function drawBorder(ctx, state) {
    var w = state.width, h = state.height;
    ctx.fillStyle = LINE;
    ctx.fillRect(0, 0, w, PX);
    ctx.fillRect(0, h - PX, w, PX);
    ctx.fillRect(0, 0, PX, h);
    ctx.fillRect(w - PX, 0, PX, h);
    // The shaded inner edge, so the border reads as a raised line.
    ctx.fillStyle = LINE_SHADE;
    ctx.fillRect(PX, PX, w - 2 * PX, PX);
    ctx.fillRect(PX, h - 2 * PX, w - 2 * PX, PX);
    ctx.fillRect(PX, PX, PX, h - 2 * PX);
    ctx.fillRect(w - 2 * PX, PX, PX, h - 2 * PX);
  }

  function netDots(state) {
    var dots = [];
    for (var y = 32; y + 2 * PX <= state.height - 32; y += 6 * PX) dots.push(y);
    return dots;
  }

  function drawNet(ctx, state) {
    var mid = state.width / 2;
    var dots = netDots(state);
    var i;
    ctx.fillStyle = POST;
    ctx.fillRect(mid - 6, 2 * PX, 12, 12);
    ctx.fillRect(mid - 6, state.height - 2 * PX - 12, 12, 12);
    ctx.fillStyle = LINE;
    for (i = 0; i < dots.length; i++) ctx.fillRect(mid - PX, dots[i], 2 * PX, 2 * PX);
    ctx.fillStyle = LINE_SHADE;
    for (i = 0; i < dots.length; i++) ctx.fillRect(mid, dots[i] + PX, PX, PX);
  }

  // ------------------------------------------------------------ the sprites
  /**
   * A paddle: four sprite pixels wide, centred on the rules' box, rounded off
   * at the corners. Lit body, shaded right-hand column and bottom row, two
   * shaded grip bands, and a black drop shadow one pixel down and right.
   */
  function drawPaddle(ctx, p, inks) {
    var rows = Math.max(6, Math.round(p.h / PX));
    var hh = rows * PX;
    var ox = snap(p.x + p.w / 2) - 2 * PX;
    var oy = snap(p.y);

    ctx.fillStyle = MORTAR;
    ctx.fillRect(ox + 4 * PX, oy + 2 * PX, PX, hh - 2 * PX);
    ctx.fillRect(ox + 3 * PX, oy + hh - PX, PX, PX);
    ctx.fillRect(ox + 2 * PX, oy + hh, 2 * PX, PX);

    ctx.fillStyle = inks.body;
    ctx.fillRect(ox + PX, oy, 2 * PX, hh - PX);
    ctx.fillRect(ox, oy + PX, PX, hh - 2 * PX);

    ctx.fillStyle = inks.shade;
    ctx.fillRect(ox + 3 * PX, oy + PX, PX, hh - 2 * PX);
    ctx.fillRect(ox + PX, oy + hh - PX, 2 * PX, PX);
    ctx.fillRect(ox + PX, oy + 4 * PX, 2 * PX, PX);
    ctx.fillRect(ox + PX, oy + hh - 5 * PX, 2 * PX, PX);
  }

  /**
   * The ball: a four-by-four sprite over its own box -- corners off so it
   * reads round -- lit top-left, shaded bottom-right, with a drop shadow.
   * It blinks out while the serve waits, as every era's ball does.
   */
  function drawBall(ctx, state) {
    if (state.serveDelay > 0) return;
    var b = state.ball;
    // The generated ball: 12x12 at the canvas's own pixels, exactly over the
    // box the rules hit-test, drawn last so nothing covers it (R1, R2).
    var img = artImage('ball');
    if (img) {
      blit(ctx, img, Math.round(b.x), Math.round(b.y), b.size, b.size);
      return;
    }
    var c = b.size / 4;
    var ox = Math.round(b.x);
    var oy = Math.round(b.y);

    ctx.fillStyle = MORTAR;
    ctx.fillRect(ox + 4 * c, oy + 2 * c, c, 2 * c);
    ctx.fillRect(ox + 3 * c, oy + 3 * c, c, c);
    ctx.fillRect(ox + 2 * c, oy + 4 * c, 2 * c, c);

    ctx.fillStyle = LINE;
    ctx.fillRect(ox + c, oy, 2 * c, c);
    ctx.fillRect(ox, oy + c, 3 * c, c);
    ctx.fillRect(ox, oy + 2 * c, 2 * c, c);

    ctx.fillStyle = LINE_SHADE;
    ctx.fillRect(ox + 3 * c, oy + c, c, 2 * c);
    ctx.fillRect(ox + 2 * c, oy + 2 * c, c, c);
    ctx.fillRect(ox + c, oy + 3 * c, 2 * c, c);
  }

  // ------------------------------------------------------------ the score
  function scoreWidth(text) {
    return text.length * 6 * FONT_CELL + (text.length - 1) * FONT_GAP;
  }

  /** One pass of a number: each lit run of a row is one rectangle. */
  function paintNumber(ctx, text, left, top) {
    for (var i = 0; i < text.length; i++) {
      var rows = FONT[text[i]];
      var gx = left + i * (6 * FONT_CELL + FONT_GAP);
      if (!rows) continue;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        for (var c = 0; c < row.length; c++) {
          if (row[c] !== '1') continue;
          var run = c;
          while (run < row.length && row[run] === '1') run++;
          ctx.fillRect(gx + c * FONT_CELL, top + r * FONT_CELL, (run - c) * FONT_CELL, FONT_CELL);
          c = run;
        }
      }
    }
  }

  /** A score in its paddle's lit colour, over a black drop shadow. */
  function drawScore(ctx, value, centreX, ink) {
    var text = String(value);
    var left = Math.round(centreX - scoreWidth(text) / 2);
    ctx.fillStyle = MORTAR;
    paintNumber(ctx, text, left + FONT_CELL, SCORE_TOP + FONT_CELL);
    ctx.fillStyle = ink;
    paintNumber(ctx, text, left, SCORE_TOP);
  }

  // ------------------------------------------------------------ the frame
  function draw(ctx, state, opts, api) {
    // A dimmed frame (the attract rally behind a title) stays the stock
    // monochrome frame, exactly as era 1's does, so the title stays readable.
    if (opts && opts.ink) return (api || R).drawBase(ctx, state, opts);

    var left = spriteInks(state, 'left');
    var right = spriteInks(state, 'right');
    var mid = state.width / 2;

    drawCourt(ctx, state);
    drawBorder(ctx, state);
    drawNet(ctx, state);
    drawScore(ctx, state.score.left, mid - SCORE_OFFSET, left.body);
    drawScore(ctx, state.score.right, mid + SCORE_OFFSET, right.body);
    drawPaddle(ctx, state.left, left);
    drawPaddle(ctx, state.right, right);
    drawBall(ctx, state);
  }

  // ------------------------------------------------------------ the arrival
  var FLIP_TILE = TILE;         // the tiles that turn are the court's own grid
  var FLIP_LEAD = 120;          // how far ahead of the ring a tile starts to turn
  var FLIP_JITTER = 26;         // per-tile scatter, so they go one by one, not in circles
  var ROLL_W = 64;              // the rolling band just inside the ring's edge
  var ROLL_TURNS = 2;           // whole rolls of the picture over the wipe; it settles square
  var SYNC_BAR = 14;            // the black blanking bar that rolls with it

  /** A fixed scatter in -1..1 for a tile: no Math.random, the same every frame. */
  function tileJitter(col, row) {
    var n = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }

  /**
   * How far a tile has turned for a ring of `radius` from `origin`: 0 still
   * showing the old era, 1 flat on the new one. A tile starts FLIP_LEAD ahead of
   * the ring and lands as the ring reaches its (scattered) centre.
   */
  function flipPhase(col, row, origin, radius) {
    var dx = (col + 0.5) * FLIP_TILE - origin.x;
    var dy = (row + 0.5) * FLIP_TILE - origin.y;
    var d = Math.sqrt(dx * dx + dy * dy) + tileJitter(col, row) * FLIP_JITTER;
    var f = (radius + FLIP_LEAD - d) / FLIP_LEAD;
    return f <= 0 ? 0 : (f >= 1 ? 1 : f);
  }

  /** Where the picture has rolled to, 0..h, settling back to 0 as the wipe ends. */
  function rollOffset(raw, h) {
    var r = raw > 0 ? (raw < 1 ? raw : 1) : 0;
    var turns = ROLL_TURNS * (1 - (1 - r) * (1 - r));
    return (turns - Math.floor(turns)) * h;
  }

  // Two offscreen copies of the whole frame, made once, on the page only.
  var swapLayers = [];
  function swapLayer(i, w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = swapLayers[i] || (swapLayers[i] = document.createElement('canvas'));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, w, h);
    return x;
  }

  function frameOf(layerCtx, state, era) {
    layerCtx.save();
    R.draw(layerCtx, era === state.era ? state : Object.assign({}, state, { era: era }), null);
    layerCtx.restore();
    return layerCtx.canvas;
  }

  // Which change each game has already blinked for.
  var announced = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** One turning tile: black behind it, its face squeezed about its middle. */
  function drawTile(ctx, x, y, f, before, after) {
    var T = FLIP_TILE;
    var sx = Math.abs(Math.cos(f * Math.PI));
    ctx.fillStyle = MORTAR;
    ctx.fillRect(x, y, T, T);
    var w = T * sx;
    if (w < 1) return;
    var dx = x + (T - w) / 2;
    var face = f < 0.5 ? before : after;
    if (face) {
      ctx.drawImage(face, x, y, T, T, dx, y, w, T);
    } else {
      // Headless (no canvas to copy): the face as a flat panel of its era.
      ctx.fillStyle = f < 0.5 ? '#202020' : COURT;
      ctx.fillRect(dx, y, w, T);
    }
    // Turned away from the light: darker the more edge-on, with a lit rim.
    ctx.fillStyle = 'rgba(0,0,0,' + (0.6 * (1 - sx)).toFixed(3) + ')';
    ctx.fillRect(dx, y, w, T);
    ctx.fillStyle = 'rgba(252,252,252,' + (0.55 * (1 - sx)).toFixed(3) + ')';
    ctx.fillRect(f < 0.5 ? dx : dx + w - Math.min(PX, w), y, Math.min(PX, w), T);
  }

  /** The rolling band just inside the ring's edge: the new picture, vertical hold slipping. */
  function drawRoll(ctx, m, after) {
    var r = m.radius;
    if (!(r > 1)) return;
    var inner = Math.max(0, r - ROLL_W);
    var h = m.height;
    var y = rollOffset(m.raw, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(m.origin.x, m.origin.y, r, 0, Math.PI * 2);
    ctx.arc(m.origin.x, m.origin.y, inner, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.drawImage(after, 0, y);
    ctx.drawImage(after, 0, y - h);
    ctx.fillStyle = MORTAR;
    ctx.fillRect(0, y - SYNC_BAR, m.width, SYNC_BAR);
    ctx.fillStyle = 'rgba(252,252,252,0.25)';
    ctx.fillRect(0, y, m.width, 2);
    ctx.restore();
  }

  /**
   * The flourish hook (src/erachange.js): called every frame of the ring that
   * brings era 2 in. Reads the state, writes nothing to it.
   */
  function consoleSwap(ctx, p, origin, fromEra, toEra, info) {
    if (!info || info.dim) return;           // the title's rally keeps the plain ring
    var state = info.state;
    var w = info.width, h = info.height;

    // The first frame of this change: power off for one frame.
    if (announced && state && announced.get(state) !== state.eraChangedAt) {
      announced.set(state, state.eraChangedAt);
      ctx.fillStyle = MORTAR;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    var radius = info.radius;
    var raw = info.duration > 0 ? Math.min(1, Math.max(0, info.t / info.duration)) : 1;
    var a = swapLayer(0, w, h);
    var b = a && swapLayer(1, w, h);
    var before = b ? frameOf(a, state, fromEra) : null;
    var after = b ? frameOf(b, state, toEra) : null;

    if (after) {
      drawRoll(ctx, { radius: radius, raw: raw, origin: origin, width: w, height: h }, after);
    }

    // The tiles just ahead of the ring, and any the ring has reached but not yet covered.
    var reach = radius + FLIP_LEAD + FLIP_JITTER;
    var half = FLIP_TILE * Math.SQRT1_2;
    var c0 = Math.max(0, Math.floor((origin.x - reach) / FLIP_TILE));
    var c1 = Math.min(Math.ceil(w / FLIP_TILE) - 1, Math.floor((origin.x + reach) / FLIP_TILE));
    var r0 = Math.max(0, Math.floor((origin.y - reach) / FLIP_TILE));
    var r1 = Math.min(Math.ceil(h / FLIP_TILE) - 1, Math.floor((origin.y + reach) / FLIP_TILE));
    for (var row = r0; row <= r1; row++) {
      for (var col = c0; col <= c1; col++) {
        var f = flipPhase(col, row, origin, radius);
        if (f <= 0) continue;
        if (f >= 1) {
          var dx = (col + 0.5) * FLIP_TILE - origin.x;
          var dy = (row + 0.5) * FLIP_TILE - origin.y;
          if (Math.sqrt(dx * dx + dy * dy) + half <= radius) continue;   // wholly inside: the ring drew it
        }
        drawTile(ctx, col * FLIP_TILE, row * FLIP_TILE, f, before, after);
      }
    }
  }

  R.registerEra({
    era: 2,
    name: '1985 NES',
    nesPalette: NES,
    font: FONT,
    spriteInks: spriteInks,
    paddleInk: function (state, side) {
      return spriteInks(state, side).body;
    },
    draw: draw,
    flourish: consoleSwap,
    consoleSwap: {
      tile: FLIP_TILE, lead: FLIP_LEAD, jitter: FLIP_JITTER,
      flipPhase: flipPhase, rollOffset: rollOffset
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
