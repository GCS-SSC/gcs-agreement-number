import { RE2JS } from 're2js'
import { GCS_AGREEMENT_NUMBER_FIELDS, translateGcsExtensionMessage, type GcsAgreementNumberSources } from '@gcs-ssc/extensions'
import { ConfigSchema, PIECES, renderVariable } from './config'
import { messages } from '../i18n/messages'

type Preview = { status: 'success' | 'warning' | 'error'; number: string | null; reasons: string[] }

/**
 * Explain definite configuration failures separately from failures against illustrative source values.
 * @param value - Current authoring configuration, including incomplete input.
 * @param locale - Active extension locale.
 * @returns Example number or localized reasons with their certainty.
 */
export const getNumberPreview = (value: unknown, locale: string): Preview => {
  const t = (key: keyof typeof messages.en, values: Record<string, string | number> = {}) => translateGcsExtensionMessage(messages, locale, key, values)
  const parsed = ConfigSchema.safeParse(value)
  if (!parsed.success) {
    const reasons = parsed.error.issues.map(issue => {
      if (issue.message === 'validation.sequence_required') return t('previewSequenceRequired')
      if (issue.message === 'validation.differentiator') return t('differentiator')
      const name = issue.path[0]
      const piece = PIECES.find(candidate => candidate === name)
      const context = piece ? t(piece) : t('title')
      if (issue.message === 'validation.regex') return t('previewInvalidRegex', { piece: context })
      if (issue.message === 'validation.length') return t(issue.path[1] === 'value' ? 'previewFixedInvalid' : 'previewMinimumLength', { piece: context })
      const field = issue.path.at(-1)
      const labels = ['counterScope', 'type', 'value', 'field', 'transform', 'start', 'increment', 'width', 'offset', 'length', 'pattern', 'group'] as const
      const label = labels.find(candidate => candidate === field)
      return t('previewInvalidField', { piece: context, field: label ? t(label) : t('title') })
    })
    return { status: 'error', number: null, reasons: [...new Set(reasons)] }
  }
  const config = parsed.data
  const errors: string[] = []
  const warnings: string[] = []
  const active = PIECES.map(name => config[name]).filter(piece => piece.type !== 'fixed' || piece.value !== '')
  const first = active[0]
  const last = active.at(-1)
  if ((first?.type === 'fixed' && first.value.trimStart() !== first.value)
    || (last?.type === 'fixed' && last.value.trimEnd() !== last.value)) errors.push(t('previewWhitespace'))
  const sources = Object.fromEntries(GCS_AGREEMENT_NUMBER_FIELDS.map(field => [field, field.endsWith('Date') ? '2026-04-01' : field.endsWith('.id') ? '12' : 'ABC'])) as GcsAgreementNumberSources
  const parts = PIECES.map(name => {
    const piece = config[name]
    if (piece.type === 'fixed') return piece.value
    if (piece.type === 'sequence') return piece.start.padStart(piece.width, '0')
    const context = { piece: t(name), field: t(piece.field), sample: sources[piece.field] }
    if (piece.transform === 'substring' && piece.offset >= 4096) {
      errors.push(t('previewOffsetImpossible', { piece: t(name) }))
      return ''
    }
    if (piece.transform === 'regex') {
      const matcher = RE2JS.compile(piece.pattern).matcher(sources[piece.field])
      if (!matcher.find()) {
        warnings.push(t('previewNoMatch', context))
        return ''
      }
      const captured = matcher.group(piece.group) ?? ''
      if (!captured) warnings.push(t('previewEmptyCapture', context))
      return captured
    }
    try {
      return renderVariable(piece, sources)
    } catch {
      warnings.push(t('previewEmptySubstring', context))
      return ''
    }
  })
  if (errors.length) return { status: 'error', number: null, reasons: errors }
  const number = parts.join('')
  const count = Array.from(number).length
  if (count > 15) warnings.push(t('previewSampleLength', { count }))
  if (number.trim() !== number || number.includes('\u0000')) warnings.push(t('previewSampleCharacters'))
  if (warnings.length) return { status: 'warning', number: null, reasons: warnings }
  return { status: 'success', number, reasons: [] }
}
