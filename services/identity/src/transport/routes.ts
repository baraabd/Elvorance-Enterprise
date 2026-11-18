import type { FastifyInstance } from 'fastify';
import { command, pageOptions, requireRole, type Repository } from '@elvorance/service-kit';
import { createMembership, createTenant } from '../application/identity.ts';
import type { Membership, TenantProfile } from '../domain/model.ts';
import { ownProfile, updateOwnProfile } from '../application/profile.ts';
export function registerRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/v1/me', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => {
      const personal = await ownProfile(tx, request.principal);
      return {
        principal: request.principal,
        profile:
          personal ??
          (await tx.list<Membership>('memberships', { subject: request.principal.sub }))[0] ??
          null,
        profileVersion: personal?.version ?? 0,
        identitySource: 'verified-oidc-claims',
        note: 'Membership profile does not mint or override OIDC access claims',
      };
    }),
  );
  app.patch('/v1/me/profile', async (request) =>
    command(request, repository, 'identity.updateOwnProfile', (tx) =>
      updateOwnProfile(tx, request.principal, request.body),
    ),
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
    return repository.transaction(request.principal.tenantId, (tx) =>
      tx.page<Membership>('memberships', pageOptions(request.query, [{ equals: {} }])),
    );
  });
  app.post('/v1/memberships', async (request) =>
    command(request, repository, 'identity.createMembership', (tx) =>
      createMembership(tx, request.principal, request.body),
    ),
  );
}
