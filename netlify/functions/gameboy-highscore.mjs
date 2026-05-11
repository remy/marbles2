/**
 * Netlify Function v2 — POST /api/gameboy-highscore
 *
 * Re-validates the uploaded save, applies dedup + blocklist, then persists to
 * the public GitHub repo `remy/gb-marbles-highscores`:
 *
 *   - The raw save bytes get committed to `submitted/<isoSafe>-<hex4>.sav`
 *     as an immutable audit trail (one file per accepted submission).
 *   - `scores.json` at the repo root is read, merged with dedup-by-
 *     (initials,country), trimmed to top 50 per mode, and written back with
 *     optimistic concurrency via the file's sha.
 *
 * GET is handled at the edge — `public/_redirects` rewrites
 * `GET /api/gameboy-highscore` straight to the raw scores.json on GitHub.
 *
 * Body JSON: { saveBase64, country, submitModes: ['normal'|'fast', ...] }
 * Success:   200 { ok: true, results: { normal?, fast? } }  outcome per mode is 'accepted' | 'dedup-skip'
 * Failure:   4xx/5xx { ok: false, reason }
 *
 * Requires env GITHUB_TOKEN — a fine-grained PAT with Contents:write on
 * remy/gb-marbles-highscores.
 */

import { randomBytes } from 'node:crypto';
import { validateSave } from '../../public/gameboy/submit/save-validator.js';
import {
  normalizeInitials,
  isInitialsBlocked,
} from '../../public/gameboy/submit/initials-blocklist.js';
import { isValidCountryCode } from '../../public/gameboy/submit/countries.js';

const MAX_SAVE_BYTES = 8 * 1024;
const REPO_OWNER = 'remy';
const REPO_NAME = 'gb-marbles-highscores';
const SCORES_PATH = 'scores.json';
const SUBMITTED_DIR = 'submitted';
const TOP_N_PER_MODE = 50;
const SCORES_PUT_MAX_ATTEMPTS = 4;
const RAW_SCORES_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${SCORES_PATH}`;

export const config = { path: '/api/gameboy-highscore' };

export default async (req) => {
  if (req.method === 'GET') {
    try {
      const upstream = await fetch(RAW_SCORES_URL, { cache: 'no-store' });
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    } catch (e) {
      return json(502, { ok: false, reason: `failed to fetch scores: ${e.message}` });
    }
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, reason: 'method not allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return json(500, { ok: false, reason: 'server not configured (missing GITHUB_TOKEN)' });
  }

  let body;
  try { body = await req.json(); }
  catch { return json(400, { ok: false, reason: 'invalid JSON body' }); }

  const { saveBase64, country, submitModes } = body || {};
  if (typeof saveBase64 !== 'string' || !Array.isArray(submitModes) || submitModes.length === 0) {
    return json(400, { ok: false, reason: 'missing saveBase64 or submitModes' });
  }
  const countryCode = (typeof country === 'string' ? country : '').trim().toUpperCase();
  if (!isValidCountryCode(countryCode)) {
    return json(400, { ok: false, reason: 'invalid country code' });
  }

  let bytes;
  try { bytes = base64ToBytes(saveBase64); }
  catch { return json(400, { ok: false, reason: 'save not valid base64' }); }
  if (bytes.length === 0 || bytes.length > MAX_SAVE_BYTES) {
    return json(400, { ok: false, reason: `save file wrong size (${bytes.length})` });
  }

  let validation;
  try { validation = validateSave(bytes); }
  catch (e) { return json(400, { ok: false, reason: `save validation failed: ${e.message}` }); }

  const submittedAt = new Date().toISOString();
  const accepted = [];
  for (const mode of submitModes) {
    if (mode !== 'normal' && mode !== 'fast') {
      return json(400, { ok: false, reason: `unknown mode: ${mode}` });
    }
    const slot = validation.results[mode];
    if (!slot || slot.status !== 'pass') {
      return json(400, { ok: false, reason: `${mode} run did not pass validation (status=${slot?.status})` });
    }
    const initials = normalizeInitials(slot.entry.initials);
    if (isInitialsBlocked(initials)) {
      return json(400, { ok: false, reason: `${mode} initials are blocked` });
    }
    accepted.push({
      mode,
      initials,
      country: countryCode,
      score: slot.entry.score,
      seed: slot.entry.seed,
      level: slot.entry.level,
      submittedAt,
    });
  }

  const modesLabel = accepted.map((e) => e.mode).join('+');
  const initialsLabel = accepted.map((e) => e.initials).join(',');

  try {
    await commitSave(token, bytes, {
      submittedAt,
      modes: accepted.map((e) => e.mode),
      initials: initialsLabel,
      country: countryCode,
    });
  } catch (e) {
    return json(502, { ok: false, reason: `github save commit failed: ${e.message}` });
  }

  let outcomes;
  try {
    outcomes = await updateScoresJson(token, accepted, modesLabel, initialsLabel, countryCode);
  } catch (e) {
    return json(502, { ok: false, reason: `github scores update failed: ${e.message}` });
  }

  return json(200, { ok: true, results: outcomes });
};

async function commitSave(token, bytes, meta) {
  const stamp = meta.submittedAt.replace(/[:.]/g, '-');
  const suffix = randomBytes(2).toString('hex');
  const path = `${SUBMITTED_DIR}/${stamp}-${suffix}.sav`;
  const content = Buffer.from(bytes).toString('base64');
  const message = `submit: ${meta.modes.join('+')} by ${meta.initials} @ ${meta.country}`;
  const res = await gh(token, 'PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    message,
    content,
  });
  if (!res.ok) {
    throw new Error(`PUT ${path} → ${res.status} ${res.bodyText.slice(0, 200)}`);
  }
}

async function updateScoresJson(token, accepted, modesLabel, initialsLabel, countryCode) {
  let lastError;
  for (let attempt = 0; attempt < SCORES_PUT_MAX_ATTEMPTS; attempt++) {
    const current = await fetchScoresJson(token);
    const merged = mergeScores(current.data, accepted);
    const message = `scores: update ${modesLabel} for ${initialsLabel} @ ${countryCode}`;
    const putRes = await gh(token, 'PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SCORES_PATH}`, {
      message,
      content: Buffer.from(JSON.stringify(merged.data, null, 2) + '\n', 'utf-8').toString('base64'),
      sha: current.sha,
    });
    if (putRes.ok) {
      return merged.outcomes;
    }
    if (putRes.status === 409 || putRes.status === 422) {
      lastError = new Error(`sha conflict on attempt ${attempt + 1}`);
      await sleep(120 * (attempt + 1));
      continue;
    }
    throw new Error(`PUT scores.json → ${putRes.status} ${putRes.bodyText.slice(0, 200)}`);
  }
  throw lastError ?? new Error('scores.json update failed after retries');
}

async function fetchScoresJson(token) {
  const res = await gh(token, 'GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SCORES_PATH}`);
  if (!res.ok) {
    throw new Error(`GET scores.json → ${res.status} ${res.bodyText.slice(0, 200)}`);
  }
  const body = JSON.parse(res.bodyText);
  const raw = Buffer.from(body.content, 'base64').toString('utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.normal)) data.normal = [];
  if (!Array.isArray(data.fast)) data.fast = [];
  return { sha: body.sha, data };
}

function mergeScores(data, accepted) {
  const outcomes = {};
  for (const e of accepted) {
    const list = data[e.mode];
    const existingIdx = list.findIndex(
      (r) => r.initials === e.initials && r.country === e.country
    );
    if (existingIdx !== -1 && list[existingIdx].score >= e.score) {
      outcomes[e.mode] = 'dedup-skip';
      continue;
    }
    if (existingIdx !== -1) list.splice(existingIdx, 1);
    list.push({
      initials: e.initials,
      score: e.score,
      seed: e.seed,
      level: e.level,
      country: e.country,
      submittedAt: e.submittedAt,
    });
    list.sort((a, b) => b.score - a.score);
    if (list.length > TOP_N_PER_MODE) list.length = TOP_N_PER_MODE;
    outcomes[e.mode] = 'accepted';
  }
  data.updated = new Date().toISOString();
  return { data, outcomes };
}

async function gh(token, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'marbles2-highscore-fn',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const bodyText = await res.text();
  return { ok: res.ok, status: res.status, bodyText };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(status, body) {
  return Response.json(body, { status });
}

function base64ToBytes(b64) {
  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
