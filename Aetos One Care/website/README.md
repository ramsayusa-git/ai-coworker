# Aetos One Care — marketing site

Static, dependency-free site. 11 pages, one stylesheet, one script.
Design concept: **"The Signal"** — clinical-night palette, live vitals as the hero motif,
bento composition, glass surfaces over a gradient mesh, teal (`--signal`) reserved for live data.

## Run

```bash
cd "Aetos One Care/website"
python3 -m http.server 8020        # http://localhost:8020
```

## Edit

Pages are **generated** — do not hand-edit the `.html` files, they are overwritten.

```bash
python3 build.py                   # regenerates all 11 pages
```

- `build.py` — shared head/nav/footer, section components (`cards`, `feature_rows`, `cta`,
  `page_hero`), the inline architecture SVG, and one function per page.
- `assets/css/site.css` — design tokens and every component. Dark is default; `[data-theme="light"]`
  is a full token swap driven by the nav toggle (persisted in `localStorage`).
- `assets/js/site.js` — theme toggle, sticky nav, scroll reveal (with fail-safes), count-ups,
  hero vitals ticker, comparison-table filter, demo form handler.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Home — hero consult mock, the three-industry gap, the four-step loop, product bento, comparison strip, compliance, FAQ |
| `platform.html` | Architecture (inline SVG, 4 lanes), the loop in detail, AI agent layer |
| `devices.html` | Aetos One Signal — device classes, registry, integration posture |
| `care.html` | Patient web product — 9 shipped features, portability argument |
| `mobile.html` | Android patient app |
| `doctor.html` | Doctor console — includes the honest "if you only want a scribe, buy a scribe" section |
| `admin.html` | Hospital/chain console, deployment models |
| `compare.html` | 32-product filterable comparison table + four findings |
| `compliance.html` | CDSCO / DPDPA / ABDM posture and a have/have-not status table |
| `pricing.html` | Published pricing + what every other Indian vendor charges |
| `contact.html` | Demo request form (static — wire to a backend before launch) |

## Research behind the content

Structure and messaging patterns were taken from live competitor sites (Sep 2026): Eka Care
(product-suite grid, stats band, certification badges), Teladoc (audience-segmented nav, stat
blocks), Apollo 24|7 (service entry tiles, legacy trust), One Medical (whitespace, single clear
price), Practo (specialty tiles), Dozee (regulatory badge in hero, outcome stats, technology
explainer). Competitor facts come from `../India-Healthtech-Competitive-Landscape.md`.

## Before launch

- Wire `contact.html` to a backend or CRM — the form currently only shows a notice.
- Replace the demo metrics on the home hero if they change (`data-count` attributes).
- Self-host the three Google fonts if you want zero third-party requests.
- Every product claim marked "in build" / "planned" on `compliance.html` must be re-checked at launch.
