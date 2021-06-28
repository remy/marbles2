import random from './random.js';
import { NUM, BRICK_SIZE } from './config.js';

/**
 * @typedef RGBA
 * @property {number} r 0-255
 * @property {number} g 0-255
 * @property {number} b 0-255
 * @property {number} a 255 - typically defaulted as our values don't have semi-opaque
 */

export class Screen {
  constructor(width, height) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.canvas.width = 16 * 10;
    ctx.canvas.height = 16 * 10;
    ctx.canvas.id = 'canvas';
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
    document.querySelector('#app').appendChild(this.ctx.canvas);
    this.data = {};
  }

  startDraw() {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    try {
      // this.ctx.canvas.parentElement.remove(this.ctx.canvas);
    } catch (e) {}
  }

  endDraw() {
    document.querySelector('#app').appendChild(this.ctx.canvas);
  }

  clearSprite(x, y) {
    this.ctx.clearRect(x * 16, y * 16, 16, 16);
  }

  drawSprite(id, x, y) {
    this.ctx.drawImage(this.sprites[id], x * 16, y * 16);
  }

  setCursor(id) {
    const cursor = this.sprites[id];
    const ctx = document.createElement('canvas').getContext('2d');
    const scale = 16 * 3;
    ctx.canvas.width = scale;
    ctx.canvas.height = scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cursor, 0, 0, scale, scale);
    const url = ctx.canvas.toDataURL('image/png', 1);
    document.documentElement.style.cursor = `url(${url}) 3 3, auto`;
  }

  /**
   * @param {ArrayBuffer} data
   */
  setPal(data) {
    this.pal = Array.from(new Uint16Array(data), nextLEShortToP).map(
      rgbFromNext
    );
  }

  setSprites(data) {
    this.sprites = rawToSprites(new Uint8Array(data), this.pal);
  }
}

/**
 *
 * @param {Uint8Array} data
 * @param {RGBA[]} pal
 */
function rawToSprites(data, pal) {
  const length = data.length / 256;

  const sprites = [];

  for (let i = 0; i < length; i++) {
    const base = i * 256;
    const bytes = data.slice(base, base + 256);
    sprites.push(makeSprite(bytes, pal));
  }

  return sprites;
}

/**
 *
 * @param {Uint8Array} data
 * @param {RGBA[]} pal
 */
function makeSprite(data, pal) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = 16;
  ctx.canvas.height = 16;
  ctx.imageSmoothingEnabled = false;

  const imageData = new ImageData(16, 16);

  for (let index = 0; index < data.length; index++) {
    const i = data[index];
    const { r, g, b, a } = pal[i];
    imageData.data.set([r, g, b, a], index * 4);
  }

  ctx.putImageData(imageData, 0, 0);
  return ctx.canvas;
}

/**
 * Reads a 9bit value from the Spectrum Next palette and converts to RGB
 *
 * @param {number} value
 * @returns {RGBA} rgba
 */
export function rgbFromNext(value) {
  const r = (value >> 6) & 0x7;
  const g = (value >> 3) & 0x7;
  const b = value & 0x7;

  if (value === 0x1c6) {
    return {
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    };
  }

  return {
    r: Math.round((r * 255) / 7),
    g: Math.round((g * 255) / 7),
    b: Math.round((b * 255) / 7),
    a: 255,
  };
}

/**
 * Converts Spectrum Next little endian value to a 16bit/short colour value
 *
 * @param {number} value little endian 16 bit value
 * @returns {number} 16bit colour value (not an index value)
 */
export function nextLEShortToP(value) {
  return ((value & 0xff) << 1) + ((value >> 8) & 0x7f);
}
