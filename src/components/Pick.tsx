import { ChevronDown } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { Options, type PickOption } from './Options'

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
  options: PickOption[]
  title: string
}) {
  // Icons overlay the native select (pointer-events: none) so the whole pill opens the picker.
  return (
    <span className="pick" title={title}>
      {icon}
      <select ref={ref} name={title} aria-label={title} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {value === undefined && <option value="">{title}</option>}
        <Options options={options} />
      </select>
      <ChevronDown size={12} />
    </span>
  )
}
