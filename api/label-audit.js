// Public, read-only export of every gallery picture and its current labels.
// Burst rows are expanded so each underlying picture receives its own code.

import { isDuplicateConventionExtra, organizeGalleryRow } from './_lib/gallery-organize.js';

const STATIC_ITEMS = [
  ['Worship', 'In prayer', 'A moment of prayer', 'assets/mali-prayer.webp'],
  ['Missions', 'Preaching in the community', 'Sharing the Word in the streets of Tanzania', 'assets/tz-outreach-1.webp'],
  ['Missions', 'Street preaching', 'Open-air outreach in Tanzania', 'assets/tz-outreach-2.webp'],
  ['Missions', 'Taking the Word out', 'Street ministry in Tanzania', 'assets/tz-outreach-3.webp'],
  ['Missions', 'Into the streets', 'Evening outreach in Tanzania', 'assets/tz-outreach-4.webp'],
  ['Missions', 'At the market', 'Preaching where people gather', 'assets/tz-outreach-5.webp'],
  ['Missions', 'The open road', 'Street preaching in Tanzania', 'assets/tz-outreach-6.webp'],
  ['Missions', 'Marketplace ministry', 'The Word among the kiosks', 'assets/tz-outreach-7.webp'],
  ['Missions', 'Boldness', 'Open-air preaching in Tanzania', 'assets/tz-outreach-8.webp'],
  ['Missions', 'House gathering', 'The Word shared at home', 'assets/tz-outreach-9.webp'],
  ['Missions', 'With joy', 'Open-air outreach in Tanzania', 'assets/tz-outreach-10.webp'],
  ['Missions', 'Lifting the Word', 'Scripture raised in the streets', 'assets/tz-outreach-11.webp'],
  ['Missions', 'Every corner', 'Street ministry in Tanzania', 'assets/tz-outreach-12.webp'],
  ['Missions', 'Village fellowship', 'Gathered around the Word', 'assets/tz-outreach-13.webp'],
  ['Missions', 'City outreach', 'Carrying the sound into the city', 'assets/tz-outreach-14.webp'],
  ['Missions', 'In the villages', 'Preaching in the highlands', 'assets/tz-outreach-15.webp'],
  ['Missions', 'Roadside witness', 'Street preaching in Tanzania', 'assets/tz-outreach-16.webp'],
  ['Missions', 'To the hills', 'The Word in the countryside', 'assets/tz-outreach-17.webp'],
];

function codeOf(id) {
  return String(id || '').replace(/-/g, '').slice(0, 5).toUpperCase();
}

function fileOf(url) {
  return String(url || '').split('?')[0].split('#')[0].split('/').pop() || '(unknown file)';
}

function expandItem(item, baseCode) {
  const sources = item.frames && item.frames.length ? item.frames : [item.img];
  return sources.map((src, index) => ({
    code: baseCode + (sources.length > 1 ? `-${String(index + 1).padStart(2, '0')}` : ''),
    id: item.id || '',
    file: fileOf(src),
    kind: item.kind || (/\.(mp4|webm|mov)$/i.test(fileOf(src)) ? 'video' : 'photo'),
    storedCat: item.storedCat || item.cat || '',
    websiteCat: item.cat || '',
    storedLabel: item.storedLabel || item.label || '',
    websiteLabel: item.label || '',
    cap: item.cap || '',
    duplicate: Boolean(item.duplicate),
    src: src || '',
  }));
}

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
    const sourceRows = await r.json();
    const frames = new Map();
    for (const row of sourceRows) {
      if (String(row.cat || '') !== '_frames') continue;
      try {
        const list = JSON.parse(row.cap || '[]');
        if (Array.isArray(list) && list.length > 1) frames.set(row.label, list);
      } catch {}
    }

    const publicRows = sourceRows
      .filter((row) => !String(row.cat || '').startsWith('_'))
      .map((row) => {
        const organized = organizeGalleryRow(row);
        return {
          id: row.id,
          storedCat: row.cat,
          storedLabel: row.label,
          cat: organized.cat,
          label: organized.label,
          cap: row.cap || '',
          img: row.url,
          kind: /\.(mp4|webm|mov)(\?|$)/i.test(row.url) ? 'video' : 'photo',
          frames: frames.get(row.url) || undefined,
          duplicate: isDuplicateConventionExtra(row),
        };
      });

    const entries = [];
    for (const item of publicRows) entries.push(...expandItem(item, codeOf(item.id)));
    STATIC_ITEMS.forEach((item, index) => {
      const [cat, label, cap, img] = item;
      entries.push(...expandItem(
        { cat, label, cap, img, kind: 'photo' },
        `STATIC-${String(index + 1).padStart(3, '0')}`,
      ));
    });

    const lines = [
      'UKWELI MINISTRIES — COMPLETE PICTURE LABEL AUDIT',
      `Generated: ${new Date().toISOString()}`,
      `Pictures/videos listed: ${entries.length}`,
      `Exact duplicate gallery records marked to hide: ${publicRows.filter((item) => item.duplicate).length}`,
      '',
      'Use the code to find the exact gallery tile. Burst frames add -01, -02, etc.',
      'Stored labels are copied exactly; website labels show the corrected organization.',
      'Duplicates remain listed here for accountability but are hidden from the public gallery.',
      'Named people are marked for confirmation rather than guessed.',
      '',
    ];
    entries.forEach((entry, index) => {
      const namesNeedReview = /\b(Apostle|Bishop|Pastor|Evangelist|Minister|Mother)\b/i.test(entry.cap);
      lines.push(
        `${String(index + 1).padStart(4, '0')}. [${entry.code}] ${entry.file}`,
        `Record ID: ${entry.id || '(built-in picture)'}`,
        `Type: ${entry.kind}`,
        `Stored category: ${entry.storedCat}`,
        `Website category: ${entry.websiteCat}`,
        `Stored title: ${entry.storedLabel}`,
        `Website title: ${entry.websiteLabel}`,
        `Current caption: ${entry.cap || '(none)'}`,
        `Organization action: ${entry.duplicate ? 'HIDE this exact duplicate copy; keep the baptism-2026 copy.' : 'Keep visible in the category above.'}`,
        `People check: ${namesNeedReview ? 'CONFIRM every named person in this exact picture.' : 'No named-person check required.'}`,
        `Image: ${entry.src}`,
        '',
      );
    });

    const body = `${lines.join('\n')}\n`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ukweli-ministries-picture-label-audit.txt"');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(body);
  } catch (error) {
    res.status(502).send(`Could not build label audit: ${String(error && error.message || error)}`);
  }
}
