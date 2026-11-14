import { type Browser, expect, type Page, test } from '@playwright/test'
import { signUpAndOpen } from './helpers'

/*
 * Planifier (spec 6.17) : liens de planification depuis l'Agenda (S), page publique sans compte,
 * « Replanifier ou annuler », et disponibilités d'une personne en blocs « Occupé » (P, Échap).
 */

test.use({ timezoneId: 'Europe/Brussels' })
test.beforeEach(() => test.slow())

/** L'API, avec le jeton de la page (le compte connecté). */
function api<T = { data: unknown }>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const token = localStorage.getItem('nonotion.token')
      const response = await fetch(`/api/${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return response.json()
    },
    { method, path, body },
  ) as Promise<T>
}

type Me = { user: { email: string }; workspaces: { id: string }[] }
type Base = { id: string; schema: { id: string; type: string }[] }

/** Un Gestionnaire de tâches (base « Tâches ») : l'Agenda y range les rendez-vous. */
async function tasksBase(page: Page): Promise<{ workspaceId: string; base: Base }> {
  const me = await api<Me>(page, 'GET', 'auth/me')
  const workspaceId = me.workspaces[0]!.id
  const holder = await api<{ data: { id: string } }>(
    page,
    'POST',
    `workspaces/${workspaceId}/pages`,
    { title: 'Travail' },
  )
  const base = await api<{ data: Base }>(page, 'POST', `workspaces/${workspaceId}/databases`, {
    page_id: holder.data.id,
    template: 'tasks',
  })
  return { workspaceId, base: base.data }
}

/** Le premier créneau proposé (ce mois-ci, sinon le suivant). */
async function pickFirstSlot(page: Page) {
  const slots = page.getByRole('list', { name: 'Créneaux' })
  const none = page.getByText('Aucun créneau disponible ce mois-ci.')
  await expect(slots.or(none)).toBeVisible()
  if (await none.isVisible())
    await page.getByRole('button', { name: 'Voir le mois suivant' }).click()
  await slots.getByRole('button').first().click()
}

/** Un invité, sans compte, dans un autre navigateur. */
async function guest(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext({ timezoneId: 'Europe/Brussels' })
  const page = await context.newPage()
  await page.goto(url)
  return page
}

test('S crée un lien récurrent, un invité réserve sans compte, le rendez-vous arrive dans l’Agenda', async ({
  page,
  request,
  browser,
}) => {
  await signUpAndOpen(page, request)
  const { workspaceId } = await tasksBase(page)
  await page.goto('/agenda')
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()

  await page.keyboard.press('s')
  const panel = page.getByRole('dialog', { name: 'Liens de planification' })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Créer un lien récurrent' }).click()
  await panel.getByLabel('Titre (aussi celui du rendez-vous)').fill('Entretien e2e')
  // Plusieurs plages le même jour, puis « Vider le jour ».
  const saturday = panel.getByRole('group', { name: 'Samedi' })
  await saturday.getByRole('button', { name: 'Ajouter une plage le samedi' }).click()
  await saturday.getByRole('button', { name: 'Ajouter une plage le samedi' }).click()
  await expect(saturday.getByLabel(/^Samedi, début de la plage/)).toHaveCount(2)
  await saturday.getByRole('button', { name: 'Options du samedi' }).click()
  await page.getByRole('menuitem', { name: 'Vider le jour' }).click()
  await expect(saturday).toContainText('Indisponible')
  await panel.getByLabel('Pas de réservation à moins de').selectOption({ label: 'Aucun' })
  await panel.getByRole('button', { name: 'Créer', exact: true }).click()
  await expect(panel.getByRole('listitem', { name: 'Entretien e2e' })).toContainText(
    'aucun rendez-vous à venir',
  )

  const links = await api<{ data: { slug: string; availability: unknown[] }[] }>(
    page,
    'GET',
    `workspaces/${workspaceId}/scheduling-links`,
  )
  expect(links.data[0]!.availability).toHaveLength(5)
  const invitee = await guest(browser, new URL(`/rdv/${links.data[0]!.slug}`, page.url()).href)
  await expect(invitee.getByRole('heading', { name: 'Entretien e2e' })).toBeVisible()
  await expect(invitee.getByLabel('Fuseau horaire')).toHaveValue('Europe/Brussels')
  await pickFirstSlot(invitee)
  await invitee.getByLabel('Nom').fill('Marie')
  await invitee.getByLabel('E-mail').fill('marie@example.test')
  await invitee.getByRole('button', { name: 'Confirmer le rendez-vous' }).click()
  await expect(invitee.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible()
  await expect(invitee.getByRole('link', { name: 'Replanifier ou annuler' })).toBeVisible()

  // Dans l'Agenda : la liste des liens compte le rendez-vous, et l'élément est dans la grille.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Planifier' })).toBeVisible()
  await page.keyboard.press('s')
  await expect(panel.getByRole('listitem', { name: 'Entretien e2e' })).toContainText(
    '1 rendez-vous à venir',
  )
  await panel.getByRole('button', { name: 'Fermer' }).click()
  const booked = await api<{ data: { start_at: string }[] }>(
    page,
    'GET',
    `scheduling-links/${(await api<{ data: { id: string }[] }>(page, 'GET', `workspaces/${workspaceId}/scheduling-links`)).data[0]!.id}/bookings`,
  )
  const start = new Date(booked.data[0]!.start_at)
  await page.getByRole('radio', { name: 'Mois' }).click()
  if (start.getMonth() !== new Date().getMonth())
    await page.getByRole('button', { name: 'Mois suivant' }).click()
  await expect(
    page.locator('[data-calendar-item]', { hasText: 'Entretien e2e · Marie' }),
  ).toBeVisible()
})

test('« Replanifier ou annuler » : chaque usage donne un nouveau lien, l’ancien ne sert plus', async ({
  page,
  request,
  browser,
}) => {
  await signUpAndOpen(page, request)
  const { workspaceId } = await tasksBase(page)
  const link = await api<{ data: { slug: string } }>(
    page,
    'POST',
    `workspaces/${workspaceId}/scheduling-links`,
    {
      type: 'recurring',
      title: 'Permanence',
      timezone: 'Europe/Brussels',
      availability: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        start: '08:00',
        end: '20:00',
      })),
    },
  )
  const invitee = await guest(browser, new URL(`/rdv/${link.data.slug}`, page.url()).href)
  await pickFirstSlot(invitee)
  await invitee.getByLabel('Nom').fill('Paul')
  await invitee.getByLabel('E-mail').fill('paul@example.test')
  await invitee.getByRole('button', { name: 'Confirmer le rendez-vous' }).click()
  await invitee.getByRole('link', { name: 'Replanifier ou annuler' }).click()
  await expect(invitee.getByRole('heading', { name: 'Votre rendez-vous' })).toBeVisible()
  const first = invitee.url()

  await invitee.getByRole('button', { name: 'Choisir un autre horaire' }).click()
  await invitee.getByRole('list', { name: 'Créneaux' }).getByRole('button').last().click()
  await invitee.getByRole('button', { name: /^Déplacer au / }).click()
  await expect(invitee.getByText('Rendez-vous déplacé.')).toBeVisible()
  await expect(invitee).not.toHaveURL(first)

  await invitee.getByRole('button', { name: 'Annuler le rendez-vous' }).click()
  await invitee.getByLabel(/^Motif/).fill('Empêchement')
  await invitee.getByRole('button', { name: 'Confirmer l’annulation' }).click()
  await expect(invitee.getByRole('heading', { name: 'Rendez-vous annulé' })).toBeVisible()
  await expect(invitee.getByText('Motif : Empêchement')).toBeVisible()

  await invitee.goto(first)
  await expect(invitee.getByRole('alert')).toContainText('Ce lien n’est plus valable')
})

test('P cherche une personne qui me l’a permis : des blocs « Occupé » anonymes, fermés par Échap', async ({
  page,
  request,
}) => {
  // Alice, avec un rendez-vous aujourd'hui, autorise le compte de ce test.
  await signUpAndOpen(page, request)
  const me = await api<Me>(page, 'GET', 'auth/me')
  const aliceEmail = `alice-${Date.now()}@nonotion.test`
  const registered = await request.post('/api/auth/register', {
    headers: { Accept: 'application/json' },
    data: {
      name: 'Alice Martin',
      email: aliceEmail,
      password: 'mot-de-passe-e2e',
      password_confirmation: 'mot-de-passe-e2e',
    },
  })
  const { token } = (await registered.json()) as { token: string }
  const asAlice = { Accept: 'application/json', Authorization: `Bearer ${token}` }
  const aliceMe = (await (await request.get('/api/auth/me', { headers: asAlice })).json()) as Me
  const ws = aliceMe.workspaces[0]!.id
  const holder = await (
    await request.post(`/api/workspaces/${ws}/pages`, { headers: asAlice, data: { title: 'A' } })
  ).json()
  const base = (
    await (
      await request.post(`/api/workspaces/${ws}/databases`, {
        headers: asAlice,
        data: { page_id: holder.data.id, template: 'tasks' },
      })
    ).json()
  ).data as Base
  const date = base.schema.find((property) => property.type === 'date')!.id
  const today = new Date()
  const at = (hour: number) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hour))
  await request.post(`/api/databases/${base.id}/rows`, {
    headers: asAlice,
    data: {
      title: 'Rendez-vous secret',
      properties: { [date]: { start: at(11).toISOString(), end: at(12).toISOString() } },
    },
  })
  expect(
    (
      await request.post('/api/freebusy-shares', {
        headers: asAlice,
        data: { email: me.user.email },
      })
    ).status(),
  ).toBe(201)

  await page.goto('/agenda')
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
  await page.keyboard.press('p')
  const search = page.getByRole('combobox', { name: 'Voir les disponibilités d’une personne' })
  await expect(search).toBeFocused()
  await search.fill('alice')
  await page.getByRole('option', { name: /Alice Martin/ }).click()

  const busy = page.locator('[data-overlay="busy"]')
  await expect(busy).toHaveCount(1)
  await expect(busy).toHaveText('Occupé · Alice Martin')
  await expect(page.getByText('Rendez-vous secret')).toHaveCount(0)

  // Le champ est vide : Échap ferme la superposition.
  await page.keyboard.press('Escape')
  await expect(busy).toHaveCount(0)

  // Épinglée, elle reste : après Échap, et au retour sur l'Agenda.
  await search.fill('alice')
  await page.getByRole('option', { name: /Alice Martin/ }).click()
  await page.getByRole('button', { name: 'Épingler Alice Martin' }).click()
  await search.focus()
  await page.keyboard.press('Escape')
  await expect(busy).toHaveCount(1)
  await page.reload()
  await expect(busy).toHaveCount(1)
  await page.getByRole('button', { name: 'Fermer les disponibilités de Alice Martin' }).click()
  await expect(busy).toHaveCount(0)
})

test('un lien ponctuel : des plages datées, à usage unique, qui ne sert qu’une fois', async ({
  page,
  request,
  browser,
}) => {
  await signUpAndOpen(page, request)
  const { workspaceId } = await tasksBase(page)
  await page.goto('/agenda')
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Liens de planification' }).click()
  const panel = page.getByRole('dialog', { name: 'Liens de planification' })
  await panel.getByRole('button', { name: 'Créer un lien ponctuel' }).click()
  await panel.getByRole('button', { name: 'Ajouter une plage' }).click()
  await panel.getByRole('button', { name: 'Ajouter une plage' }).click()
  await expect(
    panel.getByRole('list', { name: 'Plages proposées' }).getByRole('listitem'),
  ).toHaveCount(2)
  await panel.getByRole('button', { name: 'Options de la plage 2' }).click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  await expect(
    panel.getByRole('list', { name: 'Plages proposées' }).getByRole('listitem'),
  ).toHaveCount(1)
  await panel.getByLabel('Lien à usage unique').check()
  await panel.getByLabel('Pas de réservation à moins de').selectOption({ label: 'Aucun' })
  await panel.getByRole('button', { name: 'Créer', exact: true }).click()
  await expect(panel.getByRole('listitem', { name: 'Rencontre' })).toContainText('usage unique')

  const links = await api<{ data: { slug: string }[] }>(
    page,
    'GET',
    `workspaces/${workspaceId}/scheduling-links`,
  )
  const url = new URL(`/rdv/${links.data[0]!.slug}`, page.url()).href
  const invitee = await guest(browser, url)
  await pickFirstSlot(invitee)
  await invitee.getByLabel('Nom').fill('Léa')
  await invitee.getByLabel('E-mail').fill('lea@example.test')
  await invitee.getByRole('button', { name: 'Confirmer le rendez-vous' }).click()
  await expect(invitee.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible()

  await invitee.goto(url)
  await expect(invitee.getByRole('alert')).toHaveText(
    'Ce lien a déjà servi : il n’était valable que pour un rendez-vous.',
  )
  await expect(panel.getByRole('listitem', { name: 'Rencontre' })).toBeVisible()
})
