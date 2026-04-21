#!/usr/bin/env node
// ============================================================
// Auto-collect upcoming earnings dates from SEC EDGAR.
//
// Strategy (per symbol):
//   1. Resolve ticker → CIK via SEC company_tickers.json.
//   2. Search SEC EFTS for recent 8-K filings with keywords suggesting
//      an upcoming earnings date announcement.
//   3. If found, download the filing and parse the date via regex.
//   4. Otherwise, fall back to SEC 8-K/Item 2.02 same-quarter YoY estimate
//      from submissions.json.
//
// Output: writes `earnings_dates.json` mapping SYMBOL → { date, source, confirmed }.
// ============================================================

const fs = require('fs');

const USER_AGENT = 'Chartr Collector contact@chartr.app';

// Stocks to track. Extend as needed.
const SYMBOLS = [
  'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'KO', 'MCD', 'NKE',
  'SBUX', 'TSLA', 'NVDA', 'LMT', 'UNH', 'JNJ',
];

// ---- Helpers ---------------------------------------------------------------

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
  return resp.json();
}

async function fetchText(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
  return resp.text();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ymd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// ---- CIK lookup ------------------------------------------------------------

let tickerMap = null;
async function loadTickerMap() {
  if (tickerMap) return tickerMap;
  const data = await fetchJson('https://www.sec.gov/files/company_tickers.json');
  tickerMap = {};
  for (const entry of Object.values(data)) {
    tickerMap[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, '0');
  }
  return tickerMap;
}

// ---- Date parsing ----------------------------------------------------------

const MONTHS = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12,
};

// Extract "Month D, YYYY" dates near an earnings phrase.
function extractEarningsDate(text, filingDate) {
  const cleaned = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // Find windows around an earnings phrase and look for dates there.
  const phrasePattern = /(?:will\s+(?:release|report|announce)|is\s+scheduled\s+to\s+(?:release|report|announce)|plans\s+to\s+(?:release|report|announce))[^.]{0,200}?(?:results|earnings|financial\s+results)/gi;
  const datePattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;

  const filingTs = new Date(filingDate).getTime();
  const minTs = filingTs - 30 * 86_400_000;   // up to 30 days before
  const maxTs = filingTs + 180 * 86_400_000;  // up to 6 months after

  let best = null;

  for (const m of cleaned.matchAll(phrasePattern)) {
    const windowStart = Math.max(0, m.index - 50);
    const windowEnd = Math.min(cleaned.length, m.index + 400);
    const window = cleaned.slice(windowStart, windowEnd);

    for (const dm of window.matchAll(datePattern)) {
      const mon = MONTHS[dm[1].toLowerCase()];
      const day = parseInt(dm[2], 10);
      const year = parseInt(dm[3], 10);
      if (!mon || day < 1 || day > 31 || year < 2024 || year > 2030) continue;
      const dt = new Date(Date.UTC(year, mon - 1, day));
      const ts = dt.getTime();
      if (ts < minTs || ts > maxTs) continue;
      // Prefer the date closest after the filing date.
      if (ts >= filingTs && (!best || ts < best.getTime())) {
        best = dt;
      }
    }
    if (best) break;
  }

  return best ? ymd(best) : null;
}

// ---- Per-symbol collection -------------------------------------------------

async function collectSymbol(symbol) {
  const map = await loadTickerMap();
  const cik = map[symbol];
  if (!cik) return { error: 'CIK not found' };

  const submissions = await fetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const filings = submissions.filings?.recent;
  if (!filings) return { error: 'no filings' };

  const forms = filings.form || [];
  const dates = filings.filingDate || [];
  const items = filings.items || [];
  const accessions = filings.accessionNumber || [];
  const primaryDocs = filings.primaryDocument || [];

  const now = new Date();
  const todayTs = now.getTime();

  // Collect 8-K/2.02 dates for YoY fallback.
  const earningsDates = [];
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === '8-K' && typeof items[i] === 'string' && items[i].includes('2.02')) {
      earningsDates.push(dates[i]);
      if (earningsDates.length >= 8) break;
    }
  }

  // ---- 1. Search recent 8-K filings for an announcement of an upcoming date ----
  for (let i = 0; i < Math.min(forms.length, 15); i++) {
    if (forms[i] !== '8-K') continue;
    const filingDate = dates[i];
    // Skip filings older than 90 days or older than the latest 2.02 we already saw.
    const filingTs = new Date(filingDate).getTime();
    if (todayTs - filingTs > 90 * 86_400_000) break;
    // Skip if this IS the 2.02 earnings release itself.
    if (typeof items[i] === 'string' && items[i].includes('2.02') && !items[i].includes('7.01') && !items[i].includes('8.01')) continue;

    try {
      const accNoStripped = accessions[i].replace(/-/g, '');
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accNoStripped}/${primaryDocs[i]}`;
      const text = await fetchText(filingUrl);
      const parsed = extractEarningsDate(text, filingDate);
      if (parsed) {
        const parsedTs = new Date(parsed).getTime();
        if (parsedTs >= todayTs - 2 * 86_400_000) {
          return {
            date: parsed,
            source: 'sec_8k_preannounce',
            confirmed: true,
            filingDate,
          };
        }
      }
      await sleep(120); // polite
    } catch (_) { /* skip */ }
  }

  // ---- 2. Fallback: same-quarter YoY from 8-K/2.02 history ----
  if (earningsDates.length === 0) {
    return { error: 'no 8-K/2.02 history' };
  }

  const sortedAsc = [...earningsDates].sort((a, b) => a.localeCompare(b));
  const lastDate = new Date(sortedAsc[sortedAsc.length - 1]);
  const targetNext = new Date(lastDate);
  targetNext.setDate(targetNext.getDate() + 91);
  const oneYearBefore = new Date(targetNext);
  oneYearBefore.setFullYear(oneYearBefore.getFullYear() - 1);

  let matched = null;
  let minDiff = Infinity;
  for (const d of sortedAsc) {
    const diff = Math.abs(new Date(d) - oneYearBefore);
    if (diff < minDiff && diff <= 30 * 86_400_000) {
      minDiff = diff;
      matched = d;
    }
  }

  let estimated;
  if (matched) {
    estimated = new Date(matched);
    estimated.setDate(estimated.getDate() + 364);
  } else {
    estimated = new Date(lastDate);
    estimated.setDate(estimated.getDate() + 91);
  }
  const tolerance = 5 * 86_400_000;
  while (estimated.getTime() < todayTs - tolerance) {
    estimated.setDate(estimated.getDate() + 91);
  }

  return {
    date: ymd(estimated),
    source: 'sec_8k_yoy_estimate',
    confirmed: false,
    filingDate: sortedAsc[sortedAsc.length - 1],
  };
}

// ---- Main ------------------------------------------------------------------

async function main() {
  const existing = {};
  try {
    const buf = fs.readFileSync('earnings_dates.json', 'utf8');
    Object.assign(existing, JSON.parse(buf));
  } catch (_) {}

  const result = { ...existing };
  for (const sym of SYMBOLS) {
    process.stdout.write(`${sym.padEnd(6)} `);
    try {
      const info = await collectSymbol(sym);
      if (info.error) {
        console.log('ERROR:', info.error);
        continue;
      }
      result[sym] = {
        date: info.date,
        source: info.source,
        confirmed: info.confirmed,
        lastFilingDate: info.filingDate || null,
        updatedAt: new Date().toISOString(),
      };
      console.log(`${info.date}  ${info.source}  confirmed=${info.confirmed}`);
    } catch (e) {
      console.log('ERROR:', e.message);
    }
    await sleep(200); // be polite to SEC
  }

  fs.writeFileSync('earnings_dates.json', JSON.stringify(result, null, 2));
  console.log(`\nWrote ${Object.keys(result).length} symbols to earnings_dates.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
