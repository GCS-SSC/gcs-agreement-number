# Agreement numbering

Requires GCS-SSC SDK 0.2.2 and the `agreement-number-provider` and
`configuration-access` host capabilities. Enable for an Agency, then for each
Stream that should generate numbers. Managers configure Agency defaults and
Stream overrides using the existing extension settings dialog.

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

Each Stream and piece has a persistent transactional counter. Starts and increments
are positive decimal integers; minimum width pads with zeroes. Existing counters
ignore later changes to starting value and continue across format changes, piece
type changes and disable/re-enable. There is no reset operation. Values never wrap
or truncate. The host may allocate more than once to skip an existing identifier;
all allocations roll back when creation fails. Existing profiles are never
renumbered by this extension.

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
here. Host/private-tooling tests cover only the SDK and host boundaries. This new
workspace has not been committed or published; register its independent repository
and gitlink when preparing commits, before updating the host pin.
