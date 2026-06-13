// National Bureau of Statistics of China release schedule.
//
// Authoritative source:
//   https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/202512/t20251226_1962154.html
//
// Covers the 2026 NBS regular press release calendar. The source is a static
// annual table, so we keep a small source-backed table instead of scraping a
// fragile cross-browser HTML table layout in GitHub Actions.

'use strict';

const URL = 'https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/202512/t20251226_1962154.html';

const RELEASES = {
  2026: [
    // National Economic Performance. Quarterly releases include GDP; monthly
    // releases also cover industrial production, retail sales, and unemployment.
    { releaseDate: '2026-01-19', eventIds: ['cn_gdp_2025Q4'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-03-16', eventIds: ['cn_retail_202603', 'cn_indprod_202603', 'cn_unemp_202603'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-04-16', eventIds: ['cn_gdp_2026Q1', 'cn_retail_202604', 'cn_indprod_202604', 'cn_unemp_202604'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-05-18', eventIds: ['cn_retail_202605', 'cn_indprod_202605', 'cn_unemp_202605'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-06-16', eventIds: ['cn_retail_202606', 'cn_indprod_202606', 'cn_unemp_202606'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-07-15', eventIds: ['cn_gdp_2026Q2', 'cn_retail_202607', 'cn_indprod_202607', 'cn_unemp_202607'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-08-17', eventIds: ['cn_retail_202608', 'cn_indprod_202608', 'cn_unemp_202608'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-09-15', eventIds: ['cn_retail_202609', 'cn_indprod_202609', 'cn_unemp_202609'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-10-19', eventIds: ['cn_gdp_2026Q3', 'cn_retail_202610', 'cn_indprod_202610', 'cn_unemp_202610'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-11-16', eventIds: ['cn_retail_202611', 'cn_indprod_202611', 'cn_unemp_202611'], label: 'NBS National Economic Performance' },
    { releaseDate: '2026-12-15', eventIds: ['cn_retail_202612', 'cn_indprod_202612', 'cn_unemp_202612'], label: 'NBS National Economic Performance' },

    // Purchasing Managers' Index.
    { releaseDate: '2026-01-31', eventIds: ['cn_pmi_202601'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-03-04', eventIds: ['cn_pmi_202602'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-03-31', eventIds: ['cn_pmi_202603'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-04-30', eventIds: ['cn_pmi_202604'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-05-31', eventIds: ['cn_pmi_202605'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-06-30', eventIds: ['cn_pmi_202606'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-07-31', eventIds: ['cn_pmi_202607'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-08-31', eventIds: ['cn_pmi_202608'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-09-30', eventIds: ['cn_pmi_202609'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-10-31', eventIds: ['cn_pmi_202610'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-11-30', eventIds: ['cn_pmi_202611'], label: 'NBS Manufacturing PMI' },
    { releaseDate: '2026-12-31', eventIds: ['cn_pmi_202612'], label: 'NBS Manufacturing PMI' },

    // CPI and PPI share the same official monthly dates.
    { releaseDate: '2026-01-09', eventIds: ['cn_cpi_202601', 'cn_ppi_202601'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-02-11', eventIds: ['cn_cpi_202602', 'cn_ppi_202602'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-03-09', eventIds: ['cn_cpi_202603', 'cn_ppi_202603'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-04-10', eventIds: ['cn_cpi_202604', 'cn_ppi_202604'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-05-11', eventIds: ['cn_cpi_202605', 'cn_ppi_202605'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-06-10', eventIds: ['cn_cpi_202606', 'cn_ppi_202606'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-07-09', eventIds: ['cn_cpi_202607', 'cn_ppi_202607'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-08-09', eventIds: ['cn_cpi_202608', 'cn_ppi_202608'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-09-09', eventIds: ['cn_cpi_202609', 'cn_ppi_202609'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-10-14', eventIds: ['cn_cpi_202610', 'cn_ppi_202610'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-11-09', eventIds: ['cn_cpi_202611', 'cn_ppi_202611'], label: 'NBS CPI/PPI' },
    { releaseDate: '2026-12-09', eventIds: ['cn_cpi_202612', 'cn_ppi_202612'], label: 'NBS CPI/PPI' },
  ],
};

async function getReleases(year) {
  const rows = RELEASES[year] || [];
  return {
    source: URL,
    year,
    fromCache: true,
    cachedAt: new Date(),
    releases: rows.flatMap((row) => row.eventIds.map((eventId) => ({
      eventId,
      releaseDate: row.releaseDate,
      label: row.label,
    }))),
    notFound: rows.length === 0,
  };
}

module.exports = {
  URL,
  RELEASES,
  getReleases,
};
