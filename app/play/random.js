let seed = 1; //(new Date().getTime() / 1000) | 0; // ditch the milliseconds

export const setSeed = s => (seed = s);

// not to self: I cannot for the life of me remember where I got this algo
// but it produces a very nice distribution of random numbers.
export default function random() {
  const T16 = 0x10000;
  const T32 = T16 * T16;
  const cons = 0x0808;
  const tan = 0x8405; // cons*T16 + tan = 134775813
  const X = ((seed * cons) % T16) * T16 + seed * tan + 1; // Exact 32=bit arithmetic
  return (seed = X % T32) / T32;
}
