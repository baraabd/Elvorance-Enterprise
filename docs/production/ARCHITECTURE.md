# Architecture and data-flow baseline

This is a source baseline, not a claim about deployed topology. Machine-readable details and source hashes are in `architecture-inventory.json`, `ownership-dependencies.json` and `data-flow-inventory.json`.

## Execution modes

`apps/admin-web`, `apps/client-mobile` and `apps/rep-mobile` retain local demo registration trees and shared rendering/runtime packages. Demo persistence is not service persistence. Admin and client server entry points select an authenticated shared workspace. The representative has a dedicated server bootstrap/workspace, API resource mapping, forms/views and foreground tracking. Capacitor Android/iOS shells and the native auth bridges add browser-session, callback and secure-storage boundaries. A native permission string does not prove the permission lifecycle works on a device.

```text
Browser / Capacitor shell
  -> OIDC authorization-code + PKCE / native callback / session vault
  -> authenticated API client -> HTTPS gateway
  -> identity | CRM | sales | delivery | billing | tracking | communications
  -> service-owned PostgreSQL transaction + tenant context + outbox
  -> RabbitMQ delivery/retry/dead-letter topology
  -> consumer inbox/idempotency -> service-owned transaction
```

The gateway routes traffic and applies input/authentication/readiness controls; each domain service must enforce authorization independently. Sales and communications use CRM ownership lookups rather than reading a shared CRM database. The concrete import graph is an implementation dependency inventory, not permission to bypass domain boundaries.

## Data ownership

Identity owns profile/account-related application records; the external OIDC provider owns authentication credentials and sessions. CRM owns customer/discovery/configuration records. Sales owns visits, tasks, opportunities, routes, quotes and discounts. Delivery owns execution/fulfillment records. Billing owns commercial billing/payment records but record creation alone is not an external payment integration. Tracking owns representative location-related records. Communications owns conversations/messages and notification records; internal records do not prove SMS/email/push delivery.

The shared repository layer supplies service migrations, PostgreSQL transactions, RLS/tenant context, pagination, inbox/outbox behavior and in-memory test adapters. The existing real PostgreSQL suite verifies owned databases and denial of cross-service connections. The Compose journey verifies asynchronous propagation using synthetic data and development JWT authentication; a separate real Keycloak gate verifies local OIDC lifecycle. Neither substitutes for a hosted, fully authenticated end-to-end journey.

## Boundaries requiring production evidence

Hosted DNS/TLS, native redirect registrations, real identity provisioning, per-service database roles, broker credentials, worker deployment and health, retry/DLQ operations, data retention, backup/restore, alert delivery, external messaging/payment integrations and release signing are tracked in `infrastructure-blockers.json`. Fresh read-only platform observations are distinguished from staged resources. No deployment or staged patch was applied for S01.

Technical ownership is recorded per feature and source import. `@baraabd` is the existing repository-account owner and proposed CODEOWNERS reviewer, not an invented domain team. Independent reviewers, on-call staff and service ownership must be assigned before production approval.
