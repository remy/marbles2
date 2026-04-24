/**
 * gb-marbles .sav validator (port of tools/validate_save.py).
 *
 * Re-simulates each high-score run from its stored seed (or from a
 * checkpoint snapshot for marathon runs) and checks the replayed final
 * score + level against the saved entry. A run PASSES iff they match.
 *
 * Used both client-side (from submit-highscore.html) and server-side
 * (from netlify/functions/submit-highscore.js) so the browser can give
 * instant feedback and the function independently verifies before
 * committing.
 *
 * Mirrors the on-device C code:
 *   - PRNG: xorshift-16 (src/grid.c)
 *   - Grid mechanics: src/grid.c
 *   - Scoring: src/game_actions.c  (n*n per clear)
 *   - Bonus / level: src/game_session.c  (+250 if bonus timer active)
 *   - Store pricing: src/store.h  (bomb tier 100/250/500, others 250/500/500)
 */

// ---- format constants (mirror src/save.c, src/replay.h) ----
export const SAVE_MAGIC = [0x4d, 0x42, 0x31]; // 'MB1'
export const SAVE_VERSION_V5 = 5;
export const SAVE_VERSION_V6 = 6;
export const HEADER_SIZE_V5 = 28;
export const HEADER_SIZE_V6 = 32;
export const REPLAY_MAX = 2048;
export const SNAPSHOT_SIZE_V5 = 89;
export const SNAPSHOT_SIZE_V6 = 91;

// Mode IDs match on-device + Python ('EASY' in the C source is branded 'FAST').
export const MODE_NORMAL = 0;
export const MODE_FAST = 1;

// ---- store pricing (mirror src/store.h) ----
export const COST_BOMB_1ST = 100;
export const COST_BOMB_2ND = 250;
export const COST_BOMB = 500;
export const COST_PAINT = 250;
export const COST_SHUFFLE = 500;
export const COST_UNDO = 500;
export const UNDO_MAX = 3;
export const UNDO_STACK_MAX = 20;

// ---- replay tokens (mirror src/replay.h) ----
export const RT_BOMB = 0x80;
export const RT_PAINT = 0x81;
export const RT_SHUFFLE = 0x82;
export const RT_UNDO = 0x83;
export const RT_BUY_BOMB = 0x84;
export const RT_BUY_PAINT = 0x85;
export const RT_BUY_SHUFFLE = 0x86;
export const RT_BUY_UNDO = 0x87;
export const RT_LEVEL_CLR = 0x88;
export const RT_CHECKPOINT = 0xfd;


// ============================================================================
// Xorshift-16 PRNG
// Matches grid.c rnd16(): seed^=<<7; seed^=>>9; seed^=<<8; (uint16)
// ============================================================================
export class Xorshift16 {
  constructor(seed) {
    this.seed = seed !== 0 ? seed & 0xffff : 1;
  }

  rnd16() {
    let s = this.seed;
    s ^= (s << 7) & 0xffff;
    s ^= s >> 9;
    s ^= (s << 8) & 0xffff;
    this.seed = s & 0xffff;
    return this.seed;
  }
}


// ============================================================================
// Game — replays moves and tracks state, score, level, inventory, undo stack.
// ============================================================================
export class Game {
  constructor(mode, seed) {
    this.mode = mode;
    if (mode === MODE_NORMAL) {
      this.cols = 10;
      this.rows = 8;
      this.numTypes = 4;
    } else {
      this.cols = 7;
      this.rows = 7;
      this.numTypes = 3;
    }
    this.rng = new Xorshift16(seed);
    this.grid = makeGrid(this.rows, this.cols);
    this.score = 0;
    this.level = 1;
    this.bombBuys = 0;
    this.undoRemaining = UNDO_MAX;
    this.invBomb = 0;
    this.invPaint = 0;
    this.invShuffle = 0;
    this.undoStack = [];
    this.randomize();
  }

  // ---- grid ops (mirror src/grid.c) ----
  randomize() {
    this.grid = makeGrid(this.rows, this.cols);
    if (this.numTypes === 4) {
      // NORMAL: Fisher-Yates over a bag of 80 (20 of each colour)
      const bag = new Array(80);
      for (let i = 0; i < 80; i++) bag[i] = Math.floor(i / 20) + 1;
      for (let i = 79; i > 0; i--) {
        const j = this.rng.rnd16() % (i + 1);
        const tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
      }
      let idx = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 10; c++) {
          this.grid[r][c] = bag[idx++];
        }
      }
    } else {
      // FAST (aka EASY in the C source): per-cell rnd() & 3 then % num_types + 1
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.grid[r][c] = ((this.rng.rnd16() & 3) % this.numTypes) + 1;
        }
      }
    }
  }

  shuffleAll() {
    // Always over rows*cols (NORMAL only — store unavailable in FAST)
    const total = this.rows * this.cols;
    const flat = new Array(total);
    let i = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) flat[i++] = this.grid[r][c];
    }
    for (let k = total - 1; k > 0; k--) {
      const j = this.rng.rnd16() % (k + 1);
      const tmp = flat[k]; flat[k] = flat[j]; flat[j] = tmp;
    }
    let idx = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) this.grid[r][c] = flat[idx++];
    }
  }

  flood(c, r) {
    const target = this.grid[r][c];
    if (target === 0) return [];
    const seen = makeGrid(this.rows, this.cols, false);
    const queue = [[c, r]];
    seen[r][c] = true;
    const cells = [];
    while (queue.length) {
      const [cc, rr] = queue.shift();
      cells.push([cc, rr]);
      for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nc = cc + dc, nr = rr + dr;
        if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
        if (!seen[nr][nc] && this.grid[nr][nc] === target) {
          seen[nr][nc] = true;
          queue.push([nc, nr]);
        }
      }
    }
    return cells;
  }

  removeCells(cells) {
    for (const [c, r] of cells) this.grid[r][c] = 0;
  }

  settle() {
    // Gravity to bottom
    let moved = true;
    while (moved) {
      moved = false;
      for (let c = 0; c < this.cols; c++) {
        for (let r = this.rows - 1; r > 0; r--) {
          if (this.grid[r][c] === 0 && this.grid[r - 1][c] !== 0) {
            this.grid[r][c] = this.grid[r - 1][c];
            this.grid[r - 1][c] = 0;
            moved = true;
          }
        }
      }
    }
    // Left-compact empty columns
    while (true) {
      let done = true;
      for (let c = 0; c < this.cols - 1; c++) {
        let colEmpty = true, nextEmpty = true;
        for (let r = 0; r < this.rows; r++) {
          if (this.grid[r][c] !== 0) colEmpty = false;
          if (this.grid[r][c + 1] !== 0) nextEmpty = false;
        }
        if (colEmpty && !nextEmpty) {
          for (let r = 0; r < this.rows; r++) {
            this.grid[r][c] = this.grid[r][c + 1];
            this.grid[r][c + 1] = 0;
          }
          done = false;
          break;
        }
      }
      if (done) break;
    }
  }

  isEmpty() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== 0) return false;
      }
    }
    return true;
  }

  // ---- undo ----
  pushUndo() {
    if (this.undoStack.length >= UNDO_STACK_MAX) this.undoStack.shift();
    // Deep-copy the grid so later mutations don't poison the stack entry.
    const snap = new Array(this.rows);
    for (let r = 0; r < this.rows; r++) snap[r] = this.grid[r].slice();
    this.undoStack.push({ grid: snap, score: this.score });
  }

  applyUndo() {
    if (!this.undoStack.length) throw new Error('UNDO with empty undo stack');
    if (this.undoRemaining === 0) throw new Error('UNDO without remaining credits');
    const s = this.undoStack.pop();
    this.grid = s.grid;
    this.score = s.score;
    this.undoRemaining -= 1;
  }

  // ---- checkpoint ----
  loadCheckpoint(blob, snapshotSize) {
    if (blob.length < snapshotSize) throw new Error('CHECKPOINT snapshot truncated');
    // 80 bytes of grid (always 8x10 row-major; FAST uses top-left 7x7)
    let idx = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 10; c++) {
        const v = blob[idx++];
        if (r < this.rows && c < this.cols) this.grid[r][c] = v;
      }
    }
    if (snapshotSize >= SNAPSHOT_SIZE_V6) {
      this.score = (blob[idx] | (blob[idx + 1] << 8) | (blob[idx + 2] << 16) | (blob[idx + 3] << 24)) >>> 0;
      idx += 4;
    } else {
      this.score = blob[idx] | (blob[idx + 1] << 8);
      idx += 2;
    }
    this.level = blob[idx++];
    idx++; // bonus (not tracked between moves)
    this.invBomb = blob[idx++];
    this.invPaint = blob[idx++];
    this.invShuffle = blob[idx++];
    this.bombBuys = blob[idx++];
    this.undoRemaining = blob[idx++];
    this.undoStack = [];
  }
}


// ============================================================================
// parseHeader — reads a save file buffer, validates magic + checksum,
// returns header info + both high-score entries.
// ============================================================================
export function parseHeader(buf) {
  if (buf.length < HEADER_SIZE_V5) throw new Error(`file too short (${buf.length} bytes)`);
  if (buf[0] !== SAVE_MAGIC[0] || buf[1] !== SAVE_MAGIC[1] || buf[2] !== SAVE_MAGIC[2]) {
    throw new Error(`bad magic: ${bytesAsHex(buf.slice(0, 3))}`);
  }
  const ver = buf[3];
  let hdrSize, chkOff;
  if (ver === SAVE_VERSION_V5) { hdrSize = HEADER_SIZE_V5; chkOff = 26; }
  else if (ver === SAVE_VERSION_V6) { hdrSize = HEADER_SIZE_V6; chkOff = 30; }
  else throw new Error(`unsupported save version: ${ver}`);

  let chk = 0;
  for (let i = 0; i < chkOff; i++) chk ^= buf[i];
  if (chk !== buf[chkOff]) {
    throw new Error(`checksum mismatch: stored=0x${buf[chkOff].toString(16).padStart(2, '0')} computed=0x${chk.toString(16).padStart(2, '0')}`);
  }

  let parseEntry;
  if (ver === SAVE_VERSION_V5) {
    parseEntry = (off) => ({
      score: buf[off] | (buf[off + 1] << 8),
      seed: buf[off + 2] | (buf[off + 3] << 8),
      initials: decodeInitials(buf, off + 4),
      level: buf[off + 7],
    });
    return {
      version: 5,
      headerSize: HEADER_SIZE_V5,
      normal: parseEntry(4),
      fast: parseEntry(12),
      lastSeed: buf[20] | (buf[21] << 8),
      lenNormal: buf[22] | (buf[23] << 8),
      lenFast: buf[24] | (buf[25] << 8),
    };
  } else {
    parseEntry = (off) => ({
      score: (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0,
      seed: buf[off + 4] | (buf[off + 5] << 8),
      initials: decodeInitials(buf, off + 6),
      level: buf[off + 9],
    });
    return {
      version: 6,
      headerSize: HEADER_SIZE_V6,
      normal: parseEntry(4),
      fast: parseEntry(14),
      lastSeed: buf[24] | (buf[25] << 8),
      lenNormal: buf[26] | (buf[27] << 8),
      lenFast: buf[28] | (buf[29] << 8),
    };
  }
}


// ============================================================================
// replay — runs the token stream against a fresh Game and returns
// { game, issues, resumedFromCheckpoint, finalScore }.
// Throws on malformed tokens / illegal moves.
// ============================================================================
export function replay(mode, entry, data, snapshotSize = SNAPSHOT_SIZE_V6) {
  const g = new Game(mode, entry.seed);
  let resumedFromCheckpoint = false;

  let i = 0;
  if (i < data.length && data[i] === RT_CHECKPOINT) {
    i += 1;
    g.loadCheckpoint(data.slice(i, i + snapshotSize), snapshotSize);
    i += snapshotSize;
    resumedFromCheckpoint = true;
  }

  while (i < data.length) {
    const t = data[i++];

    if (t < 80) {
      // Plain clear at encoded cell index: c = t % 10, r = floor(t / 10).
      const c = t % 10, r = Math.floor(t / 10);
      const cells = g.flood(c, r);
      if (cells.length < 2) throw new Error(`CLEAR @(${c},${r}) only matched ${cells.length} cell(s)`);
      g.pushUndo();
      const n = cells.length;
      g.score += n * n;
      g.removeCells(cells);
      g.settle();
    } else if (t === RT_BOMB) {
      const coord = data[i++];
      const c = coord % 10, r = Math.floor(coord / 10);
      if (g.invBomb === 0) throw new Error('BOMB used with empty inventory');
      if (g.grid[r][c] === 0) throw new Error(`BOMB @(${c},${r}) on empty cell`);
      g.pushUndo();
      g.invBomb -= 1;
      g.grid[r][c] = 0;
      g.settle();
    } else if (t === RT_PAINT) {
      const coord = data[i++];
      const color = data[i++];
      const c = coord % 10, r = Math.floor(coord / 10);
      if (g.invPaint === 0) throw new Error('PAINT used with empty inventory');
      if (g.grid[r][c] === 0) throw new Error(`PAINT @(${c},${r}) on empty cell`);
      g.pushUndo();
      g.grid[r][c] = color;
      g.invPaint -= 1;
    } else if (t === RT_SHUFFLE) {
      if (g.invShuffle === 0) throw new Error('SHUFFLE used with empty inventory');
      g.pushUndo();
      g.invShuffle -= 1;
      for (let k = 0; k < 3; k++) g.shuffleAll();
      g.settle();
    } else if (t === RT_UNDO) {
      g.applyUndo();
    } else if (t === RT_BUY_BOMB) {
      if (g.invBomb > 0) throw new Error('BUY_BOMB while already holding one');
      const cost = g.bombBuys === 0 ? COST_BOMB_1ST : (g.bombBuys === 1 ? COST_BOMB_2ND : COST_BOMB);
      if (g.score < cost) throw new Error(`BUY_BOMB without funds (score=${g.score}, cost=${cost})`);
      g.score -= cost;
      g.invBomb += 1;
      if (g.bombBuys < 2) g.bombBuys += 1;
    } else if (t === RT_BUY_PAINT) {
      if (g.invPaint > 0) throw new Error('BUY_PAINT while already holding one');
      if (g.score < COST_PAINT) throw new Error(`BUY_PAINT without funds (score=${g.score})`);
      g.score -= COST_PAINT;
      g.invPaint += 1;
    } else if (t === RT_BUY_SHUFFLE) {
      if (g.invShuffle > 0) throw new Error('BUY_SHUFFLE while already holding one');
      if (g.score < COST_SHUFFLE) throw new Error(`BUY_SHUFFLE without funds (score=${g.score})`);
      g.score -= COST_SHUFFLE;
      g.invShuffle += 1;
    } else if (t === RT_BUY_UNDO) {
      if (g.score < COST_UNDO || g.undoRemaining >= UNDO_MAX) {
        throw new Error(`BUY_UNDO illegal (score=${g.score}, remaining=${g.undoRemaining})`);
      }
      g.score -= COST_UNDO;
      g.undoRemaining += 1;
    } else if (t === RT_LEVEL_CLR) {
      const bonusPx = data[i++];
      if (!g.isEmpty()) throw new Error('LEVEL_CLR but grid not empty');
      if (bonusPx > 0) g.score += 250;
      g.level += 1;
      g.undoRemaining = UNDO_MAX;
      g.undoStack = [];
      g.randomize();
    } else if (t === RT_CHECKPOINT) {
      // Mid-stream re-anchor (defined for forward-compat; not currently emitted).
      g.loadCheckpoint(data.slice(i, i + snapshotSize), snapshotSize);
      i += snapshotSize;
    } else {
      throw new Error(`unknown token 0x${t.toString(16).padStart(2, '0')} at offset ${i - 1}`);
    }
  }

  const finalScore = g.score;
  const issues = [];
  if (finalScore !== entry.score) {
    issues.push(`score mismatch: replayed=${finalScore}, saved=${entry.score}`);
  }
  if (g.level !== entry.level) {
    issues.push(`level mismatch: replayed=${g.level}, saved=${entry.level}`);
  }
  return { game: g, issues, resumedFromCheckpoint, finalScore };
}


// ============================================================================
// validateSave — top-level entrypoint. Takes raw save bytes, returns
// { header, results: { normal: ..., fast: ... } } where each result is one of:
//   { status: 'empty' }                                 — slot is 0 / unused
//   { status: 'pass', entry, resumedFromCheckpoint }    — replay matched
//   { status: 'partial', entry, resumedFromCheckpoint } — matched, but we
//        only had a checkpoint not the full stream (marathon run)
//   { status: 'fail', entry, issues }                   — mismatch / error
// ============================================================================
export function validateSave(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const header = parseHeader(buf);
  const snapSize = header.version >= 6 ? SNAPSHOT_SIZE_V6 : SNAPSHOT_SIZE_V5;
  const replayOffNormal = header.headerSize;
  const replayOffFast = header.headerSize + REPLAY_MAX;

  const results = {
    normal: checkSlot(MODE_NORMAL, header.normal, header.lenNormal, replayOffNormal),
    fast: checkSlot(MODE_FAST, header.fast, header.lenFast, replayOffFast),
  };
  return { header, results };

  function checkSlot(mode, entry, rlen, roff) {
    if (entry.score === 0) return { status: 'empty' };
    if (rlen === 0) {
      return { status: 'fail', entry, issues: ['high score recorded but no replay data stored'] };
    }
    if (roff + rlen > buf.length) {
      return { status: 'fail', entry, issues: [`replay slot extends past end of file (${roff + rlen} > ${buf.length})`] };
    }
    const rdata = buf.slice(roff, roff + rlen);
    try {
      const { issues, resumedFromCheckpoint } = replay(mode, entry, rdata, snapSize);
      if (issues.length) return { status: 'fail', entry, issues };
      return { status: resumedFromCheckpoint ? 'partial' : 'pass', entry, resumedFromCheckpoint };
    } catch (e) {
      return { status: 'fail', entry, issues: [`replay error: ${e.message}`] };
    }
  }
}


// ---- helpers ----
function makeGrid(rows, cols, fill = 0) {
  const g = new Array(rows);
  for (let r = 0; r < rows; r++) {
    g[r] = new Array(cols);
    for (let c = 0; c < cols; c++) g[r][c] = fill;
  }
  return g;
}

function decodeInitials(buf, off) {
  // Three ASCII-ish bytes; anything outside printable range renders as '?'.
  let out = '';
  for (let i = 0; i < 3; i++) {
    const b = buf[off + i];
    out += (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '?';
  }
  return out;
}

function bytesAsHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
