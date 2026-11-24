# Sprint 03 — backend role/permission matrix

The actual six-role taxonomy is retained; no platform super-admin is invented. Tenant isolation always applies to admin too. Each row is the coarse pre-handler policy; domain ownership, assignment, workflow state and idempotent-result reauthorization can further deny access. Health/readiness endpoints are intentionally public; HEAD inherits GET. The executable source is `packages/contracts/route-inventory.json`.

| Service        | Method / gateway path                                                 | admin | rep   | client | finance | delivery | support |
| -------------- | --------------------------------------------------------------------- | ----- | ----- | ------ | ------- | -------- | ------- |
| identity       | `GET /v1/identity/me`                                                 | Allow | Allow | Allow  | Allow   | Allow    | Allow   |
| identity       | `GET /v1/identity/tenant`                                             | Allow | Allow | Allow  | Allow   | Allow    | Allow   |
| identity       | `POST /v1/identity/tenant`                                            | Allow | Deny  | Deny   | Deny    | Deny     | Deny    |
| identity       | `GET /v1/identity/memberships`                                        | Allow | Deny  | Deny   | Deny    | Deny     | Deny    |
| identity       | `POST /v1/identity/memberships`                                       | Allow | Deny  | Deny   | Deny    | Deny     | Deny    |
| crm            | `GET /v1/crm/customers`                                               | Allow | Allow | Allow  | Allow   | Allow    | Allow   |
| crm            | `GET /v1/crm/customers/{id}`                                          | Allow | Allow | Allow  | Allow   | Allow    | Allow   |
| crm            | `GET /v1/crm/customers/{id}/context`                                  | Allow | Allow | Allow  | Allow   | Allow    | Allow   |
| crm            | `POST /v1/crm/customers`                                              | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| crm            | `PATCH /v1/crm/customers/{id}`                                        | Allow | Allow | Allow  | Deny    | Deny     | Deny    |
| crm            | `GET /v1/crm/regions`                                                 | Allow | Allow | Allow  | Allow   | Allow    | Allow   |
| crm            | `POST /v1/crm/regions`                                                | Allow | Deny  | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/visits`                                                | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/visits/{id}`                                           | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/visits`                                               | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/visits/{id}/start`                                    | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/visits/{id}/complete`                                 | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/quotes`                                                | Allow | Allow | Allow  | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/quotes/{id}`                                           | Allow | Allow | Allow  | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/quotes`                                               | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `PATCH /v1/sales/quotes/{id}`                                         | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/quotes/{id}/revise`                                   | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/quotes/{id}/send`                                     | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/quotes/{id}/accept`                                   | Deny  | Deny  | Allow  | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/quotes/{id}/reject`                                   | Deny  | Deny  | Allow  | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/quotes/{id}/request-changes`                          | Deny  | Deny  | Allow  | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/contracts`                                             | Allow | Allow | Allow  | Allow   | Allow    | Deny    |
| sales          | `GET /v1/sales/contracts/{id}`                                        | Allow | Allow | Allow  | Allow   | Allow    | Deny    |
| sales          | `POST /v1/sales/contracts/{id}/approve`                               | Deny  | Deny  | Allow  | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/contracts/{id}/fulfillment`                            | Allow | Allow | Allow  | Allow   | Allow    | Deny    |
| delivery       | `GET /v1/delivery/projects`                                           | Allow | Allow | Allow  | Deny    | Allow    | Deny    |
| delivery       | `GET /v1/delivery/projects/{id}`                                      | Allow | Allow | Allow  | Deny    | Allow    | Deny    |
| delivery       | `POST /v1/delivery/projects/{id}/milestones`                          | Allow | Deny  | Deny   | Deny    | Allow    | Deny    |
| delivery       | `POST /v1/delivery/projects/{id}/milestones/{milestoneId}`            | Allow | Deny  | Deny   | Deny    | Allow    | Deny    |
| delivery       | `POST /v1/delivery/projects/{id}/deliverables`                        | Allow | Deny  | Deny   | Deny    | Allow    | Deny    |
| delivery       | `POST /v1/delivery/projects/{id}/deliverables/{deliverableId}/revise` | Allow | Deny  | Deny   | Deny    | Allow    | Deny    |
| delivery       | `POST /v1/delivery/projects/{id}/deliverables/{deliverableId}/review` | Deny  | Deny  | Allow  | Deny    | Deny     | Deny    |
| delivery       | `POST /v1/delivery/projects/{id}/complete`                            | Allow | Deny  | Deny   | Deny    | Allow    | Deny    |
| billing        | `GET /v1/billing/invoices`                                            | Allow | Allow | Allow  | Allow   | Deny     | Deny    |
| billing        | `GET /v1/billing/invoices/{id}`                                       | Allow | Allow | Allow  | Allow   | Deny     | Deny    |
| billing        | `GET /v1/billing/invoices/{id}/payments`                              | Allow | Allow | Allow  | Allow   | Deny     | Deny    |
| billing        | `GET /v1/billing/contracts/{id}/account`                              | Allow | Allow | Allow  | Allow   | Deny     | Deny    |
| billing        | `POST /v1/billing/invoices/{id}/payments`                             | Allow | Deny  | Deny   | Allow   | Deny     | Deny    |
| tracking       | `POST /v1/tracking/sessions`                                          | Deny  | Allow | Deny   | Deny    | Deny     | Deny    |
| tracking       | `GET /v1/tracking/sessions/current`                                   | Deny  | Allow | Deny   | Deny    | Deny     | Deny    |
| tracking       | `GET /v1/tracking/sessions/{id}`                                      | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| tracking       | `POST /v1/tracking/sessions/{id}/points`                              | Deny  | Allow | Deny   | Deny    | Deny     | Deny    |
| tracking       | `POST /v1/tracking/sessions/{id}/state`                               | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| tracking       | `GET /v1/tracking/latest`                                             | Allow | Deny  | Deny   | Deny    | Deny     | Deny    |
| communications | `GET /v1/communications/notifications`                                | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| communications | `POST /v1/communications/notifications/{id}/read`                     | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| communications | `GET /v1/communications/tickets`                                      | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| communications | `GET /v1/communications/tickets/{id}`                                 | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| communications | `POST /v1/communications/tickets`                                     | Deny  | Allow | Allow  | Deny    | Deny     | Deny    |
| communications | `POST /v1/communications/tickets/{id}/replies`                        | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| communications | `POST /v1/communications/tickets/{id}/status`                         | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| identity       | `PATCH /v1/identity/me/profile`                                       | Allow | Allow | Allow  | Allow   | Allow    | Allow   |
| crm            | `GET /v1/crm/configuration`                                           | Allow | Allow | Allow  | Allow   | Allow    | Allow   |
| crm            | `PUT /v1/crm/configuration`                                           | Allow | Deny  | Deny   | Deny    | Deny     | Deny    |
| crm            | `GET /v1/crm/catalog`                                                 | Allow | Allow | Allow  | Allow   | Allow    | Allow   |
| crm            | `GET /v1/crm/customers/{id}/discovery`                                | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| crm            | `PUT /v1/crm/customers/{id}/discovery`                                | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/tasks`                                                 | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/tasks/{id}`                                            | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/tasks`                                                | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `PATCH /v1/sales/tasks/{id}`                                          | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/opportunities`                                         | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/opportunities/{id}`                                    | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/opportunities`                                        | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `PATCH /v1/sales/opportunities/{id}`                                  | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/routes`                                                | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/routes/{id}`                                           | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/routes`                                               | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `PATCH /v1/sales/routes/{id}`                                         | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `PATCH /v1/sales/visits/{id}`                                         | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/visits/{id}/cancel`                                   | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `GET /v1/sales/quote-discount-approvals`                              | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/quotes/{id}/discount-approval`                        | Allow | Allow | Deny   | Deny    | Deny     | Deny    |
| sales          | `POST /v1/sales/quote-discount-approvals/{id}/decision`               | Allow | Deny  | Deny   | Deny    | Deny     | Deny    |
| communications | `GET /v1/communications/conversations`                                | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| communications | `POST /v1/communications/conversations`                               | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| communications | `GET /v1/communications/conversations/{id}/messages`                  | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| communications | `POST /v1/communications/conversations/{id}/messages`                 | Allow | Allow | Allow  | Deny    | Deny     | Allow   |
| communications | `POST /v1/communications/conversations/{id}/read`                     | Allow | Allow | Allow  | Deny    | Deny     | Allow   |

## Object-level scope

`rep` requires its signed rep_id and current assignment where relevant; `client` requires signed client_id and customer-owned resources. The relevant service validates these independently of the frontend. Finance, delivery and support permissions are tenant-scoped business functions, not unrestricted cross-tenant identities. Unknown roles are rejected by token validation; an empty recognized-role set is denied by the route policy.

The matrix is checked against every declared operation (588 allow/deny decisions), and unlisted protected route registrations fail startup. This does not claim independent business approval of every policy, nor exhaustive HTTP authorization coverage.
