// Baptism certificate requests (table baptism_certificates, private bucket
// "certificates"; see supabase/baptism_certificates.sql). The public steps are
// served by api/submit.js and the admin steps by api/pending.js and
// api/moderate.js: the Hobby plan caps the deploy at 12 functions, so this
// feature rides on the existing ones instead of adding its own.
import { randomBytes } from 'node:crypto';
import { notifyCertRequest } from './notify.js';

const BUCKET = 'certificates';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[0-9a-f]{32}$/;
const PHOTO_RE = /^photos\/[A-Za-z0-9_-]+\.jpg$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_TTL = 60 * 60; // signed photo links last an hour

const base = () => process.env.SUPABASE_URL;
function sr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: k, Authorization: `Bearer ${k}` };
}
const json = { 'Content-Type': 'application/json' };

// strip control characters; keep normal text (letters, spaces, hyphens, punctuation)
function clean(s, max) {
  return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// A day of slack: "today" in East Africa is already tomorrow in UTC.
const isFuture = (s) => new Date(s + 'T00:00:00Z') > new Date(Date.now() + 864e5);

export const isCertId = (id) => UUID_RE.test(String(id || ''));

// The editable details, checked the same way for a visitor's request and an
// admin's correction. Returns { fields } or { error }.
export function readFields(body) {
  const b = body || {};
  const fields = {
    full_name: clean(b.full_name, 90),
    birth_date: clean(b.birth_date, 10) || null,
    baptism_date: clean(b.baptism_date, 10),
    place: clean(b.place, 90),
    officiant: clean(b.officiant, 90),
    contact: clean(b.contact, 120),
  };
  if (!fields.full_name) return { error: 'Please enter the full name.' };
  if (!validDate(fields.baptism_date)) return { error: 'Please enter the date of baptism.' };
  if (isFuture(fields.baptism_date)) return { error: 'The date of baptism cannot be in the future.' };
  if (fields.birth_date && (!validDate(fields.birth_date) || isFuture(fields.birth_date))) {
    return { error: 'The date of birth is not valid.' };
  }
  if (fields.birth_date && fields.birth_date > fields.baptism_date) {
    return { error: 'The date of birth must come before the date of baptism.' };
  }
  if (!fields.place) return { error: 'Please enter where the baptism took place.' };
  if (!fields.officiant) return { error: 'Please enter who performed the baptism.' };
  return { fields };
}

async function signedPhotos(paths) {
  if (!paths.length) return {};
  const r = await fetch(`${base()}/storage/v1/object/sign/${BUCKET}`, {
    method: 'POST',
    headers: { ...sr(), ...json },
    body: JSON.stringify({ expiresIn: PHOTO_TTL, paths }),
  });
  if (!r.ok) return {};
  const out = {};
  (await r.json()).forEach((x) => {
    if (x.signedURL) out[x.path] = `${base()}/storage/v1${x.signedURL}`;
  });
  return out;
}

function publicView(row, photos) {
  return {
    id: row.id,
    status: row.status,
    full_name: row.full_name,
    birth_date: row.birth_date,
    baptism_date: row.baptism_date,
    place: row.place,
    officiant: row.officiant,
    cert_no: row.cert_no,
    approved_at: row.approved_at,
    photo: photos[row.photo_path] || '',
  };
}

// PUBLIC: a signed URL the browser uploads the cropped passport photo to.
export async function signPhotoUpload() {
  const path = `photos/${Date.now()}-${randomBytes(8).toString('hex')}.jpg`;
  const r = await fetch(`${base()}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...sr(), ...json },
    body: '{}',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || `sign ${r.status}`);
  return { uploadUrl: `${base()}/storage/v1${data.url}`, path };
}

// PUBLIC: record a request as pending and email the admins. The returned key
// is the requester's only way back to it, so the page keeps the link for them.
export async function createRequest(body, origin) {
  const { fields, error } = readFields(body);
  if (error) return { status: 400, body: { error } };
  const photo = String((body || {}).photo_path || '');
  if (!PHOTO_RE.test(photo)) return { status: 400, body: { error: 'Please add a passport photo.' } };

  const access_key = randomBytes(16).toString('hex');
  const r = await fetch(`${base()}/rest/v1/baptism_certificates`, {
    method: 'POST',
    headers: { ...sr(), ...json, Prefer: 'return=representation' },
    body: JSON.stringify({ ...fields, photo_path: photo, access_key, status: 'pending' }),
  });
  const rows = await r.json();
  if (!r.ok) throw new Error(rows.message || `insert ${r.status}`);
  await notifyCertRequest(fields, origin);
  return { status: 200, body: { ok: true, id: rows[0].id, key: access_key } };
}

// PUBLIC: the requester's view, gated by the secret key from their link.
export async function readRequest(id, key) {
  if (!isCertId(id) || !KEY_RE.test(String(key || ''))) {
    return { status: 404, body: { error: 'Certificate not found.' } };
  }
  const r = await fetch(
    `${base()}/rest/v1/baptism_certificates?id=eq.${id}&access_key=eq.${key}&select=*`,
    { headers: sr() },
  );
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  const rows = await r.json();
  if (!rows.length) return { status: 404, body: { error: 'Certificate not found.' } };
  const photos = await signedPhotos([rows[0].photo_path]);
  return { status: 200, body: publicView(rows[0], photos) };
}

// ADMIN: every request, pending first, with the requester link for printing.
export async function listRequests() {
  const r = await fetch(
    `${base()}/rest/v1/baptism_certificates?select=*&order=status.desc,created_at.desc`,
    { headers: sr() },
  );
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  const rows = await r.json();
  const photos = await signedPhotos(rows.map((x) => x.photo_path));
  return rows.map((x) => ({
    ...publicView(x, photos),
    contact: x.contact,
    created_at: x.created_at,
    link: `/baptism-certificate?id=${x.id}&key=${x.access_key}`,
  }));
}

// ADMIN: approve, correct details, or reject (deletes the row and photo).
export async function moderateRequest(id, action, body) {
  if (!isCertId(id)) return { status: 400, body: { error: 'bad id' } };
  const url = `${base()}/rest/v1/baptism_certificates?id=eq.${id}`;

  if (action === 'approve' || action === 'save') {
    const patch = {};
    if (body && body.fields) {
      const { fields, error } = readFields(body.fields);
      if (error) return { status: 400, body: { error } };
      Object.assign(patch, fields);
    }
    if (action === 'approve') {
      patch.status = 'approved';
      patch.approved_at = new Date().toISOString();
      patch.cert_no = `UM-${patch.approved_at.slice(0, 4)}-${id.slice(0, 6).toUpperCase()}`;
    }
    if (!Object.keys(patch).length) return { status: 400, body: { error: 'nothing to save' } };
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { ...sr(), ...json, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    const rows = await r.json();
    if (!r.ok) throw new Error(rows.message || `${action} ${r.status}`);
    if (!rows.length) return { status: 404, body: { error: 'not found' } };
    return { status: 200, body: { ok: true, status: rows[0].status, cert_no: rows[0].cert_no } };
  }

  if (action === 'reject') {
    const q = await fetch(`${url}&select=photo_path`, { headers: sr() });
    const rows = q.ok ? await q.json() : [];
    if (rows.length) {
      await fetch(`${base()}/storage/v1/object/${BUCKET}/${rows[0].photo_path}`, {
        method: 'DELETE',
        headers: sr(),
      });
    }
    const d = await fetch(url, { method: 'DELETE', headers: sr() });
    if (!d.ok) throw new Error(`reject ${d.status}`);
    return { status: 200, body: { ok: true, status: 'rejected' } };
  }

  return { status: 400, body: { error: 'need action (approve|save|reject)' } };
}
