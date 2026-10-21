export type PickOption = [id: string, label: string, group?: string]

// The <option>s of a <select>, those with a group inside an <optgroup>.
export function Options({ options }: { options: PickOption[] }) {
  const groups = new Map<string | undefined, [string, string][]>()
  for (const [id, label, group] of options) groups.set(group, [...(groups.get(group) ?? []), [id, label]])
  const option = ([id, label]: [string, string]) => (
    <option key={id} value={id}>
      {label}
    </option>
  )
  return [...groups].map(([group, opts]) =>
    group === undefined ? (
      opts.map(option)
    ) : (
      <optgroup key={group} label={group}>
        {opts.map(option)}
      </optgroup>
    ),
  )
}
