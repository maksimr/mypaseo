/** Halfway down the chat, in client coordinates: a rail pick is centered on it, and the item across it is the rail's
 *  current one. */
export function readingLine(scroller: HTMLElement): number {
  return scroller.getBoundingClientRect().top + scroller.clientHeight / 2
}
