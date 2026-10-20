import { defineGcsExtensionMigration } from '@gcs-ssc/extensions/server'
import { sql } from 'kysely'

export default defineGcsExtensionMigration({
  /**
   * Creates extension-owned transactional counter storage.
   * @param db - Extension migration database.
   */
  up: async db => {
    await sql`CREATE TABLE extensions.gcs_agreement_number_counters (
      id bigserial PRIMARY KEY,
      stream_id bigint NOT NULL,
      piece text NOT NULL CONSTRAINT gcs_agreement_number_counters_chk_piece CHECK (piece IN ('prefix', 'body', 'suffix')),
      next_value numeric(30,0) NOT NULL CONSTRAINT gcs_agreement_number_counters_chk_next_value CHECK (next_value > 0),
      UNIQUE (stream_id, piece)
    )`.execute(db)
  },
  down: async db => { await sql`DROP TABLE extensions.gcs_agreement_number_counters`.execute(db) }
})
