// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** rep / account: original v1.1 views and local demo actions. */
export function createAccountFeature(context, { state }) {
  const { A, act, e, go, head, ic, now, rep } = context;
  const commit = (...args) => state.commit(...args);
  function more({ state: s }) {
    const r = rep(s),
      items = [
        ['catalog', 'كتالوج الخدمات', 'layers', 'ما الذي نبيعه وكيف نقدّمه'],
        ['quotes', 'عروض الأسعار', 'file', 'مسودات وقرارات العملاء'],
        ['tasks', 'المهام والمتابعات', 'checklist', 'أولويات واضحة ومواعيد محفوظة'],
        ['messages', 'الرسائل', 'message', 'محادثات العميل والفريق'],
        ['profile', 'الملف الشخصي', 'user', 'بياناتك وحالتك في الفريق'],
      ];
    return `${head('مساحتك في إلفورانس', 'أدواتك، بياناتك، وحالة عملك.')}<div data-elvorance-tracking-control></div><div class="card row-between"><div class="row">${A.avatar(r.name, r.avatarColor)}<div><h2>${e(r.name)}</h2><p class="muted small">مندوب مبيعات ميدانية · ${e(s.settings.city)}</p></div></div>${go('profile', 'الملف', 'chevron-left', '', 'btn btn-ghost')}</div><div class="grid-2">${items.map(([route, title, icon, detail]) => `<button class="card rep-menu-card" data-go="${route}"><span class="icon-box">${ic(icon)}</span><span class="rep-grow"><strong>${title}</strong><small class="muted">${detail}</small></span>${ic('chevron-left')}</button>`).join('')}<button class="card rep-menu-card" data-action="notifications"><span class="icon-box">${ic('bell')}</span><span class="rep-grow"><strong>التنبيهات</strong><small class="muted">قرارات الفريق وتحديثات العملاء</small></span>${ic('chevron-left')}</button></div><div class="card stack"><h2>أدوات العمل المحلي</h2><div class="row-between"><div><strong>${s.session.offline ? 'وضع دون اتصال مفعل' : 'الاتصال التجريبي متاح'}</strong><p class="small muted">يمكن حفظ الزيارات والمسودات محليًا؛ أوقف الوضع لإرسال عرض أو رسالة داخل العرض.</p></div>${act('toggle-offline', s.session.offline ? 'إنهاء الوضع' : 'تجربة دون اتصال', s.session.offline ? 'wifi' : 'wifi-off')}</div><div class="divider"></div><div class="row wrap">${act('export-day', 'تصدير سجل زياراتي', 'download')}${act('download-data', 'تنزيل نسخة البيانات', 'file')}</div></div>`;
  }
  function profile({ state: s }) {
    const r = rep(s);
    return `${head('ملفك المهني', 'تظهر هذه البيانات لفريق الإدارة ضمن العرض.')}<div data-elvorance-tracking-control></div><div class="rep-narrow"><form class="card stack" data-submit="save-profile"><div class="row">${A.avatar(r.name, r.avatarColor)}<div><h2>${e(r.name)}</h2><p class="muted small">مندوب مبيعات ميدانية</p></div></div><label class="field">الاسم<input class="input" name="name" required minlength="3" maxlength="80" value="${e(r.name)}"></label><label class="field">الهاتف<input class="input num" type="tel" name="phone" required minlength="7" maxlength="25" value="${e(r.phone)}"></label><label class="field">حالة العمل<select class="select" name="status">${[
      ['active', 'متاح للعمل'],
      ['break', 'في استراحة'],
      ['offline', 'خارج ساعات العمل'],
    ]
      .map(([v, l]) => `<option value="${v}" ${r.status === v ? 'selected' : ''}>${l}</option>`)
      .join(
        '',
      )}</select></label><div><span class="small muted">المناطق المعينة من الإدارة</span><div class="chips">${s.zones
      .filter((z) => (r.zoneIds || []).includes(z.id))
      .map((z) => `<span class="chip">${e(z.name)}</span>`)
      .join(
        '',
      )}</div></div><button class="btn btn-primary" type="submit">${ic('check')}حفظ التحديثات</button></form></div>`;
  }
  return {
    id: 'account',
    routes: {
      more: {
        title: 'المزيد',
        render: more,
      },
      profile: {
        title: 'الملف الشخصي',
        render: profile,
        nav: 'more',
      },
    },
    actions: {
      'save-profile'({ data, state }) {
        if (
          String(data.name || '').trim().length < 3 ||
          String(data.phone || '').trim().length < 7 ||
          !['active', 'break', 'offline'].includes(data.status)
        )
          return A.toast('راجع بيانات الملف.', 'error');
        if (
          commit((s) => {
            const r = rep(s);
            r.name = String(data.name).trim();
            r.phone = String(data.phone).trim();
            r.status = data.status;
            r.lastSeen = now();
          }, 'تحديث ملف المندوب') === false
        )
          return;
        A.toast('حُفظ الملف.', 'success');
      },
    },
    api: {},
  };
}
