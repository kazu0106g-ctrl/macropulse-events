# Monthly Calendar Review - 2026-10-12

## Scope and Limits

- Structural audit: every calendar record (675 after removing obsolete releases).
- Automated issuer comparison: 168 matched records; zero discrepancies or source errors.
- The automated comparison does not cover every country/indicator. A zero discrepancy count is not a guarantee that all 675 dates are officially confirmed.
- Additional October comparisons and corrections are documented with issuer URLs in `factcheck/refresh_202610.js`.
- Corrected 17 release dates, including weekly US claims (local US release date, not the following day in Japan).
- China trade dates on 2026-06-07 and 2026-11-07 remain audit warnings pending issuer verification.
- Germany October CPI/GDP could not be independently verified against the issuer calendar (access unavailable). They remain review items.
- Eurostat inflation calendar and the release announcement appear to disagree (October 15 vs October 16). Kept October 16 stated by the indicator-specific announcement: https://ec.europa.eu/eurostat/web/products-euro-indicators/w/2-02102026-ap

## Obsolete Australian Retail Trade

ABS ended Retail Trade after June 2025. Archived the nine invalid 2026 calendar records in `retired_au_retail_20261012.json` and removed them from the app feed. Added the successor Household Spending Indicator releases on November 4 and December 3, 2026.

Sources:
- https://www.abs.gov.au/statistics/industry/retail-and-wholesale-trade/retail-trade-australia/latest-release
- https://www.abs.gov.au/statistics/economy/finance/monthly-household-spending-indicator

## Earnings

- Refresh all 536 configured US-listed symbols through the existing SEC/Alpha Vantage pipeline.
- Correct SEC CIK fallbacks for AVB and PSKY after missing ticker metadata errors.
- Confirm KO (October 27), TSLA (October 21), INTC (October 29) and TSM (October 15) with official issuer announcements. URLs are retained in the overrides and published data.
- Removed the old AES estimate override so updated SEC/auxiliary information can replace it.
- Estimates or conflicting dates remain `confirmed: false` and `needsReview: true`.

## Pipeline Repairs

- Pin the Census calendar to the requested year; the generic URL now serves 2027.
- Fail validation if the requested Census year has no parsed releases.
- Include source errors in reports and fail report-only validation when sources are unavailable.
- Persist reports and run structural checks even when issuer comparison fails.
