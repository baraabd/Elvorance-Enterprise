import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./.env', import.meta.url));
const template = fileURLToPath(new URL('./.env.example', import.meta.url));
let source = readFileSync(existsSync(target) ? target : template, 'utf8');
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
  const current = source.match(matcher)?.[1].trim();
  if (current && current !== 'REPLACE_WITH_GENERATED_VALUE') continue;
  const line = `${key}=${randomBytes(32).toString('hex')}`;
  source = matcher.test(source)
    ? source.replace(matcher, line)
    : source.replace(/\s*$/, '\n') + line + '\n';
  changed++;
}
writeFileSync(target, source, { mode: 0o600 });
console.log(
  `Prepared infra/compose/.env; generated ${changed} missing values and preserved existing values. No values were printed.`,
);
