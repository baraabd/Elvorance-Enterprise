import { createPrimitives } from './primitives.js';
import { createRepButtons, createClientButtons, createAdminButtons } from './buttons.js';
import { createClientForms, createAdminForms } from './forms.js';
import { createRepPageHeads, createClientPageHeads, createAdminPageHeads } from './page-heads.js';
export { createPrimitives, esc, icon, badge, avatar, progress, empty } from './primitives.js';
export * from './buttons.js';
export * from './forms.js';
export * from './page-heads.js';
export function createRepUi(A) {
  const primitives = createPrimitives(A),
    e = primitives.escapeValue,
    ic = primitives.icon;
  return {
    e,
    ic,
    ...createRepButtons({
      e,
      ic,
    }),
    ...createRepPageHeads({
      e,
      ic,
    }),
  };
}
export function createClientUi(A) {
  const E = createPrimitives(A).escapeString;
  return {
    E,
    ...createClientButtons({
      E,
      A,
    }),
    ...createClientForms({
      E,
    }),
    ...createClientPageHeads({
      E,
      A,
    }),
  };
}
export function createAdminUi(A, { N }) {
  const primitives = createPrimitives(A),
    E = primitives.escapeString,
    icon = primitives.icon;
  const buttons = createAdminButtons({
    E,
    icon,
  });
  return {
    E,
    icon,
    badge: primitives.badge,
    empty: primitives.empty,
    ...buttons,
    ...createAdminForms({
      E,
      icon,
      action: buttons.action,
    }),
    ...createAdminPageHeads({
      E,
      icon,
      A,
      N,
    }),
  };
}
