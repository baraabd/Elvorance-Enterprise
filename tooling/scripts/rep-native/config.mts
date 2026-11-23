import { repReleaseConfig, type RepReleaseConfig } from '../rep-release/release-config.mts';

export function nativeIdentity(config: RepReleaseConfig) {
  return {
    applicationId: `com.elvorance.rep${config.environment === 'staging' ? '.staging' : ''}`,
    displayName: config.environment === 'staging' ? 'إلفورانس تجريبي' : 'إلفورانس الميداني',
    flavor: config.environment === 'staging' ? 'Staging' : 'Production',
    authorizationEndpoint: `${config.auth.issuer}/protocol/openid-connect/auth`,
  };
}

export function nativeConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = repReleaseConfig(env);
  const identity = nativeIdentity(config);
  return {
    appId: identity.applicationId,
    appName: identity.displayName,
    webDir: 'dist',
    server: { androidScheme: 'https' },
    android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
    ios: { webContentsDebuggingEnabled: false },
    plugins: {
      SplashScreen: { launchAutoHide: true },
      ElvoranceAuthBridge: { authorizationEndpoint: identity.authorizationEndpoint },
    },
  };
}

export function releaseVersion(env: NodeJS.ProcessEnv = process.env) {
  const name = env.ELVORANCE_VERSION_NAME;
  const code = env.ELVORANCE_VERSION_CODE;
  if (!name || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(name)) {
    throw new Error('ELVORANCE_VERSION_NAME must contain three numeric release components.');
  }
  if (!code || !/^[1-9]\d{0,8}$/.test(code)) {
    throw new Error(
      'ELVORANCE_VERSION_CODE must be a positive build number of at most nine digits.',
    );
  }
  return { name, code };
}
