import { highlightCode } from '@getpaseo/highlight'
import { useMemo } from 'react'

export function Tokens({ tokens }: { tokens: { text: string; style: string | null }[] | undefined }) {
  return tokens?.map((t, i) => (
    <span key={i} className={t.style ? `tk-${t.style}` : undefined}>
      {t.text}
    </span>
  ))
}

/** Syntax-highlighted code; the language is picked from the filename extension. */
export function Code({ code, filename, lineNumbers }: { code: string; filename: string; lineNumbers?: boolean }) {
  const lines = useMemo(() => highlightCode(code.replace(/\n$/, ''), filename), [code, filename])
  return (
    <pre className={lineNumbers ? 'code numbered' : 'code'}>
      {lines.map((tokens, i) => (
        <div className="code-line" key={i}>
          {lineNumbers && <span className="ln">{i + 1}</span>}
          <span className="lc">
            <Tokens tokens={tokens} />
            {tokens.length === 0 && '\n'}
          </span>
        </div>
      ))}
    </pre>
  )
}
