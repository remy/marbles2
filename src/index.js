// import Vue from './vendor/vue.js';
import * as memory from './memory.js';
import { COLS, ROWS, BRICK_SIZE } from './config.js';
import { types } from './Marble.js';

const game = {
  memory
};

const $ = s => document.querySelector(s);

function initialState() {
  return {
    running: false,
    level: 0,
    score: 0,
    seed: 'abcde'
  };
}

function reset() {
  const state = initialState();
  Object.entries(state).forEach(([key, value]) => {
    game[key] = value;
  });
}

function render() {
  for (let i = 0; i < ROWS * COLS; i++) {
    const index = memory.get(i);
    const marble = types[index];

    const { x, y } = memory.getXYForIndex(i);

    game.ctx.drawImage(marble.image, x * BRICK_SIZE, y * BRICK_SIZE);
  }
}

function newGame() {
  memory.initialise();
}

function main() {
  const canvas = document.createElement('canvas');
  canvas.width = ROWS * BRICK_SIZE;
  canvas.height = COLS * BRICK_SIZE;
  canvas.id = 'canvas';

  game.ctx = canvas.getContext('2d');
  $('#app').appendChild(canvas);

  reset();
  newGame();
  render();
}

window.game = game;

main();
