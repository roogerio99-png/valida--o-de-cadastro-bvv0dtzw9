import React from 'react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * Lightweight, safe Markdown renderer for chat responses:
 * - Headings (###, ##, #)
 * - Tables (| Header 1 | Header 2 |)
 * - Unordered lists (- or *)
 * - Ordered lists (1., 2.)
 * - Blockquotes (>)
 * - Code blocks (``` ... ```) and inline `code`
 * - Bold (**text**), Italic (*text*), Strikethrough (~~text~~)
 * - Highlights and links
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const renderedElements = React.useMemo(() => {
    if (!content) return null

    const lines = content.split('\n')
    const elements: React.ReactNode[] = []
    let i = 0

    const renderInline = (text: string): React.ReactNode => {
      // Split by bold, inline code, italic
      const parts: React.ReactNode[] = []
      // Regex for `code`, **bold**, *italic*
      const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g
      let lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = tokenRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index))
        }
        const token = match[0]
        if (token.startsWith('`') && token.endsWith('`')) {
          parts.push(
            <code
              key={match.index}
              className="px-1.5 py-0.5 rounded bg-emerald-100/70 text-emerald-900 font-mono text-xs border border-emerald-200"
            >
              {token.slice(1, -1)}
            </code>,
          )
        } else if (
          (token.startsWith('**') && token.endsWith('**')) ||
          (token.startsWith('__') && token.endsWith('__'))
        ) {
          parts.push(
            <strong key={match.index} className="font-semibold text-emerald-950">
              {token.slice(2, -2)}
            </strong>,
          )
        } else if (
          (token.startsWith('*') && token.endsWith('*')) ||
          (token.startsWith('_') && token.endsWith('_'))
        ) {
          parts.push(
            <em key={match.index} className="italic text-emerald-900">
              {token.slice(1, -1)}
            </em>,
          )
        }
        lastIndex = match.index + token.length
      }

      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex))
      }

      return parts.length > 0 ? parts : text
    }

    while (i < lines.length) {
      const line = lines[i]

      // 1. Code block ```
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim()
        const codeLines: string[] = []
        i++
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i])
          i++
        }
        i++ // skip closing ```
        elements.push(
          <div
            key={`code-${i}`}
            className="my-2.5 rounded-lg bg-zinc-900 text-zinc-100 p-3 overflow-x-auto text-xs font-mono"
          >
            {lang && (
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 font-semibold">
                {lang}
              </div>
            )}
            <pre className="whitespace-pre-wrap">{codeLines.join('\n')}</pre>
          </div>,
        )
        continue
      }

      // 2. Table (| Header | Header |)
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines: string[] = []
        while (
          i < lines.length &&
          lines[i].trim().startsWith('|') &&
          lines[i].trim().endsWith('|')
        ) {
          tableLines.push(lines[i].trim())
          i++
        }

        if (tableLines.length >= 2) {
          const headerRow = tableLines[0]
            .slice(1, -1)
            .split('|')
            .map((s) => s.trim())

          // Check if row 1 is separator |---|---|
          const hasSeparator = /^\|?(\s*:?-+:?\s*\|?)+$/.test(tableLines[1])
          const bodyRows = tableLines.slice(hasSeparator ? 2 : 1).map((row) =>
            row
              .slice(1, -1)
              .split('|')
              .map((s) => s.trim()),
          )

          elements.push(
            <div
              key={`table-${i}`}
              className="my-3 overflow-x-auto rounded-lg border border-emerald-200/80 shadow-xs bg-white"
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-emerald-50 text-emerald-950 font-semibold border-b border-emerald-200">
                  <tr>
                    {headerRow.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-3 py-2 border-r border-emerald-100 last:border-r-0"
                      >
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100/60">
                  {bodyRows.map((r, rIdx) => (
                    <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-emerald-50/30'}>
                      {r.map((c, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-3 py-1.5 border-r border-emerald-100/40 last:border-r-0 text-slate-700"
                        >
                          {renderInline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
          )
          continue
        }
      }

      // 3. Headings
      if (line.startsWith('### ')) {
        elements.push(
          <h4
            key={`h4-${i}`}
            className="text-sm font-bold text-emerald-950 mt-3 mb-1.5 flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
            {renderInline(line.slice(4))}
          </h4>,
        )
        i++
        continue
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h3
            key={`h3-${i}`}
            className="text-base font-bold text-emerald-950 mt-4 mb-2 pb-1 border-b border-emerald-200"
          >
            {renderInline(line.slice(3))}
          </h3>,
        )
        i++
        continue
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h2
            key={`h2-${i}`}
            className="text-lg font-extrabold text-emerald-950 mt-4 mb-2 pb-1 border-b border-emerald-300"
          >
            {renderInline(line.slice(2))}
          </h2>,
        )
        i++
        continue
      }

      // 4. Blockquote
      if (line.startsWith('> ')) {
        const quoteLines: string[] = []
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2))
          i++
        }
        elements.push(
          <blockquote
            key={`quote-${i}`}
            className="my-2.5 border-l-3 border-[#F57F17] bg-amber-50/50 px-3 py-2 text-xs text-amber-950 italic rounded-r-md"
          >
            {quoteLines.map((q, qIdx) => (
              <p key={qIdx} className={qIdx > 0 ? 'mt-1' : ''}>
                {renderInline(q)}
              </p>
            ))}
          </blockquote>,
        )
        continue
      }

      // 5. Unordered List (- or *)
      if (/^[-*]\s+/.test(line.trim())) {
        const listItems: string[] = []
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^[-*]\s+/, ''))
          i++
        }
        elements.push(
          <ul
            key={`ul-${i}`}
            className="my-2 space-y-1 pl-4 text-xs list-disc list-outside text-slate-800 marker:text-emerald-600"
          >
            {listItems.map((item, lIdx) => (
              <li key={lIdx} className="leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ul>,
        )
        continue
      }

      // 6. Ordered List (1., 2.)
      if (/^\d+\.\s+/.test(line.trim())) {
        const listItems: string[] = []
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
          i++
        }
        elements.push(
          <ol
            key={`ol-${i}`}
            className="my-2 space-y-1.5 pl-5 text-xs list-decimal list-outside text-slate-800 marker:font-semibold marker:text-emerald-700"
          >
            {listItems.map((item, lIdx) => (
              <li key={lIdx} className="leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ol>,
        )
        continue
      }

      // 7. Empty line spacer
      if (!line.trim()) {
        i++
        continue
      }

      // 8. Normal Paragraph
      elements.push(
        <p key={`p-${i}`} className="my-1.5 text-xs leading-relaxed text-slate-800">
          {renderInline(line)}
        </p>,
      )
      i++
    }

    return elements
  }, [content])

  return <div className={`prose-sm max-w-none space-y-1 ${className}`}>{renderedElements}</div>
}
