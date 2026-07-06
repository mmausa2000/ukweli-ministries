// Vercel serverless function: latest broadcasts from the Ukweli YouTube
// channel feed, so the Watch section never goes stale.
const CHANNEL_ID = 'UCb0-1hoSfl-2YDSbfXRMQdg';

export default async function handler(req, res) {
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
    if (!r.ok) throw new Error(`feed ${r.status}`);
    const xml = await r.text();

    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    const vids = entries
      .map((e) => ({
        id: (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1],
        title: ((e.match(/<media:title>([\s\S]*?)<\/media:title>/) || [])[1] || '').trim(),
        published: (e.match(/<published>(.*?)<\/published>/) || [])[1] || '',
      }))
      .filter((v) => v.id);

    // Prefer full IBADA services; fall back to any uploads if fewer than 4.
    const ibada = vids.filter((v) => /IBADA\s*\d+/i.test(v.title));
    const pick = (ibada.length >= 4 ? ibada : vids).slice(0, 4);

    const label = (v) => {
      const m = v.title.match(/IBADA\s*(\d+)/i);
      const year = v.published.slice(0, 4);
      if (m) return `IBADA ${m[1]} · ${year}`;
      const t = v.title.split('|')[0].trim();
      return t.length > 42 ? t.slice(0, 42) + '…' : t;
    };

    const out = pick.map((v) => ({ id: v.id, label: label(v), title: v.title }));
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ featured: out[0] || null, recent: out.slice(1, 4) });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
}
