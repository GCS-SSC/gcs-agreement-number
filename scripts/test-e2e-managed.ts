import { fileURLToPath } from 'node:url'
import { runManagedExtensionE2e } from '../../../scripts/extension-managed-e2e'

// Workspace-only launcher. The standalone Playwright suite also accepts any
// compatible host through PLAYWRIGHT_BASE_URL and imports no host implementation.
await runManagedExtensionE2e({
  acceptedSpec: 'tests/e2e/numbering.spec.ts',
  extensionKey: 'gcs-agreement-number',
  extensionRoot: fileURLToPath(new URL('../', import.meta.url)),
  suite: 'extension-agreement-number'
}, process.argv.slice(2))
