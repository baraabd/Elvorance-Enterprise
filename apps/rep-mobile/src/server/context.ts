import type { Principal } from '@elvorance/contracts';
import type { RepApi } from './api.ts';
import type { TrackingController } from './tracking.ts';
export type Page =
  | 'home'
  | 'schedule'
  | 'customers'
  | 'visits'
  | 'routes'
  | 'opportunities'
  | 'quotes'
  | 'catalog'
  | 'tasks'
  | 'messages'
  | 'notifications'
  | 'support'
  | 'contracts'
  | 'projects'
  | 'billing'
  | 'account'
  | 'tracking';
export interface ViewContext {
  api: RepApi;
  principal: Principal;
  root: HTMLElement;
  signal: AbortSignal;
  refresh: () => Promise<void>;
  navigate: (page: Page) => Promise<void>;
  notify: (message: string) => void;
  tracking: TrackingController;
}
export type View = (context: ViewContext) => Promise<void>;
