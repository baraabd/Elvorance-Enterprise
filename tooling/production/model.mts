import type { Location } from './source.mts';
export const kinds = [
  'route',
  'action',
  'api-route',
  'api-call',
  'handler',
  'form',
  'search-filter',
  'export',
  'background-job',
  'failure-state',
  'permission',
  'configuration',
  'account-lifecycle',
  'native-adapter',
] as const;
export type Kind = (typeof kinds)[number];
export interface Endpoint {
  method: string;
  path: string;
  service: string | null;
  resolution: 'literal' | 'dynamic' | 'source-bound';
}
export interface TestLink {
  id: string;
  path: string;
  line: number;
  title: string;
  scope: 'contract' | 'integration' | 'e2e' | 'unit';
  environment: string;
}
export interface SourceTrace {
  status: 'SOURCE_BOUND_NOT_RUNTIME_ACCEPTANCE';
  category: string;
  rationale: string;
  evidence: Array<{ path: string; sha256: string }>;
  originalEndpoints: Endpoint[];
  dynamicEndpointBindings: Array<{ original: Endpoint; routeIds: string[] }>;
  backendPolicies: Array<{
    routeId: string;
    owningService: string | null;
    source: Location;
    authorization: Feature['authorization'];
    persistenceEvent: Feature['persistenceEvent'];
  }>;
  delegateFeatureIds: string[];
  nativeMembers: Array<{ signature: string; line: number; sha256: string }>;
  testEffect: string;
}
export interface Feature {
  id: string;
  key: string;
  kind: Kind;
  apps: string[];
  mode: string;
  source: Location;
  owningService: string | null;
  targetService: string | null;
  endpoints: Endpoint[];
  authorization: { status: string; controls: string[]; roles: string[]; evidence: string[] };
  persistenceEvent: { status: string; tables: string[]; events: string[]; evidence: string[] };
  currentStatus: string;
  targetSprint: string;
  categories: string[];
  tests: {
    contract: string[];
    integration: string[];
    e2e: string[];
    related: string[];
    verification: string;
  };
  requiredTests: Array<{ id: string; scope: string; implementationStatus: string }>;
  presentationOnly: { reason: string; reviewedSourceFingerprint: string } | null;
  unresolved: string[];
  sourceTrace?: SourceTrace;
}
export interface RuntimeRegistration {
  owner: string;
  mode: string;
  kind: 'route' | 'action' | 'api-route';
  key: string;
  method?: string;
  path?: string;
  automatic?: boolean;
}
export interface Inventory {
  schemaVersion: 1;
  methodology: string;
  sourceDigest: string;
  sourceFiles: Array<{ path: string; sha256: string }>;
  runtimeRegistrations: RuntimeRegistration[];
  features: Feature[];
  tests: TestLink[];
  totals: Record<string, number>;
  limitations: string[];
}
