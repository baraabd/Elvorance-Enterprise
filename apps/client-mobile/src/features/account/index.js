/** client / account: original v1.1 views and local demo actions. */
export function createAccountFeature(context, { state }) {
  const {
    A,
    E,
    area,
    customer,
    error,
    field,
    go,
    heading,
    label,
    list,
    missing,
    notice,
    notify,
    num,
    select,
    wrap,
  } = context;
  const commit = (...args) => state.commit(...args);
  function renderAccount({ state }) {
    const client = customer(state);
    if (!client) return missing();
    return wrap(
      `${heading('حسابك', 'تفاصيل تسهّل تعاوننا', 'حدّث نشاطك وتفضيلاتك ليعرف الفريق ما يناسبك.')}<section class="card client-account-hero"><div class="row">${A.avatar(client.name, '#d9f99d')}<div><h2>${E(client.name)}</h2><p class="muted">${E(client.contact)} · ${E(client.sector)}</p></div></div>${go('تعديل بياناتي', 'profile', {}, 'btn-primary', 'edit')}</section><div class="dashboard-grid"><section class="card main-column"><div class="client-link-list">${go('بيانات النشاط والتواصل', 'profile', {}, 'btn-ghost btn-block', 'building')}${go('تفضيلاتي واحتياجاتي', 'preferences', {}, 'btn-ghost btn-block', 'settings')}${go('عروض الأسعار', 'quotes', {}, 'btn-ghost btn-block', 'file')}${go('الفواتير والدفعات', 'invoices', {}, 'btn-ghost btn-block', 'receipt')}${go('طلبات الخدمات', 'requests', {}, 'btn-ghost btn-block', 'layers')}${go('المحادثات', 'messages', {}, 'btn-ghost btn-block', 'message')}${go('مركز المساعدة', 'support', {}, 'btn-ghost btn-block', 'headphones')}</div></section><aside class="side-column stack"><section class="card card-dark"><p class="eyebrow">شريكك الرقمي</p><h3>${E(state.settings?.company || 'أطلس')}</h3><p class="small">من الطلب الأول إلى تفاصيل التسليم. قراراتك وملفاتك في متناولك.</p>${go('اكتشف خدمة جديدة', 'services', {}, 'btn-lime btn-block', 'sparkles')}</section>${notice('خصوصية العرض التجريبي', 'البيانات مصطنعة ومحفوظة في هذا المتصفح. لا يوجد تسجيل خروج من حساب إنتاجي.', 'shield')}</aside></div>`,
    );
  }
  function renderProfile({ state }) {
    const client = customer(state);
    if (!client) return missing();
    return wrap(
      `${heading('بيانات النشاط', 'لنبقَ على تواصل صحيح', 'تظهر تحديثاتك في ملفك لدى الفريق.')}<form class="card stack" data-submit="save-profile"><div class="form-grid">${field(
        'اسم النشاط',
        'name',
        client.name,
        {
          minlength: 2,
        },
      )}${field('اسم جهة التواصل', 'contact', client.contact, {
        minlength: 2,
      })}${field('رقم الهاتف', 'phone', client.phone, {
        type: 'tel',
        minlength: 7,
        maxlength: 30,
      })}${field('البريد الإلكتروني', 'email', client.email, {
        type: 'email',
      })}${field('نوع النشاط', 'sector', client.sector, {
        minlength: 2,
      })}${field('صاحب القرار', 'decisionMaker', client.decisionMaker || '', {
        required: false,
      })}</div>${area('عنوان النشاط', 'address', client.address || '', {
        minlength: 5,
        rows: 2,
      })}<div class="form-actions"><button type="submit" class="btn btn-primary">${A.icon('check')}حفظ البيانات</button>${go('إلغاء', 'account', {}, 'btn-ghost')}</div></form>`,
    );
  }
  function renderPreferences({ state }) {
    const client = customer(state);
    if (!client) return missing();
    return wrap(
      `${heading('تفضيلاتك', 'تعاون على طريقتك', 'ما الذي تريده، ومتى وكيف نناقشه معك.')}<form class="card stack" data-submit="save-preferences"><div class="form-grid">${select(
        'التواصل المفضل',
        'preferredContact',
        [
          ['messages', 'رسائل المنصة'],
          ['phone', 'الهاتف'],
          ['email', 'البريد الإلكتروني'],
        ],
        {
          'رسائل التطبيق': 'messages',
          الهاتف: 'phone',
          'البريد الإلكتروني': 'email',
        }[client.preferredContact] ||
          (['messages', 'phone', 'email'].includes(client.preferredContact)
            ? client.preferredContact
            : 'messages'),
      )}${field('الوقت الأنسب للتواصل', 'bestTime', client.bestTime || '', {
        required: false,
      })}${field('الميزانية المستهدفة بالدولار', 'budget', client.budget || 0, {
        type: 'number',
        min: 0,
        max: 1000000,
        step: '.01',
      })}</div><fieldset><legend>الخدمات التي تهم نشاطك</legend><div class="client-needs-grid">${list(
        state,
        'catalog',
      )
        .map(
          (service) =>
            `<label class="checkbox-row"><input type="checkbox" name="need_${E(service.id)}" ${(client.needs || []).includes(service.id) ? 'checked' : ''}><span>${E(service.title)}</span></label>`,
        )
        .join('')}</div></fieldset>${area(
        'ما الذي تريد تحسينه؟',
        'painPoints',
        client.painPoints || '',
        {
          required: false,
        },
      )}${area('رغباتك في التصميم والتنفيذ والدفعات', 'wishes', client.wishes || '', {
        required: false,
      })}<label class="checkbox-row"><input type="checkbox" name="doNotContact" ${client.doNotContact ? 'checked' : ''}><span>لا أريد تواصلًا استباقيًا. سأبدأ التواصل عند الحاجة.</span></label><div class="form-actions"><button type="submit" class="btn btn-primary">${A.icon('check')}حفظ التفضيلات</button>${go('إلغاء', 'account', {}, 'btn-ghost')}</div></form>`,
    );
  }
  function saveProfile({ data }) {
    const phone = String(data.phone || '').trim();
    const email = String(data.email || '').trim();
    if (
      String(data.name || '').trim().length < 2 ||
      String(data.contact || '').trim().length < 2 ||
      String(data.sector || '').trim().length < 2
    )
      return error('أكمل اسم النشاط وجهة التواصل ونوع النشاط.');
    if (!/^[+\d\s()\-]{7,30}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return error('راجع رقم الهاتف والبريد الإلكتروني.');
    if (String(data.address || '').trim().length < 5) return error('أضف عنوان النشاط.');
    commit(
      (next) => {
        const client = customer(next);
        ['name', 'contact', 'phone', 'email', 'sector', 'decisionMaker', 'address'].forEach(
          (key) => {
            client[key] = String(data[key] || '').trim();
          },
        );
      },
      'حدّث العميل بيانات نشاطه',
      {
        route: 'account',
        message: 'حُفظت بياناتك وتظهر الآن لدى الفريق.',
      },
    );
  }
  function savePreferences({ data }) {
    const budget = num(data.budget);
    if (
      budget < 0 ||
      budget > 1000000 ||
      !['messages', 'phone', 'email'].includes(data.preferredContact)
    )
      return error('راجع الميزانية وطريقة التواصل.');
    commit(
      (next) => {
        const client = customer(next);
        client.preferredContact = label(
          {
            messages: 'رسائل التطبيق',
            phone: 'الهاتف',
            email: 'البريد الإلكتروني',
          },
          data.preferredContact,
        );
        client.bestTime = String(data.bestTime || '').trim();
        client.budget = budget;
        client.painPoints = String(data.painPoints || '').trim();
        client.wishes = String(data.wishes || '').trim();
        client.needs = list(next, 'catalog')
          .filter((service) => data[`need_${service.id}`])
          .map((service) => service.id);
        const previousContactPreference = !!client.doNotContact;
        client.doNotContact = !!data.doNotContact;
        if (previousContactPreference !== client.doNotContact)
          client.notes =
            `${client.notes || ''}\n${client.doNotContact ? 'طلب العميل إيقاف التواصل الاستباقي' : 'أعاد العميل السماح بالتواصل الاستباقي'} (${A.today()}).`.trim();
        if (client.doNotContact) {
          list(next, 'visits')
            .filter((visit) => visit.clientId === client.id && visit.status === 'scheduled')
            .forEach((visit) => {
              visit.status = 'cancelled';
              visit.cancellationReason = 'طلب العميل إيقاف التواصل الاستباقي';
            });
          list(next, 'tasks')
            .filter(
              (task) =>
                task.clientId === client.id && task.status === 'open' && task.type === 'follow_up',
            )
            .forEach((task) => {
              task.status = 'cancelled';
              task.cancellationReason = 'طلب العميل إيقاف التواصل الاستباقي';
            });
        }
        notify(
          next,
          'حدّث العميل تفضيلاته',
          `${client.name}${client.doNotContact ? ': يفضل إيقاف التواصل الاستباقي.' : ': احتياجات وتفضيلات محدثة.'}`,
        );
      },
      'حدّث العميل احتياجاته وتفضيلات التواصل',
      {
        route: 'account',
        message: 'حُفظت تفضيلاتك في الملف المشترك.',
      },
    );
  }
  return {
    id: 'account',
    routes: {
      account: {
        title: 'حسابي',
        nav: 'account',
        render: renderAccount,
      },
      profile: {
        title: 'بيانات نشاطي',
        nav: 'account',
        render: renderProfile,
      },
      preferences: {
        title: 'التفضيلات والاحتياجات',
        nav: 'account',
        render: renderPreferences,
      },
    },
    actions: {
      'save-profile': saveProfile,
      'save-preferences': savePreferences,
    },
    api: {},
  };
}
