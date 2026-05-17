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

// Extract trade release dates from the Customs schedule page.
//
// The page is Shift-JIS encoded. In Shift-JIS:
//   年 = 0x94 0x4E
//   月 = 0x8C 0x8E
//   日 = 0x93 0xFA
//
// Date pattern in page: "令和N年M月D日" where N is Reiwa year (2-char),
// M and D are ASCII digit sequences.
//
// Strategy: scan the raw Buffer for ASCII "20" followed by two ASCII digits
// (= western year), then verify the next 2 bytes are 年 (0x94 0x4E), then
// collect 1-2 digit bytes for month, skip 月 (0x8C 0x8E), collect 1-2 digit
// bytes for day.
//
// Alternative pattern: look for Reiwa year bytes directly.
// 令 (Shift-JIS) = 0x97 0xDF, 和 = 0x98 0x61.
// Simpler: scan for "年" bytes (0x94 0x4E) preceded by 1-2 ASCII digit bytes,
// then extract month/day as above.
function parseTradeSchedule(buf, year) {
  const entries = [];

  // Shift-JIS byte sequences for year/month/day kanji
  const NEN  = [0x94, 0x4E]; // 年
  const TSUKI = [0x8C, 0x8E]; // 月
  const NICHI = [0x93, 0xFA]; // 日

  const yearStr = String(year);
  const yearBuf = Buffer.from(yearStr, 'ascii'); // e.g. [0x32,0x30,0x32,0x36]

  for (let i = 0; i < buf.length - 12; i++) {
    // Look for western year (e.g. "2026" as ASCII bytes)
    if (buf[i]     !== yearBuf[0] || buf[i + 1] !== yearBuf[1] ||
        buf[i + 2] !== yearBuf[2] || buf[i + 3] !== yearBuf[3]) continue;
    let pos = i + 4;
    // Next 2 bytes must be 年 (0x94 0x4E)
    if (buf[pos] !== NEN[0] || buf[pos + 1] !== NEN[1]) continue;
    pos += 2;
    // Read 1-2 ASCII digit bytes for month
    let monthStr = '';
    while (pos < buf.length && buf[pos] >= 0x30 && buf[pos] <= 0x39) {
      monthStr += String.fromCharCode(buf[pos]);
      pos++;
    }
    if (!monthStr) continue;
    const month = parseInt(monthStr, 10);
    if (month < 1 || month > 12) continue;
    // Next 2 bytes must be 月 (0x8C 0x8E)
    if (buf[pos] !== TSUKI[0] || buf[pos + 1] !== TSUKI[1]) continue;
    pos += 2;
    // Read 1-2 ASCII digit bytes for day
    let dayStr = '';
    while (pos < buf.length && buf[pos] >= 0x30 && buf[pos] <= 0x39) {
      dayStr += String.fromCharCode(buf[pos]);
      pos++;
    }
    if (!dayStr) continue;
    const day = parseInt(dayStr, 10);
    if (day < 1 || day > 31) continue;
    // Next 2 bytes must be 日 (0x93 0xFA)
    if (buf[pos] !== NICHI[0] || buf[pos + 1] !== NICHI[1]) continue;

    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    entries.push({ date, prefix: 'jp_trade', label: 'Japan Customs Trade Statistics (貿易統計速報)' });
  }
  return entries;
}

async function getReleases(year, opts = {}) {
  const { buf, fromCache, cachedAt } = await fetchScheduleHtml(opts);
  const raw = parseTradeSchedule(buf, year);

  // Deduplicate by release month (keep unique dates)
  const byMonth = {};
  for (const entry of raw) {
    const releaseMonth = parseInt(entry.date.slice(5, 7), 10);
    const yyyymm = `${year}${String(releaseMonth).padStart(2, '0')}`;
    const key = `jp_trade_${yyyymm}`;
    if (!byMonth[key] || entry.date > byMonth[key].releaseDate) {
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
  _internals: { parseTradeSchedule, parseReiwaDate },
};
