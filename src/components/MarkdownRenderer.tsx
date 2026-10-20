import React from 'react'

interface MarkdownRendererProps {
  content: string
  className?: string
  onOptionClick?: (optionText: string) => void
}

/**
 * Lightweight, safe Markdown renderer for chat responses:
 * - Headings (###, ##, #)
 * - Tables (| Header 1 | Header 2 |) with support for 4-Pilares styling
 * - Unordered lists (- or *)
 * - Ordered lists (1., 2.)
 * - Blockquotes (>)
 * - Code blocks (``` ... ```) and inline `code`
 * - Bold (**text**), Italic (*text*), Links [text](url)
 * - Clickable questionnaire options (A), B), C), D), E), F)
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
  onOptionClick,
}) => {
  const renderedElements = React.useMemo(() => {
    if (!content) return null

    const lines = content.split('\n')
    const elements: React.ReactNode[] = []
    let i = 0

    const renderInline = (text: string): React.ReactNode => {
      const parts: React.ReactNode[] = []
      // Tokenizer regex matching links [text](url), `code`, **bold**, *italic*
      const tokenRegex = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g
      let lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = tokenRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index))
        }
        const token = match[0]

        // Link [Title](url)
        if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
          const closeBracket = token.indexOf('](')
          const linkText = token.slice(1, closeBracket)
          const linkUrl = token.slice(closeBracket + 2, -1)
          parts.push(
            <a
              key={match.index}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#1B5E20] underline underline-offset-2 hover:text-[#0D2811] hover:bg-emerald-50 px-1 py-0.5 rounded transition-colors inline-flex items-center gap-0.5"
            >
              {linkText}
              <span className="text-[10px] opacity-70">↗</span>
            </a>,
          )
        } else if (token.startsWith('`') && token.endsWith('`')) {
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
              className="my-3 overflow-x-auto rounded-xl border border-emerald-300/80 shadow-xs bg-white"
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#1B5E20] text-white font-semibold">
                  <tr>
                    {headerRow.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-3.5 py-2.5 border-r border-emerald-700 last:border-r-0 tracking-wide"
                      >
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100">
                  {bodyRows.map((r, rIdx) => {
                    const isEven = rIdx % 2 === 0
                    const isPilarHeader =
                      r[0]?.toLowerCase().includes('pilar') || /^[1-4]\.\s*/.test(r[0] || '')
                    return (
                      <tr
                        key={rIdx}
                        className={
                          isPilarHeader
                            ? isEven
                              ? 'bg-emerald-50/50 hover:bg-emerald-50'
                              : 'bg-white hover:bg-emerald-50/40'
                            : isEven
                              ? 'bg-white'
                              : 'bg-[#F9FAF7]'
                        }
                      >
                        {r.map((c, cIdx) => (
                          <td
                            key={cIdx}
                            className={`px-3.5 py-2.5 border-r border-emerald-100/60 last:border-r-0 text-slate-800 ${
                              cIdx === 0 ? 'font-semibold text-emerald-950 min-w-[140px]' : ''
                            } ${cIdx === 1 ? 'min-w-[160px]' : 'min-w-[220px]'}`}
                          >
                            {renderInline(c)}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>,
          )
          continue
        }
      }

      // 3. Headings
      if (line.startsWith('### ')) {
        const title = line.slice(4)
        const isBloco1 =
          title.toLowerCase().includes('bloco 1') || title.toLowerCase().includes('síntese')
        const isBloco2 =
          title.toLowerCase().includes('bloco 2') || title.toLowerCase().includes('4 pilares')
        const isBloco3 =
          title.toLowerCase().includes('bloco 3') ||
          title.toLowerCase().includes('erp') ||
          title.toLowerCase().includes('trava')

        elements.push(
          <div
            key={`h4-${i}`}
            className={`mt-4 mb-2 p-2 rounded-lg flex items-center justify-between ${
              isBloco1
                ? 'bg-blue-50 border border-blue-200 text-blue-950 font-bold'
                : isBloco2
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold'
                  : isBloco3
                    ? 'bg-amber-50 border border-amber-200 text-amber-950 font-bold'
                    : 'text-emerald-950 font-bold'
            }`}
          >
            <span className="flex items-center gap-2 text-xs sm:text-sm">
              <span
                className={`w-2 h-2 rounded-full ${
                  isBloco1 ? 'bg-blue-600' : isBloco2 ? 'bg-emerald-600' : 'bg-amber-600'
                }`}
              />
              {renderInline(title)}
            </span>
          </div>,
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
            className="my-2.5 border-l-4 border-emerald-600 bg-emerald-50/50 px-3.5 py-2 text-xs text-emerald-950 italic rounded-r-md"
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

      // 5. Clicáveis: Opções de questionário (A) ..., B) ..., C) ..., etc. ou "- (A) ..."
      const optionMatch = line.trim().match(/^[-*]?\s*([A-F]\))\s+(.+)$/i)
      if (optionMatch) {
        const optLetter = optionMatch[1].toUpperCase()
        const optBody = optionMatch[2]
        const fullOptionText = `${optLetter} ${optBody}`

        elements.push(
          <button
            key={`opt-btn-${i}`}
            type="button"
            onClick={() => onOptionClick && onOptionClick(fullOptionText)}
            className="w-full text-left my-1.5 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-100 hover:border-[#1B5E20] transition-all flex items-start gap-2.5 text-xs text-emerald-950 group shadow-2xs"
          >
            <span className="px-2 py-0.5 rounded-md bg-[#1B5E20] text-white font-bold text-[11px] group-hover:scale-105 transition-transform flex-shrink-0">
              {optLetter}
            </span>
            <span className="flex-1 leading-relaxed text-slate-800 group-hover:text-emerald-950 font-medium">
              {renderInline(optBody)}
            </span>
          </button>,
        )
        i++
        continue
      }

      // 6. Unordered List (- or *)
      if (/^[-*]\s+/.test(line.trim())) {
        const listItems: string[] = []
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^[-*]\s+/, ''))
          i++
        }
        elements.push(
          <ul
            key={`ul-${i}`}
            className="my-2 space-y-1.5 pl-4 text-xs list-disc list-outside text-slate-800 marker:text-emerald-600"
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

      // 7. Ordered List (1., 2.)
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

      // 8. Linha vazia
      if (!line.trim()) {
        i++
        continue
      }

      // 9. Parágrafo comum
      elements.push(
        <p key={`p-${i}`} className="my-1.5 text-xs leading-relaxed text-slate-800">
          {renderInline(line)}
        </p>,
      )
      i++
    }

    return elements
  }, [content, onOptionClick])

  return <div className={`prose-sm max-w-none space-y-1 ${className}`}>{renderedElements}</div>
}
