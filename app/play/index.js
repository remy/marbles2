import * as memory from './memory.js';
import { COLS, ROWS, BRICK_SIZE } from './config.js';
import { Screen } from './screen.js';
import Marbles, { EMPTY } from './Marbles.js';

const $ = (s) => document.querySelector(s);

function getData(url) {
  return fetch(url).then((res) => res.arrayBuffer());
}

function asHex(n) {
  return n.toString(16).padStart(4, '0');
}

class Game {
  tick() {
    if (this.frames.length) {
      const frame = this.frames.shift();
      if (typeof frame === 'function') {
        frame();
      } else {
        this.render(frame);
      }
    }
    requestAnimationFrame(() => this.tick());
  }

  state = new Proxy(
    {
      score: 0,
      seed: 0,
      cleared: 0,
      remain: 100,
      level: 1,
      best: 0,
      moves: 0,
    },
    {
      set(target, prop, value) {
        target[prop] = value;

        let val = value;

        if (prop === 'seed') {
          val =
            '#' + parseInt(val, 10).toString(16).padStart(4, '0').toLowerCase();
        }

        $(`#play aside p.${prop} span`).textContent = val;
        return true;
      },
    }
  );

  /**
   * @param {object} options
   * @param {Screen} options.screen
   */
  constructor({ screen, seed = 0 }) {
    this.frames = [];
    this.screen = screen;
    screen.ctx.canvas.addEventListener('click', (e) => this.handleClick(e));

    document.body.addEventListener('keydown', (e) => {
      if (e.key === 'u') {
        this.undo();
      }
    });

    $('#undo').addEventListener('click', () => this.undo());

    this.scale = 3;
    this.initialState(seed);
    let last = '';

    this.loadAssets().then(() => {
      this.frames.push(this.marbles.grid);
      this.tick();
    });

    this.marbles.levelUp = () => {
      this.state.level++;
      this.snapshots = [];
    };

    // this.marbles.grid.trigger = ({ index, oldValue, newValue }) => {
    //   const current = this.marbles.grid.join(',');
    //   if (last !== current) {
    //     this.frames.push(() => {
    //       const { x, y } = this.marbles.indexToCoords({ i: index });
    //       if (newValue === EMPTY) {
    //         console.log('empty', x, y);
    //         this.screen.clearSprite(x, y);
    //       } else {
    //         this.screen.drawSprite(newValue + 30, x, y);
    //       }
    //     });
    //     last = current;
    //   }
    // };
  }

  undo() {
    if (this.snapshots.length === 0) {
      return;
    }

    this.plot.pop();
    const { grid, score, remain, cleared } = this.snapshots.pop();
    this.marbles.grid = grid;
    this.frames.push(grid);
    this.state.score = score;
    this.state.remain = remain;
    this.state.cleared = cleared;
    this.state.moves = this.plot.length;
  }

  /**
   *
   * @param {Event} e
   */
  handleClick(e) {
    if (!this.marbles.canMove()) {
      return;
    }
    const { offsetX, offsetY } = e;
    const scale = this.screen.ctx.canvas.scrollWidth / 10; // 16 * this.scale;

    const x = (offsetX / scale) | 0;
    const y = (offsetY / scale) | 0;
    console.log({ offsetX, x, offsetY, y, scale });
    const index = this.marbles.coordsToIndex({ x, y });
    this.snapshots.push({
      grid: Array.from(this.marbles.grid),
      score: this.state.score,
      remain: this.state.remain,
      cleared: this.state.cleared,
    });
    try {
      this.state.score += this.marbles.clear(index);
    } catch (e) {
      this.snapshots.pop(); // discard
      return;
    }
    this.plot.push(index);
    this.state.moves = this.plot.length;
    this.state.remain = this.marbles.remain;
    this.state.cleared = this.marbles.cleared;
    this.state.level = this.marbles.level;
    this.render();

    if (!this.marbles.canMove()) {
      document.body.classList.toggle('playing');
      document.body.classList.toggle('gameover');
    }
  }

  initialState(seed = 0) {
    this.running = false;
    this.plot = [];
    this.snapshots = [];
    this.state.score = 0;
    this.state.level = 1;
    this.state.moves = 0;
    this.state.cleared = 0;
    this.state.remain = 100;
    this.seed = seed;
    window.history.replaceState(null, null, '/play?seed=' + asHex(seed));
    this.marbles = new Marbles(seed);
    this.state.seed = this.seed;
    $('.restart').href = '/play?seed=' + asHex(this.state.seed);
    document.body.classList.add('playing');
    document.body.classList.remove('gameover');
  }

  restart() {
    this.initialState(this.seed);
  }

  newGame(seed) {
    this.state.level = 1;
    this.initialState(seed);
  }

  async loadAssets() {
    const [spr, pal] = await Promise.all([
      getData('./marbles.spr'),
      getData('./marbles.pal'),
    ]);
    this.screen.setPal(pal);
    this.screen.setSprites(spr);
    this.screen.setCursor(63);
  }

  render(grid = this.marbles.grid) {
    // console.log('render');
    const length = grid.length;
    this.screen.startDraw();
    const theme = 30;
    for (let i = 0; i < length; i++) {
      const index = grid[i];
      const { x, y } = this.marbles.indexToCoords({ i });
      this.screen.drawSprite(index + 30, x, y);
    }
    this.screen.endDraw();
  }
}

function main() {
  let seed = new URLSearchParams(location.search).get('seed');
  if (seed) {
    seed = parseInt(seed, 16);
  } else {
    seed = (1 + Math.random() * 0xfffe) | 0;
  }
  const game = new Game({
    screen: new Screen(),
    seed,
  });
  window.game = game;
}

main();
