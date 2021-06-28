export const NUM = 4;
export const ROWS = 10;
export const COLS = 10;
const height = typeof window !== 'undefined' ? window.innerHeight : 100;

export const BRICK_SIZE = ((height / ROWS) * 0.8) | 0;

console.log({ NUM, ROWS, COLS, BRICK_SIZE });
