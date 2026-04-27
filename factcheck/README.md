# events.json Fact Checker

Compares `events.json` dates against authoritative issuer pages and reports
discrepancies. **Never edits `events.json` automatically** — human review is
required before any change.

## Why this exists

`events.json` was originally built by a one-shot bulk LLM expansion. That run
silently flipped multiple BOJ dates (e.g. April 2026 changed from 4/28 to 4/30,
and several other meetings ended up on Day 1 instead of the announcement day).
This tool exists so any future drift is caught quickly.

## Trust model

The whole point is to NOT be misled by a wrong date on any single site, even
ours. The rules:

1. **Authoritative source = the issuer**, parsed from raw HTML.
   - BOJ rate decisions  → `boj.or.jp` (implemented)
   - FOMC               → `federalreserve.gov` (planned)
   - ECB                → `ecb.europa.eu` (planned)
2. **No LLM summary in the data path.** We pull HTML, regex it, and use the
   structured result. LLMs are useful for exploring page structure once, never
   for runtime extraction.
3. **Aggregator quorum (future).** For events without a single issuer
   (third-party calendars), require ≥2 independent aggregators to agree on a
   different date than `events.json` before flagging.
4. **Reports only.** This tool always exits with a markdown report. The user
   reviews and edits `events.json` themselves — or asks an agent to apply the
   fix after eyeballing the report.

## Usage

```bash
node factcheck/factcheck.js                # check current and next year
node factcheck/factcheck.js --year 2026    # specific year
node factcheck/factcheck.js --no-cache     # bypass 24h HTML cache
```

Reports land in `factcheck/reports/factcheck_YYYY-MM-DD.md`.

Exit code:
- `0` — all OK
- `2` — at least one mismatch found (useful for scheduled tasks)

## Adding a new source

1. Create `factcheck/sources/<name>.js` exporting `get<Name>Events(year, opts)`.
2. Implement `fetch<Name>Html` with a 24h cache (see `boj.js` for a template).
3. Parse the raw HTML with regex / structural matching.
4. Return events with the same shape used by `factcheck.js` consumers.
5. Wire it into `factcheck.js`'s main loop.

## Layout

```
factcheck/
├── README.md
├── factcheck.js             # entry, generates report
├── sources/
│   ├── boj.js               # BOJ official schedule fetcher/parser
│   └── *.html               # cached HTML (gitignored)
├── cache/                   # alternate cache dir (gitignored)
└── reports/
    └── factcheck_*.md       # output reports (kept in repo for history)
```
