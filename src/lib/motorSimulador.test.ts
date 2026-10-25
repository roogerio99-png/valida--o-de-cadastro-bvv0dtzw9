import { describe, it, expect } from 'vitest'
import {
  executarCalculoSimulador,
  deduzirCapacidadeEmbalagem,
  calcularDataVencimento,
  calcularTaxaJurosProporcional,
  formatarDataIso,
  ProdutoBaseSimulador,
  RegraIcmsSimulador,
} from './motorSimulador'

describe('Motor Simulador Comercial - Paridade Gabarito Excel & Segregação Compra/Venda', () => {
  const produtoDemo: ProdutoBaseSimulador = {
    codigo: '002094',
    descricao: 'ROUNDUP WG - Saco 20 kg (Glifosato 720 g/kg)',
    ncm: '3808.93.24',
    unidade: 'KG',
    tipo_produto: 'Herbicida Granulado Dispersível',
    origem: 'Nacional',
    embalagem: 'Saco 20 kg',
    principio_ativo: 'Glifosato',
    fabricante: 'Bayer S.A.',
    moeda: 'BRL',
    preco_base_sugerido: 40.0,
    gr_trib: 'DEF_AGRO',
    comissao_padrao: 0.025,
  }

  const regraIcmsDemo: RegraIcmsSimulador = {
    uf_origem: 'SP',
    uf_destino: 'MT',
    aliquota_icms: 7,
    reducao_base: 60,
    aliquota_efetiva: 2.8,
    diferimento: false,
    percentual_diferimento: 0,
    fundamentacao_legal: 'Convênio ICMS 100/97 (SP -> MT)',
    chave_origem_destino: 'SP_MT',
    grupo_tributario_codigo: 'DEF_AGRO',
    tipo_desonerado: 'Não Calcula',
    regra_credito_entrada: 'Crédito Proporcional',
  }

  it('deve deduzir capacidade de embalagens corretamente', () => {
    expect(deduzirCapacidadeEmbalagem('4X5L')).toBe(20)
    expect(deduzirCapacidadeEmbalagem('2X10L')).toBe(20)
    expect(deduzirCapacidadeEmbalagem('12X1L')).toBe(12)
    expect(deduzirCapacidadeEmbalagem('1X20L')).toBe(20)
    expect(deduzirCapacidadeEmbalagem('Saco 20 kg')).toBe(20)
    expect(deduzirCapacidadeEmbalagem('Bombona 20 L')).toBe(20)
    expect(deduzirCapacidadeEmbalagem('Tambor 200 L')).toBe(200)
  })

  it('deve formatar data ISO e calcular data de vencimento a partir do prazo em dias corridos', () => {
    expect(formatarDataIso('2026-03-01')).toBe('2026-03-01')
    expect(calcularDataVencimento('2026-03-01', 30)).toBe('2026-03-31')
    expect(calcularDataVencimento('2026-03-01', 60)).toBe('2026-04-30')
    expect(calcularDataVencimento('2026-03-01', 90)).toBe('2026-05-30')
  })

  it('deve calcular taxa de juros proporcional ao prazo (pró-rata mês comercial 30 dias)', () => {
    // 2.0% a.m. em 30 dias = 2.0%
    const juros30d = calcularTaxaJurosProporcional(2.0, 30)
    expect(juros30d.taxaEfetivaPerc).toBeCloseTo(2.0, 4)
    expect(juros30d.jurosCalculadosSobreValor(10000)).toBeCloseTo(200, 2)

    // 2.0% a.m. em 60 dias = 4.0%
    const juros60d = calcularTaxaJurosProporcional(2.0, 60)
    expect(juros60d.taxaEfetivaPerc).toBeCloseTo(4.0, 4)
    expect(juros60d.jurosCalculadosSobreValor(10000)).toBeCloseTo(400, 2)

    // 1.5% a.m. em 45 dias = 2.25%
    const juros45d = calcularTaxaJurosProporcional(1.5, 45)
    expect(juros45d.taxaEfetivaPerc).toBeCloseTo(2.25, 4)
    expect(juros45d.jurosCalculadosSobreValor(10000)).toBeCloseTo(225, 2)
  })

  it('deve segregar operação de COMPRA e VENDA com datas distintas, prazos e juros calculados', () => {
    const res = executarCalculoSimulador({
      produto: produtoDemo,
      quantidade: 1000,
      volumePorEmbalagem: 20,
      compra: {
        dataOperacao: '2026-03-01',
        prazoDias: 30,
        precoUnitario: 40.0, // R$ 40/kg -> R$ 40.000 mercadoria
        modalidadeFrete: 'FOB',
        frete: 1000, // Despesa de frete da compra
        seguro: 200,
        outrasDespesas: 100,
        taxaJurosMensalPerc: 1.5, // 1.5% a.m. em 30 dias = 1.5%
        aliquotaIcmsCreditoManual: 4.0, // Crédito 4%
      },
      venda: {
        dataOperacao: '2026-03-15', // Venda 14 dias após a compra
        prazoDias: 60,
        precoUnitario: 60.0, // R$ 60/kg -> R$ 60.000 mercadoria
        ufOrigem: 'SP',
        ufDestino: 'MT',
        regraIcms: regraIcmsDemo,
        modalidadeFrete: 'CIF',
        frete: 2000,
        seguro: 300,
        outrasDespesas: 200,
        comissaoPerc: 2.5,
        taxaJurosMensalPerc: 2.0, // 2.0% a.m. em 60 dias = 4.0%
        considerarReoneracao2026: true,
      },
    })

    // 1. Verificação do Bloco de Compra
    expect(res.compra.dataOperacao).toBe('2026-03-01')
    expect(res.compra.prazoDias).toBe(30)
    expect(res.compra.dataVencimento).toBe('2026-03-31')
    expect(res.compra.valorMercadoriaReais).toBe(40000)
    expect(res.compra.totalDespesasAcessorias).toBe(1300) // 1000 + 200 + 100
    expect(res.compra.custoAquisicaoMercadoria).toBe(41300)
    // Juros compra: 1.5% sobre 41.300 = 619.50
    expect(res.compra.taxaJurosEfetivaPerc).toBeCloseTo(1.5, 2)
    expect(res.compra.jurosValor).toBeCloseTo(619.5, 2)
    expect(res.compra.custoTotalComJuros).toBeCloseTo(41300 + 619.5, 2)

    // 2. Verificação do Bloco de Venda
    expect(res.venda.dataOperacao).toBe('2026-03-15')
    expect(res.venda.prazoDias).toBe(60)
    expect(res.venda.dataVencimento).toBe('2026-05-14')
    expect(res.venda.valorMercadoriaReais).toBe(60000)
    // Faturamento bruto total da venda (inclui frete CIF 2000 + seguro 300 + outros 200) = 62.500
    expect(res.venda.faturamentoBrutoTotal).toBe(62500)
    // Juros venda: 2.0% a.m. / 30 * 60 = 4.0% sobre faturamento 62.500 = 2.500
    expect(res.venda.taxaJurosEfetivaPerc).toBeCloseTo(4.0, 2)
    expect(res.venda.jurosValor).toBeCloseTo(2500, 2)
    // Comissão 2.5% sobre 62.500 = 1.562,50
    expect(res.venda.comissaoValor).toBeCloseTo(1562.5, 2)

    // 3. Verificação do Resultado da Operação Consolidado
    expect(res.resultadoOperacao.resultadoFinanceiroLiquido).toBeCloseTo(
      res.venda.jurosValor - res.compra.jurosValor,
      2,
    )
    expect(res.resultadoOperacao.resultadoFinalOperacao).toBeGreaterThan(0)
    expect(res.resultadoOperacao.margemSobreReceitaBrutaPerc).toBeGreaterThan(0)

    // A memória de cálculo deve conter os 3 blocos segregados
    expect(res.memoriaCalculo.some((m) => m.includes('1. OPERAÇÃO DE COMPRA'))).toBe(true)
    expect(res.memoriaCalculo.some((m) => m.includes('2. OPERAÇÃO DE VENDA'))).toBe(true)
    expect(res.memoriaCalculo.some((m) => m.includes('3. RESULTADO CONSOLIDADO'))).toBe(true)
  })

  it('deve manter paridade retrocompatível com chamadas sem o objeto segregado compra/venda', () => {
    const res = executarCalculoSimulador({
      produto: produtoDemo,
      ufOrigem: 'SP',
      ufDestino: 'MT',
      quantidade: 1000,
      precoUnitario: 50,
      regraIcms: regraIcmsDemo,
      modalidadeFrete: 'CIF',
      frete: 2000,
      seguro: 0,
      outrasDespesas: 0,
    })

    // Base CIF = 50.000 + 2.000 = 52.000
    expect(res.icms.baseCalculoBruta).toBe(52000)
    expect(res.icms.baseCalculoEfetiva).toBeCloseTo(20800, 2)
    expect(res.icms.debitoIcms).toBeCloseTo(1456, 2)
    // Estruturas segregadas devem existir mesmo na chamada legada
    expect(res.compra).toBeDefined()
    expect(res.venda).toBeDefined()
    expect(res.resultadoOperacao).toBeDefined()
  })

  it('deve calcular corretamente simulação SP->MT com produto SYNPROLE 1X20L (IMP)', () => {
    const produtoSynprole: ProdutoBaseSimulador = {
      codigo: '007243',
      descricao: 'SYNPROLE 480 SC 1X20L (IMP) SS',
      ncm: '3808.92.99',
      unidade: 'L',
      embalagem: '1X20L',
      moeda: 'USD',
      origem: 'Importado',
      gr_trib: '001',
      comissao_padrao: 0.015,
    }

    const regraIcmsSynprole: RegraIcmsSimulador = {
      uf_origem: 'SP',
      uf_destino: 'MT',
      aliquota_icms: 2.8,
      reducao_base: 0,
      aliquota_efetiva: 2.8,
      chave_origem_destino: 'SP_MT_001',
      grupo_tributario_codigo: '001',
    }

    const res = executarCalculoSimulador({
      produto: produtoSynprole,
      quantidade: 1000,
      volumePorEmbalagem: 20,
      compra: {
        dataOperacao: '2026-03-01',
        prazoDias: 30,
        precoUnitario: 8.5, // US$ 8.50/L
        moeda: 'USD',
        ptaxManual: 5.75, // R$ 48.875/L
        modalidadeFrete: 'FOB',
        frete: 1200,
        taxaJurosMensalPerc: 1.2,
      },
      venda: {
        dataOperacao: '2026-03-20',
        prazoDias: 60,
        precoUnitario: 75.0, // R$ 75.00/L
        moeda: 'BRL',
        ufOrigem: 'SP',
        ufDestino: 'MT',
        regraIcms: regraIcmsSynprole,
        modalidadeFrete: 'CIF',
        frete: 2500,
        comissaoPerc: 1.5,
        taxaJurosMensalPerc: 1.8,
      },
    })

    expect(res.qtdEmbalagens).toBe(50) // 1000L / 20L
    expect(res.compra.precoUnitarioReais).toBeCloseTo(8.5 * 5.75, 2)
    expect(res.compra.valorMercadoriaReais).toBeCloseTo(1000 * 8.5 * 5.75, 2)
    expect(res.venda.valorMercadoriaReais).toBe(75000)
    // ICMS da venda: alíquota 2.8% sobre base CIF (75.000 + 2.500 = 77.500)
    expect(res.venda.icms.debitoIcms).toBeCloseTo(77500 * 0.028, 2)
    // Vencimentos calculados
    expect(res.compra.dataVencimento).toBe('2026-03-31')
    expect(res.venda.dataVencimento).toBe('2026-05-19')
    // Resultado da operação positivo e segregado
    expect(res.resultadoOperacao.resultadoFinalOperacao).toBeGreaterThan(0)
    expect(res.resultadoOperacao.resultadoFinanceiroLiquido).toBeDefined()
  })
})
