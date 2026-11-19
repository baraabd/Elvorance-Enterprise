import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture, run } from './process.mts';
import { validateProfile, type ProvisioningProfile } from './ios-profile.mts';

interface SigningState {
  directory: string;
  keychain: string;
  originalKeychains: string[];
  installedProfile?: string;
  previousProfile?: string;
}
const stateFile = () =>
  join(process.env.RUNNER_TEMP ?? tmpdir(), 'elvorance-ios-signing-state.json');

export function readProfile(plistPath: string): ProvisioningProfile {
  const parser = `import datetime,json,plistlib,sys
p=plistlib.load(open(sys.argv[1], 'rb'))
keys=['UUID','TeamIdentifier','ApplicationIdentifierPrefix','ExpirationDate','ProvisionedDevices','ProvisionsAllDevices','Entitlements']
p={k:p[k] for k in keys if k in p}
p['ExpirationDate']=p['ExpirationDate'].replace(tzinfo=datetime.timezone.utc).isoformat()
print(json.dumps(p))`;
  return JSON.parse(capture('python3', ['-c', parser, plistPath])) as ProvisioningProfile;
}

function secretBytes(name: string): Buffer {
  const value = process.env[name]?.replace(/\s/g, '');
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new Error(`Missing or invalid ${name}.`);
  const bytes = Buffer.from(value, 'base64');
  if (
    bytes.length < 100 ||
    bytes.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')
  ) {
    throw new Error(`Invalid ${name} encoding.`);
  }
  return bytes;
}

export async function installSigning(): Promise<ProvisioningProfile> {
  if (process.platform !== 'darwin')
    throw new Error('iOS distribution signing requires macOS and Xcode.');
  if (!process.env.APPLE_P12_PASSWORD) throw new Error('APPLE_P12_PASSWORD is required.');
  const p12 = secretBytes('APPLE_DISTRIBUTION_P12_BASE64');
  const mobileprovision = secretBytes('APPLE_PROVISIONING_PROFILE_BASE64');
  const directory = await mkdtemp(
    join(process.env.RUNNER_TEMP ?? tmpdir(), 'elvorance-ios-signing-'),
  );
  const originalKeychains = capture('security', ['list-keychains', '-d', 'user'])
    .split('\n')
    .map((line) => line.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  const state: SigningState = {
    directory,
    keychain: join(directory, 'distribution.keychain-db'),
    originalKeychains,
  };
  await writeFile(stateFile(), JSON.stringify(state), { mode: 0o600 });
  const p12Path = join(directory, 'distribution.p12');
  const profilePath = join(directory, 'distribution.mobileprovision');
  const profilePlist = join(directory, 'profile.plist');
  await writeFile(p12Path, p12, { mode: 0o600 });
  await writeFile(profilePath, mobileprovision, { mode: 0o600 });
  await writeFile(profilePlist, capture('security', ['cms', '-D', '-i', profilePath]), {
    mode: 0o600,
  });
  const profile = readProfile(profilePlist);
  validateProfile(profile);
  const password = randomBytes(32).toString('hex');
  run('security', ['create-keychain', '-p', password, state.keychain]);
  run('security', ['set-keychain-settings', '-lut', '21600', state.keychain]);
  run('security', ['unlock-keychain', '-p', password, state.keychain]);
  run('security', [
    'import',
    p12Path,
    '-P',
    process.env.APPLE_P12_PASSWORD,
    '-A',
    '-t',
    'cert',
    '-f',
    'pkcs12',
    '-k',
    state.keychain,
  ]);
  run('security', [
    'set-key-partition-list',
    '-S',
    'apple-tool:,apple:',
    '-k',
    password,
    state.keychain,
  ]);
  run('security', ['list-keychains', '-d', 'user', '-s', state.keychain, ...originalKeychains]);
  const profileDirectory = join(
    homedir(),
    'Library/Developer/Xcode/UserData/Provisioning Profiles',
  );
  await mkdir(profileDirectory, { recursive: true });
  state.installedProfile = join(profileDirectory, `${profile.UUID}.mobileprovision`);
  try {
    const previous = await readFile(state.installedProfile);
    state.previousProfile = join(directory, 'previous.mobileprovision');
    await writeFile(state.previousProfile, previous, { mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeFile(stateFile(), JSON.stringify(state), { mode: 0o600 });
  await copyFile(profilePath, state.installedProfile);
  return profile;
}

export async function cleanupSigning(): Promise<void> {
  let state: SigningState;
  try {
    state = JSON.parse(await readFile(stateFile(), 'utf8')) as SigningState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  // Restore the pre-existing search list and any profile rather than changing a developer's setup.
  run('security', ['list-keychains', '-d', 'user', '-s', ...state.originalKeychains]);
  try {
    capture('security', ['delete-keychain', state.keychain]);
  } catch {
    /* May not have been created before failure. */
  }
  if (state.installedProfile) {
    if (state.previousProfile) await copyFile(state.previousProfile, state.installedProfile);
    else await rm(state.installedProfile, { force: true });
  }
  await rm(state.directory, { recursive: true, force: true });
  await rm(stateFile(), { force: true });
}
