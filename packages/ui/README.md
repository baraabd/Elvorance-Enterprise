# @atlas/ui

Shared ESM implementations of the existing Atlas v1.1 primitives, buttons, form fields and page-heading variants. App contexts call `createRepUi`, `createClientUi`, or `createAdminUi`; they do not duplicate these markup templates. Functions receive the runtime and have no captured global app singleton.

The three markup variants preserve the previous signatures, class names, attribute order and RTL structure. Domain decisions, routes, persistence and action handlers belong to app features. Existing application CSS is in each app's `src/styles.css` and must be loaded after shared CSS.

## Verification

Run `node packages/ui/test/register-apps.test.cjs` from the enterprise workspace to bundle all three registrations with the real runtime and smoke-render all 64 routes. The separate `npm run test:parity` gate compares their complete DOM and assets with the frozen v1.1 reference.

The `@atlas/ui/primitives` export exposes `esc`, `icon`, `badge`, `avatar`, `progress`, and `empty` for the shared runtime. Icons come from the canonical `@atlas/design-system/icons` map.
