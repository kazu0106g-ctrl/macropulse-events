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
- Optional auxiliary source: Alpha Vantage `EARNINGS_CALENDAR`, when
  `ALPHAVANTAGE_API_KEY` is configured as a GitHub Actions secret.
- Runner: GitHub Actions standard Ubuntu runner.
- Schedule: daily at 22:00 UTC / 07:00 JST.
- Cost guard: no paid APIs, no artifacts, no Cloud Run job.
- SEC guard: declared User-Agent, sequential collection, polite delay.
- `confirmed: true` means the date is good enough for app display:
  official/manual confirmation OR SEC estimate matching the auxiliary calendar.
- `officialConfirmed: true` means the date was found in an official/primary
  source path, not just a multi-source agreement.
- If SEC only has a weak YoY estimate and the auxiliary calendar agrees, the
  date is written with `confirmed: true`, `officialConfirmed: false`, and
  `confidence: multi_source_agreed`.
- If SEC only has a weak YoY estimate and the auxiliary calendar has a
  different future date, the auxiliary date is written with `confirmed: false`,
  `needsReview: true`, and the SEC estimate is retained for audit.
- If no auxiliary source is configured, the pipeline still runs using SEC only.

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
