/**
 * src/lib/motorSimulador.test.ts
 *
 * Testes automatizados do Motor de Cálculo Comercial do AgroSimulador (Fase 1 - MVP):
 * 1. Simulação com regra ICMS encontrada (SP -> MT, alíquota nominal 4%, redução ou efetiva calculada)
 * 2. Simulação com par origem -> destino sem regra (emite aviso explícito e alerta de ausência de regra)
 * 3. Produto importado cotado em dólar (USD) exigindo cotação PTAX manual na conversão cambial
 * 4. Produto conhecido da Base Mestre: ROUNDUP WG MAPA 002094 saco 20 kg -> NCM 3808.93.24 (exclusiva)
 * 5. PIS/COFINS Agro: comparação temporal (Lei 10.925/2004 com Alíquota Zero vs LC 224/2025 com reoneração linear de 0,925%)
 */

import { describe, it, expect } from 'vitest'
import {
  executarCalculoSimulador,
  ProdutoBaseSimulador,
  RegraIcmsSimulador,
} from './motorSimulador'

describe('Motor de Cálculo Comercial do AgroSimulador (Fase 1 - MVP)', () => {
  const produtoNacionalPadrao: ProdutoBaseSimulador = {
    codigo: '01119',
    descricao: 'ROUNDUP ORIGINAL MAIS - Bombona 20 L',
    ncm: '3808.93.29',
    unidade: 'L',
    origem: 'Nacional',
    moeda: 'BRL',
    preco_base_sugerido: 34.0,
  }

  const regraIcmsSpMt: RegraIcmsSimulador = {
    uf_origem: 'SP',
    uf_destino: 'MT',
    aliquota_icms: 7.0,
    reducao_base: 41.67,
    aliquota_efetiva: 4.0831,
    diferimento: false,
    percentual_diferimento: 0,
    fundamentacao_legal: 'Convênio ICMS 100/97 (SP -> MT)',
    chave_origem_destino: 'SP_MT',
  }

  it('1. Deve calcular simulação com regra de ICMS encontrada no banco (SP -> MT)', () => {
    const res = executarCalculoSimulador({
      produto: produtoNacionalPadrao,
      ufOrigem: 'SP',
      ufDestino: 'MT',
      quantidade: 1000,
      precoUnitario: 34.0,
      frete: 2000,
      seguro: 300,
      outrasDespesas: 100,
      margemComercialPerc: 15,
      regraIcms: regraIcmsSpMt,
      considerarReoneracao2026: true,
    })

    // Mercadoria: 1000 * 34 = 34.000 + 2400 despesas = 36.400
    expect(res.valorMercadoriaReais).toBe(34000)
    expect(res.valorTotalOperacao).toBe(36400)

    // ICMS com redução de base
    expect(res.temRegraIcms).toBe(true)
    expect(res.avisoIcms).toBeUndefined()
    expect(res.icms.aliquotaNominal).toBe(7.0)
    expect(res.icms.reducaoBasePerc).toBe(41.67)
    expect(res.icms.valorImposto).toBeGreaterThan(0)

    // Total de tributos e preço sugerido
    expect(res.totalTributos).toBeGreaterThan(0)
    expect(res.precoVendaSugerido).toBeGreaterThan(res.custoTotalComTributos)
    expect(res.margemLucroPerc).toBe(15)
  })

  it('2. Deve emitir aviso explícito quando o par origem -> destino não possuir regra de ICMS', () => {
    const res = executarCalculoSimulador({
      produto: produtoNacionalPadrao,
      ufOrigem: 'AC',
      ufDestino: 'RR',
      quantidade: 500,
      precoUnitario: 30.0,
      regraIcms: null, // Sem regra cadastrada
    })

    expect(res.temRegraIcms).toBe(false)
    expect(res.avisoIcms).toBeDefined()
    expect(res.avisoIcms).toContain('Sem regra de ICMS para origem AC → destino RR')
    expect(res.alertas.some((a) => a.includes('Sem regra de ICMS'))).toBe(true)
    // Fallback estimativo de ICMS foi aplicado
    expect(res.icms.valorImposto).toBeGreaterThan(0)
  })

  it('3. Deve calcular produto importado cotado em dólar (USD) exigindo e aplicando a cotação PTAX manual', () => {
    const produtoImportado: ProdutoBaseSimulador = {
      codigo: 'IMP-772',
      descricao: 'GLIFOSATO TECNICO 95% (IMP)',
      ncm: '3808.93.29',
      origem: 'Importado',
      moeda: 'USD',
      unidade: 'KG',
      preco_base_sugerido: 5.5,
    }

    const ptaxManualInformada = 5.825

    const res = executarCalculoSimulador({
      produto: produtoImportado,
      ufOrigem: 'SP',
      ufDestino: 'SP',
      quantidade: 2000,
      precoUnitario: 5.5, // US$ 5.50
      moeda: 'USD',
      ptaxManual: ptaxManualInformada,
      frete: 1500,
      regraIcms: {
        uf_origem: 'SP',
        uf_destino: 'SP',
        aliquota_icms: 18,
        reducao_base: 0,
        chave_origem_destino: 'SP_SP',
      },
    })

    expect(res.isImportado).toBe(true)
    expect(res.moedaOriginal).toBe('USD')
    expect(res.ptaxAplicada).toBe(5.825)

    // Preço unitário em Reais: 5.50 * 5.825 = 32.0375
    expect(res.valorUnitarioReais).toBeCloseTo(32.0375, 4)
    // Valor total mercadoria em Reais: 2000 * 32.0375 = 64.075
    expect(res.valorMercadoriaReais).toBeCloseTo(64075, 2)
  })

  it('4. Deve validar cálculo com produto conhecido da Base Mestre: ROUNDUP WG MAPA 002094 saco 20 kg (NCM 3808.93.24)', () => {
    const roundupWg: ProdutoBaseSimulador = {
      codigo: '002094',
      descricao: 'ROUNDUP WG - Saco 20 kg',
      ncm: '3808.93.24', // NCM correta e exclusiva
      unidade: 'KG',
      origem: 'Nacional',
      embalagem: 'Saco 20 kg',
      principio_ativo: 'Glifosato (Sal de Amônio)',
      moeda: 'BRL',
      preco_base_sugerido: 45.0,
    }

    const res = executarCalculoSimulador({
      produto: roundupWg,
      ufOrigem: 'RS',
      ufDestino: 'PR',
      quantidade: 5000,
      precoUnitario: 45.0,
      regraIcms: {
        uf_origem: 'RS',
        uf_destino: 'PR',
        aliquota_icms: 12,
        reducao_base: 60,
        aliquota_efetiva: 4.8,
        chave_origem_destino: 'RS_PR',
      },
      considerarReoneracao2026: true,
    })

    expect(res.codigoProduto).toBe('002094')
    expect(res.ncm).toBe('3808.93.24')
    expect(res.unidade).toBe('KG')
    expect(res.valorMercadoriaReais).toBe(225000)
    expect(res.icms.aliquotaNominal).toBe(12)
    expect(res.icms.reducaoBasePerc).toBe(60)
    expect(res.icms.aliquotaEfetiva).toBe(4.8)
  })

  it('5. Deve alternar corretamente entre regime de Alíquota Zero (Lei 10.925) e Reoneração linear de 10% (LC 224/2025)', () => {
    // Caso A: Alíquota Zero (considerarReoneracao2026 = false)
    const resAliquotaZero = executarCalculoSimulador({
      produto: produtoNacionalPadrao,
      ufOrigem: 'SP',
      ufDestino: 'SP',
      quantidade: 100,
      precoUnitario: 30,
      considerarReoneracao2026: false,
    })

    expect(resAliquotaZero.pis.aliquotaNominal).toBe(0)
    expect(resAliquotaZero.cofins.aliquotaNominal).toBe(0)
    expect(resAliquotaZero.pis.valorImposto).toBe(0)
    expect(resAliquotaZero.cofins.valorImposto).toBe(0)

    // Caso B: Reoneração 10% pós-2026 (considerarReoneracao2026 = true)
    const resReonerado = executarCalculoSimulador({
      produto: produtoNacionalPadrao,
      ufOrigem: 'SP',
      ufDestino: 'SP',
      quantidade: 100,
      precoUnitario: 30,
      considerarReoneracao2026: true,
    })

    expect(resReonerado.pis.aliquotaNominal).toBe(0.165)
    expect(resReonerado.cofins.aliquotaNominal).toBe(0.76)
    expect(resReonerado.pis.valorImposto).toBeGreaterThan(0)
    expect(resReonerado.cofins.valorImposto).toBeGreaterThan(0)
  })

  it('6. Deve priorizar regra com gr_trib idêntico e emitir aviso quando houver divergência', () => {
    const produtoComGrTrib = {
      descricao: 'SYNPROLE 480 SC 1X20L (IMP) SS',
      codigo: '007243',
      unidade: 'L',
      embalagem: '1X20L',
      gr_trib: '001',
    }

    const regraExata = {
      uf_origem: 'SP',
      uf_destino: 'MT',
      aliquota_icms: 4.0,
      reducao_base: 0,
      chave_origem_destino: 'SP_MT',
      grupo_tributario_codigo: '001',
      grupo_tributario_descricao: 'DEFENSIVOS AGRICOLAS',
    }

    const resExato = executarCalculoSimulador({
      produto: produtoComGrTrib,
      ufOrigem: 'SP',
      ufDestino: 'MT',
      quantidade: 10,
      precoUnitario: 100,
      moeda: 'BRL',
      regraIcms: regraExata,
    })

    expect(resExato.temRegraIcms).toBe(true)
    expect(resExato.statusRegraIcms).toBe('exata_grtrib')
    expect(resExato.alertas.length).toBe(0)

    // Divergência de GrTrib: regra pertence a 002 enquanto produto é 001
    const regraOutroGrupo = {
      uf_origem: 'SP',
      uf_destino: 'MT',
      aliquota_icms: 7.0,
      reducao_base: 0,
      chave_origem_destino: 'SP_MT',
      grupo_tributario_codigo: '002',
    }

    const resDivergente = executarCalculoSimulador({
      produto: produtoComGrTrib,
      ufOrigem: 'SP',
      ufDestino: 'MT',
      quantidade: 10,
      precoUnitario: 100,
      moeda: 'BRL',
      regraIcms: regraOutroGrupo,
    })

    expect(resDivergente.temRegraIcms).toBe(true)
    expect(resDivergente.statusRegraIcms).toBe('fallback_uf')
    expect(resDivergente.alertas.some((a) => a.includes('Atenção: Produto é GrTrib'))).toBe(true)
  })
})
