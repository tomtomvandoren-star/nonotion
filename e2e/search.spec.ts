import { expect, test, type Page } from '@playwright/test'
import { createPage, editorOf, signUpAndOpen, treeLink, waitForContentSave } from './helpers'

/** Une page avec une phrase dans son corps, enregistrée. */
async function pageWithText(page: Page, title: string, text: string) {
  await createPage(page, title)
  await page.getByLabel('Titre de la page').press('Enter')
  await expect(editorOf(page)).toBeFocused()
  const saved = waitForContentSave(page)
  await page.keyboard.type(text)
  await saved
}

const palette = (page: Page) => page.getByRole('dialog', { name: 'Rechercher' })

test.describe('6.12 Recherche', () => {
  test('Ctrl+K : pages récentes, recherche dans le texte avec extrait surligné, flèches et Entrée', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await pageWithText(page, 'Lisbonne', 'Goûter les pastéis de nata près du fleuve.')
    await pageWithText(page, 'Courses', 'Pain, lait et œufs.')

    await page.keyboard.press('ControlOrMeta+k')
    await expect(palette(page)).toBeVisible()
    // Champ vide : les pages ouvertes récemment, la dernière en tête.
    await expect(palette(page)).toContainText('Pages récentes')
    await expect(palette(page).getByRole('option')).toHaveText([/Courses/, /Lisbonne/])

    // Un mot du texte (sans son accent) : la recherche plein texte du serveur le trouve.
    await page.keyboard.type('pasteis')
    const result = palette(page).getByRole('option', { name: /Lisbonne/ })
    await expect(result).toBeVisible()
    await expect(result.locator('mark')).toHaveText('pastéis')

    await page.keyboard.press('Escape')
    await expect(palette(page)).toHaveCount(0)

    // Le titre, tout de suite (recherche locale) ; flèche, Entrée : la page s'ouvre.
    await page.keyboard.press('ControlOrMeta+k')
    await page.keyboard.type('cour')
    await expect(palette(page).getByRole('option').first()).toContainText('Courses')
    await page.keyboard.press('Enter')
    await expect(palette(page)).toHaveCount(0)
    await expect(page.getByLabel('Titre de la page')).toHaveValue('Courses')
  })

  test('aucun résultat est dit clairement ; la barre latérale ouvre aussi la recherche', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await page
      .getByRole('navigation', { name: 'Navigation' })
      .getByRole('button', { name: 'Rechercher' })
      .click()
    await expect(palette(page)).toBeVisible()
    await page.keyboard.type('zzzintrouvable')
    await expect(palette(page)).toContainText('Aucun résultat pour « zzzintrouvable ».')
  })
})

test.describe('6.14 Raccourcis clavier', () => {
  test('Ctrl+N crée une page, Ctrl+\\ masque la barre latérale, Ctrl+/ ouvre l’aide', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)

    await page.keyboard.press('ControlOrMeta+n')
    await expect(page.getByLabel('Titre de la page')).toBeFocused()
    await page.keyboard.type('Par raccourci')
    await expect(treeLink(page, 'Par raccourci')).toBeVisible()

    const sidebar = page.getByRole('complementary', { name: 'Barre latérale' })
    await page.keyboard.press('ControlOrMeta+Backslash')
    await expect(sidebar).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+Backslash')
    await expect(sidebar).toBeVisible()

    await page.keyboard.press('ControlOrMeta+Slash')
    const help = page.getByRole('dialog', { name: 'Raccourcis clavier' })
    await expect(help).toBeVisible()
    await expect(help).toContainText('Rechercher une page')
    await expect(help).toContainText('Aujourd’hui')
    await page.keyboard.press('Escape')
    await expect(help).toHaveCount(0)
  })

  test('dans un calendrier : D jour, W semaine, M mois, T aujourd’hui ; pas en écrivant', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Agenda')
    await page.getByLabel('Titre de la page').press('Enter')
    await expect(editorOf(page)).toBeFocused()
    await page.keyboard.type('/gestionnaire')
    await page.keyboard.press('Enter')
    await page.getByRole('tab', { name: 'Calendrier' }).click()

    const mode = (name: string) => page.getByRole('radio', { name })
    const period = page.getByTestId('calendar-period')
    const month = (await period.textContent())!

    await page.keyboard.press('w')
    await expect(mode('Semaine')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('d')
    await expect(mode('Jour')).toHaveAttribute('aria-checked', 'true')
    await expect(period).toHaveText(
      await page.evaluate(() =>
        new Intl.DateTimeFormat('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date()),
      ),
    )
    await page.keyboard.press('m')
    await expect(mode('Mois')).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Mois suivant' }).click()
    await expect(period).not.toHaveText(month)
    await page.keyboard.press('t')
    await expect(period).toHaveText(month)

    // Écrire un « w » dans la page ne change pas le calendrier.
    await editorOf(page).locator('.bn-block-outer').last().click()
    await page.keyboard.type('w')
    await expect(mode('Mois')).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('7 Thème sombre', () => {
  test('choisi dans le menu, il reste après rechargement ; « Comme le système » suit le système', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const light = await background()

    await page.getByRole('button', { name: /Espace de/ }).click()
    await page.getByRole('menuitem', { name: 'Thème' }).click()
    await page.getByRole('menuitemradio', { name: 'Sombre' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect.poll(background).not.toBe(light)

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.getByRole('button', { name: /Espace de/ }).click()
    await page.getByRole('menuitem', { name: 'Thème' }).click()
    await page.getByRole('menuitemradio', { name: 'Comme le système' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
    await expect.poll(background).not.toBe(light)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(background).toBe(light)
  })
})

test.describe('7 Responsive', () => {
  test('sur téléphone : tiroir, recherche et calendrier au jour', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1000, height: 800 },
      baseURL: 'http://localhost:5173',
    })
    const page = await context.newPage()
    await signUpAndOpen(page, context.request)
    await createPage(page, 'Agenda')
    await page.getByLabel('Titre de la page').press('Enter')
    await page.keyboard.type('/gestionnaire')
    await page.keyboard.press('Enter')
    await page.getByRole('tab', { name: 'Calendrier' }).click()

    await page.setViewportSize({ width: 390, height: 844 })
    // Sous 768 px, la barre latérale est un tiroir : toucher le contenu la referme.
    // On touche le contenu à droite du tiroir (le voile couvre tout l'écran, sous lui).
    await page
      .getByRole('button', { name: 'Fermer la barre latérale' })
      .click({ position: { x: 360, y: 400 } })
    await expect(page.getByRole('complementary', { name: 'Barre latérale' })).toHaveCount(0)
    await page.getByRole('radio', { name: 'Jour' }).click()
    await expect(page.locator('[data-hours]')).toHaveCount(1)
    // Pas de défilement horizontal de la page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    await page.getByRole('button', { name: 'Afficher la barre latérale' }).click()
    await page
      .getByRole('navigation', { name: 'Navigation' })
      .getByRole('button', { name: 'Rechercher' })
      .click()
    await page.keyboard.type('agen')
    await expect(palette(page).getByRole('option').first()).toContainText('Agenda')
    await context.close()
  })
})
