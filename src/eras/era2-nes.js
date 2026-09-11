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
    court: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAACUCAYAAADWFGYSAAAEmElEQVR42u3dbXLaMBAA0Bwtx+hROAK3ptNMYMA1xpa0+vL7sZPphAqj1UOyLW++vq7X2674/nPb/dojEdXuiMesj/trV/K0qy8A0a4+BsRA1seASJ4+BkTy9DEgkqePAWnaroEMCCCAAAIIIIAAAggggAACyFRA7gNNiNkiG4hOFGdH0myZIkTLAESI2kBMyWKWJVUYkOv1drlcfsI3kRglfsZrEpCj6swmYrB4fKGnjN+UGST82vpZ74OMdq9ikHHwWO3UWmIBAshQ42BrBXRaIKPemQYEEEAAAcQSCxBAAAEEEEAAAcQ5CCCAmEEAAQQQQAABBBBAAAEEEECcpAMCiBkEEEDMIIAAAgggtrsDAogZxDkIIIAAAggggFhiATInEEUFRE5p0HAgOVVNCn6ArTJC96oUa+WGlr97ec2iTFFuPJePef73u+PbPLZF+aTlzz1lbN71ydaVnLVjOPpeL++7yN+nz7zVZsjMlFuVp4sZxBLLEiuq3SmWWIAAAojkAQKI5AECCCCAAAIIIIBMDMSddEAAAQQQQAABBBBAAAEEEEAAAQQQQFzmBQQQQAABBBBAAAEEEEAAAUQfAwKIPgYEEEAAAeQaX7QAEECGTN6eBJWCAkijqiZnKR1TMnkpx5X7WaKBjDIGRqtqsiyhUyyx9zajkKS0WeJYUtuI6oPcL6Ot/7M1Liyx8oGs/mwFJOKcpSWQ52MIBOIcpBaQiEE60ho9EigggHQJ5EjbkZ8dkMZAcpYUa8kcdWD2cBxrucjJESAFv0VSvrVbAql1M7Hmsay1cxTI3pwCktBJR5MASF9AjuQDkAZASt7kOxuQd20A0tlJ+pFEtAKSc8IacZ+jByBHcwEIIMvXr/41VkAACQdS+rhLDsitgdcrkJT7IICYQU4DxAwCSIslVthWFkAAmeIkvafNlYC4D+Iyb/37IC87dAFxJx2QDzuBAelkL1aLzYqz7cUquVnRXiy7eQGxm9cDU2d7HiT1PggggDR5os8ThYBkAenpmfRZHrmt9Ez6+EBUNak7UFu978xVTSLL/vy7pp0bpdr5r91eazalXhbtuezP70bLovkrMC527yHrteyPomaVZkCF4yY9B5k9ebUCEECKnMwCAogZBBBAAAFEHwMCiD4GxDkIIKMBeVROlzxAALHEAgQQQAABxDkIIIAAAggggFhi6WNAzCCAAAIIIIAAAggggAACCCCAAAIIIIC4zAsIIDYrAgJI5aomxYEIUaNgxZBVTRZRtOTPm5I0Oe/1XPJobxthn/FDe8sSTcvXr7WxNy/PX5RhZZucgwQvKyyxxl1iAQIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCC2mgACCCCAAGKJBQgggAACiCUWIIAAAggglliAAGIGAQQQQAABBBBLLEAAAQQQQAABZNiqJqqRiCGro1StaiLEaFFliSXELLNJcSBCzDSbACJEDSBCnLW86W5pQpyx9u/U2zZGO2Z93F+7kqddfQGIdvUxIAayPgZE8vQxIJKnjwGRPH0MiOQBAojkAQKI5GkXEMnTrr4ARLv6Yl/8BW1UJHoKiQEGAAAAAElFTkSuQmCC',
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
  // (Until item 1225 the score was drawn in this font at six units a pixel in
  // mid-court; it lives in the status band now, in the band's smaller letters.)

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

  // ------------------------------------------------------ the match (item 1225)
  // The art bible's era 2 page (docs/ART.md): not a Pong of 1985 but Nintendo's
  // Tennis of 1985 that happens to be Pong. A floodlit night court with a crowd
  // in the stands along the top, an umpire on his high chair at the net, the
  // players holding the paddles (src/characters.js, the NES block), a tennis
  // ball with its seam and its shadow, and Tennis's black status band -- P1 and
  // CPU, the rally count, the umpire's call after a point. All of it fillRect.
  var NATIVE = { x: 800 / 256, y: 600 / 240 };  // one NES pixel, in field units
  var BAND = { top: PX, h: 40 };                // two tile rows under the border
  var CROWD = { top: BAND.top + BAND.h, rows: 2, cols: 32, tw: 25, th: 20 };
  var CROWD_INKS = [NES[0x0C], NES[0x1C], NES[0x2D]];   // under the 0.35 line
  var CROWD_BEAT = 16 / 60;     // the patterns rotate every 16 frames
  var CROWD_BEAT_POINT = 4 / 60;  // and every 4 for a second after a point
  var CALL_S = 1;               // the umpire's call stays up this long
  var CALLS = ['GAME', 'FIFTEEN', 'THIRTY', 'FORTY'];
  var TEXT_CELL = 3;            // the band's letters: one cell a native pixel
  var SKIN_DARK = NES[0x07];    // the umpire, in the floodlights' shadow

  // 5 x 7 capitals for the band, in the same two-state rows as FONT.
  var LETTERS = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    '0': ['01110', '10011', '10101', '10101', '10101', '11001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00011', '00101', '01001', '10001', '11111', '00001', '00001'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '00100', '00100', '00100'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110']
  };

  function textWidth(text, cell) {
    return text.length * 6 * cell - cell;
  }

  /** One pass of band text: each lit run of a row is one rectangle. */
  function paintText(ctx, text, left, top, cell) {
    for (var i = 0; i < text.length; i++) {
      var rows = LETTERS[text[i]];
      if (!rows) continue;
      var gx = left + i * 6 * cell;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        for (var c = 0; c < row.length; c++) {
          if (row[c] !== '1') continue;
          var run = c;
          while (run < row.length && row[run] === '1') run++;
          ctx.fillRect(gx + c * cell, top + r * cell, (run - c) * cell, cell);
          c = run;
        }
      }
    }
  }

  /** Band text in an ink over the era's black drop shadow, one cell down and right. */
  function bandText(ctx, text, left, ink) {
    var top = BAND.top + Math.round((BAND.h - 7 * TEXT_CELL) / 2);
    ctx.fillStyle = MORTAR;
    paintText(ctx, text, left + TEXT_CELL, top + TEXT_CELL, TEXT_CELL);
    ctx.fillStyle = ink;
    paintText(ctx, text, left, top, TEXT_CELL);
  }

  /**
   * The last point, as the players' rig remembers it: { side, age } or null.
   * The rig keeps one memory per game (src/characters.js), so the band, the
   * crowd and the players all agree on when the point was.
   */
  function lastPoint(state) {
    var C = root.PongCharacters;
    if (!C || typeof C.memoryOf !== 'function' || !state.score) return null;
    var mem = C.memoryOf(state);
    var t = state.time || 0;
    var sides = ['left', 'right'];
    for (var i = 0; i < 2; i++) {
      var s = mem[sides[i]];
      if (s && s.held === 'win') return { side: sides[i], age: t - s.since };
    }
    return null;
  }

  function isMatchPoint(state) {
    var P = root.Pong;
    return !!(P && typeof P.isMatchPoint === 'function' && P.isMatchPoint(state));
  }

  /** Tennis's status band: P1 and CPU with their scores, the rally or the umpire's call. */
  function drawBand(ctx, state, left, right, point, match) {
    var w = state.width, t = state.time || 0;
    ctx.fillStyle = MORTAR;
    ctx.fillRect(PX, BAND.top, w - 2 * PX, BAND.h);
    // the bordered HUD: a grey rule along its foot
    ctx.fillStyle = LINE_SHADE;
    ctx.fillRect(PX, BAND.top + BAND.h - PX, w - 2 * PX, PX);

    var cw = 6 * TEXT_CELL;
    bandText(ctx, 'P1', 28, left.body);
    bandText(ctx, String(state.score.left), 28 + 3 * cw + cw, LINE);
    var rs = String(state.score.right);
    var rx = w - 28 - textWidth(rs, TEXT_CELL);
    bandText(ctx, rs, rx, LINE);
    bandText(ctx, 'CPU', rx - cw - textWidth('CPU', TEXT_CELL) - cw, right.body);

    var centre, ink = LINE_SHADE;
    if (point && point.age >= 0 && point.age < CALL_S) {
      centre = CALLS[(state.score[point.side] || 0) % 4];
      ink = LINE;
    } else if (match) {
      if (Math.floor(t * 2) % 2) return;         // 0.5 s on, 0.5 s off
      centre = 'MATCH POINT';
      ink = NES[0x16];
    } else {
      var n = Math.min(99, state.rally || 0);
      centre = 'RALLY ' + (n < 10 ? '0' : '') + n;
    }
    bandText(ctx, centre, Math.round(w / 2 - textWidth(centre, TEXT_CELL) / 2), ink);
  }

  /**
   * The crowd: 32 tiles by 2 rows under the band, each a spectator in one of
   * three patterns (sitting, leaning, arms up) that rotate along the stand --
   * every 16 frames, every 4 for a second after a point, and held on the
   * brightest (arms up) at match point. Three dark inks, under the 0.35 line.
   */
  function drawCrowd(ctx, state, point, match) {
    var t = state.time || 0;
    var beat = point && point.age >= 0 && point.age < CALL_S ? CROWD_BEAT_POINT : CROWD_BEAT;
    var step = Math.floor(t / beat);
    var nx = NATIVE.x, ny = NATIVE.y;
    ctx.fillStyle = NES[0x0F];
    ctx.fillRect(PX, CROWD.top, state.width - 2 * PX, CROWD.rows * CROWD.th);
    for (var row = 0; row < CROWD.rows; row++) {
      for (var col = 0; col < CROWD.cols; col++) {
        var pat = match ? 2 : (col * 2 + row + step) % 3;
        var x = col * CROWD.tw, y = CROWD.top + row * CROWD.th;
        var lift = pat === 2 ? -ny : 0;
        // shoulders, then the head, in the tile's own ink (row back is darker)
        ctx.fillStyle = CROWD_INKS[(col + row) % 2];
        ctx.fillRect(x + 1.5 * nx, y + 5 * ny + lift, 5 * nx, 3 * ny - lift);
        ctx.fillStyle = CROWD_INKS[pat === 2 ? 2 : 1];
        ctx.fillRect(x + (2.5 + (pat === 1 ? 1 : 0)) * nx, y + 2 * ny + lift, 3 * nx, 3 * ny);
        if (pat === 2) {                                // arms up
          ctx.fillStyle = CROWD_INKS[2];
          ctx.fillRect(x + 1 * nx, y + 1 * ny, nx, 4 * ny);
          ctx.fillRect(x + 6 * nx, y + 1 * ny, nx, 4 * ny);
        }
      }
    }
  }

  /**
   * The umpire's high chair at the net, 2 x 3 tiles, and the umpire on it,
   * 2 x 2 tiles, his head turned one pixel toward where the ball is going.
   */
  function drawUmpire(ctx, state) {
    var nx = NATIVE.x, ny = NATIVE.y;
    var cx = state.width / 2;
    var top = CROWD.top + ny;
    var look = state.ball && state.ball.vx < 0 ? -1 : 1;
    // the chair: two legs down to the court and a seat, dark grey over black
    ctx.fillStyle = MORTAR;
    ctx.fillRect(cx - 8 * nx, top + 8 * ny, 16 * nx, 2 * ny);
    ctx.fillStyle = POST;
    ctx.fillRect(cx - 7 * nx, top + 8 * ny, 14 * nx, ny);
    ctx.fillRect(cx - 7 * nx, top + 9 * ny, nx, 14 * ny);
    ctx.fillRect(cx + 6 * nx, top + 9 * ny, nx, 14 * ny);
    ctx.fillRect(cx - 7 * nx, top + 16 * ny, 14 * nx, ny);
    // the umpire: a navy blazer, a dark face, a white cap brim no brighter than the lines
    ctx.fillStyle = NES[0x02];
    ctx.fillRect(cx - 5 * nx, top + 2 * ny, 10 * nx, 6 * ny);
    ctx.fillStyle = SKIN_DARK;
    ctx.fillRect(cx - 3 * nx + look * nx, top - 4 * ny, 6 * nx, 6 * ny);
    ctx.fillStyle = NES[0x2D];
    ctx.fillRect(cx - 3 * nx + look * nx, top - 5 * ny, 6 * nx, 2 * ny);
    ctx.fillRect(cx + (look > 0 ? 3 : -5) * nx + look * nx, top - 4 * ny, 2 * nx, ny);
  }

  /** The tennis ball's shadow, as Tennis drew it: 4 x 2 black, 3 pixels below. */
  function drawBallShadow(ctx, state) {
    if (state.serveDelay > 0) return;
    var b = state.ball;
    ctx.fillStyle = MORTAR;
    ctx.fillRect(Math.round(b.x), Math.round(b.y + b.size + 3 * NATIVE.y), b.size, 2 * NATIVE.y);
  }

  /** The seam: one pale-yellow NES pixel on the ball's lit side. */
  function drawSeam(ctx, state) {
    if (state.serveDelay > 0) return;
    var b = state.ball;
    ctx.fillStyle = NES[0x38];
    ctx.fillRect(Math.round(b.x + b.size / 4), Math.round(b.y + b.size / 4), Math.round(NATIVE.x), Math.round(NATIVE.y));
  }

  // ------------------------------------------------------------ the frame
  function draw(ctx, state, opts, api) {
    // A dimmed frame (the attract rally behind a title) stays the stock
    // monochrome frame, exactly as era 1's does, so the title stays readable.
    if (opts && opts.ink) return (api || R).drawBase(ctx, state, opts);

    var left = spriteInks(state, 'left');
    var right = spriteInks(state, 'right');
    var point = lastPoint(state);
    var match = isMatchPoint(state);

    drawCourt(ctx, state);
    drawBorder(ctx, state);
    drawNet(ctx, state);
    drawCrowd(ctx, state, point, match);
    drawUmpire(ctx, state);
    drawBand(ctx, state, left, right, point, match);
    drawPaddle(ctx, state.left, left);
    drawPaddle(ctx, state.right, right);
    drawBallShadow(ctx, state);
    drawBall(ctx, state);
    drawSeam(ctx, state);
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
