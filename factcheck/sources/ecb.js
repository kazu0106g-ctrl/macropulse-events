// ECB monetary policy meeting schedule fetcher and parser.
//
// Authoritative source:
//   https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html
//
// Each entry is a date in DD/MM/YYYY format followed by a description. We pick
// only "monetary policy meeting" entries and identify Day 2 (the announcement
// and press conference day).

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html';
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0 macropulse-events-factcheck/1.0' } }, (res) => {
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

async function fetchEcbHtml({ cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const cachePath = path.join(cacheDir, 'ecb.html');
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

function ddmmyyyyToIso(s) {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseAllEntries(html) {
  // The page lists entries in document order. For each DD/MM/YYYY token we
  // collect the description text up to (but not including) the NEXT DD/MM/YYYY
  // token. This stops one entry's window from absorbing the neighbour's text
  // (which would otherwise cause a Day 1 row to inherit the Day 2 label).
  const out = [];
  const dateRe = /\b(\d{2}\/\d{2}\/\d{4})\b/g;
  const matches = [];
  let m;
  while ((m = dateRe.exec(html))) matches.push({ index: m.index, raw: m[1] });
  for (let i = 0; i < matches.length; i++) {
    const iso = ddmmyyyyToIso(matches[i].raw);
    if (!iso) continue;
    const start = matches[i].index + matches[i].raw.length;
    const end = i + 1 < matches.length ? matches[i + 1].index : Math.min(start + 400, html.length);
    const ctx = html.slice(start, end);
    const desc = ctx.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ iso, desc });
  }
  return out;
}

// Group consecutive (Day 1) -> (Day 2) monetary policy meeting entries.
function extractMonetaryPolicyMeetings(entries, year) {
  const yearEntries = entries.filter((e) => e.iso.startsWith(`${year}-`));
  const meetings = [];
  for (let i = 0; i < yearEntries.length; i++) {
    const e = yearEntries[i];
    if (
      /Governing Council of the ECB/i.test(e.desc) &&
      /monetary policy meeting/i.test(e.desc) &&
      /\(Day 2\)/i.test(e.desc)
    ) {
      // Day 1 is typically the previous entry.
      const prev = yearEntries[i - 1];
      const day1 = prev && /\(Day 1\)/i.test(prev.desc) ? prev.iso : null;
      meetings.push({
        meeting_label: `Governing Council monetary policy meeting (${e.iso})`,
        day1,
        day2: e.iso,
      });
    }
  }
  return meetings;
}

async function getEcbMeetings(year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchEcbHtml(opts);
  const entries = parseAllEntries(html);
  const meetings = extractMonetaryPolicyMeetings(entries, year);
  return { year, source: URL, fromCache, cachedAt, meetings, notFound: meetings.length === 0 };
}

module.exports = {
  URL,
  fetchEcbHtml,
  getEcbMeetings,
  _internals: { parseAllEntries, extractMonetaryPolicyMeetings, ddmmyyyyToIso },
};
