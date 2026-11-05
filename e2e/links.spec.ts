import { expect, test } from '@playwright/test'
import { createPage, editorOf, signUpAndOpen, treeLink, waitForContentSave } from './helpers'

test.describe('Liens vers des pages (menu « / »)', () => {
  test('« Lien vers une page » : choisir une page existante, le lien suit son titre et l’ouvre', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Recettes')
    await createPage(page, 'Courses')
    await page.getByLabel('Titre de la page').press('Enter')
    await expect(editorOf(page)).toBeFocused()

    await page.keyboard.type('/lien')
    await expect(page.getByRole('option').first()).toContainText('Lien vers une page')
    const saved = waitForContentSave(page)
    await page.keyboard.press('Enter')
    const picker = page.getByRole('dialog', { name: 'Lier une page' })
    await expect(picker).toBeVisible()
    await page.keyboard.type('recet')
    await expect(picker.getByRole('option').first()).toContainText('Recettes')
    await page.keyboard.press('Enter')
    await expect(picker).toHaveCount(0)

    const link = editorOf(page).locator('[data-page-link]')
    await expect(link).toHaveText('Recettes')
    await saved

    // Renommer la page renomme le lien.
    await treeLink(page, 'Recettes').click()
    await page.getByLabel('Titre de la page').fill('Recettes de saison')
    await treeLink(page, 'Courses').click()
    await expect(editorOf(page).locator('[data-page-link]')).toHaveText('Recettes de saison')

    await editorOf(page).locator('[data-page-link]').click()
    await expect(page.getByLabel('Titre de la page')).toHaveValue('Recettes de saison')
  })

  test('« Lien vers une page » annulé : rien n’est ajouté', async ({ page, request }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Notes')
    await page.getByLabel('Titre de la page').press('Enter')
    await page.keyboard.type('/lien')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Lier une page' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(editorOf(page).locator('[data-content-type="pageLink"]')).toHaveCount(0)
  })

  test('« Nouvelle page » : une sous-page est créée, ouverte, et son lien reste dans la page', async ({
    page,
    request,
  }) => {
    await signUpAndOpen(page, request)
    await createPage(page, 'Voyage')
    await page.getByLabel('Titre de la page').press('Enter')
    await expect(editorOf(page)).toBeFocused()
    await page.keyboard.type('/nouvelle page')
    await expect(page.getByRole('option').first()).toContainText('Nouvelle page')
    await page.keyboard.press('Enter')

    // On arrive dans la sous-page, le curseur dans son titre.
    await expect(page.getByLabel('Titre de la page')).toBeFocused()
    await page.keyboard.type('Itinéraire')
    await expect(treeLink(page, 'Itinéraire')).toBeVisible()

    await treeLink(page, 'Voyage').click()
    await expect(editorOf(page).locator('[data-page-link]')).toHaveText('Itinéraire')
    await page.reload()
    await expect(editorOf(page).locator('[data-page-link]')).toHaveText('Itinéraire')
  })
})
