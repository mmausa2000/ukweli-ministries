// Email alerts to the admins (UKWELI_ADMIN_EMAILS) through Resend, installed
// from the Vercel Marketplace (RESEND_API_KEY). NOTIFY_FROM must be an address
// on a domain verified in Resend; until then Resend only delivers from its test
// sender to the Resend account's own email. A failed alert never fails the
// visitor's request: it is logged and skipped.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function admins() {
  return (process.env.UKWELI_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function send({ subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const to = admins();
  if (!key || !to.length) return;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || 'Ukweli Ministries <onboarding@resend.dev>',
      to,
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// A new baptism certificate request is waiting for review. No photo, no link
// to the requester's private page: just enough to go and open /admin.
export async function notifyCertRequest(fields, origin) {
  const rows = [
    ['Name', fields.full_name],
    ['Baptism date', fields.baptism_date],
    ['Place', fields.place],
    ['Baptized by', fields.officiant],
    ['Contact', fields.contact || '—'],
  ];
  const admin = `${origin}/admin`;
  try {
    await send({
      subject: `New baptism certificate request: ${fields.full_name}`,
      text: `A new baptism certificate request is waiting for approval.\n\n${rows
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')}\n\nReview it: ${admin}`,
      html: `<p>A new baptism certificate request is waiting for approval.</p>
<table cellpadding="4" style="border-collapse:collapse">${rows
        .map(([k, v]) => `<tr><td style="color:#8A7C68">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`)
        .join('')}</table>
<p><a href="${esc(admin)}" style="color:#B0542F">Review it in the admin page</a></p>`,
    });
  } catch (e) {
    console.error('notifyCertRequest', e.message);
  }
}
