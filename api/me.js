// Who am I: returns the signed-in user's profile and whether they are a site admin.
import { isAdmin } from './_lib/auth.js';

export default async function handler(req, res) {
  const h = req.headers.authorization || '';
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!jwt) return res.status(401).json({ error: 'no session' });
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return res.status(401).json({ error: 'invalid session' });
    const u = await r.json();
    const admin = await isAdmin(req, null);
    res.status(200).json({
      email: u.email,
      name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '',
      avatar: (u.user_metadata && u.user_metadata.avatar_url) || '',
      isAdmin: admin,
    });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
