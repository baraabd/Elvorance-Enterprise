/** Tenant-authored catalog used by CRM and questionnaire consumers. */
export interface ServiceCatalogItem {
  id: string;
  title: string;
  price: number;
  category: string;
  active?: boolean;
  short?: string;
  duration?: string;
  unit?: string;
  features?: string[];
  deliverables?: string[];
  recommendationTags?: string[];
}
