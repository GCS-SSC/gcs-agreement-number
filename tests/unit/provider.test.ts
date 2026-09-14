import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Kysely, sql, type Transaction } from 'kysely'
import { KyselyPGlite } from 'kysely-pglite'
import type { GcsAgreementNumberProviderContext } from '@gcs-ssc/extensions/server'
import { GCS_AGREEMENT_NUMBER_FIELDS, type GcsAgreementNumberSources } from '@gcs-ssc/extensions'
import provider from '../../server/provider'
import migration from '../../server/migrations/0001-counters'
import { defaultConfig, defaultPiece } from '../../shared/config'
import plugin, { validateConfiguration } from '../../server/plugins/configuration'

let db: Kysely<unknown>
const source = Object.fromEntries(GCS_AGREEMENT_NUMBER_FIELDS.map(field => [field, '2026-04-01'])) as GcsAgreementNumberSources
const context = (trx: Transaction<unknown>, patch = {}): GcsAgreementNumberProviderContext => ({ db: trx, agencyId: '1', programId: '2', streamId: '3', config: defaultConfig(), agencyConfig: {}, sources: source, ...patch })
beforeEach(async () => {
  db = new Kysely({ dialect: new KyselyPGlite().dialect })
  await sql`CREATE SCHEMA extensions`.execute(db)
  await migration.up(db)
})
afterEach(async () => {
  await db.destroy()
})
describe('transactional number allocation', () => {
  it('registers the configuration guard through the SDK lifecycle hook', () => {
    const hook = vi.fn()
    plugin({ hooks: { hook } })
    expect(hook).toHaveBeenCalledOnce()
  })
  it('allocates independently per stream and survives changed start/width configuration', async () => {
    expect(await db.transaction().execute(trx => provider(context(trx)))).toBe('AGR-00001')
    expect(await db.transaction().execute(trx => provider(context(trx, { streamId: '4' })))).toBe('AGR-00001')
    const changed = { ...defaultConfig(), body: { type: 'sequence', start: '900', increment: '2', width: 3 } }
    expect(await db.transaction().execute(trx => provider(context(trx, { config: changed })))).toBe('AGR-002')
    expect(await db.transaction().execute(trx => provider(context(trx)))).toBe('AGR-00004')
  })
  it('rolls every piece back when downstream work fails', async () => {
    const config = { ...defaultConfig(), prefix: defaultPiece('sequence'), suffix: defaultPiece('sequence') }
    await expect(db.transaction().execute(async trx => {
      expect(await provider(context(trx, { config }))).toBe('000010000100001')
      throw new Error('host hook failed')
    })).rejects.toThrow('host hook failed')
    expect(await db.transaction().execute(trx => provider(context(trx, { config })))).toBe('000010000100001')
  })
  it('advances multiple candidates in one transaction and preserves counters while a piece is disabled', async () => {
    await db.transaction().execute(async trx => {
      expect(await provider(context(trx))).toBe('AGR-00001')
      expect(await provider(context(trx))).toBe('AGR-00002')
    })
    const moved = { ...defaultConfig(), body: defaultPiece('fixed'), suffix: defaultPiece('sequence') }
    expect(await db.transaction().execute(trx => provider(context(trx, { config: moved })))).toBe('AGR-00001')
    expect(await db.transaction().execute(trx => provider(context(trx)))).toBe('AGR-00003')
  })
  it('inherits the agency format but keeps stream counters', async () => {
    const config = { ...defaultConfig(), inheritAgency: true }
    const agencyConfig = { ...defaultConfig(), prefix: { type: 'fixed', value: 'A-' } }
    expect(await db.transaction().execute(trx => provider(context(trx, { config, agencyConfig })))).toBe('A-00001')
  })
  it('rolls back on invalid extraction and output overflow with bilingual errors', async () => {
    const config = { ...defaultConfig(), suffix: defaultPiece('variable') }
    await expect(db.transaction().execute(trx => provider(context(trx, { config, sources: {} })))).rejects.toMatchObject({ code: 'AGREEMENT_NUMBER_CONFIGURATION_INVALID', localizedMessage: { en: expect.any(String), fr: expect.any(String) } })
    expect(await db.transaction().execute(trx => provider(context(trx)))).toBe('AGR-00001')
    await sql`UPDATE extensions.agreement_number_counters SET next_value = 999999999999999`.execute(db)
    await expect(db.transaction().execute(trx => provider(context(trx)))).rejects.toMatchObject({ code: 'AGREEMENT_NUMBER_CONFIGURATION_INVALID' })
  })
  it('preserves database errors and supports migration down', async () => {
    await migration.down!(db)
    await expect(db.transaction().execute(trx => provider(context(trx)))).rejects.toMatchObject({ code: '42P01' })
  })
  it('validates configuration independently of the host schema', () => {
    const base = { extensionKey: 'gcs-agreement-number', targetExtensionKey: 'gcs-agreement-number', event: {}, db: {} as Transaction<unknown>, scope: 'stream' as const, agencyId: '1', enabled: true, config: defaultConfig() }
    expect(() => validateConfiguration(base)).not.toThrow()
    expect(() => validateConfiguration({ ...base, config: undefined })).not.toThrow()
    expect(() => validateConfiguration({ ...base, targetExtensionKey: 'unrelated', config: { version: 0 } })).not.toThrow()
    expect(() => validateConfiguration({ ...base, config: { version: 0 } })).toThrow()
    expect(() => validateConfiguration({ ...base, scope: 'agency', config: { ...defaultConfig(), inheritAgency: true } })).toThrow()
  })
})
