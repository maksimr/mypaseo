/** Halfway down what the composer at the chat's foot leaves visible, in client coordinates: a rail pick is centered
 *  on it, and the item across it is the rail's current one. */
export function readingLine(scroller: HTMLElement): number {
  const foot = scroller.querySelector<HTMLElement>('.chat-foot')!
  return scroller.getBoundingClientRect().top + (scroller.clientHeight - foot.offsetHeight) / 2
}
