import { describe, expect, it } from 'vitest'
import { GCS_AGREEMENT_NUMBER_FIELDS, type GcsAgreementNumberSources } from '@gcs-ssc/extensions'
import { ConfigSchema, defaultConfig, defaultPiece, effectiveConfig, parseConfig, renderNumber, renderVariable, type NumberPiece } from '../../shared/config'
import { messages } from '../../shared/messages'

const sources = Object.fromEntries(GCS_AGREEMENT_NUMBER_FIELDS.map(field => [field, '2026-04-01'])) as GcsAgreementNumberSources
const variable = (patch = {}): Extract<NumberPiece, { type: 'variable' }> => ({ ...defaultPiece('variable'), ...patch }) as Extract<NumberPiece, { type: 'variable' }>
describe('number format', () => {
  it('normalizes only unauthored configuration and resolves explicit inheritance', () => {
    expect(parseConfig({})).toEqual(defaultConfig())
    expect(effectiveConfig({}, {})).toEqual(defaultConfig())
    expect(effectiveConfig({ ...defaultConfig(), inheritAgency: true }, {})).toEqual(defaultConfig())
    expect(() => effectiveConfig({ ...defaultConfig(), inheritAgency: true }, { ...defaultConfig(), inheritAgency: true })).toThrow()
    for (const value of [null, undefined, { version: 0 }, [], { prefix: {} }]) expect(() => parseConfig(value)).toThrow()
  })
  it('requires a sequence in any position and enforces minimum complete length', () => {
    const config = defaultConfig()
    config.body = defaultPiece('fixed')
    expect(ConfigSchema.safeParse(config).success).toBe(false)
    for (const name of ['prefix', 'body', 'suffix'] as const) {
      const candidate = { ...config, [name]: defaultPiece('sequence') }
      expect(ConfigSchema.safeParse(candidate).success).toBe(true)
    }
    expect(ConfigSchema.safeParse({ ...defaultConfig(), prefix: { type: 'fixed', value: 'X'.repeat(15) } }).success).toBe(false)
  })
  it.each(['0', '-1', '1.5', '1e3', '9999999999999999', ''])('rejects invalid sequence input %s', start => {
    expect(ConfigSchema.safeParse({ ...defaultConfig(), body: { type: 'sequence', start, increment: '1', width: 5 } }).success).toBe(false)
  })
  it.each([
    ['whole', '2026-04-01'], ['year', '2026'], ['year2', '26'], ['substring', '26'],
    ['regex', '2026'], ['upper', '2026-04-01'], ['lower', '2026-04-01']
  ])('extracts %s', (transform, expected) => {
    expect(renderVariable(variable({ transform, offset: 2 }), sources)).toBe(expected)
  })
  it('uses explicitly selected bilingual fields and case transforms', () => {
    const values = { ...sources, 'agency.name_en': 'Agency', 'agency.name_fr': 'Agence' }
    expect(renderVariable(variable({ field: 'agency.name_fr', transform: 'upper' }), values)).toBe('AGENCE')
    expect(renderVariable(variable({ field: 'agency.name_en', transform: 'lower' }), values)).toBe('agency')
  })
  it('rejects invalid regex and unsupported backreferences when saving', () => {
    for (const pattern of ['[', '(a)\\1', '', '(?=a)a']) {
      expect(ConfigSchema.safeParse({ ...defaultConfig(), suffix: variable({ transform: 'regex', pattern }) }).success).toBe(false)
    }
    expect(ConfigSchema.safeParse({ ...defaultConfig(), suffix: variable({ transform: 'regex', group: 2 }) }).success).toBe(false)
    expect(ConfigSchema.safeParse({ ...defaultConfig(), suffix: variable({ transform: 'regex' }) }).success).toBe(true)
  })
  it('rejects missing values, empty captures, no match and non-date date extraction', () => {
    for (const source of ['', 'not-a-date', 'x'.repeat(4097)]) {
      expect(() => renderVariable(variable(), { ...sources, 'agreement.startDate': source })).toThrow()
    }
    expect(() => renderVariable(variable({ transform: 'regex', pattern: '^XYZ', group: 0 }), sources)).toThrow()
    expect(() => renderVariable(variable({ transform: 'regex', pattern: '^(XYZ)?', group: 1 }), sources)).toThrow()
    expect(() => renderVariable(variable({ transform: 'substring', offset: 100 }), sources)).toThrow()
  })
  it('concatenates pieces without hidden separators and never truncates counters', () => {
    expect(renderNumber(defaultConfig(), sources, { body: '1' })).toBe('AGR-00001')
    expect(renderNumber({ ...defaultConfig(), suffix: variable() }, sources, { body: '12' })).toBe('AGR-0001226')
    expect(renderNumber(defaultConfig(), sources, { body: '123456' })).toBe('AGR-123456')
    expect(renderNumber({ ...defaultConfig(), prefix: { type: 'fixed', value: '🚀'.repeat(10) } }, sources, { body: '1' })).toBe('🚀'.repeat(10) + '00001')
    expect(() => renderNumber(defaultConfig(), sources, {})).toThrow()
    expect(() => renderNumber(defaultConfig(), sources, { body: '123456789012' })).toThrow()
    expect(() => renderNumber({ ...defaultConfig(), prefix: { type: 'fixed', value: ' ' } }, sources, { body: '1' })).toThrow()
  })
  it('ships the same independently owned labels in both languages', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort())
    for (const field of GCS_AGREEMENT_NUMBER_FIELDS) expect(messages.fr[field]).toBeTruthy()
  })
})
