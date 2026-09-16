import extension from '../../extension.config'
// Integration adapter from the host tooling checkout; production code uses only the SDK.
const { verifyExtensionAuditContract } = await import(new URL(
  '../../../../tooling/gcs-ssc/tests/fixtures/extension-audit-contract.ts', import.meta.url
).href)

verifyExtensionAuditContract(extension, [
  {
    'table': 'extensions.agreement_number_counters',
    'row': {
      'id': '1',
      'scope': 'agency',
      'scope_id': '11',
      'piece': 'body',
      'next_value': '1'
    },
    'agencies': [
      '11'
    ]
  },
  {
    'table': 'extensions.agreement_number_counters',
    'row': {
      'id': '2',
      'scope': 'program',
      'scope_id': '101',
      'piece': 'body',
      'next_value': '1'
    },
    'agencies': [
      '11'
    ]
  },
  {
    'table': 'extensions.agreement_number_counters',
    'row': {
      'id': '3',
      'scope': 'stream',
      'scope_id': '201',
      'piece': 'body',
      'next_value': '1'
    },
    'agencies': [
      '11'
    ]
  },
  {
    'table': 'extensions.agency_enablement',
    'row': {
      'id': '90',
      'agency_id': '11',
      'extension_key': 'gcs-agreement-number'
    },
    'agencies': [
      '11'
    ]
  },
  {
    'table': 'extensions.stream_configuration',
    'row': {
      'id': '91',
      'stream_id': '201',
      'extension_key': 'gcs-agreement-number'
    },
    'agencies': [
      '11'
    ]
  }
])
