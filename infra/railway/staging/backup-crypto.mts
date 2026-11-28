import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, lstat, open, rm, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ensure } from './target.mts';

const MAGIC = Buffer.from('ELVSBK01', 'ascii');
const PREFIX_BYTES = 24; // magic[8], contextLength[4], nonce[12]
const TAG_BYTES = 16;
const MAX_CONTEXT_BYTES = 2048;
export const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
export interface FileDigest {
  bytes: number;
  sha256: string;
}
export function backupKey(value: string): Buffer {
  const key = /^[a-fA-F0-9]{64}$/.test(value)
    ? Buffer.from(value, 'hex')
    : /^[A-Za-z0-9+/]{43}=$/.test(value)
      ? Buffer.from(value, 'base64')
      : Buffer.alloc(0);
  ensure(key.length === 32, 'A protected 256-bit backup encryption key is required.');
  return key;
}
export async function fileDigest(path: string): Promise<FileDigest> {
  const info = await lstat(path);
  ensure(info.isFile() && info.size <= MAX_BACKUP_BYTES, 'Backup must be a bounded regular file.');
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer: Buffer = chunk;
    bytes += buffer.length;
    ensure(bytes <= MAX_BACKUP_BYTES, 'Backup exceeded its size bound.');
    hash.update(buffer);
  }
  ensure(bytes === info.size, 'Backup changed while its digest was computed.');
  return { bytes, sha256: hash.digest('hex') };
}
export async function encryptBackup(
  source: string,
  destination: string,
  key: Buffer,
  context: string,
) {
  ensure(key.length === 32, 'Invalid backup key length.');
  const metadata = Buffer.from(context, 'utf8');
  ensure(metadata.length > 0 && metadata.length <= MAX_CONTEXT_BYTES, 'Invalid backup context.');
  const plain = await fileDigest(source);
  ensure(
    plain.bytes + PREFIX_BYTES + metadata.length + TAG_BYTES <= MAX_BACKUP_BYTES,
    'Backup envelope exceeds its size bound.',
  );
  const prefix = Buffer.alloc(PREFIX_BYTES);
  MAGIC.copy(prefix);
  prefix.writeUInt32BE(metadata.length, 8);
  randomBytes(12).copy(prefix, 12);
  const header = Buffer.concat([prefix, metadata]);
  const cipher = createCipheriv('aes-256-gcm', key, prefix.subarray(12), {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(header);
  // Exclusive creation prevents an existing retained or temporary artifact being overwritten.
  await writeFile(destination, header, { flag: 'wx', mode: 0o600 });
  try {
    await pipeline(
      createReadStream(source),
      cipher,
      createWriteStream(destination, { flags: 'a', mode: 0o600 }),
    );
    await appendFile(destination, cipher.getAuthTag());
    const encrypted = await fileDigest(destination);
    ensure(
      encrypted.bytes === plain.bytes + header.length + TAG_BYTES,
      'Invalid encrypted backup length.',
    );
    return { plain, encrypted, algorithm: 'AES-256-GCM' as const, envelopeVersion: 1 as const };
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}
export async function decryptBackup(
  source: string,
  destination: string,
  key: Buffer,
  expectedContext: string,
): Promise<FileDigest> {
  ensure(key.length === 32, 'Invalid backup key length.');
  const info = await lstat(source);
  ensure(
    info.isFile() && info.size >= PREFIX_BYTES + TAG_BYTES && info.size <= MAX_BACKUP_BYTES,
    'Invalid encrypted backup size.',
  );
  const input = await open(source, 'r');
  let header: Buffer;
  let tag: Buffer;
  let nonce: Buffer;
  try {
    const prefix = Buffer.alloc(PREFIX_BYTES);
    ensure(
      (await input.read(prefix, 0, prefix.length, 0)).bytesRead === prefix.length,
      'Truncated backup envelope.',
    );
    ensure(prefix.subarray(0, 8).equals(MAGIC), 'Unsupported backup envelope.');
    const length = prefix.readUInt32BE(8);
    ensure(
      length > 0 && length <= MAX_CONTEXT_BYTES && info.size >= PREFIX_BYTES + length + TAG_BYTES,
      'Invalid backup context length.',
    );
    const metadata = Buffer.alloc(length);
    ensure(
      (await input.read(metadata, 0, length, PREFIX_BYTES)).bytesRead === length,
      'Truncated backup context.',
    );
    ensure(
      metadata.equals(Buffer.from(expectedContext, 'utf8')),
      'Backup context does not match the approved restore source.',
    );
    header = Buffer.concat([prefix, metadata]);
    nonce = Buffer.from(prefix.subarray(12));
    tag = Buffer.alloc(TAG_BYTES);
    ensure(
      (await input.read(tag, 0, TAG_BYTES, info.size - TAG_BYTES)).bytesRead === TAG_BYTES,
      'Truncated backup authentication tag.',
    );
  } finally {
    await input.close();
  }
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  // A failed GCM check can produce a private partial file; it is deleted before rejection.
  // Callers must never pass the output to pg_restore until this promise has resolved.
  const output = await open(destination, 'wx', 0o600);
  await output.close();
  try {
    const body =
      info.size === header.length + TAG_BYTES
        ? Readable.from([])
        : createReadStream(source, { start: header.length, end: info.size - TAG_BYTES - 1 });
    await pipeline(body, decipher, createWriteStream(destination, { flags: 'a', mode: 0o600 }));
    return await fileDigest(destination);
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}
