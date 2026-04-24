/**
 * Netlify Function v2 — POST /api/gameboy-highscore
 *
 * Independently re-validates the uploaded save, applies dedup + blocklist,
 * and upserts rows into the `scores` Postgres table. The next Netlify build
 * step (scripts/render-scores.mjs) reads the table and inlines the top-N
 * entries into public/gameboy/index.html.
 *
 * Expects body JSON: { saveBase64, country, submitModes: ['normal'|'fast', ...] }
 * Returns 200 JSON: { ok: true, results: { normal?, fast? } }
 *                   outcome per mode is 'accepted' | 'dedup-skip'.
 * On failure: 4xx/5xx JSON: { ok: false, reason }.
 *
 * Expected schema:
 *   CREATE TABLE scores (
 *     mode         TEXT NOT NULL CHECK (mode IN ('normal','fast')),
 *     initials     TEXT NOT NULL,
 *     country      TEXT NOT NULL,
 *     score        INTEGER NOT NULL,
 *     seed         INTEGER NOT NULL,
 *     level        INTEGER NOT NULL,
 *     submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     PRIMARY KEY (mode, initials, country)
 *   );
 */

import postgres from 'postgres';
import { validateSave } from '../../public/gameboy/submit/save-validator.js';
import {
  normalizeInitials,
  isInitialsBlocked,
} from '../../public/gameboy/submit/initials-blocklist.js';
import { isValidCountryCode } from '../../public/gameboy/submit/countries.js';

const MAX_SAVE_BYTES = 8 * 1024;

export const config = { path: '/api/gameboy-highscore' };

let sql;
function db() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('missing DATABASE_URL');
    sql = postgres(url, { max: 1, idle_timeout: 20, prepare: false });
  }
  return sql;
}

export default async (req) => {
  if (req.method === 'GET') {
    let client;
    try { client = db(); }
    catch (e) { return json(500, { ok: false, reason: `server not configured (${e.message})` }); }
    try {
      const rows = await client`
        SELECT mode, initials, country, score, seed, level
        FROM scores
        WHERE mode IN ('normal', 'fast')
        ORDER BY mode, score DESC
        LIMIT 20
      `;
      const out = { normal: [], fast: [] };
      for (const r of rows) out[r.mode]?.push(r);
      return json(200, out);
    } catch (e) {
      return json(502, { ok: false, reason: `db read failed: ${e.message}` });
    }
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, reason: 'method not allowed' });
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
      score: slot.entry.score,
      seed: slot.entry.seed,
      level: slot.entry.level,
      country: countryCode,
    });
  }

  let client;
  try { client = db(); }
  catch (e) { return json(500, { ok: false, reason: `server not configured (${e.message})` }); }

  const outcomes = {};
  try {
    for (const e of accepted) {
      const rows = await client`
        INSERT INTO scores (mode, initials, country, score, seed, level, submitted_at)
        VALUES (${e.mode}, ${e.initials}, ${e.country}, ${e.score}, ${e.seed}, ${e.level}, NOW())
        ON CONFLICT (mode, initials, country) DO UPDATE
          SET score = EXCLUDED.score,
              seed = EXCLUDED.seed,
              level = EXCLUDED.level,
              submitted_at = EXCLUDED.submitted_at
          WHERE EXCLUDED.score > scores.score
        RETURNING 1
      `;
      outcomes[e.mode] = rows.length > 0 ? 'accepted' : 'dedup-skip';
    }
  } catch (e) {
    return json(502, { ok: false, reason: `db write failed: ${e.message}` });
  }

  return json(200, { ok: true, results: outcomes });
};

function json(status, body) {
  return Response.json(body, { status });
}

function base64ToBytes(b64) {
  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
