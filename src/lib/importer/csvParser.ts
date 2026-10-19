/**
 * Parser leve e robusto para CSV e TSV no browser sem dependências pesadas externas.
 * Trata aspas duplas, vírgulas, ponto-e-vírgula e quebras de linha dentro de campos.
 */

export interface ParsedTable {
  headers: string[]
  rows: Record<string, string>[]
}

export function parseCsvText(text: string): ParsedTable {
  const clean = text.replace(/^\uFEFF/, '') // remove BOM
  // Detectar delimitador provável (; ou , ou \t)
  const firstLine = clean.split(/\r\n|\n|\r/)[0] || ''
  const countSemi = (firstLine.match(/;/g) || []).length
  const countComma = (firstLine.match(/,/g) || []).length
  const countTab = (firstLine.match(/\t/g) || []).length

  let delimiter = ','
  if (countSemi > countComma && countSemi >= countTab) delimiter = ';'
  else if (countTab > countComma && countTab > countSemi) delimiter = '\t'

  const rawRows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

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
          rawRows.push(currentRow)
        }
        currentRow = []
        currentField = ''
      } else if (char === '\n') {
        currentRow.push(currentField.trim())
        if (currentRow.some((c) => c !== '')) {
          rawRows.push(currentRow)
        }
        currentRow = []
        currentField = ''
      } else {
        currentField += char
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some((c) => c !== '')) {
      rawRows.push(currentRow)
    }
  }

  if (rawRows.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = rawRows[0].map((h) => h.trim())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i]
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx].trim() : ''
    })
    rows.push(obj)
  }

  return { headers, rows }
}

/**
 * Lê arquivo selecionado pelo usuário (CSV ou TXT tabulado).
 * Se o usuário enviar .xlsx, instruímos a conversão ou lemos com leitor básico se texto puro.
 */
export async function readSpreadsheetFile(file: File): Promise<ParsedTable> {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'csv' || extension === 'txt' || extension === 'tsv') {
    const text = await file.text()
    return parseCsvText(text)
  }

  // Se for .xlsx, o navegador pode tentar ler metadados ou instruir exportação CSV
  // Notificamos que CSV/TSV é o padrão recomendado e direto no navegador
  const text = await file.text()
  if (text.includes('PK') && text.charCodeAt(0) === 0x50) {
    throw new Error(
      'Para máxima compatibilidade e rapidez, por favor salve a planilha como formato CSV (.csv delimitado por vírgula ou ponto-e-vírgula) antes de importar.',
    )
  }

  return parseCsvText(text)
}
