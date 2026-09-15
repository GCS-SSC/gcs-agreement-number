import { defineGcsExtension } from '@gcs-ssc/extensions'

export default defineGcsExtension({
  key: 'gcs-agreement-number', sdkVersion: '^0.3.1',
  configurationAccess: 'manager', configurationScope: 'agency',
  name: { en: 'Agreement numbering', fr: 'Numérotation des ententes' },
  description: { en: 'Assigns agreement numbers from configurable text, business fields and sequences.', fr: 'Attribue des numéros d’entente à partir de texte, de champs métier et de séquences configurables.' },
  requiredHostCapabilities: ['agency-config', 'agency-only-configuration', 'extension-ui', 'migrations', 'extension-lifecycle-hooks', 'agreement-number-provider', 'configuration-access'],
  admin: { agency: { path: './components/NumberingConfig.vue' } },
  agreementNumberProvider: { path: './server/provider.ts' },
  migrations: [{ path: './server/migrations/0001-counters.ts' }, { path: './server/migrations/0002-counter-scope.ts' }],
  nitroPlugin: './server/plugins/configuration.ts'
})
