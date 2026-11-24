import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { format, resolveConfig } from 'prettier';
interface Operation {
  service: string;
  method: string;
  servicePath: string;
  gatewayPath: string;
  roles: string[];
  summary: string;
  requestSchema: string | null;
  responseSchema: string;
  paginated: boolean;
}
interface Document {
  info: { version: string };
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components: { schemas: Record<string, unknown> };
}
const read = async <T,>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
const save = async (path: string, data: unknown) =>
  writeFile(
    path,
    await format(JSON.stringify(data), { ...(await resolveConfig(path)), filepath: path }),
  );
const additions = await read<{ operations: Operation[]; schemas: Record<string, unknown> }>(
  'packages/contracts/sprint04-additions.json',
);
const api = await read<Document>('packages/contracts/openapi.json');
const inventory = await read<Array<Record<string, unknown>>>(
  'packages/contracts/route-inventory.json',
);
for (const operation of additions.operations) {
  const {
    service,
    method,
    servicePath,
    gatewayPath,
    roles,
    summary,
    requestSchema,
    responseSchema,
    paginated,
  } = operation;
  assert.ok(
    servicePath.startsWith('/v1/') && gatewayPath === `/v1/${service}${servicePath.slice(3)}`,
  );
  const parameters: unknown[] = [...servicePath.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 100 },
  }));
  if (method !== 'GET') parameters.push({ $ref: '#/components/parameters/IdempotencyKey' });
  if (paginated)
    parameters.push(
      { $ref: '#/components/parameters/ListCursor' },
      { $ref: '#/components/parameters/ListLimit' },
    );
  const template = api.paths['/v1/sales/tasks']?.[method === 'GET' ? 'get' : 'post'];
  assert.ok(template);
  const responses = structuredClone(template.responses) as Record<string, unknown>;
  responses['200'] = {
    description:
      'Persisted tenant-scoped resource, including current version; lists use an opaque bounded cursor.',
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${responseSchema}` } } },
  };
  const path = (api.paths[gatewayPath] ??= {});
  path[method.toLowerCase()] = {
    operationId: `${service}_${method.toLowerCase()}_${servicePath
      .slice(4)
      .replaceAll(/[{}]/g, '')
      .replaceAll(/[^A-Za-z0-9]/g, '_')}`,
    tags: [service],
    summary,
    description: `${summary}. Writes require a stable Idempotency-Key; updates require expectedVersion. Server-owned fields are rejected. Resource access and idempotent replays are tenant/owner scoped.`,
    'x-roles': roles,
    parameters,
    responses,
    ...(requestSchema
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: `#/components/schemas/${requestSchema}` } },
            },
          },
        }
      : {}),
  };
  const row = { service, method, gatewayPath, servicePath, roles, summary };
  const index = inventory.findIndex(
    (entry) => entry.method === method && entry.gatewayPath === gatewayPath,
  );
  if (index < 0) inventory.push(row);
  else inventory[index] = row;
}
Object.assign(api.components.schemas, additions.schemas);
api.info.version = '2.6.0';
await save('packages/contracts/openapi.json', api);
await save('packages/contracts/route-inventory.json', inventory);

// Refresh only explicitly reviewed hashes; never auto-approve arbitrary source changes.
const review = await read<{
  reviews: Array<{ path: string; previousSha256: string; reviewedSha256: string }>;
}>('docs/sprint04/source-review.json');
const semantic = await read<{
  evidenceFiles: Record<string, string>;
  bindings: Array<{ featureId: string; evidencePaths: string[]; sourceFileSha256: string }>;
}>('docs/production/semantic-bindings.json');
for (const item of review.reviews) {
  assert.equal(
    createHash('sha256')
      .update(await readFile(item.path))
      .digest('hex'),
    item.reviewedSha256,
    `Source needs re-review: ${item.path}`,
  );
  assert.ok(
    [item.previousSha256, item.reviewedSha256].includes(semantic.evidenceFiles[item.path] ?? ''),
    `Unknown evidence version: ${item.path}`,
  );
  semantic.evidenceFiles[item.path] = item.reviewedSha256;
  for (const binding of semantic.bindings)
    if (
      binding.sourceFileSha256 === item.previousSha256 &&
      binding.evidencePaths.includes(item.path)
    )
      binding.sourceFileSha256 = item.reviewedSha256;
}
await save('docs/production/semantic-bindings.json', semantic);
console.log(
  `Updated ${additions.operations.length} additive contracts and ${review.reviews.length} explicitly reviewed evidence hashes; no quality/debt baseline changed.`,
);
