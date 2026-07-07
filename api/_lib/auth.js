// Shared admin check: either the legacy shared token, or a Supabase Auth
// session (Google sign-in) whose email is on the UKWELI_ADMIN_EMAILS list.
export async function isAdmin(req, bodyToken) {
  if (bodyToken && bodyToken === process.env.UKWELI_ADMIN_TOKEN) return true;

  const h = req.headers.authorization || '';
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!jwt) return false;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return false;
    const u = await r.json();
    const allow = (process.env.UKWELI_ADMIN_EMAILS || '')
      .toLowerCase()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return !!u.email && allow.includes(u.email.toLowerCase());
  } catch (e) {
    return false;
  }
}
