#!/usr/bin/env node
/**
 * Netlify build step: reads scores.json from the public
 * remy/gb-marbles-highscores repo and inlines the top-N entries for each
 * mode into public/gameboy/index.html between:
 *   <!-- SCORES:NORMAL:START --> ... <!-- SCORES:NORMAL:END -->
 *   <!-- SCORES:FAST:START -->   ... <!-- SCORES:FAST:END -->
 *
 * Idempotent: re-running against the same upstream state produces the same
 * HTML. When a mode has no entries, the "awaiting first entry" placeholder
 * row is rendered so the table never renders empty.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { codeToFlag } from '../public/gameboy/submit/countries.js';

const TOP_N = 10;
const SCORES_URL = 'https://raw.githubusercontent.com/remy/gb-marbles-highscores/main/scores.json';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_FILE = path.join(root, 'public/gameboy', 'index.html');

async function fetchScores() {
  const res = await fetch(SCORES_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch scores.json → ${res.status} ${res.statusText}`);
  const data = await res.json();
  return {
    normal: Array.isArray(data.normal) ? data.normal : [],
    fast: Array.isArray(data.fast) ? data.fast : [],
  };
}

async function main() {
  const scores = await fetchScores();
  let html = await readFile(INDEX_FILE, 'utf-8');
  html = replaceBlock(html, 'NORMAL', renderRows(scores.normal));
  html = replaceBlock(html, 'FAST', renderRows(scores.fast));
  await writeFile(INDEX_FILE, html, 'utf-8');
  console.log(`render-scores: wrote ${INDEX_FILE}`);
  console.log(`  normal=${scores.normal.length}, fast=${scores.fast.length}`);
}

function replaceBlock(html, modeUpper, inner) {
  const start = `<!-- SCORES:${modeUpper}:START -->`;
  const end = `<!-- SCORES:${modeUpper}:END -->`;
  const startIdx = html.indexOf(start);
  const endIdx = html.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`render-scores: missing ${start} / ${end} markers in index.html`);
  }
  return html.slice(0, startIdx + start.length)
    + '\n' + inner
    + '            ' + html.slice(endIdx);
}

function renderRows(entries) {
  const sorted = entries.slice().sort((a, b) => b.score - a.score).slice(0, TOP_N);
  if (sorted.length === 0) {
    return '            <tr class="empty"><td colspan="6">— awaiting first entry —</td></tr>\n';
  }
  return sorted.map((e, i) => {
    const seed = '#' + Number(e.seed).toString(16).toUpperCase().padStart(4, '0');
    const flag = codeToFlag(e.country || '');
    return `            <tr>`
      + `<td class="rank num">${i + 1}</td>`
      + `<td class="initials">${escapeHtml(e.initials)}</td>`
      + `<td class="num">${Number(e.score).toLocaleString('en-GB')}</td>`
      + `<td>${seed}</td>`
      + `<td class="num">${Number(e.level)}</td>`
      + `<td class="flag" title="${escapeHtml(e.country || '')}">${flag}</td>`
      + `</tr>\n`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

main().catch((e) => {
  console.error('render-scores failed:', e);
  process.exit(1);
});
