import { describe, expect, it } from 'vitest'
import { isWebUrl, normalizeWebUrl, videoEmbedUrl } from './urls'

describe('adresses des blocs Média', () => {
  it('seules les adresses web s’ouvrent ou s’affichent', () => {
    expect(isWebUrl('https://exemple.com/a.png')).toBe(true)
    expect(isWebUrl('http://exemple.com')).toBe(true)
    expect(isWebUrl('javascript:alert(1)')).toBe(false)
    expect(isWebUrl('data:text/html,<script>')).toBe(false)
    expect(isWebUrl('pas une adresse')).toBe(false)
  })

  it('un lien collé sans « https:// » est complété ; le reste est refusé', () => {
    expect(normalizeWebUrl(' exemple.com/page ')).toBe('https://exemple.com/page')
    expect(normalizeWebUrl('http://exemple.com')).toBe('http://exemple.com')
    expect(normalizeWebUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeWebUrl('bonjour')).toBeNull()
    expect(normalizeWebUrl('')).toBeNull()
  })

  it('une vidéo YouTube ou Vimeo se lit dans son lecteur intégré', () => {
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90',
    )
    expect(videoEmbedUrl('https://m.youtube.com/shorts/abcDEF12345')).toBe(
      'https://www.youtube-nocookie.com/embed/abcDEF12345',
    )
    expect(videoEmbedUrl('https://vimeo.com/76979871')).toBe(
      'https://player.vimeo.com/video/76979871',
    )
    // Un fichier vidéo se lit dans la page, pas dans un lecteur.
    expect(videoEmbedUrl('https://exemple.com/film.mp4')).toBeNull()
    expect(videoEmbedUrl('https://www.youtube.com/feed/library')).toBeNull()
    expect(videoEmbedUrl('javascript:alert(1)')).toBeNull()
  })
})
