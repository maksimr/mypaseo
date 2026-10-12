import { memo, useContext, useEffect, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { OpenFileContext } from '../openFile'
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

const components: Components = {
  a: Link,
  pre: ({ children }) => <>{children}</>,
  code({ className, children }) {
    const lang = /language-([\w+-]+)/.exec(className ?? '')?.[1]
    const text = String(children)
    if (!lang && !text.includes('\n')) return <code className="inline">{children}</code>
    return <Code code={text} filename={`snippet.${lang ?? 'txt'}`} />
  },
}

// Parsing every message froze long threads on open, so text shows raw until it nears the chat's viewport, then stays parsed.
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (near || !el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), {
      root: el.closest('.chat-scroll'), // rootMargin only grows the root, not the scroller clipping it; none (viewport) outside chat
      rootMargin: '1000px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return (
    <div ref={ref} className={near ? 'md' : 'md pre-wrap'}>
      {near ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text}
        </ReactMarkdown>
      ) : (
        text
      )}
    </div>
  )
})
