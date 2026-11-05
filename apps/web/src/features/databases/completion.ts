import {
  completionProperty,
  completionValue,
  type DatabaseDetail,
  type DatabaseRowData,
  isDone,
} from '@nonotion/shared'
import { useUpdateRow } from './queries'

export type Completion = {
  isDone: (row: DatabaseRowData) => boolean
  toggle: (row: DatabaseRowData) => void
}

/**
 * La case « c'est fait » d'une base qui a un Statut (spec 6.7) : la cocher met le Statut à
 * « Terminé », la décocher le remet « À faire ». Null si la base n'a pas de quoi la piloter.
 */
export function useCompletion(database: DatabaseDetail): Completion | null {
  const updateRow = useUpdateRow(database.id)
  const status = completionProperty(database.schema)
  if (!status || completionValue(status, true) === null || completionValue(status, false) === null)
    return null
  return {
    isDone: (row) => isDone(row, status),
    toggle: (row) =>
      updateRow.mutate({
        rowId: row.id,
        patch: { properties: { [status.id]: completionValue(status, !isDone(row, status)) } },
      }),
  }
}
