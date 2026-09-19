'use strict';

const assert = require('assert');
const { _internals } = require('./fed');

const html = `
  <p><strong>2026:</strong>
    October&nbsp;16,
    November&nbsp;17,
    November&nbsp;24 (annual revision),
    and December&nbsp;16.
  </p>
  <p><strong>2027:</strong>January&nbsp;15.</p>
`;

assert.deepStrictEqual(
  _internals.parseYearDates(html, 2026),
  ['2026-10-16', '2026-11-17', '2026-12-16'],
);

console.log('fed parser tests passed');
