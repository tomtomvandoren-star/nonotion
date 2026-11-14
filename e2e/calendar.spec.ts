import { expect, test, type Locator, type Page } from '@playwright/test'
import { createPage, editorOf, expectOnTop, signUpAndOpen } from './helpers'

/** Une base de tâches (modèle) ouverte sur sa vue Calendrier, par Échéance. */
async function openCalendar(page: Page) {
  await createPage(page, 'Agenda')
  await page.getByLabel('Titre de la page').press('Enter')
  await expect(editorOf(page)).toBeFocused()
  await page.keyboard.type('/gestionnaire')
  await expect(page.getByRole('option').first()).toContainText('Gestionnaire de tâches')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('table', { name: 'Tâches' })).toBeVisible()
  await page.getByRole('tab', { name: 'Calendrier' }).click()
  await expect(page.getByRole('radio', { name: 'Mois' })).toHaveAttribute('aria-checked', 'true')
}

/** Aujourd'hui et un autre jour du même mois, au format « AAAA-MM-JJ » du navigateur. */
const days = (page: Page) =>
  page.evaluate(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const today = new Date()
    // Un jour voisin dans la même semaine (elles commencent le lundi) : toujours dans la grille du
    // mois, et à la même hauteur qu'aujourd'hui. Une semaine plus bas, la case peut être hors de
    // l'écran quand le mois tient sur six lignes, et le glisser n'y arrive pas.
    const other = new Date(today)
    other.setDate(today.getDate() + (today.getDay() === 0 ? -1 : 1))
    const label = (d: Date) =>
      new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d)
    return {
      today: iso(today),
      other: iso(other),
      todayLabel: label(today),
      otherLabel: label(other),
    }
  })

const item = (page: Page, title: string) =>
  page.locator('[data-calendar-item]').filter({ hasText: title })
const cell = (page: Page, label: string) =>
  page.locator(`[data-day][aria-label="${label}"]`).first()

/** Crée un élément par le « + » d'une case et lui donne un titre dans l'aperçu. */
async function createOn(page: Page, label: string, title: string) {
  await cell(page, label).hover()
  await page.getByRole('button', { name: `Nouveau le ${label}` }).click()
  const peek = page.getByRole('dialog', { name: 'Aperçu de la page' })
  await expect(peek.getByLabel('Titre de la page')).toBeFocused()
  await page.keyboard.type(title)
  await peek.getByRole('button', { name: 'Fermer l’aperçu' }).click()
  await expect(item(page, title)).toBeVisible()
}

async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
}

test.describe('6.8 Vue Calendrier', () => {
  test('créer au « + » d’une case, glisser sur un autre jour, la date reste après rechargement', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await openCalendar(page)
    const { today, other, todayLabel, otherLabel } = await days(page)

    await createOn(page, todayLabel, 'Dentiste')
    await expect(item(page, 'Dentiste')).toHaveAttribute('data-day-start', today)

    await dragTo(page, item(page, 'Dentiste'), cell(page, otherLabel))
    await expect(item(page, 'Dentiste')).toHaveAttribute('data-day-start', other)

    await page.reload()
    await page.getByRole('tab', { name: 'Calendrier' }).click()
    await expect(item(page, 'Dentiste')).toHaveAttribute('data-day-start', other)
  })

  test('un élément sans date est dans « Sans date » ; glissé sur un jour, il est daté', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await openCalendar(page)
    const { today, todayLabel } = await days(page)

    // Les trois tâches de départ n'ont pas d'échéance.
    const panel = page.getByRole('complementary', { name: 'Sans date' })
    await expect(panel.locator('[data-calendar-item]')).toHaveCount(3)
    await panel.getByRole('button', { name: 'Nouveau' }).click()
    await page.getByLabel('Titre du nouvel élément').fill('Un jour, peut-être')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await expect(panel.locator('[data-calendar-item]')).toHaveCount(4)

    await dragTo(page, item(page, 'Un jour, peut-être'), cell(page, todayLabel))
    await expect(panel.locator('[data-calendar-item]')).toHaveCount(3)
    await expect(item(page, 'Un jour, peut-être')).toHaveAttribute('data-day-start', today)

    // Replié, le panneau garde son compteur.
    await panel.getByRole('button', { name: /Sans date/ }).click()
    await expect(panel.locator('[data-calendar-item]')).toHaveCount(0)
    await expect(panel.getByRole('button', { name: /Sans date/ })).toContainText('3')
  })

  test('basculer Mois | Semaine conserve la période', async ({ page, request }) => {
    await signUpAndOpen(page, request)
    await openCalendar(page)
    const period = page.getByTestId('calendar-period')

    await page.getByRole('button', { name: 'Mois suivant' }).click()
    const month = (await period.textContent())!
    await page.getByRole('radio', { name: 'Semaine' }).click()
    await expect(page.getByRole('radio', { name: 'Semaine' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // La semaine affichée est dans le mois qu'on regardait.
    const monthName = month.split(' ')[0]!.toLowerCase()
    const short = monthName.slice(0, 3)
    await expect(period).toContainText(new RegExp(short, 'i'))

    await page.getByRole('radio', { name: 'Mois' }).click()
    await expect(period).toHaveText(month)

    // Le choix Mois | Semaine est celui de la vue : il reste après rechargement.
    await page.getByRole('radio', { name: 'Semaine' }).click()
    await page.waitForTimeout(600)
    await page.reload()
    await page.getByRole('tab', { name: 'Calendrier' }).click()
    await expect(page.getByRole('radio', { name: 'Semaine' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  test('vue semaine : cliquer-glisser sur la grille crée un événement avec ces horaires', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await openCalendar(page)
    const { todayLabel } = await days(page)
    await page.getByRole('radio', { name: 'Semaine' }).click()

    const column = page.locator(`[data-hours][aria-label="${todayLabel}"]`)
    const box = (await column.boundingBox())!
    // 10 h → 11 h 30 sur la grille (une heure = 48 px) ; la boîte de la colonne suit déjà le défilement.
    const yAt = (minutes: number) => box.y + minutes * 0.8
    await page.mouse.move(box.x + box.width / 2, yAt(10 * 60 + 5))
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, yAt(11 * 60 + 30), { steps: 10 })
    await page.mouse.up()

    const peek = page.getByRole('dialog', { name: 'Aperçu de la page' })
    await expect(peek.getByLabel('Titre de la page')).toBeFocused()
    await page.keyboard.type('Réunion')
    await expect(peek.getByRole('list', { name: 'Propriétés' })).toContainText('10:00')
    await peek.getByRole('button', { name: 'Fermer l’aperçu' }).click()
    await expect(page.getByRole('button', { name: 'Réunion, 10:00' })).toBeVisible()
  })
})

test.describe('Répéter, heures et lien ICS', () => {
  test('une tâche qui se répète 3 fois montre ses 2 prochaines fois dans le calendrier', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Maison')
    await page.getByLabel('Titre de la page').press('Enter')
    await expect(editorOf(page)).toBeFocused()
    await page.keyboard.type('/gestionnaire')
    await page.keyboard.press('Enter')
    const table = page.getByRole('table', { name: 'Tâches' })
    const first = table.locator('tbody tr[data-row-id]').first()
    await first.getByRole('button', { name: 'Nom', exact: true }).click()
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Arroser')
    await page.keyboard.press('Enter')

    // Le 1er du mois : ses répétitions restent dans le mois affiché.
    const firstOfMonth = await page.evaluate(() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    })
    await first.getByRole('button', { name: 'Échéance' }).click()
    await page.getByLabel('Date de début').fill(firstOfMonth)
    // L'heure se tape directement : vide, c'est une journée entière.
    await page.getByLabel('Heure de début').fill('09:30')
    await page.getByLabel('Répéter').selectOption({ label: 'Toutes les semaines' })
    await page.getByLabel('Fin de la répétition').selectOption({ label: 'Après…' })
    await page.getByLabel('Nombre de fois').fill('3')
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(first).toContainText('09:30')
    await expect(
      first.getByRole('img', { name: 'Toutes les semaines, encore 3 fois' }),
    ).toBeVisible()

    await page.getByRole('tab', { name: 'Calendrier' }).click()
    await expect(page.locator('[data-calendar-item]').filter({ hasText: 'Arroser' })).toHaveCount(1)
    const ghosts = page.locator('[data-calendar-occurrence]').filter({ hasText: 'Arroser' })
    await expect(ghosts).toHaveCount(2)
    const day = (offset: number) =>
      `${firstOfMonth.slice(0, 8)}${String(1 + offset).padStart(2, '0')}`
    await expect(ghosts.first()).toHaveAttribute('data-day-start', day(7))
    await expect(ghosts.last()).toHaveAttribute('data-day-start', day(14))
  })

  test('« Créer un lien ICS » : un lien d’abonnement qui publie les tâches', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await openCalendar(page)
    const { todayLabel } = await days(page)
    await createOn(page, todayLabel, 'Réunion de quartier')

    await page.getByRole('button', { name: 'Créer un lien ICS' }).click()
    const panel = page.getByRole('dialog', { name: 'Créer un lien ICS' })
    await expectOnTop(panel)
    await panel.getByRole('button', { name: 'Créer le lien ICS' }).click()
    await expect(panel.getByRole('button', { name: 'Copier le lien' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Ajouter à Google Agenda' })).toBeVisible()
    // Hors Mac, iPhone et iPad, webcal: n'ouvre rien : on explique plutôt comment faire.
    await expect(panel.getByRole('button', { name: 'Ajouter au Calendrier Apple' })).toHaveCount(0)
    await expect(panel).toContainText('Calendrier Apple : ouvrez Nonotion sur votre iPhone')

    // Le flux, tel que Google ou Apple le lisent : sans être connecté.
    const url = await panel.getByLabel('Lien ICS').inputValue()
    const feed = await page.request.get(url)
    expect(feed.headers()['content-type']).toContain('text/calendar')
    expect(await feed.text()).toContain('SUMMARY:Réunion de quartier')

    // Échap ferme le panneau ; il revient par le menu « … » de la vue.
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await page.getByRole('button', { name: 'Options de la vue', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Créer un lien ICS…' }).click()
    await expectOnTop(panel)
    await expect(panel.getByLabel('Lien ICS')).toHaveValue(url)
  })
})
