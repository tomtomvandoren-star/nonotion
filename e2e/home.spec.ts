import { expect, test } from '@playwright/test'

test('la page Bonjour confirme que l’API et la base répondent', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Bonjour' })).toBeVisible()
  await expect(page.getByLabel('API et base de données')).toHaveText('OK')
})
