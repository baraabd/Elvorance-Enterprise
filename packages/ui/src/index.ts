// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { createPrimitives } from './primitives.ts';
import { createRepButtons, createClientButtons, createAdminButtons } from './buttons.ts';
import { createClientForms, createAdminForms } from './forms.ts';
import { createRepPageHeads, createClientPageHeads, createAdminPageHeads } from './page-heads.ts';
export { createPrimitives, esc, icon, badge, avatar, progress, empty } from './primitives.ts';
export * from './buttons.ts';
export * from './forms.ts';
export * from './page-heads.ts';
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
