import type { TimelineItem } from './daemon'

/**
 * Live stream items are deltas: consecutive assistant/reasoning chunks append text,
 * tool calls upsert by callId, user messages dedupe by messageId.
 */
export function applyStreamItem(items: TimelineItem[], item: TimelineItem): TimelineItem[] {
  const last = items.at(-1)
  if (item.type === 'assistant_message' && last?.type === 'assistant_message') {
    if (!item.messageId || !last.messageId || item.messageId === last.messageId)
      return items.with(-1, { ...last, text: last.text + item.text })
  }
  if (item.type === 'reasoning' && last?.type === 'reasoning') return items.with(-1, { ...last, text: last.text + item.text })
  if (item.type === 'tool_call') {
    const i = items.findLastIndex((x) => x.type === 'tool_call' && x.callId === item.callId)
    if (i >= 0) return items.with(i, item)
  }
  if (item.type === 'user_message' && item.messageId && items.some((x) => x.type === 'user_message' && x.messageId === item.messageId))
    return items
  return [...items, item]
}
