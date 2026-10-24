/**
 * src/lib/simProdutosBaseMapeamento.ts
 *
 * Módulo de extração, normalização e derivação canônica para a coleção 'sim_produtos_base'
 * (Aba "Produtos Base" do Simulador de Operações / Simulador Comercial).
 *
 * Regras aplicadas:
 * 1. Descrição: B1_DESC (descrição real do produto), nunca BM_DESC (grupo).
 * 2. NCM: B1_POSIPI formatado em máscara canônica 0000.00.00.
 * 3. Embalagem: derivada da descrição via regex quando não informada (1X20L, 4X5L, 20KG, 200L, etc.).
 * 4. Origem: coluna X5_TABELA ou sufixo (IMP)/(SS).
 * 5. Fabricante: extraído do padrão "PRODUTO - FABRICANTE (AGENCIADO)" quando presente.
 * 6. Tipo de Produto: derivado de BM_DESC / B1_GRUPO / descrição.
 * 7. Unidade: normalizada para L, KG, SC, UN, DOSES a partir de B1_UM ou embalagem.
 * 8. Preço e Moeda: B1_PRV1 / coluna de preço, moeda USD para importado ou BRL para nacional.
 */

export interface LinhaPlanilhaProdutoBase {
  B1_COD?: string
  B1_DESC?: string
  B1_GRUPO?: string
  B1_POSIPI?: string
  B1_GRTRIB2?: string
  B1_UM?: string
  B1_PRV1?: number | string
  BM_DESC?: string
  X5_TABELA?: string
  X5_DESC?: string
  [key: string]: unknown
}

export interface ProdutoBaseEstruturado {
  codigo: string
  descricao: string
  ncm: string
  unidade: string
  tipo_produto: string
  origem: 'Nacional' | 'Importado'
  embalagem: string
  principio_ativo: string
  fabricante: string
  moeda: 'BRL' | 'USD'
  preco_base_sugerido: number
  dados_extras?: Record<string, unknown>
}

/**
 * Formata NCM bruto em formato canônico com máscara 0000.00.00
 */
export function formatarNcmCanonico(raw: string | number | undefined | null): string {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }
  if (digits.length > 0 && digits.length < 8) {
    const padded = digits.padStart(8, '0')
    return `${padded.slice(0, 4)}.${padded.slice(4, 6)}.${padded.slice(6, 8)}`
  }
  return ''
}

/**
 * Deriva a embalagem da descrição do produto (ex: "1X20L", "4X5L", "20KG", "200L", "500ML")
 */
export function extrairEmbalagemDescricao(desc: string | undefined | null): string {
  if (!desc) return ''
  const m = String(desc).match(
    /\b(\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(?:L|LT|KG|G|ML|SC|DOSES)|\d+(?:[.,]\d+)?\s*(?:L|LT|KG|G|ML|SC|DOSES))\b/i,
  )
  if (m) {
    return m[1].replace(/\s+/g, '').replace('X', 'x')
  }
  return ''
}

/**
 * Extrai o fabricante de descrições no formato "PRODUTO - FABRICANTE (AGENCIADO)"
 */
export function extrairFabricanteAgenciado(desc: string | undefined | null): string {
  if (!desc) return ''
  const m = String(desc).match(/[-–—]\s*([A-Za-z0-9&.\s]+?)\s*\((?:AGENCIADO|AGENC|DISTRIBUIDO)\)/i)
  if (m) {
    return m[1].trim()
  }
  return ''
}

/**
 * Deriva a procedência/origem (Nacional ou Importado)
 */
export function derivarOrigemProduto(
  x5Tabela?: string | null,
  desc?: string | null,
  emb?: string | null,
): 'Nacional' | 'Importado' {
  if (x5Tabela) {
    const up = String(x5Tabela).toUpperCase()
    if (up.includes('IMP') || up.includes('ESTRANGEIR')) return 'Importado'
    if (up.includes('NAC')) return 'Nacional'
  }
  const dUp = String(desc || '').toUpperCase()
  const eUp = String(emb || '').toUpperCase()
  if (
    dUp.includes('(IMP)') ||
    dUp.includes(' IMP ') ||
    dUp.endsWith(' IMP') ||
    dUp.includes('(SS)') ||
    eUp.includes('IMP')
  ) {
    return 'Importado'
  }
  return 'Nacional'
}

/**
 * Deriva a unidade a partir de B1_UM ou da embalagem
 */
export function normalizarUnidadeProduto(u?: string | null, emb?: string | null): string {
  if (u) {
    const up = String(u).trim().toUpperCase()
    if (['L', 'KG', 'SC', 'UN', 'DOSES'].includes(up)) return up
    if (up === 'LT' || up === 'LITROS' || up === 'ML') return 'L'
    if (up === 'G' || up === 'KILOS' || up === 'QUILOS' || up === 'TON' || up === 'T') return 'KG'
    if (up === 'SACO' || up === 'SACAS') return 'SC'
    if (up === 'FRASCO' || up === 'BOMBONA' || up === 'TAMBOR' || up === 'LATA') return 'UN'
  }
  const embUp = String(emb || '').toUpperCase()
  if (embUp.includes('KG') || embUp.includes('QUILO') || embUp.includes('G')) return 'KG'
  if (embUp.includes('SC') || embUp.includes('SACO')) return 'SC'
  if (embUp.includes('DOSE')) return 'DOSES'
  if (embUp.includes('UN')) return 'UN'
  return 'L'
}

/**
 * Deriva o tipo de produto canônico a partir de BM_DESC / B1_GRUPO / descrição
 */
export function derivarTipoProdutoCanonico(
  tipoExistente?: string | null,
  bmDesc?: string | null,
  b1Grupo?: string | null,
  desc?: string | null,
): string {
  const s =
    `${String(tipoExistente || '')} ${String(bmDesc || '')} ${String(b1Grupo || '')} ${String(desc || '')}`.toUpperCase()
  if (s.includes('FERTILIZANTE') || s.includes('NPK') || s.includes('ORGANOMINERAL')) {
    return 'Fertilizante Mineral / Organomineral'
  }
  if (
    s.includes('ADJUVANTE') ||
    s.includes('ESPALHANTE') ||
    s.includes('OLEO MINERAL') ||
    s.includes('ÓLEO MINERAL')
  ) {
    return 'Adjuvante / Espalhante Adesivo'
  }
  if (s.includes('BIOLOGICO') || s.includes('BIOLÓGICO') || s.includes('INOCULANTE')) {
    return 'Inoculante / Biológico'
  }
  if (
    s.includes('CORRETIVO') ||
    s.includes('CONDICIONADOR') ||
    s.includes('CALCARIO') ||
    s.includes('GESSO')
  ) {
    return 'Corretivo / Condicionador de Solo'
  }
  if (s.includes('SEMENTE')) {
    return 'Semente Certificada'
  }
  if (s.includes('TECNICO') || s.includes('TÉCNICO')) {
    return 'Produto Técnico Industrial'
  }
  if (s.includes('PRE-MISTURA') || s.includes('PRÉ-MISTURA')) {
    return 'Pré-Mistura Industrial'
  }
  return 'Produto Formulado Comercial'
}

/**
 * Mapeador completo de linha bruta para o registro estruturado de 'sim_produtos_base'
 */
export function mapearLinhaSimProdutoBase(
  row: LinhaPlanilhaProdutoBase,
  fallbackDescricao?: string,
): ProdutoBaseEstruturado {
  const b1Cod = String(row.B1_COD || row.b1_cod || row.codigo || '').trim()
  const b1Desc = String(row.B1_DESC || row.b1_desc || '').trim()
  const bmDesc = String(row.BM_DESC || row.bm_desc || row.grupo || '').trim()
  const b1Grupo = String(row.B1_GRUPO || row.b1_grupo || '').trim()
  const b1Posipi = String(row.B1_POSIPI || row.b1_posipi || row.ncm || '').trim()
  const b1Um = String(row.B1_UM || row.b1_um || row.unidade || '').trim()
  const x5 = String(row.X5_TABELA || row.X5_DESC || row.x5_tabela || row.origem || '').trim()
  const b1Prv1 = row.B1_PRV1 || row.b1_prv1 || row.preco_base_sugerido || row.preco || 0

  // 1. Descrição: prioridade absoluta B1_DESC; NUNCA BM_DESC
  let descricaoFinal = b1Desc
  if (!descricaoFinal && fallbackDescricao) {
    if (fallbackDescricao.trim().toUpperCase() !== bmDesc.toUpperCase()) {
      descricaoFinal = fallbackDescricao.trim()
    }
  }
  if (!descricaoFinal) {
    descricaoFinal = b1Desc || fallbackDescricao || bmDesc || 'Produto Sem Descrição'
  }

  // 2. NCM Canônico
  const ncmFinal = formatarNcmCanonico(b1Posipi)

  // 3. Embalagem
  const embalagemFinal = extrairEmbalagemDescricao(descricaoFinal)

  // 4. Unidade
  const unidadeFinal = normalizarUnidadeProduto(b1Um, embalagemFinal)

  // 5. Origem
  const origemFinal = derivarOrigemProduto(x5, descricaoFinal, embalagemFinal)

  // 6. Fabricante
  const fabricanteFinal = extrairFabricanteAgenciado(descricaoFinal)

  // 7. Tipo de Produto
  const tipoProdutoFinal = derivarTipoProdutoCanonico('', bmDesc, b1Grupo, descricaoFinal)

  // 8. Moeda e Preço
  const moedaFinal: 'BRL' | 'USD' = origemFinal === 'Importado' ? 'USD' : 'BRL'
  const precoFinal =
    typeof b1Prv1 === 'number' ? b1Prv1 : parseFloat(String(b1Prv1).replace(',', '.')) || 0

  return {
    codigo: b1Cod,
    descricao: descricaoFinal,
    ncm: ncmFinal,
    unidade: unidadeFinal,
    tipo_produto: tipoProdutoFinal,
    origem: origemFinal,
    embalagem: embalagemFinal,
    principio_ativo: '',
    fabricante: fabricanteFinal,
    moeda: moedaFinal,
    preco_base_sugerido: precoFinal,
    dados_extras: row as Record<string, unknown>,
  }
}
