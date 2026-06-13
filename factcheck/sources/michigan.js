// University of Michigan Surveys of Consumers release schedule.
//
// Authoritative source:
//   https://data.sca.isr.umich.edu/fetchdoc.php?docid=79628
//
// Covers the preliminary monthly Consumer Sentiment release, mapped to
// events.json ids using release month: us_michigan_YYYYMM.
//
// The source is a PDF. To keep GitHub Actions dependency-free and avoid brittle
// PDF text extraction, checked dates are stored as a small source-backed table.

'use strict';

const URL = 'https://data.sca.isr.umich.edu/fetchdoc.php?docid=79628';

const RELEASES = {
  2026: [
    { releaseDate: '2026-01-09', type: 'prelim' },
    { releaseDate: '2026-02-06', type: 'prelim' },
    { releaseDate: '2026-03-13', type: 'prelim' },
    { releaseDate: '2026-04-10', type: 'prelim' },
    { releaseDate: '2026-05-08', type: 'prelim' },
    { releaseDate: '2026-06-12', type: 'prelim' },
    { releaseDate: '2026-07-17', type: 'prelim' },
    { releaseDate: '2026-08-14', type: 'prelim' },
    { releaseDate: '2026-09-11', type: 'prelim' },
    { releaseDate: '2026-10-09', type: 'prelim' },
    { releaseDate: '2026-11-06', type: 'prelim' },
    { releaseDate: '2026-12-04', type: 'prelim' },
  ],
};

async function getReleases(year) {
  const rows = RELEASES[year] || [];
  return {
    source: URL,
    year,
    fromCache: true,
    cachedAt: new Date(),
    releases: rows.map((row) => {
      const yyyymm = row.releaseDate.slice(0, 7).replace('-', '');
      return {
        eventId: `us_michigan_${yyyymm}`,
        releaseDate: row.releaseDate,
        label: `University of Michigan Consumer Sentiment (${row.type})`,
      };
    }),
    notFound: rows.length === 0,
  };
}

module.exports = {
  URL,
  RELEASES,
  getReleases,
};
