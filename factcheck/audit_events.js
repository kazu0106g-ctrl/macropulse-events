#!/usr/bin/env node
// Broad structural audit for events.json.
//
// This complements factcheck.js. factcheck.js compares selected IDs against
// official calendars; this script catches data-shape problems that can make the
// app display suspicious entries before a source-specific checker exists.

'use strict';

const fs = require('fs');
const path = require('path');
const nbsChina = require('./sources/nbs_china');

const ROOT = path.join(__dirname, '..');
const EVENTS_PATH = path.join(ROOT, 'events.json');

const REQUIRED_FIELDS = ['id', 'name', 'nameEn', 'nameCn', 'country', 'date', 'importance'];
const ALLOWED_DUPLICATE_PREFIXES = [/^us_claims_/, /^us_jolts_/];
const KNOWN_COUNTRIES = new Set(['US', 'JP', 'CN', 'EU', 'UK', 'CA', 'DE', 'AU']);

function parseArgs(argv) {
  const args = { year: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--year' || a === '-y') args.year = parseInt(argv[++i], 10);
    else if (a.startsWith('--year=')) args.year = parseInt(a.split('=')[1], 10);
  }
  return args;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}

function weekday(value) {
  return new Date(`${value}T00:00:00Z`).getUTCDay();
}

function isWeekend(value) {
  const day = weekday(value);
  return day === 0 || day === 6;
}

function isAllowedDuplicate(id) {
  return ALLOWED_DUPLICATE_PREFIXES.some((pattern) => pattern.test(id));
}

function officialWeekendIds(year) {
  const rows = (nbsChina.RELEASES[year] || []);
  const ids = new Set();
  for (const row of rows) {
    if (!isWeekend(row.releaseDate)) continue;
    for (const id of row.eventIds) ids.add(id);
  }
  return ids;
}

function main() {
  const args = parseArgs(process.argv);
  const events = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
  const eventsToCheck = args.year
    ? events.filter((event) => typeof event.date === 'string' && event.date.startsWith(`${args.year}-`))
    : events;

  const officialWeekend = args.year ? officialWeekendIds(args.year) : new Set();
  const errors = [];
  const warnings = [];
  const notes = [];
  const byId = new Map();

  for (const event of eventsToCheck) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in event)) errors.push(`${event.id || '(missing id)'}: missing required field ${field}`);
    }

    if (!isValidDate(event.date)) errors.push(`${event.id || '(missing id)'}: invalid date ${event.date}`);
    if (event.country && !KNOWN_COUNTRIES.has(event.country)) {
      warnings.push(`${event.id}: unknown country code ${event.country}`);
    }
    if (!Number.isInteger(event.importance) || event.importance < 1 || event.importance > 3) {
      errors.push(`${event.id}: importance must be an integer from 1 to 3`);
    }

    if (!byId.has(event.id)) byId.set(event.id, []);
    byId.get(event.id).push(event);

    if (isValidDate(event.date) && isWeekend(event.date)) {
      if (officialWeekend.has(event.id)) {
        notes.push(`${event.id}: weekend date ${event.date} is covered by an official calendar`);
      } else if (event.country === 'CN') {
        warnings.push(`${event.id}: weekend date ${event.date}; keep only with official source confirmation`);
      } else {
        errors.push(`${event.id}: weekend date ${event.date} without an allowed official-source exception`);
      }
    }
  }

  for (const [id, sameIdEvents] of byId.entries()) {
    if (sameIdEvents.length <= 1 || isAllowedDuplicate(id)) continue;
    const dates = sameIdEvents.map((event) => event.date).join(', ');
    errors.push(`${id}: duplicate id used for ${sameIdEvents.length} entries (${dates})`);
  }

  process.stdout.write(`# events.json audit\n\n`);
  process.stdout.write(`Checked entries: ${eventsToCheck.length}${args.year ? ` (${args.year})` : ''}\n`);
  process.stdout.write(`Errors: ${errors.length}\n`);
  process.stdout.write(`Warnings: ${warnings.length}\n\n`);

  if (errors.length) {
    process.stdout.write(`## Errors\n\n`);
    for (const error of errors) process.stdout.write(`- ${error}\n`);
    process.stdout.write(`\n`);
  }
  if (warnings.length) {
    process.stdout.write(`## Warnings\n\n`);
    for (const warning of warnings) process.stdout.write(`- ${warning}\n`);
    process.stdout.write(`\n`);
  }
  if (notes.length) {
    process.stdout.write(`## Notes\n\n`);
    for (const note of notes) process.stdout.write(`- ${note}\n`);
    process.stdout.write(`\n`);
  }

  process.exit(errors.length ? 2 : 0);
}

main();
