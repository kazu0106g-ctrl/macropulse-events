// Federal Reserve statistical release schedule fetcher.
//
// Authoritative source:
//   https://www.federalreserve.gov/releases/g17/default.htm
//
// Covers Industrial Production and Capacity Utilization (G.17), mapped to
// events.json ids using the release month: us_indprod_YYYYMM.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.federalreserve.gov/releases/g17/default.htm';
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
          'User-Agent': 'Mozilla/5.0 (compatible; macropulse-events-factcheck/1.0; kazu0106g@gmail.com)',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }, (res) => {
        if ([301, 302, 303, 307].includes(res.statusCode) && res.headers.location) {
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

async function fetchFedHtml({ cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const cachePath = path.join(cacheDir, 'fed_g17.html');
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

function parseYearDates(html, year) {
  const text = html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const match = text.match(new RegExp(`${year}:([\\s\\S]*?)(?=${year + 1}:|Historical Release Dates|Previous Releases)`));
  if (!match) return [];

  const dates = [];
  const re = new RegExp(`(${Object.keys(MONTHS).join('|')})\\s+(\\d{1,2})`, 'g');
  let m;
  while ((m = re.exec(match[1]))) {
    const month = MONTHS[m[1]];
    const day = parseInt(m[2], 10);
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return [...new Set(dates)];
}

async function getReleases(year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchFedHtml(opts);
  const releases = parseYearDates(html, year).map((releaseDate) => {
    const yyyymm = releaseDate.slice(0, 7).replace('-', '');
    return {
      eventId: `us_indprod_${yyyymm}`,
      releaseDate,
      label: 'Federal Reserve Industrial Production (G.17)',
    };
  });
  return { source: URL, year, fromCache, cachedAt, releases };
}

module.exports = {
  URL,
  fetchFedHtml,
  getReleases,
  _internals: { parseYearDates },
};
