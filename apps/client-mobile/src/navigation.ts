import type { NavigationGroup } from '@elvorance/ui/enterprise-ux';

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: 'المتابعة',
    items: [
      {
        route: 'quotes',
        label: 'عروض الأسعار',
        children: ['quote-detail'],
      },
      {
        route: 'invoices',
        label: 'الفواتير',
        children: ['invoice-detail'],
      },
      {
        route: 'messages',
        label: 'المحادثات',
      },
      {
        route: 'support',
        label: 'المساعدة',
        children: ['new-ticket', 'ticket-detail'],
      },
    ],
  },
];
