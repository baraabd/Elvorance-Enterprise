# Sprint 04 compatibility, migration and rollback

## Public HTTP contracts

The existing 84 operation objects and existing OpenAPI schemas are unchanged. New PATCH operations coexist with, rather than replace, project/milestone lifecycle POST operations. All eight new operations live under the existing v1 gateway/service prefixes. OpenAPI document version advances to 2.6.0 for additive functionality. `public-contract-baseline.json` pins the reviewed main contracts; its fingerprints must not be reset to suppress a test failure.

## Database expansion

Sales alone receives migration 3, `client_service_requests`. It creates an empty, service-owned table, two tenant/owner indexes, and forced tenant RLS. It does not rewrite or drop existing tables, and migrations 1–2 retain their original SQL checksums. Apply through the existing dedicated Sales migration process before the new Sales image. Existing services can continue using the old schema while this additive migration is present. Validate RLS with the non-superuser, non-bypass service role.

Rollback the application version without dropping the new table or discarding submitted requests. Disable new intake in the caller during rollback and preserve the rows for a forward fix. Do not reset the migration ledger. Production backup/restore approval and an actual restore drill remain separate deployment gates.

## Discounted contract event rollout

`contract.approved.v1` gains optional `subtotalMinor` and `discountMinor` fields. New Billing supports both formats: neither field present is accepted only when gross line items equal the total; both present must be nonnegative safe minor-unit integers and satisfy `sum(items) = subtotalMinor` and `subtotalMinor - discountMinor = totalMinor`. Sending just one field or inconsistent amounts fails atomically.

Deploy the Billing consumer first; verify old and new snapshots in the isolated environment. Deploy the Communications consumer and durable bindings before producers emit service-request events. Then deploy Sales and its additive migration. Delivery preserves the approved snapshot and tolerates the added fields. Do not enable a producer before required consumer versions and bindings are ready. Keep Billing on the dual-compatible version during a Sales rollback; rolling Billing back to the buggy version reintroduces discounted-contract failures.

Already-approved historic discounted messages may be in a dead-letter queue. Do not infer a discount from a mismatched total, change a signed contract, delete the dead-letter record, or write into Billing from Sales. Reconcile the immutable Sales quote, obtain an approved incident action and emit a new auditable corrected event from Sales with a distinct event ID and correlation/causation to the failed event. Business-key guards prevent duplicate invoices/projects. This PR does not provide a production redrive tool or authorize historic repair.

## Topology and failure semantics

Six formerly unbound types now have a durable Communications binding. Existing queue names, exchange types and queue arguments are unchanged; provisioning binds new routing keys before workers drain outboxes. The same inbox transaction protects notification side effects. Monitor pending outbox age, retry attempts, dead-letter depth and pending fulfillment; zero exceptions in an HTTP request is not evidence of completed downstream work.

RabbitMQ publisher confirms do not mean a consumer committed. Confirmed forward-to-retry/dead-letter followed by consumer acknowledgement still allows redelivery, so handlers must remain idempotent. The real integration journey exercises retries, rollback, independent-service progress, broker restart and duplicate events.

Quorum queues default to at-most-once dead-letter transfer. Reliable TTL retry transfer under an unavailable destination additionally requires an operator-managed `dead-letter-strategy: at-least-once` policy and compatible `overflow: reject-publish` policy. Apply/review this as a topology migration before production; do not change immutable queue arguments or delete queues to force a declaration. Validate cluster/node and dead-letter-target outages separately. No production RabbitMQ policy is changed by this PR.

Primary references: RabbitMQ documentation, `https://www.rabbitmq.com/docs/confirms`, `https://www.rabbitmq.com/docs/quorum-queues`, `https://www.rabbitmq.com/docs/dlx`, and `https://www.rabbitmq.com/docs/http-api-reference`. The management publish/get endpoints in the failure harness are diagnostics only, not application transport.
