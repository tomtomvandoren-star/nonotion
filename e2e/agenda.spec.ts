import { createServer, type Server } from 'node:http'
import { expect, type Page, test } from '@playwright/test'
import { createPage, editorOf, expectOnTop, signUpAndOpen } from './helpers'

/*
 * L'Agenda de l'espace de travail (spec 6.15) : les bases Nonotion et les agendas abonnés réunis
 * dans une même grille, avec leur source, la case « fait », et « Mes agendas ».
 */

test.use({ timezoneId: 'Europe/Brussels' })
// Des rechargements et des imports, sur le serveur PHP de développement (une requête à la fois).
test.beforeEach(() => test.slow())

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (date: Date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`

/** Un agenda d'un événement, aujourd'hui de 10 h à 11 h ; le même UID que celui de l'autre agenda. */
function agendaIcs(name: string): string {
  const today = new Date()
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nonotion//e2e//FR',
    `X-WR-CALNAME:${name}`,
    'BEGIN:VEVENT',
    'UID:reunion@e2e.test',
    'DTSTAMP:20261001T080000Z',
    'SUMMARY:Réunion d’équipe',
    `DTSTART;TZID=Europe/Brussels:${ymd(today)}T100000`,
    `DTEND;TZID=Europe/Brussels:${ymd(today)}T110000`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

let server: Server
let port = 8765

// Playwright exige un premier argument déstructuré, même sans fixture.
// eslint-disable-next-line no-empty-pattern
test.beforeAll(async ({}, testInfo) => {
  // Un port par processus de test : ICS_ALLOW_PRIVATE_HOSTS autorise 8765 à 8768.
  port = 8765 + testInfo.parallelIndex
  server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8' })
    response.end(agendaIcs(request.url?.includes('equipe') ? 'Équipe' : 'Bureau'))
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

/** Un Gestionnaire de tâches (base « Tâches ») dans une page, puis l'Agenda. */
async function tasksThenAgenda(page: Page) {
  await createPage(page, 'Travail')
  await page.getByLabel('Titre de la page').press('Enter')
  await expect(editorOf(page)).toBeFocused()
  await page.keyboard.type('/gestionnaire')
  await expect(page.getByRole('option').first()).toContainText('Gestionnaire de tâches')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('table', { name: 'Tâches' })).toBeVisible()
  await page.getByRole('link', { name: 'Agenda' }).click()
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
}

const agendaItem = (page: Page, title: string) =>
  page.locator('[data-calendar-item]').filter({ hasText: title })

/** Après un rechargement, l'Agenda demande le compte, ses réglages puis chaque base : plus de temps. */
const LOADED = { timeout: 15_000 }

test('les tâches d’une base dans l’Agenda : source, case « fait », base masquée', async ({
  page,
  request,
}) => {
  await signUpAndOpen(page, request)
  await tasksThenAgenda(page)
  const myCalendars = page.getByRole('complementary', { name: 'Mes agendas' })
  await expect(myCalendars.getByRole('checkbox', { name: 'Afficher Tâches' })).toBeChecked()

  // « Ajouter » crée l'élément aujourd'hui, dans la base, et l'ouvre le curseur dans son titre.
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  const peek = page.getByRole('dialog', { name: 'Aperçu de la page' })
  await expectOnTop(peek)
  await expect(peek.getByLabel('Titre de la page')).toBeFocused()
  await page.keyboard.type('Rapport mensuel')
  await page.getByRole('button', { name: 'Fermer l’aperçu' }).click()

  const item = agendaItem(page, 'Rapport mensuel')
  await expect(item).toHaveAttribute('aria-label', /Rapport mensuel, .*Tâches/)
  await expect(item.locator('[data-source-kind="nonotion"]')).toHaveCount(1)

  // La case « fait », dans la grille : la tâche passe à « Terminé », gardé au rechargement.
  await page.getByRole('checkbox', { name: 'Rapport mensuel : à faire' }).check()
  await expect(page.getByRole('checkbox', { name: 'Rapport mensuel : fait' })).toBeChecked()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Rapport mensuel : fait' })).toBeChecked(LOADED)
  await page.getByRole('link', { name: 'Travail' }).click()
  await expect(
    page
      .getByRole('table', { name: 'Tâches' })
      .locator('tr')
      .filter({ hasText: 'Rapport mensuel' }),
  ).toContainText('Terminé')

  // Masquer la base : ses éléments quittent l'Agenda, jusqu'au rechargement compris.
  await page.getByRole('link', { name: 'Agenda' }).click()
  await myCalendars.getByRole('checkbox', { name: 'Afficher Tâches' }).uncheck()
  await expect(agendaItem(page, 'Rapport mensuel')).toHaveCount(0)
  await page.reload()
  await expect(myCalendars.getByRole('checkbox', { name: 'Afficher Tâches' })).not.toBeChecked(
    LOADED,
  )
  await expect(agendaItem(page, 'Rapport mensuel')).toHaveCount(0)
  await myCalendars.getByRole('checkbox', { name: 'Afficher Tâches' }).check()
  await expect(agendaItem(page, 'Rapport mensuel')).toHaveCount(1, LOADED)
})

test('des agendas abonnés dans l’Agenda : couleur, masqués, et un même événement une seule fois', async ({
  page,
  request,
}) => {
  await signUpAndOpen(page, request)
  await tasksThenAgenda(page)
  await page.getByRole('radio', { name: 'Semaine' }).click()

  const importFrom = async (path: string) => {
    await page.getByRole('button', { name: 'Ajouter un agenda (ICS)' }).click()
    const panel = page.getByRole('dialog', { name: 'Importer un agenda depuis un lien' })
    await expectOnTop(panel)
    // Depuis l'Agenda, une nouvelle base d'événements par défaut : rien ne se mêle aux tâches.
    await expect(panel.getByLabel('Ajouter les événements dans')).toHaveValue('new')
    await panel.getByLabel('Lien de l’agenda (ICS)').fill(`http://127.0.0.1:${port}${path}`)
    await panel.getByRole('radio', { name: 'Vert' }).click()
    await panel.getByRole('button', { name: 'Prévisualiser' }).click()
    await panel.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(panel).toHaveCount(0)
  }
  await importFrom('/bureau.ics')
  const myCalendars = page.getByRole('complementary', { name: 'Mes agendas' })
  await expect(myCalendars.getByRole('listitem', { name: 'Bureau' })).toBeVisible()
  const meeting = agendaItem(page, 'Réunion d’équipe')
  await expect(meeting).toHaveCount(1)
  await expect(meeting).toHaveAttribute('data-color', 'green')
  await expect(meeting.locator('[data-source-kind="ics"]')).toHaveCount(1)

  // Le même événement (même UID) dans un second agenda : toujours une seule fois.
  await importFrom('/equipe.ics')
  await expect(myCalendars.getByRole('listitem', { name: 'Équipe' })).toBeVisible()
  await expect(meeting).toHaveCount(1)

  // Masquer les deux agendas : l'événement disparaît ; en réafficher un le ramène.
  await myCalendars.getByRole('checkbox', { name: 'Afficher Bureau' }).uncheck()
  await myCalendars.getByRole('checkbox', { name: 'Afficher Équipe' }).uncheck()
  await expect(meeting).toHaveCount(0)
  await page.reload()
  await expect(myCalendars.getByRole('checkbox', { name: 'Afficher Bureau' })).not.toBeChecked(
    LOADED,
  )
  await expect(meeting).toHaveCount(0)
  await myCalendars.getByRole('checkbox', { name: 'Afficher Équipe' }).check()
  await expect(meeting).toHaveCount(1, LOADED)
})
