export type AuthEnvironment = 'development' | 'staging' | 'production';

/** Public build settings. A native/public OAuth client must never contain a client secret. */
export interface MobileAuthConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly environment: AuthEnvironment;
  readonly scopes?: readonly string[];
}

export interface AuthSessionSnapshot {
  readonly status: 'signed-out' | 'signing-in' | 'authenticated' | 'refreshing' | 'unavailable';
  readonly subject: string | null;
  /** Access token expiry in Unix milliseconds. Tokens are deliberately absent. */
  readonly expiresAt: number | null;
}

export interface SignOutResult {
  /** False means local logout succeeded but server revocation could not be confirmed. */
  readonly revoked: boolean;
}

export interface MobileAuth {
  initialize(): Promise<AuthSessionSnapshot>;
  signIn(): Promise<AuthSessionSnapshot>;
  getAccessToken(): Promise<string | null>;
  signOut(): Promise<SignOutResult>;
  onSessionChanged(listener: (session: AuthSessionSnapshot) => void): () => void;
  dispose(): Promise<void>;
}

export type AuthStorageKey = 'auth-session' | 'auth-transaction';

/** Implemented by the native Keychain/Keystore bridge, with no plaintext fallback. */
export interface AuthStorage {
  get(key: AuthStorageKey): Promise<string | null>;
  set(key: AuthStorageKey, value: string): Promise<void>;
  remove(key: AuthStorageKey): Promise<void>;
}

export interface AuthorizationBrowser {
  /** Undefined is used by the web adapter when navigation leaves the document. */
  authorize(url: string, redirectUri: string): Promise<string | undefined>;
  getLaunchUrl(): Promise<string | null>;
  onCallback(listener: (url: string) => void): Promise<() => Promise<void>>;
  clearCallback(): void;
  cancelAuthorization(): Promise<void>;
}

/** Ports keep protocol and lifecycle logic independently testable. */
export interface AuthDependencies {
  readonly storage: AuthStorage;
  readonly browser: AuthorizationBrowser;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

export interface SessionBinding {
  readonly issuer: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly environment: AuthEnvironment;
}

export interface StoredSession extends SessionBinding {
  readonly version: 1;
  readonly subject: string;
  readonly refreshToken: string;
  readonly nonce: string;
  readonly authTime: number | null;
}

export interface AuthTransaction extends SessionBinding {
  readonly version: 1;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly createdAt: number;
}

export interface ValidatedTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly subject: string;
  readonly expiresAt: number;
  readonly nonce: string;
  readonly authTime: number | null;
}
