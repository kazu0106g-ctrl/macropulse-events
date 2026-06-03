# Macro Pulse Data Operations

This repo feeds Macro Pulse through the Cloud Run relay. Keep the data pipeline
free-tier friendly, legal, and auditable.

## Priorities

1. Legal source usage and source terms
2. Secret safety and least privilege
3. Date accuracy

## Earnings Dates

- Scope: US-listed equities only, currently about 536 symbols.
- Primary source: SEC EDGAR public data.
- Runner: GitHub Actions standard Ubuntu runner.
- Schedule: daily at 22:00 UTC / 07:00 JST.
- Cost guard: no paid APIs, no artifacts, no Cloud Run job.
- SEC guard: declared User-Agent, sequential collection, polite delay.
- Mismatches or weak dates remain non-confirmed so the app can keep guiding
  users toward manual correction.

## Economic Events

- Scope: existing events.json calendar, currently US/JP/EU/UK/DE/CA/CN/AU.
- Primary sources: official issuer calendars only.
- Runner: GitHub Actions standard Ubuntu runner.
- Schedule: daily at 22:20 UTC / 07:20 JST for current-year validation.
- The factcheck workflow writes markdown reports only. It does not auto-edit
  events.json during the trial period.
- Auxiliary non-official sources may be added only after their terms are checked;
  they should be used as discrepancy detectors, not as the source of truth.

## Free-Tier Guardrails

- Keep workflows on standard `ubuntu-latest`.
- Do not upload large artifacts.
- Do not run the scheduled update through Cloud Run, Cloud Run Jobs, or Cloud
  Build.
- Prefer JSON/report commits over artifact retention.
- Keep workflow timeouts small enough to reveal runaway jobs:
  - earnings: 30 minutes
  - events factcheck: 15 minutes

## Review Loop

During the trial period, inspect the generated reports and runtime weekly.
If runs are slow, noisy, or near quota, reduce frequency before adding sources.
