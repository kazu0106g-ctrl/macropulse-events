#!/usr/bin/env node
// Macropulse-events fact checker.
//
// Compares events.json against authoritative sources for known event series
// (currently: BOJ Monetary Policy Meeting). Generates a markdown report.
//
// IMPORTANT: This tool NEVER edits events.json. It only reports discrepancies.
// Human review and explicit edit are required to apply any change. This is the
// safety net in case a third-party site (or our own parser) has the wrong date.
//
// Usage:
//   node factcheck/factcheck.js              # check current and next year
//   node factcheck/factcheck.js --year 2026
//   node factcheck/factcheck.js --no-cache   # skip 24h cache

'use strict';

const fs = require('fs');
const path = require('path');
const { getBojMeetings } = require('./sources/boj');

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

// BOJ id pattern in events.json: boj_YYYYMM (e.g. boj_202604).
function findBojEventForMonth(events, year, month) {
  const id = `boj_${year}${String(month).padStart(2, '0')}`;
  return events.find((e) => e.id === id) || null;
}

function classifyDiff(eventDate, day1, day2) {
  if (eventDate === day2) return { status: 'ok', note: 'matches Day 2 (announcement day)' };
  if (eventDate === day1) return { status: 'mismatch', note: 'set to Day 1; Day 2 is the announcement day' };
  return { status: 'mismatch', note: 'date does not match either Day 1 or Day 2' };
}

async function checkBojYear(events, year, opts) {
  const result = await getBojMeetings(year, opts);
  const findings = [];
  for (const m of result.meetings) {
    const month = parseInt(m.day2.slice(5, 7), 10);
    // The id encodes the month of Day 2 announcement.
    const ev = findBojEventForMonth(events, year, month);
    if (!ev) {
      // Missing in events.json. Worth reporting as info.
      findings.push({
        kind: 'missing',
        year,
        month,
        expected_id: `boj_${year}${String(month).padStart(2, '0')}`,
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
  return { year, source: result.source, fromCache: result.fromCache, cachedAt: result.cachedAt, findings, notFound: result.notFound };
}

function md(reports) {
  const now = new Date().toISOString();
  const lines = [];
  lines.push(`# Macropulse-events factcheck report`);
  lines.push(``);
  lines.push(`Generated: ${now}`);
  lines.push(``);
  lines.push(`This tool compares events.json against authoritative issuer pages.`);
  lines.push(`No changes are written to events.json. Review the findings below and`);
  lines.push(`update events.json manually if you agree with the diagnosis.`);
  lines.push(``);
  for (const r of reports) {
    lines.push(`## BOJ ${r.year}`);
    lines.push(``);
    lines.push(`Source: ${r.source} (${r.fromCache ? 'cached' : 'fresh'} at ${new Date(r.cachedAt).toISOString()})`);
    lines.push(``);
    if (r.notFound) {
      lines.push(`> Year section not found on the page. The site layout may have changed; investigate the parser.`);
      lines.push(``);
      continue;
    }
    const mismatches = r.findings.filter((f) => f.kind === 'mismatch');
    const missing = r.findings.filter((f) => f.kind === 'missing');
    const ok = r.findings.filter((f) => f.kind === 'ok');
    lines.push(`OK: ${ok.length}, Mismatch: ${mismatches.length}, Missing: ${missing.length}`);
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
  for (const year of args.years) {
    try {
      const r = await checkBojYear(events, year, { useCache: args.useCache });
      reports.push(r);
    } catch (err) {
      reports.push({ year, source: '(BOJ)', fromCache: false, cachedAt: new Date(), findings: [], notFound: true, error: String(err.message || err) });
    }
  }
  const report = md(reports);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(REPORTS_DIR, `factcheck_${stamp}.md`);
  fs.writeFileSync(outPath, report, 'utf8');
  process.stdout.write(report);
  process.stderr.write(`\n[factcheck] report written to ${outPath}\n`);

  // Exit non-zero if any mismatches, so a scheduled task can detect.
  const hasMismatches = reports.some((r) => r.findings.some((f) => f.kind === 'mismatch'));
  process.exit(hasMismatches ? 2 : 0);
})();
