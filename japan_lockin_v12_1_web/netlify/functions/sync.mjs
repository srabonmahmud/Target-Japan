import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

const STORE_NAME = 'japan-lockin-sync';
const STORE_REGION = 'us-east-2';
const MAX_CODE_LEN = 32;
const MAX_CHANGES = 250;
const MAX_ENTITY_BYTES = 700_000;
const MAX_BATCH_BYTES = 3_000_000;
const MAX_PARALLEL_BLOB_READS = 24;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

function response(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}

function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function validCode(code) {
  return code.length >= 8 && code.length <= MAX_CODE_LEN;
}

function spaceId(code) {
  return createHash('sha256').update(code).digest('hex');
}

function encodedEntityKey(key) {
  return Buffer.from(String(key), 'utf8').toString('base64url');
}

function blobKey(space, key) {
  return `v1/${space}/${encodedEntityKey(key)}`;
}

function store() {
  return getStore({ name: STORE_NAME, region: STORE_REGION });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readEntity(st, key) {
  return st.get(key, { consistency: 'strong', type: 'json' });
}

async function checkRateLimit(st, clientIp) {
  const key = `rate/v1/${createHash('sha256').update(clientIp).digest('hex')}`;
  const now = Date.now();
  const current = await readEntity(st, key);
  const windowStart = Number(current?.windowStart);
  const activeWindow = Number.isFinite(windowStart) && windowStart <= now && now - windowStart < RATE_LIMIT_WINDOW_MS;
  const count = activeWindow ? Number(current.count) || 0 : 0;

  if (count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000)) };
  }

  await st.set(key, JSON.stringify({
    windowStart: activeWindow ? windowStart : now,
    count: count + 1
  }));
  return { allowed: true };
}

export default async function handler(req, context = {}) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method === 'GET') return response({ ok: true, service: 'japan-lockin-sync', version: 1 });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);

  const clientIp = typeof context.ip === 'string' && context.ip
    ? context.ip
    : req.headers.get('x-nf-client-connection-ip');
  if (!clientIp) return response({ ok: false, error: 'Could not identify the client for request limiting.' }, 503);

  const st = store();
  const limit = await checkRateLimit(st, clientIp);
  if (!limit.allowed) {
    return response(
      { ok: false, error: 'Too many sync requests. Wait briefly and try again.' },
      429,
      { 'Retry-After': String(limit.retryAfter) }
    );
  }

  let body;
  const contentLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BATCH_BYTES) {
    return response({ ok: false, error: 'Sync request is too large.' }, 413);
  }
  try { body = await req.json(); } catch { return response({ ok: false, error: 'Invalid JSON body' }, 400); }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BATCH_BYTES) {
    return response({ ok: false, error: 'Sync request is too large.' }, 413);
  }

  const code = normalizeCode(body?.code);
  if (!validCode(code)) return response({ ok: false, error: 'Invalid sync code' }, 400);

  const action = body?.action;
  if (action !== 'pull' && action !== 'push') return response({ ok: false, error: 'Unsupported sync action' }, 400);

  const prefix = `v1/${spaceId(code)}/`;

  if (action === 'pull') {
    const listing = await st.list({ prefix });
    const entities = [];
    const blobs = Array.isArray(listing.blobs) ? listing.blobs : [];
    for (let offset = 0; offset < blobs.length; offset += MAX_PARALLEL_BLOB_READS) {
      const batch = await Promise.all(blobs.slice(offset, offset + MAX_PARALLEL_BLOB_READS).map(item => readEntity(st, item.key)));
      for (const data of batch) {
        if (!data || typeof data.key !== 'string') continue;
        entities.push({
          key: data.key,
          updatedAt: Number(data.updatedAt) || 0,
          deleted: !!data.deleted,
          value: data.deleted ? null : data.value
        });
      }
    }
    entities.sort((a, b) => a.key.localeCompare(b.key));
    return response({ ok: true, entities, serverTime: Date.now() });
  }

  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (changes.length > MAX_CHANGES) return response({ ok: false, error: `Too many changes; maximum is ${MAX_CHANGES}.` }, 400);

  const acceptedKeys = [];
  const rejected = [];
  for (const change of changes) {
    if (!isPlainObject(change)) {
      rejected.push({ key: '', reason: 'invalid-change' });
      continue;
    }
    const entityKey = String(change.key ?? '');
    if (!entityKey || entityKey.length > 500) {
      rejected.push({ key: entityKey.slice(0, 500), reason: 'invalid-key' });
      continue;
    }
    const updatedAt = Number(change.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
      rejected.push({ key: entityKey, reason: 'invalid-timestamp' });
      continue;
    }
    const deleted = !!change.deleted;
    if (!deleted && !Object.hasOwn(change, 'value')) {
      rejected.push({ key: entityKey, reason: 'missing-value' });
      continue;
    }
    const value = deleted ? null : change.value;
    const payload = { key: entityKey, updatedAt, deleted, value };
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (bytes > MAX_ENTITY_BYTES) {
      rejected.push({ key: entityKey, reason: 'entity-too-large' });
      continue;
    }

    const key = blobKey(spaceId(code), entityKey);
    const existing = await readEntity(st, key);
    if (existing && Number(existing.updatedAt) > updatedAt) {
      rejected.push({ key: entityKey, reason: 'stale' });
      continue;
    }

    await st.set(key, JSON.stringify(payload), {
      metadata: { updatedAt: String(updatedAt), deleted: deleted ? '1' : '0' }
    });
    acceptedKeys.push(entityKey);
  }

  return response({ ok: true, accepted: acceptedKeys.length, acceptedKeys, rejected, serverTime: Date.now() });
}
