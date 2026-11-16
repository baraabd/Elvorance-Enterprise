// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import {
  configured,
  defaultConfiguration,
  validateConfiguration,
  QUESTION_SECTIONS,
  FIELD_TYPES,
} from '@elvorance/questionnaire';

/** Versioned questionnaire + catalog authoring. Drafts persist only after full validation. */
export function createConfigurationFeature(context, { state }) {
  const { A, E, action, go, icon, pageTitle, sectionTitle, wrap } = context;
  const persist = state.persist;
  const safe = (v) => E(String(v ?? ''));
  const selectOptions = (entries, selected) =>
    entries
      .map(
        ([id, label]) =>
          `<option value="${safe(id)}" ${id === selected ? 'selected' : ''}>${safe(label)}</option>`,
      )
      .join('');
  const textField = (label, name, value, attrs = 'required minlength="2" maxlength="150"') =>
    `<label class="field"><span>${safe(label)}</span><input class="input" name="${safe(name)}" value="${safe(value)}" ${attrs}></label>`;
  const area = (label, name, value, attrs = 'maxlength="2000"') =>
    `<label class="field"><span>${safe(label)}</span><textarea class="textarea" name="${safe(name)}" rows="4" ${attrs}>${safe(value)}</textarea></label>`;
  const picker = (label, name, entries, selected) =>
    `<label class="field"><span>${safe(label)}</span><select class="select" name="${safe(name)}" required>${selectOptions(entries, selected)}</select></label>`;
  const chk = (label, name, checked) =>
    `<label class="checkbox-row"><input type="checkbox" name="${safe(name)}" value="yes" ${checked ? 'checked' : ''}><span>${safe(label)}</span></label>`;
  const render = ({ state: s }) => {
    const c = configured(s);
    const sectorNames = new Map(c.activities.map((x) => [x.id, x.label]));
    const rows = [...c.questions].sort((a, b) => (a.order || 0) - (b.order || 0));
    const valid = validateConfiguration(c, s.catalog);
    return wrap(
      pageTitle(
        'استبيانات ومحتوى المبيعات',
        'الأسئلة والخدمات من مكان واحد',
        'تعديل النصوص والخيارات والأنشطة والأسعار، مع نسخ ثابتة من إجابات الزيارات السابقة.',
        action('new-question', 'إضافة سؤال', 'plus', '', 'btn btn-primary'),
      ) +
        `<section class="card"><div class="row-between"><div><h2>الإصدار المعتمد محليًا · ${safe(c.revision || 1)}</h2><p class="small muted">${c.updatedAt ? 'آخر تعديل ' + safe(A.date(c.updatedAt, { time: true })) : 'بيانات البداية القابلة للتعديل'}</p></div><span class="badge ${valid.length ? 'badge-bad' : 'badge-good'}">${valid.length ? 'تحقق مطلوب' : 'تعريف صالح'}</span></div><div class="notice">البيانات قابلة للتعديل. في وضع التجربة تتزامن بين التطبيقات في المتصفح نفسه؛ ومع تفعيل API ومصادقة المستخدم تصل من خدمة CRM المركزية.</div>${valid.length ? `<p role="alert" class="notice notice-warn">${safe(valid.join('، '))}</p>` : ''}<div class="row wrap gap-sm">${action('new-activity', 'إضافة نشاط', 'plus', '', 'btn btn-secondary')}${action('new-service', 'إضافة خدمة', 'plus', '', 'btn btn-secondary')}${go('home', 'العودة للرئيسية', 'home', '', 'btn btn-ghost')}</div></section>` +
        `<section class="card"><h2>الأنشطة التجارية</h2><p class="muted small">يختار المندوب نوع المنشأة أولًا؛ والأسئلة ترتبط بالنشاط الذي تحدده هنا.</p><div class="grid-3">${c.activities.map((a) => `<article class="list-item"><strong>${safe(a.label)}</strong><span class="small muted">${a.active ? 'نشط' : 'مؤرشف'}</span>${action('edit-activity', 'تعديل', 'edit', `data-id="${safe(a.id)}"`, 'btn btn-secondary btn-sm')}</article>`).join('')}</div></section>` +
        `<section class="card">${sectionTitle('بنك الأسئلة', action('new-question', 'إضافة سؤال', 'plus', '', 'btn btn-secondary btn-sm'))}<p class="muted small">تظهر علامة * للحقول الإلزامية. تغيير الخيارات لا يمحو إجابات الزيارات المسجلة، لأن كل إجابة تحتفظ بإصدار الاستبيان.</p><div class="list">${rows.map((q, i) => `<article class="list-item"><div class="row-between"><div><p class="eyebrow">${safe(QUESTION_SECTIONS[q.section] || q.section)} · ${safe(FIELD_TYPES[q.type] || q.type)}</p><h3>${safe(q.label)} ${q.required ? '*' : ''}</h3><p class="small muted">${safe((q.activityIds || ['*']).map((a) => (a === '*' ? 'كل الأنشطة' : sectorNames.get(a) || a)).join('، '))} · ${q.active ? 'نشط' : 'مؤرشف'} · ${q.options?.length || 0} خيارات</p></div><div class="row gap-sm">${action('edit-question', 'تعديل', 'edit', `data-id="${safe(q.id)}"`, 'btn btn-secondary btn-sm')}${action('archive-question', q.active ? 'أرشفة' : 'إعادة تفعيل', q.active ? 'x' : 'check', `data-id="${safe(q.id)}"`, 'btn btn-ghost btn-sm')}</div></div></article>`).join('')}</div></section>` +
        `<section class="card">${sectionTitle('كتالوج الخدمات', action('new-service', 'إضافة خدمة', 'plus', '', 'btn btn-secondary btn-sm'))}<p class="muted small">الخدمات التي يعدلها الأدمن تظهر للمندوب والعميل وتستخدم في العروض القادمة؛ الاتفاقيات القديمة تحفظ أسعارها التاريخية.</p><div class="grid-2">${s.catalog.map((svc) => `<article class="list-item"><div class="row-between"><div><h3>${safe(svc.title)}</h3><p class="small muted">${safe(svc.category)} · ${svc.active === false ? 'مؤرشفة' : 'متاحة'} · $${Number(svc.price || 0).toLocaleString('en-US')}</p><p class="small muted">${safe(svc.short || '')}</p></div>${action('edit-service', 'تعديل الخدمة', 'edit', `data-id="${safe(svc.id)}"`, 'btn btn-secondary btn-sm')}</div></article>`).join('')}</div></section>`,
    );
  };
  function editQuestion(id) {
    const s = A.state(),
      c = configured(s),
      q = c.questions.find((x) => x.id === id),
      isNew = !q;
    const def = q || {
      id: '',
      label: '',
      section: 'challenge',
      type: 'single',
      activityIds: ['*'],
      active: true,
      required: true,
      order: c.questions.length * 10 + 10,
      options: [],
      otherAllowed: true,
      min: null,
      max: null,
    };
    const options = (def.options || []).map((o) => o.label).join('\n');
    const activityChoices = [['*', 'كل الأنشطة'], ...c.activities.map((a) => [a.id, a.label])];
    const content = `<input type="hidden" name="id" value="${safe(def.id)}">${textField('السؤال', 'label', def.label, 'required minlength="8" maxlength="300"')}${picker('مرحلة السؤال', 'section', Object.entries(QUESTION_SECTIONS), def.section)}<div class="form-grid">${picker('نوع الحقل', 'type', Object.entries(FIELD_TYPES), def.type)}${picker('ينطبق على النشاط', 'activity', activityChoices, def.activityIds?.[0] || '*')}</div>${area('الخيارات (خيار في كل سطر)', 'choices', options, 'maxlength="5000"')}<p class="tiny muted">خيار «أخرى» يُظهر حقل شرح فقط عند اختياره. يجب أن يكون للسؤال ذي الاختيارات خيار واحد على الأقل. لا تُغيّر رموز الخيارات القديمة عند تعديل نصها.</p><div class="form-grid">${textField('الترتيب', 'order', def.order, 'required type="number" min="0" max="10000" step="1"')}${textField('أقل قيمة للحقل الرقمي', 'min', def.min ?? '', 'type="number" step="any"')}${textField('أكبر قيمة للحقل الرقمي', 'max', def.max ?? '', 'type="number" step="any"')}</div><div class="row wrap gap-sm">${chk('سؤال إلزامي', 'required', def.required)}${chk('الحقل نشط', 'active', def.active)}${chk('تفعيل خيار أخرى', 'otherAllowed', def.otherAllowed)}</div><div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">إلغاء</button><button type="submit" class="btn btn-primary">${icon('check')}حفظ السؤال</button></div>`;
    A.modal(
      isNew ? 'إضافة سؤال للاستبيان' : 'تعديل السؤال',
      `<form data-submit="save-question" data-id="${safe(def.id)}">${content}</form>`,
      { wide: true },
    );
  }
  function editActivity(id) {
    const c = configured(A.state()),
      a = c.activities.find((x) => x.id === id) || { id: '', label: '', active: true };
    A.modal(
      id ? 'تعديل نشاط' : 'إضافة نشاط',
      `<form data-submit="save-activity" data-id="${safe(id || '')}">${textField('نوع نشاط المنشأة', 'label', a.label, 'required minlength="2" maxlength="100"')}${chk('نشط ويمكن اختياره', 'active', a.active)}<div class="form-actions"><button type="button" data-action="close-modal" class="btn btn-ghost">إلغاء</button><button class="btn btn-primary" type="submit">حفظ النشاط</button></div></form>`,
    );
  }
  function editService(id) {
    const svc = A.state().catalog.find((s) => s.id === id) || {
      title: '',
      short: '',
      category: 'software',
      price: 0,
      unit: 'للمشروع',
      duration: '',
      features: [],
      deliverables: [],
      recommendationTags: [],
      active: true,
    };
    A.modal(
      id ? 'تعديل خدمة' : 'إضافة خدمة',
      `<form data-submit="save-service" data-id="${safe(id || '')}">${textField('اسم الخدمة', 'title', svc.title, 'required minlength="2" maxlength="150"')}${textField('الوصف', 'short', svc.short, 'required minlength="5" maxlength="300"')}<div class="form-grid">${textField('التصنيف البرمجي', 'category', svc.category, 'required pattern="[A-Za-z0-9_-]{2,60}" maxlength="60"')}${textField('السعر بالدولار', 'price', svc.price, 'required type="number" min="0" max="100000000" step="0.01"')}${textField('الوحدة', 'unit', svc.unit, 'required maxlength="100"')}${textField('المدة المقترحة', 'duration', svc.duration, 'maxlength="100"')}</div>${area('مميزات الخدمة (سطر لكل عنصر)', 'features', (svc.features || []).join('\n'))}${area('التسليمات (سطر لكل عنصر)', 'deliverables', (svc.deliverables || []).join('\n'))}${area('وسوم الترشيح المرتبطة باحتياجات العميل', 'recommendationTags', (svc.recommendationTags || []).join('\n'))}${chk('خدمة متاحة', 'active', svc.active !== false)}<div class="form-actions"><button type="button" data-action="close-modal" class="btn btn-ghost">إلغاء</button><button class="btn btn-primary" type="submit">حفظ الخدمة</button></div></form>`,
      { wide: true },
    );
  }
  const generatedId = (s, A, prefix) => {
    let i = 1,
      id;
    do {
      id = `${prefix}-${i++}`;
    } while (s.includes(id));
    return id;
  };
  const lines = (v) =>
    String(v || '')
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  async function validateAndPersist(label, mutator) {
    const remote = window.ElvoranceConfigurationSync;
    if (remote?.enabled) {
      try {
        const draft = structuredClone(A.state());
        mutator(draft);
        draft.formConfig ||= defaultConfiguration();
        const issues = validateConfiguration(draft.formConfig, draft.catalog);
        if (issues.length) throw new Error(issues[0]);
        // No optimistic local update before the server accepts this exact version.
        await remote.publish({ definition: draft.formConfig, catalog: draft.catalog });
        A.closeModal();
        A.toast('تم نشر التعريف في الشركة. تصل تحديثاته للتطبيقات المسجّلة.', 'success');
        return true;
      } catch (error) {
        A.toast('تعذّر نشر الإعدادات: ' + String(error.message || error), 'error');
        return false;
      }
    }
    const ok = A.update((s) => {
      mutator(s);
      s.formConfig ||= defaultConfiguration();
      const issues = validateConfiguration(s.formConfig, s.catalog);
      A.assert(!issues.length, issues[0]);
      s.formConfig.revision = Number(s.formConfig.revision || 0) + 1;
      s.formConfig.updatedAt = new Date().toISOString();
    }, label);
    if (ok !== false) {
      A.closeModal();
      A.toast('حُفظ التعديل في بيانات التجربة المشتركة.', 'success');
    }
    return ok;
  }
  return {
    id: 'configuration',
    routes: { configuration: { title: 'الاستبيانات والخدمات', render, nav: 'more' } },
    actions: {
      'new-question': () => editQuestion(''),
      'edit-question': ({ el }) => editQuestion(el.dataset.id),
      'new-activity': () => editActivity(''),
      'edit-activity': ({ el }) => editActivity(el.dataset.id),
      'new-service': () => editService(''),
      'edit-service': ({ el }) => editService(el.dataset.id),
      'archive-question': ({ el }) =>
        validateAndPersist('تغيير حالة السؤال', (s) => {
          const q = configured(s).questions.find((x) => x.id === el.dataset.id);
          A.assert(q, 'السؤال غير موجود');
          q.active = !q.active;
        }),
      'save-question': ({ form, data }) => {
        const label = String(data.label || '').trim(),
          order = Number(data.order);
        const min = data.min === '' ? null : Number(data.min),
          max = data.max === '' ? null : Number(data.max),
          cho = lines(data.choices);
        if (
          !Number.isInteger(order) ||
          order < 0 ||
          order > 10000 ||
          (min != null && !Number.isFinite(min)) ||
          (max != null && !Number.isFinite(max))
        )
          return A.toast('راجع الترتيب والحدود الرقمية.', 'error');
        if (['single', 'multi'].includes(data.type) && data.id !== 'solutions' && !cho.length)
          return A.toast('أدخل خيارًا واحدًا على الأقل.', 'error');
        return validateAndPersist('تحديث بنك الأسئلة', (s) => {
          s.formConfig ||= defaultConfiguration();
          const existing = s.formConfig.questions.find((q) => q.id === data.id);
          const id =
            existing?.id ||
            generatedId(
              s.formConfig.questions.map((x) => x.id),
              A,
              'question',
            );
          const old = existing?.options || [];
          const used = [];
          const options = cho.map((label, i) => {
            const normalized = label.trim();
            const existing =
              old.find((x) => x.label === normalized && !used.includes(x.id)) || old[i];
            const id =
              normalized === 'أخرى'
                ? 'other'
                : existing?.id === 'other'
                  ? generatedId([...old.map((x) => x.id), ...used], A, 'choice')
                  : existing?.id || generatedId([...old.map((x) => x.id), ...used], A, 'choice');
            used.push(id);
            return { id, label: normalized };
          });
          const next = {
            id,
            label,
            section: data.section,
            type: data.type,
            required: data.required === 'yes',
            active: data.active === 'yes',
            activityIds: [data.activity],
            order,
            options,
            otherAllowed: data.otherAllowed === 'yes',
            min,
            max,
          };
          if (existing) Object.assign(existing, next);
          else s.formConfig.questions.push(next);
        });
      },
      'save-activity': ({ form, data }) =>
        validateAndPersist('تعديل نوع النشاط', (s) => {
          s.formConfig ||= defaultConfiguration();
          const a = s.formConfig.activities.find((x) => x.id === form.dataset.id);
          const value = {
            id:
              a?.id ||
              generatedId(
                s.formConfig.activities.map((x) => x.id),
                A,
                'activity',
              ),
            label: String(data.label).trim(),
            active: data.active === 'yes',
          };
          if (a) Object.assign(a, value);
          else s.formConfig.activities.push(value);
        }),
      'save-service': ({ form, data }) => {
        const price = Number(data.price);
        if (!Number.isFinite(price) || price < 0 || price > 100000000)
          return A.toast('أدخل سعرًا صحيحًا.', 'error');
        return validateAndPersist('تعديل كتالوج الخدمات', (s) => {
          const svc = s.catalog.find((x) => x.id === form.dataset.id);
          const next = {
            id:
              svc?.id ||
              generatedId(
                s.catalog.map((x) => x.id),
                A,
                'svc',
              ),
            title: String(data.title).trim(),
            short: String(data.short).trim(),
            category: String(data.category).trim(),
            price,
            unit: String(data.unit).trim(),
            duration: String(data.duration || '').trim(),
            features: lines(data.features),
            deliverables: lines(data.deliverables),
            recommendationTags: lines(data.recommendationTags),
            active: data.active === 'yes',
            icon: svc?.icon || 'layers',
            color: svc?.color || '#e7f3d6',
          };
          if (svc) Object.assign(svc, next);
          else s.catalog.push(next);
        });
      },
    },
    api: {},
  };
}
