import { defineGcsExtensionMigration } from '@gcs-ssc/extensions/server'
import { sql } from 'kysely'

export default defineGcsExtensionMigration({
  /** Preserves all existing stream counters while introducing additional scopes. */
  up: async db => {
    await sql`ALTER TABLE extensions.gcs_agreement_number_counters
      RENAME COLUMN stream_id TO scope_id`.execute(db)
    await sql`ALTER TABLE extensions.gcs_agreement_number_counters
      ADD COLUMN scope text NOT NULL DEFAULT 'stream' CONSTRAINT gcs_agreement_number_counters_chk_scope CHECK (scope IN ('agency', 'program', 'stream')),
      DROP CONSTRAINT gcs_agreement_number_counters_stream_id_piece_key,
      ADD CONSTRAINT gcs_agreement_number_counters_uk_scope_piece UNIQUE (scope, scope_id, piece)`.execute(db)
  },
  /** Refuses to discard counters that cannot be represented by the old schema. */
  down: async db => {
    await sql`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM extensions.gcs_agreement_number_counters WHERE scope <> 'stream') THEN
        RAISE EXCEPTION 'Cannot downgrade while agency or program counters exist';
      END IF;
    END $$`.execute(db)
    await sql`ALTER TABLE extensions.gcs_agreement_number_counters
      DROP CONSTRAINT gcs_agreement_number_counters_uk_scope_piece,
      DROP COLUMN scope,
      ADD CONSTRAINT gcs_agreement_number_counters_stream_id_piece_key UNIQUE (scope_id, piece)`.execute(db)
    await sql`ALTER TABLE extensions.gcs_agreement_number_counters RENAME COLUMN scope_id TO stream_id`.execute(db)
  }
})
