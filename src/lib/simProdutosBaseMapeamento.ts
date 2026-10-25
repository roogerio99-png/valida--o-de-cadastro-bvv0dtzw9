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
  X5_DESCRI?: string
  gr_trib?: string
  grupo_codigo?: string
  grupo_descricao?: string
  descricao_grupo_tributario?: string
  segmento?: string
  comissao_padrao?: number | string
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
  gr_trib?: string
  grupo_codigo?: string
  grupo_descricao?: string
  descricao_grupo_tributario?: string
  segmento?: string
  comissao_padrao?: number
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
  const s = String(desc).trim()

  // 1. Preferência absoluta para quantidade × conteúdo: \d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(?:L|LT|KG|G|ML|SC|DOSES)
  // Exemplo: "SYNPROLE 480 SC 1X20L (IMP) SS" -> "1x20L" (e não 480SC)
  const mMult = s.match(/\b(\d+)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(L|LT|KG|G|ML|SC|DOSES)\b/i)
  if (mMult) {
    let un = mMult[3].toUpperCase()
    if (un === 'LT') un = 'L'
    return `${mMult[1]}x${mMult[2]}${un}`
  }

  // 2. Em sua ausência: número + unidade mais próximo ao final da descrição
  const regexFim = /\b(\d+(?:[.,]\d+)?)\s*(L|LT|KG|G|ML|SC|DOSES)\b/gi
  let match: RegExpExecArray | null
  let lastMatch: RegExpExecArray | null = null
  while ((match = regexFim.exec(s)) !== null) {
    lastMatch = match
  }

  if (lastMatch) {
    let un = lastMatch[2].toUpperCase()
    if (un === 'LT') un = 'L'
    return `${lastMatch[1]}${un}`
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
 * Deriva a procedência/origem (Nacional ou Importado).
 * Anti-contaminação: se x5Tabela trouxer texto de descrição do grupo fiscal
 * (ex.: contendo "ORIGEM" e "(NCM", ou "TRIBUTADO"), não deve ser interpretado como procedência pura.
 */
export function derivarOrigemProduto(
  x5Tabela?: string | null,
  desc?: string | null,
  emb?: string | null,
): 'Nacional' | 'Importado' {
  if (x5Tabela) {
    const up = String(x5Tabela).toUpperCase()
    // Anti-contaminação: se o texto descreve grupo fiscal ("DEFENSIVO - ORIGEM 0,4,5,6,7 (NCM 3808)")
    const isDescricaoFiscal =
      (up.includes('ORIGEM') && up.includes('(NCM')) || up.includes('TRIBUTAD')
    if (!isDescricaoFiscal) {
      if (up.includes('ESTRANGEIR') || /\bIMP\b/.test(up) || up.startsWith('IMP'))
        return 'Importado'
      if (/\bNAC\b/.test(up) || up.startsWith('NAC')) return 'Nacional'
    }
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
export function normalizarUnidadeProduto(
  u?: string | null,
  emb?: string | null,
  desc?: string | null,
  bmDesc?: string | null,
  b1Grupo?: string | null,
): string {
  const embUp = String(emb || '').toUpperCase()
  const dUp = `${String(desc || '')} ${String(bmDesc || '')} ${String(b1Grupo || '')}`.toUpperCase()
  const uUp = String(u || '')
    .trim()
    .toUpperCase()

  // 1. Líquidos (embalagem em L/ML ou formulação líquida) -> "L"
  const embIsLiquido =
    /\b\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(L|LT|ML)\b/i.test(embUp) ||
    /\b\d+(?:[.,]\d+)?\s*(L|LT|ML)\b/i.test(embUp) ||
    embUp.endsWith('L') ||
    embUp.endsWith('LT') ||
    embUp.endsWith('ML')

  // 2. Granulados / Sólidos (embalagem em KG/G ou formulação sólida) -> "KG"
  const embIsSolido =
    /\b\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(KG|G|TON|T)\b/i.test(embUp) ||
    /\b\d+(?:[.,]\d+)?\s*(KG|G|TON|T)\b/i.test(embUp) ||
    embUp.endsWith('KG') ||
    embUp.endsWith('G')

  if (embIsLiquido) {
    return 'L'
  }
  if (embIsSolido) {
    return 'KG'
  }

  // 3. Sólidos/granulados identificados pela descrição ou grupo do ERP (ex: Fertilizantes Granulados)
  if (
    dUp.includes('GRANULADO') ||
    dUp.includes('GRANULADOS') ||
    dUp.includes('FARELO') ||
    dUp.includes('PO SOLUVEL') ||
    dUp.includes('PÓ SOLÚVEL') ||
    dUp.includes('SÓLIDO') ||
    dUp.includes('SOLIDO') ||
    dUp.includes('CALCARIO') ||
    dUp.includes('GESSO')
  ) {
    if (['SC', 'SACAS', 'SACO'].includes(uUp)) return 'SC'
    return 'KG'
  }

  // 4. Se a unidade informada do ERP for coerente
  if (uUp) {
    if (['L', 'LT', 'LITROS', 'ML'].includes(uUp)) return 'L'
    if (['KG', 'KILOS', 'QUILOS', 'TON', 'T', 'G'].includes(uUp)) return 'KG'
    if (['SC', 'SACO', 'SACAS'].includes(uUp)) return 'SC'
    if (['DOSES', 'DOSE'].includes(uUp)) return 'DOSES'
    if (['UN', 'FRASCO', 'BOMBONA', 'TAMBOR', 'LATA'].includes(uUp)) return 'UN'
  }

  // 5. Termos de formulação na descrição: SC/SL/EC são suspensões/líquidos; WG/WP/GR são sólidos
  if (
    /\b(SC|SL|EC|EW|FS|OD|CS|SE)\b/.test(dUp) ||
    dUp.includes('OLEO') ||
    dUp.includes('ÓLEO') ||
    dUp.includes('LIQUIDO') ||
    dUp.includes('LÍQUIDO')
  ) {
    return 'L'
  }
  if (/\b(WG|WP|GR|DP|SP)\b/.test(dUp)) {
    return 'KG'
  }

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
  const b1Grtrib2 = String(
    row.B1_GRTRIB2 ||
      row.b1_grtrib2 ||
      row.gr_trib ||
      row.grtrib ||
      row.grupo_tributario ||
      row.grupo_tributario_codigo ||
      '',
  ).trim()
  const x5 = String(row.X5_TABELA || row.X5_DESC || row.x5_tabela || row.origem || '').trim()
  const b1Prv1 =
    row.B1_PRV1 !== undefined
      ? row.B1_PRV1
      : row.b1_prv1 !== undefined
        ? row.b1_prv1
        : row.preco_base_sugerido !== undefined
          ? row.preco_base_sugerido
          : row.preco !== undefined
            ? row.preco
            : row.valor !== undefined
              ? row.valor
              : 0

  // Campos novos das 13 colunas (A a M) da planilha "Produtos Base":
  // Coluna C: B1_GRUPO -> grupo_codigo
  const grupoCodigoFinal = String(
    row.B1_GRUPO || row.b1_grupo || row.B1_GRUPO_ORIGINAL || row.grupo_codigo || '',
  ).trim()

  // Coluna D: BM_DESC -> grupo_descricao
  const grupoDescricaoFinal = String(
    row.BM_DESC || row.bm_desc || row.BM_DESC_ORIGINAL || row.grupo_descricao || '',
  ).trim()

  // Coluna G: "DESCRIÇÃO GRUPO TRIBUTARIO" -> descricao_grupo_tributario
  let descGrupoTribFinal = String(
    row['DESCRIÇÃO GRUPO TRIBUTARIO'] ||
      row['DESCRICAO GRUPO TRIBUTARIO'] ||
      row['DESCRIÇÃO DO GRUPO TRIBUTÁRIO'] ||
      row.descricao_grupo_tributario ||
      row.desc_grupo_tributario ||
      row.desc_grtrib ||
      '',
  ).trim()

  // Se X5 contiver texto de grupo fiscal e descGrupoTribFinal estiver vazio, aproveita
  if (!descGrupoTribFinal) {
    const x5Descri = String(
      row.X5_DESCRI || row.x5_descri || row.X5_DESC || row.x5_desc || '',
    ).trim()
    if (
      x5Descri &&
      (x5Descri.includes('(NCM') || x5Descri.includes('TRIBUTAD') || x5Descri.includes('ORIGEM'))
    ) {
      descGrupoTribFinal = x5Descri
    }
  }

  // Coluna H: "SEGMENTO" -> segmento
  const segmentoFinal = String(row.SEGMENTO || row.segmento || '').trim()

  // Coluna I: "COMISSAO_PADRAO" -> comissao_padrao (number)
  const rawComissao =
    row.COMISSAO_PADRAO !== undefined
      ? row.COMISSAO_PADRAO
      : row.comissao_padrao !== undefined
        ? row.comissao_padrao
        : row.comissao
  let comissaoPadraoFinal: number | undefined
  if (rawComissao !== undefined && rawComissao !== null && rawComissao !== '') {
    const parsedCom =
      typeof rawComissao === 'number'
        ? rawComissao
        : parseFloat(String(rawComissao).replace(',', '.'))
    if (!isNaN(parsedCom)) {
      comissaoPadraoFinal = parsedCom
    }
  }

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

  // 3. Embalagem (preferindo padrão quantidade×conteúdo)
  const embalagemFinal = extrairEmbalagemDescricao(descricaoFinal)

  // 4. Unidade (líquidos em L/ML -> L, sólidos/granulados -> KG)
  const unidadeFinal = normalizarUnidadeProduto(
    b1Um,
    embalagemFinal,
    descricaoFinal,
    bmDesc,
    b1Grupo,
  )

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
    gr_trib: b1Grtrib2,
    grupo_codigo: grupoCodigoFinal || undefined,
    grupo_descricao: grupoDescricaoFinal || undefined,
    descricao_grupo_tributario: descGrupoTribFinal || undefined,
    segmento: segmentoFinal || undefined,
    comissao_padrao: comissaoPadraoFinal,
    dados_extras: row as Record<string, unknown>,
  }
}
