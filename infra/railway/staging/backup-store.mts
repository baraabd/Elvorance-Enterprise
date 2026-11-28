import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileDigest, MAX_BACKUP_BYTES, type FileDigest } from './backup-crypto.mts';
import { assertStaging, ensure, stagingTarget } from './target.mts';

export const backupTarget = Object.freeze({
  endpoint: 'https://t3.storageapi.dev',
  bucket: 'staging-backups-djcep-toh',
  region: 'auto',
});
export function backupConfiguration(env: NodeJS.ProcessEnv = process.env) {
  assertStaging(env);
  ensure(env.BACKUP_ENDPOINT === backupTarget.endpoint, 'Unapproved backup storage endpoint.');
  ensure(env.BACKUP_BUCKET === backupTarget.bucket, 'Unapproved backup storage bucket.');
  ensure(env.BACKUP_REGION === backupTarget.region, 'Unapproved backup storage region.');
  const accessKeyId = env.BACKUP_ACCESS_KEY_ID;
  const secretAccessKey = env.BACKUP_SECRET_ACCESS_KEY;
  ensure(accessKeyId && secretAccessKey, 'Protected backup storage credentials are missing.');
  return { ...backupTarget, credentials: { accessKeyId, secretAccessKey } };
}
export function backupObjectKey(source: string, run: string, file: string): string {
  ensure(/^[a-f0-9]{40}$/.test(source), 'Invalid backup source revision.');
  ensure(/^[a-f0-9]{12}$/.test(run), 'Invalid backup run identifier.');
  ensure(
    /^(identity|crm|sales|delivery|billing|tracking|communications|keycloak|manifest)\.enc$/.test(
      file,
    ),
    'Invalid backup object name.',
  );
  return `elvorance/${stagingTarget.environmentId}/${source}/${run}/${file}`;
}
export class BackupStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const config = backupConfiguration(env);
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: config.credentials,
      forcePathStyle: false,
      followRegionRedirects: false,
      maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  async put(key: string, path: string): Promise<FileDigest> {
    this.validateKey(key);
    const digest = await fileDigest(path);
    const body = createReadStream(path);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentLength: digest.bytes,
          ContentType: 'application/octet-stream',
          IfNoneMatch: '*',
          Metadata: { sha256: digest.sha256, envelope: 'ELVSBK01' },
        }),
        { abortSignal: AbortSignal.timeout(120000) },
      );
      return digest;
    } catch {
      throw new Error('Retained encrypted backup upload failed.');
    } finally {
      body.destroy();
    }
  }
  async getVerified(key: string, path: string, expected: FileDigest): Promise<void> {
    this.validateKey(key);
    ensure(
      expected.bytes > 0 &&
        expected.bytes <= MAX_BACKUP_BYTES &&
        /^[a-f0-9]{64}$/.test(expected.sha256),
      'Invalid expected backup digest.',
    );
    // Never overwrite or remove a caller's existing file.
    await writeFile(path, '', { flag: 'wx', mode: 0o600 });
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        {
          abortSignal: AbortSignal.timeout(120000),
        },
      );
      const body = response.Body;
      ensure(
        body && 'pipe' in body && typeof body.pipe === 'function',
        'Backup storage did not provide a Node stream.',
      );
      let count = 0;
      const bound = new Transform({
        transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
          count += chunk.length;
          callback(
            count > expected.bytes
              ? new Error('Backup download exceeded its expected size.')
              : null,
            chunk,
          );
        },
      });
      await pipeline(body, bound, createWriteStream(path, { flags: 'a', mode: 0o600 }), {
        signal: AbortSignal.timeout(120000),
      });
      const digest = await fileDigest(path);
      ensure(
        digest.bytes === expected.bytes && digest.sha256 === expected.sha256,
        'Downloaded retained backup digest mismatch.',
      );
    } catch {
      await rm(path, { force: true });
      throw new Error('Retained backup retrieval or integrity verification failed.');
    }
  }
  close(): void {
    this.client.destroy();
  }
  private validateKey(key: string): void {
    const prefix = `elvorance/${stagingTarget.environmentId}/`;
    ensure(key.startsWith(prefix), 'Foreign backup object scope.');
    const rest = key.slice(prefix.length).split('/');
    ensure(rest.length === 3 && rest[0] && rest[1] && rest[2], 'Invalid backup object path.');
    ensure(backupObjectKey(rest[0], rest[1], rest[2]) === key, 'Noncanonical backup object path.');
  }
}
