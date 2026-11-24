import type { NavigationGroup } from '@elvorance/ui/enterprise-ux';

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: 'المبيعات والعملاء',
    items: [
      {
        route: 'clients',
        label: 'العملاء',
        children: ['client-detail'],
      },
      {
        route: 'tasks',
        label: 'المهام',
      },
      {
        route: 'approvals',
        label: 'الموافقات',
      },
    ],
  },
  {
    label: 'التشغيل والمتابعة',
    items: [
      {
        route: 'projects',
        label: 'المشاريع',
        children: ['project-detail'],
      },
      {
        route: 'invoices',
        label: 'الفواتير',
        children: ['invoice-detail'],
      },
      {
        route: 'analytics',
        label: 'التحليلات',
      },
      {
        route: 'messages',
        label: 'المحادثات',
        children: ['conversation'],
      },
      {
        route: 'support',
        label: 'الدعم',
        children: ['ticket-detail'],
      },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      {
        route: 'configuration',
        label: 'الاستبيانات والخدمات',
      },
      {
        route: 'settings',
        label: 'الإعدادات',
      },
    ],
  },
];
