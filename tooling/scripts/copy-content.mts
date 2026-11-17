import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/** Copy generated content without fs.cp's source-mode/chmod propagation. */
export async function copyContent(source: string, destination: string): Promise<void> {
  const sourceInfo = await lstat(source);
  if (sourceInfo.isSymbolicLink()) {
    throw new Error(`Content copy refuses a symbolic link: ${source}`);
  }
  let destinationInfo;
  try {
    destinationInfo = await lstat(destination);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
  if (destinationInfo?.isSymbolicLink()) {
    throw new Error(`Content copy refuses a symbolic-link destination: ${destination}`);
  }
  if (sourceInfo.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const name of (await readdir(source)).sort()) {
      await copyContent(resolve(source, name), resolve(destination, name));
    }
    return;
  }
  if (!sourceInfo.isFile()) throw new Error(`Content copy requires a regular file: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  // A real write failure (ACL, locked file, read-only output, full disk) must still fail the build.
  await writeFile(destination, await readFile(source));
}
