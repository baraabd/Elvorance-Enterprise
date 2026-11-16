/** admin / settings: original v1.1 views and local demo actions. */
export function createSettingsFeature(context, { state }) {
  const { E, action, fail, form, icon, input, pageTitle, sectionTitle, wrap } = context;
  const persist = (...args) => state.persist(...args);
  function settings({ state: s }) {
    return wrap(
      pageTitle(
        'إعدادات المساحة',
        'تفاصيل تعكس شركتك.',
        'إعدادات العرض والبيانات المحلية ومساحة العمل التجريبية.',
      ) +
        `<section class="card">${form('save-settings', `<div class="form-grid">${input('اسم الشركة', 'company', s.settings?.company, 'text', 'required minlength="2" maxlength="80"')}${input('المدينة', 'city', s.settings?.city, 'text', 'required minlength="2" maxlength="60"')}</div>`, '', 'حفظ الإعدادات')}<p class="small muted">العملة المستخدمة في هذا العرض: ${E(s.settings?.currency || 'USD')}. تعديل بيانات الشركة لا يغير قيم العقود.</p></section><section class="card">${sectionTitle('إدارة بنك الأسئلة والخدمات')}<p class="small muted">الأسئلة حسب النشاط، والخيارات، وقواعد الإلزام، وكتالوج الخدمات قابلة للتعديل.</p><button type="button" data-go="configuration" class="btn btn-primary">فتح المحرر</button></section><section class="card">${sectionTitle('بيانات العرض التجريبي')}<p class="muted">يمكن تنزيل نسخة من البيانات الحالية. إعادة الضبط تستبدل التغييرات المحلية بالبيانات الأولية بعد التأكيد.</p><div class="row wrap gap-sm">${action('download-data', 'تنزيل البيانات', 'download')}${action('reset-demo', 'إعادة ضبط العرض', 'refresh', '', 'btn btn-danger')}</div></section>`,
    );
  }
  function more() {
    const links = [
      ['live-tracking', 'مواقع الفريق الآن', 'pin'],
      ['clients', 'العملاء', 'building'],
      ['tasks', 'المهام', 'checklist'],
      ['approvals', 'الموافقات', 'shield'],
      ['projects', 'المشاريع', 'layers'],
      ['analytics', 'التحليلات', 'chart'],
      ['invoices', 'الفواتير', 'receipt'],
      ['support', 'الدعم', 'headphones'],
      ['messages', 'المحادثات', 'message'],
      ['settings', 'الإعدادات', 'settings'],
      ['configuration','إدارة الأسئلة والخدمات','checklist'],
    ];
    return wrap(
      pageTitle(
        'مساحة الإدارة',
        'كل أدواتك، في متناولك.',
        'انتقل إلى إدارة العلاقة أو التنفيذ أو المال أو إعداد المساحة.',
      ) +
        `<div class="admin-more">${links.map(([route, label, ico]) => `<button type="button" data-go="${route}">${icon(ico)}<strong>${label}</strong><span class="tiny muted">فتح ${label}</span></button>`).join('')}</div>`,
    );
  }
  return {
    id: 'settings',
    routes: {
      settings: {
        nav: 'more',
        title: 'الإعدادات',
        render: settings,
      },
      more: {
        title: 'المزيد',
        render: more,
      },
    },
    actions: {
      'save-settings': ({ data }) => {
        const company = String(data.company || '').trim(),
          city = String(data.city || '').trim();
        if (company.length < 2 || city.length < 2) return fail('أدخل اسم الشركة والمدينة.');
        persist(
          'تحديث إعدادات مساحة العمل',
          (s) => {
            s.settings.company = company;
            s.settings.city = city;
          },
          'حُفظت إعدادات الشركة.',
        );
      },
    },
    api: {},
  };
}
