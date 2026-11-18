import type { ServiceCatalogItem } from '@elvorance/contracts';

type CatalogSeed = readonly [
  id: string,
  title: string,
  price: number,
  category: string,
  tags: string,
];

export function defaultCatalog(): ServiceCatalogItem[] {
  const seeds: CatalogSeed[] = [
    ['svc-web', 'موقع إلكتروني احترافي', 1800, 'web', 'online,visibility,موقع'],
    ['svc-store', 'متجر إلكتروني وطلبات', 3200, 'commerce', 'orders,stock,delivery'],
    ['svc-brand', 'هوية بصرية للمنشأة', 650, 'design', 'trust,visibility,هوية'],
    ['svc-social', 'إدارة حضور وسائل التواصل', 350, 'marketing', 'social,new_clients,loyalty'],
    ['svc-seo', 'ظهور في البحث والخرائط', 450, 'marketing', 'maps,new_clients,visibility'],
    ['svc-app', 'تطبيق هاتف مخصص', 6500, 'software', 'mobile,online,تطبيق'],
    [
      'svc-crm',
      'نظام إدارة العملاء والمتابعة',
      4200,
      'software',
      'records,followup,tracking,leads',
    ],
    ['svc-cloud', 'استضافة وصيانة', 35, 'infrastructure', 'hosting,electricity,cloud'],
    ['svc-security', 'فحص وحماية تقنية', 900, 'infrastructure', 'privacy,security,حماية'],
    ['svc-book', 'نظام مواعيد وحجوزات', 2200, 'software', 'appointments,booking,queues,reminder'],
  ];
  return seeds.map(([id, title, price, category, tags]) => ({
    id,
    title,
    price,
    category,
    short: title,
    unit: 'للمشروع',
    duration: 'حسب النطاق',
    features: [],
    deliverables: [],
    active: true,
    recommendationTags: tags.split(','),
  }));
}
