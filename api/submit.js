// PUBLIC: the whole visitor submission flow. No admin auth.
//
// Two steps, one function. The browser first asks for a signed upload URL
// (step=sign, reached as /api/submit-url via a rewrite in vercel.json), puts
// the file straight into storage, then posts the details here to record it.
// They were separate functions until the Hobby plan's 12-function ceiling
// refused the deploy; they are two halves of one flow, so this is where the
// seam belongs. Both public URLs still work — the rewrite is not a function.
//
// Safeguards: honeypot, category whitelist, length caps, submissions/ path
// only, status forced to pending. Pending items never appear on the public
// gallery (api/gallery.js hides categories starting with "_"), so nothing here
// can deface the site.
const ALLOWED_CATS = ['Worship', 'Community', 'Missions', 'Media'];
const ALLOWED_FILES = /\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i;

// strip control characters; keep normal text (letters, spaces, hyphens, punctuation)
function clean(s, max) {
  return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

// Step one: a signed URL the browser can upload the file to directly.
async function signUpload(req, res) {
  const name = String((req.body || {}).filename || '');
  if (!ALLOWED_FILES.test(name)) {
    return res.status(400).json({ error: 'Please choose an image or video file.' });
  }
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `submissions/${Date.now()}-${rand}-${safe}`;
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/upload/sign/gallery/${path}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${sr}`, apikey: sr, 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || `sign ${r.status}`);
  return res.status(200).json({ uploadUrl: `${process.env.SUPABASE_URL}/storage/v1${data.url}`, path });
}

// Step two: record the uploaded file as a pending item awaiting approval.
async function recordSubmission(req, res) {
  const { cat, label, cap, path, submitter, website } = req.body || {};

  // Honeypot: real people leave this empty. Bots fill it. Pretend success, drop it.
  if (website) return res.status(200).json({ ok: true, pending: true });

  if (!path || !label) return res.status(400).json({ error: 'Please add a photo and a title.' });
  if (!/^submissions\/[A-Za-z0-9._-]+$/.test(String(path))) {
    return res.status(400).json({ error: 'invalid path' });
  }

  const safeCat = ALLOWED_CATS.includes(cat) ? cat : 'Community';
  // Pending submissions are stored under a hidden category "_pending|<realCat>".
  // The public gallery hides any category starting with "_"; on approval the
  // admin restores the real category. This avoids needing a DB status column.
  const pendingCat = '_pending|' + safeCat;
  const L = clean(label, 80);
  let C = clean(cap, 160);
  const by = clean(submitter, 60);
  if (!L) return res.status(400).json({ error: 'Please add a title.' });
  if (by) C = (C ? C + ' ' : '') + '(submitted by ' + by + ')';

  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/gallery/${path}`;
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/gallery_items`, {
    method: 'POST',
    headers: {
      apikey: sr,
      Authorization: `Bearer ${sr}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ cat: pendingCat, label: L, cap: C, url }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `insert ${r.status}`);
  }
  return res.status(200).json({ ok: true, pending: true });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  // The rewrite marks the signing step; a stray `filename` body is accepted too
  // so the older two-endpoint clients keep working from any cached page.
  const wantsSign = (req.query && req.query.step === 'sign') || !!(req.body && req.body.filename);
  try {
    return wantsSign ? await signUpload(req, res) : await recordSubmission(req, res);
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) });
  }
}
