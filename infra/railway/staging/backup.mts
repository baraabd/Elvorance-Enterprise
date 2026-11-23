import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { assertStaging, ensure, sourceRevision, type Domain } from './target.mts';
export const backupTarget = Object.freeze({
  endpoint: 'https://t3.storageapi.dev',
  bucket: 'staging-backups-djcep-toh',
  region: 'auto',
});
const MAX_DUMP = 32 * 1024 * 1024;
const MAX_OBJECT = 48 * 1024 * 1024;
export const sha256 = (bytes: Buffer | string): string =>
  createHash('sha256').update(bytes).digest('hex');
export function sealBackup(plaintext: Buffer, keyHex: string, context: string): Buffer {
  ensure(/^[a-f0-9]{64}$/.test(keyHex), 'Backup encryption key must be 32 bytes in hex.');
  ensure(plaintext.length <= MAX_DUMP, 'Backup exceeds the reviewed staging memory budget.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), nonce);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      context,
      nonce: nonce.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      data: encrypted.toString('base64'),
    }),
  );
}
export function openBackup(encrypted: Buffer, keyHex: string, expectedContext: string): Buffer {
  try {
    ensure(
      encrypted.length <= MAX_OBJECT && /^[a-f0-9]{64}$/.test(keyHex),
      'Invalid backup envelope.',
    );
    const value = JSON.parse(encrypted.toString('utf8')) as Record<string, unknown>;
    ensure(
      value.schemaVersion === 1 &&
        value.context === expectedContext &&
        typeof value.nonce === 'string' &&
        /^[a-f0-9]{24}$/.test(value.nonce) &&
        typeof value.tag === 'string' &&
        /^[a-f0-9]{32}$/.test(value.tag) &&
        typeof value.data === 'string',
      'Invalid backup envelope.',
    );
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(keyHex, 'hex'),
      Buffer.from(value.nonce, 'hex'),
    );
    decipher.setAAD(Buffer.from(expectedContext));
    decipher.setAuthTag(Buffer.from(value.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]);
  } catch {
    throw new Error('Backup authentication failed.');
  }
}
/** Restricted, single-chunk S3 SigV4. Fixed ASCII keys, no redirects, queries, session tokens or arbitrary endpoints. */
export function signedHeaders(
  method: 'GET' | 'PUT',
  url: URL,
  payload: Buffer,
  accessKey: string,
  secretKey: string,
  now = new Date(),
): Record<string, string> {
  ensure(
    /^[A-Za-z0-9_-]{8,128}$/.test(accessKey) && secretKey.length >= 16,
    'Missing bucket credentials.',
  );
  ensure(
    url.origin === `https://${backupTarget.bucket}.t3.storageapi.dev` &&
      /^\/sprint02\/[a-f0-9]{40}\/[a-f0-9]{24}\/(identity|crm|sales|delivery|billing|tracking|communications)\.json$/.test(
        url.pathname,
      ) &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password,
    'Unapproved backup object target.',
  );
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8),
    hash = sha256(payload);
  const names = 'host;x-amz-content-sha256;x-amz-date';
  const canonical = [
    method,
    url.pathname,
    '',
    `host:${url.host}\nx-amz-content-sha256:${hash}\nx-amz-date:${date}\n`,
    names,
    hash,
  ].join('\n');
  const scope = `${day}/${backupTarget.region}/s3/aws4_request`;
  const hmac = (key: Buffer | string, text: string): Buffer =>
    createHmac('sha256', key).update(text).digest();
  const key = hmac(
    hmac(hmac(hmac('AWS4' + secretKey, day), backupTarget.region), 's3'),
    'aws4_request',
  );
  const signature = hmac(key, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha256(canonical)}`).toString(
    'hex',
  );
  return {
    'x-amz-date': date,
    'x-amz-content-sha256': hash,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names}, Signature=${signature}`,
  };
}
async function transfer(
  method: 'GET' | 'PUT',
  url: URL,
  payload: Buffer,
  env: NodeJS.ProcessEnv,
): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...signedHeaders(
          method,
          url,
          payload,
          env.BACKUP_ACCESS_KEY_ID ?? '',
          env.BACKUP_SECRET_ACCESS_KEY ?? '',
        ),
        ...(method === 'PUT' ? { 'if-none-match': '*' } : {}),
      },
      ...(method === 'PUT' ? { body: new Uint8Array(payload) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(120000),
    });
    ensure(response.ok, 'Bucket request failed.');
    if (method === 'PUT') {
      await response.body?.cancel();
      return Buffer.alloc(0);
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    const reader = response.body?.getReader();
    if (reader)
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          ensure(bytes <= MAX_OBJECT, 'Backup exceeds the reviewed staging memory budget.');
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    return Buffer.concat(chunks);
  } catch {
    throw new Error('Bucket transfer failed; inspect restricted provider diagnostics.');
  }
}
/** Restore consumes the downloaded authenticated object, not the original local dump. No automatic deletion. */
export async function retainAndReadBack(
  file: string,
  service: Domain,
  run: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  assertStaging(env);
  ensure(
    env.BACKUP_RETENTION_MODE === 'retain-and-verify',
    'Retained backup needs explicit approval.',
  );
  ensure(
    env.BACKUP_ENDPOINT === backupTarget.endpoint &&
      env.BACKUP_BUCKET === backupTarget.bucket &&
      env.BACKUP_REGION === backupTarget.region,
    'Wrong backup bucket.',
  );
  ensure(/^[a-f0-9]{24}$/.test(run), 'Invalid backup run ID.');
  const source = sourceRevision(env);
  const objectKey = `sprint02/${source}/${run}/${service}.json`;
  const target = new URL(`https://${backupTarget.bucket}.t3.storageapi.dev/${objectKey}`);
  ensure((await stat(file)).size <= MAX_DUMP, 'Backup exceeds the reviewed staging memory budget.');
  const plaintext = await readFile(file),
    key = env.BACKUP_ENCRYPTION_KEY ?? '';
  const encrypted = sealBackup(plaintext, key, objectKey);
  await transfer('PUT', target, encrypted, env);
  const downloaded = await transfer('GET', target, Buffer.alloc(0), env);
  ensure(sha256(downloaded) === sha256(encrypted), 'Backup read-back digest mismatch.');
  const recovered = openBackup(downloaded, key, objectKey);
  ensure(sha256(recovered) === sha256(plaintext), 'Backup plaintext digest mismatch.');
  await writeFile(file, recovered, { mode: 0o600 });
  return {
    objectKey,
    encryptedSha256: sha256(encrypted),
    dumpSha256: sha256(recovered),
    source,
    readBackVerified: true,
    restorationInput: 'downloaded-authenticated-object',
    retentionPolicy: 'no automatic deletion; external lifecycle approval required',
  };
}
