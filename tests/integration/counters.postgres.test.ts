/* eslint-disable jsdoc/require-jsdoc -- Integration fixture helpers are local to their scenarios. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import provider from '../../server/provider'
import migration from '../../server/migrations/0001-counters'
import { defaultConfig, defaultPiece } from '../../shared/config'
import type { GcsAgreementNumberSources } from '@gcs-ssc/extensions'

const url = process.env.NUMBERING_POSTGRES_TEST_URL
const suite = url ? describe : describe.skip
suite('PostgreSQL atomic counters', () => {
  let db: Kysely<unknown>
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('An explicit disposable *_test database is required')
    db = new Kysely({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: url, max: 12 }) }) })
    // Fail rather than overwrite any pre-existing table; this suite owns its fresh database.
    await sql`CREATE SCHEMA IF NOT EXISTS extensions`.execute(db)
    await migration.up(db)
  })
  afterAll(async () => {
    if (db) {
      await migration.down!(db)
      await db.destroy()
    }
  })
  it('serializes concurrent requests without duplicates across all three pieces', async () => {
    const config = { ...defaultConfig(), prefix: defaultPiece('sequence'), suffix: defaultPiece('sequence') }
    const numbers = await Promise.all(Array.from({ length: 24 }, () => db.transaction().execute(trx => provider({ db: trx, agencyId: '1', programId: '1', streamId: '1', config, agencyConfig: {}, sources: {} as GcsAgreementNumberSources }))))
    expect(new Set(numbers).size).toBe(24)
    expect(numbers.sort()[0]).toBe('000010000100001')
    expect(numbers.sort().at(-1)).toBe('000240002400024')
  })
  it('rolls back failed allocation and allows subsequent transactions to continue', async () => {
    const generate = (fail: boolean) => db.transaction().execute(async trx => {
      const number = await provider({ db: trx, agencyId: '1', programId: '1', streamId: '2', config: defaultConfig(), agencyConfig: {}, sources: {} as GcsAgreementNumberSources })
      if (fail) throw new Error('host rejected')
      return number
    })
    await expect(generate(true)).rejects.toThrow('host rejected')
    expect(await generate(false)).toBe('AGR-00001')
  })
})
