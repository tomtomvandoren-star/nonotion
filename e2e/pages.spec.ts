import { expect, test, type Page } from '@playwright/test'
import {
  dragRow,
  signUpAndOpen,
  treeLink,
  treeRows,
  waitForSave,
  waitForTitleSave,
} from './helpers'

/** Crée une page (à la racine, ou sous `parent`) et lui donne un titre. */
async function createPage(page: Page, title: string, parent?: string) {
  if (parent) {
    await treeLink(page, parent).hover()
    await page.getByRole('button', { name: `Ajouter une sous-page dans ${parent}` }).click()
  } else {
    await page
      .getByRole('navigation', { name: 'Navigation' })
      .getByRole('button', { name: 'Nouvelle page' })
      .click()
  }
  const titleField = page.getByLabel('Titre de la page')
  await expect(titleField).toBeFocused()
  const saved = waitForTitleSave(page)
  await titleField.fill(title)
  await expect(treeLink(page, title)).toBeVisible()
  await saved
}

test.describe('6.1 Barre latérale et arbre de pages', () => {
  test('trois niveaux de pages, réordonnés, retrouvés à l’identique après rechargement', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)

    await createPage(page, 'Niveau 1')
    await createPage(page, 'Niveau 2', 'Niveau 1')
    await createPage(page, 'Niveau 3', 'Niveau 2')
    await createPage(page, 'Autre')

    const expected: [number, string][] = [
      [1, 'Bienvenue dans Nonotion'],
      [1, 'Niveau 1'],
      [2, 'Niveau 2'],
      [3, 'Niveau 3'],
      [1, 'Autre'],
    ]
    expect(await treeRows(page)).toEqual(expected)

    // Réordonner : « Autre » passe avant « Niveau 1 ».
    await dragRow(page, treeLink(page, 'Autre'), treeLink(page, 'Niveau 1'), 'before')
    await waitForSave(page)
    const reordered: [number, string][] = [
      [1, 'Bienvenue dans Nonotion'],
      [1, 'Autre'],
      [1, 'Niveau 1'],
      [2, 'Niveau 2'],
      [3, 'Niveau 3'],
    ]
    await expect.poll(() => treeRows(page)).toEqual(reordered)

    await page.reload()
    await expect(treeLink(page, 'Niveau 3')).toBeVisible()
    expect(await treeRows(page)).toEqual(reordered)
  })

  test('une page devient la sous-page de celle sur laquelle on la dépose', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Parent')
    await createPage(page, 'Enfant')

    await dragRow(page, treeLink(page, 'Enfant'), treeLink(page, 'Parent'), 'inside')

    await expect
      .poll(() => treeRows(page))
      .toEqual([
        [1, 'Bienvenue dans Nonotion'],
        [1, 'Parent'],
        [2, 'Enfant'],
      ])
  })

  test('impossible de créer une boucle en déposant une page dans sa sous-page', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Haut')
    await createPage(page, 'Bas', 'Haut')

    await dragRow(page, treeLink(page, 'Haut'), treeLink(page, 'Bas'), 'inside')
    await page.reload()

    await expect(treeLink(page, 'Bas')).toBeVisible()
    expect(await treeRows(page)).toEqual([
      [1, 'Bienvenue dans Nonotion'],
      [1, 'Haut'],
      [2, 'Bas'],
    ])
  })

  test('favoris, corbeille et restauration', async ({ page, request }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Important')

    await treeLink(page, 'Important').hover()
    await page.getByRole('button', { name: 'Actions pour Important' }).click()
    await page.getByRole('menuitem', { name: 'Ajouter aux favoris' }).click()
    const favorites = page.getByRole('region', { name: 'Favoris' })
    await expect(favorites.getByRole('link', { name: 'Important' })).toBeVisible()

    await treeLink(page, 'Important').hover()
    await page.getByRole('button', { name: 'Actions pour Important' }).click()
    await page.getByRole('menuitem', { name: 'Supprimer' }).click()
    await expect(treeLink(page, 'Important')).toBeHidden()

    await page.getByRole('button', { name: 'Corbeille' }).click()
    await page.getByRole('button', { name: 'Restaurer Important' }).click()
    await expect(treeLink(page, 'Important')).toBeVisible()
  })
})

test.describe('6.2 Page', () => {
  test('renommer met à jour la barre latérale tout de suite, Entrée passe au corps', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Brouillon')

    const title = page.getByLabel('Titre de la page')
    await title.press('End')
    // Lettre par lettre, comme au clavier : la barre latérale suit avant toute sauvegarde.
    await title.pressSequentially(' final', { delay: 20 })
    await expect(treeLink(page, 'Brouillon final')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Fil d’Ariane' })).toContainText(
      'Brouillon final',
    )

    await title.press('Enter')
    const body = page.getByLabel('Contenu de la page')
    await expect(body).toBeFocused()
    await body.pressSequentially('Première ligne')
    await waitForSave(page)

    await page.reload()
    await expect(page.getByLabel('Titre de la page')).toHaveValue('Brouillon final')
    await expect(page.getByLabel('Contenu de la page')).toHaveValue('Première ligne')
  })

  test('ajouter une icône et une couverture', async ({ page, request }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Décorée')

    await page.getByLabel('Titre de la page').hover()
    await page.getByRole('button', { name: 'Ajouter une icône' }).click()
    await page.getByRole('option', { name: '🚀' }).click()
    await expect(page.getByRole('button', { name: 'Changer l’icône' })).toHaveText('🚀')

    await page.getByLabel('Titre de la page').hover()
    await page.getByRole('button', { name: 'Ajouter une couverture' }).click()
    await expect(page.getByRole('button', { name: 'Changer la couverture' })).toBeAttached()
    // Une fois ajoutés, les boutons d'ajout disparaissent (spec 6.2).
    await expect(page.getByRole('button', { name: 'Ajouter une couverture' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ajouter une icône' })).toHaveCount(0)
  })
})
