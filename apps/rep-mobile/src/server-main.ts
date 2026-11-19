import { startRepresentative } from './server/bootstrap.ts';

const root = document.getElementById('app');
if (!root) throw new Error('Application root is missing.');
const config = window.ELVORANCE_CONFIG;
if (!config || config.dataMode !== 'server' || !config.auth || !config.apiBaseUrl) {
  root.textContent = 'إعدادات التطبيق غير مكتملة. لا يمكن الاتصال ببيانات الشركة.';
} else {
  void startRepresentative(root, {
    dataMode: 'server',
    apiBaseUrl: config.apiBaseUrl,
    auth: config.auth,
  }).catch(() => {
    root.textContent = 'تعذّر تهيئة تسجيل الدخول الآمن. حدّث التطبيق أو تواصل مع الدعم.';
  });
}
