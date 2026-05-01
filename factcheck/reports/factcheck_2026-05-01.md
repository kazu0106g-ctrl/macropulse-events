# Macropulse-events factcheck report

Generated: 2026-05-01T13:53:31.999Z

Compares events.json against authoritative issuer pages.

## BOJ 2026

Source: https://www.boj.or.jp/mopo/mpmsche_minu/index.htm (cached at 2026-05-01T13:52:39.586Z)

OK: 6, Mismatch: 0, Missing: 2, Phantom: 0

### Missing (no entry in events.json for this meeting)

- boj_202601: official "1月22日（木）・23日（金）" Day 2 = 2026-01-23
- boj_202603: official "3月18日（水）・19日（木）" Day 2 = 2026-03-19

### OK

- boj_202604: 2026-04-28 matches Day 2 2026-04-28
- boj_202606: 2026-06-16 matches Day 2 2026-06-16
- boj_202607: 2026-07-31 matches Day 2 2026-07-31
- boj_202609: 2026-09-18 matches Day 2 2026-09-18
- boj_202610: 2026-10-30 matches Day 2 2026-10-30
- boj_202612: 2026-12-18 matches Day 2 2026-12-18

## FOMC 2026

Source: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (cached at 2026-05-01T13:52:39.828Z)

OK: 6, Mismatch: 0, Missing: 2, Phantom: 0

### Missing (no entry in events.json for this meeting)

- fomc_202601: official "January 27-28" Day 2 = 2026-01-28
- fomc_202603: official "March 17-18" Day 2 = 2026-03-18

### OK

- fomc_202604: 2026-04-29 matches Day 2 2026-04-29
- fomc_202606: 2026-06-17 matches Day 2 2026-06-17
- fomc_202607: 2026-07-29 matches Day 2 2026-07-29
- fomc_202609: 2026-09-16 matches Day 2 2026-09-16
- fomc_202610: 2026-10-28 matches Day 2 2026-10-28
- fomc_202612: 2026-12-09 matches Day 2 2026-12-09

## ECB 2026

Source: https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html (cached at 2026-05-01T13:52:40.896Z)

OK: 5, Mismatch: 0, Missing: 0, Phantom: 0

### OK

- ecb_202606: 2026-06-11 matches Day 2 2026-06-11
- ecb_202607: 2026-07-23 matches Day 2 2026-07-23
- ecb_202609: 2026-09-10 matches Day 2 2026-09-10
- ecb_202610: 2026-10-29 matches Day 2 2026-10-29
- ecb_202612: 2026-12-17 matches Day 2 2026-12-17

## BLS/BEA 2026

Source: https://www.bea.gov/news/schedule (cached at 2026-05-01T13:52:42.859Z)

OK: 32, Mismatch: 29, Missing: 0, Phantom: 0

### Mismatch (events.json date differs from official Day 2)

| id | events.json | official Day 1 | official Day 2 | label | note |
|---|---|---|---|---|---|
| us_cpi_202604 | 2026-04-14 | null | 2026-04-10 | March 2026 | BLS CPI schedule says 2026-04-10 |
| us_core_cpi_202604 | 2026-04-14 | null | 2026-04-10 | March 2026 | BLS CPI schedule says 2026-04-10 |
| us_cpi_202605 | 2026-05-13 | null | 2026-05-12 | April 2026 | BLS CPI schedule says 2026-05-12 |
| us_core_cpi_202605 | 2026-05-13 | null | 2026-05-12 | April 2026 | BLS CPI schedule says 2026-05-12 |
| us_cpi_202609 | 2026-09-10 | null | 2026-09-11 | August 2026 | BLS CPI schedule says 2026-09-11 |
| us_core_cpi_202609 | 2026-09-10 | null | 2026-09-11 | August 2026 | BLS CPI schedule says 2026-09-11 |
| us_cpi_202610 | 2026-10-13 | null | 2026-10-14 | September 2026 | BLS CPI schedule says 2026-10-14 |
| us_core_cpi_202610 | 2026-10-13 | null | 2026-10-14 | September 2026 | BLS CPI schedule says 2026-10-14 |
| us_cpi_202611 | 2026-11-12 | null | 2026-11-10 | October 2026 | BLS CPI schedule says 2026-11-10 |
| us_core_cpi_202611 | 2026-11-12 | null | 2026-11-10 | October 2026 | BLS CPI schedule says 2026-11-10 |
| us_ppi_202604 | 2026-04-15 | null | 2026-04-14 | March 2026 | BLS PPI schedule says 2026-04-14 |
| us_ppi_202605 | 2026-05-14 | null | 2026-05-13 | April 2026 | BLS PPI schedule says 2026-05-13 |
| us_ppi_202609 | 2026-09-11 | null | 2026-09-10 | August 2026 | BLS PPI schedule says 2026-09-10 |
| us_ppi_202610 | 2026-10-14 | null | 2026-10-15 | September 2026 | BLS PPI schedule says 2026-10-15 |
| us_ppi_202612 | 2026-12-11 | null | 2026-12-15 | November 2026 | BLS PPI schedule says 2026-12-15 |
| us_pce_202605 | 2026-05-29 | null | 2026-05-28 | Personal Income and Outlays, April 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-05-28 |
| us_core_pce_202605 | 2026-05-29 | null | 2026-05-28 | Personal Income and Outlays, April 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-05-28 |
| us_pce_202606 | 2026-06-26 | null | 2026-06-25 | Personal Income and Outlays, May 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-06-25 |
| us_core_pce_202606 | 2026-06-26 | null | 2026-06-25 | Personal Income and Outlays, May 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-06-25 |
| us_gdp_2026Q2 | 2026-07-29 | null | 2026-07-30 | GDP (Advance Estimate), 2nd Quarter 2026 | BEA GDP (Advance) schedule says 2026-07-30 |
| us_pce_202607 | 2026-07-31 | null | 2026-07-30 | Personal Income and Outlays, June 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-07-30 |
| us_core_pce_202607 | 2026-07-31 | null | 2026-07-30 | Personal Income and Outlays, June 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-07-30 |
| us_pce_202608 | 2026-08-28 | null | 2026-08-26 | Personal Income and Outlays, July 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-08-26 |
| us_core_pce_202608 | 2026-08-28 | null | 2026-08-26 | Personal Income and Outlays, July 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-08-26 |
| us_pce_202609 | 2026-09-25 | null | 2026-09-30 | Personal Income and Outlays, August 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-09-30 |
| us_core_pce_202609 | 2026-09-25 | null | 2026-09-30 | Personal Income and Outlays, August 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-09-30 |
| us_gdp_2026Q3 | 2026-10-28 | null | 2026-10-29 | GDP (Advance Estimate), 3rd Quarter 2026 | BEA GDP (Advance) schedule says 2026-10-29 |
| us_pce_202610 | 2026-10-30 | null | 2026-10-29 | Personal Income and Outlays, September 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-10-29 |
| us_core_pce_202610 | 2026-10-30 | null | 2026-10-29 | Personal Income and Outlays, September 2026 | BEA Personal Income & Outlays (PCE) schedule says 2026-10-29 |

### OK

- us_nfp_202605: 2026-05-08 matches Day 2 2026-05-08
- us_unemployment_202605: 2026-05-08 matches Day 2 2026-05-08
- us_nfp_202606: 2026-06-05 matches Day 2 2026-06-05
- us_unemployment_202606: 2026-06-05 matches Day 2 2026-06-05
- us_nfp_202607: 2026-07-02 matches Day 2 2026-07-02
- us_unemployment_202607: 2026-07-02 matches Day 2 2026-07-02
- us_nfp_202608: 2026-08-07 matches Day 2 2026-08-07
- us_unemployment_202608: 2026-08-07 matches Day 2 2026-08-07
- us_nfp_202609: 2026-09-04 matches Day 2 2026-09-04
- us_unemployment_202609: 2026-09-04 matches Day 2 2026-09-04
- us_nfp_202610: 2026-10-02 matches Day 2 2026-10-02
- us_unemployment_202610: 2026-10-02 matches Day 2 2026-10-02
- us_nfp_202611: 2026-11-06 matches Day 2 2026-11-06
- us_unemployment_202611: 2026-11-06 matches Day 2 2026-11-06
- us_nfp_202612: 2026-12-04 matches Day 2 2026-12-04
- us_unemployment_202612: 2026-12-04 matches Day 2 2026-12-04
- us_cpi_202606: 2026-06-10 matches Day 2 2026-06-10
- us_core_cpi_202606: 2026-06-10 matches Day 2 2026-06-10
- us_cpi_202607: 2026-07-14 matches Day 2 2026-07-14
- us_core_cpi_202607: 2026-07-14 matches Day 2 2026-07-14
- us_cpi_202608: 2026-08-12 matches Day 2 2026-08-12
- us_core_cpi_202608: 2026-08-12 matches Day 2 2026-08-12
- us_cpi_202612: 2026-12-10 matches Day 2 2026-12-10
- us_core_cpi_202612: 2026-12-10 matches Day 2 2026-12-10
- us_ppi_202606: 2026-06-11 matches Day 2 2026-06-11
- us_ppi_202607: 2026-07-15 matches Day 2 2026-07-15
- us_ppi_202608: 2026-08-13 matches Day 2 2026-08-13
- us_ppi_202611: 2026-11-13 matches Day 2 2026-11-13
- us_pce_202611: 2026-11-25 matches Day 2 2026-11-25
- us_core_pce_202611: 2026-11-25 matches Day 2 2026-11-25
- us_pce_202612: 2026-12-23 matches Day 2 2026-12-23
- us_core_pce_202612: 2026-12-23 matches Day 2 2026-12-23
