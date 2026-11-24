import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
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
  const input = await open(
    source,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  );
  try {
    const current = await input.stat();
    if (!current.isFile() || current.dev !== sourceInfo.dev || current.ino !== sourceInfo.ino)
      throw new Error('Content copy source changed during validation.');
    const bytes = await input.readFile();
    const output = await open(
      destination,
      constants.O_WRONLY |
        constants.O_CREAT |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
      0o666,
    );
    try {
      const currentOutput = await output.stat();
      if (
        !currentOutput.isFile() ||
        currentOutput.nlink !== 1 ||
        (currentOutput.dev === current.dev && currentOutput.ino === current.ino) ||
        (destinationInfo &&
          (currentOutput.dev !== destinationInfo.dev || currentOutput.ino !== destinationInfo.ino))
      )
        throw new Error('Content copy destination must be a distinct, unlinked regular file.');
      await output.truncate(0);
      await output.writeFile(bytes);
    } finally {
      await output.close();
    }
  } finally {
    await input.close();
  }
}
