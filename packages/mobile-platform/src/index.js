import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';

/** Device capabilities are ports; domain features never import native plugins directly. */
export function createMobilePlatform() {
  return {
    native: Capacitor.isNativePlatform(),
    platform: Capacitor.getPlatform(),
    async requestLocationPermission() {
      if (!Capacitor.isNativePlatform()) {
        // A web permission prompt is initiated by getCurrentPosition after the user's gesture.
        return { location: 'prompt' };
      }
      return Geolocation.requestPermissions({ permissions: ['location'] });
    },
    async currentLocation() {
      return Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12_000,
      });
    },
    async watchLocation({ consent, onPosition, onError }) {
      if (consent !== true) throw new Error('Explicit location consent is required.');
      let stopped = false;
      const watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 12_000,
          interval: 10_000,
          minimumUpdateInterval: 5_000,
        },
        (position, error) => {
          if (stopped) return;
          if (error) onError(error);
          else if (position) onPosition(position);
        },
      );
      return async () => {
        if (stopped) return;
        stopped = true;
        await Geolocation.clearWatch({ id: watchId });
      };
    },
    async network() {
      return Network.getStatus();
    },
    async onNetworkChange(callback) {
      const handle = await Network.addListener('networkStatusChange', callback);
      return () => handle.remove();
    },
    async onActiveChange(callback) {
      if (Capacitor.isNativePlatform()) {
        const handle = await App.addListener('appStateChange', (state) => callback(state.isActive));
        return () => handle.remove();
      }
      const listener = () => callback(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  };
}

/** Navigation/network integration does not request GPS or start tracking. */
export async function installMobileShell(runtime) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const network = await Network.addListener('networkStatusChange', (state) =>
    window.dispatchEvent(new Event(state.connected ? 'online' : 'offline')),
  );
  const back = await App.addListener('backButton', ({ canGoBack }) => {
    if (document.querySelector('dialog[open]')) runtime.closeModal();
    else if (canGoBack) window.history.back();
  });
  return async () => {
    await network.remove();
    await back.remove();
  };
}
