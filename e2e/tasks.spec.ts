import { expect, test, type Locator, type Page } from '@playwright/test'
import { createPage, editorOf, signUpAndOpen } from './helpers'

/** Une page neuve avec un « Gestionnaire de tâches » créé par le menu « / » (spec 6.7). */
async function openTasks(page: Page) {
  await createPage(page, 'Ma semaine')
  await page.getByLabel('Titre de la page').press('Enter')
  await expect(editorOf(page)).toBeFocused()
  await page.keyboard.type('/gestionnaire')
  await expect(page.getByRole('option').first()).toContainText('Gestionnaire de tâches')
  await page.keyboard.press('Enter')
  const table = page.getByRole('table', { name: 'Tâches' })
  await expect(rows(table)).toHaveCount(3)
  return table
}

const rows = (table: Locator) => table.locator('tbody tr[data-row-id]')
const row = (table: Locator, title: string) => rows(table).filter({ hasText: title })

/** Donne un titre aux lignes du tableau, dans l'ordre. */
async function nameRows(page: Page, table: Locator, titles: string[]) {
  for (const [i, title] of titles.entries()) {
    await rows(table).nth(i).getByRole('button', { name: 'Nom', exact: true }).click()
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill(title)
    await page.keyboard.press('Enter')
  }
  await expect(rows(table).nth(titles.length - 1)).toContainText(titles.at(-1)!)
}

/** Une date affichée comme dans l'application (« 5 nov. 2026 »), formatée par le navigateur. */
const shownDate = (page: Page, isoDay: string) =>
  page.evaluate((day) => {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number]
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(y, m - 1, d))
  }, isoDay)

/** Aujourd'hui (et dans N jours) au format « AAAA-MM-JJ », dans le fuseau du navigateur. */
const localDay = (page: Page, offset = 0) =>
  page.evaluate((days) => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }, offset)

test.describe('6.7 La base « Tâches »', () => {
  test('le modèle crée ses propriétés et ses vues ; la case de la première colonne pilote le Statut', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    const table = await openTasks(page)

    await expect(page.getByRole('tab')).toHaveText([
      'Tableau',
      'Aujourd’hui',
      'Par statut',
      'Calendrier',
    ])
    for (const name of ['Nom', 'Statut', 'Échéance', 'Priorité', 'Étiquettes'])
      await expect(page.getByRole('button', { name: `Colonne ${name}` })).toBeVisible()
    // Une nouvelle tâche est « À faire ».
    await expect(rows(table).first()).toContainText('À faire')

    await nameRows(page, table, ['Lessive', 'Courses'])
    const done = page.getByRole('checkbox', { name: 'Terminé : Lessive' })
    await done.check()
    await expect(row(table, 'Lessive')).toContainText('Terminé')
    // Terminée : grisée et barrée.
    await expect(row(table, 'Lessive')).toHaveAttribute('data-done', 'true')
    await done.uncheck()
    await expect(row(table, 'Lessive')).toContainText('À faire')
    await expect(row(table, 'Lessive')).not.toHaveAttribute('data-done')

    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Terminé : Lessive' })).not.toBeChecked()
  })

  test('la vue Aujourd’hui montre ce qui est dû aujourd’hui et pas encore terminé', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    const table = await openTasks(page)
    await nameRows(page, table, ['Pain', 'Banque', 'Dentiste'])

    const today = await localDay(page)
    for (const [title, day] of [
      ['Pain', today],
      ['Banque', today],
      ['Dentiste', await localDay(page, 3)],
    ] as const) {
      await row(table, title).getByRole('button', { name: 'Échéance' }).click()
      await page.getByLabel('Date de début').fill(day)
      await page.getByRole('button', { name: 'OK' }).click()
      await expect(page.getByLabel('Date de début')).toHaveCount(0)
    }
    await page.getByRole('checkbox', { name: 'Terminé : Banque' }).check()

    await page.getByRole('tab', { name: 'Aujourd’hui' }).click()
    const list = page.getByRole('list', { name: 'Tâches' })
    await expect(list.getByRole('listitem')).toHaveText([/Pain/])

    // La case est aussi dans la liste : cocher fait disparaître la tâche de « Aujourd’hui ».
    // click() : la tâche quitte la vue au moment même où elle est cochée.
    await list.getByRole('checkbox', { name: 'Terminé : Pain' }).click()
    await expect(list.getByRole('listitem')).toHaveCount(0)
  })

  test('une tâche qui se répète, une fois terminée, revient à la date suivante, à faire', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    const table = await openTasks(page)
    await nameRows(page, table, ['Poubelles'])

    const today = await localDay(page)
    await row(table, 'Poubelles').getByRole('button', { name: 'Échéance' }).click()
    await page.getByLabel('Date de début').fill(today)
    await page.getByLabel('Répéter').selectOption({ label: 'Toutes les semaines' })
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(
      row(table, 'Poubelles').getByRole('img', { name: 'Toutes les semaines' }),
    ).toBeVisible()

    await page.getByRole('checkbox', { name: 'Terminé : Poubelles' }).check()
    const next = await shownDate(page, await localDay(page, 7))
    await expect(page.getByText(`Prochaine occurrence : ${next}`)).toBeVisible()

    await expect(row(table, 'Poubelles')).toHaveCount(2)
    const upcoming = row(table, 'Poubelles').filter({ hasText: next })
    await expect(upcoming).toContainText('À faire')
    await expect(upcoming.getByRole('img', { name: 'Toutes les semaines' })).toBeVisible()
    // La tâche terminée garde sa date, sans la répétition.
    const finished = row(table, 'Poubelles').filter({ hasText: await shownDate(page, today) })
    await expect(finished).toHaveAttribute('data-done', 'true')
    await expect(finished.getByRole('img', { name: 'Toutes les semaines' })).toHaveCount(0)

    await page.reload()
    await expect(row(table, 'Poubelles')).toHaveCount(2)
  })
})

const column = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Tâches' }).getByRole('listitem', { name, exact: true })
const cards = (container: Locator) => container.locator('[data-card-id]')
const cardTitles = (container: Locator) =>
  cards(container).locator('.nn-task-title').allTextContents()

/** Ajoute des cartes par « + Nouvelle page » au pied d'une colonne. */
async function addCards(page: Page, name: string, titles: string[]) {
  await column(page, name).getByRole('button', { name: 'Nouvelle page' }).click()
  const input = page.getByLabel('Titre du nouvel élément')
  for (const title of titles) {
    await input.fill(title)
    await input.press('Enter')
  }
  await input.press('Escape')
  await expect(cards(column(page, name)).filter({ hasText: titles.at(-1)! })).toBeVisible()
}

/** Glisse une carte à la souris vers un point (x, y). */
async function dragTo(page: Page, card: Locator, x: number, y: number) {
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 15 })
  await page.mouse.up()
}

test.describe('6.11 Vue Board', () => {
  test('une colonne par statut ; glisser une carte change son statut et sa place', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await openTasks(page)
    await page.getByRole('tab', { name: 'Par statut' }).click()

    await expect(page.getByRole('list', { name: 'Tâches' }).getByRole('listitem')).toHaveText([
      /Sans Statut\s*0/,
      /À faire\s*3/,
      /En cours\s*0/,
      /Terminé\s*0/,
    ])
    await addCards(page, 'En cours', ['Rédiger'])
    await addCards(page, 'À faire', ['Premier', 'Second'])

    // Vers une autre colonne : le Statut change. Le Board défile pour montrer « Terminé ».
    await column(page, 'Terminé').scrollIntoViewIfNeeded()
    const done = (await column(page, 'Terminé').boundingBox())!
    await dragTo(
      page,
      cards(column(page, 'En cours')).first(),
      done.x + done.width / 2,
      done.y + 60,
    )
    await expect(cards(column(page, 'Terminé'))).toHaveText([/Rédiger/])
    await expect(cards(column(page, 'En cours'))).toHaveCount(0)

    // Dans la colonne : « Second » passe en tête.
    await column(page, 'À faire').scrollIntoViewIfNeeded()
    const todo = cards(column(page, 'À faire'))
    const top = (await todo.first().boundingBox())!
    await dragTo(page, todo.filter({ hasText: 'Second' }), top.x + top.width / 2, top.y + 4)
    await expect
      .poll(() => cardTitles(column(page, 'À faire')))
      .toEqual(['Second', 'Sans titre', 'Sans titre', 'Sans titre', 'Premier'])

    await page.reload()
    await page.getByRole('tab', { name: 'Par statut' }).click()
    await expect(cards(column(page, 'Terminé'))).toHaveText([/Rédiger/])
    await expect
      .poll(() => cardTitles(column(page, 'À faire')))
      .toEqual(['Second', 'Sans titre', 'Sans titre', 'Sans titre', 'Premier'])
    // Le tableau voit le même changement (une vue n'est jamais une copie).
    await page.getByRole('tab', { name: 'Tableau' }).click()
    await expect(row(page.getByRole('table', { name: 'Tâches' }), 'Rédiger')).toContainText(
      'Terminé',
    )
  })

  test('en-têtes : « + » rangé dans la colonne, colonne « Sans Statut » masquable, nouveau groupe', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await openTasks(page)
    await page.getByRole('tab', { name: 'Par statut' }).click()

    await column(page, 'En cours').hover()
    await column(page, 'En cours').getByRole('button', { name: 'Nouveau dans En cours' }).click()
    await page.getByLabel('Titre du nouvel élément').fill('Relire')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await expect(cards(column(page, 'En cours'))).toHaveText([/Relire/])

    await column(page, 'Sans Statut').hover()
    await page.getByRole('button', { name: 'Options du groupe Sans Statut' }).click()
    await page.getByRole('menuitem', { name: 'Masquer le groupe' }).click()
    await expect(column(page, 'Sans Statut')).toHaveCount(0)
    const hidden = page.getByRole('group', { name: 'Groupes masqués' })
    await expect(hidden).toContainText('Sans Statut')

    await page.getByRole('button', { name: 'Ajouter un groupe' }).click()
    await page.getByLabel('Nom du nouveau groupe').fill('En revue')
    await page.keyboard.press('Enter')
    await expect(column(page, 'En revue')).toBeVisible()

    await page.reload()
    await page.getByRole('tab', { name: 'Par statut' }).click()
    await expect(column(page, 'Sans Statut')).toHaveCount(0)
    await expect(column(page, 'En revue')).toBeVisible()
    await page.getByRole('button', { name: 'Afficher Sans Statut' }).click()
    await expect(column(page, 'Sans Statut')).toBeVisible()
  })

  test('au doigt : un appui long puis glisser déplace la carte', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'toucher simulé par le protocole de Chromium')
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      // Tablette à l'horizontale : les colonnes « À faire » et « En cours » tiennent à l'écran.
      viewport: { width: 1180, height: 820 },
      baseURL: 'http://localhost:5173',
    })
    const page = await context.newPage()
    await signUpAndOpen(page, context.request)
    await openTasks(page)
    await page.getByRole('tab', { name: 'Par statut' }).click()
    await addCards(page, 'À faire', ['Au doigt'])

    const card = (await cards(column(page, 'À faire'))
      .filter({ hasText: 'Au doigt' })
      .boundingBox())!
    const target = (await column(page, 'En cours').boundingBox())!
    const cdp = await context.newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      })
    const start = { x: card.x + card.width / 2, y: card.y + card.height / 2 }
    const end = { x: target.x + target.width / 2, y: target.y + 60 }
    await touch('touchStart', start.x, start.y)
    await page.waitForTimeout(400)
    for (let step = 1; step <= 12; step++)
      await touch(
        'touchMove',
        start.x + ((end.x - start.x) * step) / 12,
        start.y + ((end.y - start.y) * step) / 12,
      )
    await touch('touchEnd', 0, 0)

    await expect(cards(column(page, 'En cours'))).toHaveText([/Au doigt/])
    // Le relâcher n'a pas ouvert la carte.
    await expect(page.getByRole('dialog', { name: 'Aperçu de la page' })).toHaveCount(0)
    await context.close()
  })
})
