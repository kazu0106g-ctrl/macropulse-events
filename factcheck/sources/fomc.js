// FOMC meeting schedule fetcher and parser.
//
// Authoritative source:
//   https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
//
// The page renders one panel per year. Each meeting is a div with class
// "fomc-meeting" containing __month and __date sub-divs. We never trust an
// LLM summary of this page -- raw HTML is parsed.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
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

async function fetchFomcHtml({ cacheDir = DEFAULT_CACHE_DIR, useCache = true } = {}) {
  const cachePath = path.join(cacheDir, 'fomc.html');
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

// Find the panel for a given year. Anchor is "<h4><a id="...">YYYY FOMC Meetings</a>".
function extractYearPanel(html, year) {
  const headerRegex = new RegExp(`<h4><a id="[^"]+">\\s*${year}\\s+FOMC Meetings\\s*</a></h4>`);
  const headerMatch = html.match(headerRegex);
  if (!headerMatch) return null;
  const startIdx = headerMatch.index + headerMatch[0].length;
  // The next year's panel-heading marks the boundary.
  const tail = html.slice(startIdx);
  const nextHeader = tail.match(/<h4><a id="[^"]+">\s*\d{4}\s+FOMC Meetings\s*<\/a><\/h4>/);
  return nextHeader ? tail.slice(0, nextHeader.index) : tail;
}

function parseFomcPanel(panelHtml, year) {
  // Each meeting: a div with class "fomc-meeting" containing month and date sub-divs.
  // Month div: contains <strong>MonthName</strong>
  // Date div: contains "D1-D2" or "D1-D2*"
  // Some past meetings may be a single date with "(notation vote)" -- skip those.
  const meetings = [];
  // Locate each `__month` ... `__date` pair in document order.
  // Using a regex over the entire panel; the structure is consistent.
  const re = /fomc-meeting__month[^>]*>[\s\S]*?<strong>([A-Za-z]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g;
  let m;
  while ((m = re.exec(panelHtml))) {
    const monthName = m[1];
    const month = MONTHS[monthName];
    const dateText = m[2].trim();
    if (!month) continue;
    // Match "D1-D2" optionally followed by "*" or extra text.
    const dm = dateText.match(/^(\d{1,2})\s*-\s*(\d{1,2})/);
    if (!dm) continue; // skip "(notation vote)" style rows
    const d1 = parseInt(dm[1], 10);
    const d2 = parseInt(dm[2], 10);
    // Cross-month meetings are rare for FOMC and would render differently
    // ("January 31-February 1"); treat both days as the same month for "D1-D2".
    meetings.push({
      meeting_label: `${monthName} ${d1}-${d2}`,
      day1: `${year}-${String(month).padStart(2, '0')}-${String(d1).padStart(2, '0')}`,
      day2: `${year}-${String(month).padStart(2, '0')}-${String(d2).padStart(2, '0')}`,
      sep_associated: dateText.includes('*'),
    });
  }
  return meetings;
}

async function getFomcMeetings(year, opts = {}) {
  const { html, fromCache, cachedAt } = await fetchFomcHtml(opts);
  const panel = extractYearPanel(html, year);
  if (!panel) {
    return { year, source: URL, fromCache, cachedAt, meetings: [], notFound: true };
  }
  const meetings = parseFomcPanel(panel, year);
  return { year, source: URL, fromCache, cachedAt, meetings, notFound: false };
}

module.exports = {
  URL,
  fetchFomcHtml,
  getFomcMeetings,
  _internals: { extractYearPanel, parseFomcPanel },
};
