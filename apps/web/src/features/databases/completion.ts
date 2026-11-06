import {
  completionProperty,
  completionValue,
  type DatabaseDetail,
  type DatabaseRowData,
  isDone,
} from '@nonotion/shared'
import type { RowPatch } from '@/lib/api/databases'
import { useUpdateRow } from './queries'

export type Completion = {
  isDone: (row: DatabaseRowData) => boolean
  toggle: (row: DatabaseRowData) => void
}

/**
 * La case « c'est fait » d'une base qui a un Statut (spec 6.7) : la cocher met le Statut à
 * « Terminé », la décocher le remet « À faire ». Null si la base n'a pas de quoi la piloter.
 * `update` envoie la modification d'une ligne de cette base.
 */
export function completionFor(
  database: DatabaseDetail,
  update: (rowId: string, patch: RowPatch) => void,
): Completion | null {
  const status = completionProperty(database.schema)
  if (!status || completionValue(status, true) === null || completionValue(status, false) === null)
    return null
  return {
    isDone: (row) => isDone(row, status),
    toggle: (row) =>
      update(row.id, {
        properties: { [status.id]: completionValue(status, !isDone(row, status)) },
      }),
  }
}

export function useCompletion(database: DatabaseDetail): Completion | null {
  const updateRow = useUpdateRow(database.id)
  return completionFor(database, (rowId, patch) => updateRow.mutate({ rowId, patch }))
}
