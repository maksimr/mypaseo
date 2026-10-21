import { ChevronDown } from 'lucide-react'
import type { ReactNode, Ref } from 'react'

export function Pick({
  ref,
  icon,
  value,
  onChange,
  options,
  title,
}: {
  ref?: Ref<HTMLSelectElement>
  icon?: ReactNode
  value: string | undefined
  onChange: (v: string) => void
  options: [id: string, label: string, group?: string][]
  title: string
}) {
  const groups = new Map<string | undefined, [string, string][]>()
  for (const [id, label, group] of options) groups.set(group, [...(groups.get(group) ?? []), [id, label]])
  const option = ([id, label]: [string, string]) => (
    <option key={id} value={id}>
      {label}
    </option>
  )
  // Icons overlay the native select (pointer-events: none) so the whole pill opens the picker.
  return (
    <span className="pick" title={title}>
      {icon}
      <select ref={ref} name={title} aria-label={title} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {value === undefined && <option value="">{title}</option>}
        {[...groups].map(([group, opts]) =>
          group === undefined ? (
            opts.map(option)
          ) : (
            <optgroup key={group} label={group}>
              {opts.map(option)}
            </optgroup>
          ),
        )}
      </select>
      <ChevronDown size={12} />
    </span>
  )
}
