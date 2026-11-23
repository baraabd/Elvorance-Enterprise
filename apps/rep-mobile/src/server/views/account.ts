import type { RepIdentity } from '../api.ts';
import type { ViewContext } from '../context.ts';
import { button, card, detail, el, heading, words } from '../ui/dom.ts';
import { commandForm } from '../ui/forms.ts';

export async function account(context: ViewContext): Promise<void> {
  const { profile, profileVersion } = await context.api.get<RepIdentity>('/v1/identity/me', {
    signal: context.signal,
  });
  if (context.signal.aborted) return;
  context.root.append(heading('حسابي'));
  const info = card(words(profile?.displayName, 'المندوب'));
  detail(info, 'لغة الواجهة', 'العربية');
  context.root.append(info);
  context.root.append(
    commandForm({
      title: 'البيانات الشخصية',
      fields: [
        {
          name: 'displayName',
          label: 'الاسم المعروض',
          required: true,
          value: profile?.displayName,
        },
        { name: 'phone', label: 'الهاتف', type: 'tel', max: 40, value: profile?.phone },
        {
          name: 'locale',
          label: 'لغة التواصل',
          type: 'select',
          required: true,
          value: profile?.locale ?? 'ar',
          options: [
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ],
        },
        {
          name: 'timeZone',
          label: 'المنطقة الزمنية',
          required: true,
          value: profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      ],
      signal: context.signal,
      submit: async (values) => {
        await context.api.mutate(
          'PATCH',
          '/v1/identity/me/profile',
          { ...values, expectedVersion: profileVersion ?? 0 },
          context.signal,
        );
        context.notify('تم تحديث الحساب.');
        await context.refresh();
      },
    }),
  );
}
export async function tracking(context: ViewContext): Promise<void> {
  const { profile } = await context.api.get<RepIdentity>('/v1/identity/me', {
    signal: context.signal,
  });
  if (context.signal.aborted) return;
  context.root.append(
    heading(
      'مشاركة الموقع',
      'يُرسل آخر موقع فقط أثناء فتح التطبيق وبموافقتك. يتوقف جمع الموقع عند مغادرة التطبيق أو انقطاع الشبكة.',
    ),
  );
  const status = el('p', context.tracking.snapshot().status, 'notice');
  status.dataset.trackingStatus = 'true';
  context.root.append(status);
  context.root.append(
    commandForm({
      title: 'التحكم بالمشاركة',
      fields: [
        {
          name: 'consent',
          label: 'أوافق على مشاركة موقعي مع إدارة الفريق أثناء العمل داخل التطبيق',
          type: 'checkbox',
          required: true,
        },
      ],
      signal: context.signal,
      submitLabel: 'بدء / استئناف المشاركة',
      submit: async (values) => {
        await context.tracking.start(
          values.consent === true,
          words(profile?.displayName, 'مندوب ميداني'),
        );
        status.textContent = context.tracking.snapshot().status;
      },
    }),
  );
  context.root.append(
    button('إيقاف مؤقت', () => context.tracking.pause(), context.signal),
    button('إنهاء المشاركة', () => context.tracking.stop(), context.signal),
  );
}
