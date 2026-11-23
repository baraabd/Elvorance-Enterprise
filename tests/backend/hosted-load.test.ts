import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile } from '../../infra/railway/staging/load.mts';
test('hosted latency percentiles are nearest-rank, reject missing data and never mutate samples', () => {
  const v = [100, 1, 4, 2, 3];
  assert.equal(percentile(v, 0.95), 100);
  assert.equal(percentile(v, 0.5), 3);
  assert.deepEqual(v, [100, 1, 4, 2, 3]);
  assert.throws(() => percentile([], 0.95));
  assert.throws(() => percentile(v, 0));
});
