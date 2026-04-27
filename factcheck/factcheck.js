#!/usr/bin/env node
// Macropulse-events fact checker.
//
// Compares events.json against authoritative issuer pages (BOJ, FOMC, ECB) and
// generates a markdown report. NEVER edits events.json. The report is the
// human review surface; corrections are applied manually.
//
// Trust model:
//   - The official issuer page is THE source of truth for that issuer's events.
//   - Raw HTML is parsed in code (no LLM in the data path) so a third-party
//     summary cannot inject wrong dates.
//   - Aggregator quorum (planned) is reserved for events without a single
//     authoritative issuer.
//
// Usage:
//   node factcheck/factcheck.js              # current and next year
//   node factcheck/factcheck.js --year 2026
//   node factcheck/factcheck.js --no-cache   # bypass 24h HTML cache

'use strict';

const fs = require('fs');
const path = require('path');
const { getBojMeetings } = require('./sources/boj');
const { getFomcMeetings } = require('./sources/fomc');
const { getEcbMeetings } = require('./sources/ecb');

const ROOT = path.join(__dirname, '..');
const EVENTS_PATH = path.join(ROOT, 'events.json');
const REPORTS_DIR = path.join(__dirname, 'reports');

function parseArgs(argv) {
  const args = { years: null, useCache: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--year' || a === '-y') {
      args.years = [parseInt(argv[++i], 10)];
    } else if (a === '--no-cache') {
      args.useCache = false;
    }
  }
  if (!args.years) {
    const now = new Date();
    args.years = [now.getFullYear(), now.getFullYear() + 1];
  }
  return args;
}

function loadEvents() {
  return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
}

function findEventByIdPrefix(events, prefix, year, month) {
  const id = `${prefix}_${year}${String(month).padStart(2, '0')}`;
  return events.find((e) => e.id === id) || null;
}

function classifyDiff(eventDate, day1, day2) {
  if (eventDate === day2) return { status: 'ok', note: 'matches Day 2 (announcement day)' };
  if (eventDate === day1) return { status: 'mismatch', note: 'set to Day 1; Day 2 is the announcement day' };
  return { status: 'mismatch', note: 'date does not match either Day 1 or Day 2' };
}

// Collect events.json entries for an issuer in a given year. Used to detect
// "phantom" events whose IDs exist in our data but have no corresponding
// official meeting (e.g. the bogus fomc_202605 from a bulk LLM run).
function collectIdsForYear(events, prefix, year) {
  const re = new RegExp(`^${prefix}_${year}\\d{2}$`);
  return events.filter((e) => re.test(e.id));
}

async function checkIssuerYear({ events, year, prefix, label, fetcher, opts }) {
  let result;
  try {
    result = await fetcher(year, opts);
  } catch (err) {
    return {
      label,
      year,
      source: '(error)',
      fromCache: false,
      cachedAt: new Date(),
      findings: [],
      notFound: true,
      error: String(err.message || err),
    };
  }

  const findings = [];
  const seenMonths = new Set();
  for (const m of result.meetings) {
    const month = parseInt(m.day2.slice(5, 7), 10);
    seenMonths.add(month);
    const ev = findEventByIdPrefix(events, prefix, year, month);
    if (!ev) {
      findings.push({
        kind: 'missing',
        year,
        month,
        expected_id: `${prefix}_${year}${String(month).padStart(2, '0')}`,
        official: m,
      });
      continue;
    }
    const cls = classifyDiff(ev.date, m.day1, m.day2);
    findings.push({
      kind: cls.status === 'ok' ? 'ok' : 'mismatch',
      id: ev.id,
      year,
      month,
      events_date: ev.date,
      official_day1: m.day1,
      official_day2: m.day2,
      official_label: m.meeting_label,
      note: cls.note,
    });
  }

  // Phantom events: IDs whose month doesn't appear in the official schedule.
  const ourEntries = collectIdsForYear(events, prefix, year);
  for (const ev of ourEntries) {
    const month = parseInt(ev.id.slice(-2), 10);
    if (!seenMonths.has(month)) {
      findings.push({
        kind: 'phantom',
        id: ev.id,
        year,
        month,
        events_date: ev.date,
        note: 'no meeting found for this month on the official site',
      });
    }
  }

  return {
    label,
    year,
    source: result.source,
    fromCache: result.fromCache,
    cachedAt: result.cachedAt,
    findings,
    notFound: result.notFound,
  };
}

function md(reports) {
  const now = new Date().toISOString();
  const lines = [];
  lines.push(`# Macropulse-events factcheck report`);
  lines.push(``);
  lines.push(`Generated: ${now}`);
  lines.push(``);
  lines.push(`Compares events.json against authoritative issuer pages.`);
  lines.push(`No automatic edits are applied; review and update events.json manually.`);
  lines.push(``);

  for (const r of reports) {
    lines.push(`## ${r.label} ${r.year}`);
    lines.push(``);
    lines.push(`Source: ${r.source} (${r.fromCache ? 'cached' : 'fresh'} at ${new Date(r.cachedAt).toISOString()})`);
    lines.push(``);
    if (r.error) {
      lines.push(`> Error: ${r.error}`);
      lines.push(``);
      continue;
    }
    if (r.notFound) {
      lines.push(`> Year section not found / no meetings parsed. Investigate the parser or check whether the page layout changed.`);
      lines.push(``);
      continue;
    }
    const ok = r.findings.filter((f) => f.kind === 'ok');
    const mismatches = r.findings.filter((f) => f.kind === 'mismatch');
    const missing = r.findings.filter((f) => f.kind === 'missing');
    const phantom = r.findings.filter((f) => f.kind === 'phantom');
    lines.push(`OK: ${ok.length}, Mismatch: ${mismatches.length}, Missing: ${missing.length}, Phantom: ${phantom.length}`);
    lines.push(``);
    if (mismatches.length) {
      lines.push(`### Mismatch (events.json date differs from official Day 2)`);
      lines.push(``);
      lines.push(`| id | events.json | official Day 1 | official Day 2 | label | note |`);
      lines.push(`|---|---|---|---|---|---|`);
      for (const f of mismatches) {
        lines.push(`| ${f.id} | ${f.events_date} | ${f.official_day1} | ${f.official_day2} | ${f.official_label} | ${f.note} |`);
      }
      lines.push(``);
    }
    if (phantom.length) {
      lines.push(`### Phantom (events.json has an entry for a month with no official meeting)`);
      lines.push(``);
      lines.push(`| id | events.json date | note |`);
      lines.push(`|---|---|---|`);
      for (const f of phantom) {
        lines.push(`| ${f.id} | ${f.events_date} | ${f.note} |`);
      }
      lines.push(``);
    }
    if (missing.length) {
      lines.push(`### Missing (no entry in events.json for this meeting)`);
      lines.push(``);
      for (const f of missing) {
        lines.push(`- ${f.expected_id}: official "${f.official.meeting_label}" Day 2 = ${f.official.day2}`);
      }
      lines.push(``);
    }
    if (ok.length) {
      lines.push(`### OK`);
      lines.push(``);
      for (const f of ok) {
        lines.push(`- ${f.id}: ${f.events_date} matches Day 2 ${f.official_day2}`);
      }
      lines.push(``);
    }
  }
  return lines.join('\n');
}

(async function main() {
  const args = parseArgs(process.argv);
  const events = loadEvents();
  const reports = [];

  const issuers = [
    { prefix: 'boj', label: 'BOJ', fetcher: getBojMeetings },
    { prefix: 'fomc', label: 'FOMC', fetcher: getFomcMeetings },
    { prefix: 'ecb', label: 'ECB', fetcher: getEcbMeetings },
  ];

  for (const year of args.years) {
    for (const issuer of issuers) {
      const r = await checkIssuerYear({
        events,
        year,
        prefix: issuer.prefix,
        label: issuer.label,
        fetcher: issuer.fetcher,
        opts: { useCache: args.useCache },
      });
      reports.push(r);
    }
  }

  const report = md(reports);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(REPORTS_DIR, `factcheck_${stamp}.md`);
  fs.writeFileSync(outPath, report, 'utf8');
  process.stdout.write(report);
  process.stderr.write(`\n[factcheck] report written to ${outPath}\n`);

  const hasIssues = reports.some((r) =>
    r.findings.some((f) => f.kind === 'mismatch' || f.kind === 'phantom'),
  );
  process.exit(hasIssues ? 2 : 0);
})();
