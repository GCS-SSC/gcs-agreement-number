import { defineGcsExtension } from '@gcs-ssc/extensions'

export default defineGcsExtension({
  key: 'gcs-agreement-number', sdkVersion: '^0.3.0',
  configurationAccess: 'manager',
  name: { en: 'Agreement numbering', fr: 'Numérotation des ententes' },
  description: { en: 'Assigns agreement numbers from configurable text, business fields and sequences.', fr: 'Attribue des numéros d’entente à partir de texte, de champs métier et de séquences configurables.' },
  requiredHostCapabilities: ['agency-config', 'stream-config-modal', 'extension-ui', 'migrations', 'extension-lifecycle-hooks', 'agreement-number-provider', 'configuration-access'],
  admin: { agency: { path: './components/NumberingConfig.vue' }, streamConfig: { path: './components/NumberingConfig.vue' } },
  agreementNumberProvider: { path: './server/provider.ts' },
  migrations: [{ path: './server/migrations/0001-counters.ts' }],
  nitroPlugin: './server/plugins/configuration.ts'
})
