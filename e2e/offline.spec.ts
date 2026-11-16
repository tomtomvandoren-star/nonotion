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

/*
 * Complément du 16 novembre : les fichiers récemment utilisés gardés sur l'appareil, les fichiers
 * ajoutés hors ligne, la recherche, l'Agenda et la corbeille hors ligne.
 */

/** Une image PNG d'un pixel. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const image = (page: Page) => editorOf(page).locator('[data-content-type="image"] img')
const width = (page: Page) => image(page).evaluate((img: HTMLImageElement) => img.naturalWidth)

/** Un bloc Image à la fin de la page, avec une image envoyée depuis l'appareil. */
async function addImage(page: Page) {
  await editorOf(page).press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/image')
  await expect(page.locator('.bn-suggestion-menu').getByRole('option').first()).toContainText(
    'Image',
  )
  await page.keyboard.press('Enter')
  await page.getByRole('tab', { name: 'Depuis l’appareil' }).click()
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'Plage.png', mimeType: 'image/png', buffer: PNG })
}

/** Combien de fichiers l'application garde sur l'appareil. */
const keptFiles = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('nonotion-files')
        open.onsuccess = () => {
          try {
            const count = open.result.transaction('meta').objectStore('meta').count()
            count.onsuccess = () => resolve(count.result)
          } catch {
            resolve(0)
          }
        }
        open.onerror = () => resolve(0)
      }),
  )

/** La copie locale de l'application (gardée sur l'appareil) contient-elle ce texte ? */
const keptCopyHas = (page: Page, text: string) =>
  page.evaluate(
    (needle) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('nonotion-offline')
        open.onsuccess = () => {
          try {
            const read = open.result.transaction('kv').objectStore('kv').get('queries')
            read.onsuccess = () => resolve(JSON.stringify(read.result ?? null).includes(needle))
          } catch {
            resolve(false)
          }
        }
        open.onerror = () => resolve(false)
      }),
    text,
  )

test('une image vue en ligne sur un autre appareil s’y affiche ensuite hors ligne, après réouverture', async ({
  page,
  request,
  browser,
}) => {
  const { token, pageId } = await openNotebook(page, request)
  await addImage(page)
  await expect.poll(() => width(page)).toBe(1)
  // La page enregistrée sur le serveur cite l'image, avant d'ouvrir l'autre appareil.
  await expect
    .poll(async () => JSON.stringify((await serverPage(request, token, pageId)).content), {
      timeout: 15_000,
    })
    .toMatch(/Plage\.png/)

  // Un autre appareil, qui n'a jamais vu l'image : il l'affiche, et en garde une copie.
  const context = await browser.newContext()
  await context.addInitScript((value) => {
    window.localStorage.setItem('nonotion.token', value)
    window.localStorage.setItem('nonotion.offline', '1')
  }, token)
  const other = await context.newPage()
  const copied = other.waitForResponse((response) => response.url().includes('/api/files/'))
  await other.goto(new URL(`/p/${pageId}`, page.url()).href)
  expect((await copied).status()).toBe(200)
  await expect.poll(() => width(other)).toBe(1)
  await expect.poll(() => keptFiles(other)).toBe(1)
  // La page aussi est gardée (une seconde après l'avoir chargée) avant de couper le réseau.
  await expect.poll(() => keptCopyHas(other, 'Plage.png')).toBe(true)

  // Plus de réseau du tout (ni l'API, ni les fichiers du serveur), et l'application rouverte.
  await other.route(
    (url) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/'),
    (route) => route.abort(),
  )
  await other.reload()
  await expect(image(other)).toHaveAttribute('src', /^blob:/, { timeout: 15_000 })
  await expect.poll(() => width(other)).toBe(1)
  await context.close()
})

test('une image ajoutée hors ligne s’affiche tout de suite, et arrive sur le serveur au retour', async ({
  page,
  request,
}) => {
  const { token, pageId } = await openNotebook(page, request)
  const api = (url: URL) => url.pathname.startsWith('/api/')
  await page.route(api, (route) => route.abort())
  await editorOf(page).press('End')
  await page.keyboard.type(' Puis hors ligne.')
  await expect(indicator(page)).toHaveText(/Hors ligne/)

  await addImage(page)
  await expect(image(page)).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => width(page)).toBe(1)
  await expect(indicator(page)).toHaveText(/Hors ligne · \d+ modifications? en attente/)

  // Le serveur revient : le fichier part, et la page enregistrée cite sa vraie adresse.
  await page.unroute(api)
  await expect
    .poll(async () => JSON.stringify((await serverPage(request, token, pageId)).content), {
      timeout: 30_000,
    })
    .toMatch(/\/uploads\/[0-9a-z]+\/[0-9a-z]+\/Plage\.png/)
  const content = JSON.stringify((await serverPage(request, token, pageId)).content)
  expect(content).toContain('Puis hors ligne.')
  expect(content).not.toContain('nonotion-file:')
  await expect(indicator(page)).toHaveText('Enregistré')

  await page.reload()
  await expect.poll(() => width(page)).toBe(1)
})

test('hors ligne, sans les avoir ouvertes : la recherche lit le texte des pages, l’Agenda et la corbeille s’ouvrent', async ({
  page,
  request,
}) => {
  // Le compte et ses pages existent avant que l'application ne s'ouvre : rien n'y a été affiché.
  const registered = await request.post('/api/auth/register', {
    headers: { Accept: 'application/json' },
    data: {
      name: 'Testeur',
      email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@nonotion.test`,
      password: 'mot-de-passe-e2e',
      password_confirmation: 'mot-de-passe-e2e',
    },
  })
  const { token } = (await registered.json()) as { token: string }
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const me = (await (await request.get('/api/auth/me', { headers })).json()) as {
    workspaces: { id: string }[]
  }
  const pages = `/api/workspaces/${me.workspaces[0]!.id}/pages`
  const recipe = (
    await (await request.post(pages, { headers, data: { title: 'Recettes' } })).json()
  ).data as { id: string; version: number }
  await request.put(`/api/pages/${recipe.id}/content`, {
    headers,
    data: {
      version: recipe.version,
      content: [
        {
          id: 'b1',
          type: 'paragraph',
          props: {},
          content: [{ type: 'text', text: 'Tarte aux mirabelles de Lorraine', styles: {} }],
          children: [],
        },
      ],
    },
  })
  const draft = (
    await (await request.post(pages, { headers, data: { title: 'Brouillon' } })).json()
  ).data as { id: string }
  await request.delete(`/api/pages/${draft.id}`, { headers })

  await page.addInitScript((value) => {
    window.localStorage.setItem('nonotion.token', value)
    window.localStorage.setItem('nonotion.offline', '1')
  }, token)
  const copied = page.waitForResponse((response) => /\/offline(\?|$)/.test(response.url()))
  await page.goto('/')
  expect((await copied).status()).toBe(200)
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.abort(),
  )

  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('mirabelles')
  const result = page
    .getByRole('dialog', { name: 'Rechercher' })
    .getByRole('option', { name: /Recettes/ })
  await expect(result).toBeVisible()
  await expect(result.locator('mark')).toHaveText('mirabelles')
  await page.keyboard.press('Enter')
  await expect(editorOf(page)).toContainText('Tarte aux mirabelles de Lorraine')

  await page.getByRole('link', { name: 'Agenda' }).click()
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
  await expect(page.getByText('L’Agenda n’a pas pu être chargé.')).toHaveCount(0)

  await page.getByRole('button', { name: 'Corbeille' }).click()
  await expect(page.getByRole('list', { name: 'Pages à la corbeille' })).toContainText('Brouillon')
})
