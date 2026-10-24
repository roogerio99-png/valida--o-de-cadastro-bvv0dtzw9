/**
 * src/lib/simRegrasIcmsMapeamento.ts
 *
 * Módulo de extração, normalização e derivação canônica para a coleção 'sim_regras_icms'
 * (Aba "Regra ICMS" / "Regras de ICMS" do Simulador Comercial).
 *
 * Segue o padrão canônico rigoroso já aplicado a 'sim_produtos_base' (v0.0.111):
 * - Reconhecimento agnóstico de cabeçalhos (case-insensitive, sem acentos, com ou sem underscores/espaços)
 * - Coerção robusta de alíquotas e percentuais (trata "12%", "12,0", 0.12, "0", etc.)
 * - Suporte a siglas e nomes de UF por extenso
 * - Dedução automática de chave_origem_destino (UF_ORIGEM + '_' + UF_DESTINO)
 * - Identificação correta de tipo_operacao (Interna ou Interestadual)
 */

export interface LinhaPlanilhaRegraIcms {
  [key: string]: unknown
}

export interface RegraIcmsEstruturada {
  uf_origem: string
  uf_destino: string
  aliquota_icms: number
  reducao_base: number
  aliquota_efetiva: number
  diferimento: boolean
  percentual_diferimento: number
  fundamentacao_legal: string
  tipo_operacao: string
  chave_origem_destino: string
  dados_extras?: Record<string, unknown>
}

// Mapa de siglas oficiais dos estados brasileiros (incluindo EX para exterior)
export const UFS_BRASIL: Record<string, string> = {
  AC: 'AC',
  ACRE: 'AC',
  AL: 'AL',
  ALAGOAS: 'AL',
  AP: 'AP',
  AMAPA: 'AP',
  AMAPÁ: 'AP',
  AM: 'AM',
  AMAZONAS: 'AM',
  BA: 'BA',
  BAHIA: 'BA',
  CE: 'CE',
  CEARA: 'CE',
  CEARÁ: 'CE',
  DF: 'DF',
  'DISTRITO FEDERAL': 'DF',
  ES: 'ES',
  'ESPIRITO SANTO': 'ES',
  'ESPÍRITO SANTO': 'ES',
  GO: 'GO',
  GOIAS: 'GO',
  GOIÁS: 'GO',
  MA: 'MA',
  MARANHAO: 'MA',
  MARANHÃO: 'MA',
  MT: 'MT',
  'MATO GROSSO': 'MT',
  MS: 'MS',
  'MATO GROSSO DO SUL': 'MS',
  MG: 'MG',
  'MINAS GERAIS': 'MG',
  PA: 'PA',
  PARA: 'PA',
  PARÁ: 'PA',
  PB: 'PB',
  PARAIBA: 'PB',
  PARAÍBA: 'PB',
  PR: 'PR',
  PARANA: 'PR',
  PARANÁ: 'PR',
  PE: 'PE',
  PERNAMBUCO: 'PE',
  PI: 'PI',
  PIAUI: 'PI',
  PIAUÍ: 'PI',
  RJ: 'RJ',
  'RIO DE JANEIRO': 'RJ',
  RN: 'RN',
  'RIO GRANDE DO NORTE': 'RN',
  RS: 'RS',
  'RIO GRANDE DO SUL': 'RS',
  RO: 'RO',
  RONDONIA: 'RO',
  RONDÔNIA: 'RO',
  RR: 'RR',
  RORAIMA: 'RR',
  SC: 'SC',
  'SANTA CATARINA': 'SC',
  SP: 'SP',
  'SAO PAULO': 'SP',
  'SÃO PAULO': 'SP',
  SE: 'SE',
  SERGIPE: 'SE',
  TO: 'TO',
  TOCANTINS: 'TO',
  EX: 'EX',
  EXTERIOR: 'EX',
}

/**
 * Normaliza strings para chave de busca: minúsculas, sem acentos e sem pontuação.
 */
export function normalizarChave(str: unknown): string {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Procura um valor em um objeto usando múltiplos aliases com prioridade:
 * 1. Match exato normalizado
 * 2. StartsWith normalizado
 * 3. Includes normalizado
 */
export function extrairValorPorAliases(row: Record<string, unknown>, aliases: string[]): string {
  if (!row || typeof row !== 'object') return ''
  const entries = Object.entries(row)

  // 1ª passada: match exato
  for (const alias of aliases) {
    const normAlias = normalizarChave(alias)
    for (const [k, v] of entries) {
      if (normalizarChave(k) === normAlias && v !== undefined && v !== null) {
        const valStr = String(v).trim()
        if (valStr.length > 0) return valStr
      }
    }
  }

  // 2ª passada: se o nome da coluna começa com o alias
  for (const alias of aliases) {
    const normAlias = normalizarChave(alias)
    if (normAlias.length < 3) continue // Evita prefixos curtos demais
    for (const [k, v] of entries) {
      const normKey = normalizarChave(k)
      if (normKey.startsWith(normAlias) && v !== undefined && v !== null) {
        const valStr = String(v).trim()
        if (valStr.length > 0) return valStr
      }
    }
  }

  // 3ª passada: substring match
  for (const alias of aliases) {
    const normAlias = normalizarChave(alias)
    if (normAlias.length < 4) continue
    for (const [k, v] of entries) {
      const normKey = normalizarChave(k)
      if (normKey.includes(normAlias) && v !== undefined && v !== null) {
        const valStr = String(v).trim()
        if (valStr.length > 0) return valStr
      }
    }
  }

  return ''
}

/**
 * Normaliza e sanitiza a sigla de UF (2 letras) a partir de sigla ou nome do estado.
 */
export function normalizarUf(raw: unknown): string {
  if (!raw) return ''
  const str = String(raw).trim().toUpperCase()
  if (!str) return ''

  // Caso direto: 2 letras válidas
  if (str.length === 2 && UFS_BRASIL[str]) {
    return str
  }

  // Busca no dicionário de estados (sem acentos)
  const semAcentos = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (UFS_BRASIL[semAcentos]) {
    return UFS_BRASIL[semAcentos]
  }

  // Se veio algo como "SP - São Paulo" ou "Origem: MT"
  const m = str.match(/\b([A-Z]{2})\b/)
  if (m && UFS_BRASIL[m[1]]) {
    return m[1]
  }

  return ''
}

/**
 * Converte valores numéricos e percentuais de planilhas:
 * Exemplos:
 *  - "12" -> 12
 *  - "12,5" / "12.5" -> 12.5
 *  - "12%" -> 12
 *  - 0.12 (quando digitado como taxa decimal no Excel) -> 12 (se modoPercentual = true)
 *  - "0" / "0,00" -> 0
 */
export function normalizarNumeroPercentual(raw: unknown, modoPercentual = true): number {
  if (raw === undefined || raw === null) return 0
  if (typeof raw === 'number') {
    if (isNaN(raw)) return 0
    // No Excel, células formatadas como porcentagem podem vir como fração (ex.: 0.12 para 12%, 0.07 para 7%)
    if (modoPercentual && raw > 0 && raw < 1) {
      return Math.round(raw * 10000) / 100
    }
    return raw
  }

  let str = String(raw).trim()
  if (!str) return 0

  const hasPercent = str.includes('%')
  str = str.replace('%', '').trim()

  // Se possui vírgula e ponto (ex.: 1.250,50)
  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else if (str.includes(',')) {
    str = str.replace(',', '.')
  }

  const cleaned = str.replace(/[^\d.-]/g, '')
  const parsed = parseFloat(cleaned)
  if (isNaN(parsed)) return 0

  if (modoPercentual && (hasPercent || (parsed > 0 && parsed < 1))) {
    if (parsed > 0 && parsed < 1) {
      return Math.round(parsed * 10000) / 100
    }
  }

  return parsed
}

/**
 * Converte valores booleanos / texto de diferimento ("SIM", "S", "1", true, etc.)
 */
export function normalizarBooleanoDiferimento(raw: unknown): boolean {
  if (raw === true || raw === 1) return true
  if (raw === false || raw === 0 || raw === null || raw === undefined) return false

  const str = String(raw).trim().toLowerCase()
  if (
    str === 'sim' ||
    str === 's' ||
    str === 'true' ||
    str === '1' ||
    str === 'diferido' ||
    str === 'diferimento'
  ) {
    return true
  }
  return false
}

// Aliases para UF Origem
export const ALIASES_UF_ORIGEM = [
  'uf_origem',
  'uforigem',
  'origem',
  'uf_orig',
  'uforig',
  'estado_origem',
  'estadoorigem',
  'orig',
  'uf_saida',
  'origem_uf',
  'de_uf',
  'de',
]

// Aliases para UF Destino
export const ALIASES_UF_DESTINO = [
  'uf_destino',
  'ufdestino',
  'destino',
  'uf_dest',
  'ufdest',
  'estado_destino',
  'estadodestino',
  'dest',
  'uf_entrada',
  'destino_uf',
  'para_uf',
  'para',
]

// Aliases para Alíquota ICMS
export const ALIASES_ALIQUOTA_ICMS = [
  'aliquota_icms',
  'aliquotaicms',
  'aliq_icms',
  'aliqicms',
  'aliquota',
  'aliq',
  'icms',
  'aliq_nominal',
  'icms_aliquota',
  'taxa_icms',
  'aliquota_nominal',
]

// Aliases para Redução de Base
export const ALIASES_REDUCAO_BASE = [
  'reducao_base',
  'reducaobase',
  'red_base',
  'redbase',
  'reducao',
  'perc_reducao',
  'reducao_icms',
  'beneficio_reducao',
  'perc_red',
]

// Aliases para Alíquota Efetiva
export const ALIASES_ALIQUOTA_EFETIVA = [
  'aliquota_efetiva',
  'aliquotaefetiva',
  'aliq_efetiva',
  'aliqefetiva',
  'icms_efetivo',
  'aliq_final',
  'aliquota_final',
  'efetiva',
]

// Aliases para Diferimento
export const ALIASES_DIFERIMENTO = [
  'diferimento',
  'diferido',
  'possui_diferimento',
  'tem_diferimento',
  'diferimento_icms',
  'ind_diferimento',
  'flag_diferimento',
]

// Aliases para Percentual de Diferimento
export const ALIASES_PERCENTUAL_DIFERIMENTO = [
  'percentual_diferimento',
  'percentualdiferimento',
  'perc_diferimento',
  'percdiferimento',
  'diferimento_perc',
  'diferimento_percentual',
  'perc_dif',
  'diferimento_taxa',
]

// Aliases para Fundamentação Legal
export const ALIASES_FUNDAMENTACAO_LEGAL = [
  'fundamentacao_legal',
  'fundamentacaolegal',
  'fundamentacao',
  'base_legal',
  'baselegal',
  'dispositivo',
  'dispositivo_legal',
  'legislacao',
  'amparo_legal',
  'observacao',
  'observacoes',
  'obs',
]

// Aliases para Tipo de Operação
export const ALIASES_TIPO_OPERACAO = [
  'tipo_operacao',
  'tipooperacao',
  'operacao',
  'tipo',
  'natureza_operacao',
  'escopo_operacao',
]

/**
 * Mapeador canônico completo de uma linha bruta da planilha para a estrutura sim_regras_icms.
 */
export type ResultadoMapeamentoRegraIcms =
  | { sucesso: true; regra: RegraIcmsEstruturada; motivo?: never; campo?: never; valor?: never }
  | { sucesso: false; motivo: string; campo: string; valor: string; regra?: never }

export function mapearLinhaSimRegraIcms(
  row: Record<string, unknown>,
): ResultadoMapeamentoRegraIcms {
  if (!row || typeof row !== 'object') {
    return {
      sucesso: false,
      motivo: 'Linha inválida ou vazia.',
      campo: 'linha',
      valor: '',
    }
  }

  // 1. Extração de UF Origem e Destino
  const rawOrigem = extrairValorPorAliases(row, ALIASES_UF_ORIGEM)
  const ufOrigem = normalizarUf(rawOrigem)

  const rawDestino = extrairValorPorAliases(row, ALIASES_UF_DESTINO)
  const ufDestino = normalizarUf(rawDestino)

  if (!ufOrigem || !ufDestino) {
    return {
      sucesso: false,
      motivo: `Siglas de UF inválidas ou não reconhecidas: Origem="${rawOrigem}" (normalizado: "${ufOrigem}"), Destino="${rawDestino}" (normalizado: "${ufDestino}"). Devem ser estados válidos (ex.: SP, MT, PR).`,
      campo: 'uf',
      valor: `${rawOrigem} -> ${rawDestino}`,
    }
  }

  // 2. Alíquota ICMS
  const rawAliqIcms = extrairValorPorAliases(row, ALIASES_ALIQUOTA_ICMS)
  const aliqIcms = normalizarNumeroPercentual(rawAliqIcms, true)

  // 3. Redução de Base
  const rawRedBase = extrairValorPorAliases(row, ALIASES_REDUCAO_BASE)
  const redBase = normalizarNumeroPercentual(rawRedBase, true)

  // 4. Alíquota Efetiva
  const rawAliqEfetiva = extrairValorPorAliases(row, ALIASES_ALIQUOTA_EFETIVA)
  let aliqEfetiva = 0
  if (rawAliqEfetiva) {
    aliqEfetiva = normalizarNumeroPercentual(rawAliqEfetiva, true)
  } else {
    aliqEfetiva = Math.round(aliqIcms * (1 - redBase / 100) * 10000) / 10000
  }

  // 5. Diferimento e Percentual
  const rawDiferimento = extrairValorPorAliases(row, ALIASES_DIFERIMENTO)
  const rawPercDif = extrairValorPorAliases(row, ALIASES_PERCENTUAL_DIFERIMENTO)
  const percDif = normalizarNumeroPercentual(rawPercDif, true)
  const diferimento = normalizarBooleanoDiferimento(rawDiferimento) || percDif > 0

  // 6. Fundamentação Legal
  const fundLegal = extrairValorPorAliases(row, ALIASES_FUNDAMENTACAO_LEGAL)

  // 7. Tipo de Operação
  const rawTipoOp = extrairValorPorAliases(row, ALIASES_TIPO_OPERACAO)
  const tipoOp = rawTipoOp || (ufOrigem === ufDestino ? 'Interna' : 'Interestadual')

  // 8. Chave Composta Origem_Destino
  const chaveOrigemDestino = `${ufOrigem}_${ufDestino}`

  return {
    sucesso: true,
    regra: {
      uf_origem: ufOrigem,
      uf_destino: ufDestino,
      aliquota_icms: aliqIcms,
      reducao_base: redBase,
      aliquota_efetiva: aliqEfetiva,
      diferimento: diferimento,
      percentual_diferimento: percDif,
      fundamentacao_legal: fundLegal,
      tipo_operacao: tipoOp,
      chave_origem_destino: chaveOrigemDestino,
      dados_extras: row,
    },
  }
}
