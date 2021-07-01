export const EMPTY = 16;
const length = 10;
const MULTIPLIER = 1;
const LEVEL_UP_BONUS = 250;
const highScoreSize = 8;

class EventArray extends Array {
  constructor() {
    super();

    // allow setting any node property via proxy
    return new Proxy(this, {
      get(obj, prop) {
        return obj[prop];
      },

      set(obj, prop, value) {
        if (Number.isInteger(parseInt(prop, 10)) && obj[prop] !== undefined) {
          // trigger a setter
          obj.trigger({ index: prop, oldValue: obj[prop], newValue: value });
        }

        obj[prop] = value;
        return true;
      },
    });
  }

  trigger(index) {}
}

export default class Marbles {
  grid = []; //new EventArray();
  seed = Uint16Array.of(1);
  level = 1;

  toggleTaggedTo(tagged, bit, clear = false) {
    tagged.forEach((i) => {
      this.grid[i] ^= bit;
    });
  }

  async clearColumn({ i, x, y, speed = 10, render }) {
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
      render();
      await this.wait(speed);
    } while (true);

    return swapped;
  }

  log() {
    let s = '';
    const values = {
      0: '&',
      1: '@',
      2: '#',
      3: 'O',
      16: ' ',
    };
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const value = this.grid[this.coordsToIndex({ x, y })];
        s += values[value];
      }
      s += '\n';
    }
    console.log(
      '%c' + s,
      'font-family: monospace; white-space: pre; font-size: 24px;'
    );
    return undefined;
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

  async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async fall(render) {
    const grid = this.grid;
    const edge = length - 1;
    for (var x = 0; x < length; x++) {
      for (var y = edge; y >= 0; y--) {
        let i = this.coordsToIndex({ x, y });
        if (grid[i] & EMPTY) {
          if (await this.clearColumn({ x, y, i, render })) {
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

  canMove() {
    const length = 10;
    const edge = length - 1;
    const grid = this.grid;

    for (let x = 0; x < length; x++) {
      for (let y = edge; y >= 0; y--) {
        let i = this.coordsToIndex({ x, y });
        const test = grid[i];

        if (test & EMPTY) {
          continue;
        }

        if (test === grid[this.coordsToIndex({ x: x - 1, y })]) {
          return true;
        }
        if (test === grid[this.coordsToIndex({ x: x + 1, y })]) {
          return true;
        }
        if (test === grid[this.coordsToIndex({ x: x, y: y - 1 })]) {
          return true;
        }
        if (test === grid[this.coordsToIndex({ x: x, y: y + 1 })]) {
          return true;
        }
      }
    }

    return false;
  }

  async clear(i, render) {
    const grid = this.grid;
    const match = grid[i];

    if (match === EMPTY) throw new Error('empty select');

    const { x, y } = this.indexToCoords({ i });
    const tagged = this.tag({ x, y, match, expect: 0, bit: EMPTY });
    const total = tagged ? tagged.length : 0;

    if (total <= 1) {
      throw new Error('not enough matched');
    }

    this.toggleTaggedTo(tagged, EMPTY, true);
    await this.fall(render);

    grid.forEach((_, i) => {
      if (grid[i] & EMPTY) {
        grid[i] = EMPTY;
      }
    });

    const remain = grid.filter((_) => _ !== EMPTY).length;
    this.remain = remain;

    let score = total * (MULTIPLIER + total);
    this.cleared = total;

    if (remain === 0) {
      this.init();
      // level up bonus
      this.level++;
      score += LEVEL_UP_BONUS;
      if (this.levelUp) this.levelUp();
    }

    return score;
  }

  rnd() {
    let xs = Uint16Array.of(this.seed[0]);

    xs[0] ^= xs[0] << 7;
    xs[0] ^= xs[0] >> 9;
    xs[0] ^= xs[0] << 8;

    this.seed = Uint16Array.of(xs[0]);

    return xs[0] & 3;
  }

  getSeed() {
    return this.seed[0];
  }

  init(s = 0) {
    this.remain = 100;
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
