'use strict';

const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'events.json');
const events = JSON.parse(fs.readFileSync(file, 'utf8'));
const jp = 'https://www.e-stat.go.jp/release-calendar';
const cpi = 'https://www.stat.go.jp/data/kouhyou/e-stat_cpi.xml';
const labour = 'https://www.stat.go.jp/data/roudou/pdf/kohyo26.pdf';
const canada = 'https://www150.statcan.gc.ca/n1/release-diffusion/2026-eng.pdf';
const fixes = [
  ['jp_cpi_202611', '2026-11-20', jp],
  ['jp_core_cpi_202611', '2026-11-20', jp],
  ['jp_retail_202611', '2026-11-30', jp],
  ['jp_indprod_202611', '2026-11-30', jp],
  ['jp_gdp_2026Q3', '2026-11-16', 'https://www.esri.cao.go.jp/jp/sna/kouhyou/kouhyou_top.html'],
  ['jp_unemp_202611', '2026-12-01', labour],
  ['jp_unemp_202612', '2026-12-25', labour],
  ['jp_cpi_202612', '2026-12-18', cpi],
  ['jp_core_cpi_202612', '2026-12-18', cpi],
  ['uk_unemp_202611', '2026-11-17', 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/uklabourmarket/october2026'],
  ['ca_cpi_202611', '2026-11-16', canada],
  ['ca_gdp_202611', '2026-11-30', canada],
  ['ca_cpi_202612', '2026-12-14', canada],
  ['ca_trade_202612', '2026-12-08', canada],
  ['au_employ_202611', '2026-11-19', 'https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia'],
  ['au_unemp_202611', '2026-11-19', 'https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia'],
  ['rba_202612', '2026-12-08', 'https://www.rba.gov.au/schedules-events/board-meeting-schedules.html'],
  ['boc_202612', '2026-12-09', 'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/'],
];
const changes = [];
for (const [id, date, source] of fixes) {
  const matches = events.filter((e) => e.id === id);
  if (matches.length !== 1) throw new Error(`Expected one ${id}`);
  const event = matches[0];
  if (event.date !== date) changes.push({ id, before: event.date, date, source });
  event.date = date;
}

// Keep the moved release's ID to preserve existing app notification preferences.
// October labour data is published December 1; there is no November basic release.
const claimsSource = 'https://oui.doleta.gov/unemploy/archive.asp';
const claims = {
  '2026-11-06': '2026-11-05', '2026-11-13': '2026-11-12',
  '2026-11-20': '2026-11-19', '2026-11-27': '2026-11-25',
  '2026-12-04': '2026-12-03', '2026-12-11': '2026-12-10', '2026-12-18': '2026-12-17',
};
for (const event of events.filter((e) => /^us_claims_20261[12]$/.test(e.id))) {
  if (!claims[event.date]) continue;
  changes.push({ id: event.id, before: event.date, date: claims[event.date], source: claimsSource });
  event.date = claims[event.date];
}
for (const date of ['2026-12-24', '2026-12-31']) {
  if (events.some((e) => e.id === 'us_claims_202612' && e.date === date)) continue;
  const template = events.find((e) => e.id === 'us_claims_202612');
  if (!template) throw new Error('Missing claims template');
  events.push({ ...template, date });
  changes.push({ id: template.id, before: null, date, source: claimsSource });
}
fs.writeFileSync(file, JSON.stringify(events, null, 2) + '\n');
const report = path.join(__dirname, 'reports', 'calendar_corrections_2026-11-07.json');
if (changes.length) fs.writeFileSync(report, JSON.stringify(changes, null, 2) + '\n');
console.log(`Corrected ${changes.filter((e) => e.before).length}; added ${changes.filter((e) => !e.before).length}`);
