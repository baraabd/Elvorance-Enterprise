# client-mobile feature modules

These ES modules preserve the v1.1 route IDs, action names, page templates and validation. Each feature factory receives the app context and only the explicit feature ports listed below. Cross-feature ports expose functions; they do not share a copy of the entire app or evaluate source text.

| Feature   | Routes                                                      | App actions | Explicit ports   |
| --------- | ----------------------------------------------------------- | ----------: | ---------------- |
| dashboard | `home`                                                      |           0 | projects, quotes |
| catalog   | `services`, `service-detail`, `request-service`, `requests` |           2 | state            |
| quotes    | `quotes`, `quote-detail`                                    |           6 | contracts, state |
| contracts | `contracts`, `contract-detail`                              |           4 | quotes, state    |
| projects  | `projects`, `project-detail`, `deliverable-detail`          |           7 | state            |
| billing   | `invoices`, `invoice-detail`                                |           3 | state            |
| support   | `support`, `new-ticket`, `ticket-detail`                    |           2 | state            |
| messages  | `messages`                                                  |           2 | state            |
| account   | `account`, `profile`, `preferences`                         |           2 | state            |

## Local demo adapter

The existing synchronous mutations and draft storage intentionally remain in `../state/local-demo.js` and in the bounded business action that owns each mutation. They still call the injected runtime and operate on synthetic local demo state. These are not remote APIs or distributed microservice transactions. Migrating the command contracts and backend authority is a separate step.

The registration entry is `../app.js`: install the runtime, call `registerApp(runtime)`, then start the app. Import `../styles.css` exactly once **after shared runtime/design-system CSS**. The CSS text was extracted from the existing app without reordering its rules; per-render style tags were removed. Mobile wrapping does not change these templates.

The app facade uses `@atlas/ui` (via a relative source import) for actual shared button, field, page heading and primitive implementations. The role-specific markup variants remain distinct so their DOM and CSS classes stay compatible.
