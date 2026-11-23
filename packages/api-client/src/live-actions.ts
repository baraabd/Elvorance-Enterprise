import type { CommandOptions } from './index.ts';
import type { LiveDataApi } from './live-data.ts';
import type { CommercialDetail } from './live-commercial.ts';

export class WorkspaceInputError extends Error {}
const get = (values: FormData, name: string): string => String(values.get(name) ?? '').trim();
function consent(values: FormData): void {
  if (values.get('consent') !== 'on')
    throw new WorkspaceInputError('أكّد موافقتك بعد قراءة التفاصيل قبل الإرسال.');
}
function boundedText(values: FormData, field: string, minimum: number, maximum: number): string {
  const value = get(values, field);
  if (value.length < minimum || value.length > maximum)
    throw new WorkspaceInputError('أكمل الاسم أو سبب القرار ضمن الطول المطلوب.');
  return value;
}
export async function submitCommercialAction(
  form: string,
  values: FormData,
  detail: CommercialDetail | null,
  role: 'rep' | 'client' | 'admin',
  api: LiveDataApi,
  intent: CommandOptions,
): Promise<string | null> {
  if (
    ![
      'quote-accept',
      'quote-changes',
      'quote-reject',
      'contract-approve',
      'discount-decision',
    ].includes(form)
  )
    return null;
  if (!detail) throw new WorkspaceInputError('افتح السجل وراجع تفاصيله قبل تأكيد القرار.');
  const { value, kind, approval } = detail;
  if (form === 'discount-decision') {
    if (role !== 'admin' || kind !== 'approval' || !approval || approval.status !== 'pending')
      throw new WorkspaceInputError('هذه الموافقة متاحة للإدارة على الطلبات المعلقة فقط.');
    consent(values);
    const decision = get(values, 'decision');
    if (decision !== 'approved' && decision !== 'rejected')
      throw new WorkspaceInputError('اختر الموافقة أو الرفض بعد مراجعة الطلب.');
    await api.sales.decideDiscount(
      approval.id,
      { expectedVersion: approval.version, decision, note: boundedText(values, 'note', 3, 2000) },
      intent,
    );
    return decision === 'approved'
      ? 'تم اعتماد الاستثناء لهذه النسخة من العرض.'
      : 'تم تسجيل رفض الاستثناء وسبب القرار.';
  }
  if (role !== 'client')
    throw new WorkspaceInputError('قرار قبول العرض والموافقة على العقد متاح لحساب العميل فقط.');
  if (form === 'contract-approve') {
    if (kind !== 'contract' || value.status !== 'pending')
      throw new WorkspaceInputError('حدّث العقد وتحقق من أنه ما زال بانتظار موافقتك.');
    consent(values);
    await api.sales.approveContract(
      value.id,
      {
        expectedVersion: value.version,
        consent: true,
        signerName: boundedText(values, 'signerName', 2, 150),
      },
      intent,
    );
    return 'تمت الموافقة على العقد باسمك. يمكنك متابعة المشروع والفواتير بعد تجهيزها.';
  }
  if (kind !== 'quote' || value.status !== 'sent')
    throw new WorkspaceInputError('القرارات متاحة لعرض مرسل بانتظار رد العميل.');
  if (form === 'quote-accept') {
    consent(values);
    await api.sales.acceptQuote(
      value.id,
      {
        expectedVersion: value.version,
        consent: true,
        paymentWishes: get(values, 'paymentWishes'),
      },
      intent,
    );
    return 'تم قبول العرض. انتقل إلى العقود لمراجعة العقد والموافقة عليه بشكل مستقل.';
  }
  const input = { expectedVersion: value.version, reason: boundedText(values, 'reason', 3, 3000) };
  if (form === 'quote-changes') {
    await api.sales.requestQuoteChanges(value.id, input, intent);
    return 'تم إرسال طلب التعديل إلى المندوب.';
  }
  await api.sales.rejectQuote(value.id, input, intent);
  return 'تم تسجيل رفض العرض وسببه.';
}
