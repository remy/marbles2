const ctx = document.querySelector('#grid').getContext('2d', { alpha: false });
const ctxText = document
  .querySelector('#text')
  .getContext('2d', { alpha: true });
const size = 16;
const marbleCount = 4;
const length = 10;
const grid = Array.from({ length: length * length });

const scale = ctx.canvas.offsetWidth / 160;

const marbles = [];
const EMPTY = 16;
const MASK = 32;
const gameState = {
  blocked: false,
  running: false,
  score: 0,
  level: 0,
  tagged: [],
  seed: '00000001',
};
let last = null;
ctxText.canvas.width = ctxText.canvas.height = ctx.canvas.width = ctx.canvas.height = 160;
ctxText.imageSmoothingEnabled = false;
ctx.imageSmoothingEnabled = false;
ctx.fillStyle = '#7b8b5c';
ctx.fillRect(0, 0, 160, 160);

function hexToSeed(hex) {
  // UInt32 i, j;
  const i = 0;
  const j = 1;
  const ptr = new Uint32Array(2);
  ptr[j] = 0;
  hex = hex.split('');
  while (hex.length) {
    ptr[j] <<= 4;
    ptr[i] = parseInt('0x' + hex.shift(), 16);
    ptr[j] |= ptr[i] & 95;
  }
  return ptr[j];
}

const multiplier = 22695477;
let gameSeed = hexToSeed(gameState.seed);
let seed = Uint16Array.of(gameSeed);
function random() {
  let xs = Uint16Array.of(seed[0]);

  xs[0] ^= xs[0] << 7;
  xs[0] ^= xs[0] >> 9;
  xs[0] ^= xs[0] << 8;

  seed = Uint16Array.of(xs[0]);

  return 1 << (xs[0] & 3);
}

function randomMarble() {
  const r = random();
  const blocks = { 1: 0, 2: 1, 4: 2, 8: 3 };

  return blocks[r];
}

function genMarble(name) {
  const img = document.querySelector('#' + name);
  const ctx = document
    .createElement('canvas')
    .getContext('2d', { antialias: false });
  ctx.canvas.width = ctx.canvas.height = size;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 1, 1);
  return ctx;
}

function mask({ x, y, i = null }) {
  if (i === null) i = coordsToIndex({ x, y });

  if (i === -1) return;

  grid[i] ^= MASK; // bit flip

  draw({ x, y });
}

function getCoords(event) {
  const x = ((event.offsetX / event.target.offsetHeight) * 10) | 0;
  const y = ((event.offsetY / event.target.offsetWidth) * 10) | 0;

  return { x, y };
}

function log(args) {
  document.querySelector('pre').innerHTML = args;
}

function coordsToIndex({ x, y }) {
  const index = y * length + x;

  const edge = length - 1;

  if (x < 0 || x > edge) return -1;
  if (y < 0 || y > edge) return -1;

  return index;
}

function indexToCoords({ i }) {
  const x = i % length;
  const y = (i / length) | 0;
  return { x, y };
}

function handleClick(event) {
  if (gameState.blocked) return;

  let { x, y } = getCoords(event);

  const i = coordsToIndex({ x, y });
  const match = grid[i];

  if (gameState.tagged.length && !gameState.tagged.includes(i)) {
    // un-tag
    toggleTaggedTo(MASK, true);
  }

  gameState.blocked = true;
  if (match & MASK) {
    gameState.score += gameState.tagged.length * (5 + gameState.tagged.length);
    toggleTaggedTo(EMPTY, true);
    fall();
  } else {
    gameState.tagged = tag({ x, y, match, expect: 0, bit: MASK });
    // count tagged
    if (gameState.tagged.length <= 1) {
      gameState.tagged = [];
    } else {
      toggleTaggedTo(MASK);
      frame(
        'Possible: ' + gameState.tagged.length * (5 + gameState.tagged.length)
      );
    }
  }

  gameState.blocked = false;

  log({
    // tagged: gameState.tagged.length,
    potential: gameState.tagged.length * (5 + gameState.tagged.length),
    score: gameState.score,
    canMove: canMove(),
  });

  log('Possible: ' + gameState.tagged.length * (5 + gameState.tagged.length));
}

const sleep = (n) => new Promise((resolve) => setTimeout(resolve, n));

function hasWon() {
  return !!(grid[coordsToIndex({ x: 0, y: length - 1 })] & EMPTY);
}

// ctxText.translate(0.5, 0.5);
function frame(text) {
  return;
  ctxText.clearRect(0, 0, 160, 160);
  ctxText.font = '16px "palm-os"';
  const width = ctxText.measureText(text).width;
  const x = ctxText.canvas.width - (width + 10);
  const y = 24;
  ctxText.fillStyle = '#7b8b5c';
  ctxText.fillRect(x - 2, y - 11, width + 2, 14);
  ctxText.strokeStyle = ctxText.fillStyle = '#000';
  ctxText.fillText(text, x, y);
  ctxText.beginPath();
  ctxText.moveTo(x - 2, 0.5 + y - 11);
  ctxText.lineTo(x + width, 0.5 + y - 11);
  ctxText.moveTo(x - 2, 0.5 + y - 11 + 14);
  ctxText.lineTo(x + width + 1, 0.5 + y - 11 + 14);

  ctxText.moveTo(x - 2, 0.5 + y - 10);
  ctxText.lineTo(x - 2, 0.5 + y - 11 + 14);
  ctxText.closePath();
  ctxText.stroke();
}

function canMove() {
  if (hasWon()) return false;

  const edge = length - 1;

  for (let x = 0; x < length; x++) {
    for (let y = edge; y >= 0; y--) {
      let i = coordsToIndex({ x, y });
      const test = grid[i];

      if (test & EMPTY) {
        continue;
      }

      if (test === grid[coordsToIndex({ x: x - 1, y })]) {
        return true;
      }
      if (test === grid[coordsToIndex({ x: x + 1, y })]) {
        return true;
      }
      if (test === grid[coordsToIndex({ x: x, y: y - 1 })]) {
        return true;
      }
      if (test === grid[coordsToIndex({ x: x, y: y + 1 })]) {
        return true;
      }
    }
  }

  return false;
}

function toggleTaggedTo(bit, clear = false) {
  gameState.tagged.forEach((i) => {
    toggle({ i, bit });
  });

  if (clear) {
    gameState.tagged = [];
  }
}

async function fall() {
  const edge = length - 1;
  for (var x = 0; x < length; x++) {
    for (var y = edge; y >= 0; y--) {
      let i = coordsToIndex({ x, y });
      if (grid[i] & EMPTY) {
        if (await clearColumn({ x, y, i })) {
          y++; // go back and check the starting block
        }
      }
    }
  }

  // now go through the columns, and if there's any that stand empty, we need
  // to shift the entire column to the left
  for (var x = 0; x < length; x++) {
    let i = coordsToIndex({ x, y: edge });
    if (grid[i] & EMPTY) {
      if (await shiftColumn({ x, y: edge, i, speed: 10 })) {
        x -= 2; // go back and check the starting block
      }
    }
  }
}

async function shiftColumn({ x, y, i, speed }) {
  const edge = length - 1;
  const coords = { x, y };
  let swapped = false;

  do {
    i = coordsToIndex(coords);
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
    draw(indexToCoords({ i }));
    draw(indexToCoords({ i: target }));
    await sleep(speed); // creates semblance of animation
  } while (true);

  return swapped;
}

async function clearColumn({ i, x, y, speed = 10 }) {
  let swapped = false;
  const coords = { x, y };
  do {
    coords.y--;
    const target = coordsToIndex(coords);

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
    draw(indexToCoords({ i }));
    draw(indexToCoords({ i: target }));
    await sleep(speed); // creates semblance of animation
    i = target;
  } while (true);

  return swapped;
}

function toggle({ i, bit }) {
  grid[i] ^= bit;
  const { x, y } = indexToCoords({ i });
  draw({ x, y });
}

function tag({ x, y, match, res = [] }) {
  const i = coordsToIndex({ x, y });
  if (!i) return;

  if (grid[i] === match && !res.includes(i)) {
    res.push(i);

    tag({ res, match, x: x - 1, y }); // left
    tag({ res, match, x: x + 1, y }); // right
    tag({ res, match, x: x, y: y - 1 }); // up
    tag({ res, match, x: x, y: y + 1 }); // down
  }

  return res;
}

function draw({ x, y }) {
  const i = coordsToIndex({ x, y });
  const state = grid[i];
  if (state & EMPTY) {
    ctx.drawImage(marbles[EMPTY].canvas, x * size, y * size);
  } else {
    const marble = state & 0x0f;
    ctx.drawImage(marbles[marble].canvas, x * size, y * size);

    if (state & MASK) {
      ctx.drawImage(marbles[MASK].canvas, x * size, y * size);
    }
  }
}

function drawGrid() {
  for (var x = 0; x < length; x++) {
    for (var y = 0; y < length; y++) {
      draw({ x, y });
    }
  }
}

function newGame() {
  gameState.running = true;
  gameState.score = 0;
  gameState.tagged = [];
  gameState.level = 1;

  for (var i = 0; i < grid.length; i++) {
    grid[i] = 1 << randomMarble();
  }

  drawGrid();
}

function main() {
  const query = new URLSearchParams(location.search);
  let s = query.get('seed');
  if (s) {
    if (s.startsWith('$')) {
      s = s.substr(1);
    } else {
      s = parseInt(s, 10).toString(16);
    }
    gameState.seed = s;
    gameSeed = hexToSeed(gameState.seed);
    seed = Uint16Array.of(gameSeed);
  }

  Object.assign(marbles, {
    1: genMarble('one'),
    2: genMarble('two'),
    4: genMarble('three'),
    8: genMarble('four'),
    [EMPTY]: genMarble('empty'),
    [MASK]: genMarble('mask'),
  });

  ctx.canvas.onmousedown = handleClick;

  newGame();
}
window.onload = () => frame('Possible: 329');

// window.onload = main;
main();

// navigator.serviceWorker.register('sw.js');
