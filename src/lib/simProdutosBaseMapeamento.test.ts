/**
 * src/lib/simProdutosBaseMapeamento.test.ts
 *
 * Testes unitários para as regras de extração e mapeamento canônico de sim_produtos_base:
 * 1. Exemplo do enunciado 007243:
 *    - B1_COD: 007243
 *    - B1_DESC: "SYNPROLE 480 SC 1X20L (IMP) SS"
 *    - BM_DESC: "DEFENSIVOS - FUNGICIDAS"
 *    - B1_POSIPI: "38089299"
 *    - Deve resultar em:
 *      * descricao: "SYNPROLE 480 SC 1X20L (IMP) SS" (NUNCA "DEFENSIVOS")
 *      * ncm: "3808.92.99"
 *      * embalagem: "1x20L"
 *      * origem: "Importado"
 *      * moeda: "USD"
 *      * unidade: "L"
 *      * tipo_produto: "Produto Formulado Comercial"
 *
 * 2. Exemplo 007221 com fabricante agenciado:
 *    - B1_COD: 007221
 *    - B1_DESC: "FFALM 10 15 15 - MOSAIC (AGENCIADO)"
 *    - BM_DESC: "FERTILIZANTES GRANULADOS"
 *    - B1_POSIPI: "31052000"
 *    - Deve extrair:
 *      * fabricante: "MOSAIC"
 *      * tipo_produto: "Fertilizante Mineral / Organomineral"
 *      * ncm: "3105.20.00"
 *      * origem: "Nacional"
 *
 * 3. Exemplo 002203 com embalagem direta:
 *    - B1_COD: 002203
 *    - B1_DESC: "AGRICOIL PREMIUM PURO 200L (AMOSTRA)"
 *    - BM_DESC: "OLEO MINERAL"
 *    - B1_POSIPI: "27101931"
 *    - Deve extrair:
 *      * embalagem: "200L"
 *      * ncm: "2710.19.31"
 *      * tipo_produto: "Adjuvante / Espalhante Adesivo"
 *
 * 4. Padrões de embalagem diversos:
 *    - "4X5L", "20KG", "500ML", "200L", "1X20L"
 *
 * 5. Normalização de NCM com 8 dígitos ou menos
 *
 * 6. Preservação de ROUNDUP WG (MAPA 002094) exclusiva com NCM 3808.93.24
 */

import { describe, it, expect } from 'vitest'
import {
  formatarNcmCanonico,
  extrairEmbalagemDescricao,
  extrairFabricanteAgenciado,
  derivarOrigemProduto,
  normalizarUnidadeProduto,
  derivarTipoProdutoCanonico,
  mapearLinhaSimProdutoBase,
} from './simProdutosBaseMapeamento'

describe('Mapeamento Canônico de Produtos Base (sim_produtos_base)', () => {
  it('1. Deve mapear exatamente o registro 007243 do enunciado (SYNPROLE 480 SC 1X20L (IMP) SS)', () => {
    const rawRow = {
      B1_COD: '007243',
      B1_DESC: 'SYNPROLE 480 SC 1X20L (IMP) SS',
      B1_GRUPO: '0102',
      B1_POSIPI: '38089299',
      B1_GRTRIB2: '001',
      'DESCRIÇÃO GRUPO TRIBUTARIO': 'DEFENSIVO - ORIGEM 0,4,5,6,7 (NCM 3808)',
      SEGMENTO: 'CROP',
      COMISSAO_PADRAO: '0.015',
      BM_DESC: 'DEFENSIVOS - FUNGICIDAS',
      BUSCA_PRODUTO: '007243 - SYNPROLE 480 SC 1X20L (IMP) SS',
    }

    const res = mapearLinhaSimProdutoBase(rawRow, 'DEFENSIVOS')

    // 1. Descrição deve ser B1_DESC e NUNCA BM_DESC
    expect(res.descricao).toBe('SYNPROLE 480 SC 1X20L (IMP) SS')
    expect(res.descricao).not.toBe('DEFENSIVOS')

    // 2. NCM canônico
    expect(res.ncm).toBe('3808.92.99')

    // 3. Embalagem derivada (preferindo 1x20L sobre 480SC)
    expect(res.embalagem).toBe('1x20L')

    // 4. GrTrib mapeado a partir de B1_GRTRIB2
    expect(res.gr_trib).toBe('001')

    // 5. Origem derivada de (IMP)
    expect(res.origem).toBe('Importado')
    expect(res.moeda).toBe('USD')

    // 6. Unidade (líquido com embalagem em L -> 'L')
    expect(res.unidade).toBe('L')

    // 7. Código
    expect(res.codigo).toBe('007243')

    // 8. Tipo de produto
    expect(res.tipo_produto).toBe('Produto Formulado Comercial')

    // 9. Novos campos mapeados da planilha A–M
    expect(res.grupo_codigo).toBe('0102')
    expect(res.grupo_descricao).toBe('DEFENSIVOS - FUNGICIDAS')
    expect(res.descricao_grupo_tributario).toBe('DEFENSIVO - ORIGEM 0,4,5,6,7 (NCM 3808)')
    expect(res.segmento).toBe('CROP')
    expect(res.comissao_padrao).toBe(0.015)
  })

  it('2. Deve extrair fabricante e tipo fertilizante para o item 007221 (FFALM 10 15 15 - MOSAIC (AGENCIADO))', () => {
    const rawRow = {
      B1_COD: '007221',
      B1_DESC: 'FFALM 10 15 15 - MOSAIC (AGENCIADO)',
      B1_GRUPO: '0213',
      B1_POSIPI: '31052000',
      B1_GRTRIB2: '002',
      'DESCRIÇÃO GRUPO TRIBUTARIO': 'FERTILIZANTES',
      SEGMENTO: 'ESSENTIALS',
      COMISSAO_PADRAO: '0.03',
      BM_DESC: 'FERTILIZANTES GRANULADOS',
    }

    const res = mapearLinhaSimProdutoBase(rawRow, 'FERTILIZANTES')

    expect(res.descricao).toBe('FFALM 10 15 15 - MOSAIC (AGENCIADO)')
    expect(res.fabricante).toBe('MOSAIC')
    expect(res.ncm).toBe('3105.20.00')
    expect(res.tipo_produto).toBe('Fertilizante Mineral / Organomineral')
    expect(res.origem).toBe('Nacional')
    expect(res.moeda).toBe('BRL')
    expect(res.gr_trib).toBe('002')
    // Item 4 do enunciado: fertilizantes granulados/sólidos devem derivar unidade "KG" (não "L")
    expect(res.unidade).toBe('KG')
    expect(res.grupo_codigo).toBe('0213')
    expect(res.grupo_descricao).toBe('FERTILIZANTES GRANULADOS')
    expect(res.descricao_grupo_tributario).toBe('FERTILIZANTES')
    expect(res.segmento).toBe('ESSENTIALS')
    expect(res.comissao_padrao).toBe(0.03)
  })

  it('3. Deve extrair embalagem de 200L e classificar adjuvante para 002203 (AGRICOIL PREMIUM PURO 200L)', () => {
    const rawRow = {
      B1_COD: '002203',
      B1_DESC: 'AGRICOIL PREMIUM PURO 200L (AMOSTRA)',
      B1_GRUPO: '0210',
      B1_POSIPI: '27101931',
      B1_GRTRIB2: '004',
      'DESCRIÇÃO GRUPO TRIBUTARIO': 'TRIBUTADOS',
      SEGMENTO: 'ESSENTIALS',
      COMISSAO_PADRAO: '0.025',
      BM_DESC: 'OLEO MINERAL',
    }

    const res = mapearLinhaSimProdutoBase(rawRow, 'TRIBUTADOS')

    expect(res.descricao).toBe('AGRICOIL PREMIUM PURO 200L (AMOSTRA)')
    expect(res.embalagem).toBe('200L')
    expect(res.ncm).toBe('2710.19.31')
    expect(res.tipo_produto).toBe('Adjuvante / Espalhante Adesivo')
    expect(res.unidade).toBe('L')
    expect(res.grupo_codigo).toBe('0210')
    expect(res.grupo_descricao).toBe('OLEO MINERAL')
    expect(res.descricao_grupo_tributario).toBe('TRIBUTADOS')
    expect(res.segmento).toBe('ESSENTIALS')
    expect(res.comissao_padrao).toBe(0.025)
  })

  it('10. Anti-contaminação: X5 ou coluna de origem trazendo descrição fiscal não deve contaminar origem nem moeda em produto (IMP)', () => {
    const rawRowContaminado = {
      B1_COD: '007243',
      B1_DESC: 'SYNPROLE 480 SC 1X20L (IMP) SS',
      X5_TABELA: 'DEFENSIVO - ORIGEM 0,4,5,6,7 (NCM 3808)',
      origem: 'DEFENSIVO - ORIGEM 0,4,5,6,7 (NCM 3808)',
      'DESCRIÇÃO GRUPO TRIBUTARIO': 'DEFENSIVO - ORIGEM 0,4,5,6,7 (NCM 3808)',
    }

    const res = mapearLinhaSimProdutoBase(rawRowContaminado)
    // Mesmo que X5_TABELA e 'origem' venham contaminados com texto descritivo fiscal,
    // a procedência deve ser 'Importado' por causa do sufixo (IMP), e moeda 'USD'.
    expect(res.origem).toBe('Importado')
    expect(res.moeda).toBe('USD')
    expect(res.descricao_grupo_tributario).toBe('DEFENSIVO - ORIGEM 0,4,5,6,7 (NCM 3808)')
  })

  it('11. Anti-contaminação: X5 com descrição fiscal em produto nacional deve resultar em Nacional e BRL', () => {
    const rawRowContaminadoNacional = {
      B1_COD: '007221',
      B1_DESC: 'FFALM 10 15 15 - MOSAIC (AGENCIADO)',
      X5_TABELA: 'FERTILIZANTE - ORIGEM 0,4,5,6,7 (NCM 31)',
      origem: 'FERTILIZANTE - ORIGEM 0,4,5,6,7 (NCM 31)',
    }

    const res = mapearLinhaSimProdutoBase(rawRowContaminadoNacional)
    expect(res.origem).toBe('Nacional')
    expect(res.moeda).toBe('BRL')
  })

  it('4. Deve extrair múltiplos padrões de embalagem preferindo quantidade×conteúdo e não formulação', () => {
    // SYNPROLE 480 SC 1X20L -> deve capturar 1x20L e NÃO 480SC
    expect(extrairEmbalagemDescricao('SYNPROLE 480 SC 1X20L (IMP) SS')).toBe('1x20L')
    expect(extrairEmbalagemDescricao('ASLAN SL 4X5L (IMP)')).toBe('4x5L')
    expect(extrairEmbalagemDescricao('FERTILIZANTE NPK 20KG SACO')).toBe('20KG')
    expect(extrairEmbalagemDescricao('INSETICIDA CONCENTRADO 500ML')).toBe('500ML')
    expect(extrairEmbalagemDescricao('TAMBOR 200L')).toBe('200L')
    expect(extrairEmbalagemDescricao('PRODUTO A GRANEL SEM EMBALAGEM')).toBe('')
    expect(extrairEmbalagemDescricao('DEFENSIVO 360 CS 12X1L')).toBe('12x1L')
  })

  it('8. Deve validar coerção de preco_base_sugerido quando presente ou 0 quando ausente', () => {
    const rowComPreco = {
      B1_COD: 'TEST-01',
      B1_DESC: 'PRODUTO TESTE 20L',
      B1_PRV1: '125,50',
      B1_GRTRIB2: '003',
    }
    const resComPreco = mapearLinhaSimProdutoBase(rowComPreco)
    expect(resComPreco.preco_base_sugerido).toBe(125.5)
    expect(resComPreco.gr_trib).toBe('003')

    const rowSemPreco = {
      B1_COD: 'TEST-02',
      B1_DESC: 'PRODUTO TESTE SEM PRECO 20L',
      B1_GRTRIB2: '001',
    }
    const resSemPreco = mapearLinhaSimProdutoBase(rowSemPreco)
    expect(resSemPreco.preco_base_sugerido).toBe(0)
  })

  it('9. Deve garantir integridade de ROUNDUP WG (MAPA 002094) = 3808.93.24 e ROUNDUP ORIGINAL MAIS = 3808.93.29', () => {
    expect(formatarNcmCanonico('38089324')).toBe('3808.93.24')
    expect(formatarNcmCanonico('38089329')).toBe('3808.93.29')
  })

  it('5. Deve formatar NCMs canônicos corretamente', () => {
    expect(formatarNcmCanonico('38089299')).toBe('3808.92.99')
    expect(formatarNcmCanonico('31052000')).toBe('3105.20.00')
    expect(formatarNcmCanonico('27101931')).toBe('2710.19.31')
    expect(formatarNcmCanonico('38089324')).toBe('3808.93.24')
    expect(formatarNcmCanonico('')).toBe('')
    expect(formatarNcmCanonico(null)).toBe('')
  })

  it('6. Deve derivar origem Importado vs Nacional a partir de sufixos e colunas', () => {
    expect(derivarOrigemProduto('', 'ASLAN SL 4X5L (IMP)', '')).toBe('Importado')
    expect(derivarOrigemProduto('', 'SYNPROLE 480 SC 1X20L (IMP) SS', '')).toBe('Importado')
    expect(derivarOrigemProduto('IMPORTADO', 'HERBICIDA NACIONAL', '')).toBe('Importado')
    expect(derivarOrigemProduto('NACIONAL', 'HERBICIDA NORMAL', '')).toBe('Nacional')
    expect(derivarOrigemProduto('', 'ROUNDUP ORIGINAL MAIS 20L', '')).toBe('Nacional')
  })

  it('7. Deve extrair fabricante de agenciados de diferentes formas', () => {
    expect(extrairFabricanteAgenciado('FFALM 10 15 15 - MOSAIC (AGENCIADO)')).toBe('MOSAIC')
    expect(extrairFabricanteAgenciado('UREIA AGRICOLA - YARA (AGENCIADO)')).toBe('YARA')
    expect(extrairFabricanteAgenciado('KCL GRANULADO – COMPASS MINERALS (AGENC)')).toBe(
      'COMPASS MINERALS',
    )
    expect(extrairFabricanteAgenciado('SYNPROLE 480 SC 1X20L (IMP) SS')).toBe('')
  })
})
