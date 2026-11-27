import { mountAuthenticatedWorkspace } from '@elvorance/api-client/authenticated-workspace';
import { mountAdminWorkspace } from './server/workspace.ts';

const root = document.getElementById('app');
if (!root) throw new Error('Elvorance application root does not exist.');
const config = window.ELVORANCE_CONFIG;
if (
  !config ||
  config.dataMode !== 'server' ||
  !config.apiBaseUrl ||
  !config.auth ||
  !config.environment
) {
  root.textContent = 'يلزم إعداد API وOIDC لواجهة الإدارة. لا يوجد وضع تجريبي في هذا البناء.';
} else {
  void mountAuthenticatedWorkspace({
    root,
    role: 'admin',
    baseUrl: config.apiBaseUrl,
    auth: config.auth,
    environment: config.environment,
    mountWorkspace: mountAdminWorkspace,
  }).catch(() => {
    root.textContent = 'تعذّر بدء الإدارة. تحقق من إعدادات API وOIDC.';
  });
}
