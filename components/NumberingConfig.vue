<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue'
import { GCS_AGREEMENT_NUMBER_FIELDS, type GcsAgreementNumberSources, type GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import { ExtensionCheckbox, ExtensionFormField, ExtensionInput, ExtensionSelectMenu, useExtensionI18n } from '@gcs-ssc/extensions/ui'
import { ConfigSchema, defaultConfig, defaultPiece, PIECES, TRANSFORMS, renderNumber, type NumberConfig, type NumberPiece } from '../shared/config'
import { messages } from '../i18n/messages'

const { streamId, disabled = false, readOnly = false } = defineProps<{ streamId?: string; agencyId?: string; disabled?: boolean; readOnly?: boolean }>()
const model = defineModel<GcsExtensionJsonConfig>({ required: true })
const { t } = useExtensionI18n(messages)
const copyConfig = (value: GcsExtensionJsonConfig): NumberConfig => JSON.parse(JSON.stringify({ ...defaultConfig(), ...value })) as NumberConfig
const local: Ref<NumberConfig> = ref(copyConfig(model.value))
const locked = computed(() => disabled || readOnly)
const result = computed(() => ConfigSchema.safeParse(local.value))
const fieldError = (path: string) => result.value.success ? undefined : result.value.error.issues.some(issue => issue.path.join('.') === path) ? t('invalid') : undefined
const options = computed(() => ['fixed', 'variable', 'sequence'].map(value => ({ value, label: t(value as NumberPiece['type']) })))
const fields = computed(() => GCS_AGREEMENT_NUMBER_FIELDS.map(value => ({ value, label: t(value) })))
const transforms = computed(() => TRANSFORMS.map(value => ({ value, label: t(value) })))
const preview = computed(() => {
  if (!result.value.success || result.value.data.inheritAgency) return null
  const sources = Object.fromEntries(GCS_AGREEMENT_NUMBER_FIELDS.map(field => [field, field.endsWith('Date') ? '2026-04-01' : field.endsWith('.id') ? '12' : 'ABC'])) as GcsAgreementNumberSources
  const sequences = Object.fromEntries(PIECES.map(name => [name, local.value[name].type === 'sequence' ? local.value[name].start : '1']))
  try {
    return renderNumber(result.value.data, sources, sequences)
  } catch {
    return null
  }
})
const changeType = (name: typeof PIECES[number], value: unknown) => {
  if (value === 'fixed' || value === 'variable' || value === 'sequence') local.value[name] = defaultPiece(value)
}
const changeTransform = (name: typeof PIECES[number], value: unknown) => {
  const piece = local.value[name]
  if (piece.type !== 'variable' || !TRANSFORMS.includes(value as typeof TRANSFORMS[number])) return
  const defaults = defaultPiece('variable')
  if (defaults.type !== 'variable') return
  local.value[name] = { ...defaults, field: piece.field, transform: value as typeof TRANSFORMS[number] }
}
watch(local, value => {
  if (JSON.stringify(value) !== JSON.stringify(model.value)) model.value = JSON.parse(JSON.stringify(value)) as GcsExtensionJsonConfig
}, { deep: true, immediate: true })
watch(model, value => {
  if (JSON.stringify(value) !== JSON.stringify(local.value)) local.value = copyConfig(value)
})
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-4">
      <div>
        <h3 class="text-base font-semibold text-highlighted">
          {{ t('title') }}
        </h3>
        <p id="numbering-instructions" class="mt-1 text-sm text-muted">
          {{ t('description') }}
        </p>
      </div>
      <ExtensionFormField v-if="streamId" :label="t('inherit')" name="inheritAgency" :required="false">
        <ExtensionCheckbox v-model="local.inheritAgency" :label="t('inherit')" :disabled="locked" />
      </ExtensionFormField>
      <p v-if="local.inheritAgency" class="text-sm text-muted">
        {{ t('inheritedHelp') }}
      </p>
    </section>
    <template v-if="!local.inheritAgency">
      <section v-for="name in PIECES" :key="name" class="space-y-4 border-t border-default pt-5" :aria-describedby="result.success ? 'numbering-instructions' : 'numbering-instructions numbering-error'">
        <h4 class="text-base font-semibold text-highlighted">
          {{ t(name) }}
        </h4>
        <div class="grid gap-4 sm:grid-cols-2">
          <ExtensionFormField :label="t('type')" :name="`${name}.type`" :error="fieldError(`${name}.type`)" required>
            <ExtensionSelectMenu :model-value="local[name].type" :items="options" value-key="value" :disabled="locked" @update:model-value="changeType(name, $event)" />
          </ExtensionFormField>
          <ExtensionFormField v-if="local[name].type === 'fixed'" :label="t('value')" :name="`${name}.value`" :error="fieldError(`${name}.value`)" :required="false">
            <ExtensionInput v-model="local[name].value" :maxlength="15" :disabled="locked" />
          </ExtensionFormField>
          <template v-if="local[name].type === 'sequence'">
            <ExtensionFormField :label="t('start')" :name="`${name}.start`" :error="fieldError(`${name}.start`)" required>
              <ExtensionInput v-model="local[name].start" inputmode="numeric" :disabled="locked" />
            </ExtensionFormField>
            <ExtensionFormField :label="t('increment')" :name="`${name}.increment`" :error="fieldError(`${name}.increment`)" required>
              <ExtensionInput v-model="local[name].increment" inputmode="numeric" :disabled="locked" />
            </ExtensionFormField>
            <ExtensionFormField :label="t('width')" :name="`${name}.width`" :error="fieldError(`${name}.width`)" required>
              <ExtensionInput v-model="local[name].width" type="number" :min="1" :max="15" :disabled="locked" />
            </ExtensionFormField>
          </template>
          <template v-if="local[name].type === 'variable'">
            <ExtensionFormField :label="t('field')" :name="`${name}.field`" :error="fieldError(`${name}.field`)" required>
              <ExtensionSelectMenu v-model="local[name].field" :items="fields" value-key="value" :disabled="locked" />
            </ExtensionFormField>
            <ExtensionFormField :label="t('transform')" :name="`${name}.transform`" :error="fieldError(`${name}.transform`)" required>
              <ExtensionSelectMenu :model-value="local[name].transform" :items="transforms" value-key="value" :disabled="locked" @update:model-value="changeTransform(name, $event)" />
            </ExtensionFormField>
            <template v-if="local[name].transform === 'substring'">
              <ExtensionFormField :label="t('offset')" :name="`${name}.offset`" :error="fieldError(`${name}.offset`)" required>
                <ExtensionInput v-model="local[name].offset" type="number" :min="0" :max="4096" :disabled="locked" />
              </ExtensionFormField>
              <ExtensionFormField :label="t('length')" :name="`${name}.length`" :error="fieldError(`${name}.length`)" required>
                <ExtensionInput v-model="local[name].length" type="number" :min="1" :max="15" :disabled="locked" />
              </ExtensionFormField>
            </template>
            <template v-if="local[name].transform === 'regex'">
              <ExtensionFormField :label="t('pattern')" :name="`${name}.pattern`" :error="fieldError(`${name}.pattern`)" :description="t('regexHelp')" required>
                <ExtensionInput v-model="local[name].pattern" :maxlength="256" :disabled="locked" />
              </ExtensionFormField>
              <ExtensionFormField :label="t('group')" :name="`${name}.group`" :error="fieldError(`${name}.group`)" required>
                <ExtensionInput v-model="local[name].group" type="number" :min="0" :max="32" :disabled="locked" />
              </ExtensionFormField>
            </template>
          </template>
        </div>
      </section>
      <p class="text-sm text-muted">
        {{ t('counterHelp') }}
      </p>
      <section class="space-y-2 border-t border-default pt-5" aria-live="polite">
        <h4 class="text-sm font-semibold">
          {{ t('preview') }}
        </h4>
        <p v-if="preview" class="font-mono text-lg">
          {{ preview }}
        </p>
        <p v-if="!result.success" id="numbering-error" role="alert" class="text-sm text-error">
          {{ t('invalid') }}
        </p>
        <p v-else-if="!preview" class="text-sm text-muted">
          {{ t('invalid') }}
        </p>
        <p class="text-sm text-muted">
          {{ t('previewHelp') }}
        </p>
      </section>
    </template>
  </div>
</template>
