import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Icône d'une page : son émoji, ou un document par défaut. */
export function PageGlyph({ icon, className }: { icon: string | null; className?: string }) {
  if (icon) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center leading-none', className)}
      >
        {icon}
      </span>
    )
  }
  return <FileText aria-hidden className={cn('size-4 shrink-0 text-muted-foreground', className)} />
}
