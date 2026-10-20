import { execFile, execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const run = promisify(execFile)

it('holds the canonical artifact lock through staging, server, tests and cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agreement-number-lock-'))
  const extensionRoot = new URL('../../', import.meta.url).pathname
  const hostRoot = new URL('../../../../', import.meta.url).pathname
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
  const bun = execFileSync('which', ['bun'], { encoding: 'utf8' }).trim()
  try {
    await mkdir(join(root, 'scripts'), { recursive: true })
    await mkdir(join(root, 'bin'))
    await mkdir(join(root, 'extensions/gcs-agreement-number'), { recursive: true })
    await copyFile(join(hostRoot, 'scripts/nuxt-artifact-lock.ts'), join(root, 'scripts/nuxt-artifact-lock.ts'))
    const child = join(root, 'runner.ts')
    await writeFile(child, `
      import { EventEmitter } from 'node:events'
      import { runManagedExtensionE2e } from ${JSON.stringify(join(hostRoot, 'scripts/extension-managed-e2e.ts'))}
      const stages: string[] = []
      const lock = ${JSON.stringify(join(root, '.tools/locks/nuxt-artifact.lock'))}
      const check = (stage: string) => {
        if (Bun.spawnSync(['flock', '--nonblock', lock, 'true']).exitCode !== 1) throw new Error('Artifact lock released during ' + stage)
        stages.push(stage)
      }
      let finishServer: (code: number) => void = () => {}
      const serverExited = new Promise<number>(resolve => { finishServer = resolve })
      await runManagedExtensionE2e({
        acceptedSpec: 'tests/e2e/numbering.spec.ts', extensionKey: 'gcs-agreement-number',
        extensionRoot: ${JSON.stringify(extensionRoot)}, suite: 'lock-proof'
      }, ['tests/e2e/numbering.spec.ts'], process.env, {
        allocatePort: async () => 43125,
        createDataPaths: async () => {
          check('staging')
          return { pgliteDataDir: '/unused', localFileStorageDir: '/unused', cleanup: async () => { check('cleanup') } }
        },
        prepareHost: async () => { check('build-and-migration') },
        spawn: command => {
          const server = command[0] === 'node'
          check(server ? 'server' : 'playwright')
          return { exited: server ? serverExited : Promise.resolve(0), exitCode: null, signalCode: null, kill: () => { if (server) finishServer(0); return true } }
        },
        waitForHost: async () => { check('server-ready') },
        signalSource: new EventEmitter(), exit: code => { throw new Error('Unexpected exit ' + code) }
      })
      console.log(JSON.stringify(stages))
    `)
    await writeFile(join(root, 'bin/bun'), `#!/bin/sh\nif [ "$2" = "scripts/nuxt-artifact-lock.ts" ]; then exec "$LOCK_TEST_BUN" "$@"; fi\nexec "$LOCK_TEST_BUN" "$LOCK_TEST_CHILD"\n`, { mode: 0o755 })
    const environment: NodeJS.ProcessEnv = { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, LOCK_TEST_BUN: bun, LOCK_TEST_CHILD: child }
    delete environment.GCS_SSC_NUXT_ARTIFACT_LOCK_HELD
    await expect(run('sh', ['-c', 'bun scripts/test-e2e-managed.ts'], {
      cwd: join(root, 'extensions/gcs-agreement-number'), env: environment
    })).rejects.toThrow('Artifact lock released during staging')
    const result = await run('sh', ['-c', manifest.scripts['test:e2e:managed']], {
      cwd: join(root, 'extensions/gcs-agreement-number'), env: environment
    })
    expect(result.stdout).toContain('["staging","build-and-migration","server","server-ready","playwright","cleanup"]')
    await expect(run('flock', ['--nonblock', join(root, '.tools/locks/nuxt-artifact.lock'), 'true'])).resolves.toBeDefined()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 15000)
