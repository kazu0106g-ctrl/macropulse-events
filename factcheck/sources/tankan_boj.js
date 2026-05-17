// BOJ Tankan (企業短期経済観測調査) release schedule fetcher.
//
// Authoritative source: https://www.boj.or.jp/statistics/tk/yoshi/index.htm
// The page lists past Tankan release dates (掲載日) and survey months (調査対象月).
//
// Release pattern (consistent since 2023):
//   Q1 (March survey):    Released April 1
//   Q2 (June survey):     Released July 1
//   Q3 (September survey):Released October 1 (or October 2 in rare cases)
//   Q4 (December survey): Released mid-December (13th-15th)
//
// ID convention: jp_tankan_{year}Q{dataQuarter}
//   jp_tankan_2026Q2 = Q2 2026 data (June survey) → released July 1, 2026
//   jp_tankan_2026Q3 = Q3 2026 data (September survey) → released October 1, 2026
//
// This source can confirm past releases and project near-future ones from the pattern.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.boj.or.jp/statistics/tk/yoshi/index.htm';
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

async function fetchYoshiHtml({ cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const cachePath = path.join(cacheDir, 'tankan_boj_yoshi.html');
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

// Parse "2026年 4月 1日" or "2026年&nbsp;4月&nbsp;1日" → "2026-04-01"
function parseJpDate(text) {
  const m = text.match(/(\d{4})年\s*&?n?b?s?p?;?\s*(\d{1,2})月\s*&?n?b?s?p?;?\s*(\d{1,2})日/);
  if (!m) {
    // Try without nbsp
    const m2 = text.match(/(\d{4})年[\s ]*(\d{1,2})月[\s ]*(\d{1,2})日/);
    if (!m2) return null;
    return `${m2[1]}-${String(parseInt(m2[2])).padStart(2, '0')}-${String(parseInt(m2[3])).padStart(2, '0')}`;
  }
  return `${m[1]}-${String(parseInt(m[2])).padStart(2, '0')}-${String(parseInt(m[3])).padStart(2, '0')}`;
}

// Parse "2026年3月調査" → { year: 2026, month: 3 }  (data reference month)
function parseSurveyMonth(text) {
  const m = text.match(/(\d{4})年(\d{1,2})月調査/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

// Map survey month → data quarter (1-4)
function surveyMonthToQuarter(month) {
  if (month === 3)  return 1;
  if (month === 6)  return 2;
  if (month === 9)  return 3;
  if (month === 12) return 4;
  return null;
}

// Parse the BOJ Tankan yoshi index HTML.
// The table has two columns: 掲載日 (release date) | 調査対象月 (survey month).
// We return confirmed release dates from past entries, and project future ones from the pattern.
function parseTankanSchedule(html, year) {
  const entries = [];

  // Find tbody
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return entries;

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(tbodyMatch[1]))) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((c) => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    if (cells.length < 2) continue;

    const releaseDate = parseJpDate(cells[0]);
    if (!releaseDate) continue;

    const survey = parseSurveyMonth(cells[1]);
    if (!survey) continue;

    // The eventId is based on the DATA year/quarter (survey reference)
    const dataYear = survey.year;
    const quarter = surveyMonthToQuarter(survey.month);
    if (!quarter) continue;

    // Only return entries where the release date falls in the target year
    const releaseYear = parseInt(releaseDate.slice(0, 4), 10);
    if (releaseYear !== year) continue;

    const eventId = `jp_tankan_${dataYear}Q${quarter}`;
    entries.push({
      eventId,
      releaseDate,
      label: `BOJ Tankan ${dataYear} Q${quarter} (${survey.month}月調査)`,
      prefix: 'jp_tankan',
      confirmed: true,
    });
  }

  return entries;
}

// Project future Tankan dates for a year based on historical pattern.
// Only used when the BOJ has not yet published the actual date.
//
// Pattern (consistent 2023-2025):
//   Q1 March survey  → April 1
//   Q2 June survey   → July 1
//   Q3 Sep survey    → October 1
//   Q4 Dec survey    → December 15 (estimated; actual: 13-15)
function projectFutureEntries(year, confirmedIds) {
  const projected = [];
  const projections = [
    { dataYear: year, quarter: 1, releaseMonth:  4, releaseDay:  1 }, // Q1, Apr 1
    { dataYear: year, quarter: 2, releaseMonth:  7, releaseDay:  1 }, // Q2, Jul 1
    { dataYear: year, quarter: 3, releaseMonth: 10, releaseDay:  1 }, // Q3, Oct 1
    { dataYear: year, quarter: 4, releaseMonth: 12, releaseDay: 15 }, // Q4, Dec ~15
  ];

  for (const p of projections) {
    const eventId = `jp_tankan_${p.dataYear}Q${p.quarter}`;
    if (confirmedIds.has(eventId)) continue; // already confirmed
    const releaseDate = `${year}-${String(p.releaseMonth).padStart(2, '0')}-${String(p.releaseDay).padStart(2, '0')}`;
    if (!releaseDate.startsWith(`${year}-`)) continue;
    projected.push({
      eventId,
      releaseDate,
      label: `BOJ Tankan ${p.dataYear} Q${p.quarter} (projected from historical pattern)`,
      prefix: 'jp_tankan',
      confirmed: false,
    });
  }
  return projected;
}

async function getReleases(year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchYoshiHtml(opts);
  const confirmed = parseTankanSchedule(html, year);
  const confirmedIds = new Set(confirmed.map((e) => e.eventId));
  const projected = projectFutureEntries(year, confirmedIds);

  const all = [...confirmed, ...projected];

  // Deduplicate by eventId (confirmed takes priority over projected)
  const byId = {};
  for (const entry of all) {
    if (!byId[entry.eventId] || (!byId[entry.eventId].confirmed && entry.confirmed)) {
      byId[entry.eventId] = entry;
    }
  }

  return {
    source: URL,
    year,
    fromCache,
    cachedAt,
    releases: Object.values(byId),
  };
}

module.exports = {
  URL,
  fetchYoshiHtml,
  getReleases,
  _internals: { parseTankanSchedule, parseJpDate, parseSurveyMonth, projectFutureEntries },
};
