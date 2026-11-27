import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./.env', import.meta.url));
const template = fileURLToPath(new URL('./.env.example', import.meta.url));
// Exclusive initialization prevents two processes from replacing each other's newly generated values.
// A stale lock after a crash fails closed; inspect it before manually removing it.
const lockPath = `${target}.lock`;
const lock = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
let descriptor: number | undefined;
try {
  let created = false;
  try {
    descriptor = openSync(target, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    descriptor = openSync(target, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL, 0o600);
    created = true;
  }
  const details = fstatSync(descriptor);
  if (!details.isFile() || details.nlink !== 1)
    throw new Error('Environment file must be an unlinked regular file.');
  fchmodSync(descriptor, 0o600);
  let source = created ? readFileSync(template, 'utf8') : readFileSync(descriptor, 'utf8');
  const required = [
    'POSTGRES_ADMIN_PASSWORD',
    'IDENTITY_DB_PASSWORD',
    'CRM_DB_PASSWORD',
    'SALES_DB_PASSWORD',
    'DELIVERY_DB_PASSWORD',
    'BILLING_DB_PASSWORD',
    'TRACKING_DB_PASSWORD',
    'COMMUNICATIONS_DB_PASSWORD',
    'RABBITMQ_PASSWORD',
    'DEV_JWT_SECRET',
  ];
  let changed = 0;
  for (const key of required) {
    const matcher = new RegExp(`^${key}=(.*)$`, 'm');
    const current = source.match(matcher)?.[1]?.trim();
    if (current && current !== 'REPLACE_WITH_GENERATED_VALUE') continue;
    const line = `${key}=${randomBytes(32).toString('hex')}`;
    source = matcher.test(source)
      ? source.replace(matcher, line)
      : source.replace(/\s*$/, '\n') + line + '\n';
    changed++;
  }
  // readFileSync advances the descriptor; write at offset zero to the same validated inode.
  const bytes = Buffer.from(source);
  ftruncateSync(descriptor, 0);
  // Explicit position is required when preserving an existing file.
  let offset = 0;
  while (offset < bytes.length)
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset, offset);
  console.log(
    `Prepared infra/compose/.env; generated ${changed} missing values and preserved existing values. No values were printed.`,
  );
} finally {
  if (descriptor !== undefined) closeSync(descriptor);
  closeSync(lock);
  unlinkSync(lockPath);
}
