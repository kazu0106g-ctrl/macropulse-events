'use strict';

const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'events.json');
const events = JSON.parse(fs.readFileSync(file, 'utf8'));
const corrections = [
  ['jp_cpi_202610', '2026-10-23', 'https://www.e-stat.go.jp/release-calendar'],
  ['jp_core_cpi_202610', '2026-10-23', 'https://www.e-stat.go.jp/release-calendar'],
  ['jp_unemp_202610', '2026-10-30', 'https://www.e-stat.go.jp/release-calendar'],
  ['jp_retail_202610', '2026-10-30', 'https://www.e-stat.go.jp/release-calendar'],
  ['jp_indprod_202610', '2026-10-30', 'https://www.e-stat.go.jp/release-calendar'],
  ['uk_gdp_202610', '2026-10-15', 'https://www.ons.gov.uk/releases/gdpmonthlyestimateukjuly2026'],
  ['uk_indprod_202610', '2026-10-15', 'https://www.ons.gov.uk/releases/indexofproductionukjuly2026'],
  ['uk_unemp_202610', '2026-10-20', 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/uklabourmarket/september2026'],
  ['uk_retail_202610', '2026-10-23', 'https://www.ons.gov.uk/businessindustryandtrade/retailindustry/bulletins/retailsales/august2026'],
  ['ca_cpi_202610', '2026-10-19', 'https://www.statcan.gc.ca/en/subjects-start/prices_and_price_indexes/consumer_price_indexes'],
  ['boc_202610', '2026-10-28', 'https://www.bankofcanada.ca/2025/08/bank-canada-publishes-2026-schedule-policy-interest-rate-announcements-other-major-publications/'],
  ['us_existhome_202610', '2026-10-13', 'https://www.nar.realtor/research-and-statistics/housing-statistics/existing-home-sales'],
];
const changes = [];
for (const [id, date, source] of corrections) {
  const matches = events.filter((e) => e.id === id);
  if (matches.length !== 1) throw new Error(`Expected one event for ${id}`);
  changes.push({ id, previous: matches[0].date, date, source });
  matches[0].date = date;
}

// The app stores weekly claims with one repeated monthly id. Match each date.
const claims = { '2026-10-02': '2026-10-01', '2026-10-09': '2026-10-08', '2026-10-16': '2026-10-15', '2026-10-23': '2026-10-22', '2026-10-30': '2026-10-29' };
for (const event of events.filter((e) => e.id === 'us_claims_202610')) {
  const date = claims[event.date];
  if (!date) continue;
  changes.push({ id: event.id, previous: event.date, date, source: 'https://oui.doleta.gov/unemploy/archive.asp' });
  event.date = date;
}
fs.writeFileSync(file, JSON.stringify(events, null, 2) + '\n');
console.log(JSON.stringify(changes, null, 2));
