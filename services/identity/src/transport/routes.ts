import type { FastifyInstance } from 'fastify';
import { command, requireRole, type Repository } from '@atlas/service-kit';
import { createMembership, createTenant } from '../application/identity.ts';
import type { Membership, TenantProfile } from '../domain/model.ts';
export function registerRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/v1/me', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => ({
      principal: request.principal,
      profile:
        (await tx.list<Membership>('memberships', { subject: request.principal.sub }))[0] ?? null,
      identitySource: 'verified-oidc-claims',
      note: 'Membership profile does not mint or override OIDC access claims',
    })),
  );
  app.get('/v1/tenant', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => ({
      tenant: (await tx.get<TenantProfile>('tenant_profiles', request.principal.tenantId)) ?? null,
    })),
  );
  app.post('/v1/tenant', async (request) =>
    command(request, repository, 'identity.createTenant', (tx) =>
      createTenant(tx, request.principal, request.body),
    ),
  );
  app.get('/v1/memberships', async (request) => {
    requireRole(request.principal, 'admin');
    return repository.transaction(request.principal.tenantId, async (tx) => ({
      items: await tx.list<Membership>('memberships'),
    }));
  });
  app.post('/v1/memberships', async (request) =>
    command(request, repository, 'identity.createMembership', (tx) =>
      createMembership(tx, request.principal, request.body),
    ),
  );
}
