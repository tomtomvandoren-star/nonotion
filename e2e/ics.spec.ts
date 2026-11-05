import { createServer, type Server } from 'node:http'
import { expect, test, type Page } from '@playwright/test'
import { createPage, editorOf, signUpAndOpen } from './helpers'

/*
 * Import d'un agenda par lien ICS (spec 6.9). Un petit serveur local sert l'agenda ; l'API ne
 * l'accepte que parce que ICS_ALLOW_PRIVATE_HOSTS l'autorise (jamais en production). Les dates
 * sont calculées à partir d'aujourd'hui, et le navigateur vit à Bruxelles.
 */

test.use({ timezoneId: 'Europe/Brussels' })
test.describe.configure({ mode: 'serial' })

const pad = (n: number) => String(n).padStart(2, '0')
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000)
const ymd = (date: Date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
const iso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const today = new Date()
today.setHours(12, 0, 0, 0)
// Un mercredi d'il y a deux semaines environ : la chorale, chaque mercredi, six fois, sauf la 4e.
const firstChorale = addDays(today, -14 - ((today.getDay() + 7 - 3) % 7))
const skippedChorale = addDays(firstChorale, 21)
const fete = addDays(today, 2)
const tomorrow = addDays(today, 1)

/** L'instant UTC d'une heure locale dans un fuseau donné. */
function zonedToUtc(day: Date, hour: number, zone: string): Date {
  const guess = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour))
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(guess)
      .map((part) => [part.type, Number(part.value)]),
  )
  const asIfUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!)
  return new Date(guess.getTime() - (asIfUtc - guess.getTime()))
}

function agenda(version: number): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nonotion//e2e//FR',
    'X-WR-CALNAME:Agenda du quartier',
    'BEGIN:VEVENT',
    'UID:chorale@e2e.test',
    'DTSTAMP:20261001T080000Z',
    'SUMMARY:Chorale',
    `DTSTART;TZID=Europe/Brussels:${ymd(firstChorale)}T180000`,
    `DTEND;TZID=Europe/Brussels:${ymd(firstChorale)}T193000`,
    'RRULE:FREQ=WEEKLY;COUNT=6',
    `EXDATE;TZID=Europe/Brussels:${ymd(skippedChorale)}T180000`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:fete@e2e.test',
    'DTSTAMP:20261001T080000Z',
    `SUMMARY:${version === 1 ? 'Fête de quartier' : 'Fête de quartier (déplacée)'}`,
    `DTSTART;VALUE=DATE:${ymd(fete)}`,
    `DTEND;VALUE=DATE:${ymd(addDays(fete, 1))}`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:new-york@e2e.test',
    'DTSTAMP:20261001T080000Z',
    'SUMMARY:Appel avec New York',
    `DTSTART;TZID=America/New_York:${ymd(tomorrow)}T090000`,
    `DTEND;TZID=America/New_York:${ymd(tomorrow)}T093000`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

let server: Server
let version = 1
let port = 8765

// Playwright exige un premier argument déstructuré, même sans fixture.
// eslint-disable-next-line no-empty-pattern
test.beforeAll(async ({}, testInfo) => {
  // Un port par processus de test : ICS_ALLOW_PRIVATE_HOSTS autorise 8765 à 8768.
  port = 8765 + testInfo.parallelIndex
  server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8' })
    response.end(agenda(version))
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
})
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
test.beforeEach(() => {
  version = 1
})

/** Une base de tâches ouverte sur son Calendrier, et l'agenda importé dedans. */
async function importAgenda(page: Page) {
  await createPage(page, 'Quartier')
  await page.getByLabel('Titre de la page').press('Enter')
  await expect(editorOf(page)).toBeFocused()
  await page.keyboard.type('/gestionnaire')
  await expect(page.getByRole('option').first()).toContainText('Gestionnaire de tâches')
  await page.keyboard.press('Enter')
  await page.getByRole('tab', { name: 'Calendrier' }).click()

  await page.getByRole('button', { name: 'Autres façons d’ajouter' }).click()
  await page.getByRole('menuitem', { name: 'Importer un agenda depuis un lien (ICS)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Importer un agenda depuis un lien' })
  await dialog.getByLabel('Lien de l’agenda (ICS)').fill(`http://127.0.0.1:${port}/quartier.ics`)
  await dialog.getByRole('radio', { name: 'Violet' }).click()
  await dialog.getByRole('button', { name: 'Prévisualiser' }).click()

  // L'aperçu : 5 chorales (6 moins l'exception), la fête, l'appel ; le nom de l'agenda proposé.
  await expect(dialog.getByTestId('calendar-preview-summary')).toContainText('7 événements')
  await expect(dialog.getByRole('list', { name: 'Prochains événements' })).toContainText(
    'Appel avec New York',
  )
  await dialog.getByRole('button', { name: 'Importer', exact: true }).click()
  await expect(page.getByText('7 événements importés')).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Mes agendas' })).toContainText(
    'Agenda du quartier',
  )
}

const tableRows = (page: Page, title: string) =>
  page
    .getByRole('table', { name: 'Tâches' })
    .locator('tbody tr[data-row-id]')
    .filter({ hasText: title })

const frenchDay = (page: Page, day: Date) =>
  page.evaluate(
    (value) =>
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(value),
      ),
    day.getTime(),
  )

test.describe('6.9 Import d’un agenda par lien (ICS)', () => {
  test('les événements arrivent au bon jour et à la bonne heure, la récurrence sans son exception', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await importAgenda(page)

    // Dans le calendrier : la fête, journée entière, le bon jour, aux couleurs de l'agenda.
    const feteItem = page.locator('[data-calendar-item]').filter({ hasText: 'Fête de quartier' })
    if (fete.getMonth() === today.getMonth()) {
      await expect(feteItem).toHaveAttribute('data-day-start', iso(fete))
      await expect(feteItem).toHaveAttribute('data-color', 'purple')
    }

    await page.getByRole('tab', { name: 'Tableau' }).click()
    // New York 9 h, affiché à l'heure de Bruxelles, avec l'heure d'origine.
    const expected = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Brussels',
      hour: '2-digit',
      minute: '2-digit',
    }).format(zonedToUtc(tomorrow, 9, 'America/New_York'))
    const call = tableRows(page, 'Appel avec New York')
    await expect(call).toContainText(`${await frenchDay(page, tomorrow)} ${expected}`)
    await expect(
      call.getByRole('img', { name: 'Saisie à l’origine 09:00 à New York' }),
    ).toBeVisible()

    // La chorale : 5 mercredis à 18 h, pas celui de l'exception.
    await expect(tableRows(page, 'Chorale')).toHaveCount(5)
    await expect(tableRows(page, 'Chorale').first()).toContainText('18:00')
    await expect(
      tableRows(page, 'Chorale').filter({ hasText: await frenchDay(page, skippedChorale) }),
    ).toHaveCount(0)
    // La journée entière : son jour, sans heure.
    await expect(tableRows(page, 'Fête de quartier')).toContainText(await frenchDay(page, fete))
    await expect(tableRows(page, 'Fête de quartier')).not.toContainText(':')
  })

  test('une adresse locale ou privée est refusée', async ({ page, request }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Quartier')
    await page.getByLabel('Titre de la page').press('Enter')
    await page.keyboard.type('/gestionnaire')
    await page.keyboard.press('Enter')
    await page.getByRole('tab', { name: 'Calendrier' }).click()
    await page.getByRole('button', { name: 'Autres façons d’ajouter' }).click()
    await page.getByRole('menuitem', { name: 'Importer un agenda depuis un lien (ICS)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Importer un agenda depuis un lien' })

    for (const url of ['http://192.168.1.10/agenda.ics', 'http://127.0.0.1:9/agenda.ics']) {
      await dialog.getByLabel('Lien de l’agenda (ICS)').fill(url)
      await dialog.getByRole('button', { name: 'Prévisualiser' }).click()
      await expect(dialog.getByRole('alert')).toHaveText(
        'Cette adresse n’est pas autorisée : elle mène à un réseau privé ou local.',
      )
    }
  })

  test('resynchroniser met l’événement à jour sans doublon ; supprimer l’agenda vide le calendrier', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await importAgenda(page)

    // Un événement importé garde son titre : il se modifie dans l'agenda d'origine.
    await page.getByRole('tab', { name: 'Tableau' }).click()
    const fete = tableRows(page, 'Fête de quartier')
    await fete.hover()
    await fete.getByRole('button', { name: /^Ouvrir/ }).click()
    const peek = page.getByRole('dialog', { name: 'Aperçu de la page' })
    await expect(peek.getByLabel('Titre de la page')).toHaveAttribute('readonly', '')
    await expect(peek).toContainText('Importé de l’agenda « Agenda du quartier »')
    await peek.getByRole('button', { name: 'Fermer l’aperçu' }).click()

    version = 2
    await page.getByRole('tab', { name: 'Calendrier' }).click()
    const calendars = page.getByRole('complementary', { name: 'Mes agendas' })
    await calendars.getByRole('button', { name: 'Options de l’agenda Agenda du quartier' }).click()
    await page.getByRole('menuitem', { name: 'Resynchroniser' }).click()
    await expect(calendars).toContainText('synchronisé à l’instant')

    await page.getByRole('tab', { name: 'Tableau' }).click()
    await expect(tableRows(page, 'Fête de quartier (déplacée)')).toHaveCount(1)
    await expect(tableRows(page, 'Chorale')).toHaveCount(5)

    await page.getByRole('tab', { name: 'Calendrier' }).click()
    await calendars.getByRole('button', { name: 'Options de l’agenda Agenda du quartier' }).click()
    await page.getByRole('menuitem', { name: 'Supprimer l’agenda' }).click()
    await expect(page.getByRole('alertdialog')).toContainText(
      '7 événements importés vont à la corbeille',
    )
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(page.getByText('Agenda supprimé : 7 événements à la corbeille.')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Mes agendas' })).toHaveCount(0)
    await expect(page.locator('[data-calendar-item]').filter({ hasText: 'Chorale' })).toHaveCount(0)
  })
})
