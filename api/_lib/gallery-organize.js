// Curated organization rules for the public gallery.
//
// The uploaded WebP files no longer contain EXIF capture dates. These rules use
// the storage folder, original camera filename/sequence, existing captions, and
// a visual review of representative images. Uncertain dates stay conservative.

const EXACT_DUPLICATE_EXTRA_FILES = new Set([
  'IMG_4504', 'IMG_4506',
  'IMG_4635', 'IMG_4636', 'IMG_4637', 'IMG_4638',
  'IMG_4639', 'IMG_4640', 'IMG_4641', 'IMG_4642',
  'IMG_4644', 'IMG_4645', 'IMG_4646', 'IMG_4647',
  'IMG_7393',
  'IMG_7396', 'IMG_7397', 'IMG_7398', 'IMG_7399',
  'IMG_7402', 'IMG_7403', 'IMG_7404',
  'IMG_7407', 'IMG_7408', 'IMG_7409', 'IMG_7410', 'IMG_7411', 'IMG_7412',
]);

function cleanPath(url) {
  try { return decodeURIComponent(new URL(String(url || '')).pathname); } catch {}
  return decodeURIComponent(String(url || '').split('?')[0].split('#')[0]);
}

export function galleryLocation(url) {
  const path = cleanPath(url);
  const pieces = path.split('/').filter(Boolean);
  const filename = pieces.pop() || '';
  const stem = filename.replace(/\.[^.]+$/, '').toUpperCase();
  return {
    folder: (pieces.pop() || '').toLowerCase(),
    filename,
    stem,
  };
}

export function isDuplicateConventionExtra(row) {
  const { folder, stem } = galleryLocation(row && (row.url || row.img));
  return folder === 'convention-extra' && EXACT_DUPLICATE_EXTRA_FILES.has(stem);
}

function baptismMention(row) {
  return /\bbapti(?:sm|smal|zing|zed|sing|sed)\b/i.test(`${row.label || ''} ${row.cap || ''}`);
}

export function organizeGalleryRow(row) {
  const organized = { ...row };
  const { folder, stem } = galleryLocation(row && (row.url || row.img));
  const rawCategory = String(row.cat || '');

  // Three older pictures were filed as Missions/Community even though their own
  // titles identify them as baptism pictures.
  if (!folder.match(/^(baptism-2026|convention-2026|convention-day23|convention-extra|service-2026)$/)
      && baptismMention(row)) {
    organized.cat = 'Baptism';
    return organized;
  }

  if (folder === 'convention-2026') {
    organized.cat = 'After Baptism';
    organized.label = 'Holy Convention 2026 — July 18';
    return organized;
  }

  if (folder === 'service-2026') {
    organized.cat = 'After Service';
    organized.label = 'Holy Convention 2026 — July 19';
    return organized;
  }

  if (folder === 'convention-day23') {
    if (/awards/i.test(rawCategory)) {
      organized.cat = 'Awards';
      organized.label = 'Holy Convention 2026 — July 19';
    } else if (/^baptism$/i.test(rawCategory)) {
      organized.cat = 'Baptism';
      organized.label = 'Holy Convention 2026 — July 18';
    } else {
      organized.cat = 'After Baptism';
      organized.label = 'Holy Convention 2026 — July 19';
    }
    return organized;
  }

  if (folder === 'convention-extra') {
    if (stem === 'IMG_5190' || stem === 'IMG_5198') {
      organized.cat = 'Baptism';
      organized.label = 'Holy Convention 2026 — Baptism';
    } else if (/^baptism$/i.test(rawCategory)) {
      organized.cat = 'Baptism';
      organized.label = 'Holy Convention 2026 — July 18';
    } else {
      organized.cat = 'After Baptism';
      organized.label = 'Holy Convention 2026 — July 19';
    }
    return organized;
  }

  if (folder === 'baptism-2026') {
    if (stem === 'IMG_7412' || /after/i.test(rawCategory)) {
      organized.cat = 'After Baptism';
      organized.label = /^Holy Convention 2026\s*—\s*July 19$/i.test(row.label || '')
        ? 'Holy Convention 2026 — July 19'
        : 'Holy Convention 2026 — July 18';
    } else {
      organized.cat = 'Baptism';
      organized.label = 'Holy Convention 2026 — July 18';
    }
    return organized;
  }

  if (/after the baptism/i.test(rawCategory)) organized.cat = 'After Baptism';
  if (/day 2\s*—\s*after service|church service/i.test(rawCategory)) organized.cat = 'After Service';
  return organized;
}
