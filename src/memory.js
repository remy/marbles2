import { ROWS, COLS, NUM } from './config.js';
import random from './random.js';

export const memory = new Uint8Array(ROWS * COLS);
export const pages = [Uint8Array.from(memory)];

export const loadMemory = test => {
  reset();
  const lines = test.split('\n');
  let ctr = memory.length - 1;
  for (let i = lines.length - 1; i >= 0; i--) {
    for (let k = lines[i].length - 1; k >= 0; k--) {
      const chr = lines[i][k];
      if (chr !== '0') {
        memory[ctr] = chr.charCodeAt(0);
      } else {
        memory[ctr] = 0;
      }
      ctr--;
    }
  }

  pages.push(Uint8Array.from(memory));
  // console.log(toString());
};

export const set = (index, value) => (memory[index] = value);
export const get = index => memory[index];

export const copyToPage = () => pages.push(Uint8Array.from(memory));

export const initialise = () => {
  for (let i = 0; i < ROWS * COLS; i++) {
    memory[i] = ((random() * NUM) | 0) + 1;
  }

  copyToPage();
};

export const reset = () => {
  pages.length = 0;
  memory.fill(0);
};

export const forEach = cb => memory.forEach(cb);

export const getIndexForXY = (x, y, width = COLS) => {
  if (x < 0) {
    throw new Error(`out of bounds: x(${x}) < 0`);
  }

  if (x >= COLS) {
    throw new Error(`out of bounds: x(${x}) > COLS(${COLS})`);
  }

  if (y < 0) {
    throw new Error(`out of bounds: y(${y}) < 0`);
  }

  if (y >= ROWS) {
    throw new Error(`out of bounds: y(${y}) > ROWS(${ROWS})`);
  }

  return width * y + x;
};

export const getXYForIndex = i => {
  const x = i % COLS;
  const y = (i / COLS) | 0;

  return { x, y };
};

export const toString = (source = memory) =>
  source
    .reduce((acc, curr, i) => {
      const { y } = getXYForIndex(i);
      if (!acc[y]) acc[y] = '';
      acc[y] += curr;
      return acc;
    }, [])
    .join('\n');

export const write = tet => {
  const {
    x,
    y,
    w,
    h,
    shape,
    type: { char }
  } = tet;

  // ordering is important so we can jump straight to the shape value
  let ctr = 0;
  for (let k = y; k < y + h; k++) {
    for (let j = x; j < x + w; j++) {
      if (shape[ctr]) {
        let i = getIndexForXY(j, k);
        memory[i] = char.charCodeAt(0); // (ignored for now)
      }
      ctr++;
    }
  }

  pages.push(Uint8Array.from(memory));

  //   document.querySelector('#memdump').innerHTML = toString().replace(/0/g, '🔲').replace(/1/g, '🔳')
};

export const test = tet => {
  const { x, y, w, h, shape } = tet;

  const res = new Uint8Array(shape.length);
  let hit = false;
  // ordering is important so we can jump straight to the shape value
  let ctr = 0;
  for (let k = y; k < y + h; k++) {
    for (let j = x; j < x + w; j++) {
      if (shape[ctr]) {
        let i = getIndexForXY(j, k);
        res[ctr] = memory[i];
        if (shape[ctr] && memory[i]) {
          hit = true;
        }
      }
      ctr++;
    }
  }

  return { hit, res };
};

export const isFree = tet => {
  try {
    return !test(tet).hit;
  } catch (E) {
    // console.log(E);
    return false;
  }
};
