import { expect, test } from '@playwright/test'

/*
 * Mot de passe oublié : quand l'envoi d'e-mails est en panne, le serveur répond 503 avec la
 * raison. Elle doit s'afficher telle quelle, pas « Le serveur ne répond pas ».
 */
test('mot de passe oublié : si l’envoi d’e-mails est en panne, le message du serveur le dit', async ({
  page,
}) => {
  const message = 'L’envoi d’e-mails est indisponible pour le moment. Réessayez plus tard.'
  await page.route('**/api/auth/forgot-password', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message }),
    }),
  )
  await page.goto('/forgot-password')
  await page.getByLabel('Adresse e-mail').fill('moi@exemple.test')
  await page.getByRole('button', { name: 'Envoyer le lien' }).click()

  await expect(page.getByText(message)).toBeVisible()
  await expect(page.getByText('Le serveur ne répond pas')).toHaveCount(0)
})
