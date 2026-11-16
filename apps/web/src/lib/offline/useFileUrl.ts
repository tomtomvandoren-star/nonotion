import { useEffect, useState } from 'react'
import { resolveFile } from './files'

/**
 * L'adresse à afficher pour un fichier (une couverture de page…) : sa copie sur l'appareil quand
 * elle existe, sinon l'adresse elle-même, dont une copie est alors gardée (spec 6.16).
 */
export function useFileUrl(url: string | null): string | null {
  const [resolved, setResolved] = useState<{ url: string; shown: string } | null>(null)
  useEffect(() => {
    if (!url) return
    let live = true
    void resolveFile(url).then((shown) => {
      if (live) setResolved({ url, shown })
    })
    return () => {
      live = false
    }
  }, [url])
  return url && resolved?.url === url ? resolved.shown || url : url
}
