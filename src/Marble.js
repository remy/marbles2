import random from './random.js';
import { NUM, BRICK_SIZE } from './config.js';

const styles = {
  0: 'white',
  1: '#000',
  2: '#666',
  3: '#999',
};

export default class Marble {
  constructor(type = (random() * NUM) | 0) {
    this.type = type;
    this.image = document.createElement('canvas');
    const ctx = this.image.getContext('2d');
    this.image.width = this.image.height = BRICK_SIZE;
    ctx.fillStyle = styles[type];
    ctx.fillRect(0, 0, BRICK_SIZE, BRICK_SIZE);
  }

  toString() {
    return this.type;
  }
}

export const types = Array.from({ length: NUM + 1 }, (_, i) => new Marble(i));
