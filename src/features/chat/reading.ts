/** Halfway down the chat, in client coordinates. */
function readingLine(scroller: HTMLElement): number {
  return scroller.getBoundingClientRect().top + scroller.clientHeight / 2
}

/** The index (`data-item`) of the timeline item across the reading line. */
export function itemAcross(scroller: HTMLElement): number | undefined {
  const items = scroller.querySelectorAll<HTMLElement>('.timeline > [data-item], .msg-run > [data-item]')
  const line = readingLine(scroller)
  // The last item starting above the line: they're in order, so a binary search.
  let lo = 0
  let hi = items.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (items[mid].getBoundingClientRect().top <= line) lo = mid
    else hi = mid - 1
  }
  return items.length ? Number(items[lo].dataset.item) : undefined
}
