import type { Principal, RepresentativeProfile } from '@elvorance/contracts';
import {
  assert,
  integer,
  object,
  oneOf,
  optionalText,
  text,
  type Transaction,
} from '@elvorance/service-kit';

export async function ownProfile(
  tx: Transaction,
  principal: Principal,
): Promise<RepresentativeProfile | null> {
  return (
    (await tx.list<RepresentativeProfile>('user_profiles', { subject: principal.sub }))[0] ?? null
  );
}
export async function updateOwnProfile(
  tx: Transaction,
  principal: Principal,
  input: unknown,
): Promise<RepresentativeProfile> {
  const body = object(input);
  const allowed = new Set(['expectedVersion', 'displayName', 'phone', 'locale', 'timeZone']);
  assert(
    Object.keys(body).every((key) => allowed.has(key)),
    'PROFILE_FIELDS',
    'Only personal profile fields can be changed here',
  );
  const current = await ownProfile(tx, principal);
  const expected = integer(body.expectedVersion, 'expectedVersion', 0);
  assert(
    (current?.version ?? 0) === expected,
    'VERSION_CONFLICT',
    'Your profile changed; reload before saving',
    409,
  );
  const timeZone = text(body.timeZone ?? current?.timeZone ?? 'UTC', 'timeZone', 1, 100);
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
  } catch {
    assert(false, 'INVALID_TIME_ZONE', 'Use a valid IANA time zone');
  }
  const content = {
    subject: principal.sub,
    displayName: text(body.displayName ?? current?.displayName, 'displayName', 2, 150),
    phone: optionalText(body.phone ?? current?.phone, 'phone', 40),
    locale: oneOf(body.locale ?? current?.locale ?? 'ar', ['ar', 'en'] as const, 'locale'),
    timeZone,
  };
  return current
    ? tx.replace<RepresentativeProfile>('user_profiles', { ...current, ...content }, expected)
    : tx.insert<RepresentativeProfile>('user_profiles', content);
}
