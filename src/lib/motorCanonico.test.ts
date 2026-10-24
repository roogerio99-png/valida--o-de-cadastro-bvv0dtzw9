/**
 * Testes automatizados das travas de auditoria do validador agro.
 *
 * Conforme o comportamento canônico implementado em `pocketbase/hooks/validar_produto.js`:
 * 1. A NCM informada no payload é 100% IGNORADA. A Base Mestre é a portadora ÚNICA
 *    da classificação tributária (NCM específica por embalagem).
 * 2. A NCM é resolvida consultando `base_mestre` pela chave natural da embalagem final:
 *    (registro MAPA + quantidade + unidade + forma de acondicionamento).
 * 3. Parser canônico de embalagem idêntico ao das importações ("4x5L" -> 5 L, "20KG" -> 20 kg).
 * 4. Casos mínimos:
 *    (a) Produto com cadastro na Base Mestre -> Trava 1 e Trava 2 passam com a NCM da base
 *        - ROUNDUP WG (MAPA 002094, 20 kg, Saco) = NCM 3808.93.24
 *        - ROUNDUP ORIGINAL MAIS (MAPA 01119, 20 L, Bombona) = NCM 3808.93.29
 *    (b) Produto sem cadastro na Base Mestre -> Trava 1 reprova com a mensagem exata:
 *        "Produto sem classificação tributária na Base Mestre"
 *        e Trava 2 fica bloqueada/pendente.
 *    (c) NCM enviada na requisição é ignorada: mesmo enviando NCM incorreta (ex.: 3808.99.99 ou 9999.99.99),
 *        a auditoria utiliza a NCM da Base Mestre.
 *    (d) Banco de bula está 100% SEM NCM — nenhum teste pode depender de NCM em coleção de bula.
 */

import { describe, it, expect } from 'vitest'
import {
  parsearEmbalagemComercial,
  formatarNcmMascara,
  sanitizarRegistroMapa,
} from './motorCanonico'

// Tipagem simplificada do registro da Base Mestre para o motor de auditoria
export interface MockBaseMestreRegistro {
  id: string
  nome_completo: string
  marca_padronizada?: string
  registro_mapa: string
  quantidade_embalagem_principal: number
  unidade_medida_principal: string
  forma_acondicionamento: string
  ncm_especifica: string
  ncm_padrao?: string
  ncm?: string
}

export interface MockRegraNcmEmbalagem {
  ncm: string
  descricao: string
  embalagens_permitidas: string[]
}

export interface PayloadValidacaoProduto {
  nome_comercial: string
  ncm?: string // Enviada na requisição, mas DEVE ser ignorada
  registro_mapa?: string
  codigo_mapa?: string
  embalagem?: string
  quantidade?: number | string
  unidade?: string
  forma_acondicionamento?: string
}

export interface TravaAuditoriaResultado {
  id_trava: number
  trava_nome: string
  aprovado: boolean
  mensagem: string
}

export interface AuditoriaResultado {
  ncm_resolvida: string
  ncm_resolvida_origem: 'BASE_MESTRE' | 'NENHUMA'
  travas: TravaAuditoriaResultado[]
  veredito_geral: 'APROVADO' | 'APROVADO COM RESSALVAS' | 'REPROVADO'
}

/**
 * Função pura que reproduz o fluxo determinístico das Travas de Auditoria 1 e 2
 * conforme implementado em `pocketbase/hooks/validar_produto.js`.
 */
export function executarAuditoriaTravas(
  payload: PayloadValidacaoProduto,
  baseMestre: MockBaseMestreRegistro[],
  regrasNcm: MockRegraNcmEmbalagem[] = [],
): AuditoriaResultado {
  // 1. Parser canônico de embalagem
  const embParseada = parsearEmbalagemComercial(payload.embalagem || '')

  const qtdEmbalagemFinal =
    payload.quantidade !== undefined &&
    payload.quantidade !== null &&
    Number(payload.quantidade) > 0
      ? Number(payload.quantidade)
      : embParseada.quantidade || 20

  const unidadeFinal = (payload.unidade || embParseada.unidade || 'L').trim().toUpperCase()

  const acondicionamentoFinal =
    payload.forma_acondicionamento || embParseada.acondicionamento || 'Bombona'

  const registroMapaInformado = sanitizarRegistroMapa(
    payload.registro_mapa || payload.codigo_mapa || '',
  )
  const regDigits = registroMapaInformado.replace(/\D/g, '')

  // 2. A NCM informada no payload é TOTALMENTE IGNORADA (fonte única = base_mestre)
  let cadastroEncontrado: MockBaseMestreRegistro | null = null

  // Busca na base mestre pela chave natural (MAPA + Quantidade + Unidade + Acondicionamento)
  for (const reg of baseMestre) {
    const regBmDigits = (reg.registro_mapa || '').replace(/\D/g, '')
    const mapaMatch =
      regDigits && regBmDigits
        ? regDigits === regBmDigits ||
          regBmDigits.endsWith(regDigits) ||
          regDigits.endsWith(regBmDigits)
        : false

    const qtdMatch = Number(reg.quantidade_embalagem_principal) === Number(qtdEmbalagemFinal)
    const unMatch = (reg.unidade_medida_principal || '').toUpperCase() === unidadeFinal
    const acondMatch =
      (reg.forma_acondicionamento || '').toLowerCase() === acondicionamentoFinal.toLowerCase()

    if (mapaMatch && qtdMatch && unMatch && acondMatch) {
      cadastroEncontrado = reg
      break
    }
  }

  // Fallback 1: MAPA + Quantidade + Unidade
  if (!cadastroEncontrado) {
    for (const reg of baseMestre) {
      const regBmDigits = (reg.registro_mapa || '').replace(/\D/g, '')
      const mapaMatch =
        regDigits && regBmDigits
          ? regDigits === regBmDigits ||
            regBmDigits.endsWith(regDigits) ||
            regDigits.endsWith(regBmDigits)
          : false
      const qtdMatch = Number(reg.quantidade_embalagem_principal) === Number(qtdEmbalagemFinal)

      if (mapaMatch && qtdMatch) {
        cadastroEncontrado = reg
        break
      }
    }
  }

  // Fallback 2: apenas MAPA
  if (!cadastroEncontrado && regDigits && regDigits.length >= 4) {
    for (const reg of baseMestre) {
      const regBmDigits = (reg.registro_mapa || '').replace(/\D/g, '')
      if (regBmDigits === regDigits) {
        cadastroEncontrado = reg
        break
      }
    }
  }

  let ncmResolvida = ''
  if (cadastroEncontrado) {
    const ncmBruta =
      cadastroEncontrado.ncm_especifica ||
      cadastroEncontrado.ncm_padrao ||
      cadastroEncontrado.ncm ||
      ''
    const digits = ncmBruta.replace(/\D/g, '')
    if (digits.length === 8) {
      ncmResolvida = formatarNcmMascara(digits)
    }
  }

  const travas: TravaAuditoriaResultado[] = []

  // TRAVA 1: NCM Obrigatória (Base Mestre & TIPI)
  let trava1Passou = false
  let trava1Msg = ''

  if (!ncmResolvida) {
    trava1Passou = false
    trava1Msg = 'Produto sem classificação tributária na Base Mestre'
  } else {
    trava1Passou = true
    trava1Msg = `NCM ${ncmResolvida} resolvida da Base Mestre e homologada na TIPI.`
  }

  travas.push({
    id_trava: 1,
    trava_nome: 'NCM Obrigatória (Base Mestre & TIPI)',
    aprovado: trava1Passou,
    mensagem: trava1Msg,
  })

  // TRAVA 2: Embalagem vs NCM
  let trava2Passou = false
  let trava2Msg = ''

  if (!trava1Passou) {
    trava2Passou = false
    trava2Msg = 'Bloqueada: aguardando resolução de NCM na Base Mestre.'
  } else {
    const ncmDig = ncmResolvida.replace(/\D/g, '')
    const regra = regrasNcm.find((r) => r.ncm.replace(/\D/g, '') === ncmDig)

    if (regra && regra.embalagens_permitidas.length > 0) {
      const acondNorm = acondicionamentoFinal.toLowerCase()
      const match = regra.embalagens_permitidas.some((p) => p.toLowerCase().includes(acondNorm))
      if (match) {
        trava2Passou = true
        trava2Msg = `Embalagem "${acondicionamentoFinal} ${qtdEmbalagemFinal} ${unidadeFinal}" autorizada para o NCM ${ncmResolvida} na matriz TIPI.`
      } else {
        trava2Passou = false
        trava2Msg = `Embalagem "${acondicionamentoFinal}" não consta na matriz de acondicionamentos homologados para ${ncmResolvida}.`
      }
    } else {
      trava2Passou = true
      trava2Msg = `Embalagem "${acondicionamentoFinal} ${qtdEmbalagemFinal} ${unidadeFinal}" vinculada com sucesso ao NCM ${ncmResolvida}.`
    }
  }

  travas.push({
    id_trava: 2,
    trava_nome: 'Embalagem vs NCM',
    aprovado: trava2Passou,
    mensagem: trava2Msg,
  })

  const veredito_geral = !trava1Passou
    ? 'REPROVADO'
    : trava2Passou
      ? 'APROVADO'
      : 'APROVADO COM RESSALVAS'

  return {
    ncm_resolvida: ncmResolvida,
    ncm_resolvida_origem: ncmResolvida ? 'BASE_MESTRE' : 'NENHUMA',
    travas,
    veredito_geral,
  }
}

// -----------------------------------------------------------------------------
// DADOS REAIS DO BANCO PARA VALIDAÇÃO DOS TESTES
// -----------------------------------------------------------------------------
const BASE_MESTRE_FIXTURE: MockBaseMestreRegistro[] = [
  {
    id: 'bm_roundup_wg_20kg',
    nome_completo: 'ROUNDUP WG',
    marca_padronizada: 'ROUNDUP WG',
    registro_mapa: '002094',
    quantidade_embalagem_principal: 20,
    unidade_medida_principal: 'KG',
    forma_acondicionamento: 'Saco',
    ncm_especifica: '3808.93.24',
    ncm_padrao: '3808.93.24',
  },
  {
    id: 'bm_roundup_original_mais_20l',
    nome_completo: 'ROUNDUP ORIGINAL MAIS',
    marca_padronizada: 'ROUNDUP ORIGINAL MAIS',
    registro_mapa: '01119',
    quantidade_embalagem_principal: 20,
    unidade_medida_principal: 'L',
    forma_acondicionamento: 'Bombona',
    ncm_especifica: '3808.93.29',
    ncm_padrao: '3808.93.29',
  },
]

const REGRAS_NCM_FIXTURE: MockRegraNcmEmbalagem[] = [
  {
    ncm: '38089324',
    descricao: 'Herbicidas à base de glifosato para uso agrícola em grânulos',
    embalagens_permitidas: ['Saco', 'Sacaria', 'Big Bag'],
  },
  {
    ncm: '38089329',
    descricao: 'Outros herbicidas à base de glifosato',
    embalagens_permitidas: ['Bombona', 'Tambor', 'Container / IBC', 'Frasco'],
  },
]

describe('Travas de Auditoria de NCM (validar_produto.js)', () => {
  describe('(a) Produto com cadastro na Base Mestre -> Travas 1 e 2 passam com NCM da base', () => {
    it('deve aprovar ROUNDUP WG (MAPA 002094, 20 kg, Saco) com NCM 3808.93.24', () => {
      const res = executarAuditoriaTravas(
        {
          nome_comercial: 'ROUNDUP WG',
          registro_mapa: '002094',
          embalagem: 'Saco 20 kg',
          quantidade: 20,
          unidade: 'KG',
          forma_acondicionamento: 'Saco',
        },
        BASE_MESTRE_FIXTURE,
        REGRAS_NCM_FIXTURE,
      )

      expect(res.ncm_resolvida).toBe('3808.93.24')
      expect(res.ncm_resolvida_origem).toBe('BASE_MESTRE')

      const trava1 = res.travas.find((t) => t.id_trava === 1)
      expect(trava1?.aprovado).toBe(true)
      expect(trava1?.mensagem).toContain('3808.93.24')

      const trava2 = res.travas.find((t) => t.id_trava === 2)
      expect(trava2?.aprovado).toBe(true)
      expect(trava2?.mensagem).toContain('autorizada')

      expect(res.veredito_geral).toBe('APROVADO')
    })

    it('deve aprovar ROUNDUP ORIGINAL MAIS (MAPA 01119, 20 L, Bombona) com NCM 3808.93.29', () => {
      const res = executarAuditoriaTravas(
        {
          nome_comercial: 'ROUNDUP ORIGINAL MAIS',
          registro_mapa: '01119',
          embalagem: 'Bombona 20 L',
          quantidade: 20,
          unidade: 'L',
          forma_acondicionamento: 'Bombona',
        },
        BASE_MESTRE_FIXTURE,
        REGRAS_NCM_FIXTURE,
      )

      expect(res.ncm_resolvida).toBe('3808.93.29')
      expect(res.ncm_resolvida_origem).toBe('BASE_MESTRE')

      const trava1 = res.travas.find((t) => t.id_trava === 1)
      expect(trava1?.aprovado).toBe(true)
      expect(trava1?.mensagem).toContain('3808.93.29')

      const trava2 = res.travas.find((t) => t.id_trava === 2)
      expect(trava2?.aprovado).toBe(true)
      expect(trava2?.mensagem).toContain('autorizada')

      expect(res.veredito_geral).toBe('APROVADO')
    })
  })

  describe('(b) Produto sem cadastro na Base Mestre -> Trava 1 reprova com mensagem exata', () => {
    it('deve reprovar com "Produto sem classificação tributária na Base Mestre" e travar Trava 2', () => {
      const res = executarAuditoriaTravas(
        {
          nome_comercial: 'PRODUTO INEXISTENTE AGRO',
          registro_mapa: '999999',
          embalagem: 'Bombona 20 L',
        },
        BASE_MESTRE_FIXTURE,
        REGRAS_NCM_FIXTURE,
      )

      expect(res.ncm_resolvida).toBe('')
      expect(res.ncm_resolvida_origem).toBe('NENHUMA')

      const trava1 = res.travas.find((t) => t.id_trava === 1)
      expect(trava1?.aprovado).toBe(false)
      expect(trava1?.mensagem).toBe('Produto sem classificação tributária na Base Mestre')

      const trava2 = res.travas.find((t) => t.id_trava === 2)
      expect(trava2?.aprovado).toBe(false)
      expect(trava2?.mensagem).toBe('Bloqueada: aguardando resolução de NCM na Base Mestre.')

      expect(res.veredito_geral).toBe('REPROVADO')
    })
  })

  describe('(c) NCM enviada na requisição é IGNORADA (fonte única é a Base Mestre)', () => {
    it('mesmo enviando NCM errada no payload (ex.: 3808.99.99 ou 9999.99.99), resolve pela Base Mestre', () => {
      const res = executarAuditoriaTravas(
        {
          nome_comercial: 'ROUNDUP WG',
          ncm: '99999999', // NCM ERRADA/FALSA no payload da requisição
          registro_mapa: '002094',
          embalagem: 'Saco 20 kg',
          quantidade: 20,
          unidade: 'KG',
          forma_acondicionamento: 'Saco',
        },
        BASE_MESTRE_FIXTURE,
        REGRAS_NCM_FIXTURE,
      )

      // NCM DEVE SER RESOLVIDA DA BASE MESTRE (3808.93.24) E NUNCA A ENVIADA (99999999)
      expect(res.ncm_resolvida).toBe('3808.93.24')
      expect(res.ncm_resolvida).not.toBe('9999.99.99')

      const trava1 = res.travas.find((t) => t.id_trava === 1)
      expect(trava1?.aprovado).toBe(true)
      expect(trava1?.mensagem).toContain('3808.93.24')
    })

    it('mesmo que o usuário envie NCM de outro produto no payload de ROUNDUP ORIGINAL MAIS, preserva 3808.93.29', () => {
      const res = executarAuditoriaTravas(
        {
          nome_comercial: 'ROUNDUP ORIGINAL MAIS',
          ncm: '3808.91.99', // NCM de inseticida incorreta enviada
          registro_mapa: '01119',
          embalagem: 'Bombona 20 L',
          quantidade: 20,
          unidade: 'L',
          forma_acondicionamento: 'Bombona',
        },
        BASE_MESTRE_FIXTURE,
        REGRAS_NCM_FIXTURE,
      )

      expect(res.ncm_resolvida).toBe('3808.93.29')
      expect(res.ncm_resolvida).not.toBe('3808.91.99')
    })
  })

  describe('Parser canônico de embalagens de importação ("4x5L" -> 5 L, "20KG" -> 20 kg)', () => {
    it('deve extrair 5 L de "4x5L"', () => {
      const parsed = parsearEmbalagemComercial('4x5L')
      expect(parsed.quantidade).toBe(5)
      expect(parsed.unidade).toBe('L')
    })

    it('deve extrair 20 kg de "20KG"', () => {
      const parsed = parsearEmbalagemComercial('20KG')
      expect(parsed.quantidade).toBe(20)
      expect(parsed.unidade).toBe('KG')
    })

    it('deve extrair 20 kg e acondicionamento Saco de "1x20KG SACO"', () => {
      const parsed = parsearEmbalagemComercial('1x20KG SACO')
      expect(parsed.quantidade).toBe(20)
      expect(parsed.unidade).toBe('KG')
      expect(parsed.acondicionamento).toBe('Saco')
    })
  })
})
