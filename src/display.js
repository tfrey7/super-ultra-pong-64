/*
 * Super Ultra Pong 64: Remastered -- the display: every era at its machine's
 * own resolution.
 *
 * The renderer draws in field units (800 x 600). This file decides how many
 * real pixels those units get. Each frame ends in ONE offscreen canvas at
 * the native size of the machine on screen -- 256 x 240 for the NES, 320 x 240
 * for the PlayStation, the 720 lines of 720p for the Xbox 360 -- and then put on
 * the page with a single drawImage, scaled up to fill it. The 2D machines are
 * scaled with hard pixel edges (imageSmoothingEnabled false), the 3D ones with
 * the soft scaling a television gave them (true), so the pixels come out the
 * size that machine's pixels were.
 *
 * The table. One row per rung of the ladder:
 *   w, h      the native picture, in real pixels
 *   smooth    false: hard pixel edges; true: soft, the way a TV scaled it
 *   aspect    the shape the picture was shown at (4:3 for every machine here --
 *             a console's pixels were never square, the TV stretched them to
 *             fill the tube), so the field always fills the page's canvas.
 *             A row with another aspect is letterboxed or pillarboxed in it.
 *   overlay   the kind of screen it was seen on (see "overlays" below)
 *   strength  how strongly that overlay shows, 0..1
 *
 * During an era change the ring (src/erachange.js) composes the two eras in
 * whichever resolution is showing, and the display switches to the arriving
 * era's settings the frame the ring passes the centre of the field -- the
 * same instant the name card comes up.
 *
 * Overlays. A kind is a function (ctx, rect, row, info) that draws over the
 * scaled-up picture on the PAGE canvas, inside rect {x, y, w, h} in page
 * pixels; info is { era, time, native } where native is the offscreen canvas.
 * This file ships only 'none'. src/display-crt.js and src/display-tv.js each
 * register their own kinds with PongDisplay.registerOverlay(kind, fn) and set
 * the rows that use them -- they never need to edit this file or index.html.
 *
 * ?display=off turns the whole layer off: the frame is drawn straight onto the
 * page's canvas in field units, as before this file existed. The playtest reads
 * the native frame (pre-overlay) through PongDisplay.canvas(), and draws its
 * comparison frames through PongDisplay.render(), the same pipeline.
 *
 * Canvas 2D, a plain script, no per-pixel work.
 */
(function (root) {
  'use strict';

  var ROWS = [
    // 1972 arcade: tall blocks, four field units wide and five tall.
    { era: 0,  w: 200,  h: 120, smooth: false, overlay: 'none', strength: 0 },
    // 1977 Atari 2600: the 160-wide playfield and its 192 lines, wide pixels.
    { era: 1,  w: 160,  h: 192, smooth: false, overlay: 'none', strength: 0 },
    { era: 2,  w: 256,  h: 240, smooth: false, overlay: 'none', strength: 0 },   // NES
    { era: 3,  w: 320,  h: 224, smooth: false, overlay: 'none', strength: 0 },   // Genesis
    { era: 4,  w: 256,  h: 224, smooth: false, overlay: 'none', strength: 0 },   // Super Nintendo
    { era: 5,  w: 320,  h: 240, smooth: true,  overlay: 'none', strength: 0 },   // PlayStation
    { era: 6,  w: 320,  h: 240, smooth: true,  overlay: 'none', strength: 0 },   // N64
    { era: 7,  w: 640,  h: 480, smooth: true,  overlay: 'none', strength: 0 },   // Dreamcast, VGA
    { era: 8,  w: 512,  h: 448, smooth: true,  overlay: 'none', strength: 0 },   // PS2
    { era: 9,  w: 640,  h: 480, smooth: true,  overlay: 'none', strength: 0 },   // Xbox
    // Xbox 360: 720p. The field is 4:3, so it gets the 960 x 720 middle of a
    // 1280 x 720 frame -- the HDTV's side bars fall outside the page's canvas.
    { era: 10, w: 960,  h: 720, smooth: true,  overlay: 'none', strength: 0 }
  ];
  ROWS.forEach(function (r) { r.aspect = 4 / 3; });

  /** The row for an era: its own, or the nearest one below it. */
  function row(era) {
    var e = Math.floor(era) || 0;
    if (e >= ROWS.length) e = ROWS.length - 1;
    if (e < 0) e = 0;
    return ROWS[e];
  }

  // ---------------------------------------------------------------- overlays
  var OVERLAYS = {
    none: function () {}
  };

  function registerOverlay(kind, fn) {
    if (typeof kind !== 'string' || !kind || typeof fn !== 'function') {
      throw new Error('registerOverlay needs a kind name and a draw function');
    }
    OVERLAYS[kind] = fn;
    return fn;
  }

  // ------------------------------------------------------------- which era
  /**
   * The era whose display settings are showing for this state: its own, or,
   * while an era change's ring is still short of the centre, the era it is
   * leaving. Switches the instant the ring passes the centre.
   */
  function shownEra(state) {
    var R = root.PongRender;
    var m = R && typeof R.eraChangeMoment === 'function' ? R.eraChangeMoment(state) : null;
    if (m && !m.cardUp) return m.from;
    return state.era;
  }

  /** Where a picture of the given aspect sits inside a cw x ch canvas. */
  function fitRect(cw, ch, aspect) {
    var a = aspect > 0 ? aspect : cw / ch;
    var w = cw, h = cw / a;
    if (h > ch) { h = ch; w = ch * a; }
    w = Math.round(w); h = Math.round(h);
    return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w: w, h: h };
  }

  /**
   * Set ctx up to draw a fieldW x fieldH field into a canvas of the era's
   * native size: the scale and the smoothing. The playtest uses it to draw
   * its comparison frames exactly the way the page draws its own.
   */
  function prepare(ctx, era, fieldW, fieldH) {
    var r = row(era);
    ctx.setTransform(r.w / (fieldW || 800), 0, 0, r.h / (fieldH || 600), 0, 0);
    ctx.imageSmoothingEnabled = !!r.smooth;
    return r;
  }

  // ------------------------------------------------------ the offscreen frame
  // A 3D era draws straight into the native canvas, scaled. A 2D era draws in
  // field units onto a field-sized canvas and is then SAMPLED down to the
  // native one with smoothing off: every native pixel is one whole colour, the
  // way the machine's were. Drawing the block font straight into a canvas a
  // quarter the size left grey seams between its blocks (each fillRect edge is
  // antialiased at a fractional pixel), which no machine ever showed.
  // Both canvases are made once and reused; a size is set only when it changes.

  function blank(c, w, h) {
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, w, h);
    return x;
  }

  /** The context a frame is drawn into, in field units, on a set of surfaces. */
  function surfaces(set, era, fieldW, fieldH) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var r = row(era);
    set.era = era; set.fw = fieldW || 800; set.fh = fieldH || 600;
    if (!set.native) set.native = document.createElement('canvas');
    if (r.smooth) {
      var n = blank(set.native, r.w, r.h);
      prepare(n, era, set.fw, set.fh);
      return n;
    }
    if (!set.field) set.field = document.createElement('canvas');
    return blank(set.field, set.fw, set.fh);
  }

  /** A 2D era's field-sized picture sampled down into the native canvas. */
  function finish(set) {
    var r = row(set.era);
    if (r.smooth || !set.field || !set.native) return;
    var n = blank(set.native, r.w, r.h);
    n.imageSmoothingEnabled = false;
    n.drawImage(set.field, 0, 0, set.fw, set.fh, 0, 0, r.w, r.h);
  }

  var live = {};      // the page's own surfaces

  /** The native picture of the last frame -- before any overlay. */
  function canvas() { return live.native || null; }

  /**
   * The context to draw this frame into, in field units. Null when there is
   * no document. present() then puts it on the page.
   */
  function begin(era, fieldW, fieldH) {
    return surfaces(live, era, fieldW, fieldH);
  }

  /**
   * One frame through the same pipeline the page uses, on its own canvases:
   * draw(ctx) paints it in field units; returns the native canvas. The
   * playtest draws its comparison frames with it.
   */
  function render(era, fieldW, fieldH, draw) {
    var set = {};
    var ctx = surfaces(set, era, fieldW, fieldH);
    if (!ctx) return null;
    draw(ctx);
    finish(set);
    return set.native;
  }

  /**
   * Put the native frame on the page: ONE drawImage, scaled up to fill the
   * page's canvas (letterboxed or pillarboxed when the row's aspect differs),
   * then the row's overlay over it. Returns the rectangle it drew into.
   */
  function present(pageCtx, era, time) {
    finish(live);
    var off = live.native;
    var r = row(era);
    var page = pageCtx.canvas;
    var rect = fitRect(page.width, page.height, r.aspect);
    pageCtx.save();
    pageCtx.setTransform(1, 0, 0, 1, 0, 0);
    if (rect.w !== page.width || rect.h !== page.height) {
      pageCtx.fillStyle = '#000000';
      pageCtx.fillRect(0, 0, page.width, page.height);
    }
    pageCtx.imageSmoothingEnabled = !!r.smooth;
    if (r.smooth) pageCtx.imageSmoothingQuality = 'high';
    if (off) pageCtx.drawImage(off, 0, 0, off.width, off.height, rect.x, rect.y, rect.w, rect.h);
    var overlay = OVERLAYS[r.overlay] || OVERLAYS.none;
    overlay(pageCtx, rect, r, { era: era, time: time || 0, native: off });
    pageCtx.restore();
    return rect;
  }

  /**
   * Every row's screen overlay drawn once, at page load, so none of them is
   * drawn for the first time in the middle of an era change (item 1239).
   *
   * An overlay blends onto the PAGE canvas in present() -- the CRT tubes
   * multiply their shade over the picture -- and Chrome's graphics process
   * builds a GPU program the first time a draw of that kind reaches the screen.
   * The Super Nintendo's S-video tube was first drawn the frame the first ring
   * passed the centre (raw progress 0.50, when shownEra switches to the
   * arriving era), and that frame took 16.7-41.8 ms against a 4.2 ms median on
   * 8 of 8 fresh pages, 31 ms under trace, all of it one D3D shader compile for
   * an image drawn with a blend that reads the destination
   * (docs/measure/item-1239/). The ring's own warm-up in src/erachange.js never
   * reaches these draws: it draws field pictures, not the page's overlays.
   *
   * Drawn on a page-sized layer, then that layer copied once onto the page and
   * the page cleared: the copy is what makes Chrome rasterise the layer's draws
   * (item 1218: draws made straight onto the canvas are thrown away unrasterised
   * by the clear that ends a warm-up). It also builds each tube's shade at the
   * page's size, which the first frame of that era would otherwise pay for.
   * The main loop calls it once, on the first frame, before present(). A warm-up
   * is only ever an optimisation: nothing it does may stop the page.
   */
  function warmOverlays(pageCtx) {
    var page = pageCtx && pageCtx.canvas;
    var native = live.native;
    if (typeof document === 'undefined' || !document.createElement || !page || !native) return false;
    var drew = 0;
    try {
      var layer = document.createElement('canvas');
      layer.width = page.width;
      layer.height = page.height;
      var x = layer.getContext('2d');
      if (!x) return false;
      for (var e = 0; e < ROWS.length; e++) {
        var r = ROWS[e];
        var fn = OVERLAYS[r.overlay];
        if (!fn || fn === OVERLAYS.none) continue;
        var rect = fitRect(page.width, page.height, r.aspect);
        x.save();
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.imageSmoothingEnabled = !!r.smooth;
        if (r.smooth) x.imageSmoothingQuality = 'high';
        x.drawImage(native, 0, 0, native.width, native.height, rect.x, rect.y, rect.w, rect.h);
        // era -1: no real era, so an overlay that keeps a previous frame (the
        // 720p panel's smear) never blends this one into a real frame.
        fn(x, rect, r, { era: -1, time: 0, native: native });
        x.restore();
        drew++;
      }
      if (drew) {
        pageCtx.save();
        pageCtx.setTransform(1, 0, 0, 1, 0, 0);
        pageCtx.drawImage(layer, 0, 0);
        pageCtx.restore();
      }
    } catch (err) {
      // An optimisation only.
    } finally {
      if (drew) {
        pageCtx.save();
        pageCtx.setTransform(1, 0, 0, 1, 0, 0);
        pageCtx.clearRect(0, 0, page.width, page.height);
        pageCtx.restore();
      }
    }
    return drew > 0;
  }

  /** ?display=off draws straight onto the page, the way it was before. */
  function enabledFor(search) {
    return !/[?&]display=off(&|$)/.test(String(search || ''));
  }

  var api = root.PongDisplay = {
    ROWS: ROWS,
    OVERLAYS: OVERLAYS,
    row: row,
    registerOverlay: registerOverlay,
    shownEra: shownEra,
    fitRect: fitRect,
    prepare: prepare,
    begin: begin,
    present: present,
    warmOverlays: warmOverlays,
    render: render,
    canvas: canvas,
    enabledFor: enabledFor,
    enabled: enabledFor(root.location && root.location.search)
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
