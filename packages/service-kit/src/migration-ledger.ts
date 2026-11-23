import { createHash } from 'node:crypto';
import type { Migration } from './migrations.ts';
export type AppliedMigration = { version: number; name: string; checksum: string | null };
export function migrationChecksum(migration: Migration): string {
  return createHash('sha256').update(migration.sql, 'utf8').digest('hex');
}
export function migrationManifest(migrations: readonly Migration[]): string {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const versions = new Set<number>();
  for (const migration of ordered) {
    if (
      !Number.isSafeInteger(migration.version) ||
      migration.version < 1 ||
      versions.has(migration.version) ||
      !migration.name.trim() ||
      !migration.sql.trim()
    )
      throw new Error('Invalid or duplicate migration');
    versions.add(migration.version);
  }
  return createHash('sha256')
    .update(
      JSON.stringify(
        ordered.map((m) => ({ version: m.version, name: m.name, checksum: migrationChecksum(m) })),
      ),
    )
    .digest('hex');
}
export function migrationDecision(
  migration: Migration,
  applied: AppliedMigration | undefined,
  manifest: string,
  env: NodeJS.ProcessEnv = process.env,
): 'apply' | 'skip' | 'baseline' {
  if (!applied) return 'apply';
  if (applied.name !== migration.name || applied.version !== migration.version)
    throw new Error('Applied migration identity changed');
  if (applied.checksum === null) {
    if (
      env.MIGRATION_BASELINE_MANIFEST_SHA256 !== manifest ||
      !/^[a-f0-9]{40}$/.test(env.MIGRATION_BASELINE_SOURCE_REVISION ?? '')
    )
      throw new Error('Legacy migration requires explicit reviewed manifest and source approval');
    return 'baseline';
  }
  if (applied.checksum !== migrationChecksum(migration))
    throw new Error('Applied migration checksum changed');
  return 'skip';
}
