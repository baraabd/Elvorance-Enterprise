import type { NavigationGroup } from '@elvorance/ui/enterprise-ux';

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: 'العمل الميداني',
    items: [
      {
        route: 'tasks',
        label: 'المهام',
      },
      {
        route: 'catalog',
        label: 'الخدمات',
        children: ['service-detail'],
      },
      {
        route: 'quotes',
        label: 'عروض الأسعار',
        children: ['quote-detail', 'quote-builder'],
      },
      {
        route: 'messages',
        label: 'المحادثات',
      },
      {
        route: 'profile',
        label: 'الملف الشخصي',
      },
    ],
  },
];
