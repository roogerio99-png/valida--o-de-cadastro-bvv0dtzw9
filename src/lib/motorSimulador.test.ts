import { describe, it, expect } from 'vitest'
import {
  executarCalculoSimulador,
  deduzirCapacidadeEmbalagem,
  ProdutoBaseSimulador,
  RegraIcmsSimulador,
} from './motorSimulador'

describe('Motor Simulador Comercial - Paridade Gabarito Excel', () => {
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
    preco_base_sugerido: 48.5,
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
    expect(deduzirCapacidadeEmbalagem('Saco 20 kg')).toBe(20)
    expect(deduzirCapacidadeEmbalagem('Bombona 20 L')).toBe(20)
    expect(deduzirCapacidadeEmbalagem('Tambor 200 L')).toBe(200)
  })

  it('deve calcular volume total e quantidade de embalagens com base na capacidade', () => {
    const res = executarCalculoSimulador({
      produto: produtoDemo,
      ufOrigem: 'SP',
      ufDestino: 'MT',
      quantidade: 1000,
      volumePorEmbalagem: 20,
      precoUnitario: 50,
      regraIcms: regraIcmsDemo,
      modalidadeFrete: 'CIF',
      frete: 2000,
    })

    expect(res.volumeTotal).toBe(1000)
    expect(res.qtdEmbalagens).toBe(50)
    expect(res.valorMercadoriaReais).toBe(50000)
  })

  it('deve incluir frete na base de cálculo de ICMS quando modalidade for CIF', () => {
    const resCif = executarCalculoSimulador({
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
    expect(resCif.icms.baseCalculoBruta).toBe(52000)
    // Redução 60% -> Base Efetiva = 52.000 * 0.4 = 20.800
    expect(resCif.icms.baseCalculoEfetiva).toBeCloseTo(20800, 2)
    // Débito = 20.800 * 7% = 1.456
    expect(resCif.icms.debitoIcms).toBeCloseTo(1456, 2)
  })

  it('deve excluir frete da base de cálculo de ICMS quando modalidade for FOB', () => {
    const resFob = executarCalculoSimulador({
      produto: produtoDemo,
      ufOrigem: 'SP',
      ufDestino: 'MT',
      quantidade: 1000,
      precoUnitario: 50,
      regraIcms: regraIcmsDemo,
      modalidadeFrete: 'FOB',
      frete: 2000,
      seguro: 0,
      outrasDespesas: 0,
    })

    // Base FOB = 50.000 (frete não entra na base do ICMS)
    expect(resFob.icms.baseCalculoBruta).toBe(50000)
    expect(resFob.icms.baseCalculoEfetiva).toBeCloseTo(20000, 2)
    expect(resFob.icms.debitoIcms).toBeCloseTo(1400, 2)
  })

  it('deve aplicar exclusão do ICMS destacado da base de cálculo do PIS/COFINS (Tema 69 STF)', () => {
    const res = executarCalculoSimulador({
      produto: produtoDemo,
      ufOrigem: 'SP',
      ufDestino: 'MT',
      quantidade: 1000,
      precoUnitario: 50,
      regraIcms: regraIcmsDemo,
      modalidadeFrete: 'CIF',
      frete: 0,
      seguro: 0,
      outrasDespesas: 0,
      considerarReoneracao2026: true,
    })

    // Faturamento = 50.000
    // ICMS Débito (base 20.000 * 7%) = 1.400
    // Base PIS/COFINS = 50.000 - 1.400 = 48.600
    expect(res.pis.baseCalculo).toBeCloseTo(48600, 2)
    expect(res.cofins.baseCalculo).toBeCloseTo(48600, 2)
    expect(res.pis.valorImposto).toBeCloseTo(48600 * 0.00165, 2)
    expect(res.cofins.valorImposto).toBeCloseTo(48600 * 0.0076, 2)
  })

  it('deve calcular IBS/CBS com redução de 60% e gerar DRE com linhas exigidas no gabarito', () => {
    const res = executarCalculoSimulador({
      produto: produtoDemo,
      ufOrigem: 'SP',
      ufDestino: 'MT',
      quantidade: 1000,
      precoUnitario: 50,
      regraIcms: regraIcmsDemo,
      modalidadeFrete: 'CIF',
      frete: 1000,
      seguro: 200,
      outrasDespesas: 100,
      comissaoPerc: 3,
      custoFinanceiroPerc: 2,
      margemComercialPerc: 15,
      usarAliquotaReformaPlena: true,
    })

    // IBS/CBS pleno: CBS 8.8% e IBS 17.7% reduzidos em 60%
    expect(res.cbs.reducaoBasePerc).toBe(60)
    expect(res.ibs.reducaoBasePerc).toBe(60)
    expect(res.cbs.aliquotaEfetiva).toBeCloseTo(3.52, 2)
    expect(res.ibs.aliquotaEfetiva).toBeCloseTo(7.08, 2)

    // DRE deve conter as linhas essenciais
    const descricoesDre = res.dre.map((d) => d.descricao)
    expect(descricoesDre).toContain('Faturamento Bruto')
    expect(descricoesDre).toContain('(-) ICMS Efetivo a Recolher')
    expect(descricoesDre).toContain('(-) PIS Agro')
    expect(descricoesDre).toContain('(-) COFINS Agro')
    expect(descricoesDre).toContain('(-) IBS (Reforma LC 214/2025)')
    expect(descricoesDre).toContain('(-) CBS (Reforma LC 214/2025)')
    expect(descricoesDre).toContain('(=) Receita Líquida')
    expect(descricoesDre).toContain('(-) CMV / Custo da Mercadoria')
    expect(descricoesDre).toContain('(=) MARGEM DE CONTRIBUIÇÃO')

    // Cartões executivos
    expect(res.receitaBruta).toBeGreaterThan(0)
    expect(res.cargaTributariaEfetivaPerc).toBeGreaterThan(0)
    expect(res.precoMinimoBreakEven).toBeGreaterThan(0)
    expect(res.precoVendaSugerido).toBeGreaterThan(res.precoMinimoBreakEven)
  })

  it('deve converter dólar para real com PTAX manual em produto importado', () => {
    const produtoImp: ProdutoBaseSimulador = {
      descricao: 'GLIFOSATO TÉCNICO (IMP)',
      moeda: 'USD',
      origem: 'Importado',
      preco_base_sugerido: 10,
    }

    const res = executarCalculoSimulador({
      produto: produtoImp,
      ufOrigem: 'SP',
      ufDestino: 'SP',
      quantidade: 500,
      precoUnitario: 10,
      moeda: 'USD',
      ptaxManual: 6.0,
      modalidadeFrete: 'FOB',
    })

    expect(res.isImportado).toBe(true)
    expect(res.ptaxAplicada).toBe(6.0)
    expect(res.valorUnitarioReais).toBe(60.0) // 10 * 6.0
    expect(res.valorMercadoriaReais).toBe(30000) // 500 * 60
  })
})
