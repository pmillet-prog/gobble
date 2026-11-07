import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCurrency } from './compactCurrency.js';
test('currency stays within three characters at every magnitude boundary', () => {
  for (const [value, expected] of [[0,'0'],[999,'999'],[1000,'1k'],[1099,'1k'],[1100,'1k1'],[9999,'9k9'],
    [10000,'10k'],[99999,'99k'],[100000,'0m1'],[1000000,'1m'],[1100000,'1m1'],[1e8,'0b1'],[1e11,'0t1'],[null,'—']]) {
    assert.equal(compactCurrency(value), expected); assert.ok(compactCurrency(value).length <= 3);
  }
});
