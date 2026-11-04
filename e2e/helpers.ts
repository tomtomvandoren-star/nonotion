import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

/** Crée un compte par l'API (plus rapide que le formulaire) et ouvre l'application connecté. */
export async function signUpAndOpen(page: Page, request: APIRequestContext): Promise<void> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@nonotion.test`
  const response = await request.post('/api/auth/register', {
    headers: { Accept: 'application/json' },
    data: {
      name: 'Testeur',
      email,
      password: 'mot-de-passe-e2e',
      password_confirmation: 'mot-de-passe-e2e',
    },
  })
  expect(response.status()).toBe(201)
  const { token } = (await response.json()) as { token: string }

  await page.addInitScript((value) => window.localStorage.setItem('nonotion.token', value), token)
  await page.goto('/')
  await expect(page.getByRole('tree', { name: 'Pages' })).toBeVisible()
}

export const tree = (page: Page) => page.getByRole('tree', { name: 'Pages' })

/** Le lien d'une page dans l'arbre de la barre latérale. */
export const treeLink = (page: Page, title: string) =>
  tree(page).getByRole('link', { name: title, exact: true })

/** L'arbre tel qu'affiché : [niveau, titre] pour chaque ligne visible, dans l'ordre. */
export async function treeRows(page: Page): Promise<[number, string][]> {
  return tree(page)
    .locator('[role=treeitem]')
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          [
            Number(row.getAttribute('aria-level')),
            // Le titre est le dernier élément du lien (après l'icône).
            row.querySelector('a')?.lastElementChild?.textContent?.trim() ?? '',
          ] as [number, string],
      ),
    )
}

/** Attend que la sauvegarde automatique soit terminée. */
export async function waitForSave(page: Page): Promise<void> {
  await expect(page.getByText('Enregistré', { exact: true })).toBeVisible()
}

/** Glisse une ligne de l'arbre sur une autre, dans la zone voulue (avant, dedans, après). */
export async function dragRow(
  page: Page,
  source: Locator,
  target: Locator,
  zone: 'before' | 'inside' | 'after',
) {
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('ligne introuvable')

  await page.mouse.move(from.x + 10, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 20, from.y + from.height / 2, { steps: 4 })
  const ratio = zone === 'before' ? 0.1 : zone === 'after' ? 0.9 : 0.5
  await page.mouse.move(to.x + 20, to.y + to.height * ratio, { steps: 12 })
  await page.mouse.up()
}

/** Attend l'enregistrement d'un titre (ou d'une icône, d'une couverture…) par le serveur. */
export function waitForTitleSave(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' && /\/api\/pages\/[^/]+$/.test(response.url()),
  )
}
