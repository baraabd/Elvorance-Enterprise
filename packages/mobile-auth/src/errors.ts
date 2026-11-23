export type AuthErrorCode =
  | 'invalid_configuration'
  | 'invalid_response'
  | 'invalid_transaction'
  | 'session_expired'
  | 'operation_cancelled'
  | 'network_unavailable'
  | 'secure_storage_unavailable'
  | 'native_bridge_unavailable'
  | 'disposed';

const messages: Record<AuthErrorCode, string> = {
  invalid_configuration: 'Authentication configuration is invalid.',
  invalid_response: 'The identity provider response could not be verified.',
  invalid_transaction: 'The sign-in request expired or could not be verified. Start sign-in again.',
  session_expired: 'The session expired. Sign in again.',
  operation_cancelled: 'Sign-in was cancelled.',
  network_unavailable: 'The identity provider could not be reached. Try again when connected.',
  secure_storage_unavailable: 'Secure session storage could not be accessed.',
  native_bridge_unavailable: 'The native secure authentication bridge is unavailable.',
  disposed: 'This authentication client has been closed.',
};

/** Deliberately omits upstream errors/causes that may contain codes, tokens or callback URLs. */
export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(messages[code]);
    this.name = 'AuthError';
  }
}

export function safeAuthError(error: unknown, fallback: AuthErrorCode): AuthError {
  return error instanceof AuthError ? error : new AuthError(fallback);
}
