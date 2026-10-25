import { parsearEmbalagemComercial, sanitizarMarcaComercial } from './motorCanonico'
import type { BaseMestreProduto } from '@/types/agro'

/**
 * Normaliza texto genérico: trim, caixa alta, remove acentos (NFD) e colapsa múltiplos espaços em 1.
 */
export function normalizarTextoGenerico(val?: string | null): string {
  if (!val) return ''
  return String(val)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

/**
 * Normaliza o Nome Comercial do produto.
 * Dá preferência à marca padronizada ou sanitiza o nome completo removendo sufixos de embalagem.
 */
export function normalizarNomeComercial(nomeCompleto?: string, marcaPadronizada?: string): string {
  const candidato = (marcaPadronizada || '').trim() || sanitizarMarcaComercial(nomeCompleto || '')
  return normalizarTextoGenerico(candidato)
}

/**
 * Normaliza o Princípio Ativo.
 */
export function normalizarPrincipioAtivo(pa?: string): string {
  return normalizarTextoGenerico(pa)
}

/**
 * Normaliza a Quantidade da Embalagem como número puro (ex.: "20L" = "20 L" = 20; "4x5L" = 5; "0.25 KG" = 0.25).
 */
export function normalizarQuantidadeEmbalagem(
  qtdInformada?: number | string | null,
  textoEmbalagem?: string | null,
): number {
  // 1. Se já fornecido número positivo válido
  if (typeof qtdInformada === 'number' && !isNaN(qtdInformada) && qtdInformada > 0) {
    return Number(qtdInformada.toFixed(4))
  }

  // 2. Se for string que é estritamente número ou decimal (ex.: "20", "20.5", "20,5")
  if (typeof qtdInformada === 'string') {
    const limpo = qtdInformada.trim().replace(',', '.')
    if (/^\d+(\.\d+)?$/.test(limpo)) {
      const num = parseFloat(limpo)
      if (!isNaN(num) && num > 0) return Number(num.toFixed(4))
    }
  }

  // 3. Tentar extrair do texto de embalagem ou da string de quantidade com unidade (ex.: "20L", "20 L", "4x5L", "1x20KG")
  const textoParaParser = String(qtdInformada || textoEmbalagem || '').trim()
  if (textoParaParser) {
    const parsed = parsearEmbalagemComercial(textoParaParser)
    if (parsed.quantidade > 0) {
      return Number(parsed.quantidade.toFixed(4))
    }

    // Heurística direta se parsearEmbalagemComercial não pegou
    const m = textoParaParser.match(/(\d+(?:[.,]\d+)?)/)
    if (m) {
      const n = parseFloat(m[1].replace(',', '.'))
      if (!isNaN(n) && n > 0) return Number(n.toFixed(4))
    }
  }

  return 0
}

/**
 * Normaliza o Código / Registro MAPA.
 * Remove prefixos comuns ("Nº", "N°", "N."), espaços, e se for puramente numérico,
 * normaliza removendo zeros à esquerda para unificar "002094" e "2094".
 * Se contiver letras ou traço (ex.: "TC123", "PR-00123-0001", "ISENTO"), preserva texto limpo.
 */
export function normalizarCodigoMapa(reg?: string | null): string {
  if (!reg) return 'ISENTO'
  const s = String(reg).trim().toUpperCase()
  if (!s || s.includes('ISENTO')) return 'ISENTO'

  // Remover prefixos comuns de registro
  const semPrefixo = s.replace(/^N[º°.]\s*/i, '').trim()
  const digits = semPrefixo.replace(/\D/g, '')

  // Se o valor após remover prefixo for estritamente dígitos
  if (digits.length > 0 && /^\d+$/.test(semPrefixo)) {
    // Normaliza número (remove zeros à esquerda para compatibilizar 002094 e 2094)
    const numInt = parseInt(digits, 10)
    return isNaN(numInt) ? digits : String(numInt)
  }

  // Se tiver letras, traços ou prefixos como TC ou código SIPEAGRO estadual
  return normalizarTextoGenerico(semPrefixo)
}

export interface PayloadItemBaseMestre {
  nome_comercial?: string
  nome_produto?: string
  nome_completo?: string
  marca_padronizada?: string
  principio_ativo?: string
  quantidade?: number | string | null
  quantidade_embalagem_principal?: number | string | null
  embalagem?: string | null
  registro_mapa?: string | null
  codigo_mapa?: string | null
}

/**
 * Gera a chave composta dos 4 campos canônicos para checagem estrita de duplicidade:
 * (1) nome comercial do produto
 * (2) princípio ativo
 * (3) quantidade da embalagem
 * (4) código MAPA (registro MAPA)
 */
export function gerarChaveDuplicidadeBaseMestre(item: PayloadItemBaseMestre): string {
  const nome = normalizarNomeComercial(
    item.nome_completo || item.nome_produto || item.nome_comercial,
    item.marca_padronizada,
  )
  const pa = normalizarPrincipioAtivo(item.principio_ativo)
  const qtd = normalizarQuantidadeEmbalagem(
    item.quantidade_embalagem_principal ?? item.quantidade,
    item.embalagem,
  )
  const mapa = normalizarCodigoMapa(item.registro_mapa || item.codigo_mapa)

  return `${nome}__||__${pa}__||__${qtd}__||__${mapa}`
}

/**
 * Formata um rótulo descritivo e legível para exibição ao usuário final no relatório de importação e alertas.
 * Exemplo: "ROUNDUP WG • P.A.: GLIFOSATO • Emb: 20 • MAPA: 2094"
 */
export function formatarRotuloLegivelDuplicada(item: PayloadItemBaseMestre): string {
  const nome = (
    item.marca_padronizada ||
    item.nome_produto ||
    item.nome_comercial ||
    item.nome_completo ||
    'Produto'
  ).trim()
  const pa = (item.principio_ativo || 'Não Informado').trim()
  const qtd = normalizarQuantidadeEmbalagem(
    item.quantidade_embalagem_principal ?? item.quantidade,
    item.embalagem,
  )
  const mapa = (item.registro_mapa || item.codigo_mapa || 'ISENTO').trim()

  return `${nome} • P.A.: ${pa} • Emb: ${qtd > 0 ? qtd : item.embalagem || 'Padrão'} • MAPA: ${mapa}`
}

/**
 * Verifica se um item é duplicado de outro item comparando a combinação dos 4 campos.
 */
export function saoProdutosDuplicados(a: PayloadItemBaseMestre, b: PayloadItemBaseMestre): boolean {
  return gerarChaveDuplicidadeBaseMestre(a) === gerarChaveDuplicidadeBaseMestre(b)
}

/**
 * Busca registro duplicado em uma lista de produtos existentes na Base Mestre.
 * Retorna o primeiro registro que coincidir nos 4 campos (ou null se nenhum coincidir).
 */
export function encontrarDuplicadoNaLista<T extends BaseMestreProduto | PayloadItemBaseMestre>(
  novo: PayloadItemBaseMestre,
  existentes: T[],
  ignorarId?: string,
): T | null {
  const chaveNovo = gerarChaveDuplicidadeBaseMestre(novo)
  for (const item of existentes) {
    if (ignorarId && (item as BaseMestreProduto).id === ignorarId) {
      continue
    }
    if (gerarChaveDuplicidadeBaseMestre(item) === chaveNovo) {
      return item
    }
  }
  return null
}
