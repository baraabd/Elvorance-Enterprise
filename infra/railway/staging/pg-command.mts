import { ensure, privateDatabaseUrl } from './target.mts';
/** pg_restore ignores PGDATABASE without -d; never allow script-only or live-target restore. */
export function pgArguments(program: string, args: readonly string[], target: URL): string[] {
  privateDatabaseUrl(target.href);
  ensure(program === 'pg_dump' || program === 'pg_restore', 'Unsupported PostgreSQL utility.');
  if (program === 'pg_dump') return [...args];
  const database = target.pathname.slice(1);
  ensure(
    /^elvorance_restore_[a-f0-9]{12}_(identity|crm|sales|delivery|billing|tracking|communications|keycloak)$/.test(
      database,
    ),
    'Restore must target a newly created rehearsal database.',
  );
  ensure(
    args.every(
      (arg) =>
        !/^--(create|clean|dbname|no-owner|no-policies|file)(=|$)/.test(arg) &&
        !['-C', '-c', '-d', '-O', '-f'].includes(arg),
    ),
    'Unsafe restore command option.',
  );
  return ['--dbname', database, '--single-transaction', ...args];
}
export function pgFailureCategory(stderr: string): string {
  if (/one of -d|one of.*--dbname|database name.*specified/i.test(stderr))
    return 'MISSING_DATABASE_ARGUMENT';
  if (/row.level security|row security|row_security/i.test(stderr)) return 'ROW_SECURITY';
  if (/permission denied|must be (?:owner|superuser)/i.test(stderr)) return 'PERMISSION_DENIED';
  if (/unsupported version|not a valid archive/i.test(stderr)) return 'ARCHIVE_VERSION';
  if (/could not connect|connection.*failed|could not translate host/i.test(stderr))
    return 'CONNECTION';
  return 'UTILITY_FAILURE';
}
