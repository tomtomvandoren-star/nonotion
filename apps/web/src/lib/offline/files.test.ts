import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/platform', () => ({ platform: { offline: true } }))

const {
  clearFiles,
  configureFiles,
  evictFiles,
  keepFile,
  keepUploaded,
  localFile,
  MAX_AGE_MS,
  MAX_FILE_BYTES,
  resolveFile,
  settleLocalFile,
  storedFiles,
  storeLocalFile,
  uploadPath,
  withUploadedUrls,
} = await import('./files')
const { useNetwork } = await import('./network')

/*
 * Les fichiers gardés sur l'appareil (spec 6.16, complément du 16 novembre) : copiés quand on les
 * utilise, affichés depuis la copie, le ménage au-delà de 500 Mo ou après 60 jours, et les fichiers
 * ajoutés hors ligne en attendant leur envoi.
 */

const W = '01m7d3c831jjf8c3m3njxx8jmq'
const F = '01m7f0k9c3q8e5v2b6n4t1x7za'
const url = (name: string, host = 'https://nonotion.example') => `${host}/uploads/${W}/${F}/${name}`

let objectUrls = 0
beforeEach(async () => {
  await clearFiles()
  useNetwork.setState({ online: true })
  URL.createObjectURL = vi.fn(() => `blob:copie-${++objectUrls}`)
  URL.revokeObjectURL = vi.fn()
})

function fetcher(body = 'contenu', headers: Record<string, string> = {}) {
  const fetch = vi.fn(
    async () => new Response(new Blob([body], { type: 'image/png' }), { headers }),
  )
  configureFiles(fetch)
  return fetch
}

describe('fichiers gardés sur l’appareil', () => {
  it('reconnaît un fichier envoyé dans Nonotion, quel que soit le nom du serveur', () => {
    expect(uploadPath(url('plage.png'))).toBe(`${W}/${F}/plage.png`)
    expect(uploadPath(url('plage.png', 'http://127.0.0.1:8000'))).toBe(`${W}/${F}/plage.png`)
    expect(uploadPath('https://autre.site/images/plage.png')).toBeNull()
    expect(uploadPath('pas une adresse')).toBeNull()
  })

  it('garde une copie d’un fichier affiché, puis l’affiche depuis elle, sans le relire', async () => {
    const fetch = fetcher()
    expect(await resolveFile(url('plage.png'))).toBe(url('plage.png'))
    await vi.waitFor(async () => expect(Object.keys(await storedFiles())).toHaveLength(1))
    expect(fetch).toHaveBeenCalledWith(`${W}/${F}/plage.png`, expect.any(AbortSignal))

    const shown = await resolveFile(url('plage.png'))
    expect(shown).toMatch(/^blob:copie-/)
    await keepFile(url('plage.png'))
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('hors ligne, rien n’est lu ; un fichier trop lourd n’est pas gardé ; un autre site non plus', async () => {
    const fetch = fetcher('x', { 'Content-Length': String(MAX_FILE_BYTES + 1) })
    useNetwork.setState({ online: false })
    await keepFile(url('a.png'))
    expect(fetch).not.toHaveBeenCalled()

    useNetwork.setState({ online: true })
    await keepFile(url('film.mp4'))
    await keepFile('https://autre.site/photo.png')
    expect(fetch).toHaveBeenCalledOnce()
    expect(await storedFiles()).toEqual({})
  })

  it('le ménage : les fichiers inutilisés depuis 60 jours, puis les plus anciens au-delà de la place', async () => {
    await keepUploaded(url('ancien.png'), new Blob(['aaaa']))
    await keepUploaded(url('recent.png'), new Blob(['bbbb']))
    await storeLocalFile('01m7f0k9c3q8e5v2b6n4t1x7zz', new Blob(['en attente']))

    // Place pour un seul fichier envoyé : le moins récemment utilisé part.
    const stored = await storedFiles()
    const local = Object.values(stored).find((meta) => meta.size === 10)!
    await evictFiles(Date.now(), 4 + local.size)
    expect(Object.keys(await storedFiles()).sort()).toEqual(
      [`local/01m7f0k9c3q8e5v2b6n4t1x7zz`, `uploads/${W}/${F}/recent.png`].sort(),
    )

    // 60 jours plus tard : seul le fichier qui attend encore son envoi reste.
    await evictFiles(Date.now() + MAX_AGE_MS + 1)
    expect(Object.keys(await storedFiles())).toEqual(['local/01m7f0k9c3q8e5v2b6n4t1x7zz'])
  })

  it('un fichier ajouté hors ligne s’affiche tout de suite, puis passe sous sa vraie adresse une fois envoyé', async () => {
    const id = '01m7f0k9c3q8e5v2b6n4t1x7zy'
    const local = await storeLocalFile(id, new Blob(['photo'], { type: 'image/png' }))
    expect(local).toBe(`nonotion-file:${id}`)
    const shown = await resolveFile(local)
    expect(shown).toMatch(/^blob:copie-/)
    expect(await localFile(id)).toBeDefined()

    await settleLocalFile(id, url('photo.png'))
    // La page encore ouverte garde son image ; ce qui part au serveur cite la vraie adresse.
    expect(await resolveFile(local)).toBe(shown)
    expect(await resolveFile(url('photo.png'))).toBe(shown)
    expect(withUploadedUrls({ content: [{ props: { url: local } }] })).toEqual({
      content: [{ props: { url: url('photo.png') } }],
    })
    expect(await localFile(id)).toBeUndefined()
  })

  it('refusé par le serveur : le bloc redevient vide', async () => {
    const id = '01m7f0k9c3q8e5v2b6n4t1x7zx'
    const local = await storeLocalFile(id, new Blob(['gros']))
    await settleLocalFile(id, '')
    expect(withUploadedUrls({ url: local })).toEqual({ url: '' })
    expect(await storedFiles()).toEqual({})
  })
})
