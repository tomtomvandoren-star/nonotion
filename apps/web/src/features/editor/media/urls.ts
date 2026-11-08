/**
 * Les adresses des blocs du groupe « Média » : seules celles du web (http, https) sont ouvertes ou
 * affichées. Un « javascript: » collé dans un bloc ne doit jamais s'exécuter.
 */
export function isWebUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

/** « exemple.com/page » devient « https://exemple.com/page » ; null si ce n'est pas une adresse web. */
export function normalizeWebUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const url = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  return isWebUrl(url) && new URL(url).hostname.includes('.') ? url : null
}

/**
 * Le lecteur intégré d'une vidéo YouTube ou Vimeo (null pour un fichier vidéo) : une page de
 * vidéo ne se lit pas dans une balise <video>. YouTube sans cookies (youtube-nocookie.com).
 */
export function videoEmbedUrl(url: string): string | null {
  if (!isWebUrl(url)) return null
  const parsed = new URL(url)
  const host = parsed.hostname.replace(/^(www|m)\./, '')
  const id = /^[\w-]{6,}$/

  if (host === 'youtu.be') {
    const video = parsed.pathname.slice(1)
    return id.test(video) ? youtube(video, parsed) : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, segment] = parsed.pathname.split('/')
    const video =
      kind === 'watch'
        ? parsed.searchParams.get('v')
        : ['embed', 'shorts', 'live'].includes(kind ?? '')
          ? segment
          : null
    return video && id.test(video) ? youtube(video, parsed) : null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const video = parsed.pathname.match(/(?:^|\/)(\d{5,})(?:\/|$)/)?.[1]
    return video ? `https://player.vimeo.com/video/${video}` : null
  }
  return null
}

/** Le lecteur YouTube, au moment indiqué par « t=90 » ou « t=1m30s » s'il y en a un. */
function youtube(video: string, parsed: URL): string {
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${video}`)
  const time = parsed.searchParams.get('t') ?? parsed.searchParams.get('start')
  const match = time?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/)
  if (match) {
    const seconds =
      Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
    if (seconds > 0) embed.searchParams.set('start', String(seconds))
  }
  return embed.toString()
}
