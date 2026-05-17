// e-Stat (https://www.e-stat.go.jp) release calendar fetcher for Japanese statistics.
//
// Authoritative source: https://www.e-stat.go.jp/release-calendar
// The page lists all upcoming government statistics publication dates (UTF-8, ~300KB).
// It only contains entries for the current month's upcoming releases.
//
// Covers:
//   消費者物価指数（全国）           → jp_cpi_*, jp_core_cpi_*
//   労働力調査（基本集計）            → jp_unemp_*
//   商業動態統計調査（速報）          → jp_retail_*
//   鉱工業生産・出荷・在庫指数（速報）→ jp_indprod_*
//
// ID convention: jp_{indicator}_{YYYYMM} where YYYYMM = release month.
// The data reference month is approximately YYYYMM-1 for CPI/unemp,
// and YYYYMM-2 for retail/indprod (速報).
//
// NOTE: e-Stat only publishes upcoming entries for the current month.
//       This source can only verify near-term scheduled dates, not the full year.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.e-stat.go.jp/release-calendar';
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Maps e-Stat title patterns → event prefix(es).
// exclude: skip entries matching this pattern (e.g. 確報 = revised final, 東京 = Tokyo only).
const INDICATOR_MAP = [
  {
    match: /消費者物価指数\s*全国/,
    exclude: /東京|確報/,
    prefixes: ['jp_cpi', 'jp_core_cpi'],
    label: 'Japan CPI (消費者物価指数・全国)',
  },
  {
    match: /労働力調査/,
    exclude: /詳細集計|長期時系列|四半期/,
    prefixes: ['jp_unemp'],
    label: 'Japan Unemployment Rate (労働力調査)',
  },
  {
    match: /商業動態統計.*速報/,
    exclude: /確報/,
    prefixes: ['jp_retail'],
    label: 'Japan Retail Sales (商業動態統計・速報)',
  },
  {
    match: /鉱工業生産.*速報/,
    exclude: /確報/,
    prefixes: ['jp_indprod'],
    label: 'Japan Industrial Production (鉱工業生産・速報)',
  },
];

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
            'Accept-Language': 'ja,en;q=0.9',
          },
        },
        (res) => {
          if (
            (res.statusCode === 301 || res.statusCode === 302 ||
             res.statusCode === 303 || res.statusCode === 307) &&
            res.headers.location
          ) {
            res.resume();
            return fetchUrl(
              new URL(res.headers.location, url).toString(),
              redirects + 1,
            ).then(resolve, reject);
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

async function fetchCalendarHtml({ cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const cachePath = path.join(cacheDir, 'estat_jp_calendar.html');
  if (useCache) {
    try {
      const stat = fs.statSync(cachePath);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        return { html: fs.readFileSync(cachePath, 'utf8'), fromCache: true, cachedAt: stat.mtime };
      }
    } catch (_) {}
  }
  const html = await fetchUrl(URL);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, html, 'utf8');
  return { html, fromCache: false, cachedAt: new Date() };
}

// Parse the e-Stat release calendar HTML.
//
// Each entry has the form:
//   <span data-kensakuKouhyou_date="YYYYMMDDHHmm">
//     <a href="./release-calendar/detail/{statsId}/{YYYYMMDDHHmm}">
//       {indicator title}
//     </a>
//   </span>
//   <span class="stat-announce-keisaiday">
//     2026-05-22  08:30
//   </span>
//
// We extract date from the data-kensakuKouhyou_date attribute (first 8 chars = date).
function parseCalendarEntries(html, year) {
  const entries = [];

  // Match each entry: data attribute + title in the following anchor
  const re = /data-kensakuKouhyou_date="(\d{12})"[^>]*>[\s\S]*?href="[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const dt = m[1]; // YYYYMMDDHHmm
    const releaseYear = parseInt(dt.slice(0, 4), 10);
    if (releaseYear !== year) continue;
    const releaseMonth = parseInt(dt.slice(4, 6), 10);
    const releaseDay = parseInt(dt.slice(6, 8), 10);
    const date = `${releaseYear}-${String(releaseMonth).padStart(2, '0')}-${String(releaseDay).padStart(2, '0')}`;

    const title = m[2].replace(/\s+/g, ' ').trim();

    for (const indicator of INDICATOR_MAP) {
      if (!indicator.match.test(title)) continue;
      if (indicator.exclude && indicator.exclude.test(title)) continue;
      for (const prefix of indicator.prefixes) {
        entries.push({ date, prefix, label: indicator.label, title });
      }
      break; // only one indicator per entry
    }
  }
  return entries;
}

// Returns one record per indicator per release month found in year.
async function getReleases(year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchCalendarHtml(opts);
  const raw = parseCalendarEntries(html, year);

  // Deduplicate: one entry per (prefix, release month).
  const byKey = {};
  for (const entry of raw) {
    const releaseMonth = parseInt(entry.date.slice(5, 7), 10);
    const releaseYear = parseInt(entry.date.slice(0, 4), 10);
    const yyyymm = `${releaseYear}${String(releaseMonth).padStart(2, '0')}`;
    const key = `${entry.prefix}_${yyyymm}`;
    if (!byKey[key] || entry.date > byKey[key].releaseDate) {
      byKey[key] = {
        eventId: key,
        releaseDate: entry.date,
        label: entry.label,
        prefix: entry.prefix,
      };
    }
  }

  return {
    source: URL,
    year,
    fromCache,
    cachedAt,
    releases: Object.values(byKey),
  };
}

module.exports = {
  URL,
  fetchCalendarHtml,
  getReleases,
  INDICATOR_MAP,
  _internals: { parseCalendarEntries },
};
