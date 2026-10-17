import { translateGcsExtensionMessage } from '@gcs-ssc/extensions'
import { errorMessages } from '../../i18n/errors.ts'
import { createGcsExtensionUserError, defineGcsExtensionNitroPlugin, registerGcsExtensionConfigurationGuard, type GcsExtensionConfigurationGuardContext } from '@gcs-ssc/extensions/server'
import { ConfigSchema, parseConfig } from '../../shared/config.ts'

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
        en: translateGcsExtensionMessage(errorMessages, 'en', 'configurationInvalid'),
        fr: translateGcsExtensionMessage(errorMessages, 'fr', 'configurationInvalid')
      }
    })
  }
}
export default defineGcsExtensionNitroPlugin(nitroApp => {
  registerGcsExtensionConfigurationGuard('gcs-agreement-number', validateConfiguration, nitroApp)
})
