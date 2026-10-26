import type { SVGProps } from 'react'

/** The loading spinner: an arc running round a ring (`.spin` in styles/base.css). Hidden from screen readers unless
 *  given an `aria-label`. */
export function Spinner({ size = 13, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  const label = props['aria-label']
  return (
    <svg
      viewBox="0 0 30 30"
      width={size}
      height={size}
      className={className ? `spin ${className}` : 'spin'}
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
      {...props}
    >
      <circle cx="15" cy="15" r="13" />
      <circle cx="15" cy="15" r="13" strokeLinecap="round" strokeDasharray="30 82" transform="rotate(-132 15 15)" />
    </svg>
  )
}
