import { expect, test } from '@playwright/test'

test('un visiteur arrive sur la connexion, crée un compte et retrouve sa première page', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()

  await page.getByRole('link', { name: 'Créer un compte' }).click()
  await page.getByLabel('Nom').fill('Nouvelle personne')
  await page.getByLabel('Adresse e-mail').fill(`inscription-${Date.now()}@nonotion.test`)
  await page.getByLabel('Mot de passe (8 caractères minimum)').fill('mot-de-passe-e2e')
  await page.getByLabel('Confirmer le mot de passe').fill('mot-de-passe-e2e')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page.getByRole('heading', { name: 'Bonjour, Nouvelle' })).toBeVisible()
  await expect(
    page
      .getByRole('tree', { name: 'Pages' })
      .getByRole('link', { name: 'Bienvenue dans Nonotion' }),
  ).toBeVisible()
})

test('l’API et la base répondent', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.ok()).toBe(true)
  expect(await response.json()).toMatchObject({ status: 'ok', database: 'ok' })
})
