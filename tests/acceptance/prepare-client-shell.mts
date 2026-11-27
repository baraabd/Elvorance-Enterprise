import { prepareClientShell } from './client-shell.mts';
await prepareClientShell(process.argv[2] ?? '');
console.log('Prepared the client demo shell under its isolated staging identity; not a release.');
