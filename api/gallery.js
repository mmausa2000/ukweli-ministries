// Public: list gallery items (newest first) from Supabase.
// Hidden rows use a category starting with "_" (e.g. "_site" for hero photos,
// "_content" for editable text, "_pending|Cat" for unapproved submissions).
// Those are filtered out here so only approved public photos are shown.
export default async function handler(req, res) {
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/gallery_items?select=*&order=created_at.desc`,
      {
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    const rows = await r.json();
    // Burst frames: a "_frames" row holds the full shot list for one moment,
    // keyed by its cover URL. Attached here so the gallery shows ONE tile per
    // moment that expands to the rest, instead of a wall of near-identical shots.
    const frames = new Map();
    for (const x of rows) {
      if (String(x.cat || '') !== '_frames') continue;
      try {
        const list = JSON.parse(x.cap || '[]');
        if (Array.isArray(list) && list.length > 1) frames.set(x.label, list);
      } catch {}
    }
    const items = rows
      .filter((x) => !String(x.cat || '').startsWith('_'))
      .map((x) => ({
        id: x.id,
        cat: x.cat,
        label: x.label,
        cap: x.cap || '',
        img: x.url,
        kind: /\.(mp4|webm|mov)(\?|$)/i.test(x.url) ? 'video' : 'photo',
        frames: frames.get(x.url) || undefined,
      }));
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json(items);
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
