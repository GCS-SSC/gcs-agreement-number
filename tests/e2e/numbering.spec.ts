/* eslint-disable jsdoc/require-jsdoc -- Extension-owned browser fixtures exercise public contracts. */
import { expect, test, type Page } from '@playwright/test'

type Lookup = { id: string; label_en: string; label_fr: string }
type Stream = Lookup & { agency_id: string; program_id: string; program_name_en: string }

const selectLookup = async (page: Page, placeholder: string, label: string) => {
  await page.locator('button').filter({ hasText: placeholder }).first().click()
  await page.getByRole('option').filter({ hasText: label }).first().click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
}

const setDateFieldValue = async (
  page: Page,
  fieldIndex: number,
  value: string
) => {
  const dateField = page.getByRole('group').nth(fieldIndex)
  await expect(dateField).toBeVisible()

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Expected an ISO date, received ${value}`)

  const targetYear = Number(match[1])
  const targetMonthIndex = Number(match[2]) - 1
  const targetDate = new Date(Date.UTC(targetYear, targetMonthIndex, Number(match[3])))
  const targetMonthName = targetDate.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC'
  })
  const targetAccessibleName = targetDate.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })

  await dateField.click()
  const calendar = page.locator('[data-slot="content"]').last()
  const previousMonth = calendar.getByRole('button', { name: /previous month/i })
  const nextMonth = calendar.getByRole('button', { name: /next month/i })

  for (let attempt = 0; attempt < 24; attempt++) {
    const targetHeader = calendar
      .getByText(new RegExp(`^${targetMonthName}\\s+${targetYear}$`, 'i'))
      .first()
    if (await targetHeader.count()) break

    const visibleHeader = calendar
      .locator('h2, [data-slot="heading"], [aria-live="polite"]')
      .filter({ hasText: /\d{4}/ })
      .first()
    const headerText = (await visibleHeader.textContent())?.trim() ?? ''
    const parsedHeader = /^([A-Za-z]+)\s+(\d{4})$/.exec(headerText)
    if (!parsedHeader) break

    const visibleDate = new Date(Date.UTC(
      Number(parsedHeader[2]),
      new Date(`${parsedHeader[1]} 1, ${parsedHeader[2]}`).getUTCMonth(),
      1
    ))
    const monthDifference = (targetYear - visibleDate.getUTCFullYear()) * 12
      + targetMonthIndex - visibleDate.getUTCMonth()
    if (monthDifference === 0) break

    await (monthDifference > 0 ? nextMonth : previousMonth).click()
  }

  const day = page.getByRole('button', {
    name: targetAccessibleName,
    exact: true
  })
  await expect(day).toBeVisible()
  await day.click()
}

// Public host contracts only; all extension expectations belong to this workspace.
test('configures bilingual numbering and creates a generated agreement through the real form', async ({ page }) => {
  test.setTimeout(180000)
  await page.goto('/en/login')
  await page.getByLabel('Email').fill('root@example.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: /^(login|connexion)$/i }).click()
  await page.waitForURL(url => !url.pathname.endsWith('/login'))
  const lookup = await page.request.get('/api/agreements/lookups/streams?limit=25&permission_action=create')
  expect(lookup.ok()).toBe(true)
  let selected: { stream: Stream; subtype: Lookup; holdback: Lookup } | undefined
  for (const stream of (await lookup.json()).items as Stream[]) {
    const subtypes = await page.request.get(`/api/agreements/lookups/agreement-subtypes?stream_id=${stream.id}&limit=25`)
    const holdbacks = await page.request.get(`/api/agreements/lookups/holdback-bases?stream_id=${stream.id}&limit=25`)
    const subtype = (await subtypes.json()).items?.[0], holdback = (await holdbacks.json()).items?.[0]
    if (subtype && holdback) {
      selected = { stream, subtype, holdback }
      break
    }
  }
  expect(selected).toBeTruthy()
  if (!selected) throw new Error('No eligible stream')
  const { stream, subtype, holdback } = selected
  const enable = await page.request.patch(`/api/extensions/agency/${stream.agency_id}`, { data: { extensionKey: 'gcs-agreement-number', enabled: true, config: {} } })
  expect(enable.status(), await enable.text()).toBe(200)
  const streamExtensions = await page.request.get(`/api/extensions/streams/${stream.id}`)
  expect((await streamExtensions.json()).items.some((item: { extension: { key: string } }) => item.extension.key === 'gcs-agreement-number')).toBe(false)
  const rejected = await page.request.patch(`/api/extensions/streams/${stream.id}`, { data: { extensionKey: 'gcs-agreement-number', enabled: true, config: {} } })
  expect(rejected.status()).toBe(404)

  await page.goto(`/en/agencies/${stream.agency_id}`)
  await page.getByRole('tab', { name: 'Extensions', exact: true }).or(page.getByRole('link', { name: 'Extensions', exact: true })).click()
  const row = page.getByRole('row').filter({ hasText: 'Agreement numbering' })
  await row.getByRole('button', { name: 'Configure: Agreement numbering', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Agreement numbering', exact: true })
  await expect(modal.getByRole('heading', { name: 'Agreement number format' })).toBeVisible()
  await expect(modal.getByRole('combobox', { name: /Piece type/ }).first()).toHaveAttribute('aria-required', 'true')
  const scope = modal.getByRole('combobox', { name: /Counter scope.*required/ })
  await expect(scope).toHaveAttribute('aria-required', 'true')
  await scope.click()
  await page.getByRole('option', { name: 'Program', exact: true }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(modal.getByRole('alert').last()).toContainText('Program counters require')
  await modal.getByRole('combobox', { name: /Piece type/ }).first().click()
  await page.getByRole('option', { name: 'Business field', exact: true }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await modal.getByRole('combobox', { name: /Source field/ }).click()
  await page.getByRole('option', { name: 'Program · ID', exact: true }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  for (const [option, firstLabel, secondLabel] of [
    ['Substring', 'Starting position', 'Character count'],
    ['Regular expression capture', 'Regular expression', 'Capture group']
  ]) {
    const extraction = modal.getByRole('combobox', { name: /Extraction/ })
    await extraction.click()
    await page.getByRole('option', { name: option, exact: true }).click()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    const settings = modal.locator('.numbering-extraction-settings')
    const first = settings.getByLabel(new RegExp(firstLabel!))
    const second = settings.getByLabel(new RegExp(secondLabel!))
    await expect(first).toBeVisible()
    await expect(second).toBeVisible()
    const extractionBox = await extraction.boundingBox()
    const rowBox = await settings.boundingBox()
    const firstBox = await first.boundingBox()
    const secondBox = await second.boundingBox()
    expect(rowBox!.y).toBeGreaterThan(extractionBox!.y + extractionBox!.height)
    expect(secondBox!.x).toBeGreaterThan(firstBox!.x)
    expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThan(25)
    if (option === 'Regular expression capture') {
      await second.fill('0')
      await first.fill('[')
      await expect(modal.locator('#numbering-error')).toContainText('This configuration cannot generate a valid number')
      await expect(modal.locator('#numbering-error')).toContainText('regular expression is invalid')
      await first.fill('^ZZZ')
      await expect(modal.locator('#numbering-error')).toContainText('Unable to confirm this configuration with sample values')
      await expect(modal.locator('#numbering-error')).toContainText('does not match the sample “12”')
      await expect(modal.locator('#numbering-error')).toHaveClass(/bg-warning/)
      await expect(modal.locator('#numbering-error')).toHaveClass(/text-inverted/)
      await first.fill('^[0-9]+')
      await expect(modal.locator('#numbering-error')).toHaveCount(0)
      await expect(modal.getByText('1200001', { exact: true })).toBeVisible()
    }
  }
  await modal.getByRole('combobox', { name: /Extraction/ }).click()
  await page.getByRole('option', { name: 'Entire value', exact: true }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  const start = modal.getByRole('textbox', { name: /Starting value/ })
  await expect(start).toHaveAttribute('required', '')
  await start.fill('42')
  await expect(start).toHaveValue('42')
  await expect(modal.getByText('1200042', { exact: true })).toBeVisible()
  const savedConfig = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes(`/api/extensions/agency/${stream.agency_id}`))
  await modal.getByRole('button', { name: 'Save', exact: true }).click()
  const saved = await savedConfig
  expect(saved.status()).toBe(200)
  expect(saved.request().postDataJSON().config.counterScope).toBe('program')
  await expect(modal).toHaveCount(0)

  const recipients = await page.request.get('/api/agreements/lookups/applicant-recipients?limit=25')
  const recipient = (await recipients.json()).items[0]
  await page.goto(`/en/agreements/new?applicant_recipient_id=${recipient.id}`)
  await selectLookup(page, 'Select the agreement program', stream.program_name_en)
  await selectLookup(page, 'Select the agreement stream', stream.label_en)
  await expect(page.getByText('Assigned on creation', { exact: true })).toBeVisible()
  await expect(page.locator('[name="egcs_fc_agreementnumber"]')).toHaveCount(0)
  await selectLookup(page, 'Select the agreement subtype', subtype.label_en ?? subtype.label_fr)
  await selectLookup(page, 'Select the holdback basis', holdback.label_en ?? holdback.label_fr)
  const fields = { egcs_fc_financialsystemnumber: String(Date.now()), egcs_fc_title_en: 'Numbered agreement', egcs_fc_title_fr: 'Entente numérotée', egcs_fc_description_en: 'Generated through the form', egcs_fc_description_fr: 'Générée dans le formulaire' }
  for (const [name, value] of Object.entries(fields)) await page.locator(`[name="${name}"]`).fill(value)
  await setDateFieldValue(page, 0, '2026-09-01')
  await setDateFieldValue(page, 1, '2026-10-31')
  let responsePromise = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/agreements')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  let response = await responsePromise
  if (response.status() === 409) {
    responsePromise = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/agreements')
    await page.getByRole('button', { name: 'Confirm this is different', exact: true }).click()
    response = await responsePromise
  }
  expect(response.status(), await response.text()).toBe(200)
  expect(response.request().postDataJSON()).not.toHaveProperty('egcs_fc_agreementnumber')
  const agreement = await response.json()
  expect(agreement.egcs_fc_agreementnumber).toBe(`${stream.program_id}00042`)
  await expect(page).toHaveURL(new RegExp(`/en/agreements/${agreement.id}$`))
  await page.reload()
  await expect(page.locator('[name="egcs_fc_agreementnumber"]')).toHaveValue(`${stream.program_id}00042`)

  await page.goto(`/fr/agences/${stream.agency_id}`)
  await page.getByRole('tab', { name: 'Extensions', exact: true }).or(page.getByRole('link', { name: 'Extensions', exact: true })).click()
  await page.getByRole('row').filter({ hasText: 'Numérotation des ententes' }).getByRole('button', { name: 'Configurer: Numérotation des ententes', exact: true }).click()
  const frenchModal = page.getByRole('dialog', { name: 'Numérotation des ententes', exact: true })
  await expect(frenchModal.getByRole('combobox', { name: /Portée du compteur.*obligatoire/ })).toHaveAttribute('aria-required', 'true')
  await expect(frenchModal.getByRole('heading', { name: 'Format du numéro d’entente' })).toBeVisible()
  await expect(frenchModal.getByRole('textbox', { name: /Valeur initiale.*obligatoire/ })).toHaveAttribute('aria-required', 'true')
})
