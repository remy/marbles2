import Game from './play/Marbles.js';

const $ = (s) => document.querySelector(s);

const $result = $('#result');

$('button').addEventListener('click', () => {
  test($('textarea').value.trim());
});

$('textarea').addEventListener('input', (e) => {
  /** @type string */
  const value = e.target.value;
  test(value);
});

async function test(value) {
  let raw = null;
  try {
    raw = Uint8Array.from(
      atob(value)
        .split('')
        .map((_) => _.charCodeAt(0))
    );
  } catch (e) {
    return;
  }

  const view = new DataView(raw.buffer);

  const seed = view.getUint16(0, true);
  const length = view.getUint16(2, true);
  const data = new Uint8Array(view.buffer.slice(4, 4 + length));
  const name = new TextDecoder().decode(
    new Uint8Array(view.buffer.slice(4 + length, 4 + length + 3))
  );

  const m = new Game(seed);
  let snapshots = [];

  m.levelUp = () => {
    snapshots = [];
  };

  let score = 0;

  for (let i = 0; i < data.length; i++) {
    if (data[i] === 255) {
      // undo
      if (snapshots.length) {
        const { grid, delta } = snapshots.pop();
        m.grid = grid;

        const reset = delta + 25 * m.level;
        if (score < reset) {
          score = 0;
        } else {
          score = score - reset;
        }
      }
    } else {
      snapshots.push({
        grid: Array.from(m.grid),
        score,
        cleared: m.cleared,
      });
      const delta = await m.clear(data[i]);

      // snapshots is empty if it did a level up
      if (snapshots.length) {
        snapshots[snapshots.length - 1].delta = delta;
      }
      score += delta;
    }
  }

  const result = {
    name,
    level: m.level,
    seed,
    score,
    hex: `#${seed.toString(16).padStart(4, '0').toUpperCase()}`,
  };

  $result.innerHTML = `Name:  ${result.name}
Score: ${result.score}
Seed:  ${result.hex}
Level: ${result.level}`;
}
