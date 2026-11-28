import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rm, type FileHandle } from 'node:fs/promises';
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
async function openInput(path: string) {
  // Validate the opened descriptor, not a path checked before a separate open.
  // O_NONBLOCK avoids hanging on an unexpected FIFO; fstat rejects non-regular files.
  const input = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await input.stat();
    ensure(
      info.isFile() && info.size <= MAX_BACKUP_BYTES,
      'Backup must be a bounded regular file.',
    );
    return { input, info };
  } catch (error) {
    await input.close();
    throw error;
  }
}
async function* chunks(input: FileHandle, start: number, end: number) {
  let position = start;
  while (position < end) {
    const buffer = Buffer.alloc(Math.min(65536, end - position));
    const { bytesRead } = await input.read(buffer, 0, buffer.length, position);
    ensure(bytesRead > 0, 'Backup was truncated during reading.');
    position += bytesRead;
    yield buffer.subarray(0, bytesRead);
  }
}
async function writeBytes(output: FileHandle, bytes: Buffer) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await output.write(bytes, offset, bytes.length - offset);
    ensure(result.bytesWritten > 0, 'Backup output made no progress.');
    offset += result.bytesWritten;
  }
}
export async function fileDigest(path: string): Promise<FileDigest> {
  const { input, info } = await openInput(path);
  try {
    const hash = createHash('sha256');
    for await (const chunk of chunks(input, 0, info.size)) hash.update(chunk);
    const after = await input.stat();
    ensure(
      after.size === info.size && after.mtimeMs === info.mtimeMs,
      'Backup changed while its digest was computed.',
    );
    return { bytes: info.size, sha256: hash.digest('hex') };
  } finally {
    await input.close();
  }
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
  const { input, info } = await openInput(source);
  let output: FileHandle | undefined;
  try {
    ensure(
      info.size + PREFIX_BYTES + metadata.length + TAG_BYTES <= MAX_BACKUP_BYTES,
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
    output = await open(destination, 'wx', 0o600);
    const plainHash = createHash('sha256');
    const encryptedHash = createHash('sha256');
    let encryptedBytes = 0;
    const append = async (data: Buffer) => {
      ensure(output, 'Backup output is not open.');
      await writeBytes(output, data);
      encryptedHash.update(data);
      encryptedBytes += data.length;
    };
    await append(header);
    for await (const chunk of chunks(input, 0, info.size)) {
      plainHash.update(chunk);
      await append(cipher.update(chunk));
    }
    await append(cipher.final());
    await append(cipher.getAuthTag());
    const after = await input.stat();
    ensure(
      after.size === info.size && after.mtimeMs === info.mtimeMs,
      'Backup changed during encryption.',
    );
    ensure(
      encryptedBytes === info.size + header.length + TAG_BYTES,
      'Invalid encrypted backup length.',
    );
    await output.sync();
    return {
      plain: { bytes: info.size, sha256: plainHash.digest('hex') },
      encrypted: { bytes: encryptedBytes, sha256: encryptedHash.digest('hex') },
      algorithm: 'AES-256-GCM' as const,
      envelopeVersion: 1 as const,
    };
  } catch (error) {
    if (output) {
      await output.close();
      output = undefined;
      await rm(destination, { force: true });
    }
    throw error;
  } finally {
    await output?.close();
    await input.close();
  }
}
export async function decryptBackup(
  source: string,
  destination: string,
  key: Buffer,
  expectedContext: string,
): Promise<FileDigest> {
  ensure(key.length === 32, 'Invalid backup key length.');
  const { input, info } = await openInput(source);
  let output: FileHandle | undefined;
  try {
    ensure(info.size >= PREFIX_BYTES + TAG_BYTES, 'Invalid encrypted backup size.');
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
    const header = Buffer.concat([prefix, metadata]);
    const tag = Buffer.alloc(TAG_BYTES);
    ensure(
      (await input.read(tag, 0, TAG_BYTES, info.size - TAG_BYTES)).bytesRead === TAG_BYTES,
      'Truncated backup authentication tag.',
    );
    const decipher = createDecipheriv('aes-256-gcm', key, prefix.subarray(12), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    // Keep the exclusive output descriptor open throughout verification. No path is reopened.
    // pg_restore must never receive this private output until authenticated decryption succeeds.
    output = await open(destination, 'wx', 0o600);
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of chunks(input, header.length, info.size - TAG_BYTES)) {
      const plain = decipher.update(chunk);
      await writeBytes(output, plain);
      hash.update(plain);
      bytes += plain.length;
    }
    const tail = decipher.final();
    await writeBytes(output, tail);
    hash.update(tail);
    bytes += tail.length;
    const after = await input.stat();
    ensure(
      after.size === info.size && after.mtimeMs === info.mtimeMs,
      'Backup changed during decryption.',
    );
    await output.sync();
    return { bytes, sha256: hash.digest('hex') };
  } catch (error) {
    if (output) {
      await output.close();
      output = undefined;
      await rm(destination, { force: true });
    }
    throw error;
  } finally {
    await output?.close();
    await input.close();
  }
}
