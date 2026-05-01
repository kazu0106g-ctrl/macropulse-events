// US BEA (Bureau of Economic Analysis) release schedule fetcher.
//
// Authoritative source: https://www.bea.gov/news/schedule
// One annual table; each row has a date (e.g. "May 28") + title (e.g.
// "GDP (Second Estimate) ... 1st Quarter 2026" or "Personal Income and
// Outlays, April 2026"). We parse raw HTML; year is taken from the table
// header ("Year 2026").

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.bea.gov/news/schedule';
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https
      .get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; macropulse-events-factcheck/1.0; kazu0106g@gmail.com)',
        },
      }, (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) &&
          res.headers.location
        ) {
          res.resume();
          return fetchUrl(new URL(res.headers.location, url).toString(), redirects + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

async function fetchBeaHtml({ cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const cachePath = path.join(cacheDir, 'bea.html');
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

// Extract (release-date, release-title) pairs in document order.
function parsePairs(html) {
  const re = /<div class="release-date">([^<]+)<\/div>[\s\S]{0,1500}?release-title[^>]*>([^<]+)</g;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    out.push({
      dateText: m[1].replace(/&nbsp;/g, ' ').trim(),
      title: m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

function parseBeaDate(text, year) {
  // "May 28", "September 30", "December 23", "Jul. 02"
  const m = text.match(/([A-Z][a-z]{2,8})\.?\s+(\d{1,2})/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  const day = parseInt(m[2], 10);
  if (!month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Returns objects describing each release we care about for events.json.
//
// We map BEA titles to events.json id prefixes:
//   - "Personal Income and Outlays, <Month> YYYY"
//       → us_pce_YYYYMM and us_core_pce_YYYYMM
//       (the id's MM is the *release* month, not the data month — that's
//       events.json's existing convention)
//   - "GDP (Advance Estimate), Nth Quarter YYYY" → us_gdp_YYYYQN
async function getReleases(year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchBeaHtml(opts);
  const pairs = parsePairs(html);
  const out = [];
  for (const p of pairs) {
    const date = parseBeaDate(p.dateText, year);
    if (!date) continue;

    // Personal Income and Outlays (PCE)
    let m = p.title.match(/Personal Income and Outlays,\s*([A-Z][a-z]+)\s+(\d{4})/);
    if (m) {
      // The data month is m[1]/m[2]; release month/year is encoded by `date`.
      const releaseYear = parseInt(date.slice(0, 4), 10);
      const releaseMonth = parseInt(date.slice(5, 7), 10);
      out.push({
        kind: 'pce',
        releaseDate: date,
        title: p.title,
        eventIds: [
          `us_pce_${releaseYear}${String(releaseMonth).padStart(2, '0')}`,
          `us_core_pce_${releaseYear}${String(releaseMonth).padStart(2, '0')}`,
        ],
      });
      continue;
    }

    // GDP Advance Estimate
    m = p.title.match(/GDP\s*\(Advance Estimate\),\s*(\d)(?:st|nd|rd|th)?\s+Quarter\s+(\d{4})/);
    if (m) {
      const q = m[1];
      const dataYear = m[2];
      out.push({
        kind: 'gdp_advance',
        releaseDate: date,
        title: p.title,
        eventIds: [`us_gdp_${dataYear}Q${q}`],
      });
      continue;
    }

    // (Optional, future:) Second/Third estimates of GDP. events.json doesn't
    // distinguish these as separate ids today, so we ignore them for now.
  }
  return { source: URL, year, fromCache, cachedAt, releases: out };
}

module.exports = {
  URL,
  fetchBeaHtml,
  getReleases,
  _internals: { parsePairs, parseBeaDate },
};
