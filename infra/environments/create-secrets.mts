import { createEnvironmentSecrets } from './secrets.mts';
const [environment, directory] = process.argv.slice(2);
if (!directory || (environment !== 'staging' && environment !== 'production'))
  throw new Error(
    'Usage: create-secrets.mts staging|production /absolute/private/secret/directory',
  );
await createEnvironmentSecrets(directory, environment);
console.log(
  `Initialized new ${environment} secret files. Credentials were not printed; keep this directory private and backed up securely.`,
);
