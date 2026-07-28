/**
 * Seed — بيانات مرجعية إلزامية + بيانات تجريبية اختيارية.
 * البيانات التجريبية تُنشأ فقط عندما SEED_DEMO_DATA=true، وهي بيانات وهمية بالكامل.
 * لا تُستخدم بيانات عملاء حقيقيين هنا إطلاقًا.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_LABELS, ROLE_KEYS } from '../src/server/auth/permissions';
import { DEFAULT_SETTINGS } from '../src/server/services/settings';

const prisma = new PrismaClient();

const DEMO = process.env.SEED_DEMO_DATA === 'true';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@bluepoint.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'BluePoint#2026';

const day = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * day);
const daysAhead = (n: number) => new Date(Date.now() + n * day);

async function seedRoles() {
  for (const [i, key] of ROLE_KEYS.entries()) {
    const role = await prisma.role.upsert({
      where: { key },
      create: {
        key,
        nameAr: ROLE_LABELS[key].ar,
        nameEn: ROLE_LABELS[key].en,
        isSystem: true,
        sortOrder: i,
      },
      update: { nameAr: ROLE_LABELS[key].ar, nameEn: ROLE_LABELS[key].en, sortOrder: i },
    });

    // الصلاحيات الافتراضية — تُزرع مرة واحدة ثم تبقى قابلة للتعديل من الإعدادات.
    const existing = await prisma.rolePermission.count({ where: { roleId: role.id } });
    if (existing === 0) {
      const data: Prisma.RolePermissionCreateManyInput[] = [];
      for (const [module, actions, scope] of DEFAULT_ROLE_PERMISSIONS[key]) {
        for (const action of actions) data.push({ roleId: role.id, module, action, scope });
      }
      await prisma.rolePermission.createMany({ data, skipDuplicates: true });
    }
  }
  console.log(`✓ الأدوار والصلاحيات (${ROLE_KEYS.length} دور)`);
}

const DEPARTMENTS = [
  { key: 'MANAGEMENT', nameAr: 'الإدارة', nameEn: 'Management' },
  { key: 'SALES', nameAr: 'المبيعات', nameEn: 'Sales' },
  { key: 'ACCOUNTS', nameAr: 'إدارة الحسابات', nameEn: 'Account Management' },
  { key: 'CONTENT', nameAr: 'المحتوى', nameEn: 'Content' },
  { key: 'DESIGN', nameAr: 'التصميم', nameEn: 'Design' },
  { key: 'VIDEO', nameAr: 'المونتاج والإنتاج', nameEn: 'Video Production' },
  { key: 'MEDIA', nameAr: 'الميديا باينج', nameEn: 'Media Buying' },
  { key: 'FINANCE', nameAr: 'المالية', nameEn: 'Finance' },
];

async function seedReference() {
  for (const [i, d] of DEPARTMENTS.entries()) {
    await prisma.department.upsert({
      where: { key: d.key },
      create: { ...d, sortOrder: i },
      update: { nameAr: d.nameAr, nameEn: d.nameEn },
    });
  }

  const currencies = [
    { code: 'EGP', nameAr: 'جنيه مصري', nameEn: 'Egyptian Pound', symbolAr: 'ج.م', symbolEn: 'EGP', isBase: true, sortOrder: 0 },
    { code: 'SAR', nameAr: 'ريال سعودي', nameEn: 'Saudi Riyal', symbolAr: 'ر.س', symbolEn: 'SAR', sortOrder: 1 },
    { code: 'USD', nameAr: 'دولار أمريكي', nameEn: 'US Dollar', symbolAr: '$', symbolEn: 'USD', sortOrder: 2 },
    { code: 'AED', nameAr: 'درهم إماراتي', nameEn: 'UAE Dirham', symbolAr: 'د.إ', symbolEn: 'AED', sortOrder: 3 },
  ];
  for (const c of currencies) {
    await prisma.currency.upsert({ where: { code: c.code }, create: c, update: c });
  }

  const countries = [
    { code: 'EG', nameAr: 'مصر', nameEn: 'Egypt', dialCode: '+20', defaultCurrency: 'EGP' },
    { code: 'SA', nameAr: 'السعودية', nameEn: 'Saudi Arabia', dialCode: '+966', defaultCurrency: 'SAR' },
    { code: 'AE', nameAr: 'الإمارات', nameEn: 'UAE', dialCode: '+971', defaultCurrency: 'AED' },
    { code: 'KW', nameAr: 'الكويت', nameEn: 'Kuwait', dialCode: '+965', defaultCurrency: 'USD' },
  ];
  for (const c of countries) {
    await prisma.country.upsert({ where: { code: c.code }, create: c, update: c });
  }

  // الضرائب قابلة للتكوين ولا توجد نسبة ثابتة داخل الكود.
  const taxes = [
    { id: 'tax-eg-vat14', nameAr: 'ضريبة القيمة المضافة ١٤٪', nameEn: 'VAT 14%', rate: '14', countryCode: 'EG', isDefault: true },
    { id: 'tax-eg-none', nameAr: 'بدون ضريبة', nameEn: 'No tax', rate: '0', countryCode: 'EG', isDefault: false },
    { id: 'tax-sa-vat15', nameAr: 'ضريبة القيمة المضافة ١٥٪', nameEn: 'VAT 15%', rate: '15', countryCode: 'SA', isDefault: false },
  ];
  for (const t of taxes) {
    await prisma.taxRate.upsert({
      where: { id: t.id },
      create: { ...t, rate: t.rate },
      update: { nameAr: t.nameAr, rate: t.rate },
    });
  }

  const dealStages = [
    { key: 'NEW', nameAr: 'عميل جديد', nameEn: 'New Lead', probability: '5', color: '#60A5FA' },
    { key: 'CONTACTED', nameAr: 'تم التواصل', nameEn: 'Contacted', probability: '15', color: '#3FC8F5' },
    { key: 'QUALIFIED', nameAr: 'مؤهَّل', nameEn: 'Qualified', probability: '30', color: '#2C7BE5' },
    { key: 'MEETING', nameAr: 'اجتماع محدد', nameEn: 'Meeting Scheduled', probability: '45', color: '#7C6BF5' },
    { key: 'PROPOSAL', nameAr: 'طلب عرض سعر', nameEn: 'Proposal Requested', probability: '55', color: '#A855F7' },
    { key: 'QUOTATION_SENT', nameAr: 'تم إرسال العرض', nameEn: 'Quotation Sent', probability: '65', color: '#F5B041' },
    { key: 'NEGOTIATION', nameAr: 'تفاوض', nameEn: 'Negotiation', probability: '80', color: '#F59E0B' },
    { key: 'FOLLOW_UP_LATER', nameAr: 'متابعة لاحقًا', nameEn: 'Follow-up Later', probability: '20', color: '#94A3B8' },
    { key: 'WON', nameAr: 'تم الفوز', nameEn: 'Won', probability: '100', color: '#22C57A', isWon: true },
    { key: 'LOST', nameAr: 'خسارة', nameEn: 'Lost', probability: '0', color: '#F44E58', isLost: true },
  ];
  for (const [i, s] of dealStages.entries()) {
    await prisma.pipelineStage.upsert({
      where: { pipeline_key: { pipeline: 'DEAL', key: s.key } },
      create: { ...s, pipeline: 'DEAL', sortOrder: i },
      update: { nameAr: s.nameAr, nameEn: s.nameEn, sortOrder: i, probability: s.probability },
    });
  }

  const sources = [
    { key: 'FACEBOOK', nameAr: 'فيسبوك', nameEn: 'Facebook' },
    { key: 'INSTAGRAM', nameAr: 'إنستجرام', nameEn: 'Instagram' },
    { key: 'TIKTOK', nameAr: 'تيك توك', nameEn: 'TikTok' },
    { key: 'GOOGLE', nameAr: 'جوجل', nameEn: 'Google' },
    { key: 'REFERRAL', nameAr: 'ترشيح عميل', nameEn: 'Referral' },
    { key: 'WEBSITE', nameAr: 'الموقع الإلكتروني', nameEn: 'Website' },
    { key: 'WHATSAPP', nameAr: 'واتساب', nameEn: 'WhatsApp' },
    { key: 'EVENT', nameAr: 'فعالية أو معرض', nameEn: 'Event' },
    { key: 'OUTBOUND', nameAr: 'تواصل مباشر', nameEn: 'Outbound' },
  ];
  for (const [i, s] of sources.entries()) {
    await prisma.leadSource.upsert({
      where: { key: s.key },
      create: { ...s, sortOrder: i },
      update: { nameAr: s.nameAr, nameEn: s.nameEn },
    });
  }

  const lossReasons = [
    { key: 'PRICE', nameAr: 'السعر مرتفع', nameEn: 'Price too high' },
    { key: 'COMPETITOR', nameAr: 'اختار منافسًا', nameEn: 'Chose a competitor' },
    { key: 'NO_BUDGET', nameAr: 'لا توجد ميزانية', nameEn: 'No budget' },
    { key: 'TIMING', nameAr: 'التوقيت غير مناسب', nameEn: 'Bad timing' },
    { key: 'NO_RESPONSE', nameAr: 'لا يوجد رد', nameEn: 'No response' },
    { key: 'IN_HOUSE', nameAr: 'سينفذ داخليًا', nameEn: 'Handled in-house' },
    { key: 'NOT_QUALIFIED', nameAr: 'غير مؤهل', nameEn: 'Not qualified' },
  ];
  for (const r of lossReasons) {
    await prisma.lossReason.upsert({ where: { key: r.key }, create: r, update: r });
  }

  await prisma.numberSequence.upsert({
    where: { key: 'QUOTATION' },
    create: { key: 'QUOTATION', prefix: 'BP-Q', year: new Date().getUTCFullYear() },
    update: {},
  });
  await prisma.numberSequence.upsert({
    where: { key: 'INVOICE' },
    create: { key: 'INVOICE', prefix: 'BP-INV', year: new Date().getUTCFullYear() },
    update: {},
  });
  await prisma.numberSequence.upsert({
    where: { key: 'CONTRACT' },
    create: { key: 'CONTRACT', prefix: 'BP-C', year: new Date().getUTCFullYear() },
    update: {},
  });
  await prisma.numberSequence.upsert({
    where: { key: 'PROJECT' },
    create: { key: 'PROJECT', prefix: 'BP-P', year: new Date().getUTCFullYear() },
    update: {},
  });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, category: key, value: value as object },
      update: {},
    });
  }

  console.log('✓ البيانات المرجعية (أقسام، عملات، دول، ضرائب، مراحل، مصادر، إعدادات)');
}

const SERVICES = [
  { code: 'SVC-STRATEGY', nameAr: 'استراتيجية تسويقية', nameEn: 'Marketing Strategy', price: 2500000, billingType: 'ONE_TIME', departments: ['MANAGEMENT', 'CONTENT'] },
  { code: 'SVC-SMM', nameAr: 'إدارة السوشيال ميديا', nameEn: 'Social Media Management', price: 1500000, billingType: 'MONTHLY_RETAINER', departments: ['CONTENT', 'DESIGN'] },
  { code: 'SVC-CONTENT', nameAr: 'صناعة المحتوى', nameEn: 'Content Creation', price: 800000, billingType: 'MONTHLY_RETAINER', departments: ['CONTENT'] },
  { code: 'SVC-DESIGN', nameAr: 'تصميم جرافيك', nameEn: 'Graphic Design', price: 600000, billingType: 'ONE_TIME', departments: ['DESIGN'] },
  { code: 'SVC-VIDEO', nameAr: 'إنتاج فيديو', nameEn: 'Video Production', price: 2000000, billingType: 'ONE_TIME', departments: ['VIDEO'] },
  { code: 'SVC-MEDIA', nameAr: 'إدارة الحملات الإعلانية', nameEn: 'Media Buying', price: 1200000, billingType: 'MONTHLY_RETAINER', departments: ['MEDIA'] },
  { code: 'SVC-BRANDING', nameAr: 'العلامة الشخصية', nameEn: 'Personal Branding', price: 1800000, billingType: 'ONE_TIME', departments: ['CONTENT', 'DESIGN'] },
  { code: 'SVC-CRM', nameAr: 'أنظمة CRM ولوحات تحكم', nameEn: 'CRM & Dashboards', price: 5000000, billingType: 'ONE_TIME', departments: ['MANAGEMENT'] },
  { code: 'SVC-CONSULT', nameAr: 'استشارات تسويقية', nameEn: 'Consulting', price: 300000, billingType: 'HOURLY', departments: ['MANAGEMENT'] },
  { code: 'SVC-CUSTOM', nameAr: 'خدمة مخصصة', nameEn: 'Custom Service', price: 0, billingType: 'ONE_TIME', departments: ['MANAGEMENT'] },
];

async function seedServices() {
  for (const [i, s] of SERVICES.entries()) {
    await prisma.service.upsert({
      where: { code: s.code },
      create: {
        code: s.code,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        basePriceMinor: BigInt(s.price),
        currency: 'EGP',
        billingType: s.billingType as never,
        departmentKeys: s.departments,
        defaultTaxRateId: 'tax-eg-vat14',
        sortOrder: i,
      },
      update: { nameAr: s.nameAr, nameEn: s.nameEn, sortOrder: i },
    });
  }

  const smm = await prisma.service.findUnique({ where: { code: 'SVC-SMM' } });
  if (smm) {
    const deliverables = [
      { nameAr: '١٦ بوست شهريًا', nameEn: '16 posts / month', quantity: 16 },
      { nameAr: '٨ ريلز شهريًا', nameEn: '8 reels / month', quantity: 8 },
      { nameAr: 'خطة محتوى شهرية', nameEn: 'Monthly content plan', quantity: 1 },
      { nameAr: 'تقرير أداء شهري', nameEn: 'Monthly performance report', quantity: 1 },
    ];
    for (const [i, d] of deliverables.entries()) {
      const exists = await prisma.serviceDeliverable.findFirst({
        where: { serviceId: smm.id, nameEn: d.nameEn },
      });
      if (!exists) {
        await prisma.serviceDeliverable.create({
          data: { serviceId: smm.id, ...d, sortOrder: i },
        });
      }
    }
  }
  console.log(`✓ كتالوج الخدمات (${SERVICES.length} خدمة)`);
}

async function seedTemplates() {
  const smm = await prisma.service.findUnique({ where: { code: 'SVC-SMM' } });
  const template = await prisma.projectTemplate.upsert({
    where: { key: 'TPL-SMM-MONTHLY' },
    create: {
      key: 'TPL-SMM-MONTHLY',
      nameAr: 'دورة إدارة سوشيال ميديا شهرية',
      nameEn: 'Monthly Social Media Cycle',
      description: 'قالب دورة العمل الشهرية الكاملة لإدارة حسابات التواصل الاجتماعي.',
      serviceId: smm?.id,
    },
    update: {},
  });

  const tasks = [
    { titleAr: 'تهيئة العميل (Onboarding)', titleEn: 'Client onboarding', dept: 'ACCOUNTS', role: 'ACCOUNT_MANAGER', start: 0, due: 2, checklist: ['استلام الأصول', 'تأكيد جهات الاتصال', 'تحديد قنوات التواصل'] },
    { titleAr: 'جمع البريف', titleEn: 'Brief collection', dept: 'ACCOUNTS', role: 'ACCOUNT_MANAGER', start: 1, due: 3, dep: 0, checklist: ['أهداف العميل', 'الجمهور المستهدف', 'نبرة الصوت'] },
    { titleAr: 'تحليل المنافسين', titleEn: 'Competitor analysis', dept: 'CONTENT', role: 'CONTENT_CREATOR', start: 3, due: 6, dep: 1 },
    { titleAr: 'الاستراتيجية', titleEn: 'Strategy', dept: 'MANAGEMENT', role: 'OPERATIONS_MANAGER', start: 5, due: 8, dep: 2, approval: true },
    { titleAr: 'خطة المحتوى الشهرية', titleEn: 'Monthly content plan', dept: 'CONTENT', role: 'CONTENT_CREATOR', start: 8, due: 12, dep: 3, checklist: ['تقويم النشر', 'المواضيع', 'الهاشتاجات'] },
    { titleAr: 'كتابة النصوص', titleEn: 'Copywriting', dept: 'CONTENT', role: 'CONTENT_CREATOR', start: 12, due: 16, dep: 4 },
    { titleAr: 'مراجعة المحتوى الداخلية', titleEn: 'Internal content review', dept: 'MANAGEMENT', role: 'OPERATIONS_MANAGER', start: 16, due: 17, dep: 5, approval: true },
    { titleAr: 'التصميم', titleEn: 'Design', dept: 'DESIGN', role: 'GRAPHIC_DESIGNER', start: 17, due: 22, dep: 6 },
    { titleAr: 'إنتاج الفيديو', titleEn: 'Video production', dept: 'VIDEO', role: 'VIDEO_EDITOR', start: 17, due: 23, dep: 6 },
    { titleAr: 'المراجعة الإبداعية الداخلية', titleEn: 'Internal creative review', dept: 'MANAGEMENT', role: 'OPERATIONS_MANAGER', start: 23, due: 24, dep: 8, approval: true },
    { titleAr: 'مراجعة العميل', titleEn: 'Client review', dept: 'ACCOUNTS', role: 'ACCOUNT_MANAGER', start: 24, due: 26, dep: 9 },
    { titleAr: 'تعديلات العميل', titleEn: 'Client revisions', dept: 'DESIGN', role: 'GRAPHIC_DESIGNER', start: 26, due: 28, dep: 10 },
    { titleAr: 'الاعتماد النهائي', titleEn: 'Final approval', dept: 'ACCOUNTS', role: 'ACCOUNT_MANAGER', start: 28, due: 29, dep: 11, approval: true },
    { titleAr: 'جدولة المنشورات', titleEn: 'Scheduling', dept: 'CONTENT', role: 'CONTENT_CREATOR', start: 29, due: 30, dep: 12 },
    { titleAr: 'النشر', titleEn: 'Publishing', dept: 'CONTENT', role: 'CONTENT_CREATOR', start: 30, due: 31, dep: 13 },
    { titleAr: 'التقرير الشهري', titleEn: 'Monthly report', dept: 'MEDIA', role: 'MEDIA_BUYER', start: 30, due: 32, dep: 14 },
    { titleAr: 'متابعة التجديد', titleEn: 'Renewal follow-up', dept: 'SALES', role: 'ACCOUNT_MANAGER', start: 32, due: 34, dep: 15 },
  ];

  const count = await prisma.templateTask.count({ where: { templateId: template.id } });
  if (count === 0) {
    await prisma.templateTask.createMany({
      data: tasks.map((t, i) => ({
        templateId: template.id,
        orderIndex: i,
        titleAr: t.titleAr,
        titleEn: t.titleEn,
        departmentKey: t.dept,
        assigneeRoleKey: t.role,
        offsetStartDays: t.start,
        offsetDueDays: t.due,
        requiresApproval: t.approval ?? false,
        dependsOnIndex: t.dep ?? null,
        checklist: (t.checklist ?? []) as object,
      })),
    });
  }
  console.log(`✓ قوالب المشاريع (${tasks.length} مهمة في قالب السوشيال ميديا)`);
}

interface DemoUser {
  email: string;
  name: string;
  nameEn: string;
  role: string;
  dept: string;
  jobTitle: string;
  managerEmail?: string;
}

const DEMO_USERS: DemoUser[] = [
  { email: 'ceo@bluepoint.local', name: 'شريف صقر', nameEn: 'Sherif Sakr', role: 'SUPER_ADMIN', dept: 'MANAGEMENT', jobTitle: 'المدير التنفيذي' },
  { email: 'ops@bluepoint.local', name: 'منى عبد الرحمن', nameEn: 'Mona Abdelrahman', role: 'OPERATIONS_MANAGER', dept: 'MANAGEMENT', jobTitle: 'مدير العمليات', managerEmail: 'ceo@bluepoint.local' },
  { email: 'sales.manager@bluepoint.local', name: 'كريم فؤاد', nameEn: 'Karim Fouad', role: 'SALES_MANAGER', dept: 'SALES', jobTitle: 'مدير المبيعات', managerEmail: 'ceo@bluepoint.local' },
  { email: 'sales1@bluepoint.local', name: 'أحمد مصطفى', nameEn: 'Ahmed Mostafa', role: 'SALES_AGENT', dept: 'SALES', jobTitle: 'مندوب مبيعات', managerEmail: 'sales.manager@bluepoint.local' },
  { email: 'sales2@bluepoint.local', name: 'نورهان سامي', nameEn: 'Nourhan Samy', role: 'SALES_AGENT', dept: 'SALES', jobTitle: 'مندوب مبيعات', managerEmail: 'sales.manager@bluepoint.local' },
  { email: 'am@bluepoint.local', name: 'ياسمين حسن', nameEn: 'Yasmin Hassan', role: 'ACCOUNT_MANAGER', dept: 'ACCOUNTS', jobTitle: 'مدير حسابات', managerEmail: 'ops@bluepoint.local' },
  { email: 'content@bluepoint.local', name: 'محمود عادل', nameEn: 'Mahmoud Adel', role: 'CONTENT_CREATOR', dept: 'CONTENT', jobTitle: 'صانع محتوى', managerEmail: 'ops@bluepoint.local' },
  { email: 'design@bluepoint.local', name: 'سارة إبراهيم', nameEn: 'Sara Ibrahim', role: 'GRAPHIC_DESIGNER', dept: 'DESIGN', jobTitle: 'مصممة جرافيك', managerEmail: 'ops@bluepoint.local' },
  { email: 'video@bluepoint.local', name: 'عمر خالد', nameEn: 'Omar Khaled', role: 'VIDEO_EDITOR', dept: 'VIDEO', jobTitle: 'مونتير', managerEmail: 'ops@bluepoint.local' },
  { email: 'media@bluepoint.local', name: 'هدير سعيد', nameEn: 'Hadeer Saeed', role: 'MEDIA_BUYER', dept: 'MEDIA', jobTitle: 'ميديا باير', managerEmail: 'ops@bluepoint.local' },
  { email: 'finance@bluepoint.local', name: 'طارق منير', nameEn: 'Tarek Mounir', role: 'FINANCE', dept: 'FINANCE', jobTitle: 'المدير المالي', managerEmail: 'ceo@bluepoint.local' },
  { email: 'viewer@bluepoint.local', name: 'مراقب النظام', nameEn: 'System Viewer', role: 'VIEWER', dept: 'MANAGEMENT', jobTitle: 'مشاهدة فقط', managerEmail: 'ceo@bluepoint.local' },
];

async function seedUsers() {
  const superAdmin = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const adminHash = await hashPassword(ADMIN_PASSWORD);

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      name: 'مدير النظام',
      nameEn: 'System Administrator',
      roleId: superAdmin.id,
      jobTitle: 'Super Admin',
      // في الإنتاج يجب تغيير كلمة المرور عند أول دخول.
      mustResetPassword: process.env.NODE_ENV === 'production',
    },
    update: {},
  });
  console.log(`✓ حساب المسؤول: ${ADMIN_EMAIL}`);

  if (!DEMO) return;

  const demoHash = await hashPassword('Demo#2026Pass');
  for (const u of DEMO_USERS) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: u.role } });
    const dept = await prisma.department.findUnique({ where: { key: u.dept } });
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        passwordHash: demoHash,
        name: u.name,
        nameEn: u.nameEn,
        roleId: role.id,
        departmentId: dept?.id,
        jobTitle: u.jobTitle,
        salesTargetMinor: u.role.startsWith('SALES') ? BigInt(30_000_00) : BigInt(0),
      },
      update: { roleId: role.id, departmentId: dept?.id },
    });
  }
  // ربط المديرين بعد إنشاء الجميع
  for (const u of DEMO_USERS) {
    if (!u.managerEmail) continue;
    const manager = await prisma.user.findUnique({ where: { email: u.managerEmail } });
    if (manager) {
      await prisma.user.update({ where: { email: u.email }, data: { managerId: manager.id } });
    }
  }
  console.log(`✓ حسابات تجريبية (${DEMO_USERS.length} مستخدم) — كلمة المرور: Demo#2026Pass`);
}

async function seedDemoBusinessData() {
  if (!DEMO) return;
  const existing = await prisma.lead.count();
  if (existing > 0) {
    console.log('• البيانات التجريبية موجودة بالفعل — تم التخطي');
    return;
  }

  const users = Object.fromEntries(
    (await prisma.user.findMany({ select: { id: true, email: true } })).map((u) => [u.email, u.id]),
  );
  const stages = Object.fromEntries(
    (await prisma.pipelineStage.findMany({ where: { pipeline: 'DEAL' } })).map((s) => [s.key, s.id]),
  );
  const sources = Object.fromEntries(
    (await prisma.leadSource.findMany()).map((s) => [s.key, s.id]),
  );
  const services = Object.fromEntries(
    (await prisma.service.findMany()).map((s) => [s.code, s.id]),
  );
  const lossReasons = Object.fromEntries(
    (await prisma.lossReason.findMany()).map((r) => [r.key, r.id]),
  );

  const sales1 = users['sales1@bluepoint.local']!;
  const sales2 = users['sales2@bluepoint.local']!;
  const am = users['am@bluepoint.local']!;
  const ops = users['ops@bluepoint.local']!;
  const finance = users['finance@bluepoint.local']!;

  // ── Leads ────────────────────────────────────────────────
  const leadSpecs = [
    { fullName: 'مطعم البحر الأزرق', company: 'Blue Sea Restaurant', phone: '01012345678', source: 'FACEBOOK', service: 'SVC-SMM', value: 1800000, owner: sales1, status: 'WORKING', stage: 'CONTACTED', city: 'القاهرة' },
    { fullName: 'عيادة سمايل دنتال', company: 'Smile Dental Clinic', phone: '01123456789', source: 'INSTAGRAM', service: 'SVC-SMM', value: 2200000, owner: sales1, status: 'QUALIFIED', stage: 'QUALIFIED', city: 'الجيزة' },
    { fullName: 'أكاديمية نكست ستيب', company: 'Next Step Academy', phone: '01234567890', source: 'GOOGLE', service: 'SVC-MEDIA', value: 3500000, owner: sales2, status: 'WORKING', stage: 'MEETING', city: 'الإسكندرية' },
    { fullName: 'متجر أناقة', company: 'Anaqa Store', phone: '01098765432', source: 'TIKTOK', service: 'SVC-CONTENT', value: 900000, owner: sales2, status: 'NEW', stage: 'NEW', city: 'المنصورة' },
    { fullName: 'شركة النور للعقارات', company: 'Al Nour Real Estate', phone: '01555443322', source: 'REFERRAL', service: 'SVC-CRM', value: 6000000, owner: sales1, status: 'WORKING', stage: 'NEGOTIATION', city: 'القاهرة الجديدة' },
    { fullName: 'جيم باور فيت', company: 'Power Fit Gym', phone: '01277889900', source: 'WHATSAPP', service: 'SVC-VIDEO', value: 2500000, owner: sales2, status: 'LOST', stage: 'LOST', city: 'طنطا', loss: 'PRICE' },
    { fullName: 'مؤسسة إشراق التعليمية', company: 'Ishraq Education', phone: '01033221100', source: 'WEBSITE', service: 'SVC-STRATEGY', value: 2800000, owner: sales1, status: 'NEW', stage: 'NEW', city: 'القاهرة' },
    { fullName: 'كافيه لاونج ٧٧', company: 'Lounge 77 Cafe', phone: '01199887766', source: 'EVENT', service: 'SVC-DESIGN', value: 700000, owner: sales2, status: 'WORKING', stage: 'QUOTATION_SENT', city: 'الشيخ زايد' },
  ];

  const leadIds: Record<string, string> = {};
  for (const [i, spec] of leadSpecs.entries()) {
    const lead = await prisma.lead.create({
      data: {
        fullName: spec.fullName,
        companyName: spec.company,
        phone: spec.phone,
        phoneNormalized: `20${spec.phone.slice(1)}`,
        whatsapp: spec.phone,
        email: `contact${i + 1}@example.com`,
        emailNormalized: `contact${i + 1}@example.com`,
        countryCode: 'EG',
        city: spec.city,
        sourceId: sources[spec.source],
        campaign: spec.source === 'FACEBOOK' ? 'Ramadan Offer 2026' : undefined,
        interestedServiceId: services[spec.service],
        estimatedValueMinor: BigInt(spec.value),
        assignedToId: spec.owner,
        status: spec.status as never,
        stageId: stages[spec.stage],
        score: 40 + i * 6,
        priority: i % 3 === 0 ? 'HIGH' : 'MEDIUM',
        firstContactAt: spec.status === 'NEW' ? null : daysAgo(20 - i),
        lastContactAt: spec.status === 'NEW' ? null : daysAgo(3),
        nextFollowUpAt: ['NEW', 'WORKING', 'QUALIFIED'].includes(spec.status)
          ? daysAhead(i % 4 === 0 ? -1 : 2)
          : null,
        expectedCloseDate: daysAhead(20 - i),
        lossReasonId: spec.loss ? lossReasons[spec.loss] : null,
        createdById: spec.owner,
      },
    });
    leadIds[spec.company] = lead.id;

    await prisma.activity.create({
      data: {
        entityType: 'LEAD',
        entityId: lead.id,
        type: 'SYSTEM',
        subject: 'تم إنشاء العميل المحتمل',
        userId: spec.owner,
        occurredAt: daysAgo(21 - i),
      },
    });
    if (spec.status !== 'NEW') {
      await prisma.activity.create({
        data: {
          entityType: 'LEAD',
          entityId: lead.id,
          type: 'CALL',
          subject: 'مكالمة تعريفية',
          body: 'تم شرح الخدمات والباقات وتحديد الاحتياج المبدئي.',
          durationMin: 12,
          outcome: 'مهتم',
          userId: spec.owner,
          occurredAt: daysAgo(20 - i),
        },
      });
      await prisma.followUp.create({
        data: {
          leadId: lead.id,
          title: 'متابعة العرض المقدَّم',
          dueAt: daysAhead(i % 4 === 0 ? -1 : 2),
          assignedToId: spec.owner,
          status: 'PENDING',
          createdById: spec.owner,
        },
      });
    }
  }

  // ── Clients ──────────────────────────────────────────────
  const clientSpecs = [
    { legalName: 'شركة سمايل دنتال للرعاية الصحية', brand: 'Smile Dental', industry: 'رعاية صحية', city: 'الجيزة', am, sales: sales1 },
    { legalName: 'مؤسسة نكست ستيب للتدريب', brand: 'Next Step', industry: 'تعليم وتدريب', city: 'الإسكندرية', am, sales: sales2 },
    { legalName: 'شركة النور للتطوير العقاري', brand: 'Al Nour', industry: 'عقارات', city: 'القاهرة الجديدة', am, sales: sales1 },
  ];
  const clientIds: string[] = [];
  for (const [i, c] of clientSpecs.entries()) {
    const client = await prisma.client.create({
      data: {
        legalName: c.legalName,
        brandName: c.brand,
        type: 'COMPANY',
        industry: c.industry,
        countryCode: 'EG',
        city: c.city,
        currency: 'EGP',
        accountManagerId: c.am,
        salesOwnerId: c.sales,
        status: 'ACTIVE',
        satisfaction: 4,
        onboardedAt: daysAgo(90 - i * 20),
        renewalDate: daysAhead(20 + i * 15),
        lastContactAt: daysAgo(4 + i),
        contacts: {
          create: [
            {
              name: `مسؤول التسويق - ${c.brand}`,
              position: 'مدير تسويق',
              type: 'DECISION_MAKER',
              phone: `0100000000${i}`,
              email: `marketing${i}@example.com`,
              isPrimary: true,
            },
            {
              name: `المسؤول المالي - ${c.brand}`,
              position: 'محاسب',
              type: 'FINANCE',
              phone: `0111111111${i}`,
              email: `finance${i}@example.com`,
            },
          ],
        },
      },
    });
    clientIds.push(client.id);
  }

  // ── Deals ────────────────────────────────────────────────
  const dealSpecs = [
    { title: 'باقة سوشيال ميديا - Smile Dental', client: 0, value: 2200000, stage: 'WON', status: 'WON', owner: sales1, service: 'SVC-SMM' },
    { title: 'حملات إعلانية - Next Step', client: 1, value: 3500000, stage: 'NEGOTIATION', status: 'OPEN', owner: sales2, service: 'SVC-MEDIA' },
    { title: 'نظام CRM - Al Nour', client: 2, value: 6000000, stage: 'QUOTATION_SENT', status: 'OPEN', owner: sales1, service: 'SVC-CRM' },
    { title: 'إنتاج فيديو - Power Fit', client: null, value: 2500000, stage: 'LOST', status: 'LOST', owner: sales2, service: 'SVC-VIDEO' },
  ];
  const dealIds: string[] = [];
  for (const d of dealSpecs) {
    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { pipeline: 'DEAL', key: d.stage },
    });
    const deal = await prisma.deal.create({
      data: {
        title: d.title,
        clientId: d.client !== null ? clientIds[d.client] : null,
        serviceId: services[d.service],
        valueMinor: BigInt(d.value),
        currency: 'EGP',
        probability: stage.probability,
        stageId: stage.id,
        status: d.status as never,
        ownerId: d.owner,
        expectedCloseDate: daysAhead(15),
        actualCloseDate: d.status === 'WON' ? daysAgo(30) : null,
        lossReasonId: d.status === 'LOST' ? lossReasons['PRICE'] : null,
        createdById: d.owner,
      },
    });
    dealIds.push(deal.id);
    await prisma.stageHistory.create({
      data: { dealId: deal.id, toStageId: stage.id, movedById: d.owner, movedAt: daysAgo(10) },
    });
  }

  // ── Projects من القالب ───────────────────────────────────
  const template = await prisma.projectTemplate.findUniqueOrThrow({
    where: { key: 'TPL-SMM-MONTHLY' },
    include: { tasks: { orderBy: { orderIndex: 'asc' } } },
  });
  const deptMap = Object.fromEntries(
    (await prisma.department.findMany()).map((d) => [d.key, d.id]),
  );
  const roleUser: Record<string, string> = {
    ACCOUNT_MANAGER: am,
    CONTENT_CREATOR: users['content@bluepoint.local']!,
    GRAPHIC_DESIGNER: users['design@bluepoint.local']!,
    VIDEO_EDITOR: users['video@bluepoint.local']!,
    MEDIA_BUYER: users['media@bluepoint.local']!,
    OPERATIONS_MANAGER: ops,
  };

  const project = await prisma.project.create({
    data: {
      code: 'BP-P-2026-0001',
      name: 'إدارة السوشيال ميديا - Smile Dental (يوليو)',
      clientId: clientIds[0]!,
      dealId: dealIds[0],
      ownerId: ops,
      accountManagerId: am,
      templateId: template.id,
      startDate: daysAgo(18),
      endDate: daysAhead(12),
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      budgetMinor: BigInt(2200000),
      progressMode: 'TASKS',
      members: {
        create: [
          { userId: am, roleLabel: 'مدير الحساب' },
          { userId: roleUser.CONTENT_CREATOR!, roleLabel: 'محتوى' },
          { userId: roleUser.GRAPHIC_DESIGNER!, roleLabel: 'تصميم' },
          { userId: roleUser.VIDEO_EDITOR!, roleLabel: 'مونتاج' },
        ],
      },
      services: { create: [{ serviceId: services['SVC-SMM']! }] },
      deliverables: {
        create: [
          { name: 'خطة المحتوى - يوليو', status: 'APPROVED', dueDate: daysAgo(6) },
          { name: 'تصاميم الأسبوع الثالث', status: 'CLIENT_REVIEW', dueDate: daysAhead(2) },
          { name: 'ريلز المنتجات', status: 'IN_PRODUCTION', dueDate: daysAhead(6) },
        ],
      },
    },
  });

  const createdTasks: string[] = [];
  for (const [i, t] of template.tasks.entries()) {
    const assignee = t.assigneeRoleKey ? roleUser[t.assigneeRoleKey] : undefined;
    const status =
      i < 7 ? 'COMPLETED' : i === 7 ? 'IN_PROGRESS' : i === 8 ? 'WAITING_INTERNAL_REVIEW' : 'TODO';
    const task = await prisma.task.create({
      data: {
        title: t.titleAr,
        projectId: project.id,
        clientId: clientIds[0],
        departmentId: t.departmentKey ? deptMap[t.departmentKey] : null,
        creatorId: ops,
        reviewerId: t.requiresApproval ? ops : null,
        requiresApproval: t.requiresApproval,
        priority: t.priority,
        status: status as never,
        startDate: new Date(daysAgo(18).getTime() + t.offsetStartDays * day),
        dueDate: new Date(daysAgo(18).getTime() + t.offsetDueDays * day),
        completedAt: status === 'COMPLETED' ? daysAgo(18 - t.offsetDueDays) : null,
        estimateMinutes: 120,
        actualMinutes: status === 'COMPLETED' ? 135 : 0,
        sortOrder: i,
        assignees: assignee ? { create: [{ userId: assignee }] } : undefined,
        checklist: {
          create: ((t.checklist as string[]) ?? []).map((c, ci) => ({
            title: c,
            isRequired: ci === 0,
            isDone: status === 'COMPLETED',
          })),
        },
      },
    });
    createdTasks.push(task.id);
  }
  for (const [i, t] of template.tasks.entries()) {
    if (t.dependsOnIndex === null || t.dependsOnIndex === undefined) continue;
    await prisma.taskDependency.create({
      data: { taskId: createdTasks[i]!, dependsOnTaskId: createdTasks[t.dependsOnIndex]! },
    });
  }
  const doneCount = await prisma.task.count({
    where: { projectId: project.id, status: 'COMPLETED' },
  });
  const totalCount = await prisma.task.count({ where: { projectId: project.id } });
  await prisma.project.update({
    where: { id: project.id },
    data: { progressPercent: Math.round((doneCount / totalCount) * 100) },
  });

  // ── Revision + Approval ──────────────────────────────────
  await prisma.revisionRequest.create({
    data: {
      entityType: 'TASK',
      entityId: createdTasks[7]!,
      source: 'CLIENT',
      description: 'العميل طلب تغيير الألوان لتناسب الهوية الجديدة.',
      requestedById: am,
      assignedToId: roleUser.GRAPHIC_DESIGNER,
      dueDate: daysAhead(2),
      status: 'IN_PROGRESS',
    },
  });
  await prisma.approval.create({
    data: {
      entityType: 'TASK',
      entityId: createdTasks[8]!,
      step: 'INTERNAL',
      approverId: ops,
      status: 'PENDING',
    },
  });

  // ── Contract + Invoice + Payment ─────────────────────────
  const contract = await prisma.contract.create({
    data: {
      number: 'BP-C-2026-0001',
      title: 'عقد إدارة سوشيال ميديا سنوي - Smile Dental',
      clientId: clientIds[0]!,
      startDate: daysAgo(60),
      endDate: daysAhead(25),
      renewalDate: daysAhead(25),
      autoRenew: true,
      valueMinor: BigInt(26400000),
      currency: 'EGP',
      paymentTerms: 'دفعة شهرية مقدمة',
      ownerId: sales1,
      status: 'ACTIVE',
      services: { create: [{ serviceId: services['SVC-SMM']! }] },
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      number: 'BP-INV-2026-0001',
      clientId: clientIds[0]!,
      contractId: contract.id,
      projectId: project.id,
      issueDate: daysAgo(12),
      dueDate: daysAhead(3),
      currency: 'EGP',
      subtotalMinor: BigInt(2200000),
      taxMinor: BigInt(308000),
      totalMinor: BigInt(2508000),
      paidMinor: BigInt(1500000),
      status: 'PARTIALLY_PAID',
      items: {
        create: [
          {
            nameAr: 'إدارة السوشيال ميديا - يوليو',
            nameEn: 'Social Media Management - July',
            quantity: '1',
            unitPriceMinor: BigInt(2200000),
            taxRateId: 'tax-eg-vat14',
            taxRate: '14',
            subtotalMinor: BigInt(2200000),
            taxMinor: BigInt(308000),
            totalMinor: BigInt(2508000),
          },
        ],
      },
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      clientId: clientIds[0]!,
      amountMinor: BigInt(1500000),
      currency: 'EGP',
      paidAt: daysAgo(6),
      method: 'BANK_TRANSFER',
      reference: 'TRX-889201',
      recordedById: finance,
    },
  });

  const overdue = await prisma.invoice.create({
    data: {
      number: 'BP-INV-2026-0002',
      clientId: clientIds[1]!,
      issueDate: daysAgo(45),
      dueDate: daysAgo(15),
      currency: 'EGP',
      subtotalMinor: BigInt(3500000),
      taxMinor: BigInt(490000),
      totalMinor: BigInt(3990000),
      status: 'OVERDUE',
      items: {
        create: [
          {
            nameAr: 'إدارة حملات إعلانية',
            nameEn: 'Media buying management',
            quantity: '1',
            unitPriceMinor: BigInt(3500000),
            taxRate: '14',
            subtotalMinor: BigInt(3500000),
            taxMinor: BigInt(490000),
            totalMinor: BigInt(3990000),
          },
        ],
      },
    },
  });

  await prisma.expense.createMany({
    data: [
      {
        projectId: project.id,
        clientId: clientIds[0],
        category: 'FREELANCER',
        description: 'مصور فوتوغرافي - جلسة المنتجات',
        amountMinor: BigInt(350000),
        currency: 'EGP',
        spentOn: daysAgo(10),
        recordedById: finance,
      },
      {
        projectId: project.id,
        clientId: clientIds[0],
        category: 'PRODUCTION',
        description: 'إيجار معدات إضاءة',
        amountMinor: BigInt(180000),
        currency: 'EGP',
        spentOn: daysAgo(9),
        recordedById: finance,
      },
    ],
  });

  await prisma.campaignPerformance.createMany({
    data: [
      {
        platform: 'Meta',
        campaignName: 'Ramadan Offer 2026',
        periodStart: daysAgo(30),
        periodEnd: daysAgo(1),
        adSpendMinor: BigInt(1200000),
        currency: 'EGP',
        leadsCount: 96,
        qualifiedCount: 38,
        bookingsCount: 21,
        salesCount: 9,
        revenueMinor: BigInt(8400000),
        clientId: clientIds[0],
        recordedById: users['media@bluepoint.local'],
      },
      {
        platform: 'Google',
        campaignName: 'Search - Dental Clinic',
        periodStart: daysAgo(30),
        periodEnd: daysAgo(1),
        adSpendMinor: BigInt(800000),
        currency: 'EGP',
        leadsCount: 41,
        qualifiedCount: 19,
        bookingsCount: 12,
        salesCount: 5,
        revenueMinor: BigInt(4600000),
        clientId: clientIds[0],
        recordedById: users['media@bluepoint.local'],
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: am,
        type: 'TASK_OVERDUE',
        title: 'مهمة متأخرة: مراجعة العميل',
        body: 'المهمة تجاوزت تاريخ الاستحقاق بيومين.',
        entityType: 'TASK',
        entityId: createdTasks[10]!,
        link: `/tasks/${createdTasks[10]}`,
        dedupeKey: `TASK_OVERDUE:${createdTasks[10]}:seed`,
      },
      {
        userId: sales1,
        type: 'FOLLOW_UP_OVERDUE',
        title: 'متابعة متأخرة مع مطعم البحر الأزرق',
        entityType: 'LEAD',
        entityId: leadIds['Blue Sea Restaurant']!,
        link: `/leads/${leadIds['Blue Sea Restaurant']}`,
        dedupeKey: `FOLLOW_UP_OVERDUE:${leadIds['Blue Sea Restaurant']}:seed`,
      },
      {
        userId: finance,
        type: 'INVOICE_OVERDUE',
        title: `فاتورة متأخرة ${overdue.number}`,
        entityType: 'INVOICE',
        entityId: overdue.id,
        link: `/invoices/${overdue.id}`,
        dedupeKey: `INVOICE_OVERDUE:${overdue.id}:seed`,
      },
    ],
  });

  console.log('✓ بيانات تجريبية: عملاء محتملون، صفقات، عملاء، مشروع كامل، عقد، فواتير، مدفوعات، حملات');
}

async function main() {
  console.log('▶ بدء تهيئة قاعدة بيانات Blue Point OS…\n');
  await seedRoles();
  await seedReference();
  await seedServices();
  await seedTemplates();
  await seedUsers();
  await seedDemoBusinessData();
  console.log('\n✔ اكتملت التهيئة بنجاح.');
}

main()
  .catch((e) => {
    console.error('✖ فشل التهيئة:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
