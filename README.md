# Ukweli Ministries

Website for **Ukweli Ministries** — a Swahili-speaking Church of Christ in Iowa City, IA, and a media ministry reaching East Africa and beyond. *Ukweli* means **truth**.

Implemented from the Claude Design mock “Ukweli Ministries webpage mock” (`Ukweli Ministries.dc.html`).

## Structure

- `index.html` — home page (self-contained HTML/CSS/JS, no build step)
- `gallery.html` — photo gallery with category filters and a lightbox
- `assets/um-logo.png` — ministry logo (used as favicon / social image)
- `design/` — original Claude Design sources for reference

## Run locally

Any static server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Notes

- The map (Google Maps embed) and the Watch-section video cards (real broadcasts + downloaded YouTube thumbnails in `assets/`) are filled in. Still placeholders awaiting real photos: hero image, leadership portraits, app screenshots, and the gallery tiles.
- The newsletter form validates and remembers signup in `localStorage`; connect it to a real mailing-list backend when available.
- “Give Once” / “Partner Monthly” buttons currently anchor to the Give section — point them at a giving provider when one is chosen.
