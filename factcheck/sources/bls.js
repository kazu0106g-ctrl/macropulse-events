// US BLS (Bureau of Labor Statistics) release schedule fetcher.
//
// Authoritative source: https://www.bls.gov/schedule/news_release/<release>.htm
// Each release has its own page with a table of (Reference period, Release
// date, Release time). We parse raw HTML — no LLM in the data path.
//
// Supported releases (mapped to events.json id prefixes):
//   empsit  → us_nfp_*, us_unemployment_*
//   cpi     → us_cpi_*, us_core_cpi_*
//   ppi     → us_ppi_*

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Mapping of "release key" → BLS schedule URL + events.json id prefixes
// that share that release date.
const RELEASES = {
  empsit: {
    url: 'https://www.bls.gov/schedule/news_release/empsit.htm',
    label: 'BLS Employment Situation',
    eventPrefixes: ['us_nfp', 'us_unemployment'],
  },
  cpi: {
    url: 'https://www.bls.gov/schedule/news_release/cpi.htm',
    label: 'BLS CPI',
    eventPrefixes: ['us_cpi', 'us_core_cpi'],
  },
  ppi: {
    url: 'https://www.bls.gov/schedule/news_release/ppi.htm',
    label: 'BLS PPI',
    eventPrefixes: ['us_ppi'],
  },
};

const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  January: 1, February: 2, March: 3, April: 4, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; macropulse-events-factcheck/1.0; kazu0106g@gmail.com)',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        (res) => {
          if (
            (res.statusCode === 301 ||
              res.statusCode === 302 ||
              res.statusCode === 303 ||
              res.statusCode === 307) &&
            res.headers.location
          ) {
            res.resume();
            return fetchUrl(new URL(res.headers.location, url).toString(), redirects + 1).then(
              resolve,
              reject,
            );
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        },
      )
      .on('error', reject);
  });
}

async function fetchReleaseHtml(releaseKey, { cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const release = RELEASES[releaseKey];
  if (!release) throw new Error(`Unknown BLS release: ${releaseKey}`);
  const cachePath = path.join(cacheDir, `bls_${releaseKey}.html`);
  if (useCache) {
    try {
      const stat = fs.statSync(cachePath);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        return { html: fs.readFileSync(cachePath, 'utf8'), fromCache: true, cachedAt: stat.mtime };
      }
    } catch (_) {}
  }
  const html = await fetchUrl(release.url);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, html, 'utf8');
  return { html, fromCache: false, cachedAt: new Date() };
}

// Each row of the BLS release table has the form:
//   <td>Reference period (e.g. "April 2026")</td>
//   <td>Release date (e.g. "May 08, 2026" or "May 8, 2026")</td>
//   <td>Release time</td>
// We pull tuples in document order and zip every 3 cells into one row.
function parseScheduleTable(html) {
  const cells = [];
  const re = /<td>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(html))) {
    cells.push(m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
  }
  const rows = [];
  for (let i = 0; i + 2 < cells.length; i += 3) {
    rows.push({ refPeriod: cells[i], releaseDate: cells[i + 1], releaseTime: cells[i + 2] });
  }
  return rows;
}

function parseRefPeriod(text) {
  // "April 2026", "1st Quarter 2026", "March 2026", "December 2025"
  const m = text.match(/([A-Z][a-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  const year = parseInt(m[2], 10);
  if (!month) return null;
  return { year, month };
}

function parseReleaseDate(text) {
  // "May 08, 2026" or "Apr. 03, 2026" or "May 8, 2026"
  const m = text.match(/([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (!month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function getReleases(releaseKey, year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchReleaseHtml(releaseKey, opts);
  const release = RELEASES[releaseKey];
  const rows = parseScheduleTable(html);
  const out = [];
  for (const r of rows) {
    const ref = parseRefPeriod(r.refPeriod);
    const date = parseReleaseDate(r.releaseDate);
    if (!ref || !date) continue;
    if (!date.startsWith(`${year}-`)) continue;
    out.push({ refYear: ref.year, refMonth: ref.month, releaseDate: date, refLabel: r.refPeriod });
  }
  return {
    releaseKey,
    label: release.label,
    eventPrefixes: release.eventPrefixes,
    source: release.url,
    year,
    fromCache,
    cachedAt,
    releases: out,
  };
}

module.exports = {
  RELEASES,
  fetchReleaseHtml,
  getReleases,
  _internals: { parseScheduleTable, parseRefPeriod, parseReleaseDate },
};
