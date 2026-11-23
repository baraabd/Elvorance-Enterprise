import { isDeepStrictEqual } from 'node:util';
import { sha256 } from '../rep-release/build-proof.mts';

export function packagedConfigHash(
  platform: 'android' | 'ios',
  packaged: Record<string, unknown>,
  expected: object,
): string {
  const { packageClassList, ...declared } = packaged;
  if (!isDeepStrictEqual(declared, expected))
    throw new Error('Packaged native configuration differs from the selected release.');
  if (platform === 'ios') {
    // Capacitor appends installed package classes during sync. The app-local secure bridge
    // is registered explicitly by RepBridgeViewController, not through this generated list.
    const expectedPackages = ['AppPlugin', 'CAPNetworkPlugin', 'GeolocationPlugin'];
    if (
      !Array.isArray(packageClassList) ||
      !isDeepStrictEqual([...packageClassList].sort(), expectedPackages.sort())
    ) {
      throw new Error(
        'The iOS native package registration does not match the reviewed dependency set.',
      );
    }
  } else if (packageClassList !== undefined) {
    throw new Error('Unexpected iOS plugin registrations in an Android release.');
  }
  return sha256(JSON.stringify(packaged));
}
