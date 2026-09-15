# Agreement numbering

Requires GCS-SSC SDK 0.3.1 and the `agency-only-configuration`,
`agreement-number-provider` and `configuration-access` host capabilities.
An Agency Manager enables numbering and defines one format in the agency extension
dialog. It applies to every new agreement in that agency. There are no program or
stream configuration screens, overrides or stream enablement requirements.

## Format

The number is Prefix + Body + Suffix, with no implicit separators. Each piece is
fixed text (including empty text), a supported Agreement/Agency/Program/Stream
field, or a sequence. At least one sequence is required. The complete output must
contain 1–15 Unicode characters without surrounding whitespace or NUL characters.

Variables support entire value, upper/lower case, calendar year, two-digit year,
Unicode substring, and RE2-compatible regular-expression capture. Capture 0 is the
whole match; numbered captures start at 1. For example `^[0-9]{2}([0-9]{2})` with
capture 1 extracts `26` from `2026-04-01`. RE2 does not support backreferences or
lookarounds. Patterns are limited to 256 characters; input is bounded. Missing
values and failed/empty captures reject creation. Language-specific fields are
selected explicitly, independently of the interface language.

## Counter scope

Choose Agency, Program or Stream once for the whole format. Each sequence piece
has a persistent transactional counter identified by scope type, the authoritative
agency/program/stream ID, and piece. Agency counters are shared across the agency;
program counters are shared across that program's streams; stream counters are
independent. Starts and increments are positive decimal integers; minimum width
pads with zeroes. Changing the format, start, scope, piece type or enablement never
resets a saved counter. Returning to a previous scope resumes its saved value.

Program counters require at least one program or stream business-field piece;
stream counters require at least one stream business-field piece. Agency counters
need no differentiator. Field presence prevents obvious duplicate patterns, but
abbreviations, extracted values and concatenated pieces are not necessarily unique.
The host retains its per-stream uniqueness boundary and skips existing numbers,
including soft-deleted agreements, for at most 100 candidates. Failed creation
rolls back every allocation. Existing agreement numbers are never rewritten.

Migration 0002 preserves old stream counters. Authored version-1 agency formats
normalize to stream scope for runtime continuity; empty configurations default to
agency scope. Old stream overrides are retained in storage but no longer used.
Saving an old format requires satisfying the new differentiator rule. This avoids
rejecting supported saved data while preventing new invalid configurations.

The preview uses sample business values and configured starting values. It does
not read or reserve a counter. Actual allocation occurs only in the authorized host
creation transaction. No external service, credentials, or other extension is
required.

## Independent verification

Run from this workspace:

- `bun run typecheck`
- `bun run test:unit`
- `bun run test:coverage`
- `NUMBERING_POSTGRES_TEST_URL=<disposable database ending in _test> bun run test:integration:postgres`
- `PLAYWRIGHT_BASE_URL=<compatible seeded host> bun run test:e2e`
- In the host workspace: `bun run test:e2e:managed tests/e2e/numbering.spec.ts`

The managed launcher is a workspace-only adapter to the host's existing isolated
server runner. The Playwright test itself uses public HTTP/UI contracts only and
can run against a separately started compatible host. Its seed account is
`root@example.com` / `password123`; use only an isolated demo/test host.

All extension implementation tests, fixtures, translations and migrations live
here. Host/private-tooling tests cover only the SDK and host boundaries. The independent public repository is `GCS-SSC/gcs-agreement-number`; the host
tracks it as a submodule. The initial numbering implementation is committed on
`feature/feat/agreement-number`.

## Translation ownership

Requires SDK 0.3.1. Interface catalogs live in this package's `i18n/` directory.
Define matching English/French keys and named placeholders with
`defineGcsExtensionMessages`, then use `useExtensionI18n(catalog)` in UI or
`translateGcsExtensionMessage` in shared/server code. There is no host message
lookup or fallback. Keep extension-authored common labels and validation text in
this package; treat bilingual domain values and already-localized errors as data.
The package owns translation tests and includes catalogs in its coverage inventory.
