import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNetwork } from './network'
import {
  configureOutbox,
  enqueue,
  flushOutbox,
  loadOutbox,
  replaceInQueue,
  resetOutbox,
  useOutbox,
  type OutboxEntry,
} from './outbox'
import { readKey } from './storage'
import { newId } from './ulid'

/*
 * La file d'attente des modifications faites hors ligne (spec 6.16) : dans l'ordre, fusionnées par
 * objet, gardée sur l'appareil, et envoyée au retour de la connexion.
 */

type Reply = { status: number; data?: unknown } | 'network'

function setup(replies: Reply[] = []) {
  const sent: OutboxEntry[] = []
  const handlers = {
    send: vi.fn(async (entry: OutboxEntry) => {
      sent.push(entry)
      const reply = replies.shift() ?? { status: 200, data: {} }
      if (reply === 'network') throw new TypeError('Failed to fetch')
      return { status: reply.status, data: reply.data ?? {} }
    }),
    onDrained: vi.fn(),
    onRejected: vi.fn(),
    onContentSaved: vi.fn(),
    onSent: vi.fn(),
  }
  configureOutbox(handlers)
  return { sent, ...handlers }
}

const offline = () => useNetwork.setState({ online: false })
const online = () => useNetwork.setState({ online: true })

beforeEach(() => {
  resetOutbox()
  offline()
})

describe('file d’attente hors ligne', () => {
  it('garde les modifications dans l’ordre et les envoie toutes au retour de la connexion', async () => {
    const { sent, onDrained } = setup()
    enqueue({ method: 'POST', path: 'workspaces/w/pages', body: { id: 'p1' }, label: 'une page' })
    enqueue({ method: 'PATCH', path: 'pages/p1', body: { title: 'Courses' }, label: 'un titre' })
    expect(useOutbox.getState().entries).toHaveLength(2)

    online()
    await flushOutbox()

    expect(sent.map((entry) => entry.path)).toEqual(['workspaces/w/pages', 'pages/p1'])
    expect(useOutbox.getState().entries).toEqual([])
    expect(onDrained).toHaveBeenCalledOnce()
  })

  it('deux modifications du même objet n’en font qu’une : champs réunis, dernier document', async () => {
    const { sent } = setup()
    enqueue({
      method: 'PATCH',
      path: 'pages/r1',
      body: { properties: { status: 'todo', due: '2026-11-20' } },
      key: 'row:r1',
      merge: 'patch',
      label: 'une ligne',
    })
    enqueue({
      method: 'PATCH',
      path: 'pages/r1',
      body: { title: 'Pain', properties: { status: 'done' } },
      key: 'row:r1',
      merge: 'patch',
      label: 'une ligne',
    })
    enqueue({
      method: 'PUT',
      path: 'pages/p1/content',
      body: { content: ['v1'], version: 4 },
      key: 'content:p1',
      merge: 'content',
      pageId: 'p1',
      label: 'le contenu',
    })
    enqueue({
      method: 'PUT',
      path: 'pages/p1/content',
      body: { content: ['v2'], version: 4 },
      key: 'content:p1',
      merge: 'content',
      pageId: 'p1',
      label: 'le contenu',
    })

    online()
    await flushOutbox()

    expect(sent).toHaveLength(2)
    expect(sent[0]!.body).toEqual({
      title: 'Pain',
      properties: { status: 'done', due: '2026-11-20' },
    })
    // Le dernier document, mais la version d'où l'on est parti (pour reconnaître un conflit).
    expect(sent[1]!.body).toEqual({ content: ['v2'], version: 4 })
  })

  it('un 409 sur le corps d’une page devient un conflit à résoudre, avec les deux versions', async () => {
    const { onContentSaved } = setup([
      { status: 409, data: { message: 'Cette page a été modifiée ailleurs.', version: 7 } },
    ])
    enqueue({
      method: 'PUT',
      path: 'pages/p1/content',
      body: { content: [{ id: 'b' }], version: 5 },
      key: 'content:p1',
      merge: 'content',
      pageId: 'p1',
      label: 'le contenu de « Notes »',
    })

    online()
    await flushOutbox()

    expect(useOutbox.getState().conflicts.p1).toMatchObject({
      pageId: 'p1',
      title: 'le contenu de « Notes »',
      document: [{ id: 'b' }],
      baseVersion: 5,
      serverVersion: 7,
    })
    expect(onContentSaved).not.toHaveBeenCalled()
    expect(useOutbox.getState().entries).toEqual([])
  })

  it('un corps enregistré donne sa nouvelle version à la page ouverte', async () => {
    const { onContentSaved } = setup([{ status: 200, data: { data: { version: 6 } } }])
    enqueue({
      method: 'PUT',
      path: 'pages/p1/content',
      body: { content: [], version: 5 },
      pageId: 'p1',
      label: 'le contenu',
    })
    online()
    await flushOutbox()
    expect(onContentSaved).toHaveBeenCalledWith('p1', 6)
  })

  it('une modification refusée est retirée et nommée ; les suivantes partent quand même', async () => {
    const { sent, onRejected } = setup([
      { status: 404, data: { message: 'Page introuvable.' } },
      { status: 200 },
    ])
    enqueue({ method: 'PATCH', path: 'pages/gone', body: {}, label: 'le titre d’une page' })
    enqueue({ method: 'PATCH', path: 'pages/p2', body: {}, label: 'autre' })

    online()
    await flushOutbox()

    expect(onRejected).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'pages/gone' }),
      'Page introuvable.',
    )
    expect(sent).toHaveLength(2)
    expect(useOutbox.getState().entries).toEqual([])
  })

  it('sans réseau en route : tout reste dans la file, dans le même ordre', async () => {
    const { sent, onDrained } = setup(['network'])
    enqueue({ method: 'PATCH', path: 'pages/a', body: {}, label: 'a' })
    enqueue({ method: 'PATCH', path: 'pages/b', body: {}, label: 'b' })

    online()
    await flushOutbox()

    expect(sent).toHaveLength(1)
    expect(useNetwork.getState().online).toBe(false)
    expect(useOutbox.getState().entries.map((entry) => entry.path)).toEqual(['pages/a', 'pages/b'])
    expect(onDrained).not.toHaveBeenCalled()
  })

  it('hors ligne, rien ne part ; la file est gardée sur l’appareil et relue au démarrage', async () => {
    const { sent } = setup()
    enqueue({ method: 'PATCH', path: 'pages/a', body: { title: 'x' }, label: 'a' })
    await flushOutbox()
    expect(sent).toHaveLength(0)

    await vi.waitFor(async () =>
      expect(await readKey<OutboxEntry[]>('outbox')).toEqual([
        expect.objectContaining({ path: 'pages/a', body: { title: 'x' } }),
      ]),
    )
    useOutbox.setState({ entries: [] })
    await loadOutbox()
    expect(useOutbox.getState().entries).toEqual([
      expect.objectContaining({ path: 'pages/a', body: { title: 'x' } }),
    ])
  })
})

describe('identifiants choisis sur l’appareil', () => {
  it('26 caractères de Crockford en minuscules, dans l’ordre de création', () => {
    const a = newId(Date.UTC(2026, 10, 14))
    const b = newId(Date.UTC(2026, 10, 15))
    expect(a).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/)
    expect(a < b).toBe(true)
    expect(newId()).not.toBe(newId())
  })

  it('un fichier ajouté hors ligne passe avant ce qui cite son adresse, qui est remplacée à son envoi', async () => {
    const { sent, onSent } = setup([
      { status: 200, data: { data: { version: 4 } } },
      { status: 201, data: { url: 'https://n.test/uploads/a/b/plage.png' } },
      { status: 200, data: { data: { version: 5 } } },
    ])
    const content = (text: string, version: number) => ({
      method: 'PUT' as const,
      path: 'pages/p1/content',
      body: { content: [{ text }], version },
      key: 'content:p1',
      merge: 'content' as const,
      pageId: 'p1',
      label: 'le texte',
    })
    enqueue(content('avant', 3))
    enqueue({
      method: 'POST',
      path: 'pages/p1/files',
      body: { upload: { id: 'f1', name: 'plage.png', type: 'image/png' } },
      key: 'upload:f1',
      label: 'le fichier',
    })
    // Écrit après le fichier : ne se fond pas dans le texte qui le précède.
    enqueue(content('nonotion-file:f1', 3))
    enqueue(content('nonotion-file:f1 et la suite', 3))
    expect(useOutbox.getState().entries.map((entry) => entry.path)).toEqual([
      'pages/p1/content',
      'pages/p1/files',
      'pages/p1/content',
    ])

    // Ce que ferait l'application à l'envoi du fichier : sa vraie adresse partout.
    onSent.mockImplementation((entry: OutboxEntry, data: unknown) => {
      if (entry.key === 'upload:f1')
        replaceInQueue('nonotion-file:f1', (data as { url: string }).url)
    })
    online()
    await flushOutbox()

    expect(sent.map((entry) => entry.path)).toEqual([
      'pages/p1/content',
      'pages/p1/files',
      'pages/p1/content',
    ])
    // Le second envoi du texte part de la version que le premier a créée, avec la vraie adresse.
    expect(sent[2]!.body).toEqual({
      content: [{ text: 'https://n.test/uploads/a/b/plage.png et la suite' }],
      version: 4,
    })
    expect(useOutbox.getState().entries).toEqual([])
  })
})
