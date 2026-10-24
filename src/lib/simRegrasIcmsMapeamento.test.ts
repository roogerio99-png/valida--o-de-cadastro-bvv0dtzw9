import { describe, it, expect } from 'vitest'
import {
  normalizarUf,
  normalizarNumeroPercentual,
  normalizarBooleanoDiferimento,
  mapearLinhaSimRegraIcms,
} from './simRegrasIcmsMapeamento'

describe('Mapeamento Canônico de Regras de ICMS (sim_regras_icms)', () => {
  it('normaliza UFs em maiúsculas, com espaços e por extenso', () => {
    expect(normalizarUf('sp')).toBe('SP')
    expect(normalizarUf('  MT  ')).toBe('MT')
    expect(normalizarUf('SÃO PAULO')).toBe('SP')
    expect(normalizarUf('Sao Paulo')).toBe('SP')
    expect(normalizarUf('Mato Grosso')).toBe('MT')
    expect(normalizarUf('Paraná')).toBe('PR')
    expect(normalizarUf('INVALIDO')).toBe('')
    expect(normalizarUf('')).toBe('')
  })

  it('normaliza números e percentuais com vírgula, ponto e símbolo %', () => {
    expect(normalizarNumeroPercentual('12')).toBe(12)
    expect(normalizarNumeroPercentual('12,5')).toBe(12.5)
    expect(normalizarNumeroPercentual('12.50')).toBe(12.5)
    expect(normalizarNumeroPercentual('7%')).toBe(7)
    expect(normalizarNumeroPercentual(0.12, true)).toBe(12)
    expect(normalizarNumeroPercentual(0.07, true)).toBe(7)
    expect(normalizarNumeroPercentual('0')).toBe(0)
    expect(normalizarNumeroPercentual('')).toBe(0)
    expect(normalizarNumeroPercentual(null)).toBe(0)
  })

  it('normaliza booleano de diferimento', () => {
    expect(normalizarBooleanoDiferimento('SIM')).toBe(true)
    expect(normalizarBooleanoDiferimento('sim')).toBe(true)
    expect(normalizarBooleanoDiferimento('s')).toBe(true)
    expect(normalizarBooleanoDiferimento(true)).toBe(true)
    expect(normalizarBooleanoDiferimento('1')).toBe(true)
    expect(normalizarBooleanoDiferimento('NAO')).toBe(false)
    expect(normalizarBooleanoDiferimento(false)).toBe(false)
    expect(normalizarBooleanoDiferimento('')).toBe(false)
  })

  it('mapeia linha com cabeçalhos canônicos exatos (UF_ORIGEM, UF_DESTINO, ALIQUOTA_ICMS)', () => {
    const row = {
      UF_ORIGEM: 'SP',
      UF_DESTINO: 'MT',
      ALIQUOTA_ICMS: '7,0',
      REDUCAO_BASE: '0',
      DIFERIMENTO: 'NAO',
      FUNDAMENTACAO_LEGAL: 'Convênio ICMS 100/97',
    }

    const res = mapearLinhaSimRegraIcms(row)
    expect(res.sucesso).toBe(true)
    if (!res.sucesso) return

    expect(res.regra.uf_origem).toBe('SP')
    expect(res.regra.uf_destino).toBe('MT')
    expect(res.regra.chave_origem_destino).toBe('SP_MT')
    expect(res.regra.aliquota_icms).toBe(7)
    expect(res.regra.reducao_base).toBe(0)
    expect(res.regra.aliquota_efetiva).toBe(7)
    expect(res.regra.diferimento).toBe(false)
    expect(res.regra.tipo_operacao).toBe('Interestadual')
    expect(res.regra.fundamentacao_legal).toBe('Convênio ICMS 100/97')
  })

  it('mapeia linha com cabeçalhos com espaços e acentos ("UF Origem", "UF Destino", "Alíquota")', () => {
    const row = {
      'UF Origem': 'PR',
      'UF Destino': 'PR',
      Alíquota: '18%',
      'Redução Base': '30%',
      Diferimento: 'Sim',
      'Percentual Diferimento': '100',
      'Base Legal': 'RICMS/PR Art. 42',
    }

    const res = mapearLinhaSimRegraIcms(row)
    expect(res.sucesso).toBe(true)
    if (!res.sucesso) return

    expect(res.regra.uf_origem).toBe('PR')
    expect(res.regra.uf_destino).toBe('PR')
    expect(res.regra.chave_origem_destino).toBe('PR_PR')
    expect(res.regra.aliquota_icms).toBe(18)
    expect(res.regra.reducao_base).toBe(30)
    expect(res.regra.aliquota_efetiva).toBe(12.6)
    expect(res.regra.diferimento).toBe(true)
    expect(res.regra.percentual_diferimento).toBe(100)
    expect(res.regra.tipo_operacao).toBe('Interna')
  })

  it('rejeita linha com UF inválida ou vazia com motivo detalhado', () => {
    const row = {
      UF_ORIGEM: 'XX',
      UF_DESTINO: 'MT',
      ALIQUOTA: '12',
    }

    const res = mapearLinhaSimRegraIcms(row)
    expect(res.sucesso).toBe(false)
    if (!res.sucesso) {
      expect(res.campo).toBe('uf')
      expect(res.motivo).toContain('Siglas de UF inválidas')
    }
  })
})
