export type ScreenPermissionMenuItem = { key: string; label: string };

export function screenPermissionKeysFromItems(
  items: ScreenPermissionMenuItem[]
): string[] {
  return items.map((item) => item.key);
}

export function isAllScreenPermissionsSelected(
  selectedKeys: string[],
  allKeys: string[]
): boolean {
  if (allKeys.length === 0) return false;
  const selected = new Set(selectedKeys);
  return allKeys.every((key) => selected.has(key));
}

/** Select All on → all keys; off → clear selection. */
export function applyScreenPermissionSelectAll(
  allKeys: string[],
  selectAll: boolean
): string[] {
  return selectAll ? [...allKeys] : [];
}

/** Toggle one key; Select All clears automatically when not every key remains. */
export function toggleScreenPermissionKey(
  selectedKeys: string[],
  key: string
): string[] {
  const next = new Set(selectedKeys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return Array.from(next);
}

/** Keys sent in create/update payload (full list when Select All is active). */
export function screenPermissionsForPayload(
  selectedKeys: string[],
  allKeys: string[]
): string[] {
  const allowed = new Set(allKeys);
  return selectedKeys.filter((key) => allowed.has(key));
}
