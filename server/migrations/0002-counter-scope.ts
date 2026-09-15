import { defineGcsExtensionMigration } from '@gcs-ssc/extensions/server'
import { sql } from 'kysely'

export default defineGcsExtensionMigration({
  /** Preserves all existing stream counters while introducing additional scopes. */
  up: async db => {
    await sql`ALTER TABLE extensions.agreement_number_counters
      RENAME COLUMN stream_id TO scope_id`.execute(db)
    await sql`ALTER TABLE extensions.agreement_number_counters
      ADD COLUMN scope text NOT NULL DEFAULT 'stream' CHECK (scope IN ('agency', 'program', 'stream')),
      DROP CONSTRAINT agreement_number_counters_stream_id_piece_key,
      ADD UNIQUE (scope, scope_id, piece)`.execute(db)
  },
  /** Refuses to discard counters that cannot be represented by the old schema. */
  down: async db => {
    await sql`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM extensions.agreement_number_counters WHERE scope <> 'stream') THEN
        RAISE EXCEPTION 'Cannot downgrade while agency or program counters exist';
      END IF;
    END $$`.execute(db)
    await sql`ALTER TABLE extensions.agreement_number_counters
      DROP CONSTRAINT agreement_number_counters_scope_scope_id_piece_key,
      DROP COLUMN scope,
      ADD CONSTRAINT agreement_number_counters_stream_id_piece_key UNIQUE (scope_id, piece)`.execute(db)
    await sql`ALTER TABLE extensions.agreement_number_counters RENAME COLUMN scope_id TO stream_id`.execute(db)
  }
})
