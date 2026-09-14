import { z } from 'zod'
import { RE2JS } from 're2js'
import { GCS_AGREEMENT_NUMBER_FIELDS, type GcsAgreementNumberSources } from '@gcs-ssc/extensions'

export const PIECES = ['prefix', 'body', 'suffix'] as const
export const TRANSFORMS = ['whole', 'year', 'year2', 'substring', 'upper', 'lower', 'regex'] as const
const integer = z.string().regex(/^[1-9][0-9]{0,14}$/, { error: 'validation.sequence' })
const bounded = (min: number, max: number) => z.union([z.number(), z.string().trim().min(1)]).transform(Number).pipe(z.number().int().min(min).max(max))
export const PieceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixed'), value: z.string().refine(value => Array.from(value).length <= 15 && !value.includes('\u0000'), { error: 'validation.length' }) }),
  z.object({ type: z.literal('sequence'), start: integer, increment: integer, width: bounded(1, 15) }),
  z.object({
    type: z.literal('variable'), field: z.enum(GCS_AGREEMENT_NUMBER_FIELDS), transform: z.enum(TRANSFORMS),
    offset: bounded(0, 4096), length: bounded(1, 15), pattern: z.string().max(256), group: bounded(0, 32)
  })
])
export const ConfigSchema = z.object({
  version: z.literal(1), inheritAgency: z.boolean(),
  prefix: PieceSchema, body: PieceSchema, suffix: PieceSchema
}).superRefine((config, ctx) => {
  if (config.inheritAgency) return
  if (!PIECES.some(piece => config[piece].type === 'sequence')) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'validation.sequence_required' })
  }
  let minimumLength = 0
  for (const name of PIECES) {
    const piece = config[name]
    minimumLength += piece.type === 'fixed' ? Array.from(piece.value).length : piece.type === 'sequence' ? Math.max(piece.width, piece.start.length) : 1
    if (piece.type !== 'variable' || piece.transform !== 'regex') continue
    try {
      if (!piece.pattern || RE2JS.compile(piece.pattern).groupCount() < piece.group) throw new Error('Invalid capture')
    } catch {
      ctx.addIssue({ code: 'custom', path: [name, 'pattern'], message: 'validation.regex' })
    }
  }
  if (minimumLength > 15) ctx.addIssue({ code: 'custom', path: ['body'], message: 'validation.length' })
})
export type NumberConfig = z.infer<typeof ConfigSchema>
export type NumberPiece = z.infer<typeof PieceSchema>
/**
 *
 * @param type - Requested piece kind.
 * @returns The validated or generated result.
 */
export const defaultPiece = (type: NumberPiece['type']): NumberPiece => {
  if (type === 'fixed') return { type, value: '' }
  if (type === 'sequence') return { type, start: '1', increment: '1', width: 5 }
  return { type, field: 'agreement.startDate', transform: 'year2', offset: 0, length: 2, pattern: '^([0-9]{4})', group: 1 }
}
export const defaultConfig = (): NumberConfig => ({
  version: 1, inheritAgency: false,
  prefix: { type: 'fixed', value: 'AGR-' }, body: defaultPiece('sequence'), suffix: defaultPiece('fixed')
})
/**
 * Empty saved configuration is the host's unauthored enablement shape.
 * @param value - Persisted configuration or source value.
 * @returns The validated or generated result.
 */
export const parseConfig = (value: unknown): NumberConfig => ConfigSchema.parse(
  value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0 ? defaultConfig() : value
)
/**
 *
 * @param stream - Stream configuration.
 * @param agency - Agency defaults.
 * @returns The validated or generated result.
 */
export const effectiveConfig = (stream: unknown, agency: unknown): NumberConfig => {
  const config = parseConfig(stream)
  if (!config.inheritAgency) return config
  const inherited = parseConfig(agency)
  if (inherited.inheritAgency) throw new Error('Agency configuration cannot inherit')
  return inherited
}
/**
 * Calendar strings are sliced directly; no timezone-dependent Date conversion occurs.
 * @param piece - Variable extraction rule.
 * @param sources - Authoritative creation-time values.
 * @returns The validated or generated result.
 */
export const renderVariable = (piece: Extract<NumberPiece, { type: 'variable' }>, sources: GcsAgreementNumberSources): string => {
  const source = sources[piece.field]
  if (typeof source !== 'string' || !source.length || source.length > 4096) throw new Error('Missing or oversized source')
  let value = source
  if (piece.transform === 'year' || piece.transform === 'year2') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) throw new Error('Not a calendar date')
    value = piece.transform === 'year' ? source.slice(0, 4) : source.slice(2, 4)
  } else if (piece.transform === 'substring') value = Array.from(source).slice(piece.offset, piece.offset + piece.length).join('')
  else if (piece.transform === 'upper') value = source.toUpperCase()
  else if (piece.transform === 'lower') value = source.toLowerCase()
  else if (piece.transform === 'regex') {
    const matcher = RE2JS.compile(piece.pattern).matcher(source)
    if (!matcher.find()) throw new Error('No match')
    value = matcher.group(piece.group) ?? ''
  }
  if (!value) throw new Error('Empty extraction')
  return value
}
/**
 *
 * @param config - Validated numbering configuration.
 * @param sources - Authoritative creation-time values.
 * @param sequences - Allocated decimal values by piece.
 * @returns The validated or generated result.
 */
export const renderNumber = (config: NumberConfig, sources: GcsAgreementNumberSources, sequences: Partial<Record<typeof PIECES[number], string>>): string => {
  const value = PIECES.map(name => {
    const piece = config[name]
    if (piece.type === 'fixed') return piece.value
    if (piece.type === 'variable') return renderVariable(piece, sources)
    const sequence = sequences[name]
    if (!sequence) throw new Error('Missing sequence')
    return sequence.padStart(piece.width, '0')
  }).join('')
  if (!value.trim() || value.trim() !== value || Array.from(value).length > 15 || value.includes('\u0000')) throw new Error('Invalid number length or whitespace')
  return value
}
