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

// Stocks to track (~200 popular US equities covering S&P 100, NASDAQ-100,
// and ADRs commonly held by Japanese retail investors). Extend as needed.
const SYMBOLS = [
  'MMM', 'AOS', 'ABT', 'ABBV', 'ACN', 'ADBE', 'AMD', 'AES', 'AFL', 'A', 'APD', 'ABNB', 'AKAM', 'ALB', 'ARE', 'ALGN', 'ALLE', 'LNT', 'ALL', 'GOOGL', 'GOOG', 'MO', 'AMZN', 'AMCR', 'AEE', 'AEP', 'AXP', 'AIG', 'AMT', 'AWK', 'AMP', 'AME', 'AMGN', 'APH', 'ADI', 'AON', 'APA', 'APO', 'AAPL', 'AMAT', 'APP', 'APTV', 'ACGL', 'ADM', 'ARES', 'ANET', 'AJG', 'AIZ', 'T', 'ATO', 'ADSK', 'ADP', 'AZO', 'AVB', 'AVY', 'AXON', 'BKR', 'BALL', 'BAC', 'BAX', 'BDX', 'BRK-B', 'BBY', 'TECH', 'BIIB', 'BLK', 'BX', 'XYZ', 'BK', 'BA', 'BKNG', 'BSX', 'BMY', 'AVGO', 'BR', 'BRO', 'BF-B', 'BLDR', 'BG', 'BXP', 'CHRW', 'CDNS', 'CPT', 'CPB', 'COF', 'CAH', 'CCL', 'CARR', 'CVNA', 'CASY', 'CAT', 'CBOE', 'CBRE', 'CDW', 'COR', 'CNC', 'CNP', 'CF', 'CRL', 'SCHW', 'CHTR', 'CVX', 'CMG', 'CB', 'CHD', 'CIEN', 'CI', 'CINF', 'CTAS', 'CSCO', 'C', 'CFG', 'CLX', 'CME', 'CMS', 'KO', 'CTSH', 'COHR', 'COIN', 'CL', 'CMCSA', 'FIX', 'CAG', 'COP', 'ED', 'STZ', 'CEG', 'COO', 'CPRT', 'GLW', 'CPAY', 'CTVA', 'CSGP', 'COST', 'CTRA', 'CRH', 'CRWD', 'CCI', 'CSX', 'CMI', 'CVS', 'DHR', 'DRI', 'DDOG', 'DVA', 'DECK', 'DE', 'DELL', 'DAL', 'DVN', 'DXCM', 'FANG', 'DLR', 'DG', 'DLTR', 'D', 'DPZ', 'DASH', 'DOV', 'DOW', 'DHI', 'DTE', 'DUK', 'DD', 'ETN', 'EBAY', 'SATS', 'ECL', 'EIX', 'EW', 'EA', 'ELV', 'EME', 'EMR', 'ETR', 'EOG', 'EPAM', 'EQT', 'EFX', 'EQIX', 'EQR', 'ERIE', 'ESS', 'EL', 'EG', 'EVRG', 'ES', 'EXC', 'EXE', 'EXPE', 'EXPD', 'EXR', 'XOM', 'FFIV', 'FDS', 'FICO', 'FAST', 'FRT', 'FDX', 'FIS', 'FITB', 'FSLR', 'FE', 'FISV', 'F', 'FTNT', 'FTV', 'FOXA', 'FOX', 'BEN', 'FCX', 'GRMN', 'IT', 'GE', 'GEHC', 'GEV', 'GEN', 'GNRC', 'GD', 'GIS', 'GM', 'GPC', 'GILD', 'GPN', 'GL', 'GDDY', 'GS', 'HAL', 'HIG', 'HAS', 'HCA', 'DOC', 'HSIC', 'HSY', 'HPE', 'HLT', 'HD', 'HON', 'HRL', 'HST', 'HWM', 'HPQ', 'HUBB', 'HUM', 'HBAN', 'HII', 'IBM', 'IEX', 'IDXX', 'ITW', 'INCY', 'IR', 'PODD', 'INTC', 'IBKR', 'ICE', 'IFF', 'IP', 'INTU', 'ISRG', 'IVZ', 'INVH', 'IQV', 'IRM', 'JBHT', 'JBL', 'JKHY', 'J', 'JNJ', 'JCI', 'JPM', 'KVUE', 'KDP', 'KEY', 'KEYS', 'KMB', 'KIM', 'KMI', 'KKR', 'KLAC', 'KHC', 'KR', 'LHX', 'LH', 'LRCX', 'LVS', 'LDOS', 'LEN', 'LII', 'LLY', 'LIN', 'LYV', 'LMT', 'L', 'LOW', 'LULU', 'LITE', 'LYB', 'MTB', 'MPC', 'MAR', 'MRSH', 'MLM', 'MAS', 'MA', 'MKC', 'MCD', 'MCK', 'MDT', 'MRK', 'META', 'MET', 'MTD', 'MGM', 'MCHP', 'MU', 'MSFT', 'MAA', 'MRNA', 'TAP', 'MDLZ', 'MPWR', 'MNST', 'MCO', 'MS', 'MOS', 'MSI', 'MSCI', 'NDAQ', 'NTAP', 'NFLX', 'NEM', 'NWSA', 'NWS', 'NEE', 'NKE', 'NI', 'NDSN', 'NSC', 'NTRS', 'NOC', 'NCLH', 'NRG', 'NUE', 'NVDA', 'NVR', 'NXPI', 'ORLY', 'OXY', 'ODFL', 'OMC', 'ON', 'OKE', 'ORCL', 'OTIS', 'PCAR', 'PKG', 'PLTR', 'PANW', 'PSKY', 'PH', 'PAYX', 'PYPL', 'PNR', 'PEP', 'PFE', 'PCG', 'PM', 'PSX', 'PNW', 'PNC', 'POOL', 'PPG', 'PPL', 'PFG', 'PG', 'PGR', 'PLD', 'PRU', 'PEG', 'PTC', 'PSA', 'PHM', 'PWR', 'QCOM', 'DGX', 'Q', 'RL', 'RJF', 'RTX', 'O', 'REG', 'REGN', 'RF', 'RSG', 'RMD', 'RVTY', 'HOOD', 'ROK', 'ROL', 'ROP', 'ROST', 'RCL', 'SPGI', 'CRM', 'SNDK', 'SBAC', 'SLB', 'STX', 'SRE', 'NOW', 'SHW', 'SPG', 'SWKS', 'SJM', 'SW', 'SNA', 'SOLV', 'SO', 'LUV', 'SWK', 'SBUX', 'STT', 'STLD', 'STE', 'SYK', 'SMCI', 'SYF', 'SNPS', 'SYY', 'TMUS', 'TROW', 'TTWO', 'TPR', 'TRGP', 'TGT', 'TEL', 'TDY', 'TER', 'TSLA', 'TXN', 'TPL', 'TXT', 'TMO', 'TJX', 'TKO', 'TTD', 'TSCO', 'TT', 'TDG', 'TRV', 'TRMB', 'TFC', 'TYL', 'TSN', 'USB', 'UBER', 'UDR', 'ULTA', 'UNP', 'UAL', 'UPS', 'URI', 'UNH', 'UHS', 'VLO', 'VTR', 'VLTO', 'VRSN', 'VRSK', 'VZ', 'VRTX', 'VRT', 'VTRS', 'VICI', 'V', 'VST', 'VMC', 'WRB', 'GWW', 'WAB', 'WMT', 'DIS', 'WBD', 'WM', 'WAT', 'WEC', 'WFC', 'WELL', 'WST', 'WDC', 'WY', 'WSM', 'WMB', 'WTW', 'WDAY', 'WYNN', 'XEL', 'XYL', 'YUM', 'ZBRA', 'ZBH', 'ZTS', 'ASML', 'ARM', 'TSM', 'BABA', 'PDD', 'JD', 'BIDU', 'NIO', 'TM', 'SONY', 'SPOT', 'MSTR', 'BRK-A',
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

// Manual CIK overrides for tickers not in SEC's public ticker files.
const MANUAL_CIK = {
  MMC: '0000062709', // Marsh & McLennan
  WBA: '0001618921', // Walgreens Boots Alliance
};

let tickerMap = null;
async function loadTickerMap() {
  if (tickerMap) return tickerMap;
  tickerMap = { ...MANUAL_CIK };
  // Primary: standard domestic tickers.
  try {
    const data = await fetchJson('https://www.sec.gov/files/company_tickers.json');
    for (const entry of Object.values(data)) {
      tickerMap[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, '0');
    }
  } catch (_) {}
  // Fallback: extended list that includes foreign ADRs (ASML, ARM, TSM, BABA…).
  try {
    const ext = await fetchJson('https://www.sec.gov/files/company_tickers_exchange.json');
    const fields = ext.fields || [];
    const tIdx = fields.indexOf('ticker');
    const cIdx = fields.indexOf('cik');
    if (tIdx >= 0 && cIdx >= 0) {
      for (const row of ext.data || []) {
        const sym = (row[tIdx] || '').toUpperCase();
        if (sym && !tickerMap[sym]) {
          tickerMap[sym] = String(row[cIdx]).padStart(10, '0');
        }
      }
    }
  } catch (_) {}
  return tickerMap;
}

// Foreign ADR 6-K filename patterns to EXCLUDE (monthly revenue, dividends,
// director meetings that aren't earnings). Keep only earnings-like filings.
const SKIP_6K_PATTERNS = [
  /revenue/i,          // monthly revenue (TSM)
  /monthend/i,         // month-end report (TSM)
  /dividend/i,         // dividend announcement
  /director/i,         // director changes
  /resoluti/i,         // resolutions
  /agm[-_]?/i,         // AGM (annual general meeting)
  /annual[-_]?meeting/i,
];

function is6KEarnings(primaryDoc) {
  if (!primaryDoc) return true; // assume earnings if no filename hint
  for (const p of SKIP_6K_PATTERNS) {
    if (p.test(primaryDoc)) return false;
  }
  return true;
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

  // Collect 8-K/2.02 dates (domestic) OR filtered 6-K dates (foreign ADRs)
  // for YoY fallback. Dedup by date.
  const rawDates = [];
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const item = items[i];
    const doc = primaryDocs[i];
    const date = dates[i];
    let isEarnings = false;
    if (form === '8-K' && typeof item === 'string' && item.includes('2.02')) {
      isEarnings = true;
    } else if (form === '6-K' && is6KEarnings(doc)) {
      isEarnings = true;
    }
    if (isEarnings) rawDates.push(date);
  }
  // Dedup & keep up to 12 (2-3 years of quarterly data).
  const seen = new Set();
  const earningsDates = [];
  for (const d of rawDates) {
    if (!seen.has(d)) {
      seen.add(d);
      earningsDates.push(d);
      if (earningsDates.length >= 12) break;
    }
  }
  // For foreign ADRs with many 6-Ks, further filter to quarterly cadence
  // (drop filings that are within 30 days of a kept filing to avoid
  // picking up non-earnings 6-Ks that slipped through the filename filter).
  const quarterlyDates = [];
  const sorted = [...earningsDates].sort((a, b) => b.localeCompare(a));
  for (const d of sorted) {
    const ts = new Date(d).getTime();
    const tooClose = quarterlyDates.some(kept => Math.abs(new Date(kept).getTime() - ts) < 30 * 86_400_000);
    if (!tooClose) quarterlyDates.push(d);
    if (quarterlyDates.length >= 8) break;
  }
  earningsDates.length = 0;
  earningsDates.push(...quarterlyDates);

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

  // Preserve any manually curated entries (source: 'manual').
  // Their date is only refreshed when it's already in the past (>=3 days ago),
  // at which point we fall back to auto-estimation for the next quarter.
  const now = Date.now();
  const result = { ...existing };
  for (const sym of SYMBOLS) {
    process.stdout.write(`${sym.padEnd(6)} `);
    const prev = existing[sym];
    const isManual = prev && prev.source === 'manual';
    if (isManual && prev.date) {
      const prevTs = new Date(prev.date).getTime();
      if (prevTs >= now - 3 * 86_400_000) {
        console.log(`${prev.date}  manual (kept)`);
        continue; // keep manual entry until its date passes
      }
    }
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
