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
  options: [string, string][]
  title: string
}) {
  // Icons overlay the native select (pointer-events: none) so the whole pill opens the picker.
  return (
    <span className="pick" title={title}>
      {icon}
      <select ref={ref} name={title} aria-label={title} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {value === undefined && <option value="">{title}</option>}
        {options.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} />
    </span>
  )
}
