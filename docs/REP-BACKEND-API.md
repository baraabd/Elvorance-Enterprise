# Representative backend integration

This document describes implemented server behavior. The authoritative machine-readable
inventory is `packages/contracts/openapi.json` and `packages/contracts/route-inventory.json`.
Public URLs below include the API gateway prefix. Each service stores only its own domain
records in its own database; no application shares CRM, sales or communications tables.

## Identity and command rules

- Every `/v1/` operation verifies an access token. `tenant_id`, `roles`, `rep_id` and
  `client_id` come from verified claims. Body/header claims cannot replace them.
- A representative can act only for the matching representative assignment. New sales
  work verifies the current CRM assignment and contact preference through CRM's API.
- Commands require `Idempotency-Key`. Reuse the same key for retries of the same user
  intent; changed input with that key returns `409`. Resource updates require their
  current `expectedVersion`; concurrent stale updates return `409`.
- Cached responses for customer-associated rep commands recheck current ownership.
  Reassignment cannot be bypassed by replaying an earlier idempotency key.
- `expectedVersion: 0` is reserved for the first profile/discovery/configuration save.
  Subsequent saves use the returned record version.
- A personal profile changes display information only. The identity provider owns
  passwords, verified addresses, roles, membership and token claims.

## Lists and bounded traversal

Customer, region, visit, quote, contract, task, opportunity, route, discount approval,
conversation, ticket, notification, project, invoice, invoice-payment and membership
list endpoints accept `?limit=100&cursor=<nextCursor>` and return:

```json
{
  "items": [],
  "nextCursor": null,
  "limit": 100
}
```

The maximum page size is 200. Role/actor scope is included in the SQL predicate **before**
the page limit. Tenant isolation is also enforced by forced PostgreSQL row-level security.
Continue until `nextCursor` is null; a page may contain fewer visible records when a
current-assignment check excludes a transferred customer. Cursors are traversal positions,
not authorization tokens. Refresh the traversal to include concurrent insertions which
sort before the current cursor. Ordering uses immutable resource IDs.

Conversation messages use a separate increasing message sequence cursor. They return
`{ conversation, items, nextCursor, receipt }`; their default/maximum page sizes are also
100/200. The receipt belongs only to the authenticated subject.

## Implemented feature map

| Feature                                  | Owning service / public API                                                                                                                            | Important invariant                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer information                     | CRM: `GET/POST /v1/crm/customers`, `GET/PATCH /v1/crm/customers/:id`                                                                                   | Rep identity is taken from the token; reassignment is admin-only. Client responses omit internal qualification notes and sales preferences.       |
| Regions                                  | CRM: `GET/POST /v1/crm/regions`                                                                                                                        | Region creation is admin-only; customer assignment requires an active region.                                                                     |
| Catalog and questionnaire administration | CRM: `GET/PUT /v1/crm/configuration`                                                                                                                   | Publishing is admin-only, validated and versioned. Currency belongs to the published catalog.                                                     |
| Published service catalog                | CRM: `GET /v1/crm/catalog`                                                                                                                             | Returns no sample prices for an unconfigured tenant. Prices include integer `unitPriceMinor`.                                                     |
| Discovery answers                        | CRM: `GET/PUT /v1/crm/customers/:id/discovery`                                                                                                         | Current customer assignment, published schema revision and allowed answer fields are checked. Submitted records satisfy required questions.       |
| Visit planning                           | Sales: `GET/POST /v1/sales/visits`, `GET/PATCH /v1/sales/visits/:id`                                                                                   | Scheduled visits may change time/purpose; active visits may update notes. Assignment cannot be changed through the visit payload.                 |
| Visit lifecycle                          | Sales: `POST /v1/sales/visits/:id/start`, `/complete`, `/cancel`                                                                                       | One active visit per rep; fresh GPS or explicit manual evidence; cancellation and completion have explicit state rules.                           |
| Visit routes                             | Sales: `GET/POST /v1/sales/routes`, `GET/PATCH /v1/sales/routes/:id`                                                                                   | Ordered persisted visit IDs, one rep and UTC date; all stops must complete/cancel before route completion.                                        |
| Tasks                                    | Sales: `GET/POST /v1/sales/tasks`, `GET/PATCH /v1/sales/tasks/:id`                                                                                     | Personal or customer-linked tasks; due date, priority and explicit open/done/cancelled state.                                                     |
| Opportunities                            | Sales: `GET/POST /v1/sales/opportunities`, `GET/PATCH /v1/sales/opportunities/:id`                                                                     | A won opportunity needs an approved matching contract. Its final value/currency are derived from that contract.                                   |
| Quotes                                   | Sales: existing quote create/edit/revise/send and client decision APIs                                                                                 | Published prices and currency are checked server-side. Customer acceptance and contract approval remain distinct.                                 |
| Commercial approval                      | Sales: `GET /v1/sales/quote-discount-approvals`, `POST /v1/sales/quotes/:id/discount-approval`, `POST /v1/sales/quote-discount-approvals/:id/decision` | Only admin can decide; approval is bound to the exact quote content, price, schedule, terms and catalog version.                                  |
| Contracts                                | Sales: existing scoped contract and fulfillment APIs                                                                                                   | Immutable accepted-quote snapshot; approved-contract events provision delivery/billing independently.                                             |
| Projects                                 | Delivery: existing project/milestone/deliverable APIs                                                                                                  | Delivery retains its own progress/review state; rep views use role-scoped APIs.                                                                   |
| Invoices                                 | Billing: existing invoice/payment/account APIs                                                                                                         | Integer amounts; payment recording is finance/admin-only and does not claim payment-provider collection.                                          |
| Conversations                            | Communications: `GET/POST /v1/communications/conversations`                                                                                            | One conversation per customer/rep assignment; current CRM authorization is verified.                                                              |
| Messages                                 | Communications: `GET/POST /v1/communications/conversations/:id/messages`                                                                               | Separate message rows, monotonic sequences, transactional conversation version and no external delivery claim.                                    |
| Read position                            | Communications: `POST /v1/communications/conversations/:id/read`                                                                                       | Only this subject's receipt advances, only to a message from this conversation, never backwards.                                                  |
| Tickets and notifications                | Communications: existing ticket/reply/status and notification/read APIs                                                                                | Scoped to customer/rep or support/admin; commercial-approval notifications are hidden from client accounts.                                       |
| Profile                                  | Identity: `GET /v1/identity/me`, `PATCH /v1/identity/me/profile`                                                                                       | Display name, phone, locale and IANA time zone only; cannot elevate permissions.                                                                  |
| Location                                 | Tracking: existing consent/session/point/state APIs                                                                                                    | Explicit rep consent, device/subject binding, fresh monotonic readings, coordinates removed on pause/stop. Background collection is not promised. |

## Common request bodies

### Client and administrator review controls

The live administrator workspace includes the commercial-approval list and a detail
view showing the representative's reason, scope, list price, discount, net price,
terms and installment plan. A decision requires an explicit selection, a reason and
an unchecked review acknowledgement. It records approval/rejection for that exact
request; it does not send the representative's draft automatically.

The live client workspace includes quote detail, explicit acceptance, rejection with
a reason and requests for changes. Accepted quotes produce a separate pending
contract. The client must review that immutable contract, enter the signer's name
and check a second explicit consent before contract approval. Merely opening a
record never sends a decision. Missing financial details suppress decision forms.

All controls use the displayed server version and a stable idempotency key. A lost
response can be retried without duplicate contracts. Version/state conflicts require
the customer to refresh and review current terms. Account disposal aborts pending
reads, removes delegated listeners and prevents late replies from restoring old
account data. The role-specific web identity clients are configured separately from
the representative native client.

### Tasks, opportunities and routes

```json
{
  "title": "Follow up on requirements",
  "clientId": "customer-id",
  "dueOn": "2027-01-05",
  "priority": "high",
  "notes": "Confirm the proposed scope"
}
```

For a personal task omit `clientId`; an administrator creating such a task supplies
`repId`. A task patch includes `expectedVersion` and may change title, due date, notes,
priority or status. The customer/rep association is immutable.

Opportunity creation takes `clientId`, `title`, optional stage/value/currency,
`expectedCloseOn` and notes. Allowed stages are `new`, `qualified`, `proposal`,
`negotiation`, `won`, `lost`. A `won` transition includes `contractId`; the server
verifies an approved contract for the same customer and representative. A contracted
opportunity cannot be reopened to inflate or overwrite its recorded sale.

Route creation takes `{ name, date, visitIds }`, with at most 40 distinct ordered IDs.
`date` is a UTC calendar date. Patches include `expectedVersion`; valid states are
`planned`, `active`, `completed`, `cancelled`. Closed routes are immutable.

### Discovery and profile

Discovery save takes `{ expectedVersion, configurationRevision, activityId, answers,
status, notes }`. `status` is `draft` or `submitted`. Answers may only use questions
visible for that activity and their permitted `__other` fields. Single/multiple choice,
numeric bounds and text limits are enforced on the server. `GET` returns `{ record }`,
where a never-saved record is null. `PUT` returns the saved record directly.

Profile patch takes `{ expectedVersion, displayName, phone, locale, timeZone }` and
returns the profile directly. `GET /me` retains `{ principal, profile, identitySource,
note }` and supplies `profileVersion`. Use `profileVersion` as the update's
`expectedVersion`. Profile and membership are distinct: a legacy membership displayed
before a personal profile exists does not determine the personal-profile version.

### Quotes, approvals and messages

Quotes use published `serviceId`, exact positive `unitPriceMinor`, quantity and
integer `discountMinor`. The server computes `subtotalMinor` and `totalMinor`.
It rejects a changed unit price that would disguise a discount. Catalog currency must
match. Installments sum exactly to the net total, and the first installment is at least
20%, preserving the policy already shown in the representative UI.

A discount strictly above 15%, or a catalog service with price zero (custom pricing),
requires administrative approval. Request with `{ expectedVersion: quote.version,
reason }`; decide with `{ expectedVersion: approval.version, decision: "approved" |
"rejected", note }`. Approval of one quote or revision never authorizes another.
Changes to content or catalog version require review again before sending.

Message creation takes `{ expectedVersion: conversation.version, body }` and returns
`{ conversation, message }`. Read acknowledgement takes `{ expectedVersion:
conversation.version, lastMessageId }`. Outbound rep/staff messages stop after customer
opt-out. A customer may still initiate a question; that action does not re-enable
outbound sales consent. Reassigned representatives cannot replay previous message
commands to recover an old customer's conversation.

## Deployment and migrations

Run the owning service's migration entry point before its runtime. Existing initial
migrations are preserved; new owned tables are appended:

| Service        | New migration             | New tables                                                     |
| -------------- | ------------------------- | -------------------------------------------------------------- |
| Identity       | 2, personal profiles      | `user_profiles`                                                |
| CRM            | 3, customer discovery     | `discoveries`                                                  |
| Sales          | 2, representative work    | `tasks`, `opportunities`, `visit_routes`, `discount_approvals` |
| Communications | 2, customer conversations | `conversations`, `conversation_messages`, `conversation_reads` |

Both sales and communications require `CRM_URL` pointing at the private CRM origin.
The shared HTTP adapter forwards the caller's access token, rejects redirects, limits
upstream requests to five seconds and fails closed when ownership/pricing cannot be
verified. It does not read the CRM database.

Deploy event topology bindings before publishers emit the new message/approval events.
The shared topology includes `communications.message_created.v1`,
`sales.discount_approval_requested.v1` and `sales.discount_approval_decided.v1` for the
durable communications consumer. Its notification payload omits client scope for the
two internal commercial-approval events.

Before testing the staged rep application, the tenant administrator must publish its
actual catalog, currency and questionnaire. No seed customers, messages or prices are
substituted for unavailable real services.

## Verification and remaining operational gates

The new backend tests exercise real HTTP handlers using in-memory adapters and a
disposable PostgreSQL 16 server. PostgreSQL verification checks seven separate owned
databases, all 42 denied cross-service database connections, forced row-level security
for all domain tables, atomic outbox/inbox behavior, concurrent commands and every new
domain table. Cursor tests include over 1000 unrelated customer records, verifying that
authorization precedes the limit and later owned pages remain reachable.

The PostgreSQL test does not use a live RabbitMQ broker or real identity-provider
login. It does not constitute a physical iPhone/Android run, a signed AAB/IPA, a staging
deployment, a store submission or production acceptance. Those gates require separate
observable evidence.

Transactions currently serialize within each service/tenant using PostgreSQL advisory
locks. That preserves existing invariants but limits concurrent tenant throughput.
Internal business queries retain their existing 1000-row bound; HTTP list traversal is
now paginated. Representative load targets, broker retry/dead-letter behavior under
failure, backup restoration and physical-device acceptance must be measured in staging
before a production promotion. No throughput or universal bug-free guarantee is implied.
