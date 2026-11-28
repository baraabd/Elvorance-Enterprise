import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture } from './fixture.mts';
import { browser } from './chromium.mts';
import { domDriver } from './dom.mts';
import { paths } from '../../apps/admin-web/src/server/api.ts';

const storage = process.env.ELVORANCE_ADMIN_E2E_STORAGE;
if (storage !== 'memory' && storage !== 'postgres')
  throw new Error('Explicit storage mode required.');
const domOnly = process.env.ELVORANCE_ADMIN_E2E_DRIVER === 'dom';
test(
  `S05 ${domOnly ? 'DOM-only diagnostic' : 'Chromium'} + real HTTP handlers + ${storage} storage`,
  { timeout: 180000 },
  async (t) => {
    const stack = await fixture(storage);
    t.after(stack.close);
    const page = await (domOnly ? domDriver() : browser());
    t.after(page.close);
    const loaded = () =>
      page.wait(
        "document.querySelector('main')?.getAttribute('aria-busy')==='false' && !document.querySelector('main > section[role=alert]')",
      );
    const route = async (screen: string) => {
      await page.evaluate(`location.hash=${JSON.stringify('#/admin/' + screen)}`);
      await page.wait(`location.hash===${JSON.stringify('#/admin/' + screen)}`);
      await page.wait("document.querySelector('main[aria-busy=true]')===null");
      await new Promise((resolve) => setTimeout(resolve, 75));
      await loaded();
    };
    const form = () => page.wait("Boolean(document.querySelector('form[data-admin-form]'))");
    const submit = async () => {
      await page.fill('_confirmation', true);
      await page.click('تأكيد وحفظ');
    };
    const apiRecord = async (path: string) => {
      const result = await stack.call(path);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      return result.data;
    };
    await t.test(
      'fixture permits only its exact browser origin and rejects foreign-origin writes',
      async () => {
        const blocked = await fetch(stack.url + paths.customers, {
          method: 'POST',
          headers: {
            Origin: 'https://unapproved.example.invalid',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'must not be created' }),
        });
        assert.equal(blocked.status, 403);
        assert.equal((await blocked.json()).error.code, 'ORIGIN_DENIED');
        const allowed = await fetch(stack.url + paths.customers, {
          method: 'OPTIONS',
          headers: {
            Origin: new URL(stack.url).origin,
            'Access-Control-Request-Method': 'POST',
          },
        });
        assert.equal(allowed.status, 204);
        assert.equal(allowed.headers.get('access-control-allow-origin'), new URL(stack.url).origin);
      },
    );
    let customerId = '';
    let taskId = '';
    let visitId = '';
    let contractId = '';
    let quoteId = '';
    let clientToken = '';
    await t.test(
      'customer create, server reread, edit, reload and service/repository recreation',
      async () => {
        await page.navigate(stack.url + '/#/admin/customers');
        await loaded();
        assert.match(await page.evaluate<string>('document.body.innerText'), /لا توجد سجلات/);
        await page.click('إضافة — العملاء');
        await form();
        await page.fill('name', 'عميل اختبار المتصفح');
        await page.fill('repId', 'rep-s05');
        await submit();
        await page.wait(
          "document.querySelector('tbody')?.innerText.includes('عميل اختبار المتصفح')",
        );
        const list = await apiRecord(paths.customers);
        const first = (list.items as Record<string, unknown>[])[0];
        assert.ok(first);
        customerId = String(first.id);
        assert.equal(first.version, 1);
        await page.click('فتح السجل');
        await page.wait("document.querySelector('main dl')!==null");
        await page.click('تعديل');
        await form();
        await page.fill('name', 'عميل محفوظ بعد التعديل');
        await submit();
        await page.wait(
          "document.querySelector('main dl')?.textContent.includes('عميل محفوظ بعد التعديل')",
        );
        await stack.reopenCrm();
        await page.reload();
        await loaded();
        assert.match(
          await page.evaluate<string>('document.querySelector("main").innerText'),
          /عميل محفوظ بعد التعديل/,
        );
        assert.equal((await apiRecord(paths.customers + '/' + customerId)).version, 2);
      },
    );
    await t.test(
      'stale optimistic version is rejected without losing entered form values',
      async () => {
        await page.click('تعديل');
        await form();
        const current = await apiRecord(paths.customers + '/' + customerId);
        const concurrent = await stack.call(paths.customers + '/' + customerId, 'PATCH', {
          expectedVersion: current.version,
          name: 'تغيير مستخدم آخر',
        });
        assert.equal(concurrent.status, 200);
        await page.fill('name', 'تعديل قديم لا يجوز حفظه');
        await submit();
        await page.wait(
          "document.querySelector('form [role=alert]')?.textContent.includes('تعارض')",
        );
        assert.equal(
          await page.evaluate('document.querySelector("[name=name]").value'),
          'تعديل قديم لا يجوز حفظه',
        );
        assert.equal(
          (await apiRecord(paths.customers + '/' + customerId)).name,
          'تغيير مستخدم آخر',
        );
        await page.click('إلغاء');
        await loaded();
      },
    );
    await t.test(
      'lost write response retries the same intent exactly once at the service',
      async () => {
        await page.click('تعديل');
        await form();
        const current = await apiRecord(paths.customers + '/' + customerId);
        await page.fill('name', 'عملية واحدة رغم إعادة المحاولة');
        stack.loseResponse();
        await submit();
        await page.wait(
          "document.querySelector('form [role=alert]')?.textContent.includes('لم يتأكد')",
        );
        await page.wait("!document.querySelector('form button[type=submit]').disabled");
        await submit();
        await page.wait(
          "document.querySelector('main dl')?.textContent.includes('عملية واحدة رغم إعادة المحاولة')",
        );
        const reread = await apiRecord(paths.customers + '/' + customerId);
        assert.equal(reread.version, Number(current.version) + 1);
      },
    );
    await t.test(
      'task create, completion and reload persist through the public gateway',
      async () => {
        await route('tasks/new');
        await form();
        await page.fill('clientId', customerId);
        await page.fill('title', 'مهمة فعلية من واجهة الإدارة');
        await page.fill('dueOn', '2030-01-02');
        await submit();
        await page.wait("document.querySelector('tbody')?.innerText.includes('مهمة فعلية')");
        const task = ((await apiRecord(paths.tasks)).items as Record<string, unknown>[])[0];
        assert.ok(task);
        taskId = String(task.id);
        await page.click('فتح السجل');
        await page.wait("document.querySelector('main dl')!==null");
        await page.click('تعديل');
        await form();
        await page.fill('status', 'done');
        await submit();
        await page.wait("document.querySelector('main dl')?.innerText.includes('منجز')");
        await page.reload();
        await loaded();
        assert.equal((await apiRecord(paths.tasks + '/' + taskId)).status, 'done');
      },
    );
    await t.test(
      'visit scheduling, manual start and completion are actual persisted commands',
      async () => {
        await route('visits/new');
        await form();
        await page.fill('clientId', customerId);
        const date = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
        await page.fill('scheduledAt', date);
        await page.fill('purpose', 'زيارة متابعة احتياجات العميل');
        await submit();
        await page.wait("document.querySelector('tbody tr')!==null");
        const visit = ((await apiRecord(paths.visits)).items as Record<string, unknown>[])[0];
        assert.ok(visit);
        visitId = String(visit.id);
        await page.click('فتح السجل');
        await page.wait("document.querySelector('main dl')!==null");
        await page.click('بدء بإثبات يدوي');
        await form();
        await page.fill('reason', 'إثبات ميداني يدوي في اختبار معزول');
        await submit();
        await page.wait(
          "[...document.querySelectorAll('button')].some(b=>b.textContent==='إنهاء الزيارة')",
        );
        await page.click('إنهاء الزيارة');
        await form();
        await page.fill('outcome', 'interested');
        await page.fill('notes', 'تمت مناقشة احتياجات المشروع وخطوات المتابعة');
        await submit();
        await page.wait("document.querySelector('main dl')?.textContent.includes('مكتمل')");
        await page.reload();
        await loaded();
        assert.equal((await apiRecord(paths.visits + '/' + visitId)).status, 'completed');
      },
    );
    await t.test(
      'catalog publication and quote pricing use tenant API data, with a real commercial approval',
      async () => {
        const configuration = await apiRecord('/v1/crm/configuration');
        const definition = configuration.definition as Record<string, unknown>;
        definition.questions = [
          {
            id: 'need',
            label: 'Customer requirements',
            section: 'challenge',
            type: 'text',
            required: true,
            active: true,
            activityIds: ['services'],
            order: 10,
            options: [],
            otherAllowed: false,
            min: null,
            max: null,
          },
        ];
        await route('catalog');
        await page.click('تحرير ونشر');
        await form();
        await page.fill('currency', 'SAR');
        await page.fill('definition', JSON.stringify(definition));
        await page.click('إضافة بند: خدمات المؤسسة الفعلية');
        await page.fill('id', 's05web');
        await page.fill('title', 'خدمة منشورة للاختبار المعزول');
        await page.fill('category', 'software');
        await page.fill('price', '100');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.reload();
        await loaded();
        assert.equal(
          ((await apiRecord('/v1/crm/catalog')).items as Record<string, unknown>[])[0]
            ?.unitPriceMinor,
          10000,
        );
        await route('quotes/new');
        await form();
        await page.fill('visitId', visitId);
        await page.click('إضافة بند: الخدمات');
        await page.fill('serviceId', 's05web');
        await page.fill('quantity', '1');
        await page.fill('deliverables', 'وثيقة مخرجات اختبار فعلية');
        await page.fill('duration', 'أسبوع');
        await page.fill('discountMinor', '2000');
        await page.click('إضافة بند: الدفعات');
        await page.fill('label', 'الدفعة الكاملة');
        await page.fill('amountMinor', '8000');
        await page.fill('validUntil', '2030-01-02');
        await page.fill('terms', 'نطاق عمل وشروط واضحة يوافق عليها العميل');
        await submit();
        await page.wait("Boolean(document.querySelector('tbody tr'))");
        const quote = ((await apiRecord(paths.quotes)).items as Record<string, unknown>[])[0];
        assert.ok(quote);
        quoteId = String(quote.id);
        assert.equal(quote.totalMinor, 8000);
        await page.click('فتح السجل');
        await page.wait("Boolean(document.querySelector('main dl'))");
        await page.click('طلب موافقة تجارية');
        await form();
        await page.fill('reason', 'طلب استثناء تجاري موثق ضمن الاختبار');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await route('approvals');
        await page.click('فتح السجل');
        await page.wait("Boolean(document.querySelector('main dl'))");
        await page.click('قرار تجاري');
        await form();
        await page.fill('decision', 'approved');
        await page.fill('note', 'اعتماد الخصم لهذا النطاق المحدد');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await route('quotes/' + quoteId);
        await page.click('إرسال العرض');
        await form();
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        assert.equal((await apiRecord(paths.quotes + '/' + quoteId)).status, 'sent');
        await page.reload();
        await loaded();
      },
    );
    await t.test(
      'customer-owned consent provisions real discounted contract, project and invoice via domain handlers',
      async () => {
        clientToken = await stack.token('client', 'tenant-s05', customerId);
        const quote = await apiRecord(paths.quotes + '/' + quoteId);
        assert.equal(
          (
            await stack.call(paths.quotes + '/' + quoteId + '/accept', 'POST', {
              expectedVersion: quote.version,
              consent: true,
            })
          ).status,
          403,
        );
        const accepted = await stack.call(
          paths.quotes + '/' + quoteId + '/accept',
          'POST',
          { expectedVersion: quote.version, consent: true },
          clientToken,
        );
        assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
        const contract = accepted.data.contract as Record<string, unknown>;
        contractId = String(contract.id);
        const approved = await stack.call(
          paths.contracts + '/' + contractId + '/approve',
          'POST',
          {
            expectedVersion: contract.version,
            consent: true,
            signerName: 'Synthetic customer signer',
          },
          clientToken,
        );
        assert.equal(approved.status, 200, JSON.stringify(approved.data));
        await stack.drainEvents();
        await route('contracts/' + contractId);
        await page.reload();
        await loaded();
        const fulfillment = await apiRecord(paths.contracts + '/' + contractId + '/fulfillment');
        assert.equal(fulfillment.status, 'ready');
        assert.equal((await apiRecord(paths.invoices)).items instanceof Array, true);
        const invoice = ((await apiRecord(paths.invoices)).items as Record<string, unknown>[])[0];
        assert.equal(invoice?.amountMinor, 8000);
      },
    );
    await t.test(
      'region metadata edits persist, reject stale writes and cannot change assignments',
      async () => {
        await route('regions/new');
        await form();
        await page.fill('name', 'منطقة اختبار الإصدار');
        await page.fill('code', 'PREPROD');
        await submit();
        await page.wait("Boolean(document.querySelector('tbody tr'))");
        const region = ((await apiRecord(paths.regions)).items as Record<string, unknown>[]).find(
          (row) => row.code === 'PREPROD',
        );
        assert.ok(region);
        await route('regions/' + String(region.id));
        await page.click('تعديل');
        await form();
        await page.fill('name', 'منطقة معدلة من الواجهة');
        await page.fill('active', false);
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.reload();
        await loaded();
        const reread = ((await apiRecord(paths.regions)).items as Record<string, unknown>[]).find(
          (row) => row.id === region.id,
        );
        assert.ok(reread);
        assert.equal(reread.name, 'منطقة معدلة من الواجهة');
        assert.equal(reread.active, false);
        assert.equal(reread.version, Number(region.version) + 1);
        const path = paths.regions + '/' + String(region.id);
        assert.equal(
          (
            await stack.call(path, 'PATCH', {
              expectedVersion: region.version,
              name: 'stale overwrite',
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await stack.call(path, 'PATCH', {
              expectedVersion: reread.version,
              repId: 'rep-foreign',
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await stack.call(
              path,
              'PATCH',
              { expectedVersion: reread.version, name: 'foreign overwrite' },
              stack.outsider,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await stack.call(
              path,
              'PATCH',
              { expectedVersion: reread.version, name: 'client overwrite' },
              clientToken,
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      'client service request is reviewed in Admin and creates exactly one opportunity with authorization and conflict guards',
      async () => {
        const catalog = await apiRecord('/v1/crm/catalog');
        const body = {
          serviceId: 's05web',
          catalogVersion: catalog.recordVersion,
          currency: 'SAR',
          title: 'طلب خدمة فعلي من العميل',
          brief: 'يرغب العميل في خدمة إضافية موثقة من الكتالوج المنشور للاختبار.',
          budgetMinor: 12000,
        };
        assert.equal((await stack.call(paths['service-requests'], 'POST', body)).status, 403);
        const request = await stack.call(paths['service-requests'], 'POST', body, clientToken);
        assert.equal(request.status, 200, JSON.stringify(request.data));
        const path = paths['service-requests'] + '/' + String(request.data.id);
        const otherClient = await stack.token('client', 'tenant-s05', 'unrelated-client');
        assert.ok(
          [403, 404].includes((await stack.call(path, 'GET', undefined, otherClient)).status),
        );
        assert.equal((await stack.call(path, 'GET', undefined, stack.outsider)).status, 404);
        assert.equal(
          (
            await stack.call(
              path + '/review',
              'POST',
              {
                expectedVersion: 1,
                decision: 'accepted',
                note: 'client cannot approve their request',
              },
              clientToken,
            )
          ).status,
          403,
        );
        const count = ((await apiRecord(paths.opportunities)).items as unknown[]).length;
        await route('service-requests/' + String(request.data.id));
        await page.click('مراجعة طلب الخدمة');
        await form();
        await page.fill('decision', 'in_review');
        await page.fill('note', 'بدء مراجعة الطلب من المسؤول المخول');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        assert.equal((await apiRecord(path)).status, 'in_review');
        assert.equal(
          (
            await stack.call(path + '/review', 'POST', {
              expectedVersion: 1,
              decision: 'accepted',
              note: 'stale transaction must not create an opportunity',
            })
          ).status,
          409,
        );
        assert.equal(((await apiRecord(paths.opportunities)).items as unknown[]).length, count);
        await page.click('مراجعة طلب الخدمة');
        await form();
        await page.fill('decision', 'accepted');
        await page.fill('note', 'اعتماد الطلب ضمن نطاق الخدمة المنشورة');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.reload();
        await loaded();
        const accepted = await apiRecord(path);
        assert.equal(accepted.status, 'accepted');
        assert.equal(typeof accepted.opportunityId, 'string');
        assert.equal(((await apiRecord(paths.opportunities)).items as unknown[]).length, count + 1);
        assert.equal(
          (
            await stack.call(path + '/review', 'POST', {
              expectedVersion: accepted.version,
              decision: 'accepted',
              note: 'second approval must not create another opportunity',
            })
          ).status,
          409,
        );
        assert.equal(((await apiRecord(paths.opportunities)).items as unknown[]).length, count + 1);
      },
    );
    await t.test(
      'invoice collection, ledger reread and reload use the external-payment recording contract',
      async () => {
        await route('invoices');
        await page.click('فتح السجل');
        await page.wait("Boolean(document.querySelector('main dl'))");
        await page.click('تسجيل تحصيل موثّق');
        await form();
        await page.fill('amountMinor', '8000');
        await page.fill('requestId', 's05-external-payment-unique');
        await page.fill('method', 'bank_transfer');
        await page.fill('reference', 'S05 test-only external receipt');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.reload();
        await loaded();
        const invoice = ((await apiRecord(paths.invoices)).items as Record<string, unknown>[])[0];
        assert.equal(invoice?.status, 'paid');
        const ledger = await apiRecord(paths.invoices + '/' + String(invoice?.id) + '/payments');
        assert.equal((ledger.items as unknown[]).length, 1);
      },
    );
    await t.test(
      'project stages and actual deliverable require separate customer approval before closure',
      async () => {
        await route('projects');
        await page.click('فتح السجل');
        await page.wait("Boolean(document.querySelector('main dl'))");
        const initialProject = (
          (await apiRecord(paths.projects)).items as Record<string, unknown>[]
        )[0];
        assert.ok(initialProject);
        const projectPath = paths.projects + '/' + String(initialProject.id);
        await page.click('تعديل');
        await form();
        await page.fill('title', 'عنوان المشروع المعدل من الإدارة');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.reload();
        await loaded();
        const renamed = await apiRecord(projectPath);
        assert.equal(renamed.title, 'عنوان المشروع المعدل من الإدارة');
        assert.equal(
          (
            await stack.call(projectPath, 'PATCH', {
              expectedVersion: initialProject.version,
              title: 'stale project title',
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await stack.call(
              projectPath,
              'PATCH',
              { expectedVersion: renamed.version, title: 'unauthorized client title' },
              clientToken,
            )
          ).status,
          403,
        );
        await page.click('إضافة مرحلة');
        await form();
        await page.fill('title', 'مرحلة تنفيذ الاختبار');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.click('تعديل بيانات المرحلة: مرحلة تنفيذ الاختبار');
        await form();
        assert.equal(
          await page.evaluate('document.querySelector("[name=milestoneTitle]").value'),
          'مرحلة تنفيذ الاختبار',
        );
        await page.fill('milestoneTitle', 'مرحلة معدلة دون تغيير المشروع');
        await page.fill('milestoneDueOn', '2030-01-03');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.reload();
        await loaded();
        const withMilestone = await apiRecord(projectPath);
        assert.equal(withMilestone.title, 'عنوان المشروع المعدل من الإدارة');
        const editedMilestone = (withMilestone.milestones as Record<string, unknown>[])[0];
        assert.ok(editedMilestone);
        assert.equal(editedMilestone.title, 'مرحلة معدلة دون تغيير المشروع');
        assert.equal(editedMilestone.dueOn, '2030-01-03');
        await page.click('تحديث المرحلة: مرحلة معدلة دون تغيير المشروع');
        await form();
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.click('تحديث المرحلة: مرحلة معدلة دون تغيير المشروع');
        await form();
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        const project = ((await apiRecord(paths.projects)).items as Record<string, unknown>[])[0];
        assert.ok(project);
        const milestone = (project.milestones as Record<string, unknown>[])[0];
        assert.ok(milestone);
        await page.click('إضافة مُخرج');
        await form();
        await page.fill('milestoneId', String(milestone.id));
        await page.fill('title', 'وثيقة تنفيذ فعلية');
        await page.fill(
          'content',
          'هذا محتوى توثيقي فعلي لمرحلة الاختبار يصف العمل المنجز ونتيجته وليس مجرد عنوان.',
        );
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.click('إغلاق المشروع');
        await form();
        await submit();
        await page.wait(
          "document.querySelector('form [role=alert]')?.textContent.includes('تعارض')",
        );
        await page.click('إلغاء');
        await loaded();
        const pending = await apiRecord(paths.projects + '/' + String(project.id));
        const deliverable = (pending.deliverables as Record<string, unknown>[])[0];
        assert.ok(deliverable);
        const review = await stack.call(
          paths.projects +
            '/' +
            String(project.id) +
            '/deliverables/' +
            String(deliverable.id) +
            '/review',
          'POST',
          {
            expectedVersion: pending.version,
            revision: deliverable.revision,
            decision: 'approved',
          },
          clientToken,
        );
        assert.equal(review.status, 200, JSON.stringify(review.data));
        await page.click('تحديث السجل');
        await loaded();
        await page.click('إغلاق المشروع');
        await form();
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.reload();
        await loaded();
        assert.equal(
          (await apiRecord(paths.projects + '/' + String(project.id))).status,
          'completed',
        );
      },
    );
    await t.test(
      'support reply/status and conversation send/read persist without local-only writes',
      async () => {
        const ticket = await stack.call(
          paths.tickets,
          'POST',
          {
            subject: 'طلب دعم في الاختبار',
            category: 'general',
            message: 'شرح مشكلة يرسلها حساب المندوب للاختبار',
          },
          stack.rep,
        );
        assert.equal(ticket.status, 200);
        await route('tickets/' + String(ticket.data.id));
        await page.click('إضافة رد');
        await form();
        await page.fill('message', 'رد إداري محفوظ في خدمة الدعم');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.click('تغيير حالة الدعم');
        await form();
        await page.fill('status', 'resolved');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.reload();
        await loaded();
        assert.equal(
          (await apiRecord(paths.tickets + '/' + String(ticket.data.id))).status,
          'resolved',
        );
        await route('conversations/new');
        await form();
        await page.fill('clientId', customerId);
        await submit();
        await page.wait("Boolean(document.querySelector('tbody tr'))");
        await page.click('فتح السجل');
        await page.wait("Boolean(document.querySelector('main dl'))");
        await page.click('إرسال رسالة');
        await form();
        await page.fill('body', 'رسالة محفوظة على الخادم وليست في ذاكرة الصفحة');
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.click('تأكيد قراءة الرسائل');
        await form();
        await submit();
        await page.wait("!document.querySelector('form[data-admin-form]')");
        await page.reload();
        await loaded();
        assert.match(
          await page.evaluate<string>('document.querySelector("main").textContent'),
          /رسالة محفوظة/,
        );
      },
    );
    await t.test(
      'real pagination, whole-scope search and query state survive a page reload',
      async () => {
        // Functional fixtures must respect the unmodified production request budget.
        // Separate the preceding workflows from 104 explicit API seed writes and list checks.
        // This wait is not excluded or reported as a performance measurement.
        await new Promise((resolve) => setTimeout(resolve, 61000));
        for (let i = 0; i < 104; i++) {
          const result = await stack.call(paths.customers, 'POST', {
            name: `صفحة عميل ${String(i).padStart(3, '0')}`,
            repId: 'rep-s05',
          });
          assert.equal(result.status, 200);
        }
        await route('customers');
        assert.equal(await page.evaluate('document.querySelectorAll("tbody tr").length'), 100);
        await page.click('الصفحة التالية');
        await page.wait("document.querySelectorAll('tbody tr').length===5");
        await page.fill('q', 'صفحة عميل 103');
        await page.fill('scope', 'all');
        await page.click('تطبيق البحث والتصفية');
        await page.wait(
          "document.querySelectorAll('tbody tr').length===1 && document.querySelector('tbody').innerText.includes('103')",
        );
        await page.reload();
        await loaded();
        assert.equal(await page.evaluate('document.querySelectorAll("tbody tr").length'), 1);
      },
    );
    await t.test('read failure offers retry and never shows fallback records', async () => {
      stack.failRead();
      await page.click('تحديث من الخادم');
      await page.wait("Boolean(document.querySelector('main [role=alert]'))");
      assert.equal(await page.evaluate('document.querySelectorAll("tbody tr").length'), 0);
      await page.click('إعادة المحاولة');
      await loaded();
      assert.equal(await page.evaluate('document.querySelectorAll("tbody tr").length'), 1);
    });
    if (!domOnly)
      await t.test(
        'RTL, keyboard focus, labels and responsive overflow checks at three viewport widths',
        async () => {
          for (const width of [390, 768, 1440]) {
            await page.send('Emulation.setDeviceMetricsOverride', {
              width,
              height: 900,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await route('customers/new');
            await form();
            assert.equal(
              await page.evaluate(
                'getComputedStyle(document.querySelector(".admin-server")).direction',
              ),
              'rtl',
            );
            assert.equal(
              await page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
              true,
              `document overflow at ${width}`,
            );
            assert.equal(
              await page.evaluate(
                '[...document.querySelectorAll("main input,main select,main textarea")].every(input=>input.labels?.length>0)',
              ),
              true,
            );
            await page.evaluate('document.querySelector(".admin-skip").focus()');
            await page.send('Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: 'Enter',
              code: 'Enter',
              windowsVirtualKeyCode: 13,
            });
            await page.send('Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: 'Enter',
              code: 'Enter',
              windowsVirtualKeyCode: 13,
            });
            assert.equal(await page.evaluate('document.activeElement.tagName'), 'MAIN');
            const image = await page.send('Page.captureScreenshot', { format: 'png' });
            assert.equal(typeof image.data, 'string');
            const out = resolve('dist/admin-e2e');
            await mkdir(out, { recursive: true });
            await writeFile(
              resolve(out, `admin-rtl-${width}.png`),
              Buffer.from(String(image.data), 'base64'),
            );
          }
        },
      );
    await t.test(
      'all connected resource lists render an API result, not bundled mock collections',
      async () => {
        for (const name of Object.keys(paths)) {
          await route(name);
          assert.equal(
            await page.evaluate('Boolean(document.querySelector("table caption"))'),
            true,
            name,
          );
        }
        for (const name of ['dashboard', 'reports', 'catalog', 'settings', 'roles', 'audit']) {
          await route(name);
          assert.equal(
            await page.evaluate('Boolean(document.querySelector("main h2"))'),
            true,
            name,
          );
        }
      },
    );
    await t.test(
      'non-admin direct navigation is denied and foreign-tenant/customer writes are rejected server-side',
      async () => {
        assert.equal(
          (
            await stack.call(
              '/v1/identity/memberships',
              'POST',
              { subject: 'forbidden', displayName: 'Forbidden member', roles: ['admin'] },
              stack.rep,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await stack.call(
              paths.customers + '/' + customerId,
              'PATCH',
              { expectedVersion: 1, name: 'Foreign overwrite' },
              stack.outsider,
            )
          ).status,
          404,
        );
        await page.navigate(stack.url + '/?role=rep#/admin/customers/' + customerId);
        await page.wait("document.body.innerText.includes('ADMIN_ACCESS_DENIED')");
        assert.equal(await page.evaluate('document.querySelectorAll("form,table").length'), 0);
      },
    );
  },
);
