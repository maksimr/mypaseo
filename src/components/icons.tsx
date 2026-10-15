import type { ReactNode } from 'react'

/** Open folder with a slanted, grey front flap. */
export const FolderExpanded = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 10V8a2 2 0 0 0-2-2h-5.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2" />
    <path d="M4 20l2.3-8.5A2 2 0 0 1 8.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5Z" fill="currentColor" fillOpacity={0.3} />
  </svg>
)

/** Folder outline with a plus at its bottom-right corner (lucide's FolderPlus puts the plus inside). */
export const FolderAdd = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 19H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v3.5M16 19h6M19 16v6" />
  </svg>
)

/** Material Symbols note_stack. */
export const Scratches = () => (
  <svg width={15} height={15} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
    <path d="M280-160v-441q0-33 24-56t57-23h439q33 0 56.5 23.5T880-600v320L680-80H360q-33 0-56.5-23.5T280-160ZM81-710q-6-33 13-59.5t52-32.5l434-77q33-6 59.5 13t32.5 52l10 54h-82l-7-40-433 77 40 226v279q-16-9-27.5-24T158-276L81-710Zm279 110v440h280v-160h160v-280H360Zm220 220Z" />
  </svg>
)

const PLUS = 'M680-160h240M800-280v240'
/** note_stack with a plus at its bottom-right corner, like FolderAdd: the front note loses its folded corner, the mask clears a gap around the plus. */
export const ScratchAdd = () => (
  <svg width={15} height={15} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
    <mask id="scratch-add-gap">
      <rect y={-960} width={960} height={960} fill="white" />
      <path d={PLUS} stroke="black" strokeWidth={200} strokeLinecap="round" />
    </mask>
    <path
      mask="url(#scratch-add-gap)"
      d="M81-710q-6-33 13-59.5t52-32.5l434-77q33-6 59.5 13t32.5 52l10 54h-82l-7-40-433 77 40 226v279q-16-9-27.5-24T158-276L81-710ZM280-160v-441q0-33 24-56t57-23h439q33 0 56.5 23.5T880-600v440q0 33-23.5 56.5T800-80H360q-33 0-56.5-23.5T280-160Zm80 0h440v-440H360v440Z"
    />
    <path d={PLUS} stroke="currentColor" strokeWidth={80} strokeLinecap="round" />
  </svg>
)

/** codicons repo-pull / repo-push (vscode-codicons@6b53088). */
const COMMIT_LINE =
  'M9.95 13H12.5C12.78 13 13 13.22 13 13.5C13 13.78 12.78 14 12.5 14H9.95C9.72 15.14 8.71 16 7.5 16C6.29 16 5.28 15.14 5.05 14H2.5C2.22 14 2 13.78 2 13.5C2 13.22 2.22 13 2.5 13H5.05C5.28 11.86 6.29 11 7.5 11C8.71 11 9.72 11.86 9.95 13ZM6.09 14C6.29 14.58 6.85 15 7.5 15C8.15 15 8.71 14.58 8.91 14C8.97 13.84 9 13.68 9 13.5C9 13.32 8.97 13.16 8.91 13C8.71 12.42 8.15 12 7.5 12C6.85 12 6.29 12.42 6.09 13C6.03 13.16 6 13.32 6 13.5C6 13.68 6.03 13.84 6.09 14Z'
type CodiconProps = { size: number; className?: string; children?: ReactNode }
const Codicon = ({ arrow, size, className, children }: CodiconProps & { arrow: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden={!children}>
    {children}
    <path d={arrow} />
    <path fillRule="evenodd" clipRule="evenodd" d={COMMIT_LINE} />
  </svg>
)
const PULL =
  'M4.85 6.15C4.755 6.05 4.627 6 4.5 6C4.372 6 4.245 6.05 4.15 6.15C4.05 6.245 4 6.373 4 6.5C4 6.627 4.05 6.755 4.15 6.85L7.15 9.85C7.245 9.95 7.372 10 7.5 10C7.628 10 7.755 9.95 7.85 9.85L10.85 6.85C10.95 6.755 11 6.628 11 6.5C11 6.372 10.95 6.245 10.85 6.15C10.755 6.05 10.627 6 10.5 6C10.373 6 10.245 6.05 10.15 6.15L8 8.29V1.5C8 1.22 7.78 1 7.5 1C7.22 1 7 1.22 7 1.5V8.29L4.85 6.15Z'
const PUSH =
  'M4.85 4.85C4.755 4.95 4.627 5 4.5 5C4.372 5 4.245 4.95 4.15 4.85C4.05 4.755 4 4.627 4 4.5C4 4.373 4.05 4.245 4.15 4.15L7.15 1.15C7.245 1.05 7.372 1 7.5 1C7.628 1 7.755 1.05 7.85 1.15L10.85 4.15C10.95 4.245 11 4.372 11 4.5C11 4.628 10.95 4.755 10.85 4.85C10.755 4.95 10.627 5 10.5 5C10.373 5 10.245 4.95 10.15 4.85L8 2.71V9.5C8 9.78 7.78 10 7.5 10C7.22 10 7 9.78 7 9.5V2.71L4.85 4.85Z'
export const Pull = (p: CodiconProps) => <Codicon arrow={PULL} {...p} />
export const Push = (p: CodiconProps) => <Codicon arrow={PUSH} {...p} />

/** Zed's git graph glyph (lucide has none): a commit with a branch off to the right. Sized and stroked like lucide icons. */
export const GitGraphIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
    <circle cx="6" cy="6" r="3" />
    <path d="M6 9v12" />
    <circle cx="18" cy="15" r="3" />
    <path d="M18 18v3M15 15h-4a5 5 0 0 1-5-5" />
  </svg>
)
