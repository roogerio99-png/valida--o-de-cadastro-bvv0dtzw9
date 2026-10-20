/**
 * Parser leve e robusto para CSV, TSV e planilhas Excel (.xlsx, .xls) no navegador.
 * Suporta múltiplas abas, detecção automática da linha real de cabeçalho
 * (pulando títulos e metadados de cabeçalho), coerção de tipos e limpeza de linhas vazias.
 */

export interface ParsedTable {
  sheetName?: string
  sheetNames?: string[]
  headers: string[]
  rows: Record<string, string>[]
  /** Índice da linha no arquivo original (1-based) para cada linha do parsed */
  rowIndices?: number[]
}

export function parseCsvText(text: string): ParsedTable {
  const clean = text.replace(/^\uFEFF/, '') // remove BOM
  const lines = clean.split(/\r\n|\n|\r/)
  const firstLine = lines.find((l) => l.trim().length > 0) || ''
  const countSemi = (firstLine.match(/;/g) || []).length
  const countComma = (firstLine.match(/,/g) || []).length
  const countTab = (firstLine.match(/\t/g) || []).length

  let delimiter = ','
  if (countSemi > countComma && countSemi >= countTab) delimiter = ';'
  else if (countTab > countComma && countTab > countSemi) delimiter = '\t'

  const rawRows: { values: string[]; originalLine: number }[] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let currentLineNumber = 1

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]
    const nextChar = clean[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === delimiter) {
        currentRow.push(currentField.trim())
        currentField = ''
      } else if (char === '\r') {
        if (nextChar === '\n') i++
        currentRow.push(currentField.trim())
        if (currentRow.some((c) => c !== '')) {
          rawRows.push({ values: currentRow, originalLine: currentLineNumber })
        }
        currentRow = []
        currentField = ''
        currentLineNumber++
      } else if (char === '\n') {
        currentRow.push(currentField.trim())
        if (currentRow.some((c) => c !== '')) {
          rawRows.push({ values: currentRow, originalLine: currentLineNumber })
        }
        currentRow = []
        currentField = ''
        currentLineNumber++
      } else {
        currentField += char
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some((c) => c !== '')) {
      rawRows.push({ values: currentRow, originalLine: currentLineNumber })
    }
  }

  if (rawRows.length === 0) {
    return { headers: [], rows: [], rowIndices: [] }
  }

  // Identificar linha de cabeçalho: procurar a primeira linha com maior número de colunas válidas
  const headerIdx = findHeaderRowIndex(rawRows.map((r) => r.values))
  const headers = rawRows[headerIdx].values.map((h, i) => h.trim() || `Coluna_${i + 1}`)
  const rows: Record<string, string>[] = []
  const rowIndices: number[] = []

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const item = rawRows[i]
    const r = item.values
    // Ignorar linha totalmente vazia
    if (r.every((c) => !c || c.trim() === '')) continue

    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx].trim() : ''
    })
    rows.push(obj)
    rowIndices.push(item.originalLine)
  }

  return { headers, rows, rowIndices }
}

/**
 * Heurística para achar a linha de cabeçalho em planilhas que possuem
 * linhas de introdução, instruções ou blocos informativos antes dos dados.
 */
function findHeaderRowIndex(grid: (string | number | undefined)[][]): number {
  if (grid.length <= 1) return 0

  let bestIndex = 0
  let maxColScore = -1

  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const row = grid[i] || []
    const filledStrings = row.filter((c) => {
      if (c === undefined || c === null) return false
      const s = String(c).trim()
      // Não conta se for apenas número ou muito longo (mais de 120 caracteres costuma ser instrução)
      return s.length > 0 && s.length < 120
    })

    // Contar quantas colunas preenchidas existem
    let score = filledStrings.length

    // Normalizar texto da linha
    const cellsNorm = row.map((c) =>
      String(c || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim(),
    )
    const rowText = cellsNorm.join(' ')

    // Se a linha contiver textos instrutivos claros ou títulos informativos de relatório, penalizar fortemente
    if (
      rowText.includes('como usar') ||
      rowText.includes('produtos em validacao') ||
      rowText.includes('regras oficiais da tipi') ||
      rowText.includes('resumo quantitativo') ||
      rowText.includes('relacao nominal') ||
      rowText.includes('total de produtos')
    ) {
      score -= 50
    }

    const headerKeywords = [
      'codigo',
      'descricao',
      'produto',
      'ncm',
      'embalagem',
      'principio',
      'ativo',
      'fabricante',
      'mapa',
      'regra',
      'classe',
      'grupo',
      'aliquota',
      'dispositivo',
      'condicao',
      'escopo',
      'subposicao',
    ]

    // Pontuar palavras-chave identificadas como nomes de colunas
    const matchCount = headerKeywords.filter((k) => rowText.includes(k)).length
    score += matchCount * 4

    // Se contiver palavras fortes combinadas como "descricao" e "ncm" ou "codigo" e "descricao"
    if (
      (rowText.includes('descricao') || rowText.includes('produto')) &&
      (rowText.includes('ncm') || rowText.includes('codigo'))
    ) {
      score += 15
    }

    // Penalizar se a primeira célula tiver texto longo (linha mesclada de instrução ou notas)
    const firstCell = String(row[0] || '').trim()
    if (firstCell.length > 60) {
      score -= 15
    }

    if (score > maxColScore) {
      maxColScore = score
      bestIndex = i
    }
  }

  return bestIndex
}

interface SheetJsGlobal {
  read: (
    data: ArrayBuffer | Uint8Array,
    opts: { type: string; cellDates?: boolean; raw?: boolean },
  ) => {
    SheetNames: string[]
    Sheets: Record<string, unknown>
  }
  utils: {
    sheet_to_json: (
      sheet: unknown,
      opts: { header: number; defval?: string; blankrows?: boolean },
    ) => unknown[][]
  }
}

/**
 * Lê arquivo selecionado pelo usuário (.csv, .txt, .tsv, .xlsx, .xls)
 * com suporte nativo a XLSX via biblioteca SheetJS embutida ou carregada.
 */
export async function readSpreadsheetFile(
  file: File,
  targetSheet?: string | number,
): Promise<ParsedTable> {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'csv' || extension === 'txt' || extension === 'tsv') {
    const text = await file.text()
    return parseCsvText(text)
  }

  // Para arquivos Excel (.xlsx, .xls)
  const arrayBuffer = await file.arrayBuffer()
  const windowObj =
    typeof window !== 'undefined' ? (window as unknown as { XLSX?: SheetJsGlobal }) : null

  // Aguardar até 2 segundos se o script do CDN ainda estiver carregando
  let xlsxLib = windowObj?.XLSX
  if (!xlsxLib) {
    for (let retry = 0; retry < 10; retry++) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      xlsxLib = (window as unknown as { XLSX?: SheetJsGlobal })?.XLSX
      if (xlsxLib) break
    }
  }

  if (xlsxLib) {
    try {
      const workbook = xlsxLib.read(new Uint8Array(arrayBuffer), {
        type: 'array',
        cellDates: true,
        raw: false,
      })

      const sheetNames = workbook.SheetNames
      if (!sheetNames || sheetNames.length === 0) {
        throw new Error('A planilha Excel não possui nenhuma aba.')
      }

      // Determinar qual aba ler
      let selectedSheetName = sheetNames[0]
      if (typeof targetSheet === 'number' && targetSheet >= 0 && targetSheet < sheetNames.length) {
        selectedSheetName = sheetNames[targetSheet]
      } else if (typeof targetSheet === 'string') {
        const found = sheetNames.find(
          (s) =>
            s.toLowerCase().includes(targetSheet.toLowerCase()) ||
            targetSheet.toLowerCase().includes(s.toLowerCase()),
        )
        if (found) selectedSheetName = found
      }

      const worksheet = workbook.Sheets[selectedSheetName]
      const rawRows = xlsxLib.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
      }) as (string | number | undefined)[][]

      if (!rawRows || rawRows.length === 0) {
        return {
          sheetName: selectedSheetName,
          sheetNames,
          headers: [],
          rows: [],
          rowIndices: [],
        }
      }

      // Encontrar a linha de cabeçalho
      const headerIdx = findHeaderRowIndex(rawRows)
      const headerRow = rawRows[headerIdx] || []
      const headers = headerRow.map((h, i) => String(h || '').trim() || `Coluna_${i + 1}`)

      const rows: Record<string, string>[] = []
      const rowIndices: number[] = []

      for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const row = rawRows[i]
        if (!row || row.length === 0) continue

        // Verifica se linha é totalmente vazia
        const isBlank = row.every((c) => c === undefined || c === null || String(c).trim() === '')
        if (isBlank) continue

        const obj: Record<string, string> = {}
        headers.forEach((h, colIdx) => {
          const val = row[colIdx]
          obj[h] = val !== undefined && val !== null ? String(val).trim() : ''
        })

        // Só considera como registro se pelo menos uma coluna relevante tiver valor
        if (Object.values(obj).some((v) => v.length > 0)) {
          rows.push(obj)
          // 1-based original row index no Excel (adiciona 1 para o Excel)
          rowIndices.push(i + 1)
        }
      }

      return {
        sheetName: selectedSheetName,
        sheetNames,
        headers,
        rows,
        rowIndices,
      }
    } catch (err) {
      console.warn('Erro ao processar XLSX com SheetJS:', err)
      throw new Error(
        `Falha ao processar arquivo Excel: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // Caso XLSX não esteja disponível, notifica usuário
  throw new Error(
    'O leitor de planilhas Excel (.xlsx) não pôde ser inicializado. Por favor, exporte como .CSV ou recarregue a página.',
  )
}
