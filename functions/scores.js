const querystring = require('querystring');
const axios = require('axios');

const EMPTY = 16;
const length = 10;
const MULTIPLIER = 1;
const LEVEL_UP_BONUS = 250;
const highScoreSize = 8;

class Game {
  grid = [];
  seed = Uint16Array.of(1);
  level = 1;

  toggleTaggedTo(tagged, bit, clear = false) {
    tagged.forEach((i) => {
      this.grid[i] ^= bit;
    });
  }

  clearColumn({ i, x, y, speed = 10 }) {
    const grid = this.grid;
    let swapped = false;
    const coords = { x, y };
    do {
      coords.y--;
      const target = this.coordsToIndex(coords);

      // if we hit the edge, stop searching
      if (target === -1) {
        break;
      }

      // if we find an empty block, skip upwards
      if (grid[target] & EMPTY) {
        i = target;
        continue;
      }

      // swap the block, draw and update
      swapped = true;
      const tmp = grid[i];
      grid[i] = grid[target];
      grid[target] = tmp;
      i = target;
    } while (true);

    return swapped;
  }

  shiftColumn({ x, y, i, speed }) {
    const grid = this.grid;
    const edge = length - 1;
    const coords = { x, y };
    let swapped = false;

    do {
      i = this.coordsToIndex(coords);
      const target = i + 1; // always to the right
      coords.y--; // on the next iteration, go up one

      // if we hit the edge, stop searching
      if (i === -1 || coords.x === edge) {
        break;
      }

      // if the block to the right is empty, do nothing
      if (grid[target] & EMPTY) {
        continue;
      }

      // swap the block, draw and update
      swapped = true;
      const tmp = grid[i];
      grid[i] = grid[target];
      grid[target] = tmp;
    } while (true);

    return swapped;
  }

  fall() {
    const grid = this.grid;
    const edge = length - 1;
    for (var x = 0; x < length; x++) {
      for (var y = edge; y >= 0; y--) {
        let i = this.coordsToIndex({ x, y });
        if (grid[i] & EMPTY) {
          if (this.clearColumn({ x, y, i })) {
            y++; // go back and check the starting block
          }
        }
      }
    }

    // now go through the columns, and if there's any that stand empty, we need
    // to shift the entire column to the left
    for (var x = 0; x < length; x++) {
      let i = this.coordsToIndex({ x, y: edge });
      if (grid[i] & EMPTY) {
        if (this.shiftColumn({ x, y: edge, i, speed: 10 })) {
          x -= 2; // go back and check the starting block
        }
      }
    }
  }

  clear(i) {
    const grid = this.grid;
    const match = grid[i];

    if (match === EMPTY) return 0;

    const { x, y } = this.indexToCoords({ i });
    const tagged = this.tag({ x, y, match, expect: 0, bit: EMPTY });
    const total = tagged ? tagged.length : 0;

    if (total <= 1) {
      throw new Error('not enough matched');
    }

    this.toggleTaggedTo(tagged, EMPTY, true);
    this.fall();

    grid.forEach((_, i) => {
      if (grid[i] & EMPTY) {
        grid[i] = EMPTY;
      }
    });

    const remain = grid.filter((_) => _ !== EMPTY).length;

    let score = total * (MULTIPLIER + total);

    if (remain === 0) {
      this.init();
      // level up bonus
      this.level++;
      score += LEVEL_UP_BONUS;
    }

    return score;
  }

  rnd() {
    let xs = Uint16Array.of(this.seed[0]);

    xs[0] ^= xs[0] << 7;
    xs[0] ^= xs[0] >> 9;
    xs[0] ^= xs[0] << 8;

    this.seed = Uint16Array.of(xs[0]);

    return 1 << (xs[0] & 3);
  }

  init(s = 0) {
    const grid = this.grid;
    if (s > 0) this.seed = Uint16Array.of(s);

    grid.length = 0;
    for (let index = 0; index < 100; index++) {
      const r = this.rnd();
      grid.push(r);
    }
  }

  coordsToIndex({ x, y }) {
    const index = y * length + x;

    const edge = length - 1;

    if (x < 0 || x > edge) return -1;
    if (y < 0 || y > edge) return -1;

    return index;
  }

  indexToCoords({ i }) {
    const x = i % length;
    const y = (i / length) | 0;
    return { x, y };
  }

  tag({ x, y, match, res = [] }) {
    const grid = this.grid;
    const i = this.coordsToIndex({ x, y });

    if (i === -1) return;

    if (grid[i] === match && !res.includes(i)) {
      res.push(i);

      this.tag({ res, match, x: x - 1, y }); // left
      this.tag({ res, match, x: x + 1, y }); // right
      this.tag({ res, match, x: x, y: y - 1 }); // up
      this.tag({ res, match, x: x, y: y + 1 }); // down
    }

    return res;
  }

  constructor(seed) {
    this.init(seed);
  }
}

function toBytes(str) {
  const b = Buffer.from(str, 'base64');
  const res = Uint8Array.from(b);

  return res;
}

function load(input) {
  let score = 0;

  if (typeof input === 'string') {
    source = Uint8Array.from(
      input.split(' ').map((_) => parseInt(`0x${_}`, 16))
    ).buffer;
  } else {
    source = input.buffer;
  }

  const view = new DataView(source);
  const raw = new Uint8Array(source);

  const seed = view.getUint16(0, true);
  const length = view.getUint16(2, true);
  const data = new Uint8Array(view.buffer.slice(4, 4 + length));
  const name = new TextDecoder().decode(
    new Uint8Array(view.buffer.slice(4 + length, 4 + length + 3))
  );

  const m = new Game(seed);

  for (let i = 0; i < data.length; i++) {
    score += m.clear(data[i]);
  }

  return {
    name,
    level: m.level,
    seed,
    score,
    hex: `0x${seed.toString(16).padStart(4, '0').toUpperCase()}`,
  };
}

function encodeScores(scores) {
  const res = new Uint8Array(scores.length * highScoreSize);
  const view = new DataView(res.buffer);
  let i = 0;
  scores.forEach(({ name, seed, score, level }, i) => {
    res.set(new TextEncoder().encode(name), i * highScoreSize);
    view.setUint8(i * highScoreSize + 3, level, true);
    view.setUint16(i * highScoreSize + 4, seed, true);
    view.setUint16(i * highScoreSize + 6, score, true);
  });

  return res;
}

function test(base64) {
  const input = toBytes(base64);
  const last = load(input);
  return last;
}

function calculateHighScoreTable(base64Input, base64Previous) {
  const input = toBytes(base64Input);
  const previous = toBytes(base64Previous || '');

  // first validate and generate score
  const last = load(input);

  // then parse previous for high scores and insert to new position
  const view = new DataView(previous.buffer);
  let i = 0;
  let applied = -1;
  let scores = [];

  // goes from highest score to lowest
  while (i < view.byteLength) {
    const name = new TextDecoder().decode(view.buffer.slice(i, i + 3));
    const level = view.getUint8(i + 3, true);
    const seed = view.getUint16(i + 4, true);
    const score = view.getUint16(i + 6, true);

    if (applied === -1 && last.score > score) {
      scores.push(last);
      applied = i / highScoreSize;
    }

    scores.push({ name, seed, score, level });

    i += highScoreSize;
  }

  if (applied === -1) {
    scores.push(last);
  } else {
    // search for and remove _other_ entries for the same name
    scores = scores.filter((entry, i) => {
      if (i === applied) {
        return true;
      }

      if (entry.name !== last.name) {
        return true;
      }

      return false;
    });
  }

  return scores.slice(0, 50);
}

let cachedScores = null;

exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    if (cachedScores) {
      return { statusCode: 200, body: cachedScores, isBase64Encoded: true };
    }
    const { status, data } = await axios.get('http://data.remysharp.com/6');
    return { statusCode: status, body: data, isBase64Encoded: true };
  }

  // When the method is POST, the name will no longer be in the event’s
  // queryStringParameters – it’ll be in the event body encoded as a query string
  const params = querystring.parse(event.body);
  console.log(JSON.stringify(event.body));

  let scores = null;
  try {
    scores = calculateHighScoreTable(params.data, params.previous);
  } catch (e) {
    return {
      statusCode: 400,
      body: e.message,
    };
  }

  const res = encodeScores(scores);

  console.log(Buffer.from(res).toString('base64'));

  return {
    statusCode: 200,
    body: Buffer.from(res).toString('base64'),
  };
};

// exports.handler({
//   httpMethod: 'POST',
//   body: 'data=WQs5ADUqSDkjI1MgH0FJXVBQXFw8SFtRUVFcXVxLSV5dXVJcWyw/TFVBRz41OTpPTlhNIDw9MzQ/XF9eXEFWIA%3D%3D&previous=UkVNBgTlLhVSRU0FBOXWD1hYWAOZmfwJSlVMA9OBPAhSRU0DUPMKCEFWIAJZC3oHQVYgAk1zMgdkUkUCBOXyBmRhMgJ0W8AGQVYgAgTlvgZSRU0CmZmgBmFkZQIMK/AFZG9nAsmCuAVSRU4CBOVCBUFWIAEE5YIEY2xvAdZP/gJKVUwB/SpsAmRhbgEFoVwCa2t/AX8VXAJEUkUBBOVUAjIyMgEdHy4CSklNAdZPDgJyZW0BSr/8AURBRAHiXvYBSkVFAeCK9gFqYW0BERH0ATQ4NAEHAOQBcmVtAdZP4AFhYWEBRpLaAVNBTQEbFdQBMTExARvmygFyZW0BGxXCAXM3cwFXV2YBAAAAAS0/IAAAAAABLT8gAA%3D%3D',
// }); // ?
