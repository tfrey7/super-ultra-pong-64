'use strict';
/*
 * Era 5 inside the real 3D layer (item 1291): the PlayStation's limits. The
 * look carries the layer's render knobs, and its fieldSetup gives the slab a
 * 64 x 64 texture mapped affine (a shader chunk through onBeforeCompile) and the
 * rails Gouraud vertex colours -- when there is a scene, and nothing at all when
 * there is not, so the canvas fallback (node --test, ?gl=off) is today's.
 *
 * No WebGL here: the scene is made of three.js's own objects (vendor/three.js
 * loads under node; nothing is rendered), handed over as the layer's internals.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { R } = eralooks.loadRenderer(ROOT);
const look = R.eraLook(5);

// three.js itself, for its classes and its shader templates; taken off the
// global again so nothing else in this file thinks the page has a library.
require('../vendor/three.js');
const THREE = globalThis.THREE;
delete globalThis.THREE;

/** The layer's scene as src/field3d.js builds it: the slab and the two rails, under 'flat' lighting. */
function scene() {
  const flat = () => new THREE.MeshLambertMaterial({ color: '#203048', flatShading: true });
  const box = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat());
  return { THREE, renderer: {}, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    parts: { slab: box(800, 14, 600), farRail: box(800, 36, 18), nearLip: box(800, 14, 10), legs: [box(12, 96, 12)] } };
}

/** A stand-in layer: counts how often it is asked for its internals. */
function layer(I, available = true) {
  const F = { asked: 0, available: () => available, internals() { F.asked++; return I; } };
  return F;
}

const state = (era) => ({ era, time: 12.5 });   // all fieldSetup reads is whose frame it is

test('era 5 carries the PlayStation render knobs for the 3D layer', () => {
  assert.deepStrictEqual(look.render, { resolution: 1, filter: false, lighting: 'flat' });
  assert.strictEqual(typeof look.fieldSetup, 'function', 'the scene work is one function on the look');
});

test('fieldSetup asks internals() for the slab and gives it a 64 x 64 texture, nearest texels, mapped affine', () => {
  const I = scene(), F = layer(I);
  const slab = I.parts.slab, mat = slab.material;
  assert.strictEqual(look.fieldSetup(F, state(5)), I, 'answers the internals it worked on');
  assert.ok(F.asked >= 1, 'the layer was asked for its internals');
  const map = mat.map;
  assert.ok(map && map.isDataTexture, 'the slab has a texture');
  assert.ok(map.image.width <= 64 && map.image.height <= 64, `at most 64 x 64 texels: ${map.image.width} x ${map.image.height}`);
  assert.strictEqual(map.magFilter, THREE.NearestFilter, 'no bilinear filtering');
  assert.strictEqual(map.minFilter, THREE.NearestFilter);
  assert.strictEqual(map.generateMipmaps, false);
  assert.deepStrictEqual([map.repeat.x, map.repeat.y], [4, 3], '4 tiles across the table, 3 down it: 200 field units a tile');
  assert.strictEqual(map.userData.era, 5, 'tagged era 5');
  assert.strictEqual(mat.onBeforeCompile, look.layer.affineChunk, 'the affine chunk is installed');
  assert.ok(mat.userData.ps1Affine && mat.userData.era === 5);
  assert.ok(mat.version > 0, 'the material asked to be recompiled');
  assert.strictEqual(slab.geometry.parameters.widthSegments, 2, 'the top cut into 2 x 2 quads, the canvas table\'s 8 triangles');
  assert.strictEqual(slab.geometry.parameters.depthSegments, 2);
  assert.deepStrictEqual([slab.geometry.parameters.width, slab.geometry.parameters.height, slab.geometry.parameters.depth], [800, 14, 600]);
});

test('the affine chunk rewrites three.js\'s own shaders: uv times w in the vertex shader, divided back per fragment', () => {
  const I = scene();
  look.fieldSetup(layer(I), state(5));
  const lib = THREE.ShaderLib.lambert;
  const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
  I.parts.slab.material.onBeforeCompile(shader);
  assert.ok(/varying float vPs1W;/.test(shader.vertexShader) && /varying float vPs1W;/.test(shader.fragmentShader));
  assert.ok(shader.vertexShader.includes('#include <project_vertex>\n\tvPs1W = gl_Position.w;'), 'w is taken after the projection');
  assert.ok(shader.vertexShader.includes('vMapUv *= gl_Position.w;'));
  assert.ok(shader.fragmentShader.includes('texture2D( map, vMapUv / vPs1W )'), 'the texel is read at the screen-linear uv');
  assert.ok(!shader.fragmentShader.includes('#include <map_fragment>'), 'three\'s own perspective-correct read is gone');
  // the vertex shader still sets vMapUv before it is scaled
  assert.ok(shader.vertexShader.indexOf('#include <uv_vertex>') < shader.vertexShader.indexOf('vMapUv *= gl_Position.w'));
});

test('the rails are Gouraud: their own lit material, the rail grey at the top corners and its shadow below', () => {
  const I = scene();
  look.fieldSetup(layer(I), state(5));
  const top = new THREE.Color(look.palette.rail), low = new THREE.Color(look.palette.railShadow);
  for (const name of ['farRail', 'nearLip']) {
    const m = I.parts[name];
    assert.ok(m.material.isMeshLambertMaterial && m.material.vertexColors, `${name}: vertex colours`);
    assert.strictEqual(m.material.userData.era, 5);
    const pos = m.geometry.getAttribute('position'), col = m.geometry.getAttribute('color');
    assert.strictEqual(col.count, pos.count);
    for (let i = 0; i < pos.count; i++) {
      const want = pos.getY(i) > 0 ? top : low;
      assert.ok(Math.abs(col.getX(i) - want.r) < 1e-6 && Math.abs(col.getZ(i) - want.b) < 1e-6, `${name} corner ${i}`);
    }
  }
  assert.ok(!I.parts.legs[0].material.vertexColors, 'everything else stays one flat colour a face');
  assert.ok(I.parts.legs[0].material.flatShading);
});

test('with no scene fieldSetup does nothing: internals() null (node --test) and the layer switched off (?gl=off)', () => {
  const F = layer(null);
  assert.strictEqual(look.fieldSetup(F, state(5)), null);
  assert.strictEqual(F.asked, 1, 'it asked once, and took the null as no scene');
  const I = scene(), off = layer(I, false);
  assert.strictEqual(look.fieldSetup(off, state(5)), null);
  assert.strictEqual(off.asked, 0, 'a switched-off layer is not even asked');
  assert.strictEqual(I.parts.slab.material.map, null, 'and its scene is left exactly as it was');
  assert.strictEqual(I.parts.slab.material.onBeforeCompile.toString(), new THREE.MeshLambertMaterial().onBeforeCompile.toString());
  assert.strictEqual(look.fieldSetup(undefined, state(5)), null, 'no layer on the page at all');
  assert.strictEqual(globalThis.PongField3D, undefined, 'node --test has no layer, so the era draws the canvas table');
});

test('fieldSetup re-applies itself after another era\'s frame and after the layer rebuilds its materials', () => {
  const I = scene(), F = layer(I);
  look.fieldSetup(F, state(5));
  const mat = I.parts.slab.material, tex = mat.map;
  // another era's frame changes the shared scene...
  look.fieldSetup(F, state(6));
  mat.map = null;
  mat.onBeforeCompile = function () {};
  // ...and era 5's next frame puts it back
  look.fieldSetup(F, state(5));
  assert.strictEqual(mat.map, tex, 'the same texture, made once');
  assert.strictEqual(mat.onBeforeCompile, look.layer.affineChunk);
  // a lighting change rebuilds the materials: a fresh one is patched on the next frame
  I.parts.slab.material = new THREE.MeshLambertMaterial({ flatShading: true });
  look.fieldSetup(F, state(5));
  assert.strictEqual(I.parts.slab.material.map, tex);
  assert.strictEqual(I.parts.slab.material.onBeforeCompile, look.layer.affineChunk);
  // while nothing changes, a frame changes nothing: no recompile asked
  const v = I.parts.slab.material.version;
  look.fieldSetup(F, state(5));
  assert.strictEqual(I.parts.slab.material.version, v);
});

test('the texels are the canvas tile\'s: an 8 x 8 checker of the two texture colours, one scuff', () => {
  const t = look.layer.texels(), n = look.layer.TEX.size;
  assert.strictEqual(t.length, n * n * 4);
  const at = (x, y) => '#' + [0, 1, 2].map((k) => t[(y * n + x) * 4 + k].toString(16).padStart(2, '0')).join('');
  assert.strictEqual(at(0, 0), look.palette.texLight);
  assert.strictEqual(at(8, 0), look.palette.texDark);
  assert.strictEqual(at(8, 8), look.palette.texLight);
  assert.strictEqual(at(0, 63), look.palette.scuff, 'the scuff starts in a corner');
  assert.strictEqual(at(62, 1), look.palette.scuff, 'and meets itself across the repeat');
  const colours = new Set();
  for (let i = 0; i < n * n; i++) colours.add(at(i % n, Math.floor(i / n)));
  assert.deepStrictEqual([...colours].sort(), [look.palette.scuff, look.palette.texDark, look.palette.texLight].sort());
});
