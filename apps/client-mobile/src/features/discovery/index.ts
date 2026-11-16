// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import {
  configured,
  visibleQuestions,
  validateAnswers,
  recommendServices,
} from '@elvorance/questionnaire';

/** Customer self-assessment uses same tenant-authored questionnaire as the representative. */
export function createClientDiscoveryFeature(context, { state }) {
  const { A, E, customer, heading, go, wrap, missing, money } = context;
  const esc = (x) => E(String(x ?? ''));
  function render({ state: s, params }) {
    const cust = customer(s);
    if (!cust) return missing('حساب العميل غير متاح');
    const conf = configured(s),
      activityId = String(params.activity || cust.survey?.activityId || cust.activityId || '');
    const current = cust.survey || {};
    const options = conf.activities.filter((a) => a.active || a.id === activityId);
    const sections = ['challenge', 'goal', 'solution'];
    const selectedAnswers = current.activityId === activityId ? current.answers || {} : {};
    const recommendation = recommendServices(conf, activityId, selectedAnswers, s.catalog).slice(
      0,
      5,
    );
    return wrap(`${heading('احتياجات منشأتك', 'حلول تبدأ بفهم التحديات', 'اختر نشاطك ثم أخبرنا باحتياجاتك. يمكنك تغيير الإجابات لاحقًا.')}
      <section class="card"><form data-submit="client-select-activity" class="form-grid"><label class="field"><span>نوع النشاط *</span><select class="select" name="activityId" required><option value="">اختر النشاط</option>${options.map((a) => `<option value="${esc(a.id)}" ${a.id === activityId ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label><button class="btn btn-secondary" type="submit">إظهار الأسئلة</button></form></section>
      ${
        activityId && options.some((a) => a.id === activityId)
          ? `<form data-submit="client-save-discovery" data-activity="${esc(activityId)}" class="stack">${sections
              .flatMap((section) =>
                visibleQuestions(conf, activityId, section).map((q) => {
                  const opts =
                    q.id === 'solutions'
                      ? s.catalog
                          .filter((x) => x.active !== false)
                          .map((s) => ({ id: s.id, label: s.title }))
                      : q.options;
                  const value = selectedAnswers[q.id],
                    selected = Array.isArray(value) ? value : [value || ''];
                  let field = '';
                  if (q.type === 'single')
                    field = `<select name="answer_${esc(q.id)}" class="select" data-change="client-survey-other-toggle" ${q.required ? 'required' : ''}><option value="">اختر</option>${opts.map((o) => `<option value="${esc(o.id)}" ${selected.includes(o.id) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
                  else if (q.type === 'multi')
                    field = `<div class="survey-options">${opts.map((o) => `<label class="checkbox-row"><input type="checkbox" data-change="client-survey-other-toggle" name="answer_${esc(q.id)}" value="${esc(o.id)}" ${selected.includes(o.id) ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>`;
                  else if (q.type === 'number')
                    field = `<input class="input" name="answer_${esc(q.id)}" type="number" step="any" ${q.min != null ? `min="${q.min}"` : ''} ${q.max != null ? `max="${q.max}"` : ''} value="${esc(value || '')}" ${q.required ? 'required' : ''}>`;
                  else
                    field = `<textarea name="answer_${esc(q.id)}" class="textarea" minlength="2" maxlength="2000" rows="3" ${q.required ? 'required' : ''}>${esc(value || '')}</textarea>`;
                  const otherNeeded = selected.includes('other') && q.otherAllowed;
                  return `<section class="card survey-question" data-question="${esc(q.id)}"><label class="field"><strong>${esc(q.label)} ${q.required ? '*' : ''}</strong>${field}</label>${q.otherAllowed && opts.some((o) => o.id === 'other') ? `<label class="field survey-other" ${otherNeeded ? '' : 'hidden'}><span>تفاصيل «أخرى» عند اختيارها</span><input class="input" name="answer_${esc(q.id)}__other" value="${esc(selectedAnswers[q.id + '__other'] || '')}" maxlength="500" ${otherNeeded ? 'required minlength="3"' : ''}></label>` : ''}</section>`;
                }),
              )
              .join(
                '',
              )}${recommendation.length ? `<section class="card"><h3>حلول قد تناسب احتياجك</h3>${recommendation.map((x) => `<p class="small"><strong>${esc(x.title)}</strong> · ${money(x.price)}</p>`).join('')}<p class="tiny muted">اقتراح أولي يعتمد على الإجابات؛ السعر النهائي ضمن العرض وليس ضمانًا لزيادة المبيعات.</p></section>` : ''}<button class="btn btn-primary btn-block" type="submit">حفظ احتياج منشأتي</button></form>`
          : '<div class="notice">حدد نوع النشاط لعرض الأسئلة المعتمدة من الإدارة.</div>'
      }`);
  }
  return {
    id: 'client-discovery',
    routes: { 'needs-survey': { title: 'استبيان النشاط', render, nav: 'services' } },
    actions: {
      'client-survey-other-toggle': ({ el }) => {
        const block = el.closest('[data-question]');
        if (!block) return;
        const other = block.querySelector('.survey-other');
        if (!other) return;
        const active = [...block.querySelectorAll('select,input[type=\"checkbox\"]')].some(
          (x) => x.value === 'other' && (x.checked || x.selectedOptions?.[0]?.value === 'other'),
        );
        other.hidden = !active;
        const input = other.querySelector('input');
        input.required = active;
        if (!active) input.value = '';
      },
      'client-select-activity': ({ data }) => A.go('needs-survey', { activity: data.activityId }),
      'client-save-discovery': ({ form }) => {
        const s = A.state(),
          activityId = form.dataset.activity,
          cust = customer(s),
          conf = configured(s);
        if (!cust) return;
        if (!conf.activities.some((a) => a.id === activityId && a.active))
          return A.toast('اختر نشاطًا معتمدًا.', 'error');
        const answers = {};
        for (const sec of ['challenge', 'goal', 'solution'])
          for (const q of visibleQuestions(conf, activityId, sec)) {
            const fields = [...form.querySelectorAll(`[name="answer_${q.id}"]`)];
            answers[q.id] =
              q.type === 'multi'
                ? fields.filter((x) => x.checked).map((x) => x.value)
                : fields[0]?.value || '';
            const other = form.elements.namedItem(`answer_${q.id}__other`);
            if (other && other.value.trim()) answers[q.id + '__other'] = other.value.trim();
          }
        const errors = validateAnswers(conf, activityId, answers, s.catalog);
        const first = Object.values(errors)[0];
        if (first) return A.toast(first, 'error');
        const snapshot = {
          activityId,
          configRevision: conf.revision,
          answers,
          questions: conf.questions.map((q) => ({ id: q.id, label: q.label, options: q.options })),
          at: new Date().toISOString(),
        };
        if (
          state.commit((st) => {
            const current = customer(st);
            A.assert(current, 'العميل غير متاح');
            current.activityId = activityId;
            current.survey = snapshot;
          }, 'العميل حدّث احتياجات منشأته') === false
        )
          return;
        A.toast('حُفظت الإجابات ويمكنك مراجعتها في أي وقت.', 'success');
        A.go('services');
      },
    },
    api: {},
  };
}
