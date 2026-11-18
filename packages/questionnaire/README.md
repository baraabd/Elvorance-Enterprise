# Questionnaire

Shared tenant questionnaire defaults, validation and explainable service recommendations.
The public TypeScript API is exported directly from `src/index.ts`; implementation types and
consumer types have one source. `ServiceCatalogItem` and persisted `DiscoveryAnswer` are reused
from `@elvorance/contracts`.

## Public functions

- `defaultConfiguration()` and `defaultCatalog()` return independent, editable copies.
- `configured(state)` returns the configured schema or fresh defaults.
- `visibleQuestions(configuration, activityId, section)` filters active questions for an
  activity and orders them without mutating the configuration.
- `validateConfiguration(value, catalog?)` accepts unknown input and returns Arabic errors.
  CRM calls it before publishing a definition. An empty result does not replace API
  authorization, catalog price validation, or optimistic concurrency checks.
- `validateAnswers(configuration, activityId, answers?, catalog?)` validates raw answer values
  against the visible questions and active catalog choices. Numeric strings from form controls
  are accepted; objects, booleans, arrays, symbols and nonfinite numbers are not numbers.
- `recommendServices(configuration, activityId, answers, catalog)` retains the existing
  explainable scoring rules and returns catalog items with `score` and up to two `reasons`.
  Additional typed catalog properties are preserved in the result.

## Configuration validation

A configuration includes positive integer `schemaVersion` and `revision`, a nullable timestamp
`updatedAt`, 1–100 activities, and 1–250 questions. Question flags are booleans, `order` is finite,
activity references identify configured activities or `*`, and numeric bounds are finite numbers
or `null`. Every question has an options array; choice questions require 1–60 options, except
the catalog-backed `solutions` question, which can have none. Text and numeric questions can
also have an empty options array.

Validation rejects null or primitive nested entries, sparse arrays, duplicate identifiers,
prototype-reserved identifiers, unknown sections/field types, and malformed catalog metadata.
Catalog validation allows up to 250 services and preserves the existing optional presentation
fields. Valid configurations, catalog defaults, question ordering and recommendation rules
retain their existing behavior. Previously accepted malformed field shapes now return errors
before persistence or rendering.

The optional legacy `./sync` entry point is unchanged by the core TypeScript migration.
