import { createGcsExtensionUserError, defineGcsExtensionNitroPlugin, registerGcsExtensionConfigurationGuard, type GcsExtensionConfigurationGuardContext } from '@gcs-ssc/extensions/server'
import { parseConfig } from '../../shared/config'

/**
 *
 * @param context - Host-supplied transaction and configuration context.
 */
export const validateConfiguration = (context: GcsExtensionConfigurationGuardContext): void => {
  if (context.targetExtensionKey !== 'gcs-agreement-number' || context.config === undefined) return
  try {
    const config = parseConfig(context.config)
    if (context.scope === 'agency' && config.inheritAgency) throw new Error('Invalid inheritance')
  } catch {
    throw createGcsExtensionUserError({
      statusCode: 400, code: 'AGREEMENT_NUMBER_CONFIGURATION_INVALID',
      message: {
        en: 'Provide a valid prefix, body and suffix, including at least one sequence. Check the extraction rules and the 15-character limit.',
        fr: 'Fournissez un préfixe, un corps et un suffixe valides, dont au moins une séquence. Vérifiez les règles d’extraction et la limite de 15 caractères.'
      }
    })
  }
}
export default defineGcsExtensionNitroPlugin(nitroApp => {
  registerGcsExtensionConfigurationGuard('gcs-agreement-number', validateConfiguration, nitroApp)
})
