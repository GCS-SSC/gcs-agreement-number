import { defineGcsExtensionMessages } from '@gcs-ssc/extensions'

export const errorMessages = defineGcsExtensionMessages({
  en: {
    generationInvalid: 'The numbering format could not produce a valid number. Check source values, extraction rules, sequence width, and the 15-character limit.',
    configurationInvalid: 'Provide a valid prefix, body and suffix, including at least one sequence. Program counters require a program or stream field; stream counters require a stream field. Check the extraction rules and the 15-character limit.'
  },
  fr: {
    generationInvalid: 'Le format de numérotation n’a pas produit de numéro valide. Vérifiez les valeurs sources, les règles d’extraction, la largeur de séquence et la limite de 15 caractères.',
    configurationInvalid: 'Fournissez un préfixe, un corps et un suffixe valides, dont au moins une séquence. Un compteur de programme exige un champ de programme ou de volet; un compteur de volet exige un champ de volet. Vérifiez les règles d’extraction et la limite de 15 caractères.'
  }
})
