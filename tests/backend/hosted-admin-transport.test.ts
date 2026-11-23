import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminClient } from '../../infra/identity/admin-client.mts';
test('role removal sends only the explicit JSON mappings to a pinned identity origin', async () => {
  const observed: Array<{ method?: string; body?: BodyInit | null }> = [];
  const client = createAdminClient(
    'https://identity.example',
    'test-only-token',
    async (url, options) => {
      assert.equal(new URL(String(url)).origin, 'https://identity.example');
      assert.equal(options?.redirect, 'error');
      observed.push({
        ...(options?.method ? { method: options.method } : {}),
        ...(options?.body === undefined ? {} : { body: options.body }),
      });
      return new Response(null, { status: 204 });
    },
  );
  await client.remove('/admin/realms/staging/users/test/role-mappings/clients/api', [
    { id: 'rep-id', name: 'rep' },
  ]);
  await client.remove('/admin/realms/staging/users/test');
  assert.equal(observed[0]?.method, 'DELETE');
  assert.deepEqual(JSON.parse(String(observed[0]?.body)), [{ id: 'rep-id', name: 'rep' }]);
  assert.equal(observed[1]?.body, undefined);
});
