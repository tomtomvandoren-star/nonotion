import { Cloud, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** D'où vient un élément de l'Agenda (spec 6.15). */
export type SourceKind = 'nonotion' | 'ics' | 'google' | 'icloud'

export type Source = { kind: SourceKind; label: string }

/**
 * La petite icône de la source d'un élément de l'Agenda : savoir d'un coup d'œil s'il vient d'une
 * base Nonotion, d'un agenda par lien, de Google ou d'iCloud. Le nom de la source est dans le titre
 * au survol (et dans le nom accessible de l'élément).
 */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const size = cn('size-3 shrink-0', className)
  return (
    <span title={source.label} data-source-kind={source.kind} className="inline-flex shrink-0">
      {source.kind === 'nonotion' ? (
        // L'icône de l'application, en tout petit.
        <svg aria-hidden viewBox="0 0 1024 1024" className={size}>
          <rect width="1024" height="1024" rx="224" fill="#657868" />
          <path d="M352 724V300h72l176 280V300h72v424h-72L424 444v280z" fill="#F7D9BC" />
        </svg>
      ) : source.kind === 'google' ? (
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center rounded-full bg-background text-[8px] leading-none font-bold text-[#4285F4] ring-1 ring-border',
            size,
          )}
        >
          G
        </span>
      ) : source.kind === 'icloud' ? (
        <Cloud aria-hidden className={size} />
      ) : (
        <Link2 aria-hidden className={size} />
      )}
    </span>
  )
}
