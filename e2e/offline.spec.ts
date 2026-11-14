import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createPage, editorOf, signUpAndOpen, treeLink, waitForContentSave } from './helpers'

/*
 * Hors ligne et conflits (spec 6.16). Le comportement est celui des applications natives ; le site
 * l'a aussi quand « nonotion.offline » vaut « 1 », pour pouvoir le tester ici dans un navigateur.
 */

const indicator = (page: Page) =>
  page.getByRole('status').filter({ hasText: /Hors ligne|Enregistr|Synchronisation/ })

/** Le jeton de la session ouverte dans le navigateur, pour lire le serveur à côté. */
async function tokenOf(page: Page): Promise<string> {
  return page.evaluate(() => window.localStorage.getItem('nonotion.token') ?? '')
}

async function serverPage(request: APIRequestContext, token: string, pageId: string) {
  const response = await request.get(`/api/pages/${pageId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).data as { title: string; content: unknown; version: number }
}

const pageIdOf = (page: Page) => page.url().split('/p/')[1]!

/** Une page « Carnet » avec une première ligne enregistrée, mode hors ligne activé. */
async function openNotebook(page: Page, request: APIRequestContext) {
  await page.addInitScript(() => window.localStorage.setItem('nonotion.offline', '1'))
  await signUpAndOpen(page, request)
  await createPage(page, 'Carnet')
  await page.getByLabel('Titre de la page').press('Enter')
  const saved = waitForContentSave(page)
  await page.keyboard.type('Écrit en ligne.')
  await saved
  return { token: await tokenOf(page), pageId: pageIdOf(page) }
}

test('hors ligne, on écrit, renomme et crée des pages ; au retour, tout arrive sur le serveur', async ({
  page,
  context,
  request,
}) => {
  const { token, pageId } = await openNotebook(page, request)

  await context.setOffline(true)
  await page.keyboard.press('Enter')
  await page.keyboard.type('Écrit dans le train.')
  await expect(indicator(page)).toHaveText(/Hors ligne · \d+ modifications? en attente/)

  // Le titre, puis une nouvelle page : à l'écran tout de suite.
  await page.getByLabel('Titre de la page').fill('Carnet de voyage')
  await expect(treeLink(page, 'Carnet de voyage')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Navigation' })
    .getByRole('button', { name: 'Nouvelle page' })
    .click()
  await page.getByLabel('Titre de la page').fill('Idées hors ligne')
  await expect(treeLink(page, 'Idées hors ligne')).toBeVisible()
  const newPageId = pageIdOf(page)

  await context.setOffline(false)
  await expect(indicator(page)).toHaveText('Enregistré', { timeout: 20_000 })

  const notebook = await serverPage(request, token, pageId)
  expect(notebook.title).toBe('Carnet de voyage')
  expect(JSON.stringify(notebook.content)).toContain('Écrit dans le train.')
  expect((await serverPage(request, token, newPageId)).title).toBe('Idées hors ligne')
})

test('modifiée ailleurs pendant ce temps : les trois choix, et la gestion de conflit', async ({
  page,
  context,
  request,
}) => {
  const { token, pageId } = await openNotebook(page, request)

  await context.setOffline(true)
  await editorOf(page).press('End')
  await page.keyboard.type(' Ma version.')
  await expect(indicator(page)).toHaveText(/Hors ligne/)

  // Pendant ce temps, un autre appareil enregistre une autre version de la page.
  const before = await serverPage(request, token, pageId)
  const other = await request.put(`/api/pages/${pageId}/content`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    data: {
      version: before.version,
      content: [
        {
          id: 'autre-appareil',
          type: 'paragraph',
          props: {},
          content: [{ type: 'text', text: 'Version de l’autre appareil.', styles: {} }],
          children: [],
        },
      ],
    },
  })
  expect(other.status()).toBe(200)

  await context.setOffline(false)
  const dialog = page.getByRole('alertdialog', { name: 'Cette page a été modifiée ailleurs' })
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await expect(dialog.getByRole('button', { name: 'Recharger' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Écraser avec ma version' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Gestion de conflit' }).click()
  const manager = page.getByRole('dialog', { name: 'Gestion de conflit' })
  await expect(manager.getByRole('region', { name: 'Ma version' })).toContainText('Ma version.')
  await expect(manager.getByRole('region', { name: 'Version du serveur' })).toContainText(
    'Version de l’autre appareil.',
  )
  await expect(manager).toContainText(/\d+ blocs? diffère/)

  await manager.getByRole('button', { name: 'Écraser avec ma version' }).click()
  await expect(manager).toBeHidden()
  await expect
    .poll(async () => JSON.stringify((await serverPage(request, token, pageId)).content))
    .toContain('Ma version.')
  expect(JSON.stringify((await serverPage(request, token, pageId)).content)).not.toContain(
    'Version de l’autre appareil.',
  )
})

test('« Recharger » prend la version du serveur', async ({ page, context, request }) => {
  const { token, pageId } = await openNotebook(page, request)

  await context.setOffline(true)
  await editorOf(page).press('End')
  await page.keyboard.type(' Brouillon perdu.')
  await expect(indicator(page)).toHaveText(/Hors ligne/)
  const before = await serverPage(request, token, pageId)
  await request.put(`/api/pages/${pageId}/content`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    data: {
      version: before.version,
      content: [
        {
          id: 'serveur',
          type: 'paragraph',
          props: {},
          content: [{ type: 'text', text: 'La bonne version.', styles: {} }],
          children: [],
        },
      ],
    },
  })

  await context.setOffline(false)
  const dialog = page.getByRole('alertdialog', { name: 'Cette page a été modifiée ailleurs' })
  await dialog.getByRole('button', { name: 'Recharger' }).click({ timeout: 20_000 })
  await expect(editorOf(page)).toContainText('La bonne version.')
  await expect(editorOf(page)).not.toContainText('Brouillon perdu.')
})

test('fermée puis rouverte sans serveur : les pages et la file d’attente sont toujours là', async ({
  page,
  request,
}) => {
  const { token, pageId } = await openNotebook(page, request)

  // Le serveur ne répond plus (l'application, elle, se charge encore : seuls les appels à l'API
  // échouent, pas les fichiers de l'application, dont certains ont « /api/ » dans leur chemin).
  const api = (url: URL) => url.pathname.startsWith('/api/')
  await page.route(api, (route) => route.abort())
  await editorOf(page).press('End')
  await page.keyboard.type(' Avant de fermer.')
  await expect(indicator(page)).toHaveText(/Hors ligne · \d+ modifications? en attente/)

  await page.reload()
  await expect(editorOf(page)).toContainText('Avant de fermer.')
  await expect(treeLink(page, 'Carnet')).toBeVisible()
  await expect(indicator(page)).toHaveText(/modifications? en attente/)

  // Le serveur revient : la vérification régulière le voit, et la file part.
  await page.unroute(api)
  await expect
    .poll(async () => JSON.stringify((await serverPage(request, token, pageId)).content), {
      timeout: 30_000,
    })
    .toContain('Avant de fermer.')
})
