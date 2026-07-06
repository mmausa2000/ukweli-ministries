# Ukweli Ministries

Website for **Ukweli Ministries** — a Swahili-speaking Church of Christ in Iowa City, IA, and a media ministry reaching East Africa and beyond. *Ukweli* means **truth**.

Implemented from the Claude Design mock “Ukweli Ministries webpage mock” (`Ukweli Ministries.dc.html`).

## Structure

- `index.html` — home page (self-contained HTML/CSS/JS, no build step)
- `gallery.html` — photo gallery with category filters and a lightbox
- `admin.html` — upload/manage gallery photos and videos (requires the Rust server)
- `assets/` — logo, ministry photos, video thumbnails, app screenshots
- `server/` — Rust (Axum) backend: static hosting, photo & video uploads, newsletter signups
- `design/` — original Claude Design sources for reference

## Run

**With the Rust backend** (enables uploads from `/admin.html` and newsletter capture):

```sh
UKWELI_ADMIN_TOKEN=your-secret PORT=8080 cargo run --release --manifest-path server/Cargo.toml
# open http://localhost:8080 — run from the repo root
```

If `UKWELI_ADMIN_TOKEN` is unset, the server generates a token and prints it at startup.
Uploads land in `data/uploads/` (+ `data/gallery.json`); newsletter emails in `data/subscribers.jsonl`. The `data/` directory is gitignored.

API: `GET /api/gallery` · `POST /api/upload` (multipart: token, photo/video file, cat, label, cap; photos ≤20 MB, videos ≤500 MB) · `POST /api/delete` (JSON: token, id) · `POST /api/subscribe` (JSON: email).

**Static only** (no uploads — gallery shows the built-in photos, newsletter stores locally in the browser):

```sh
python3 -m http.server 8000
```

## Leadership

- **Meshak Maliyabwana** — President & Media
- **Selemani Bulako** — Secretary · Overseer, USA & Europe
- **Barnaba Kabwe** — Treasurer · Youth Representative
- **Amosi Kaswahili** — Tanzania Overseer
- **Ishmael V. Ndayishimiye** — Director · Main Pastor, Ukweli Church of Christ Iowa City (ordained 2026)

## Notes

- Filled in: map (Google Maps embed), Watch-section video cards (real broadcasts + thumbnails), and app cards (live-site screenshots). Still placeholders awaiting real photos: hero image, leadership portraits, and the gallery tiles.
- The newsletter form validates and remembers signup in `localStorage`; connect it to a real mailing-list backend when available.
- “Give Once” / “Partner Monthly” buttons currently anchor to the Give section — point them at a giving provider when one is chosen.
