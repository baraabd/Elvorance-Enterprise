import test from 'node:test';
import assert from 'node:assert/strict';
import { statusLabel } from '../../packages/api-client/src/live-format.ts';

test('commercial and billing states have readable Arabic labels', () => {
  assert.equal(statusLabel('changes_requested'), 'مطلوب تعديل');
  assert.equal(statusLabel('part_paid'), 'مسدد جزئياً');
  assert.equal(statusLabel('paid'), 'مسدد');
  assert.equal(statusLabel('pending'), 'بانتظار الإجراء');
});

test('unknown or inherited status keys do not become misleading success labels', () => {
  for (const value of [undefined, null, 1, {}, 'future_state', 'toString', '__proto__']) {
    assert.equal(statusLabel(value), 'حالة غير معروفة');
  }
});
