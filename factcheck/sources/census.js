// US Census Bureau economic indicator release schedule fetcher.
//
// Authoritative source: https://www.census.gov/economic-indicators/calendar-listview.html
// One annual list; each row has a release date + indicator title.
// We parse raw HTML; no LLM in the data path.
//
// Supported indicators (mapped to events.json id prefixes):
//   ARTS  (Advance Monthly Sales for Retail and Food Services) → us_retail_*
//   NEWR  (New Residential Construction / Housing Starts)      → us_housing_*
//   DURG  (Advance Report on Durable Goods Orders)             → us_durable_*
//   FT900 (U.S. International Trade in Goods and Services)      → us_trade_*

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.census.gov/economic-indicators/calendar-listview.html';
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// Indicator titles as they appear on the Census calendar page (partial match).
// Maps substring → events.json id prefix (release-month convention).
const INDICATOR_MAP = [
  {
    match: /Advance Monthly Sales for Retail|Retail.*Food Services/i,
    label: 'Census Retail Sales (ARTS)',
    eventPrefix: 'us_retail',
  },
  {
    match: /New Residential Construction|Housing Starts/i,
    label: 'Census Housing Starts',
    eventPrefix: 'us_housing',
  },
  {
    match: /Advance.*Durable Goods|Durable Goods.*Orders/i,
    label: 'Census Durable Goods Orders',
    eventPrefix: 'us_durable',
  },
  {
    match: /U\.?S\.?\s+International Trade in Goods and Services|International Trade.*Goods and Services/i,
    label: 'Census/BEA U.S. International Trade',
    eventPrefix: 'us_trade',
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
            'Accept-Language': 'en-US,en;q=0.9',
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
  const cachePath = path.join(cacheDir, 'census_calendar.html');
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

// Parse "January 14, 2026" or "May 14, 2026" → "2026-01-14"
function parseCensusDate(text) {
  const m = text.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (!month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// The Census calendar page is a sortable HTML table with rows of the form:
//   <tr>
//     <td><a href="...">Indicator Title</a></td>
//     <td sorttable_customkey="...">January 14, 2026</td>
//     <td>8:30 AM</td>
//     <td>November 2025</td>
//     ...
//   </tr>
// We parse each <tr> block: extract the title text from the first <td> and the
// date text from the second <td>.
function parseCalendarEntries(html) {
  const entries = [];

  // Split on <tr blocks and process each.
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(html))) {
    const row = rowMatch[1];

    // Extract all <td> cell texts in order.
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRe.exec(row))) {
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(text);
    }

    if (cells.length < 2) continue;

    // First cell = indicator title, second cell = release date.
    const title = cells[0];
    const dateText = cells[1];

    // Match title against known indicators.
    let matched = null;
    for (const indicator of INDICATOR_MAP) {
      if (indicator.match.test(title)) {
        matched = indicator;
        break;
      }
    }
    if (!matched) continue;

    const date = parseCensusDate(dateText);
    if (!date) continue;

    entries.push({ date, label: matched.label, prefix: matched.eventPrefix });
  }
  return entries;
}

// Returns one record per indicator per release date found in year.
async function getReleases(year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchCalendarHtml(opts);
  const raw = parseCalendarEntries(html);

  // Group by prefix, keeping only entries matching the requested year.
  // De-duplicate: if a prefix has two releases in the same month (catch-up),
  // keep the later one (more recent = the "current" scheduled release).
  const byPrefix = {};
  for (const entry of raw) {
    if (!entry.date.startsWith(`${year}-`)) continue;
    const releaseMonth = parseInt(entry.date.slice(5, 7), 10);
    const releaseYear = parseInt(entry.date.slice(0, 4), 10);
    const yyyymm = `${releaseYear}${String(releaseMonth).padStart(2, '0')}`;
    const key = `${entry.prefix}_${yyyymm}`;
    // If duplicate for same prefix+month, prefer the later date (avoid catch-up confusion).
    if (!byPrefix[key] || entry.date > byPrefix[key].releaseDate) {
      byPrefix[key] = {
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
    releases: Object.values(byPrefix),
  };
}

module.exports = {
  URL,
  fetchCalendarHtml,
  getReleases,
  INDICATOR_MAP,
  _internals: { parseCalendarEntries, parseCensusDate },
};
