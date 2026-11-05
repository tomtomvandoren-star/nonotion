import { expect, test, type Locator, type Page } from '@playwright/test'
import { createPage, editorOf, signUpAndOpen } from './helpers'

/** Une page neuve avec une base en ligne créée par « /base de données » (3 lignes vides). */
async function openDatabase(page: Page, request: Parameters<typeof signUpAndOpen>[1]) {
  await signUpAndOpen(page, request)
  await createPage(page, 'Projets')
  await page.getByLabel('Titre de la page').press('Enter')
  await expect(editorOf(page)).toBeFocused()
  await page.keyboard.type('/base')
  await expect(page.getByRole('option').first()).toContainText('Base de données')
  await page.keyboard.press('Enter')
  const table = page.getByRole('table', { name: 'Base sans titre' })
  await expect(table.locator('tbody tr[data-row-id]')).toHaveCount(3)
  return table
}

const rows = (table: Locator) => table.locator('tbody tr[data-row-id]')

/** Les titres des lignes, dans l'ordre affiché. */
const titles = (table: Locator) =>
  rows(table).evaluateAll((trs) =>
    trs.map((tr) => tr.querySelector('td')?.textContent?.replace('Ouvrir', '').trim() ?? ''),
  )

/** Ajoute une propriété par le « + » au bout des colonnes. */
async function addProperty(page: Page, name: string, type: string) {
  await page.getByRole('button', { name: 'Ajouter une propriété' }).first().click()
  await page.getByLabel('Nom de la nouvelle propriété').fill(name)
  await page.getByRole('button', { name: type, exact: true }).click()
  await expect(page.getByRole('button', { name: `Colonne ${name}` })).toBeVisible()
}

/** Saisit des titres d'affilée par la ligne « + Nouveau » du bas du tableau. */
async function typeRows(page: Page, table: Locator, names: string[]) {
  await table.getByRole('button', { name: 'Nouveau' }).click()
  const input = page.getByLabel('Titre du nouvel élément')
  for (const name of names) {
    await input.pressSequentially(name)
    await input.press('Enter')
  }
  await input.press('Escape')
}

test.describe('6.4 Bases de données', () => {
  test('une Date ajoutée à 5 lignes, renseignée dans la page ouverte, visible sans rechargement', async ({
    page,
    request,
  }) => {
    const table = await openDatabase(page, request)
    await typeRows(page, table, ['Quatre', 'Cinq'])
    await expect(rows(table)).toHaveCount(5)

    await addProperty(page, 'Échéance', 'Date')

    // Ouvrir la ligne « Cinq » : ses propriétés en grille, en haut de la page.
    const fifth = rows(table).filter({ hasText: 'Cinq' })
    await fifth.hover()
    await fifth.getByRole('button', { name: 'Ouvrir Cinq' }).click()
    const peek = page.getByRole('dialog', { name: 'Aperçu de la page' })
    await expect(peek.getByLabel('Titre de la page')).toHaveValue('Cinq')
    const properties = peek.getByRole('list', { name: 'Propriétés' })
    await properties.getByRole('button', { name: 'Échéance' }).click()
    await page.getByLabel('Date de début').fill('2026-11-20')
    await page.getByRole('button', { name: 'OK' }).click()
    await peek.getByRole('button', { name: 'Fermer l’aperçu' }).click()

    await expect(fifth).toContainText('20 nov. 2026')
    // Les autres lignes ont simplement une valeur vide.
    await expect(rows(table).filter({ hasText: 'Quatre' })).not.toContainText('2026')

    await page.reload()
    await expect(rows(table).filter({ hasText: 'Cinq' })).toContainText('20 nov. 2026')
  })
})

test.describe('6.5 Onglets de vues', () => {
  test('trois vues de types différents ; une ligne modifiée dans l’une change dans les autres', async ({
    page,
    request,
  }) => {
    const table = await openDatabase(page, request)
    for (const type of ['Liste', 'Galerie']) {
      await page.getByRole('button', { name: 'Ajouter une vue' }).click()
      await page.getByRole('menuitem', { name: type }).click()
      await expect(page.getByRole('tab', { name: type })).toHaveAttribute('aria-selected', 'true')
    }
    await expect(page.getByRole('tab')).toHaveText(['Tableau', 'Liste', 'Galerie'])

    await page.getByRole('tab', { name: 'Tableau' }).click()
    await rows(table).first().getByRole('button', { name: 'Nom', exact: true }).click()
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Renommée dans le tableau')
    await page.keyboard.press('Enter')

    await page.getByRole('tab', { name: 'Liste' }).click()
    await expect(page.getByRole('list', { name: 'Base sans titre' })).toContainText(
      'Renommée dans le tableau',
    )
    await page.getByRole('tab', { name: 'Galerie' }).click()
    await expect(page.getByRole('button', { name: /Renommée dans le tableau/ })).toBeVisible()

    // Double-clic sur un onglet : le renommer.
    await page.getByRole('tab', { name: 'Galerie' }).dblclick()
    await page.getByLabel('Nom de la vue').fill('Cartes')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tab', { name: 'Cartes' })).toBeVisible()
  })
})

test.describe('6.6 Barre d’outils et création', () => {
  test('la ligne « + Nouveau » permet 5 saisies d’affilée au clavier', async ({
    page,
    request,
  }) => {
    const table = await openDatabase(page, request)
    await typeRows(page, table, ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq'])
    await expect(rows(table)).toHaveCount(8)
    await expect
      .poll(() => titles(table))
      .toEqual(['', '', '', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq'])
  })

  test('« Nouveau » dans une vue filtrée sur Statut = En cours crée une tâche en cours', async ({
    page,
    request,
  }) => {
    await openDatabase(page, request)
    await addProperty(page, 'Statut', 'Statut')

    await page.getByRole('button', { name: /^Filtre/ }).click()
    await page.getByRole('button', { name: 'Ajouter un filtre' }).click()
    await page.getByRole('menuitem', { name: 'Statut' }).click()
    await page.getByLabel('Valeur du filtre').selectOption({ label: 'En cours' })
    await expect(page.getByRole('button', { name: /^Filtre · 1/ })).toBeVisible()
    await page.keyboard.press('Escape')

    // La vue filtrée est vide : les trois lignes de départ n'ont pas de statut.
    const table = page.getByRole('table', { name: 'Base sans titre' })
    await expect(rows(table)).toHaveCount(0)

    await page.getByRole('button', { name: 'Nouveau', exact: true }).first().click()
    const peek = page.getByRole('dialog', { name: 'Aperçu de la page' })
    await expect(peek.getByLabel('Titre de la page')).toBeFocused()
    await page.keyboard.type('Rédiger le rapport')
    await expect(peek.getByRole('list', { name: 'Propriétés' })).toContainText('En cours')
    await peek.getByRole('button', { name: 'Fermer l’aperçu' }).click()

    await expect(rows(table)).toHaveCount(1)
    await expect(rows(table).first()).toContainText('Rédiger le rapport')
    await expect(rows(table).first()).toContainText('En cours')
  })

  test('regrouper par statut : sections repliables avec compteur, « + » rangé dans la section', async ({
    page,
    request,
  }) => {
    const table = await openDatabase(page, request)
    await addProperty(page, 'Statut', 'Statut')
    await page.getByRole('button', { name: 'Options de la vue', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Regrouper par' }).click()
    await page.getByRole('menuitemradio', { name: 'Statut' }).click()
    await page.keyboard.press('Escape')

    await expect(table.getByRole('button', { name: 'Replier Sans Statut' })).toBeVisible()
    await table.getByRole('button', { name: 'Nouveau dans En cours' }).click({ force: true })
    await page.getByLabel('Titre du nouvel élément').fill('Rangée')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')

    const doing = rows(table).filter({ hasText: 'Rangée' })
    await expect(doing).toContainText('En cours')
    await table.getByRole('button', { name: 'Replier Sans Statut' }).click()
    await expect(rows(table)).toHaveCount(1)
  })
})

test.describe('6.10 Vue Tableau', () => {
  test('cellules éditables sur place : Entrée valide, Échap annule, Tab passe à la suivante', async ({
    page,
    request,
  }) => {
    const table = await openDatabase(page, request)
    await addProperty(page, 'Notes', 'Texte')
    const first = rows(table).first()

    await first.getByRole('button', { name: 'Nom', exact: true }).click()
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Premier')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toBeFocused()
    await page.keyboard.type('Une note')
    await page.keyboard.press('Enter')
    await expect(first).toContainText('Premier')
    await expect(first).toContainText('Une note')

    await first.getByRole('button', { name: 'Notes', exact: true }).click()
    await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Abandonnée')
    await page.keyboard.press('Escape')
    await expect(first).toContainText('Une note')
    await expect(first).not.toContainText('Abandonnée')

    await page.reload()
    await expect(rows(table).first()).toContainText('Une note')
  })

  test('menu d’en-tête : renommer, trier, changer de type, masquer, supprimer', async ({
    page,
    request,
  }) => {
    const table = await openDatabase(page, request)
    await typeRows(page, table, ['B', 'C', 'A'])
    await addProperty(page, 'Prix', 'Texte')

    await page.getByRole('button', { name: 'Colonne Prix' }).click()
    await page.getByLabel('Nom de la propriété').fill('Montant')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Colonne Montant' })).toBeVisible()
    // Le menu de la colonne est fermé avant d'ouvrir celui de la suivante.
    await expect(page.getByRole('menu')).toHaveCount(0)

    await page.getByRole('button', { name: 'Colonne Nom' }).click()
    await page.getByRole('menuitem', { name: 'Trier par ordre croissant' }).click()
    await expect.poll(() => titles(table)).toEqual(['A', 'B', 'C', '', '', ''])
    await expect(page.getByRole('button', { name: /^Tri · 1/ })).toBeVisible()

    await page.getByRole('button', { name: 'Colonne Montant' }).click()
    await page.getByRole('menuitem', { name: /Type/ }).click()
    await page.getByRole('menuitem', { name: 'Nombre' }).click()
    await expect(page.getByRole('button', { name: 'Colonne Montant' })).toBeVisible()

    await page.getByRole('button', { name: 'Colonne Montant' }).click()
    await page.getByRole('menuitem', { name: 'Masquer' }).click()
    await expect(page.getByRole('button', { name: 'Colonne Montant' })).toHaveCount(0)

    // Ajoutée aussitôt après avoir masqué une colonne (pas encore enregistré) : elle apparaît.
    await addProperty(page, 'Jetable', 'Texte')
    await page.getByRole('button', { name: 'Colonne Jetable' }).click()
    await page.getByRole('menuitem', { name: 'Supprimer la propriété' }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Colonne Jetable' })).toHaveCount(0)
  })

  test('une propriété ajoutée avant que la vue soit enregistrée apparaît quand même', async ({
    page,
    request,
  }) => {
    await openDatabase(page, request)
    await addProperty(page, 'Prix', 'Texte')
    // Le serveur reçoit la vue en retard : il ne sait pas encore que « Prix » est masquée.
    await page.route('**/api/views/*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await page.getByRole('button', { name: 'Colonne Prix' }).click()
    await page.getByRole('menuitem', { name: 'Masquer' }).click()
    await addProperty(page, 'Lieu', 'Texte')
    await expect(page.getByRole('button', { name: 'Colonne Prix' })).toHaveCount(0)

    // La vue retardée finit par partir, avec « Lieu » dans ses colonnes.
    await page.waitForTimeout(2500)
    await page.unrouteAll({ behavior: 'wait' })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Colonne Lieu' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Colonne Prix' })).toHaveCount(0)
  })

  test('colonnes réordonnées et redimensionnées par glisser, retrouvées après rechargement', async ({
    page,
    request,
  }) => {
    const table = await openDatabase(page, request)
    await addProperty(page, 'Notes', 'Texte')
    const headers = () =>
      table
        .locator('thead th button[aria-label^="Colonne "]')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
    expect(await headers()).toEqual(['Colonne Nom', 'Colonne Notes'])

    // Glisser « Notes » sur « Nom » : elle passe devant.
    const notes = await page.getByRole('button', { name: 'Colonne Notes' }).boundingBox()
    const name = await page.getByRole('button', { name: 'Colonne Nom' }).boundingBox()
    if (!notes || !name) throw new Error('en-tête introuvable')
    await page.mouse.move(notes.x + 20, notes.y + notes.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(100)
    await page.mouse.move(notes.x + 10, notes.y + notes.height / 2, { steps: 4 })
    await page.mouse.move(name.x + 30, name.y + name.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect.poll(headers).toEqual(['Colonne Notes', 'Colonne Nom'])

    // Tirer le bord droit de « Nom » de 100 px.
    const handle = page.getByRole('separator', { name: 'Largeur de la colonne Nom' })
    const box = await handle.boundingBox()
    const header = table.locator('th', { has: page.getByRole('button', { name: 'Colonne Nom' }) })
    const before = (await header.boundingBox())!.width
    // L'enregistrement de la vue part 400 ms après le dernier changement : on attend celui qui
    // porte la nouvelle largeur.
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        /\/api\/views\//.test(r.url()) &&
        (r.request().postData() ?? '').includes('property_widths'),
    )
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + 100, box!.y + box!.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect
      .poll(async () => Math.round((await header.boundingBox())!.width))
      .toBe(Math.round(before + 100 - box!.width / 2))

    await saved
    await page.reload()
    await expect.poll(headers).toEqual(['Colonne Notes', 'Colonne Nom'])
    expect(Math.round((await header.boundingBox())!.width)).toBeGreaterThan(before + 50)
  })
})
