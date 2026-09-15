import { createGcsExtensionUserError, defineGcsExtensionNitroPlugin, registerGcsExtensionConfigurationGuard, type GcsExtensionConfigurationGuardContext } from '@gcs-ssc/extensions/server'
import { ConfigSchema, parseConfig } from '../../shared/config'

/**
 *
 * @param context - Host-supplied transaction and configuration context.
 */
export const validateConfiguration = (context: GcsExtensionConfigurationGuardContext): void => {
  if (context.targetExtensionKey !== 'gcs-agreement-number' || context.config === undefined) return
  try {
    if (context.scope !== 'agency') throw new Error('Agency configuration required')
    ConfigSchema.parse(parseConfig(context.config))
  } catch {
    throw createGcsExtensionUserError({
      statusCode: 400, code: 'AGREEMENT_NUMBER_CONFIGURATION_INVALID',
      message: {
        en: 'Provide a valid prefix, body and suffix, including at least one sequence. Program counters require a program or stream field; stream counters require a stream field. Check the extraction rules and the 15-character limit.',
        fr: 'Fournissez un préfixe, un corps et un suffixe valides, dont au moins une séquence. Un compteur de programme exige un champ de programme ou de volet; un compteur de volet exige un champ de volet. Vérifiez les règles d’extraction et la limite de 15 caractères.'
      }
    })
  }
}
export default defineGcsExtensionNitroPlugin(nitroApp => {
  registerGcsExtensionConfigurationGuard('gcs-agreement-number', validateConfiguration, nitroApp)
})
