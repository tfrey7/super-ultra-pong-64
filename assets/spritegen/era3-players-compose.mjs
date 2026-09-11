#!/usr/bin/env node
/*
 * assets/spritegen/era3-players-compose.mjs -- era 3's two Genesis figures,
 * drawn as text-grid PARTS and posed per frame (item 1280).
 *
 * Item 1272's barbarian was one frame shifted and patched: 9 of 12 frames
 * different and the poses barely moved. Here each figure is drawn once as
 * parts -- head, torso, front arm (four ways), back-arm shield, legs (three
 * ways) -- and every frame places them, so the legs stride, the body lunges
 * two pixels into a swing and is knocked back three on a miss, the arm winds
 * up and strikes, and the win raises an axe (a sword) and hops. The knight is
 * the barbarian's skeleton in plate: the same placements, his own parts and
 * palette, so the two sides are one matched pair.
 *
 *   node assets/spritegen/era3-players-compose.mjs
 *
 * writes assets/spritegen/era3-barbarian.json and era3-knight.json (pgrid-v1,
 * full frames). Then, per figure, tools/spritegen.mjs lint / look / build as
 * docs/lessons/sprites.md says, and build --out assets/pixellab/<id>.png,
 * where the game's sprite loader looks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from '../../tools/spritegen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 20, H = 25;

// ---- the barbarian's parts (facing right, the ball's side) -------------------
const B = {
  head: [                 // 14 x 10: horned steel helmet, red beard, face to the right
    'kk..........kk',
    'kwk........kwk',
    'kxwk.kkkk.kwxk',
    '.kxwkmwmmkwxk.',
    '..kxmmmmmnnk..',
    '...knmnnmnook.',
    '...khhbacacak.',
    '...khhbakakak.',
    '...khbaaaacaak',
    '....khhdhhhhk.'
  ],
  torso: [                // 10 x 9: bare chest, beard on it, belt, fur loincloth
    'kbbhhdhbbk',
    'kaabhhbaak',
    'kbaabaabak',
    'kbaaaaabbk',
    'kcbacabcbk',
    '.kcbbbbck.',
    '.kdddxddk.',
    '.kfgffgfk.',
    '.kffgffgk.'
  ],
  shield: [               // 6 x 10: the round wooden shield on the back arm
    '.kkkk.',
    'knnnnk',
    'ksxssk',
    'ksmmsk',
    'ksmmsk',
    'kssxsk',
    'kssssk',
    'ksxssk',
    'knnnnk',
    '.kkkk.'
  ],
  hold: [                 // 6 x 6: the front arm, the fist on the bat's handle
    'bbak..',
    'abaak.',
    'kbaakk',
    'kkaaak',
    '.kbabk',
    '..kkk.'
  ],
  windup: [               // 6 x 5: the fist pulled back to the shoulder, elbow up
    '..kkk.',
    '.kbaak',
    'kbaabk',
    'kaabk.',
    '.kkk..'
  ],
  strike: [               // 7 x 4: the arm thrown straight out to the bat
    'kkkkkkk',
    'baaaaak',
    'bbbbaak',
    'kkkkkkk'
  ],
  drop: [                 // 3 x 7: the arm hanging, the point gone
    'bak',
    'bak',
    'bak',
    'bak',
    'kak',
    'kbk',
    '.k.'
  ],
  up: [                   // 5 x 11: the arm raised, an axe in the fist
    '.kkkk',
    'kfnmk',
    'kfnmm',
    'kfnnk',
    'kfkk.',
    'kaak.',
    'kbak.',
    'kbak.',
    'kbak.',
    'bak..',
    'bak..'
  ],
  stand: [                // 11 x 6: legs together, fur-cuffed boots
    'kbaakbaak..',
    'kbaakbaak..',
    'kfffkfffk..',
    'kgggkgggk..',
    'kgggfkgggfk',
    'kkkkkkkkkkk'
  ],
  step: [                 // 14 x 6: legs apart, a step or a lunge
    '..kbaakbaak...',
    '.kbaak.kbaak..',
    '.kfffk..kfffk.',
    'kgggk...kgggk.',
    'kgggfk..kgggfk',
    'kkkkkk..kkkkkk'
  ],
  crouch: [               // 12 x 5: knees bent, knocked back
    '.kbaakkbaak.',
    'kbaak..kbaak',
    'kfffk..kfffk',
    'kgggk..kgggk',
    'kkkkk..kkkkk'
  ]
};

// ---- the knight's own parts; arms and legs are the barbarian's in plate -------
const plate = (rows, map) => rows.map((r) => r.replace(/[a-z]/g, (c) => map[c] || c));
const ARMOUR = { a: 'l', b: 'n', c: 'o' };             // skin -> steel
const GREAVES = { a: 'l', b: 'o', f: 'n', g: 'p' };    // legs and boots -> greaves and sabatons
const K = {
  head: [                 // 14 x 10: a crested great helm, the plume swept back
    '...kkkk.......',
    '.kksssrk......',
    'kssrrrrdk.....',
    'krrdkkkkkkk...',
    '.kdklllllmmk..',
    '..knlllllllmk.',
    '..knkkkkkkkkk.',
    '..knlllkllllk.',
    '..knolllllllk.',
    '...kooonnnnk..'
  ],
  torso: [                // 10 x 9: breastplate, gold belt, mail skirt
    'kolllllmmk',
    'konlllllmk',
    'kpollllllk',
    'kponlllllk',
    'kppoonnnnk',
    '.kyyyyyyk.',
    '.kpooonok.',
    '.kponopok.',
    '.kpoopook.'
  ],
  shield: [               // 6 x 8: a heater shield in the crest's red
    'kkkkkk',
    'kllnok',
    'klrrok',
    'krrrrk',
    'klrrok',
    'klrrok',
    '.knok.',
    '..kk..'
  ],
  hold: plate(B.hold, ARMOUR),
  windup: plate(B.windup, ARMOUR),
  strike: plate(B.strike, ARMOUR),
  drop: plate(B.drop, ARMOUR),
  up: [                   // 5 x 11: the arm raised, a sword in the gauntlet
    '.kmk.',
    '.kmk.',
    '.kmk.',
    '.klk.',
    'kyyyk',
    'klllk',
    'knlnk',
    'knlk.',
    'knlk.',
    'nlk..',
    'nlk..'
  ],
  stand: plate(B.stand, GREAVES),
  step: plate(B.step, GREAVES),
  crouch: plate(B.crouch, GREAVES)
};

// ---- the poses: where each part goes, frame by frame (both figures) ----------
// Painted back to front: shield (the far arm), legs, torso, head, front arm.
// The hand is (20, 13): the bat's handle, at the frame's right edge.
const POSES = {
  // a breath: the body settles a row, the fist rides with it
  idle0: { shield: [0, 10], legs: ['stand', 6, 19], torso: [7, 10], head: [4, 0], arm: ['hold', 14, 10] },
  idle1: { shield: [0, 11], legs: ['stand', 6, 19], torso: [7, 11], head: [4, 1], arm: ['hold', 14, 11] },
  // up: a crouched step, leaning back, the shield high
  up0:   { shield: [0, 7],  legs: ['step', 4, 19],  torso: [7, 11], head: [3, 1], arm: ['hold', 14, 11] },
  up1:   { shield: [0, 8],  legs: ['stand', 6, 19], torso: [7, 10], head: [3, 0], arm: ['hold', 14, 10] },
  // down: the same step, leaning in and looking down, the shield low
  down0: { shield: [0, 12], legs: ['stand', 6, 19], torso: [7, 10], head: [5, 1], arm: ['hold', 14, 10] },
  down1: { shield: [0, 13], legs: ['step', 4, 19],  torso: [7, 11], head: [5, 2], arm: ['hold', 14, 11] },
  // swing: wind up leaning back, lunge two pixels in, recover
  swing0: { shield: [0, 8],  legs: ['stand', 5, 19], torso: [6, 10], head: [3, 0], arm: ['windup', 13, 9] },
  swing1: { shield: [2, 10], legs: ['step', 5, 19],  torso: [9, 10], head: [6, 0], arm: ['strike', 13, 11] },
  swing2: { shield: [1, 10], legs: ['step', 4, 19],  torso: [8, 10], head: [5, 0], arm: ['hold', 14, 9] },
  // miss: knocked back three pixels, knees bent, head down, the arm dropped
  miss0: { shield: [0, 13], legs: ['crouch', 3, 20], torso: [4, 12], head: [1, 2], arm: ['drop', 12, 12] },
  // win: the weapon raised; then the hop, both feet off the ground
  win0:  { shield: [0, 6],  legs: ['stand', 6, 19], torso: [7, 10], head: [3, 0], arm: ['up', 15, 0] },
  win1:  { shield: [0, 4],  legs: ['stand', 6, 17], torso: [7, 9],  head: [3, 0], arm: ['up', 15, 0] }
};

function paint(parts, pose) {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (rows, x0, y0) => rows.forEach((r, y) => [...r].forEach((c, x) => {
    const X = x0 + x, Y = y0 + y;
    if (c !== '.' && X >= 0 && X < W && Y >= 0 && Y < H) g[Y][X] = c;
  }));
  put(parts.shield, ...pose.shield);
  put(parts[pose.legs[0]], pose.legs[1], pose.legs[2]);
  put(parts.torso, ...pose.torso);
  put(parts.head, ...pose.head);
  put(parts[pose.arm[0]], pose.arm[1], pose.arm[2]);
  return g.map((r) => r.join(''));
}

function sheet(id, parts, palette, prompt, reference) {
  const frames = {};
  for (const [name, pose] of Object.entries(POSES)) frames[name] = paint(parts, pose);
  return {
    format: 'pgrid-v1', id, era: 3, prompt, reference,
    frame: { w: W, h: H }, hand: { x: 20, y: 13 },
    beats: { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 },
    palette, frames
  };
}

const barbarian = sheet('era3-barbarian', B, {
  k: '#000000', a: '#ffb692', b: '#db926d', c: '#926d49', h: '#b64924', d: '#6d2400',
  m: '#dbdbdb', n: '#929292', o: '#494949', w: '#ffffdb', x: '#dbb66d', f: '#926d24',
  g: '#6d4924', s: '#b66d24'
}, 'The Genesis left player (item 1280, from item 1272\'s grid): a Golden Axe barbarian facing right, horned steel helmet, red beard, bare chest, fur loincloth, fur-cuffed boots, the round wooden shield on the far arm raised in guard, the near fist on the bat\'s handle at the frame\'s right edge. Drawn as parts and posed per frame so the six beats move.',
'assets/pixellab/era3-p1.png');

const knight = sheet('era3-knight', K, {
  k: '#000000', m: '#dbdbff', l: '#b6b6db', n: '#9292b6', o: '#6d6d92', p: '#49496d',
  r: '#924924', s: '#db6d49', d: '#6d2400', y: '#dbb66d'
}, 'The Genesis right player (item 1280): an armoured knight in a crested great helm, facing right (the rig mirrors him), plate in #6d6d92 and #b6b6db, the crest #924924, a gold belt, a red heater shield on the far arm, the near gauntlet on the bat\'s handle. The barbarian\'s skeleton and poses in plate, so the pair match.',
'assets/pixellab/era3-p2.png');

for (const doc of [barbarian, knight]) {
  const out = path.join(HERE, doc.id + '.json');
  fs.writeFileSync(out, stringify(doc));
  console.log('wrote', path.relative(path.resolve(HERE, '../..'), out));
}
