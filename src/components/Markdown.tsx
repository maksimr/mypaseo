import { Check, Copy } from 'lucide-react'
import { createContext, memo, useContext, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { artifactDoc, fenceClosed } from '../artifact'
import { errorText } from '../daemon'
import { OpenFileContext } from '../openFile'
import { Artifact } from './Artifact'
import { Code } from './Code'


const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')

function Link({ href = '', children }: { href?: string; children?: React.ReactNode }) {
  const openFile = useContext(OpenFileContext)
  if (isExternal(href))
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  const path = decodeURI(href).replace(/(:\d+)+$/, '')
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        openFile(path)
      }}
    >
      {children}
    </a>
  )
}

// The text being rendered: a code block slices its own source out of it by position.
const Source = createContext('')

function CodeBlock({ className, children, node }: React.ComponentProps<'code'> & ExtraProps) {
  const source = useContext(Source)
  const lang = /language-([\w+-]+)/.exec(className ?? '')?.[1]
  const text = String(children)
  if (!lang && !text.includes('\n')) return <code className="inline">{children}</code>
  const doc = lang && artifactDoc(lang, text)
  const pos = node?.position
  // A page still streaming in would reload on every chunk: it shows as code until its closing fence arrives.
  if (doc && pos && fenceClosed(source.slice(pos.start.offset, pos.end.offset))) return <Artifact doc={doc} />
  return (
    <div className="code-block">
      <Code code={text} filename={`snippet.${lang ?? 'txt'}`} />
      <CopyButton text={text.replace(/\n$/, '')} className="code-copy" />
    </div>
  )
}

/** `className`: besides `icon-btn`. */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      return alert(`Could not copy: ${errorText(err)}`)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button className={className ? `icon-btn ${className}` : 'icon-btn'} title="Copy" onClick={copy}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

const components: Components = {
  a: Link,
  pre: ({ children }) => <>{children}</>,
  code: CodeBlock,
}

const MARGIN = 1000
// Messages still raw, each with the setter that parses it.
const unparsed = new Map<Element, () => void>()

/** Parses the raw messages near `root`'s viewport now. The observer below reports only after a paint, so a chat that
 * just opened or scrolled would show them raw for a frame; called from a layout effect, this parses them before it. */
export function parseNear(root: Element) {
  const { top, bottom, height } = root.getBoundingClientRect()
  if (!height) return // a chat kept mounted behind another tab
  for (const [el, parse] of unparsed) {
    if (!root.contains(el)) continue
    const r = el.getBoundingClientRect()
    if (r.bottom > top - MARGIN && r.top < bottom + MARGIN) parse()
  }
}

// Parsing every message froze long threads on open, so text shows raw until it nears the chat's viewport, then stays parsed.
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  // A layout effect: it registers before the chat's own layout effect (parents' run after children's) calls parseNear.
  useLayoutEffect(() => {
    const el = ref.current
    if (near || !el) return
    unparsed.set(el, () => setNear(true))
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), {
      root: el.closest('.chat-scroll'), // rootMargin only grows the root, not the scroller clipping it; none (viewport) outside chat
      rootMargin: `${MARGIN}px 0px`,
    })
    io.observe(el)
    return () => {
      io.disconnect()
      unparsed.delete(el)
    }
  }, [near])
  return (
    <div ref={ref} className={near ? 'md' : 'md pre-wrap'}>
      {near ? (
        <Source value={text}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {text}
          </ReactMarkdown>
        </Source>
      ) : (
        text
      )}
    </div>
  )
})
