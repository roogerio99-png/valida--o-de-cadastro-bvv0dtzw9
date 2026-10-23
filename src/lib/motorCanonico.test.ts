import { describe, it, expect } from 'vitest'
import {
  executarMotorCanonicoFrontend,
  sanitizarRegistroMapa,
  verificarNotaSubpos2,
} from './motorCanonico'

describe('Testes de Conformidade do Motor Canônico (Especificação v2.4.0)', () => {
  it('T1: Insumo da Nota 2 em Pequena Embalagem (Bifentrina em frasco 250 mL)', () => {
    const res = executarMotorCanonicoFrontend({
      nome_completo: 'TALISMAN BIFENTRINA 250ML FRASCO',
      embalagem: 'FRASCO 250 ML',
      unidade: 'L',
      principio_ativo: 'BIFENTRINA 100 G/L',
      registro_mapa: 'Nº 001807',
    })

    // (T1) Bifentrina em frasco 250 mL → nota_subpos_2 SIM e ncm_faixa1 = 3808.61.00 (nunca 3808.91.99)
    expect(res.nota_subpos_2).toBe('SIM')
    expect(res.ncm_faixa1_ate_300g).toBe('3808.61.00')
    expect(res.ncm_faixa1_ate_300g).not.toBe('3808.91.99')
    expect(verificarNotaSubpos2('BIFENTRINA')).toBe(true)
  })

  it('T2: Fertilizante Composto em Pequeno Porte (Fertilizante NPK 5kg)', () => {
    const res = executarMotorCanonicoFrontend({
      nome_completo: 'FERTILIZANTE MINERAL NPK 04-14-08 5KG',
      tipo_produto: 'Fertilizante Mineral / Organomineral',
      embalagem: 'SACO 5 KG',
      unidade: 'KG',
      principio_ativo: 'UREIA, MAP, KCL (NPK 04-14-08)',
      registro_mapa: 'SP-00111-0006',
    })

    // (T2) Fertilizante NPK 5kg → ncm_faixa2 = 3105.10.00 e ncm_faixa4 = 3105.90.90
    expect(res.ncm_faixa2_300g_a_7_5kg).toBe('3105.10.00')
    expect(res.ncm_faixa4_acima_10kg).toBe('3105.90.90')
  })

  it('T3: Adjuvante / Óleo Mineral (Tributado Integralmente)', () => {
    const res = executarMotorCanonicoFrontend({
      nome_completo: 'ADJUVANTE ESPALHANTE ADESIVO OLEO MINERAL 20L',
      tipo_produto: 'Adjuvante / Espalhante Adesivo',
      embalagem: 'BOMBONA 20L',
      unidade: 'L',
      principio_ativo: 'OLEO MINERAL E SURFACTANTE',
      registro_mapa: 'ISENTO',
    })

    // (T3) Adjuvante → status "Tributado Integralmente", pós-Abr/26 Real 9,250%, CST 01/50
    expect(res.status_pis_cofins).toContain('Tributado Integralmente')
    expect(res.aliquota_pos_abr2026_real).toBe('9,250% (Alíquota Integral)')
    expect(res.cst_saida).toBe('CST 01')
    expect(res.cst_entrada).toBe('CST 50')
  })

  it('T4: Preservação de Zeros do Registro MAPA (315 -> Nº 0315)', () => {
    const formatado1 = sanitizarRegistroMapa('315')
    const formatado2 = sanitizarRegistroMapa('Nº 315')
    const formatado3 = sanitizarRegistroMapa(315 as unknown as string)

    // (T4) Registro 315 → "Nº 0315" (nunca inteiro/float)
    expect(formatado1).toBe('Nº 0315')
    expect(formatado2).toBe('Nº 0315')
    expect(formatado3).toBe('Nº 0315')
  })

  it('determina corretamente Fungicida e NCM 3808.92.99 para FOLICRON mesmo se inserido NCM 38089399', () => {
    const res = executarMotorCanonicoFrontend({
      nome_completo: 'FOLICRON 4X5L (IMP) RR',
      ncm: '3808.93.99', // NCM errada inserida (Herbicida)
      principio_ativo: 'CIPROCONAZOL 80 + PICOXISTROBINA 200',
      embalagem: '4X5L (5 L)',
      fabricante: 'Rainbow Defensivos',
    })

    expect(res.sub_grupo).toBe('Fungicida')
    expect(res.ncm_padrao).toBe('3808.92.99')
    expect(res.ncm_faixa2_300g_a_7_5kg).toBe('3808.92.99')
  })

  it('deduz FOLICRON (Ciproconazol + Picoxistrobina) canonicamente como Fungicida 3808.92.99', () => {
    const res = executarMotorCanonicoFrontend({
      nome_completo: 'FOLICRON',
      principio_ativo: 'CIPROCONAZOL + PICOXISTROBINA',
      embalagem: 'Bombona 20 L',
    })

    expect(res.tipo_produto).toBe('Produto Formulado Comercial')
    expect(res.sub_grupo).toBe('Fungicida')
    expect(res.ncm_padrao).toBe('3808.92.99')
    expect(res.ncm_faixa4_acima_10kg).toBe('3808.92.99')
  })

  it('quando nenhuma classe for identificada, marca Inconclusivo sem inventar Herbicida', () => {
    const res = executarMotorCanonicoFrontend({
      nome_completo: 'PRODUTO XYZ DESCONHECIDO',
      principio_ativo: 'MOLECULA TOTALMENTE INEDITA ABC',
      embalagem: 'Frasco 1 L',
    })

    expect(res.sub_grupo).toBe('Inconclusivo / Não Reconhecido')
    expect(res.ncm_padrao).toBe('3808.99.99')
  })

  it('T5: Classifica ROUNDUP WG canonicamente na NCM 3808.93.24 como Herbicida Formulado Comercial', () => {
    const res = executarMotorCanonicoFrontend({
      nome_completo: 'ROUNDUP WG',
      ncm: '3808.93.24',
      principio_ativo: 'Glifosato',
      embalagem: 'Saco 20 kg',
      registro_mapa: 'Nº 002094',
    })

    expect(res.tipo_produto).toBe('Produto Formulado Comercial')
    expect(res.sub_grupo).toBe('Herbicida')
    expect(res.ncm_padrao).toBe('3808.93.24')
    expect(res.ncm_faixa1_ate_300g).toBe('3808.93.24')
    expect(res.ncm_faixa2_300g_a_7_5kg).toBe('3808.93.24')
    expect(res.ncm_faixa3_7_5kg_a_10kg).toBe('3808.93.24')
    expect(res.ncm_faixa4_acima_10kg).toBe('3808.93.24')
    expect(res.ncm_especifica).toBe('3808.93.24')
  })

  it('T6: Não aplica 3808.93.24 a produtos que não são ROUNDUP WG (ex: fertilizantes ou outros defensivos)', () => {
    // Fertilizante 20 kg
    const fert20 = executarMotorCanonicoFrontend({
      nome_completo: 'Protioconazol Técnico Ouro Fino',
      principio_ativo: 'PROTIOCONAZOL',
      embalagem: 'Saco 20 kg',
      ncm: '3105.90.90',
      tipo_produto: 'Fertilizante Mineral / Organomineral',
    })
    expect(fert20.ncm_especifica).toBe('3105.90.90')

    // Fertilizante <= 10 kg
    const fert5 = executarMotorCanonicoFrontend({
      nome_completo: 'Adubo Especial',
      principio_ativo: 'NPK',
      embalagem: 'Saco 5 kg',
      ncm: '3105.90.90',
      tipo_produto: 'Fertilizante Mineral / Organomineral',
    })
    expect(fert5.ncm_especifica).toBe('3105.10.00')

    // Defensivo comum não-glifosato
    const def = executarMotorCanonicoFrontend({
      nome_completo: 'CARAVANA 806 SL',
      principio_ativo: '2,4-D',
      embalagem: 'Bombona 20 L',
      ncm: '3808.93.22',
      registro_mapa: 'Nº 19524',
    })
    expect(def.ncm_especifica).toBe('3808.93.22')
  })
})
