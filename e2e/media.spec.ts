import { createServer, type Server } from 'node:http'
import { expect, test, type Page } from '@playwright/test'
import { createPage, editorOf, signUpAndOpen, waitForContentSave } from './helpers'

/*
 * Le groupe « Média » du menu « / » : image, vidéo, audio et fichier (depuis l'appareil ou par un
 * lien), et l'aperçu d'un lien web. La page de l'aperçu est servie ici, en local : l'API ne
 * l'accepte que parce que ICS_ALLOW_PRIVATE_HOSTS l'autorise (jamais en production).
 */

/** Une image PNG d'un pixel. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

let server: Server
let port = 8765

// Playwright exige un premier argument déstructuré, même sans fixture.
// eslint-disable-next-line no-empty-pattern
test.beforeAll(async ({}, testInfo) => {
  // Un port par processus de test : ICS_ALLOW_PRIVATE_HOSTS autorise 8765 à 8768.
  port = 8765 + testInfo.parallelIndex
  server = createServer((request, response) => {
    if (request.url === '/couverture.png') {
      response.writeHead(200, { 'Content-Type': 'image/png' })
      response.end(PNG)
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html><head><title>Titre de secours</title>
      <meta property="og:title" content="Les plus beaux sentiers des Alpes">
      <meta property="og:description" content="Randonnées et refuges, de juin à septembre.">
      <meta property="og:image" content="/couverture.png">
      </head><body>Article</body></html>`)
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const slashMenu = (page: Page) => page.locator('.bn-suggestion-menu')
const block = (page: Page, type: string) => editorOf(page).locator(`[data-content-type="${type}"]`)

/** Une page neuve, le curseur dans son corps, et le bloc choisi dans le menu « / ». */
async function insert(page: Page, query: string, title: string) {
  await createPage(page, 'Voyage')
  await page.getByLabel('Titre de la page').press('Enter')
  await expect(editorOf(page)).toBeFocused()
  await page.keyboard.type(`/${query}`)
  await expect(slashMenu(page).getByRole('option').first()).toContainText(title)
  await page.keyboard.press('Enter')
}

test('le menu « / » a un groupe « Média » : image, vidéo, audio, fichier, aperçu de lien', async ({
  page,
  request,
}) => {
  await signUpAndOpen(page, request)
  await createPage(page, 'Voyage')
  await page.getByLabel('Titre de la page').press('Enter')
  await page.keyboard.type('/média')

  await expect(slashMenu(page).getByText('Média', { exact: true })).toBeVisible()
  await expect(slashMenu(page).getByRole('option')).toHaveText([
    /Image/,
    /Vidéo/,
    /Audio/,
    /Fichier/,
    /Aperçu de lien/,
  ])
})

test('une image envoyée depuis l’appareil s’affiche, et reste après rechargement', async ({
  page,
  request,
}) => {
  await signUpAndOpen(page, request)
  await insert(page, 'image', 'Image')

  // Le panneau propose les deux façons : depuis l'appareil, ou par un lien.
  await expect(page.getByRole('tab', { name: 'Lien' })).toBeVisible()
  await page.getByRole('tab', { name: 'Depuis l’appareil' }).click()
  const saved = waitForContentSave(page)
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'Plage de Nice.png', mimeType: 'image/png', buffer: PNG })

  const image = block(page, 'image').locator('img')
  await expect(image).toHaveAttribute('src', /\/uploads\/[0-9a-z]+\/[0-9a-z]+\/Plage-de-Nice\.png$/)
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await saved

  await page.reload()
  await expect(block(page, 'image').locator('img')).toHaveAttribute('src', /Plage-de-Nice\.png$/)
})

test('un fichier envoyé garde son nom ; une vidéo YouTube se lit dans son lecteur', async ({
  page,
  request,
}) => {
  await page.route('**/*youtube-nocookie.com/**', (route) => route.abort())
  await signUpAndOpen(page, request)
  await insert(page, 'fichier', 'Fichier')
  await page.getByRole('tab', { name: 'Depuis l’appareil' }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'Compte rendu.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  })
  await expect(block(page, 'file')).toContainText('Compte rendu.pdf')

  // Une vidéo YouTube se lit dans son lecteur (sans cookies).
  await editorOf(page).press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/vidéo')
  await expect(slashMenu(page).getByRole('option').first()).toContainText('Vidéo')
  await page.keyboard.press('Enter')
  await page.getByRole('tab', { name: 'Lien' }).click()
  await page.getByPlaceholder('Collez le lien (https://…)').fill('https://youtu.be/dQw4w9WgXcQ')
  await page.getByRole('button', { name: 'Insérer la vidéo' }).click()
  await expect(block(page, 'video').locator('iframe')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  )
})

test('aperçu d’un lien : titre, description et image de la page ; un lien privé est refusé', async ({
  page,
  request,
}) => {
  await signUpAndOpen(page, request)
  await insert(page, 'aperçu', 'Aperçu de lien')

  const input = page.getByLabel('Lien de l’aperçu')
  await expect(input).toBeFocused()
  await input.fill('http://10.0.0.1/admin')
  await page.getByRole('button', { name: 'Créer l’aperçu' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Cette adresse n’est pas autorisée : elle mène à un réseau privé ou local.',
  )

  await input.fill(`http://127.0.0.1:${port}/article`)
  const saved = waitForContentSave(page)
  await input.press('Enter')
  const card = block(page, 'bookmark').locator('a.nn-bookmark')
  await expect(card).toContainText('Les plus beaux sentiers des Alpes')
  await expect(card).toContainText('Randonnées et refuges, de juin à septembre.')
  await expect(card).toHaveAttribute('href', `http://127.0.0.1:${port}/article`)
  await expect(card).toHaveAttribute('target', '_blank')
  await saved

  await page.reload()
  await expect(block(page, 'bookmark')).toContainText('Les plus beaux sentiers des Alpes')
})
