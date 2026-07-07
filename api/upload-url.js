// Admin: mint a signed upload URL so the browser sends the file straight to
// Supabase Storage (bypasses the serverless body-size limit).
import { isAdmin } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const { token, filename } = req.body || {};
  if (!(await isAdmin(req, token))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const safe = String(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${safe}`;
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
    res.status(200).json({
      uploadUrl: `${process.env.SUPABASE_URL}/storage/v1${data.url}`,
      path,
    });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
