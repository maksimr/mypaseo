/** Items in the saved order of their keys; ones it doesn't list (new projects) follow, in their own order. */
export function inOrder<T>(items: T[], order: string[], key: (x: T) => string) {
  const rank = (x: T) => {
    const i = order.indexOf(key(x))
    return i < 0 ? order.length : i
  }
  return items.toSorted((a, b) => rank(a) - rank(b))
}

/** The new saved order: ids with id moved before or after target, then the saved ids not in ids (an offline host's projects) as they were. */
export function moveId(ids: string[], order: string[], id: string, target: string, after: boolean) {
  const moved = ids.filter((x) => x !== id)
  moved.splice(moved.indexOf(target) + Number(after), 0, id)
  return [...moved, ...order.filter((x) => !moved.includes(x))]
}
