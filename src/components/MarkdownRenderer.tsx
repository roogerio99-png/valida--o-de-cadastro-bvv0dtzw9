import React, { useMemo } from 'react'

/**
 * Propriedades para renderização de blocos de Markdown incremental / final
 */
export interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
  className?: string
}

/**
 * Helper para validar se uma URL é segura (evita javascript:, data: malicioso, etc.)
 */
function isSafeUrl(rawUrl: string): boolean {
  if (!rawUrl) return false
  const trimmed = rawUrl.trim()
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Parser inline de spans de texto formatado:
 * - Links: [texto](url)
 * - Negrito / Itálico combinados: ***texto***
 * - Negrito: **texto** ou __texto__
 * - Itálico: *texto* ou _texto_
 * - Código inline: `código`
 * - NCM / Códigos com formato destacado
 */
function parseInlineMarkdown(text: string, keyPrefix = 'inline'): React.ReactNode[] {
  if (!text) return []

  const elements: React.ReactNode[] = []
  let remaining = text
  let index = 0

  while (remaining.length > 0) {
    // 1. Código inline `code`
    const codeMatch = remaining.match(/^`([^`\n]+)`/)
    if (codeMatch) {
      elements.push(
        <code
          key={`${keyPrefix}-code-${index++}`}
          className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-[#1B5E20] border border-emerald-200/60 font-mono text-[11px] font-semibold tracking-tight"
        >
          {codeMatch[1]}
        </code>,
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // 2. Links [label](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      const label = linkMatch[1]
      const url = linkMatch[2]
      if (isSafeUrl(url)) {
        elements.push(
          <a
            key={`${keyPrefix}-link-${index++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1B5E20] underline decoration-emerald-400 decoration-1 underline-offset-2 hover:text-emerald-800 hover:decoration-emerald-700 font-medium inline-flex items-center gap-0.5"
          >
            {label}
            <span className="text-[9px] opacity-75">↗</span>
          </a>,
        )
      } else {
        elements.push(<span key={`${keyPrefix}-badlink-${index++}`}>{label}</span>)
      }
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // 3. Negrito + Itálico ***texto***
    const boldItalicMatch = remaining.match(/^(\*\*\*|___)(.+?)\1/)
    if (boldItalicMatch) {
      elements.push(
        <strong key={`${keyPrefix}-bi-${index++}`} className="font-bold italic text-[#0F2A10]">
          {parseInlineMarkdown(boldItalicMatch[2], `${keyPrefix}-sub-${index}`)}
        </strong>,
      )
      remaining = remaining.slice(boldItalicMatch[0].length)
      continue
    }

    // 4. Negrito **texto** ou __texto__
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/)
    if (boldMatch) {
      elements.push(
        <strong key={`${keyPrefix}-b-${index++}`} className="font-bold text-[#142314]">
          {parseInlineMarkdown(boldMatch[2], `${keyPrefix}-sub-${index}`)}
        </strong>,
      )
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // 5. Itálico *texto* ou _texto_ (evitando combinar com palavras com underline como snake_case)
    const italicMatch = remaining.match(/^(\*|_)([^\s*_].*?[^\s*_]|[^\s*_])\1/)
    if (italicMatch) {
      elements.push(
        <em key={`${keyPrefix}-i-${index++}`} className="italic text-[#2C3B2C]">
          {parseInlineMarkdown(italicMatch[2], `${keyPrefix}-sub-${index}`)}
        </em>,
      )
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    // 6. Texto normal até o próximo marcador
    const nextSpecial = remaining.search(/[`*_[\]]/)
    if (nextSpecial === -1) {
      elements.push(
        <React.Fragment key={`${keyPrefix}-txt-${index++}`}>{remaining}</React.Fragment>,
      )
      break
    } else if (nextSpecial === 0) {
      // Caractere isolado não pareado, consome 1 caractere como texto normal
      elements.push(
        <React.Fragment key={`${keyPrefix}-char-${index++}`}>{remaining[0]}</React.Fragment>,
      )
      remaining = remaining.slice(1)
    } else {
      elements.push(
        <React.Fragment key={`${keyPrefix}-chunk-${index++}`}>
          {remaining.slice(0, nextSpecial)}
        </React.Fragment>,
      )
      remaining = remaining.slice(nextSpecial)
    }
  }

  return elements
}

interface TableRowData {
  cells: string[]
}

interface Block {
  type:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'paragraph'
    | 'blockquote'
    | 'ul'
    | 'ol'
    | 'table'
    | 'codeblock'
    | 'hr'
  content?: string
  items?: string[]
  headers?: string[]
  alignments?: ('left' | 'center' | 'right')[]
  rows?: TableRowData[]
  language?: string
}

/**
 * Divide linhas de uma tabela em células respeitando pipes "|"
 */
function splitTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|').map((c) => c.trim())
}

/**
 * Analisa linha delimitadora de tabela: | :--- | :---: | ---: |
 */
function parseTableDelimiter(line: string): {
  isDelimiter: boolean
  alignments: ('left' | 'center' | 'right')[]
} {
  const cells = splitTableRow(line)
  if (cells.length === 0) return { isDelimiter: false, alignments: [] }

  const alignments: ('left' | 'center' | 'right')[] = []
  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) {
      return { isDelimiter: false, alignments: [] }
    }
    const starts = cell.startsWith(':')
    const ends = cell.endsWith(':')
    if (starts && ends) {
      alignments.push('center')
    } else if (ends) {
      alignments.push('right')
    } else {
      alignments.push('left')
    }
  }
  return { isDelimiter: true, alignments }
}

/**
 * Converte texto Markdown bruto em blocos estruturados.
 * Projetado para ser incremental: se o streaming terminar no meio de uma tabela, lista ou citação,
 * ele fecha com segurança o bloco sem estourar erro nem piscar.
 */
function parseMarkdownBlocks(rawMarkdown: string): Block[] {
  if (!rawMarkdown) return []

  const lines = rawMarkdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Linha vazia - ignora ou fecha blocos abertos
    if (!trimmed) {
      i++
      continue
    }

    // 1. Bloco de código com cercas ```
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i++ // pula fechamento
      }
      blocks.push({
        type: 'codeblock',
        content: codeLines.join('\n'),
        language,
      })
      continue
    }

    // 2. Separador horizontal --- ou *** ou ___
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // 3. Cabeçalhos (#, ##, ###, ####)
    const headerMatch = line.match(/^(#{1,4})\s+(.*)$/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const headerContent = headerMatch[2].trim()
      const type = level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4'
      blocks.push({ type, content: headerContent })
      i++
      continue
    }

    // 4. Bloco de citação (> ...)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const cleanQuote = lines[i].trim().replace(/^>\s?/, '')
        quoteLines.push(cleanQuote)
        i++
      }
      blocks.push({
        type: 'blockquote',
        content: quoteLines.join(' '),
      })
      continue
    }

    // 5. Tabelas Markdown (contém pipes | e linha separadora)
    if (trimmed.includes('|')) {
      const headerLine = line
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
      const delimCheck = parseTableDelimiter(nextLine)

      if (delimCheck.isDelimiter) {
        const headers = splitTableRow(headerLine)
        const alignments = delimCheck.alignments
        i += 2 // pula cabeçalho e delimitador

        const rows: TableRowData[] = []
        while (i < lines.length && lines[i].trim().includes('|')) {
          rows.push({ cells: splitTableRow(lines[i]) })
          i++
        }

        blocks.push({
          type: 'table',
          headers,
          alignments,
          rows,
        })
        continue
      }
    }

    // 6. Listas numeradas (1. 2. 3.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemContent = lines[i].trim().replace(/^\d+\.\s+/, '')
        items.push(itemContent)
        i++
      }
      blocks.push({
        type: 'ol',
        items,
      })
      continue
    }

    // 7. Listas com marcadores (- ou * ou •)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        const itemContent = lines[i].trim().replace(/^[-*•]\s+/, '')
        items.push(itemContent)
        i++
      }
      blocks.push({
        type: 'ul',
        items,
      })
      continue
    }

    // 8. Parágrafos comuns (acumula linhas subsequentes até linha vazia ou início de bloco especial)
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('```') &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !(
        lines[i].trim().includes('|') &&
        i + 1 < lines.length &&
        parseTableDelimiter(lines[i + 1]).isDelimiter
      )
    ) {
      paraLines.push(lines[i].trim())
      i++
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        content: paraLines.join(' '),
      })
    }
  }

  return blocks
}

/**
 * Renderizador de Markdown em estilo consultoria tributária agro executiva.
 * Suporta perfeitamente:
 * - H1, H2, H3 com destaques e ícones contextuais
 * - Blocos de citação com borda verde-agro e fundo estilizado
 * - Tabelas ricas, responsivas com cabeçalho destacado e alinhamentos
 * - Listas numeradas e com marcadores
 * - Fontes mono para NCM/CST e código
 * - Links clicáveis e seguros
 * - Modo streaming com cursor pulsante estável
 */
export function MarkdownRenderer({
  content,
  isStreaming = false,
  className = '',
}: MarkdownRendererProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content])

  if (!content && !isStreaming) {
    return null
  }

  return (
    <div
      className={`space-y-3.5 text-xs text-[#1C2B1C] leading-relaxed break-words font-sans ${className}`}
    >
      {blocks.map((block, idx) => {
        const key = `blk-${idx}`

        switch (block.type) {
          case 'h1':
          case 'h2': {
            const isH1 = block.type === 'h1'
            return (
              <div
                key={key}
                className={`pt-2.5 pb-1 border-b border-[#DCE5DC]/80 flex items-center gap-2 ${
                  isH1 ? 'text-[#0F3813]' : 'text-[#1B5E20]'
                }`}
              >
                <div className="w-1.5 h-4 bg-[#1B5E20] rounded-full flex-shrink-0" />
                <h2 className="font-bold text-sm sm:text-[15px] tracking-tight">
                  {parseInlineMarkdown(block.content || '', `${key}-h`)}
                </h2>
              </div>
            )
          }

          case 'h3':
          case 'h4':
            return (
              <h3
                key={key}
                className="font-bold text-xs sm:text-[13px] text-[#1C2B1C] pt-2 flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
                <span>{parseInlineMarkdown(block.content || '', `${key}-h3`)}</span>
              </h3>
            )

          case 'blockquote':
            return (
              <blockquote
                key={key}
                className="my-2 p-3 rounded-xl bg-gradient-to-r from-emerald-50/70 to-emerald-50/30 border-l-4 border-[#1B5E20] text-[#143015] shadow-2xs"
              >
                <div className="flex items-start gap-2">
                  <span className="text-emerald-700 font-serif text-base leading-none select-none">
                    “
                  </span>
                  <div className="text-[11.5px] italic leading-relaxed flex-1">
                    {parseInlineMarkdown(block.content || '', `${key}-bq`)}
                  </div>
                </div>
              </blockquote>
            )

          case 'table': {
            const headers = block.headers || []
            const alignments = block.alignments || []
            const rows = block.rows || []

            return (
              <div
                key={key}
                className="my-3 overflow-x-auto rounded-xl border border-[#DCE5DC] bg-white shadow-2xs no-scrollbar-vertical"
              >
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-[#1B5E20]">
                      {headers.map((h, hIdx) => {
                        const align = alignments[hIdx] || 'left'
                        const alignClass =
                          align === 'center'
                            ? 'text-center'
                            : align === 'right'
                              ? 'text-right'
                              : 'text-left'
                        return (
                          <th
                            key={`${key}-th-${hIdx}`}
                            className={`py-2 px-3 font-bold uppercase tracking-wider text-[10px] ${alignClass} border-r border-[#DCE5DC]/50 last:border-r-0`}
                          >
                            {parseInlineMarkdown(h, `${key}-th-in-${hIdx}`)}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F4F0]">
                    {rows.map((row, rIdx) => (
                      <tr
                        key={`${key}-tr-${rIdx}`}
                        className={`transition-colors hover:bg-emerald-50/40 ${
                          rIdx % 2 === 1 ? 'bg-[#FAFBF9]' : 'bg-white'
                        }`}
                      >
                        {row.cells.map((cell, cIdx) => {
                          const align = alignments[cIdx] || 'left'
                          const alignClass =
                            align === 'center'
                              ? 'text-center'
                              : align === 'right'
                                ? 'text-right'
                                : 'text-left'
                          return (
                            <td
                              key={`${key}-td-${rIdx}-${cIdx}`}
                              className={`py-2 px-3 text-[#1C2B1C] font-normal leading-snug ${alignClass} border-r border-[#DCE5DC]/40 last:border-r-0`}
                            >
                              {parseInlineMarkdown(cell, `${key}-td-in-${rIdx}-${cIdx}`)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }

          case 'ul':
            return (
              <ul key={key} className="space-y-1.5 my-2 pl-2">
                {(block.items || []).map((item, itemIdx) => (
                  <li key={`${key}-li-${itemIdx}`} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1B5E20] mt-1.5 flex-shrink-0" />
                    <span className="flex-1">
                      {parseInlineMarkdown(item, `${key}-li-in-${itemIdx}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )

          case 'ol':
            return (
              <ol key={key} className="space-y-1.5 my-2 pl-2 counter-reset">
                {(block.items || []).map((item, itemIdx) => (
                  <li key={`${key}-oli-${itemIdx}`} className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-100 text-[#1B5E20] font-mono font-bold text-[10px] flex items-center justify-center mt-0.5">
                      {itemIdx + 1}
                    </span>
                    <span className="flex-1">
                      {parseInlineMarkdown(item, `${key}-oli-in-${itemIdx}`)}
                    </span>
                  </li>
                ))}
              </ol>
            )

          case 'codeblock':
            return (
              <div
                key={key}
                className="my-2.5 rounded-xl border border-[#DCE5DC] bg-[#1E261E] text-emerald-100 p-3 font-mono text-[11px] overflow-x-auto shadow-2xs"
              >
                {block.language && (
                  <div className="text-[10px] font-semibold text-emerald-400/80 uppercase pb-1.5 mb-1.5 border-b border-emerald-900/60">
                    {block.language}
                  </div>
                )}
                <pre className="whitespace-pre leading-relaxed">
                  <code>{block.content}</code>
                </pre>
              </div>
            )

          case 'hr':
            return <hr key={key} className="my-3 border-t border-[#DCE5DC]" />

          case 'paragraph':
          default:
            return (
              <p key={key} className="leading-relaxed">
                {parseInlineMarkdown(block.content || '', `${key}-p`)}
              </p>
            )
        }
      })}

      {/* Cursor pulsante suave se estiver em streaming ativo */}
      {isStreaming && (
        <span
          className="inline-block w-2 h-3.5 bg-[#1B5E20] ml-1 rounded-xs animate-pulse align-middle"
          aria-label="Digitando..."
        />
      )}
    </div>
  )
}
