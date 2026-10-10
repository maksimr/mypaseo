import { memo, useContext } from 'react'
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

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
