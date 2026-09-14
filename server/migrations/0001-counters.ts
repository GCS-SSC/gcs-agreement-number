import { defineGcsExtensionMigration } from '@gcs-ssc/extensions/server'
import { sql } from 'kysely'

export default defineGcsExtensionMigration({
  /**
   * Creates extension-owned transactional counter storage.
   * @param db - Extension migration database.
   */
  up: async db => {
    await sql`CREATE TABLE extensions.agreement_number_counters (
      id bigserial PRIMARY KEY,
      stream_id bigint NOT NULL,
      piece text NOT NULL CHECK (piece IN ('prefix', 'body', 'suffix')),
      next_value numeric(30,0) NOT NULL CHECK (next_value > 0),
      UNIQUE (stream_id, piece)
    )`.execute(db)
  },
  down: async db => { await sql`DROP TABLE extensions.agreement_number_counters`.execute(db) }
})
