import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';
export { locationPermissionMode } from './location-permission.ts';

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
    async currentLocation(enableHighAccuracy = true) {
      return Geolocation.getCurrentPosition({
        enableHighAccuracy,
        maximumAge: 0,
        timeout: 12_000,
      });
    },
    async watchLocation({
      consent,
      enableHighAccuracy = true,
      onPosition,
      onError,
    }: {
      consent: boolean;
      enableHighAccuracy?: boolean;
      onPosition: (position: Awaited<ReturnType<typeof Geolocation.getCurrentPosition>>) => void;
      onError: (error: unknown) => void;
    }) {
      if (consent !== true) throw new Error('Explicit location consent is required.');
      let stopped = false;
      const watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy,
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
    async onNetworkChange(
      callback: (status: Awaited<ReturnType<typeof Network.getStatus>>) => void,
    ) {
      const handle = await Network.addListener('networkStatusChange', callback);
      return () => handle.remove();
    },
    async onActiveChange(callback: (active: boolean) => void) {
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
export async function installMobileShell(runtime: { closeModal(): void }) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const network = await Network.addListener('networkStatusChange', (state) =>
    window.dispatchEvent(new Event(state.connected ? 'online' : 'offline')),
  );
  try {
    const back = await App.addListener('backButton', ({ canGoBack }) => {
      if (document.querySelector('dialog[open], .editor')) runtime.closeModal();
      else if (canGoBack) window.history.back();
    });
    let cleanup: Promise<void> | null = null;
    return () => {
      cleanup ??= (async () => {
        const results = await Promise.allSettled([network.remove(), back.remove()]);
        if (results.some((result) => result.status === 'rejected'))
          throw new Error('تعذّر إغلاق مراقبة حالة الجهاز.');
      })();
      return cleanup;
    };
  } catch (error) {
    await network.remove();
    throw error;
  }
}
