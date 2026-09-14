// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { installExtensionTestUiRuntime, createExtensionTestUiRuntime } from '@gcs-ssc/extensions/testing'
import { ExtensionInput, ExtensionSelectMenu, ExtensionFormField } from '@gcs-ssc/extensions/ui'
import Config from '../../components/NumberingConfig.vue'
import { ConfigSchema, defaultConfig, defaultPiece } from '../../shared/config'

const locale = ref('en')
beforeEach(() => {
  locale.value = 'en'
  const runtime = createExtensionTestUiRuntime()
  installExtensionTestUiRuntime({ composables: { ...runtime.composables, useI18n: () => ({ locale, t: key => key, n: value => String(value) }) } })
})
describe('independent numbering configuration UI', () => {
  it('renders ordered sections and sample without allocating or calling an API', () => {
    const wrapper = mount(Config, { props: { modelValue: {}, streamId: '1' } })
    expect(wrapper.findAll('h4').map(node => node.text())).toEqual(['Prefix', 'Body', 'Suffix', 'Example number'])
    expect(wrapper.text()).toContain('AGR-00001')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toMatchObject(defaultConfig())
  })
  it('emits changed pieces and follows external replacement and locale changes', async () => {
    const wrapper = mount(Config, { props: { modelValue: defaultConfig(), streamId: '1' } })
    wrapper.findAllComponents(ExtensionSelectMenu)[0]!.vm.$emit('update:modelValue', 'variable')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Authorized')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ prefix: { type: 'variable' } })
    await wrapper.setProps({ modelValue: { ...defaultConfig(), inheritAgency: true } })
    expect(wrapper.text()).toContain('This stream uses the agency format')
    expect(wrapper.findAll('h4')).toHaveLength(0)
    locale.value = 'fr'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Ce volet utilise le format')
  })
  it('exposes conditional regex and substring controls, errors and disabled state', async () => {
    const config = { ...defaultConfig(), suffix: { ...defaultPiece('variable'), transform: 'regex' } }
    const wrapper = mount(Config, { props: { modelValue: config, disabled: true } })
    expect(wrapper.text()).toContain('Regular expression')
    expect(wrapper.findComponent(ExtensionInput).vm.$attrs.disabled).toBeDefined()
    await wrapper.setProps({ modelValue: { ...config, suffix: { ...defaultPiece('variable'), transform: 'substring' } } })
    expect(wrapper.findAllComponents(ExtensionFormField).some(field => String(field.vm.$attrs.label).includes('Starting position'))).toBe(true)
    await wrapper.setProps({ modelValue: { ...defaultConfig(), body: defaultPiece('fixed') } })
    expect(wrapper.get('[role="alert"]').text()).toContain('include a sequence')
  })
  it('does not report a sample mismatch as a configuration validation error', async () => {
    const wrapper = mount(Config, { props: { modelValue: { ...defaultConfig(), suffix: { ...defaultPiece('variable'), transform: 'regex', pattern: '^ZZZ', group: 0 } } } })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.findAllComponents(ExtensionSelectMenu)[0]!.vm.$emit('update:modelValue', null)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('No number is reserved')
  })
  it('persists sequence and extraction edits through the public controls', async () => {
    const wrapper = mount(Config, { props: { modelValue: defaultConfig() } })
    const inputs = wrapper.findAllComponents(ExtensionInput)
    for (const [index, value] of [[0, 'ID-'], [1, '27'], [2, '3'], [3, '4']] as const) {
      await inputs[index]!.find('input').setValue(value)
      await wrapper.vm.$nextTick()
    }
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ prefix: { value: 'ID-' }, body: { start: '27', increment: '3', width: '4' } })
    expect(wrapper.text()).toContain('ID-0027')
    wrapper.findAllComponents(ExtensionSelectMenu)[0]!.vm.$emit('update:modelValue', 'sequence')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ prefix: { type: 'sequence', start: '1' } })
  })
})

it('clears hidden invalid extraction settings when changing transform', async () => {
  const wrapper = mount(Config, { props: { modelValue: {
    ...defaultConfig(), suffix: { ...defaultPiece('variable'), transform: 'substring', length: '' }
  } } })
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  const transform = wrapper.findAllComponents(ExtensionSelectMenu).at(-1)!
  transform.vm.$emit('update:modelValue', 'year2')
  await wrapper.vm.$nextTick()
  const changed = wrapper.emitted('update:modelValue')!.at(-1)![0]
  expect(ConfigSchema.safeParse(changed).success).toBe(true)
  expect(changed).toMatchObject({ suffix: { field: 'agreement.startDate', transform: 'year2' } })
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})
