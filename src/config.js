export const NUM = 3;
export const ROWS = 30;
export const COLS = 30;
const height = typeof window !== 'undefined' ? window.innerHeight : 100;

export const BRICK_SIZE = ((height / ROWS) * 0.8) | 0;

console.log({ NUM, ROWS, COLS, BRICK_SIZE });
