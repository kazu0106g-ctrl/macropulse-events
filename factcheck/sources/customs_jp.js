// Japan Customs (税関) trade statistics release schedule fetcher.
//
// Authoritative source: https://www.customs.go.jp/toukei/shinbun/happyou.htm
// Covers: 貿易統計（速報）→ jp_trade_*
//
// ID convention: jp_trade_YYYYMM where MM = release month.
// The data reference month is approximately MM-1.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.customs.go.jp/toukei/shinbun/happyou.htm';
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
          // Resolve with raw Buffer so caller can handle encoding
          res.on('end', () => resolve(Buffer.concat(chunks)));
        },
      )
      .on('error', reject);
  });
}

async function fetchScheduleHtml({ cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const cachePath = path.join(cacheDir, 'customs_jp_schedule.bin');
  if (useCache) {
    try {
      const stat = fs.statSync(cachePath);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        return { buf: fs.readFileSync(cachePath), fromCache: true, cachedAt: stat.mtime };
      }
    } catch (_) {}
  }
  const buf = await fetchUrl(URL);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, buf);
  return { buf, fromCache: false, cachedAt: new Date() };
}

// Parse 令和N年M月D日 pattern → ISO date
function parseReiwaDate(text, defaultYear) {
  const reiwaFull = text.match(/令和(\d+)年(\d+)月(\d+)日/);
  if (reiwaFull) {
    const year = 2018 + parseInt(reiwaFull[1], 10);
    const month = parseInt(reiwaFull[2], 10);
    const day = parseInt(reiwaFull[3], 10);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // "June 17, 2026" style (page may also use English)
  const MONTHS = { January:1,February:2,March:3,April:4,May:5,June:6,
                   July:7,August:8,September:9,October:10,November:11,December:12 };
  const engFull = text.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (engFull) {
    const month = MONTHS[engFull[1]];
    if (!month) return null;
    return `${engFull[3]}-${String(month).padStart(2, '0')}-${String(parseInt(engFull[2])).padStart(2, '0')}`;
  }
  return null;
}

// Decode the Shift-JIS page first, then parse table rows structurally so dates
// from unrelated Customs release series cannot leak into this calendar.
function cellText(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// The page mixes monthly releases with first-ten-days and first-twenty-days
// releases. Only plain monthly reference periods marked exactly preliminary
// belong to the app's monthly Japan Trade Balance event.
function parseTradeScheduleHtml(html, year) {
  const entries = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(html))) {
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) cells.push(cellText(cellMatch[1]));
    if (cells.length < 2) continue;

    const referencePeriod = cells[0];
    const publication = cells[1];
    if (!/^\d{4}\u5e74\d{1,2}\u6708$/.test(referencePeriod)) continue;
    if (!publication.includes('\uff08\u901f\u5831\uff09')) continue;

    const m = publication.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/);
    if (!m || parseInt(m[1], 10) !== year) continue;
    const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    entries.push({ date, prefix: 'jp_trade', label: 'Japan Customs Trade Statistics (preliminary)' });
  }
  return entries;
}

function parseTradeSchedule(buf, year) {
  const html = new TextDecoder('shift_jis').decode(buf);
  return parseTradeScheduleHtml(html, year);
}

async function getReleases(year, opts = {}) {
  const { buf, fromCache, cachedAt } = await fetchScheduleHtml(opts);
  const raw = parseTradeSchedule(buf, year);

  // Duplicate monthly rows can exist for XML and PDF. They have the same date.
  const byMonth = {};
  for (const entry of raw) {
    const releaseMonth = parseInt(entry.date.slice(5, 7), 10);
    const yyyymm = `${year}${String(releaseMonth).padStart(2, '0')}`;
    const key = `jp_trade_${yyyymm}`;
    if (!byMonth[key]) {
      byMonth[key] = { eventId: key, releaseDate: entry.date, label: entry.label, prefix: entry.prefix };
    }
  }

  return {
    source: URL,
    year,
    fromCache,
    cachedAt,
    releases: Object.values(byMonth),
  };
}

module.exports = {
  URL,
  fetchScheduleHtml,
  getReleases,
  _internals: { parseTradeSchedule, parseTradeScheduleHtml, parseReiwaDate },
};
