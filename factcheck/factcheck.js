#!/usr/bin/env node
// Macropulse-events fact checker.
//
// Compares events.json against authoritative issuer pages (BOJ, FOMC, ECB) and
// generates a markdown report. With --apply, automatically writes corrections
// for tier-A (single authoritative issuer) mismatches and commits/pushes them.
//
// Trust model:
//   - The official issuer page is THE source of truth for that issuer's events.
//   - Raw HTML is parsed in code (no LLM in the data path) so a third-party
//     summary cannot inject wrong dates.
//   - Aggregator quorum is reserved for events without a single issuer (not in
//     this MVP).
//
// Auto-apply safeguards:
//   - --max-changes (default 5): refuse to bulk-edit if mismatches exceed this
//     (catches a buggy parser before it corrupts the data set).
//   - Phantoms (events.json entry for a month with no official meeting) are
//     NEVER auto-applied -- they require a human decision (rename vs delete).
//   - Smoke test: re-runs in memory after applying, aborts and rolls back if
//     any mismatch remains.
//   - Atomic commit/push with a clear message naming the source URLs.
//
// Usage:
//   node factcheck/factcheck.js                        # report only
//   node factcheck/factcheck.js --year 2026
//   node factcheck/factcheck.js --no-cache             # bypass 24h HTML cache
//   node factcheck/factcheck.js --apply                # auto-fix mismatches
//   node factcheck/factcheck.js --apply --max-changes=10
//   node factcheck/factcheck.js --apply --no-commit    # edit but don't commit

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getBojMeetings } = require('./sources/boj');
const { getFomcMeetings } = require('./sources/fomc');
const { getEcbMeetings } = require('./sources/ecb');
const bls = require('./sources/bls');
const bea = require('./sources/bea');

const ROOT = path.join(__dirname, '..');
const EVENTS_PATH = path.join(ROOT, 'events.json');
const REPORTS_DIR = path.join(__dirname, 'reports');

// Central-bank meetings: one event id per meeting (boj_YYYYMM etc.).
const ISSUERS = [
  { prefix: 'boj', label: 'BOJ', fetcher: getBojMeetings },
  { prefix: 'fomc', label: 'FOMC', fetcher: getFomcMeetings },
  { prefix: 'ecb', label: 'ECB', fetcher: getEcbMeetings },
];

// Statistical releases where ONE official release corresponds to one OR more
// events.json ids (e.g. BLS Employment Situation = NFP + Unemployment Rate;
// BEA Personal Income and Outlays = PCE + Core PCE).
async function gatherStatisticalReleases(year, opts) {
  const out = [];
  // BLS releases (Empsit, CPI, PPI).
  for (const releaseKey of Object.keys(bls.RELEASES)) {
    try {
      const r = await bls.getReleases(releaseKey, year, opts);
      for (const rel of r.releases) {
        // Each prefix in the release maps to an event id whose YYYYMM equals
        // the release month (events.json convention). NFP/Unemp share the
        // same release, CPI / Core CPI share the same release, etc.
        const releaseMonth = parseInt(rel.releaseDate.slice(5, 7), 10);
        const releaseYear = parseInt(rel.releaseDate.slice(0, 4), 10);
        const yyyymm = `${releaseYear}${String(releaseMonth).padStart(2, '0')}`;
        const eventIds = r.eventPrefixes.map((p) => `${p}_${yyyymm}`);
        out.push({
          label: r.label,
          source: r.source,
          fromCache: r.fromCache,
          cachedAt: r.cachedAt,
          year,
          releaseDate: rel.releaseDate,
          referenceLabel: rel.refLabel,
          eventIds,
        });
      }
    } catch (err) {
      out.push({ label: `BLS ${releaseKey}`, source: '(error)', error: String(err.message || err), eventIds: [] });
    }
  }
  // BEA releases (GDP advance, PCE).
  try {
    const r = await bea.getReleases(year, opts);
    for (const rel of r.releases) {
      out.push({
        label: rel.kind === 'gdp_advance' ? 'BEA GDP (Advance)' : 'BEA Personal Income & Outlays (PCE)',
        source: r.source,
        fromCache: r.fromCache,
        cachedAt: r.cachedAt,
        year,
        releaseDate: rel.releaseDate,
        referenceLabel: rel.title,
        eventIds: rel.eventIds,
      });
    }
  } catch (err) {
    out.push({ label: 'BEA', source: '(error)', error: String(err.message || err), eventIds: [] });
  }
  return out;
}

async function checkStatisticalReleases({ events, year, opts }) {
  const releases = await gatherStatisticalReleases(year, opts);
  const findings = [];
  let fromCache = true;
  let cachedAt = new Date();
  let source = 'BLS+BEA';
  for (const rel of releases) {
    if (rel.error) {
      findings.push({ kind: 'error', note: rel.error, label: rel.label });
      continue;
    }
    fromCache = fromCache && rel.fromCache;
    cachedAt = rel.cachedAt;
    source = rel.source;
    for (const id of rel.eventIds) {
      const ev = events.find((e) => e.id === id);
      if (!ev) continue; // missing entries are not auto-flagged here
      if (ev.date === rel.releaseDate) {
        findings.push({ kind: 'ok', id, events_date: ev.date, official_day2: rel.releaseDate, official_label: rel.referenceLabel });
      } else {
        findings.push({
          kind: 'mismatch',
          id,
          events_date: ev.date,
          official_day1: null,
          official_day2: rel.releaseDate,
          official_label: rel.referenceLabel,
          note: `${rel.label} schedule says ${rel.releaseDate}`,
        });
      }
    }
  }
  return {
    label: 'BLS/BEA',
    year,
    source,
    fromCache,
    cachedAt,
    findings,
    notFound: false,
  };
}

function parseArgs(argv) {
  const args = { years: null, useCache: true, apply: false, maxChanges: 5, commit: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--year' || a === '-y') {
      args.years = [parseInt(argv[++i], 10)];
    } else if (a === '--no-cache') {
      args.useCache = false;
    } else if (a === '--apply') {
      args.apply = true;
    } else if (a === '--no-commit') {
      args.commit = false;
    } else if (a === '--max-changes') {
      args.maxChanges = parseInt(argv[++i], 10);
    } else if (a.startsWith('--max-changes=')) {
      args.maxChanges = parseInt(a.split('=')[1], 10);
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
      label, prefix, year,
      source: '(error)', fromCache: false, cachedAt: new Date(),
      findings: [], notFound: true,
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
        year, month,
        expected_id: `${prefix}_${year}${String(month).padStart(2, '0')}`,
        official: m,
      });
      continue;
    }
    const cls = classifyDiff(ev.date, m.day1, m.day2);
    findings.push({
      kind: cls.status === 'ok' ? 'ok' : 'mismatch',
      id: ev.id, year, month,
      events_date: ev.date,
      official_day1: m.day1,
      official_day2: m.day2,
      official_label: m.meeting_label,
      note: cls.note,
    });
  }

  // Phantom: id present in events.json but its month has no official meeting.
  // Skip entries whose date is already in the past — those are history, the
  // official site rolled them off the future-only calendar, and we don't want
  // to alarm the user about events that have already happened correctly.
  const todayIso = new Date().toISOString().slice(0, 10);
  const ourEntries = collectIdsForYear(events, prefix, year);
  for (const ev of ourEntries) {
    const month = parseInt(ev.id.slice(-2), 10);
    if (!seenMonths.has(month)) {
      if (ev.date < todayIso) continue; // past: not a phantom, just history
      findings.push({
        kind: 'phantom',
        id: ev.id, year, month,
        events_date: ev.date,
        note: 'no meeting found for this month on the official site',
      });
    }
  }

  return {
    label, prefix, year,
    source: result.source, fromCache: result.fromCache, cachedAt: result.cachedAt,
    findings, notFound: result.notFound,
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
      lines.push(`> Year section not found / no meetings parsed.`);
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
      lines.push(`Auto-apply skips these; rename vs delete needs a human decision.`);
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

// --- Auto-apply -------------------------------------------------------------

function collectMismatches(reports) {
  const out = [];
  for (const r of reports) {
    for (const f of r.findings) {
      if (f.kind !== 'mismatch') continue;
      out.push({
        id: f.id,
        before: f.events_date,
        after: f.official_day2,
        issuer: r.label,
        source: r.source,
        label: f.official_label,
      });
    }
  }
  return out;
}

function applyToEvents(events, mismatches) {
  for (const m of mismatches) {
    const ev = events.find((e) => e.id === m.id);
    if (!ev) throw new Error(`Auto-apply: id ${m.id} not found in events.json`);
    ev.date = m.after;
  }
}

function writeEvents(events) {
  // Preserve existing formatting: 2-space JSON, trailing newline.
  fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2) + '\n', 'utf8');
}

async function smokeTest(years, useCache) {
  const fresh = loadEvents();
  const reports = [];
  for (const year of years) {
    for (const issuer of ISSUERS) {
      const r = await checkIssuerYear({
        events: fresh, year, prefix: issuer.prefix, label: issuer.label,
        fetcher: issuer.fetcher, opts: { useCache },
      });
      reports.push(r);
    }
  }
  const remaining = collectMismatches(reports);
  return { ok: remaining.length === 0, remaining };
}

function gitCommitAndPush(applied) {
  const summary = applied.map((a) => `- ${a.id}: ${a.before} -> ${a.after} (${a.issuer})`).join('\n');
  const sources = [...new Set(applied.map((a) => a.source))].join(', ');
  const msg = [
    `factcheck auto-apply: ${applied.length} date correction(s)`,
    '',
    'Verified against authoritative issuer pages and applied automatically by',
    'factcheck/factcheck.js --apply. Smoke test passed (zero remaining mismatches).',
    '',
    'Changes:',
    summary,
    '',
    `Sources: ${sources}`,
  ].join('\n');

  const opts = { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] };
  execFileSync('git', ['add', 'events.json'], opts);
  execFileSync('git', ['commit', '-m', msg], opts);
  execFileSync('git', ['push', 'origin', 'main'], opts);
}

function purgeRelayCache() {
  // Best-effort. Don't fail the run if the relay is unreachable.
  try {
    execFileSync(
      'curl',
      [
        '-sfS',
        '-X', 'POST',
        '-H', 'Content-Length: 0',
        '--max-time', '30',
        'https://chartr-relay-985476703637.asia-northeast1.run.app/purge-cache?key=events',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return true;
  } catch (err) {
    process.stderr.write(`[factcheck] cache purge failed (non-fatal): ${err.message}\n`);
    return false;
  }
}

// --- Main -------------------------------------------------------------------

(async function main() {
  const args = parseArgs(process.argv);
  const events = loadEvents();
  const reports = [];

  for (const year of args.years) {
    for (const issuer of ISSUERS) {
      const r = await checkIssuerYear({
        events, year,
        prefix: issuer.prefix,
        label: issuer.label,
        fetcher: issuer.fetcher,
        opts: { useCache: args.useCache },
      });
      reports.push(r);
    }
    const stat = await checkStatisticalReleases({
      events, year, opts: { useCache: args.useCache },
    });
    reports.push(stat);
  }

  const report = md(reports);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(REPORTS_DIR, `factcheck_${stamp}.md`);
  fs.writeFileSync(outPath, report, 'utf8');
  process.stdout.write(report);
  process.stderr.write(`\n[factcheck] report written to ${outPath}\n`);

  const mismatches = collectMismatches(reports);
  const phantoms = reports.flatMap((r) => r.findings.filter((f) => f.kind === 'phantom'));

  if (!args.apply) {
    const exit = mismatches.length > 0 || phantoms.length > 0 ? 2 : 0;
    process.exit(exit);
  }

  // --- Auto-apply path -----------------------------------------------------
  process.stderr.write(`\n[factcheck] --apply mode\n`);

  if (mismatches.length === 0) {
    process.stderr.write(`[factcheck] No mismatches; nothing to apply.\n`);
    if (phantoms.length) {
      process.stderr.write(`[factcheck] ${phantoms.length} phantom(s) require human review (not auto-applied).\n`);
    }
    process.exit(phantoms.length ? 3 : 0);
  }

  if (mismatches.length > args.maxChanges) {
    process.stderr.write(
      `[factcheck] ABORT: ${mismatches.length} mismatches exceeds --max-changes=${args.maxChanges}.\n` +
        `[factcheck] This is the bulk-edit safeguard. Investigate the parser or the source page before forcing.\n`,
    );
    process.exit(4);
  }

  // Backup the original file in case we need to roll back.
  const backupPath = `${EVENTS_PATH}.bak`;
  fs.copyFileSync(EVENTS_PATH, backupPath);

  try {
    applyToEvents(events, mismatches);
    writeEvents(events);
    process.stderr.write(`[factcheck] applied ${mismatches.length} change(s) to events.json\n`);

    const smoke = await smokeTest(args.years, args.useCache);
    if (!smoke.ok) {
      throw new Error(
        `Smoke test failed after apply: ${smoke.remaining.length} mismatch(es) still present. Rolling back.`,
      );
    }
    process.stderr.write(`[factcheck] smoke test passed (zero remaining mismatches)\n`);

    fs.unlinkSync(backupPath);
  } catch (err) {
    process.stderr.write(`[factcheck] ${err.message}\n`);
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, EVENTS_PATH);
      fs.unlinkSync(backupPath);
      process.stderr.write(`[factcheck] events.json restored from backup\n`);
    }
    process.exit(5);
  }

  if (args.commit) {
    try {
      gitCommitAndPush(mismatches);
      process.stderr.write(`[factcheck] committed and pushed to origin/main\n`);
      const purged = purgeRelayCache();
      if (purged) process.stderr.write(`[factcheck] chartr-relay cache purged\n`);
    } catch (err) {
      process.stderr.write(`[factcheck] git commit/push failed: ${err.message}\n`);
      process.exit(6);
    }
  } else {
    process.stderr.write(`[factcheck] --no-commit set; events.json modified but not committed\n`);
  }

  if (phantoms.length) {
    process.stderr.write(`[factcheck] ${phantoms.length} phantom(s) require human review (not auto-applied).\n`);
    process.exit(3);
  }
  process.exit(0);
})();
