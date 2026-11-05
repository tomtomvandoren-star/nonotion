import type {
  DatabaseDetail,
  DatabaseRowData,
  DatabaseView,
  Property,
  RowGroup,
} from '@nonotion/shared'
import type { ColumnAction } from './ColumnHeader'

/** Ce que reçoit le corps d'une vue (tableau, liste, galerie) : les lignes déjà filtrées et triées. */
export type ViewBodyProps = {
  database: DatabaseDetail
  view: DatabaseView
  rows: DatabaseRowData[]
  groups: RowGroup<DatabaseRowData>[] | null
  onOpenRow: (rowId: string) => void
  /** Les valeurs qu'hérite un nouvel élément : filtre actif et, s'il y a lieu, sa section. */
  inherited: (groupKey?: string | null) => Record<string, unknown>
  onColumnAction: (property: Property, action: ColumnAction) => void
}
