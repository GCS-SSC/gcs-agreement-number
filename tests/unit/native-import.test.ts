import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('loads server contributions with native Node ESM, without a bundler resolver', () => {
  const extensionRoot = fileURLToPath(new URL('../../', import.meta.url))
  const result = spawnSync('node', ['--input-type=module', '-e', `
    const provider = await import('./server/provider.ts');
    const configuration = await import('./server/plugins/configuration.ts');
    if (typeof provider.default !== 'function' || typeof configuration.validateConfiguration !== 'function') {
      throw new Error('Missing server contribution exports');
    }
    configuration.validateConfiguration({
      targetExtensionKey: 'gcs-agreement-number', scope: 'agency', config: {}
    });
  `], { cwd: extensionRoot, encoding: 'utf8' })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
})
