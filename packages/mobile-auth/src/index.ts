import { validateConfig } from './configuration.ts';
import { createPlatformDependencies } from './platform.ts';
import { createAuthSession } from './session.ts';
import type { MobileAuth, MobileAuthConfig } from './types.ts';

export { AuthError } from './errors.ts';
export type { AuthErrorCode } from './errors.ts';
export type {
  AuthEnvironment,
  AuthSessionSnapshot,
  MobileAuth,
  MobileAuthConfig,
  SignOutResult,
} from './types.ts';

/** Create once at application startup, then share getAccessToken with the API client. */
export function createMobileAuth(config: MobileAuthConfig): MobileAuth {
  const validated = validateConfig(config);
  return createAuthSession(validated, createPlatformDependencies(validated));
}
