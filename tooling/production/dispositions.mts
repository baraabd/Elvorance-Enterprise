import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Feature } from './model.mts';
import { sha256, type Workspace } from './source.mts';

export interface PresentationDisposition {
  featureId: string;
  sourceFileSha256: string;
  reason: string;
  downstreamActionIds: string[];
}
/** Human-reviewed UI-only exceptions are invalidated by ANY edit to their source file. */
export async function applyDispositions(ws: Workspace, features: Feature[]): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(resolve(ws.root, 'docs/production/inventory-dispositions.json'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  const document = JSON.parse(raw) as {
    schemaVersion: number;
    presentationOnly: PresentationDisposition[];
  };
  if (document.schemaVersion !== 1 || !Array.isArray(document.presentationOnly))
    throw new Error('Invalid inventory dispositions');
  const seen = new Set<string>();
  for (const disposition of document.presentationOnly) {
    const row = features.find((feature) => feature.id === disposition.featureId);
    if (
      !row ||
      seen.has(disposition.featureId) ||
      !disposition.reason.trim() ||
      !disposition.downstreamActionIds.length
    )
      throw new Error(
        'Unknown, duplicate or incomplete presentation disposition: ' + disposition.featureId,
      );
    seen.add(disposition.featureId);
    if (sha256(await readFile(resolve(ws.root, row.source.path))) !== disposition.sourceFileSha256)
      throw new Error('Presentation disposition needs source re-review: ' + row.id);
    for (const id of disposition.downstreamActionIds)
      if (!features.some((feature) => feature.id === id))
        throw new Error('Unknown downstream business action: ' + id);
    row.presentationOnly = {
      reason:
        disposition.reason +
        ' Downstream business actions: ' +
        disposition.downstreamActionIds.join(', '),
      reviewedSourceFingerprint: row.source.fingerprint,
    };
  }
}
