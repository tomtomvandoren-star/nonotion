import { expect, test, type Page } from '@playwright/test'
import { createPage, editorBlocks, editorOf, signUpAndOpen, waitForContentSave } from './helpers'

/** Ouvre une page neuve, le curseur dans son corps. */
async function openEmptyPage(page: Page, request: Parameters<typeof signUpAndOpen>[1]) {
  await signUpAndOpen(page, request)
  await createPage(page, 'Notes')
  await page.getByLabel('Titre de la page').press('Enter')
  await expect(editorOf(page)).toBeFocused()
}

const slashMenu = (page: Page) => page.locator('.bn-suggestion-menu')

test.describe('6.3a Menu « / »', () => {
  test('« /titre » transforme la ligne en titre 1, la liste se filtre à chaque lettre', async ({
    page,
    request,
  }) => {
    await openEmptyPage(page, request)

    await page.keyboard.type('/')
    const options = slashMenu(page).getByRole('option')
    await expect(options.first()).toBeVisible()

    // Chaque lettre resserre la liste : « /to », puis « /tod » ne laisse que To-do.
    let previous = await options.count()
    for (const letter of ['t', 'o', 'd']) {
      await page.keyboard.type(letter)
      if (letter !== 't') await expect.poll(() => options.count()).toBeLessThan(previous)
      previous = await options.count()
    }
    await expect(options).toHaveText([/To-do/])

    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('titre')
    await expect(options).toHaveText([/Titre 1/, /Titre 2/, /Titre 3/])

    await page.keyboard.press('Enter')
    await page.keyboard.type('Introduction')
    expect(await editorBlocks(page)).toEqual([['heading:1', 'Introduction']])
  })

  test('Échap ferme le menu et le « / » reste dans le texte', async ({ page, request }) => {
    await openEmptyPage(page, request)

    await page.keyboard.type('/')
    await expect(slashMenu(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(slashMenu(page)).toBeHidden()
    await page.keyboard.type('2')
    expect(await editorBlocks(page)).toEqual([['paragraph', '/2']])

    // Au milieu d'un mot (« 1/2 », une adresse…), « / » est un caractère comme un autre.
    await page.keyboard.type(' 1/2')
    await expect(slashMenu(page)).toBeHidden()
    expect(await editorBlocks(page)).toEqual([['paragraph', '/2 1/2']])
  })
})

test.describe('6.3b Raccourcis Markdown', () => {
  test('chaque raccourci crée le bon bloc', async ({ page, request }) => {
    await openEmptyPage(page, request)

    // Chaque ligne : raccourci, texte, type attendu. Entrée termine la ligne ; dans une liste,
    // une seconde Entrée sur l'élément vide en sort.
    const lines: [string, string, string][] = [
      ['# ', 'Grand', 'heading:1'],
      ['## ', 'Moyen', 'heading:2'],
      ['### ', 'Petit', 'heading:3'],
      ['- ', 'Tiret', 'bulletListItem'],
      ['* ', 'Étoile', 'bulletListItem'],
      ['1. ', 'Premier', 'numberedListItem'],
      ['[] ', 'À faire', 'checkListItem'],
      ['> ', 'Dépliable', 'toggleListItem'],
      ['" ', 'Citation', 'quote'],
    ]
    for (const [shortcut, text] of lines) {
      await page.keyboard.type(shortcut + text)
      await page.keyboard.press('Enter')
      const [last] = (await editorBlocks(page)).slice(-1)
      if (last?.[0] !== 'paragraph') await page.keyboard.press('Enter')
    }
    // Après le séparateur, on continue d'écrire sur la ligne suivante.
    await page.keyboard.type('---')
    await page.keyboard.type('```')
    await page.keyboard.press('Enter')
    await page.keyboard.type('const x = 1')

    const blocks = await editorBlocks(page)
    for (const [, text, type] of lines) expect(blocks).toContainEqual([type, text])
    expect(blocks.map(([type]) => type)).toContain('divider')
    expect(blocks).toContainEqual(['codeBlock', 'const x = 1'])
    // Pas de bloc parasite : chaque raccourci a transformé sa propre ligne.
    expect(blocks.filter(([type]) => type === 'quote')).toHaveLength(1)
  })

  test('gras, italique et code en ligne', async ({ page, request }) => {
    await openEmptyPage(page, request)

    await page.keyboard.type('Du **gras**, un mot *penché* et du `code` ')
    const editor = editorOf(page)
    await expect(editor.locator('strong')).toHaveText('gras')
    await expect(editor.locator('em')).toHaveText('penché')
    await expect(editor.locator('code')).toHaveText('code')
    await expect(editor).toHaveText('Du gras, un mot penché et du code')
  })
})

test.describe('6.3c Poignée de bloc', () => {
  test('déplacer un bloc entre deux autres, puis Ctrl+Z annule le déplacement', async ({
    page,
    request,
  }) => {
    await openEmptyPage(page, request)
    await page.keyboard.type('Un')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Deux')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Trois')
    // L'historique regroupe les changements faits à moins de 500 ms d'intervalle : le temps de
    // prendre la souris, le déplacement devient une étape d'annulation à lui seul.
    await page.waitForTimeout(700)

    const block = (text: string) =>
      editorOf(page).locator('.bn-block-outer', { hasText: text }).first()
    await block('Trois').hover()
    const handle = page.getByRole('button', { name: 'Glisser pour déplacer, cliquer pour le menu' })
    await expect(handle).toBeVisible()

    // Lâché sur la moitié basse de « Un » : le bloc vient juste après lui, entre « Un » et « Deux ».
    const from = await handle.boundingBox()
    const to = await block('Un').boundingBox()
    if (!from || !to) throw new Error('bloc introuvable')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + 40, to.y + to.height * 0.7, { steps: 12 })
    await page.mouse.up()

    await expect
      .poll(() => editorBlocks(page))
      .toEqual([
        ['paragraph', 'Un'],
        ['paragraph', 'Trois'],
        ['paragraph', 'Deux'],
      ])

    await editorOf(page).focus()
    await page.keyboard.press('ControlOrMeta+z')
    await expect
      .poll(() => editorBlocks(page))
      .toEqual([
        ['paragraph', 'Un'],
        ['paragraph', 'Deux'],
        ['paragraph', 'Trois'],
      ])
  })

  test('le menu de la poignée duplique et transforme un bloc', async ({ page, request }) => {
    await openEmptyPage(page, request)
    await page.keyboard.type('Idée')

    await editorOf(page).locator('.bn-block-outer', { hasText: 'Idée' }).hover()
    await page.getByRole('button', { name: 'Glisser pour déplacer, cliquer pour le menu' }).click()
    await page.getByRole('menuitem', { name: 'Dupliquer' }).click()
    await expect
      .poll(() => editorBlocks(page))
      .toEqual([
        ['paragraph', 'Idée'],
        ['paragraph', 'Idée'],
      ])

    await editorOf(page).locator('.bn-block-outer', { hasText: 'Idée' }).first().hover()
    await page.getByRole('button', { name: 'Glisser pour déplacer, cliquer pour le menu' }).click()
    await page.getByRole('menuitem', { name: 'Transformer en' }).click()
    await page.getByRole('menuitem', { name: 'Encadré' }).click()
    await expect
      .poll(() => editorBlocks(page))
      .toEqual([
        ['callout', '💡Idée'],
        ['paragraph', 'Idée'],
      ])
  })
})

test.describe('6.3d Barre de mise en forme', () => {
  test('apparaît au-dessus de la sélection et met en gras', async ({ page, request }) => {
    await openEmptyPage(page, request)
    await page.keyboard.type('Bonjour')
    await page.keyboard.press('Shift+Home')

    const bold = page.getByRole('button', { name: 'Gras' })
    await expect(bold).toBeVisible()
    for (const name of ['Italique', 'Souligné', 'Barré', 'Code', 'Créer un lien'])
      await expect(page.getByRole('button', { name })).toBeVisible()

    // Juste au-dessus du texte sélectionné.
    const toolbarBox = await bold.boundingBox()
    const textBox = await editorOf(page).locator('.bn-inline-content').first().boundingBox()
    expect(toolbarBox && textBox && toolbarBox.y + toolbarBox.height <= textBox.y + 2).toBe(true)

    await bold.click()
    await expect(editorOf(page).locator('strong')).toHaveText('Bonjour')
  })
})

test.describe('6.3e To-do', () => {
  test('cocher puis décocher persiste après rechargement', async ({ page, request }) => {
    await openEmptyPage(page, request)
    let saved = waitForContentSave(page)
    await page.keyboard.type('[] Acheter du pain')
    await saved

    const checkbox = editorOf(page).getByRole('checkbox')
    saved = waitForContentSave(page)
    await checkbox.check()
    await saved
    await page.reload()
    await expect(editorOf(page).getByRole('checkbox')).toBeChecked()

    saved = waitForContentSave(page)
    await editorOf(page).getByRole('checkbox').uncheck()
    await saved
    await page.reload()
    await expect(editorOf(page).getByRole('checkbox')).not.toBeChecked()
  })

  test('Entrée sur une to-do vide sort de la liste', async ({ page, request }) => {
    await openEmptyPage(page, request)
    await page.keyboard.type('[] Première')
    await page.keyboard.press('Enter')
    expect(await editorBlocks(page)).toEqual([
      ['checkListItem', 'Première'],
      ['checkListItem', ''],
    ])
    await page.keyboard.press('Enter')
    await page.keyboard.type('Texte libre')
    expect(await editorBlocks(page)).toEqual([
      ['checkListItem', 'Première'],
      ['paragraph', 'Texte libre'],
    ])
  })

  test('Tab indente une to-do, Maj+Tab la désindente', async ({ page, request }) => {
    await openEmptyPage(page, request)
    await page.keyboard.type('[] Tâche')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Sous-tâche')
    await page.keyboard.press('Tab')

    const nested = editorOf(page).locator('.bn-block-group .bn-block-group .bn-block-content')
    await expect(nested).toHaveText('Sous-tâche')
    await page.keyboard.press('Shift+Tab')
    await expect(nested).toHaveCount(0)
  })
})

test.describe('Sauvegarde automatique', () => {
  test('le contenu revient après rechargement, et ouvrir une page n’envoie rien', async ({
    page,
    request,
  }) => {
    await openEmptyPage(page, request)
    const saved = waitForContentSave(page)
    await page.keyboard.type('# Plan')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Contenu gardé')
    await saved
    await expect(page.getByText('Enregistré', { exact: true })).toBeVisible()

    const writes: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'PUT') writes.push(req.url())
    })
    await page.reload()
    await expect
      .poll(() => editorBlocks(page))
      .toEqual([
        ['heading:1', 'Plan'],
        ['paragraph', 'Contenu gardé'],
      ])
    // Ouvrir la page ne la réécrit pas (sinon chaque ouverture créerait une nouvelle version).
    await page.waitForTimeout(1500)
    expect(writes).toEqual([])
  })

  test('recharger ou revenir en arrière aussitôt après avoir tapé ne perd rien', async ({
    page,
    request,
  }) => {
    await openEmptyPage(page, request)
    // Sans attendre l'envoi groupé (500 ms) : la page se ferme alors que la frappe attend encore.
    await page.keyboard.type('Tapé juste avant')
    await page.reload()
    await expect.poll(() => editorBlocks(page)).toEqual([['paragraph', 'Tapé juste avant']])

    await page.getByLabel('Titre de la page').fill('Titre tapé juste avant')
    await page.reload()
    await expect(page.getByLabel('Titre de la page')).toHaveValue('Titre tapé juste avant')

    // Retour arrière sans quitter l'éditeur : il est démonté encore actif, le dernier mot part.
    await createPage(page, 'Deuxième')
    await page.goBack()
    await editorOf(page).getByText('Tapé juste avant').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' et encore')
    await page.goBack()
    await page.goForward()
    await expect
      .poll(() => editorBlocks(page))
      .toEqual([['paragraph', 'Tapé juste avant et encore']])
  })
})

test.describe('Conflit entre deux appareils', () => {
  test('une page modifiée ailleurs : on peut écraser avec sa version', async ({
    page,
    request,
  }) => {
    await openEmptyPage(page, request)
    const pageId = page.url().split('/p/')[1]
    const token = await page.evaluate(() => window.localStorage.getItem('nonotion.token'))

    // Un autre appareil enregistre la page pendant qu'on l'a ouverte ici.
    const other = await request.put(`/api/pages/${pageId}/content`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      data: { content: [{ type: 'paragraph', content: 'Écrit ailleurs' }], version: 1 },
    })
    expect(other.status()).toBe(200)

    await page.keyboard.type('Écrit ici')
    const dialog = page.getByRole('alertdialog', { name: 'Cette page a été modifiée ailleurs' })
    await expect(dialog).toBeVisible()

    const saved = waitForContentSave(page)
    await dialog.getByRole('button', { name: 'Écraser avec ma version' }).click()
    expect((await saved).status()).toBe(200)

    await page.reload()
    await expect(editorOf(page)).toHaveText('Écrit ici')
  })
})

test.describe('6.3b Raccourcis Markdown au clavier d’un téléphone', () => {
  // Les claviers virtuels (Gboard…) regroupent la frappe en mots validés d'un coup. Chromium sait
  // simuler cette « composition » ; c'est elle qui empêchait les raccourcis sur Android.
  test('le raccourci et le mot suivant validés ensemble donnent le bon bloc', async ({
    page,
    request,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'simulation de clavier virtuel propre à Chromium')
    await openEmptyPage(page, request)
    const cdp = await page.context().newCDPSession(page)
    const composeWord = async (word: string) => {
      for (let i = 1; i <= word.length; i++)
        await cdp.send('Input.imeSetComposition', {
          text: word.slice(0, i),
          selectionStart: i,
          selectionEnd: i,
        })
      await cdp.send('Input.insertText', { text: word })
    }

    await composeWord('# Titre')
    await expect.poll(() => editorBlocks(page)).toEqual([['heading:1', 'Titre']])

    await page.keyboard.press('Enter')
    await composeWord('[] Lait')
    await expect.poll(() => editorBlocks(page)).toContainEqual(['checkListItem', 'Lait'])

    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await composeWord('Du **gras** ')
    await expect(editorOf(page).locator('strong')).toHaveText('gras')

    await composeWord('et du `code` ')
    await expect(editorOf(page).locator('code')).toHaveText('code')
  })
})

test.describe('6.3c Poignée de bloc au doigt', () => {
  // Retour du test Android : la poignée ouvrait le menu mais ne déplaçait pas le bloc au doigt.
  test('appuyer sur ⠿ puis glisser déplace le bloc ; un tap ouvre toujours le menu', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'toucher simulé par le protocole de Chromium')
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      // Écran tactile assez large pour garder la barre latérale (le parcours d'ouverture s'en sert).
      viewport: { width: 820, height: 900 },
      baseURL: 'http://localhost:5173',
    })
    const page = await context.newPage()
    await openEmptyPage(page, context.request)
    for (const [i, text] of ['Un', 'Deux', 'Trois'].entries()) {
      if (i > 0) await page.keyboard.press('Enter')
      await page.keyboard.type(text)
    }
    const block = (text: string) =>
      editorOf(page).locator('.bn-block-outer', { hasText: text }).first()

    // Un tap sur le bloc fait apparaître sa poignée.
    const trois = (await block('Trois').boundingBox())!
    await page.touchscreen.tap(trois.x + 60, trois.y + trois.height / 2)
    const handle = page.getByRole('button', { name: 'Glisser pour déplacer, cliquer pour le menu' })
    await expect(handle).toBeVisible()

    const from = (await handle.boundingBox())!
    const un = (await block('Un').boundingBox())!
    const cdp = await context.newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      })
    await touch('touchStart', from.x + from.width / 2, from.y + from.height / 2)
    for (let step = 1; step <= 10; step++) {
      const y =
        from.y +
        from.height / 2 +
        ((un.y + un.height * 0.75 - from.y - from.height / 2) * step) / 10
      await touch('touchMove', from.x + 40, y)
    }
    await touch('touchEnd', 0, 0)

    await expect
      .poll(() => editorBlocks(page))
      .toEqual([
        ['paragraph', 'Un'],
        ['paragraph', 'Trois'],
        ['paragraph', 'Deux'],
      ])
    // Le relâcher n'a pas ouvert le menu ; un tap, si.
    await expect(page.getByRole('menuitem', { name: 'Dupliquer' })).toHaveCount(0)
    await context.close()
  })
})
