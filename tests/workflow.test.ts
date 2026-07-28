/**
 * اختبار السيناريو الكامل المطلوب في معايير القبول:
 * Lead → تواصل → متابعة → تأهيل → Deal → Quotation → اعتماد داخلي → قبول العميل
 * → Client → Contract → Project من قالب → Tasks → مراجعة داخلية → تعديل عميل
 * → اعتماد نهائي → Invoice → Payment → ظهور الأرقام في التقارير.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

const leads = await import('@/server/services/leads');
const deals = await import('@/server/services/deals');
const quotations = await import('@/server/services/quotations');
const contracts = await import('@/server/services/contracts');
const projects = await import('@/server/services/projects');
const tasks = await import('@/server/services/tasks');
const invoices = await import('@/server/services/invoices');
const reports = await import('@/server/services/reports');

const CEO = 'wf.ceo@bluepoint.local';
const SALES = 'wf.sales@bluepoint.local';
const OPS = 'wf.ops@bluepoint.local';
const DESIGNER = 'wf.designer@bluepoint.local';
const FINANCE = 'wf.finance@bluepoint.local';

const state = {
  leadId: '',
  dealId: '',
  quotationId: '',
  clientId: '',
  contractId: '',
  projectId: '',
  taskId: '',
  invoiceId: '',
};

beforeAll(async () => {
  await resetBusinessData();
  await createTestUser({ email: CEO, name: 'المدير التنفيذي', roleKey: 'SUPER_ADMIN' });
  await createTestUser({ email: OPS, name: 'مدير العمليات', roleKey: 'OPERATIONS_MANAGER', managerEmail: CEO });
  await createTestUser({ email: SALES, name: 'مندوب المبيعات', roleKey: 'SALES_AGENT', managerEmail: CEO });
  await createTestUser({ email: DESIGNER, name: 'المصمم', roleKey: 'GRAPHIC_DESIGNER', managerEmail: OPS });
  await createTestUser({ email: FINANCE, name: 'المالية', roleKey: 'FINANCE', managerEmail: CEO });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('١. إنشاء العميل المحتمل وإسناده', () => {
  it('يُنشأ Lead ويُسند لمندوب المبيعات', async () => {
    await actAs(SALES);
    const source = await prisma.leadSource.findFirstOrThrow({ where: { key: 'FACEBOOK' } });
    const service = await prisma.service.findFirstOrThrow({ where: { code: 'SVC-SMM' } });

    const lead = await leads.createLead({
      fullName: 'مطعم الاختبار الشامل',
      companyName: 'Test Restaurant',
      phone: '01099887766',
      email: 'workflow@example.com',
      sourceId: source.id,
      interestedServiceId: service.id,
      estimatedValue: 22000,
      currency: 'EGP',
      priority: 'HIGH',
      score: 70,
      nextFollowUpAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    } as never);

    state.leadId = lead.id;
    expect(lead.assignedToId).toBeTruthy();
    expect(lead.status).toBe('NEW');
  });
});

describe('٢. أول تواصل ومتابعة', () => {
  it('تسجيل أول تواصل يضبط firstContactAt ويحوّل الحالة إلى قيد المتابعة', async () => {
    await actAs(SALES);
    await leads.logContact(state.leadId, {
      type: 'CALL',
      subject: 'مكالمة تعريفية',
      body: 'تم شرح الباقات',
      durationMin: 15,
      outcome: 'مهتم',
      nextFollowUpAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: state.leadId } });
    expect(lead.firstContactAt).not.toBeNull();
    expect(lead.status).toBe('WORKING');

    const followUps = await prisma.followUp.findMany({ where: { leadId: state.leadId } });
    expect(followUps.length).toBeGreaterThan(0);

    const activities = await prisma.activity.findMany({
      where: { entityType: 'LEAD', entityId: state.leadId },
    });
    expect(activities.some((a) => a.type === 'CALL')).toBe(true);
  });
});

describe('٣. التأهيل وإنشاء الصفقة', () => {
  it('النقل إلى «مؤهَّل» ينشئ صفقة مرتبطة تلقائيًا', async () => {
    await actAs(SALES);
    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { pipeline: 'DEAL', key: 'QUALIFIED' },
    });

    await leads.changeLeadStage(state.leadId, {
      stageId: stage.id,
      dealValue: 22000,
      nextFollowUpAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    });

    const deal = await prisma.deal.findFirstOrThrow({ where: { leadId: state.leadId } });
    state.dealId = deal.id;
    expect(Number(deal.valueMinor)).toBe(2_200_000);

    const history = await prisma.stageHistory.findMany({ where: { dealId: deal.id } });
    expect(history.length).toBeGreaterThan(0);
  });

  it('النقل إلى «خسارة» بدون سبب مرفوض', async () => {
    await actAs(SALES);
    const lostStage = await prisma.pipelineStage.findFirstOrThrow({
      where: { pipeline: 'DEAL', isLost: true },
    });
    await expect(
      leads.changeLeadStage(state.leadId, { stageId: lostStage.id }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('٤. عرض السعر', () => {
  it('يُنشأ بترقيم تسلسلي ومجاميع صحيحة', async () => {
    await actAs(SALES);
    const service = await prisma.service.findFirstOrThrow({ where: { code: 'SVC-SMM' } });
    const tax = await prisma.taxRate.findFirstOrThrow({ where: { id: 'tax-eg-vat14' } });

    const quotation = await quotations.createQuotation({
      leadId: state.leadId,
      dealId: state.dealId,
      issueDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      currency: 'EGP',
      headerDiscountType: 'NONE',
      headerDiscountValue: 0,
      items: [
        {
          serviceId: service.id,
          nameAr: 'إدارة السوشيال ميديا',
          nameEn: 'Social Media Management',
          quantity: 1,
          unitPrice: 15000,
          discountType: 'NONE',
          discountValue: 0,
          taxRateId: tax.id,
          taxRate: 14,
        },
        {
          nameAr: 'إنتاج فيديو',
          nameEn: 'Video Production',
          quantity: 2,
          unitPrice: 3500,
          discountType: 'PERCENT',
          discountValue: 10,
          taxRateId: tax.id,
          taxRate: 14,
        },
      ],
      installments: [
        { label: 'الدفعة الأولى', percentage: 50, dueOffsetDays: 0 },
        { label: 'الدفعة الثانية', percentage: 50, dueOffsetDays: 30 },
      ],
    } as never);

    state.quotationId = quotation.id;
    expect(quotation.number).toMatch(/^BP-Q-\d{4}-\d{4}$/);

    // 15000 + (7000 − 700) = 21300 قبل الضريبة، الضريبة 14% = 2982، الإجمالي 24282
    expect(Number(quotation.subtotalMinor)).toBe(2_200_000);
    expect(Number(quotation.discountMinor)).toBe(70_000);
    expect(Number(quotation.taxMinor)).toBe(298_200);
    expect(Number(quotation.totalMinor)).toBe(2_428_200);
  });

  it('مجموع الأقساط يساوي الإجمالي بالضبط', async () => {
    const installments = await prisma.quotationInstallment.findMany({
      where: { quotationId: state.quotationId },
    });
    const sum = installments.reduce((s, i) => s + i.amountMinor, 0n);
    const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: state.quotationId } });
    expect(sum).toBe(quotation.totalMinor);
  });

  it('يرفض جدول سداد لا يساوي 100%', async () => {
    await actAs(SALES);
    await expect(
      quotations.createQuotation({
        leadId: state.leadId,
        issueDate: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 86_400_000).toISOString(),
        currency: 'EGP',
        headerDiscountType: 'NONE',
        headerDiscountValue: 0,
        items: [{ nameAr: 'بند', nameEn: 'Item', quantity: 1, unitPrice: 100, discountType: 'NONE', discountValue: 0, taxRate: 0 }],
        installments: [{ label: 'دفعة', percentage: 60, dueOffsetDays: 0 }],
      } as never),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('٥. الاعتماد الداخلي والإرسال', () => {
  it('لا يمكن الإرسال قبل الاعتماد الداخلي', async () => {
    await actAs(SALES);
    await expect(quotations.markSent(state.quotationId)).rejects.toMatchObject({ status: 400 });
  });

  it('لا يمكن للمُعِد اعتماد عرضه بنفسه', async () => {
    await actAs(SALES);
    await quotations.submitForApproval(state.quotationId);
    // المندوب لا يملك صلاحية approve أصلًا
    await expect(quotations.approveQuotation(state.quotationId, true)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('المدير يعتمد ثم يمكن الإرسال', async () => {
    await actAs(CEO);
    await quotations.approveQuotation(state.quotationId, true, 'معتمد');
    const approved = await prisma.quotation.findUniqueOrThrow({ where: { id: state.quotationId } });
    expect(approved.status).toBe('APPROVED_INTERNALLY');
    expect(approved.approvedById).toBeTruthy();

    await actAs(SALES);
    await quotations.markSent(state.quotationId);
    const sent = await prisma.quotation.findUniqueOrThrow({ where: { id: state.quotationId } });
    expect(sent.status).toBe('SENT');
    expect(sent.sentAt).not.toBeNull();
  });
});

describe('٦. قبول العميل والتحويل إلى عميل فعلي', () => {
  it('القبول يحوّل الصفقة إلى ناجحة وينشئ العميل', async () => {
    await actAs(SALES);
    const result = await quotations.decideByClient(state.quotationId, true);
    expect(result.clientId).toBeTruthy();
    state.clientId = result.clientId!;

    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: state.dealId } });
    expect(deal.status).toBe('WON');
    expect(deal.actualCloseDate).not.toBeNull();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: state.leadId } });
    expect(lead.status).toBe('CONVERTED');
    expect(lead.convertedClientId).toBe(state.clientId);

    // جهة الاتصال أُنشئت من بيانات العميل المحتمل بدون إعادة إدخال
    const contacts = await prisma.contact.findMany({ where: { clientId: state.clientId } });
    expect(contacts.length).toBe(1);
    expect(contacts[0]!.phone).toBe('01099887766');
  });

  it('التعديل بعد الإرسال ينشئ نسخة جديدة ولا يمس النسخة السابقة', async () => {
    await actAs(CEO);
    const before = await prisma.quotation.findUniqueOrThrow({
      where: { id: state.quotationId },
      include: { items: true },
    });

    const revised = await quotations.updateQuotation(state.quotationId, {
      clientId: state.clientId,
      issueDate: before.issueDate.toISOString(),
      expiryDate: before.expiryDate.toISOString(),
      currency: 'EGP',
      headerDiscountType: 'NONE',
      headerDiscountValue: 0,
      items: [
        { nameAr: 'بند معدّل', nameEn: 'Revised', quantity: 1, unitPrice: 20000, discountType: 'NONE', discountValue: 0, taxRate: 14 },
      ],
      installments: [],
    } as never);

    expect(revised.id).not.toBe(state.quotationId);
    expect(revised.version).toBe(2);

    const original = await prisma.quotation.findUniqueOrThrow({
      where: { id: state.quotationId },
      include: { items: true },
    });
    expect(original.totalMinor).toBe(before.totalMinor);
    expect(original.items.length).toBe(before.items.length);
  });
});

describe('٧. العقد', () => {
  it('يُنشأ عقد مرتبط بالعرض والعميل', async () => {
    await actAs(CEO);
    const contract = await contracts.createContract({
      title: 'عقد إدارة سوشيال ميديا',
      clientId: state.clientId,
      quotationId: state.quotationId,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      autoRenew: true,
      value: 24282,
      currency: 'EGP',
      status: 'ACTIVE',
      reminderDays: [30, 14, 7, 1],
      serviceIds: [],
    } as never);

    state.contractId = contract.id;
    expect(contract.number).toMatch(/^BP-C-\d{4}-\d{4}$/);
  });

  it('يرفض تاريخ انتهاء قبل تاريخ البداية', async () => {
    await actAs(CEO);
    await expect(
      contracts.createContract({
        title: 'عقد خاطئ',
        clientId: state.clientId,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() - 86_400_000).toISOString(),
        autoRenew: false,
        value: 1000,
        currency: 'EGP',
        status: 'DRAFT',
        reminderDays: [],
        serviceIds: [],
      } as never),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('٨. المشروع من قالب', () => {
  it('ينشئ المشروع كل المهام والاعتماديات وقوائم التحقق', async () => {
    await actAs(OPS);
    const template = await prisma.projectTemplate.findFirstOrThrow({
      where: { key: 'TPL-SMM-MONTHLY' },
      include: { tasks: true },
    });
    const designer = await prisma.user.findUniqueOrThrow({ where: { email: DESIGNER } });

    const project = await projects.createProject({
      name: 'مشروع الاختبار الشامل',
      clientId: state.clientId,
      contractId: state.contractId,
      quotationId: state.quotationId,
      dealId: state.dealId,
      templateId: template.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 35 * 86_400_000).toISOString(),
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      budget: 24282,
      currency: 'EGP',
      progressMode: 'TASKS',
      progressPercent: 0,
      memberIds: [designer.id],
      serviceIds: [],
    } as never);

    state.projectId = project.id;
    expect(project.code).toMatch(/^BP-P-\d{4}-\d{4}$/);

    const created = await prisma.task.findMany({
      where: { projectId: project.id },
      include: { checklist: true, dependencies: true },
      orderBy: { sortOrder: 'asc' },
    });
    expect(created.length).toBe(template.tasks.length);
    expect(created.some((t) => t.dependencies.length > 0)).toBe(true);
    expect(created.some((t) => t.checklist.length > 0)).toBe(true);
    expect(created.some((t) => t.requiresApproval)).toBe(true);

    state.taskId = created.find((t) => t.checklist.some((c) => c.isRequired))!.id;
  });
});

describe('٩. تنفيذ المهام وقواعد الإغلاق', () => {
  it('لا يمكن إغلاق مهمة قبل إكمال عناصر التحقق الإلزامية', async () => {
    await actAs(OPS);
    await expect(tasks.changeTaskStatus(state.taskId, 'COMPLETED')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('يمكن الإغلاق بعد إكمال العناصر الإلزامية', async () => {
    await actAs(OPS);
    const items = await prisma.checklistItem.findMany({ where: { taskId: state.taskId } });
    for (const item of items.filter((i) => i.isRequired)) {
      await tasks.toggleChecklistItem(item.id, true);
    }
    const updated = await tasks.changeTaskStatus(state.taskId, 'COMPLETED');
    expect(updated.status).toBe('COMPLETED');
  });

  it('لا يمكن بدء مهمة معطّلة باعتمادية غير مكتملة', async () => {
    await actAs(OPS);
    const blocked = await prisma.task.findFirst({
      where: {
        projectId: state.projectId,
        dependencies: { some: { dependsOn: { status: { notIn: ['COMPLETED', 'APPROVED'] } } } },
      },
    });
    expect(blocked).not.toBeNull();
    await expect(tasks.changeTaskStatus(blocked!.id, 'IN_PROGRESS')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('نسبة إنجاز المشروع تُحدَّث تلقائيًا', async () => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: state.projectId } });
    expect(project.progressPercent).toBeGreaterThan(0);
  });
});

describe('١٠. المراجعة والتعديل والاعتماد', () => {
  it('طلب تعديل من العميل يُسجَّل بمصدره ويعيد المهمة للتعديل', async () => {
    await actAs(OPS);
    const task = await prisma.task.findFirstOrThrow({
      where: { projectId: state.projectId, requiresApproval: true },
    });

    await tasks.requestRevision({
      entityType: 'TASK',
      entityId: task.id,
      source: 'CLIENT',
      description: 'العميل طلب تغيير الألوان',
    });

    const revision = await prisma.revisionRequest.findFirstOrThrow({
      where: { entityId: task.id },
    });
    expect(revision.source).toBe('CLIENT');

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe('REVISIONS_REQUIRED');
    expect(updated.delayReason).toBe('CLIENT_WAITING');
  });

  it('الاعتماد النهائي يسجّل المعتمِد ويغلق المهمة', async () => {
    await actAs(OPS);
    const task = await prisma.task.findFirstOrThrow({
      where: { projectId: state.projectId, requiresApproval: true },
    });

    await tasks.changeTaskStatus(task.id, 'WAITING_INTERNAL_REVIEW');
    const approval = await prisma.approval.findFirstOrThrow({
      where: { entityId: task.id, status: 'PENDING' },
    });

    await actAs(CEO);
    await tasks.decideApproval(approval.id, true, 'معتمد نهائيًا');

    const decided = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(decided.status).toBe('APPROVED');
    expect(decided.decidedAt).not.toBeNull();

    const closed = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(closed.status).toBe('APPROVED');
  });
});

describe('١١. الفاتورة والدفع', () => {
  it('تُنشأ الفاتورة من عرض السعر المقبول بنفس البنود', async () => {
    await actAs(FINANCE);
    const invoice = await invoices.invoiceFromQuotation(state.quotationId);
    state.invoiceId = invoice.id;

    expect(invoice.number).toMatch(/^BP-INV-\d{4}-\d{4}$/);
    const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: state.quotationId } });
    expect(invoice.totalMinor).toBe(quotation.totalMinor);
  });

  it('الدفع الجزئي يحوّل الحالة إلى «مدفوعة جزئيًا»', async () => {
    await actAs(FINANCE);
    await invoices.sendInvoice(state.invoiceId);
    await invoices.recordPayment({
      invoiceId: state.invoiceId,
      clientId: state.clientId,
      amount: 10000,
      currency: 'EGP',
      paidAt: new Date().toISOString(),
      method: 'BANK_TRANSFER',
    } as never);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: state.invoiceId } });
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(Number(invoice.paidMinor)).toBe(1_000_000);
  });

  it('يرفض دفعة تتجاوز المتبقي', async () => {
    await actAs(FINANCE);
    await expect(
      invoices.recordPayment({
        invoiceId: state.invoiceId,
        clientId: state.clientId,
        amount: 999_999,
        currency: 'EGP',
        paidAt: new Date().toISOString(),
        method: 'CASH',
      } as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('سداد المتبقي يحوّل الحالة إلى «مدفوعة»', async () => {
    await actAs(FINANCE);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: state.invoiceId } });
    const remaining = Number(invoice.totalMinor - invoice.paidMinor) / 100;

    await invoices.recordPayment({
      invoiceId: state.invoiceId,
      clientId: state.clientId,
      amount: remaining,
      currency: 'EGP',
      paidAt: new Date().toISOString(),
      method: 'INSTAPAY',
    } as never);

    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: state.invoiceId } });
    expect(paid.status).toBe('PAID');
    expect(paid.paidMinor).toBe(paid.totalMinor);
  });

  it('حذف دفعة يعيد احتساب الحالة', async () => {
    await actAs(FINANCE);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { invoiceId: state.invoiceId, deletedAt: null },
    });
    await invoices.deletePayment(payment.id);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: state.invoiceId } });
    expect(invoice.status).not.toBe('PAID');
    expect(invoice.paidMinor).toBeLessThan(invoice.totalMinor);
  });
});

describe('١٢. ظهور البيانات في التقارير', () => {
  it('تقرير المبيعات يعكس الصفقة الناجحة', async () => {
    await actAs(CEO);
    const range = reports.parseRange(
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const report = await reports.salesReport(range);

    expect(report.totals.wonCount).toBeGreaterThanOrEqual(1);
    expect(report.totals.converted).toBeGreaterThanOrEqual(1);
    expect(report.showMoney).toBe(true);
  });

  it('التقرير المالي يعكس الفوترة والتحصيل', async () => {
    await actAs(FINANCE);
    const range = reports.parseRange(
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const report = await reports.financialReport(range);

    expect(report.invoicedMinor).toBeGreaterThan(0);
    expect(report.collectedMinor).toBeGreaterThan(0);
    expect(report.showProfit).toBe(true);
  });

  it('مندوب المبيعات لا يرى ربحية المشاريع في التقرير المالي', async () => {
    await actAs(SALES);
    const range = reports.parseRange();
    await expect(reports.financialReport(range)).rejects.toMatchObject({ status: 403 });
  });

  it('تقرير العمليات يعكس المهام المكتملة', async () => {
    await actAs(OPS);
    const range = reports.parseRange(
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const report = await reports.operationsReport(range);
    expect(report.completedTasks).toBeGreaterThan(0);
  });
});

describe('١٣. سلامة السلسلة الكاملة', () => {
  it('كل الكيانات مترابطة بدون إعادة إدخال بيانات', async () => {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: state.projectId },
      include: { client: true, contract: true, quotation: true, deal: true },
    });

    expect(project.clientId).toBe(state.clientId);
    expect(project.contractId).toBe(state.contractId);
    expect(project.quotationId).toBe(state.quotationId);
    expect(project.dealId).toBe(state.dealId);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: state.invoiceId } });
    expect(invoice.clientId).toBe(state.clientId);
    expect(invoice.quotationId).toBe(state.quotationId);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: state.leadId } });
    expect(lead.convertedClientId).toBe(state.clientId);
  });

  it('سجل التدقيق غطّى كل مراحل السلسلة', async () => {
    const logs = await prisma.auditLog.findMany({ select: { module: true, action: true } });
    const modules = new Set(logs.map((l) => l.module));
    expect(modules.has('leads')).toBe(true);
    expect(modules.has('quotations')).toBe(true);
    expect(modules.has('contracts')).toBe(true);
    expect(modules.has('projects')).toBe(true);
    expect(modules.has('invoices')).toBe(true);
    expect(modules.has('payments')).toBe(true);
    expect(logs.some((l) => l.action === 'APPROVE')).toBe(true);
  });
});
