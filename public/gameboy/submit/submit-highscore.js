/**
 * Page logic for docs/submit-highscore.html.
 *
 * Reads the uploaded .sav/.srm as bytes, runs validateSave() locally so the
 * player gets instant feedback, lets them pick which passing entries to send,
 * POSTs the raw save + metadata to the Netlify function. The function
 * re-validates from scratch — nothing the client says about pass/fail is
 * trusted server-side.
 */

import { validateSave } from './save-validator.js';
import { normalizeInitials, isInitialsBlocked } from './initials-blocklist.js';
import { COUNTRIES, codeToFlag, isValidCountryCode } from './countries.js';

const MAX_FILE_BYTES = 8 * 1024;
const ENDPOINT = '/api/gameboy-highscore';

const dropEl = document.getElementById('drop');
const fileInput = document.getElementById('file-input');
const pickBtn = document.getElementById('pick-btn');
const parseError = document.getElementById('parse-error');
const sectionIdle = document.getElementById('section-idle');
const sectionParsed = document.getElementById('section-parsed');
const sectionDone = document.getElementById('section-done');
const cardsEl = document.getElementById('cards');
const countryInput = document.getElementById('country');
const countriesList = document.getElementById('countries');
const submitBtn = document.getElementById('submit-btn');
const submitStatus = document.getElementById('submit-status');
const doneBlock = document.getElementById('done-block');

let lastBytes = null;     // Uint8Array of the uploaded save
let lastResults = null;   // { normal, fast } from validateSave

populateCountries();
wireDropzone();
wireSubmit();

// ---------------------------------------------------------------------------
// Country datalist
// ---------------------------------------------------------------------------
function populateCountries() {
  const frag = document.createDocumentFragment();
  for (const [code, name] of COUNTRIES) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.label = `${codeToFlag(code)} ${name}`;
    frag.appendChild(opt);
  }
  countriesList.appendChild(frag);
}

// ---------------------------------------------------------------------------
// File intake
// ---------------------------------------------------------------------------
function wireDropzone() {
  pickBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });
  dropEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropEl.classList.add('is-drag');
  });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('is-drag'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('is-drag');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
}

async function handleFile(file) {
  parseError.textContent = '';
  if (file.size > MAX_FILE_BYTES) {
    parseError.textContent = `File too large (${file.size} bytes). Marbles² saves are under 8 KB.`;
    return;
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let out;
  try {
    out = validateSave(buf);
  } catch (e) {
    parseError.textContent = `Couldn't read save: ${e.message}`;
    return;
  }
  lastBytes = buf;
  lastResults = out.results;
  renderCards(out.results);
  sectionParsed.classList.remove('hidden');
  sectionDone.classList.add('hidden');
  submitStatus.textContent = '';
  submitStatus.className = 'status-line';
}

// ---------------------------------------------------------------------------
// Parsed-state card rendering
// ---------------------------------------------------------------------------
function renderCards(results) {
  cardsEl.replaceChildren(
    buildCard('normal', 'Normal', results.normal),
    buildCard('fast', 'Fast', results.fast),
  );
}

function buildCard(mode, label, slot) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.dataset.mode = mode;

  const header = document.createElement('h3');
  header.appendChild(textNode(label));
  header.appendChild(statusBadge(slot.status));
  card.appendChild(header);

  if (slot.status === 'empty') {
    card.appendChild(textP('Empty slot — nothing to submit.'));
    return card;
  }

  const fields = document.createElement('div');
  fields.className = 'fields';
  const e = slot.entry;
  kv(fields, 'Initials', normalizeInitials(e.initials) || e.initials, 'initials');
  kv(fields, 'Score', e.score.toLocaleString());
  kv(fields, 'Seed', '#' + e.seed.toString(16).toUpperCase().padStart(4, '0'));
  kv(fields, 'Level', String(e.level));
  card.appendChild(fields);

  if (slot.status === 'fail' && slot.issues?.length) {
    const ul = document.createElement('ul');
    ul.className = 'issues';
    for (const i of slot.issues) {
      const li = document.createElement('li');
      li.textContent = i;
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }

  const eligible = (slot.status === 'pass' || slot.status === 'partial')
    && !isInitialsBlocked(e.initials);
  const include = document.createElement('label');
  include.className = 'include' + (eligible ? '' : ' disabled');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.mode = mode;
  cb.checked = eligible;
  cb.disabled = !eligible;
  cb.className = 'include-checkbox';
  include.appendChild(cb);
  const reason = eligible
    ? 'Submit this entry'
    : (slot.status === 'fail' ? 'Submit blocked — replay failed'
      : isInitialsBlocked(e.initials) ? 'Submit blocked — initials not allowed'
        : 'Submit unavailable');
  include.appendChild(textNode(reason));
  card.appendChild(include);

  return card;
}

function statusBadge(status) {
  const span = document.createElement('span');
  span.className = `badge ${status}`;
  span.textContent = status.toUpperCase();
  return span;
}

function kv(parent, k, v, extraClass = '') {
  const kEl = document.createElement('div');
  kEl.className = 'k';
  kEl.textContent = k;
  const vEl = document.createElement('div');
  vEl.className = 'v' + (extraClass ? ' ' + extraClass : '');
  vEl.textContent = v;
  parent.appendChild(kEl);
  parent.appendChild(vEl);
}

function textNode(s) { return document.createTextNode(s); }
function textP(s) { const p = document.createElement('p'); p.textContent = s; return p; }

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------
function wireSubmit() {
  submitBtn.addEventListener('click', onSubmit);
}

async function onSubmit() {
  if (!lastBytes || !lastResults) return;
  submitStatus.className = 'status-line';
  submitStatus.textContent = '';

  const selected = Array.from(cardsEl.querySelectorAll('.include-checkbox'))
    .filter((cb) => cb.checked && !cb.disabled)
    .map((cb) => cb.dataset.mode);

  if (selected.length === 0) {
    setStatus('Pick at least one entry to submit.', 'err');
    return;
  }

  for (const mode of selected) {
    const entry = lastResults[mode]?.entry;
    if (!entry || isInitialsBlocked(entry.initials)) {
      setStatus(`Initials on the ${mode.toUpperCase()} entry aren't allowed.`, 'err');
      return;
    }
  }

  const country = (countryInput.value || '').trim().toUpperCase().slice(0, 2);
  if (!isValidCountryCode(country)) {
    setStatus('Pick a country from the list.', 'err');
    return;
  }

  submitBtn.disabled = true;
  setStatus('Submitting…');

  const payload = {
    saveBase64: bytesToBase64(lastBytes),
    country,
    submitModes: selected,
  };

  let resp, body;
  try {
    resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    body = await resp.json().catch(() => ({}));
  } catch (e) {
    submitBtn.disabled = false;
    setStatus(`Network error: ${e.message}`, 'err');
    return;
  }

  if (!resp.ok || !body.ok) {
    submitBtn.disabled = false;
    setStatus(body.reason || `Server returned ${resp.status}`, 'err');
    return;
  }

  renderDone(body.results || {}, selected);
  sectionParsed.classList.add('hidden');
  sectionDone.classList.remove('hidden');
  submitBtn.disabled = false;
}

function renderDone(results, selected) {
  doneBlock.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = 'Submitted';
  doneBlock.appendChild(h);
  const ul = document.createElement('ul');
  for (const mode of selected) {
    const outcome = results[mode] || 'unknown';
    const li = document.createElement('li');
    const label = mode.toUpperCase();
    const text = outcome === 'accepted' ? 'added to the leaderboard'
      : outcome === 'dedup-skip' ? 'already have a higher score on file — kept the existing one'
        : outcome;
    li.textContent = `${label}: ${text}`;
    ul.appendChild(li);
  }
  doneBlock.appendChild(ul);
  const note = document.createElement('p');
  note.className = 'status-line';
  note.textContent = 'New entries appear on the leaderboard after the next site build (usually a minute or two).';
  doneBlock.appendChild(note);
}

function setStatus(msg, kind = '') {
  submitStatus.textContent = msg;
  submitStatus.className = 'status-line' + (kind ? ' ' + kind : '');
}

// ---------------------------------------------------------------------------
// bytes → base64 (browser-safe for small buffers)
// ---------------------------------------------------------------------------
function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
