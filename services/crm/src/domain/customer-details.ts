import { array, assert, integer, object, oneOf, optionalText } from '@elvorance/service-kit';

export interface CustomerDetails {
  businessType: string;
  contactName: string;
  address: string;
  city: string;
  source: string;
  status: 'new' | 'qualified' | 'customer' | 'lost';
  budgetMinor: number;
  decisionMaker: string;
  preferredContact: string;
  bestTime: string;
  painPoints: string;
  wishes: string;
  tags: string[];
  needs: string[];
}
const textLimits = {
  businessType: 100,
  contactName: 150,
  address: 500,
  city: 150,
  source: 100,
  decisionMaker: 150,
  preferredContact: 100,
  bestTime: 150,
  painPoints: 3000,
  wishes: 3000,
} as const;
/** Only bounded domain fields enter persistence; caller-supplied IDs/claims are never spread. */
export function customerDetails(input: unknown, existing?: CustomerDetails): CustomerDetails {
  const body = object(input);
  const result: CustomerDetails = existing
    ? { ...existing }
    : {
        businessType: '',
        contactName: '',
        address: '',
        city: '',
        source: '',
        status: 'new',
        budgetMinor: 0,
        decisionMaker: '',
        preferredContact: '',
        bestTime: '',
        painPoints: '',
        wishes: '',
        tags: [],
        needs: [],
      };
  for (const [key, maximum] of Object.entries(textLimits) as [keyof typeof textLimits, number][])
    if (body[key] !== undefined) result[key] = optionalText(body[key], key, maximum);
  if (body.status !== undefined)
    result.status = oneOf(body.status, ['new', 'qualified', 'customer', 'lost'] as const, 'status');
  if (body.budgetMinor !== undefined)
    result.budgetMinor = integer(body.budgetMinor, 'budgetMinor', 0, 100_000_000_000);
  for (const key of ['tags', 'needs'] as const)
    if (body[key] !== undefined) {
      result[key] = array(body[key], key, 40).map((value) => optionalText(value, key, 100));
      assert(
        result[key].every(Boolean) && new Set(result[key]).size === result[key].length,
        'INVALID_LIST',
        `${key} must contain distinct nonempty values`,
      );
    }
  return result;
}
export const internalCustomerFields = [
  'notes',
  'source',
  'status',
  'budgetMinor',
  'decisionMaker',
  'preferredContact',
  'bestTime',
  'painPoints',
  'wishes',
  'tags',
  'needs',
] as const;
