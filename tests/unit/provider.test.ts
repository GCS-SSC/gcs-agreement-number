import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Kysely, sql, type Transaction } from 'kysely'
import { KyselyPGlite } from 'kysely-pglite'
import type { GcsAgreementNumberProviderContext } from '@gcs-ssc/extensions/server'
import { GCS_AGREEMENT_NUMBER_FIELDS, type GcsAgreementNumberSources } from '@gcs-ssc/extensions'
import provider from '../../server/provider'
import migration from '../../server/migrations/0001-counters'
import scopeMigration from '../../server/migrations/0002-counter-scope'
import { defaultConfig, defaultPiece } from '../../shared/config'
import plugin, { validateConfiguration } from '../../server/plugins/configuration'

let db: Kysely<unknown>
const source = Object.fromEntries(GCS_AGREEMENT_NUMBER_FIELDS.map(field => [field, '2026-04-01'])) as GcsAgreementNumberSources
const context = (trx: Transaction<unknown>, patch = {}): GcsAgreementNumberProviderContext => ({ db: trx, agencyId: '1', programId: '2', streamId: '3', config: {}, agencyConfig: defaultConfig(), sources: source, ...patch })
beforeEach(async () => {
  db = new Kysely({ dialect: new KyselyPGlite().dialect })
  await sql`CREATE SCHEMA extensions`.execute(db)
  await migration.up(db)
  await scopeMigration.up(db)
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
  it('allocates independently per agency and survives changed start/width configuration', async () => {
    expect(await db.transaction().execute(trx => provider(context(trx)))).toBe('AGR-00001')
    expect(await db.transaction().execute(trx => provider(context(trx, { agencyId: '4' })))).toBe('AGR-00001')
    const changed = { ...defaultConfig(), body: { type: 'sequence', start: '900', increment: '2', width: 3 } }
    expect(await db.transaction().execute(trx => provider(context(trx, { agencyConfig: changed })))).toBe('AGR-002')
    expect(await db.transaction().execute(trx => provider(context(trx)))).toBe('AGR-00004')
  })
  it('rolls every piece back when downstream work fails', async () => {
    const config = { ...defaultConfig(), prefix: defaultPiece('sequence'), suffix: defaultPiece('sequence') }
    await expect(db.transaction().execute(async trx => {
      expect(await provider(context(trx, { agencyConfig: config }))).toBe('000010000100001')
      throw new Error('host hook failed')
    })).rejects.toThrow('host hook failed')
    expect(await db.transaction().execute(trx => provider(context(trx, { agencyConfig: config })))).toBe('000010000100001')
  })
  it('advances multiple candidates in one transaction and preserves counters while a piece is disabled', async () => {
    await db.transaction().execute(async trx => {
      expect(await provider(context(trx))).toBe('AGR-00001')
      expect(await provider(context(trx))).toBe('AGR-00002')
    })
    const moved = { ...defaultConfig(), body: defaultPiece('fixed'), suffix: defaultPiece('sequence') }
    expect(await db.transaction().execute(trx => provider(context(trx, { agencyConfig: moved })))).toBe('AGR-00001')
    expect(await db.transaction().execute(trx => provider(context(trx)))).toBe('AGR-00003')
  })
  it('uses only the agency format and resumes each scope when switching back', async () => {
    const allocate = (counterScope: 'agency' | 'program' | 'stream', patch = {}) => db.transaction().execute(trx => provider(context(trx, {
      config: { version: 0 }, agencyConfig: { ...defaultConfig(), counterScope, prefix: { ...defaultPiece('variable'), field: 'stream.id', transform: 'whole' } }, sources: { ...source, 'stream.id': 'S-' }, ...patch
    })))
    expect(await allocate('agency')).toBe('S-00001')
    expect(await allocate('agency', { programId: '9', streamId: '9' })).toBe('S-00002')
    expect(await allocate('program')).toBe('S-00001')
    expect(await allocate('program', { streamId: '9' })).toBe('S-00002')
    expect(await allocate('program', { programId: '9' })).toBe('S-00001')
    expect(await allocate('stream')).toBe('S-00001')
    expect(await allocate('stream', { streamId: '9' })).toBe('S-00001')
    expect(await allocate('agency')).toBe('S-00003')
    expect(await allocate('program')).toBe('S-00003')
    expect(await allocate('stream')).toBe('S-00002')
  })
  it('upgrades existing stream counters without resetting their next value', async () => {
    await scopeMigration.down!(db)
    await sql`INSERT INTO extensions.agreement_number_counters (stream_id, piece, next_value) VALUES (3, 'body', 71)`.execute(db)
    await scopeMigration.up(db)
    expect(await db.transaction().execute(trx => provider(context(trx, { agencyConfig: { ...defaultConfig(), version: 1, inheritAgency: false } })))).toBe('AGR-00071')
    await db.transaction().execute(trx => provider(context(trx)))
    await expect(scopeMigration.down!(db)).rejects.toThrow('Cannot downgrade')
  })
  it('rolls back on invalid extraction and output overflow with bilingual errors', async () => {
    const config = { ...defaultConfig(), suffix: defaultPiece('variable') }
    await expect(db.transaction().execute(trx => provider(context(trx, { agencyConfig: config, sources: {} })))).rejects.toMatchObject({ code: 'AGREEMENT_NUMBER_CONFIGURATION_INVALID', localizedMessage: { en: expect.any(String), fr: expect.any(String) } })
    expect(await db.transaction().execute(trx => provider(context(trx)))).toBe('AGR-00001')
    await sql`UPDATE extensions.agreement_number_counters SET next_value = 999999999999999`.execute(db)
    await expect(db.transaction().execute(trx => provider(context(trx)))).rejects.toMatchObject({ code: 'AGREEMENT_NUMBER_CONFIGURATION_INVALID' })
  })
  it('preserves database errors and supports migration down', async () => {
    await migration.down!(db)
    await expect(db.transaction().execute(trx => provider(context(trx)))).rejects.toMatchObject({ code: '42P01' })
  })
  it('validates configuration independently of the host schema', () => {
    const base = { extensionKey: 'gcs-agreement-number', targetExtensionKey: 'gcs-agreement-number', event: {}, db: {} as Transaction<unknown>, scope: 'agency' as const, agencyId: '1', enabled: true, config: defaultConfig() }
    expect(() => validateConfiguration(base)).not.toThrow()
    expect(() => validateConfiguration({ ...base, config: undefined })).not.toThrow()
    expect(() => validateConfiguration({ ...base, targetExtensionKey: 'unrelated', config: { version: 0 } })).not.toThrow()
    expect(() => validateConfiguration({ ...base, config: { version: 0 } })).toThrow()
    expect(() => validateConfiguration({ ...base, scope: 'stream', config: defaultConfig() })).toThrow()
    expect(() => validateConfiguration({ ...base, config: { ...defaultConfig(), counterScope: 'program' } })).toThrow()
    expect(() => validateConfiguration({ ...base, config: { ...defaultConfig(), version: 1, inheritAgency: false } })).toThrow()
    expect(() => validateConfiguration({ ...base, config: { ...defaultConfig(), counterScope: 'program', prefix: { ...defaultPiece('variable'), field: 'program.id', transform: 'whole' } } })).not.toThrow()
  })
})
