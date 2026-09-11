/*
 * Super Ultra Pong 64: Remastered -- named pixel-art images, for the era files.
 *
 * tools/pixellab.mjs makes pixel art and saves it as assets/pixellab/<name>.png,
 * with how it was made in assets/pixellab/manifest.json. This is how an era
 * file draws one: ask for it by name, and it is drawn with ONE drawImage call.
 * The browser decodes the PNG once; nothing here loops over pixels.
 *
 *   var S = root.PongSprites;
 *   if (!S.draw(ctx, 'test-ball', x, y, w, h)) {
 *     ctx.fillRect(x, y, w, h);        // not decoded yet (or no such file):
 *   }                                  // the era's own plain look this frame
 *
 * The first draw() of a name starts loading it (load() does the same ahead of
 * time). Loading is asynchronous and can fail, so draw() answers false until
 * the image is ready, and the era draws its fallback in the meantime. The
 * image is drawn with smoothing off, so a 32x32 sprite scaled up stays blocky.
 *
 * Images load off disk (file://) as well as over HTTP. One caution for era
 * cards: in a file:// page an image drawn onto a canvas taints it, so that
 * canvas can no longer be read back with getImageData or toDataURL.
 *
 * A plain script with a UMD tail like src/game.js: window.PongSprites in the
 * page, require('../src/sprites.js') under node --test. There is no Image in
 * Node, so a test builds its own loader with create({ makeImage }).
 */
(function (root) {
  'use strict';

  var DIR = 'assets/pixellab/';
  var NAME = /^[a-z0-9][a-z0-9_-]*$/;

  function create(options) {
    var opts = options || {};
    var dir = opts.dir !== undefined ? opts.dir : DIR;
    var makeImage = opts.makeImage || function () { return new root.Image(); };
    var cache = {};

    /** The file a name stands for, relative to index.html. */
    function pathOf(name) {
      if (typeof name !== 'string' || !NAME.test(name)) {
        throw new Error('not a sprite name: ' + name);
      }
      return dir + name + '.png';
    }

    /** Start loading a name (once); answers its image element. */
    function load(name) {
      if (cache[name]) return cache[name].image;
      var src = pathOf(name);
      var image = makeImage();
      var entry = cache[name] = { image: image, state: 'loading' };
      image.onload = function () { entry.state = 'ready'; };
      image.onerror = function () { entry.state = 'failed'; };
      image.src = src;
      return image;
    }

    /** 'unloaded', 'loading', 'ready' or 'failed'. */
    function status(name) {
      var entry = cache[name];
      if (!entry) return 'unloaded';
      // An image already in the browser's cache can be complete before onload runs.
      if (entry.state === 'loading' && entry.image.complete && entry.image.naturalWidth > 0) {
        entry.state = 'ready';
      }
      return entry.state;
    }

    function ready(name) { return status(name) === 'ready'; }

    /**
     * Draw a named image at (x, y), scaled to w x h when they are given.
     * Answers true when it drew, false when the image is not ready yet.
     */
    function draw(ctx, name, x, y, w, h) {
      load(name);
      if (!ready(name)) return false;
      var image = cache[name].image;
      var smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      if (w === undefined) ctx.drawImage(image, x, y);
      else ctx.drawImage(image, x, y, w, h);
      ctx.imageSmoothingEnabled = smooth;
      return true;
    }

    return { DIR: dir, path: pathOf, load: load, status: status, ready: ready, draw: draw };
  }

  var api = create();
  api.create = create;
  root.PongSprites = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
