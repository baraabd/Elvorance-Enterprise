# Sprint 04 endpoint inventory

Generated from the source-bound API contracts. Seven domain services; API Gateway owns no business database. Registration and contract tests verify both directions. Counts do not prove UI integration or product acceptance.

| Service        | Before | After |
| -------------- | -----: | ----: |
| identity       |      6 |     6 |
| crm            |     12 |    13 |
| sales          |     35 |    40 |
| delivery       |      8 |    10 |
| billing        |      5 |     5 |
| tracking       |      6 |     6 |
| communications |     12 |    12 |

| Method | Gateway endpoint                                                 | Roles, with server-side owner scope            | Change             |
| ------ | ---------------------------------------------------------------- | ---------------------------------------------- | ------------------ |
| GET    | `/v1/identity/me`                                                | admin, rep, client, finance, delivery, support | Preserved          |
| GET    | `/v1/identity/tenant`                                            | admin, rep, client, finance, delivery, support | Preserved          |
| POST   | `/v1/identity/tenant`                                            | admin                                          | Preserved          |
| GET    | `/v1/identity/memberships`                                       | admin                                          | Preserved          |
| POST   | `/v1/identity/memberships`                                       | admin                                          | Preserved          |
| GET    | `/v1/crm/customers`                                              | admin, rep, client, finance, delivery, support | Preserved          |
| GET    | `/v1/crm/customers/{id}`                                         | admin, rep, client, finance, delivery, support | Preserved          |
| GET    | `/v1/crm/customers/{id}/context`                                 | admin, rep, client, finance, delivery, support | Preserved          |
| POST   | `/v1/crm/customers`                                              | admin, rep                                     | Preserved          |
| PATCH  | `/v1/crm/customers/{id}`                                         | admin, rep, client                             | Preserved          |
| GET    | `/v1/crm/regions`                                                | admin, rep, client, finance, delivery, support | Preserved          |
| POST   | `/v1/crm/regions`                                                | admin                                          | Preserved          |
| GET    | `/v1/sales/visits`                                               | admin, rep                                     | Preserved          |
| GET    | `/v1/sales/visits/{id}`                                          | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/visits`                                               | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/visits/{id}/start`                                    | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/visits/{id}/complete`                                 | admin, rep                                     | Preserved          |
| GET    | `/v1/sales/quotes`                                               | admin, rep, client                             | Preserved          |
| GET    | `/v1/sales/quotes/{id}`                                          | admin, rep, client                             | Preserved          |
| POST   | `/v1/sales/quotes`                                               | admin, rep                                     | Preserved          |
| PATCH  | `/v1/sales/quotes/{id}`                                          | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/quotes/{id}/revise`                                   | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/quotes/{id}/send`                                     | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/quotes/{id}/accept`                                   | client                                         | Preserved          |
| POST   | `/v1/sales/quotes/{id}/reject`                                   | client                                         | Preserved          |
| POST   | `/v1/sales/quotes/{id}/request-changes`                          | client                                         | Preserved          |
| GET    | `/v1/sales/contracts`                                            | admin, rep, client, finance, delivery          | Preserved          |
| GET    | `/v1/sales/contracts/{id}`                                       | admin, rep, client, finance, delivery          | Preserved          |
| POST   | `/v1/sales/contracts/{id}/approve`                               | client                                         | Preserved          |
| GET    | `/v1/sales/contracts/{id}/fulfillment`                           | admin, rep, client, finance, delivery          | Preserved          |
| GET    | `/v1/delivery/projects`                                          | admin, delivery, rep, client                   | Preserved          |
| GET    | `/v1/delivery/projects/{id}`                                     | admin, delivery, rep, client                   | Preserved          |
| POST   | `/v1/delivery/projects/{id}/milestones`                          | admin, delivery                                | Preserved          |
| POST   | `/v1/delivery/projects/{id}/milestones/{milestoneId}`            | admin, delivery                                | Preserved          |
| POST   | `/v1/delivery/projects/{id}/deliverables`                        | admin, delivery                                | Preserved          |
| POST   | `/v1/delivery/projects/{id}/deliverables/{deliverableId}/revise` | admin, delivery                                | Preserved          |
| POST   | `/v1/delivery/projects/{id}/deliverables/{deliverableId}/review` | client                                         | Preserved          |
| POST   | `/v1/delivery/projects/{id}/complete`                            | admin, delivery                                | Preserved          |
| GET    | `/v1/billing/invoices`                                           | admin, finance, rep, client                    | Preserved          |
| GET    | `/v1/billing/invoices/{id}`                                      | admin, finance, rep, client                    | Preserved          |
| GET    | `/v1/billing/invoices/{id}/payments`                             | admin, finance, rep, client                    | Preserved          |
| GET    | `/v1/billing/contracts/{id}/account`                             | admin, finance, rep, client                    | Preserved          |
| POST   | `/v1/billing/invoices/{id}/payments`                             | admin, finance                                 | Preserved          |
| POST   | `/v1/tracking/sessions`                                          | rep                                            | Preserved          |
| GET    | `/v1/tracking/sessions/current`                                  | rep                                            | Preserved          |
| GET    | `/v1/tracking/sessions/{id}`                                     | admin, rep                                     | Preserved          |
| POST   | `/v1/tracking/sessions/{id}/points`                              | rep                                            | Preserved          |
| POST   | `/v1/tracking/sessions/{id}/state`                               | admin, rep                                     | Preserved          |
| GET    | `/v1/tracking/latest`                                            | admin                                          | Preserved          |
| GET    | `/v1/communications/notifications`                               | admin, support, rep, client                    | Preserved          |
| POST   | `/v1/communications/notifications/{id}/read`                     | admin, support, rep, client                    | Preserved          |
| GET    | `/v1/communications/tickets`                                     | admin, support, rep, client                    | Preserved          |
| GET    | `/v1/communications/tickets/{id}`                                | admin, support, rep, client                    | Preserved          |
| POST   | `/v1/communications/tickets`                                     | rep, client                                    | Preserved          |
| POST   | `/v1/communications/tickets/{id}/replies`                        | admin, support, rep, client                    | Preserved          |
| POST   | `/v1/communications/tickets/{id}/status`                         | admin, support, rep, client                    | Preserved          |
| PATCH  | `/v1/identity/me/profile`                                        | admin, rep, client, finance, delivery, support | Preserved          |
| GET    | `/v1/crm/configuration`                                          | admin, rep, client, finance, delivery, support | Preserved          |
| PUT    | `/v1/crm/configuration`                                          | admin                                          | Preserved          |
| GET    | `/v1/crm/catalog`                                                | admin, rep, client, finance, delivery, support | Preserved          |
| GET    | `/v1/crm/customers/{id}/discovery`                               | admin, rep                                     | Preserved          |
| PUT    | `/v1/crm/customers/{id}/discovery`                               | admin, rep                                     | Preserved          |
| GET    | `/v1/sales/tasks`                                                | admin, rep                                     | Preserved          |
| GET    | `/v1/sales/tasks/{id}`                                           | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/tasks`                                                | admin, rep                                     | Preserved          |
| PATCH  | `/v1/sales/tasks/{id}`                                           | admin, rep                                     | Preserved          |
| GET    | `/v1/sales/opportunities`                                        | admin, rep                                     | Preserved          |
| GET    | `/v1/sales/opportunities/{id}`                                   | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/opportunities`                                        | admin, rep                                     | Preserved          |
| PATCH  | `/v1/sales/opportunities/{id}`                                   | admin, rep                                     | Preserved          |
| GET    | `/v1/sales/routes`                                               | admin, rep                                     | Preserved          |
| GET    | `/v1/sales/routes/{id}`                                          | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/routes`                                               | admin, rep                                     | Preserved          |
| PATCH  | `/v1/sales/routes/{id}`                                          | admin, rep                                     | Preserved          |
| PATCH  | `/v1/sales/visits/{id}`                                          | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/visits/{id}/cancel`                                   | admin, rep                                     | Preserved          |
| GET    | `/v1/sales/quote-discount-approvals`                             | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/quotes/{id}/discount-approval`                        | admin, rep                                     | Preserved          |
| POST   | `/v1/sales/quote-discount-approvals/{id}/decision`               | admin                                          | Preserved          |
| GET    | `/v1/communications/conversations`                               | admin, rep, client, support                    | Preserved          |
| POST   | `/v1/communications/conversations`                               | admin, rep, client, support                    | Preserved          |
| GET    | `/v1/communications/conversations/{id}/messages`                 | admin, rep, client, support                    | Preserved          |
| POST   | `/v1/communications/conversations/{id}/messages`                 | admin, rep, client, support                    | Preserved          |
| POST   | `/v1/communications/conversations/{id}/read`                     | admin, rep, client, support                    | Preserved          |
| GET    | `/v1/sales/service-requests`                                     | admin, rep, client                             | Added in Sprint 04 |
| POST   | `/v1/sales/service-requests`                                     | client                                         | Added in Sprint 04 |
| GET    | `/v1/sales/service-requests/{id}`                                | admin, rep, client                             | Added in Sprint 04 |
| POST   | `/v1/sales/service-requests/{id}/review`                         | admin, rep                                     | Added in Sprint 04 |
| POST   | `/v1/sales/service-requests/{id}/cancel`                         | client                                         | Added in Sprint 04 |
| PATCH  | `/v1/crm/regions/{id}`                                           | admin                                          | Added in Sprint 04 |
| PATCH  | `/v1/delivery/projects/{id}`                                     | admin, delivery                                | Added in Sprint 04 |
| PATCH  | `/v1/delivery/projects/{id}/milestones/{milestoneId}`            | admin, delivery                                | Added in Sprint 04 |
