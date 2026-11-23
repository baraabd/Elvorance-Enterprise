import { mountAuthenticatedWorkspace } from '@elvorance/api-client/authenticated-workspace';
const root = document.getElementById('app');
if (!root) throw new Error('Application root is missing.');
const config = window.ELVORANCE_CONFIG;
if (!config || config.dataMode !== 'server' || !config.auth || !config.apiBaseUrl) {
  root.textContent = 'إعدادات الاتصال الآمن غير مكتملة. لا توجد بيانات تجريبية بديلة.';
} else {
  void mountAuthenticatedWorkspace({
    root,
    role: 'admin',
    baseUrl: config.apiBaseUrl,
    auth: config.auth,
    environment: config.auth.environment,
  }).catch(() => {
    root.textContent = 'تعذّر بدء الاتصال الآمن. يرجى مراجعة مسؤول النظام.';
  });
}
