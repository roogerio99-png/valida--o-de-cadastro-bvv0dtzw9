import { describe, it, expect } from 'vitest'
import { determinarEnquadramentoTributario, normalizarNcmDigitos } from './enquadramentoTributario'

describe('Módulo de Enquadramento Tributário Canônico', () => {
  it('normaliza corretamente NCMs com pontos ou traços', () => {
    expect(normalizarNcmDigitos('3808.93.24')).toBe('38089324')
    expect(normalizarNcmDigitos('3105-20-00')).toBe('31052000')
    expect(normalizarNcmDigitos(null)).toBe('')
    expect(normalizarNcmDigitos(undefined)).toBe('')
  })

  it('enquadra defensivo agrícola (NCM 3808) com citações exatas de Lei 10.925/04, LC 224/25 e LC 214/25', () => {
    const res = determinarEnquadramentoTributario({
      ncm: '3808.93.24',
      tipo_produto: 'Produto Formulado Comercial',
      principio_ativo: 'Glifosato',
      macro_grupo: 'Defensivos',
      registro_mapa: 'Nº 002094',
    })

    expect(res.qualificadoAgro).toBe(true)
    expect(res.categoriaProduto).toContain('Defensivo Agropecuário')

    // PIS
    expect(res.pis.tributo).toBe('PIS')
    expect(res.pis.citacao.norma).toContain('Lei nº 10.925/2004')
    expect(res.pis.citacao.artigo).toBe('Art. 1º')
    expect(res.pis.citacao.inciso).toBe('Inciso II')
    expect(res.pis.citacao.paragrafo).toContain('LC nº 224/2025')
    expect(res.pis.citacao.paragrafo).toContain('Art. 4º')
    expect(res.pis.citacao.textoArtigo).toContain('38.08 da TIPI')
    expect(res.pis.resumoClaro).toContain('alíquota zero até 31/03/2026')
    expect(res.pis.resumoClaro).toContain('LC nº 224/2025')

    // COFINS
    expect(res.cofins.tributo).toBe('COFINS')
    expect(res.cofins.citacao.artigo).toBe('Art. 1º')
    expect(res.cofins.citacao.inciso).toBe('Inciso II')
    expect(res.cofins.citacao.paragrafo).toContain('Art. 4º')
    expect(res.cofins.resumoClaro).toContain('0,925% (Lucro Real)')

    // IBS
    expect(res.ibs.tributo).toBe('IBS')
    expect(res.ibs.citacao.artigo).toContain('Art. 156-A da CF/88')
    expect(res.ibs.citacao.artigo).toContain('Art. 138 da LC nº 214/2025')
    expect(res.ibs.citacao.paragrafo).toContain('Anexo IX')
    expect(res.ibs.aliquotaTexto).toContain('Redução de 60%')
    expect(res.ibs.resumoClaro).toContain('diferimento')

    // CBS
    expect(res.cbs.tributo).toBe('CBS')
    expect(res.cbs.citacao.artigo).toContain('Art. 195, caput, inciso V')
    expect(res.cbs.citacao.artigo).toContain('Art. 138 da LC nº 214/2025')
    expect(res.cbs.citacao.paragrafo).toContain('Anexo IX')
    expect(res.cbs.resumoClaro).toContain('redução de 60%')
  })

  it('enquadra fertilizante/adubo (NCM Capítulo 31) citando Art. 1º, Inciso I da Lei 10.925/2004', () => {
    const res = determinarEnquadramentoTributario({
      ncm: '3105.20.00',
      tipo_produto: 'Fertilizante Mineral / Organomineral',
      principio_ativo: 'NPK 04-14-08',
      macro_grupo: 'Fertilizantes',
    })

    expect(res.qualificadoAgro).toBe(true)
    expect(res.categoriaProduto).toContain('Adubo ou Fertilizante')
    expect(res.pis.citacao.artigo).toBe('Art. 1º')
    expect(res.pis.citacao.inciso).toBe('Inciso I')
    expect(res.pis.citacao.textoArtigo).toContain('Capítulo 31')
    expect(res.cofins.citacao.inciso).toBe('Inciso I')
    expect(res.ibs.citacao.artigo).toContain('Art. 138 da LC nº 214/2025')
    expect(res.cbs.citacao.artigo).toContain('Art. 138 da LC nº 214/2025')
  })

  it('enquadra corretivo de solo (NCM Capítulo 25) citando Art. 1º, Inciso IV da Lei 10.925/2004', () => {
    const res = determinarEnquadramentoTributario({
      ncm: '2521.00.00',
      tipo_produto: 'Corretivo / Condicionador de Solo',
      principio_ativo: 'Calcário Agrícola',
      macro_grupo: 'Corretivos',
    })

    expect(res.qualificadoAgro).toBe(true)
    expect(res.categoriaProduto).toContain('Corretivo de Solo Mineral')
    expect(res.pis.citacao.inciso).toBe('Inciso IV')
    expect(res.cofins.citacao.inciso).toBe('Inciso IV')
    expect(res.pis.citacao.textoArtigo).toContain('Capítulo 25 da TIPI')
  })

  it('enquadra inoculante / biológico (NCM 3002.90.99) citando Art. 1º, Inciso VI da Lei 10.925/2004', () => {
    const res = determinarEnquadramentoTributario({
      ncm: '3002.90.99',
      tipo_produto: 'Inoculante / Biológico',
      principio_ativo: 'Bradyrhizobium japonicum',
    })

    expect(res.qualificadoAgro).toBe(true)
    expect(res.categoriaProduto).toContain('Inoculante Agrícola')
    expect(res.pis.citacao.inciso).toBe('Inciso VI')
    expect(res.cofins.citacao.inciso).toBe('Inciso VI')
  })

  it('enquadra semente certificada citando Art. 1º, Inciso III da Lei 10.925/2004', () => {
    const res = determinarEnquadramentoTributario({
      ncm: '1209.91.00',
      tipo_produto: 'Semente Certificada',
      principio_ativo: 'Semente Soja Tratada',
    })

    expect(res.qualificadoAgro).toBe(true)
    expect(res.categoriaProduto).toContain('Semente Certificada')
    expect(res.pis.citacao.inciso).toBe('Inciso III')
    expect(res.cofins.citacao.inciso).toBe('Inciso III')
  })

  it('sinaliza produto não agro ou tributado integralmente com as leis gerais', () => {
    const res = determinarEnquadramentoTributario({
      ncm: '8424.82.00', // Pulverizador mecânico
      tipo_produto: 'Outros Insumos Químicos e Reagentes',
      principio_ativo: 'Maquinário / Equipamento',
    })

    expect(res.qualificadoAgro).toBe(false)
    expect(res.pis.statusBeneficio).toBe('tributado')
    expect(res.pis.citacao.norma).toContain('Lei nº 10.637/2002')
    expect(res.cofins.citacao.norma).toContain('Lei nº 10.833/2003')
    expect(res.ibs.statusBeneficio).toBe('tributado')
    expect(res.ibs.citacao.artigo).toContain('Arts. 4º e 50')
  })

  it('sinaliza como a_confirmar se nenhum NCM for fornecido', () => {
    const res = determinarEnquadramentoTributario({
      ncm: '',
      tipo_produto: null,
      principio_ativo: null,
    })

    expect(res.qualificadoAgro).toBe(false)
    expect(res.pis.statusBeneficio).toBe('a_confirmar')
    expect(res.cofins.statusBeneficio).toBe('a_confirmar')
    expect(res.ibs.statusBeneficio).toBe('a_confirmar')
  })
})
