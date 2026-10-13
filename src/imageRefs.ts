// Composer text names each attached image by its 1-based position, like Claude Code, so a prompt with several images says which one it means.
export const imageRef = (n: number) => `[Image #${n}]`

/** Text after removing image n: its refs go, later refs shift down to keep pointing at the same picture. */
export const dropImageRef = (text: string, n: number) =>
  text.replace(/\[Image #(\d+)\] ?/g, (m, d) => (+d === n ? '' : +d > n ? m.replace(d, String(d - 1)) : m))
