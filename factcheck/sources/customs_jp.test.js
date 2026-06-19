'use strict';

const assert = require('assert');
const { _internals } = require('./customs_jp');

const html = `
  <table>
    <tr><td>2026\u5e745\u6708</td><td>2026\u5e746\u670817\u65e5\uff08\u901f\u5831\uff09</td></tr>
    <tr><td>2026\u5e745\u6708</td><td>2026\u5e746\u670817\u65e5\uff08\u901f\u5831\uff09</td></tr>
    <tr><td>2026\u5e745\u6708\uff08\u4e0a\u4e2d\u65ec\uff09</td><td>2026\u5e746\u67085\u65e5\uff08\u901f\u5831\uff09</td></tr>
    <tr><td>2026\u5e744\u6708</td><td>2026\u5e745\u670828\u65e5\uff08\u78ba\u901f\uff09</td></tr>
    <tr><td>2026\u5e743\u6708</td><td>2026\u5e745\u670828\u65e5\uff08\u78ba\u5831\uff09</td></tr>
  </table>
`;

const rows = _internals.parseTradeScheduleHtml(html, 2026);
assert.deepStrictEqual(
  [...new Set(rows.map((row) => row.date))],
  ['2026-06-17'],
);

console.log('customs_jp parser tests passed');
