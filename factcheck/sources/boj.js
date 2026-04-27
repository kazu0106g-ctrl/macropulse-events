// BOJ Monetary Policy Meeting schedule fetcher and parser.
//
// Authoritative source: https://www.boj.or.jp/mopo/mpmsche_minu/index.htm
// This is THE source of truth for BOJ rate decision dates. We never delegate
// this to an aggregator or LLM summary -- raw HTML is parsed directly so that
// hallucinations and third-party errors cannot leak in.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.boj.or.jp/mopo/mpmsche_minu/index.htm';
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; macropulse-events-factcheck/1.0; +https://github.com/kazu0106g-ctrl/macropulse-events)',
            'Accept-Language': 'ja,en;q=0.7',
          },
        },
        (res) => {
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
        },
      )
      .on('error', reject);
  });
}

async function fetchBojHtml({ cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const cachePath = path.join(cacheDir, 'boj.html');
  if (useCache) {
    try {
      const stat = fs.statSync(cachePath);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        return { html: fs.readFileSync(cachePath, 'utf8'), fromCache: true, cachedAt: stat.mtime };
      }
    } catch (_) {
      /* no cache */
    }
  }
  const html = await fetchUrl(URL);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, html, 'utf8');
  return { html, fromCache: false, cachedAt: new Date() };
}

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\[PDF[^\]]*\]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse a Japanese single date "M月D日（曜）" using a known year.
function parseSingleJpDate(text, defaultYear) {
  const m = text.match(/(\d+)月\s*(\d+)日/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  return `${defaultYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Parse first td "M月D1日（曜）・D2日（曜）" or month-spanning
// "M1月D1日（曜）・M2月D2日（曜）". Returns {day1, day2} both ISO YYYY-MM-DD.
function parseMeetingDates(td, defaultYear) {
  const m = td.match(/(\d+)月\s*(\d+)日[^・]*・\s*(?:(\d+)月)?\s*(\d+)日/);
  if (!m) return null;
  const m1 = parseInt(m[1], 10);
  const d1 = parseInt(m[2], 10);
  const m2 = m[3] ? parseInt(m[3], 10) : m1;
  const d2 = parseInt(m[4], 10);
  // Year-rollover guard: month-spanning to a smaller month means new year.
  let year2 = defaultYear;
  if (m3IsRollover(m1, m2)) year2 = defaultYear + 1;
  return {
    day1: `${defaultYear}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`,
    day2: `${year2}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`,
  };
}

function m3IsRollover(m1, m2) {
  // BOJ meetings only roll over Dec -> Jan in practice.
  return m1 === 12 && m2 === 1;
}

// Extract a year section (<h2 id="pYYYY">YYYY年</h2> ... up to next <h2 id="pYYYY">).
function extractYearSection(html, year) {
  const yearHeader = `<h2 id="p${year}">${year}年</h2>`;
  const startIdx = html.indexOf(yearHeader);
  if (startIdx === -1) return null;
  const tail = html.slice(startIdx + yearHeader.length);
  const nextMatch = tail.match(/<h2 id="p\d{4}">/);
  return nextMatch ? html.slice(startIdx, startIdx + yearHeader.length + nextMatch.index) : html.slice(startIdx);
}

function parseYearTable(yearSection, year) {
  const tbodyMatch = yearSection.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];
  const trs = tbodyMatch[1].match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const out = [];
  for (const tr of trs) {
    const tds = tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
    if (tds.length < 5) continue;
    const cells = tds.map(stripTags);
    const meetingTd = cells[0];
    const outlookTd = cells[1];
    const pressTd = cells[4];
    const dates = parseMeetingDates(meetingTd, year);
    if (!dates) continue;
    out.push({
      meeting_label: meetingTd,
      day1: dates.day1,
      day2: dates.day2,
      outlook_report: !!outlookTd && outlookTd !== '-',
      outlook_date: outlookTd && outlookTd !== '-' ? parseSingleJpDate(outlookTd, year) : null,
      press_conference_date: pressTd ? parseSingleJpDate(pressTd, year) : null,
    });
  }
  return out;
}

async function getBojMeetings(year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchBojHtml(opts);
  const section = extractYearSection(html, year);
  if (!section) {
    return { year, source: URL, fromCache, cachedAt, meetings: [], notFound: true };
  }
  const meetings = parseYearTable(section, year);
  return { year, source: URL, fromCache, cachedAt, meetings, notFound: false };
}

module.exports = {
  URL,
  fetchBojHtml,
  getBojMeetings,
  // exported for unit-style sanity checks
  _internals: { stripTags, parseSingleJpDate, parseMeetingDates, extractYearSection, parseYearTable },
};
