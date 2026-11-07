# Monthly Calendar Review - 2026-11-07

## Calendar

- Audited all 677 records for structure and valid dates.
- Corrected 27 dates and added two missing December US weekly claims releases. Original dates and issuer URLs are retained in `calendar_corrections_2026-11-07.json`.
- The configured automated issuer comparison matched 163 records with zero discrepancies or source errors after correction. This is a subset of the calendar, not confirmation of every record.
- Supplemented the automated checks with annual Japanese CPI/unemployment schedules, the Cabinet Office GDP schedule, ONS, Statistics Canada, ABS, RBA, Bank of Canada and the US weekly claims exception schedule.
- Japan October unemployment data is scheduled for December 1, not November 26. Kept the existing event ID to preserve app notification preferences; the displayed date is December 1. November data is scheduled for December 25.
- US Thanksgiving-week claims move to Wednesday November 25. December claims fall on December 3, 10, 17, 24 and 31.
- NAR release scheduling lists existing-home sales on November 12 and December 9. Only scheduling facts were reviewed; no sales data were imported.

## Earnings

- Refreshed the configured 536-symbol list using the existing SEC and Alpha Vantage workflow.
- Fixed missing SEC ticker lookup for WBD using issuer CIK 0001437107.
- Expired auxiliary and manual dates are no longer selected as upcoming releases. SEC fallback estimates advance once their date has passed; these remain unconfirmed estimates.
- Confirmed NVDA November 17, DIS November 17 and CSCO November 12 against official IR information. Source URLs are retained in the published overrides.
- Added regression checks for stale auxiliary dates, same-day releases, agreement flags and quarter rollover; CI runs them on future changes.

## Remaining Limits

- The automated calendar comparison does not cover every country or indicator. Germany's future CPI schedule and other uncovered entries are not represented as independently verified by this review.
- China trade dates on June 7 and November 7 remain structural audit warnings until issuer scheduling can be confirmed. A weekend is not sufficient evidence to change China's release date.
- Earnings estimates and disagreements remain `confirmed: false` and `needsReview: true`; a successful refresh does not make these dates official.
- Economic calendar data currently end on December 31, 2026. The 2027 calendar still needs a separate issuer-based extension before year-end.
