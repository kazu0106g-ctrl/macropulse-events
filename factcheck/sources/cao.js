// Japan Cabinet Office (内閣府) economic statistics release schedule fetcher.
//
// Authoritative source:
//   https://www.esri.cao.go.jp/jp/stat/stat-schedule.html
//   (Economic and Social Research Institute release schedule)
//
// Covers indicators mapped to events.json id prefixes:
//   機械受注統計調査 → jp_machord_*
//
// NOTE: The schedule page is updated quarterly and typically shows only the
// next 3-4 months. Entries beyond the published schedule are not checked.
//
// ID convention: jp_machord_YYYYMM where MM = release month (not data month).
// The data reference month is approximately MM-2.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.esri.cao.go.jp/jp/stat/stat-schedule.html';
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const MONTHS_JP = {
  '1月': 1, '2月': 2, '3月': 3, '4月': 4, '5月': 5, '6月': 6,
  '7月': 7, '8月': 8, '9月': 9, '10月': 10, '11月': 11, '12月': 12,
};

// Indicator title substrings as they appear in the page (partial match).
const INDICATOR_MAP = [
  {
    match: /機械受注統計調査/,
    label: 'CAO Machinery Orders (機械受注)',
    eventPrefix: 'jp_machord',
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
          res.on('end', () => {
            // Page may be Shift-JIS or UTF-8; try both
            const buf = Buffer.concat(chunks);
            // Check for UTF-8 BOM or charset meta
            const raw = buf.toString('utf8');
            if (raw.includes('機械受注')) return resolve(raw);
            // Fallback: latin1 (handles Shift-JIS-like encodings imperfectly,
            // but good enough for extracting Japanese month patterns)
            resolve(buf.toString('latin1'));
          });
        },
      )
      .on('error', reject);
  });
}

async function fetchScheduleHtml({ cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const cachePath = path.join(cacheDir, 'cao_schedule.html');
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

// The schedule page has a table where each row lists:
//   [indicator section heading]  [month label e.g. "5月"]  [date e.g. "令和8年5月21日"]  [data period]
//
// We extract dates of the form 令和N年M月D日 or M月D日 under each indicator section.
function parseReiwaDate(text, defaultYear) {
  // "令和8年5月21日" → 2026-05-21
  const reiwaFull = text.match(/令和(\d+)年(\d+)月(\d+)日/);
  if (reiwaFull) {
    const reiwaYear = parseInt(reiwaFull[1], 10);
    const year = 2018 + reiwaYear; // 令和1 = 2019, 令和8 = 2026
    const month = parseInt(reiwaFull[2], 10);
    const day = parseInt(reiwaFull[3], 10);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // "5月21日" → use defaultYear
  const shortDate = text.match(/(\d+)月(\d+)日/);
  if (shortDate && defaultYear) {
    const month = parseInt(shortDate[1], 10);
    const day = parseInt(shortDate[2], 10);
    return `${defaultYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

// Parse the CAO schedule HTML into {date, prefix, dataLabel} entries.
//
// The page is a 5-column table with headers:
//   col 0: 景気動向指数速報
//   col 1: 景気動向指数改訂状況
//   col 2: 機械受注統計調査  ← target column
//   col 3: 消費動向調査
//   col 4: 法人企業景気予測調査
//
// We extract <tr> rows from the <tbody>, then take the 3rd <td> (index 2).
function parseScheduleEntries(html, year) {
  const entries = [];

  // Find the tbody section (after the thead)
  const tbodyStart = html.indexOf('<tbody>');
  const tbodyEnd = html.indexOf('</tbody>', tbodyStart);
  if (tbodyStart < 0 || tbodyEnd < 0) return entries;
  const tbody = html.slice(tbodyStart, tbodyEnd);

  // Split on <tr> blocks
  const rowRe = /<tr>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(tbody))) {
    const row = rowMatch[1];
    // Extract all <td> cells
    const cellRe = /<td>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRe.exec(row))) {
      cells.push(cellMatch[1]);
    }
    // Column 2 (index 2) = 機械受注
    if (cells.length < 3) continue;
    const machordCell = cells[2];
    const dateStr = parseReiwaDate(machordCell, year);
    if (!dateStr) continue;
    if (!dateStr.startsWith(`${year}-`)) continue;
    entries.push({ date: dateStr, prefix: 'jp_machord', label: 'CAO Machinery Orders (機械受注)' });
  }
  return entries;
}

// Returns one record per indicator per release month found in year.
async function getReleases(year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchScheduleHtml(opts);
  const raw = parseScheduleEntries(html, year);

  // Deduplicate by (prefix, release month), keeping later dates.
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
  fetchScheduleHtml,
  getReleases,
  _internals: { parseScheduleEntries, parseReiwaDate },
};
