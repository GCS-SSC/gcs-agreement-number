import { describe, expect, it } from 'vitest'
import { defaultConfig, defaultPiece } from '../../shared/config'
import { getNumberPreview } from '../../shared/preview'

const variable = (patch = {}) => ({ ...defaultPiece('variable'), ...patch })
const preview = (patch = {}) => getNumberPreview({ ...defaultConfig(), ...patch }, 'en')

describe('number preview diagnostics', () => {
  it('renders a valid example', () => {
    expect(preview()).toEqual({ status: 'success', number: 'AGR-00001', reasons: [] })
    expect(preview({ suffix: variable() }).number).toBe('AGR-0000126')
    expect(preview({ suffix: variable({ transform: 'substring', offset: 2 }) }).number).toBe('AGR-0000126')
  })
  it.each([
    [{ body: defaultPiece('fixed') }, 'Include at least one sequence'],
    [{ counterScope: 'stream' }, 'Stream counters require'],
    [{ suffix: variable({ pattern: '[' }) }, 'regular expression is invalid'],
    [{ suffix: variable({ group: 2 }) }, 'capture group does not exist'],
    [{ prefix: { type: 'fixed', value: 'X'.repeat(15) } }, 'require more than 15'],
    [{ prefix: { type: 'fixed', value: 'X'.repeat(16) } }, 'fixed text must contain'],
    [{ body: { ...defaultPiece('sequence'), start: '0' } }, 'Starting value'],
    [{ prefix: { type: 'fixed', value: ' ' } }, 'start or end with whitespace'],
    [{ suffix: { type: 'fixed', value: ' ' } }, 'start or end with whitespace'],
    [{ suffix: variable({ transform: 'substring', offset: 4096 }) }, 'beyond every supported source'],
    [{ counterScope: null }, 'Counter scope'],
    [{ version: 8 }, 'enter a valid value']
  ])('reports a definite failure: %j', (config, reason) => {
    expect(preview(config)).toMatchObject({ status: 'error', number: null })
    expect(preview(config).reasons.join(' ')).toContain(reason)
  })
  it.each([
    [{ pattern: '^ZZZ', group: 0 }, 'does not match the sample'],
    [{ pattern: '^(ZZZ)?', group: 1 }, 'capture group is empty'],
    [{ transform: 'substring', offset: 20 }, 'substring is empty'],
    [{ transform: 'whole' }, 'sample number has 19 characters']
  ])('explains uncertainty without rejecting real values: %j', (piece, reason) => {
    const result = preview({ suffix: variable(piece) })
    expect(result).toMatchObject({ status: 'warning', number: null })
    expect(result.reasons.join(' ')).toContain(reason)
  })
  it('collects failures from multiple pieces and prioritizes definite errors', () => {
    const config = { prefix: variable({ pattern: '^ZZZ', group: 0 }), suffix: variable({ transform: 'substring', offset: 20 }) }
    expect(preview(config).reasons).toHaveLength(2)
    expect(preview({ ...config, prefix: { type: 'fixed', value: ' ' } }).status).toBe('error')
  })
  it('uses the correct sample for IDs and text fields', () => {
    expect(preview({ suffix: variable({ field: 'agency.id', transform: 'whole' }) }).number).toBe('AGR-0000112')
    expect(preview({ suffix: variable({ field: 'agency.name_en', transform: 'lower' }) }).number).toBe('AGR-00001abc')
  })
})
