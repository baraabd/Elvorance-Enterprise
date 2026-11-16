// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Local preview workflows. The Sales and Billing services enforce production rules. */
export function quoteFingerprint(quote) {
  return JSON.stringify({
    clientId: quote.clientId || '',
    repId: quote.repId || '',
    opportunityId: quote.opportunityId || '',
    items: (quote.items || []).map((item) => ({
      serviceId: item.serviceId || '',
      title: String(item.title || '').trim(),
      qty: Number(item.qty),
      price: Number(item.price),
    })),
    discount: Number(quote.discount || 0),
    baseTerms: String(quote.baseTerms || quote.terms || '').trim(),
    terms: String(quote.terms || '').trim(),
    validUntil: quote.validUntil || '',
    title: String(quote.title || '').trim(),
    notes: String(quote.notes || '').trim(),
    proposedDuration: String(quote.proposedDuration || '').trim(),
    paymentWishes: String(quote.paymentWishes || '').trim(),
    scope: quote.scopeSnapshot
      ? {
          items: (quote.scopeSnapshot.items || []).map((item) => ({
            serviceId: item.serviceId,
            title: item.title,
            qty: Number(item.qty),
            price: Number(item.price),
            features: item.features || [],
            deliverables: item.deliverables || [],
            duration: item.duration || '',
            unit: item.unit || '',
          })),
          terms: quote.scopeSnapshot.terms || '',
          proposedDuration: quote.scopeSnapshot.proposedDuration || '',
          paymentWishes: quote.scopeSnapshot.paymentWishes || '',
        }
      : null,
  });
}

export function createDemoPayments({ assert, today, getAppId }) {
  // One monetary transaction for both frontends. Amounts are checked in integer cents.
  // Previously received amounts may predate the invoice list: never recalculate them away.
  function recordInvoicePayment(next, input) {
    const invoice = next.invoices.find((row) => row.id === input.invoiceId);
    const cents = (value) => Math.round(Number(value || 0) * 100);
    const amount = Number(input.amount),
      amountCents = cents(amount);
    assert(invoice, 'الفاتورة لم تعد متاحة.');
    assert(
      Number.isFinite(amount) && amountCents > 0 && Math.abs(amount * 100 - amountCents) < 0.00001,
      'أدخل مبلغًا موجبًا بدقة منزلتين عشريتين.',
    );
    const requestId = String(input.requestId || '');
    assert(
      requestId.length >= 6 && requestId.length <= 150,
      'أعد فتح نموذج التحصيل للحصول على مرجع صالح.',
    );
    invoice.payments ||= [];
    assert(
      !invoice.payments.some((row) => row.id === requestId),
      'سبق حفظ هذه الدفعة؛ لم تُسجّل مرة ثانية.',
    );
    assert(
      amountCents <= cents(invoice.total) - cents(invoice.paid),
      'تغيّر الرصيد: المبلغ يتجاوز المتبقي في الفاتورة.',
    );
    const contract = next.contracts.find((row) => row.id === invoice.contractId);
    if (contract) {
      assert(
        amountCents <= cents(contract.total) - cents(contract.paid),
        'المبلغ يتجاوز الرصيد المتبقي في العقد.',
      );
      const plan = contract.paymentPlan || [];
      plan.forEach((part, index) => {
        part.id ||= `${contract.id}-payment-${index + 1}`;
        if (!Number.isFinite(Number(part.paid)))
          part.paid = part.status === 'paid' ? Number(part.amount) : 0;
        part.paid = Math.max(0, Math.min(Number(part.amount), Number(part.paid)));
      });
      let historical = Math.max(
        0,
        cents(contract.paid) - plan.reduce((sum, part) => sum + cents(part.paid), 0),
      );
      for (const part of plan) {
        const allocated = Math.min(historical, Math.max(0, cents(part.amount) - cents(part.paid)));
        part.paid = (cents(part.paid) + allocated) / 100;
        historical -= allocated;
      }
      let target = invoice.paymentPlanId
        ? plan.find((part) => part.id === invoice.paymentPlanId)
        : null;
      if (!target && !invoice.paymentPlanId) {
        target = plan.find(
          (part) =>
            cents(part.amount) === cents(invoice.total) && cents(part.paid) < cents(part.amount),
        );
        if (target) invoice.paymentPlanId = target.id;
      }
      if (invoice.paymentPlanId)
        assert(target, 'دفعة الفاتورة غير مرتبطة بجدول العقد؛ راجع الربط قبل التحصيل.');
      if (target) {
        assert(
          amountCents <= cents(target.amount) - cents(target.paid),
          'المبلغ يتجاوز المتبقي في دفعة العقد المرتبطة.',
        );
        target.paid = (cents(target.paid) + amountCents) / 100;
      } else {
        let remaining = amountCents;
        for (const part of plan) {
          const allocated = Math.min(remaining, Math.max(0, cents(part.amount) - cents(part.paid)));
          part.paid = (cents(part.paid) + allocated) / 100;
          remaining -= allocated;
        }
      }
      plan.forEach((part) => {
        part.status =
          cents(part.paid) >= cents(part.amount)
            ? 'paid'
            : cents(part.paid) > 0
              ? 'partial'
              : 'due';
      });
      contract.paid = (cents(contract.paid) + amountCents) / 100;
    }
    const entry = {
      id: requestId,
      amount: amountCents / 100,
      method: String(input.method || '').slice(0, 120),
      reference: String(input.reference || '').slice(0, 1000),
      actor: String(input.actor || getAppId() || 'system'),
      at: new Date().toISOString(),
    };
    invoice.payments.push(entry);
    invoice.paid = (cents(invoice.paid) + amountCents) / 100;
    invoice.status = cents(invoice.paid) >= cents(invoice.total) ? 'paid' : 'partial';
    invoice.paymentMethod = entry.method;
    invoice.notes = [
      invoice.notes,
      `${today()} · ${entry.amount} · ${entry.reference} (قيد تجريبي)`,
    ]
      .filter(Boolean)
      .join('\n');
    return entry;
  }
  return recordInvoicePayment;
}
