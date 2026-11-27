import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Copy generated content without fs.cp's source-mode/chmod propagation. */
export async function copyContent(source: string, destination: string): Promise<void> {
  // Open before validation and use that same descriptor for every file read.
  const input = await open(
    source,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  ).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ELOOP')
      throw new Error(`Content copy refuses a symbolic link: ${source}`);
    throw error;
  });
  try {
    const current = await input.stat();
    // Also verify the path after opening, including Windows where O_NOFOLLOW
    // is unavailable. No file contents are read or written before this check.
    const observed = await lstat(source);
    if (observed.isSymbolicLink())
      throw new Error(`Content copy refuses a symbolic link: ${source}`);
    if (current.dev !== observed.dev || current.ino !== observed.ino)
      throw new Error('Content copy source changed during validation.');
    if (current.isDirectory()) {
      await mkdir(destination, { recursive: true });
      const target = await lstat(destination);
      if (target.isSymbolicLink() || !target.isDirectory())
        throw new Error(`Content copy refuses a symbolic-link destination: ${destination}`);
      for (const name of (await readdir(source)).sort())
        await copyContent(resolve(source, name), resolve(destination, name));
      return;
    }
    if (!current.isFile()) throw new Error(`Content copy requires a regular file: ${source}`);
    const bytes = await input.readFile();
    await mkdir(dirname(destination), { recursive: true });
    // Never truncate during open: validate the actual output descriptor first.
    // A real write failure (ACL, locked file, read-only output, disk full) stays fatal.
    const output = await open(
      destination,
      constants.O_WRONLY |
        constants.O_CREAT |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
      0o666,
    ).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ELOOP')
        throw new Error(`Content copy refuses a symbolic-link destination: ${destination}`);
      throw error;
    });
    try {
      const currentOutput = await output.stat();
      const observedOutput = await lstat(destination);
      if (observedOutput.isSymbolicLink())
        throw new Error(`Content copy refuses a symbolic-link destination: ${destination}`);
      if (
        !currentOutput.isFile() ||
        currentOutput.nlink !== 1 ||
        (currentOutput.dev === current.dev && currentOutput.ino === current.ino) ||
        currentOutput.dev !== observedOutput.dev ||
        currentOutput.ino !== observedOutput.ino
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
