/**
 * Next sort state for a single column, aligned with react-table v7 `toggleSortBy`
 * when multi-sort is off and `sortDescFirst` matches the column default.
 */
export type ServerTableSortBy = ReadonlyArray<{ id: string; desc: boolean }>;

export function nextServerSortState(
  current: ServerTableSortBy,
  columnId: string,
  sortDescFirst = false
): { id: string; desc: boolean }[] {
  const ex = current.find((d) => d.id === columnId);

  if (!ex) {
    return [{ id: columnId, desc: sortDescFirst }];
  }

  const shouldRemove =
    (ex.desc && !sortDescFirst) || (!ex.desc && sortDescFirst);
  if (shouldRemove) {
    return [];
  }

  return [{ id: columnId, desc: !ex.desc }];
}
