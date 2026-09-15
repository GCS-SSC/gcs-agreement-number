import { sql } from 'kysely'
import { createGcsExtensionUserError, type GcsAgreementNumberProvider } from '@gcs-ssc/extensions/server'
import { parseConfig, PIECES, renderNumber } from '../shared/config.ts'

/**
 * Uses only extension-owned storage and the transaction explicitly supplied by the host.
 * @param context - Host-supplied transaction and configuration context.
 * @returns The validated or generated result.
 */
const provider: GcsAgreementNumberProvider = async context => {
  try {
    const config = parseConfig(context.agencyConfig)
    const scopeId = { agency: context.agencyId, program: context.programId, stream: context.streamId }[config.counterScope]
    const sequences: Partial<Record<typeof PIECES[number], string>> = {}
    for (const name of PIECES) {
      const piece = config[name]
      if (piece.type !== 'sequence') continue
      const result = await sql<{ value: string }>`
        INSERT INTO extensions.agreement_number_counters (scope, scope_id, piece, next_value)
        VALUES (${config.counterScope}, ${scopeId}, ${name}, CAST(${piece.start} AS numeric) + CAST(${piece.increment} AS numeric))
        ON CONFLICT (scope, scope_id, piece) DO UPDATE
          SET next_value = extensions.agreement_number_counters.next_value + CAST(${piece.increment} AS numeric)
        RETURNING (next_value - CAST(${piece.increment} AS numeric))::text AS value
      `.execute(context.db)
      sequences[name] = result.rows[0]!.value
    }
    return renderNumber(config, context.sources, sequences)
  } catch (error) {
    // Database failures retain their original diagnostics and transaction semantics.
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) throw error
    throw createGcsExtensionUserError({
      statusCode: 400, code: 'AGREEMENT_NUMBER_CONFIGURATION_INVALID',
      message: {
        en: 'The numbering format could not produce a valid number. Check source values, extraction rules, sequence width, and the 15-character limit.',
        fr: 'Le format de numérotation n’a pas produit de numéro valide. Vérifiez les valeurs sources, les règles d’extraction, la largeur de séquence et la limite de 15 caractères.'
      }
    })
  }
}
export default provider
