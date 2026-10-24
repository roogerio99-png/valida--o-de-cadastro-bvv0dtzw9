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
      BM_DESC: 'DEFENSIVOS - FUNGICIDAS',
      BUSCA_PRODUTO: '007243 - SYNPROLE 480 SC 1X20L (IMP) SS',
    }

    const res = mapearLinhaSimProdutoBase(rawRow, 'DEFENSIVOS')

    // 1. Descrição deve ser B1_DESC e NUNCA BM_DESC
    expect(res.descricao).toBe('SYNPROLE 480 SC 1X20L (IMP) SS')
    expect(res.descricao).not.toBe('DEFENSIVOS')

    // 2. NCM canônico
    expect(res.ncm).toBe('3808.92.99')

    // 3. Embalagem derivada
    expect(res.embalagem).toBe('1x20L')

    // 4. Origem derivada de (IMP)
    expect(res.origem).toBe('Importado')
    expect(res.moeda).toBe('USD')

    // 5. Unidade
    expect(res.unidade).toBe('L')

    // 6. Código
    expect(res.codigo).toBe('007243')

    // 7. Tipo de produto
    expect(res.tipo_produto).toBe('Produto Formulado Comercial')
  })

  it('2. Deve extrair fabricante e tipo fertilizante para o item 007221 (FFALM 10 15 15 - MOSAIC (AGENCIADO))', () => {
    const rawRow = {
      B1_COD: '007221',
      B1_DESC: 'FFALM 10 15 15 - MOSAIC (AGENCIADO)',
      B1_GRUPO: '0213',
      B1_POSIPI: '31052000',
      B1_GRTRIB2: '002',
      BM_DESC: 'FERTILIZANTES GRANULADOS',
    }

    const res = mapearLinhaSimProdutoBase(rawRow, 'FERTILIZANTES')

    expect(res.descricao).toBe('FFALM 10 15 15 - MOSAIC (AGENCIADO)')
    expect(res.fabricante).toBe('MOSAIC')
    expect(res.ncm).toBe('3105.20.00')
    expect(res.tipo_produto).toBe('Fertilizante Mineral / Organomineral')
    expect(res.origem).toBe('Nacional')
    expect(res.moeda).toBe('BRL')
  })

  it('3. Deve extrair embalagem de 200L e classificar adjuvante para 002203 (AGRICOIL PREMIUM PURO 200L)', () => {
    const rawRow = {
      B1_COD: '002203',
      B1_DESC: 'AGRICOIL PREMIUM PURO 200L (AMOSTRA)',
      B1_GRUPO: '0210',
      B1_POSIPI: '27101931',
      B1_GRTRIB2: '004',
      BM_DESC: 'OLEO MINERAL',
    }

    const res = mapearLinhaSimProdutoBase(rawRow, 'TRIBUTADOS')

    expect(res.descricao).toBe('AGRICOIL PREMIUM PURO 200L (AMOSTRA)')
    expect(res.embalagem).toBe('200L')
    expect(res.ncm).toBe('2710.19.31')
    expect(res.tipo_produto).toBe('Adjuvante / Espalhante Adesivo')
    expect(res.unidade).toBe('L')
  })

  it('4. Deve extrair múltiplos padrões de embalagem', () => {
    expect(extrairEmbalagemDescricao('SYNPROLE 480 SC 1X20L (IMP) SS')).toBe('1x20L')
    expect(extrairEmbalagemDescricao('ASLAN SL 4X5L (IMP)')).toBe('4x5L')
    expect(extrairEmbalagemDescricao('FERTILIZANTE NPK 20KG SACO')).toBe('20KG')
    expect(extrairEmbalagemDescricao('INSETICIDA CONCENTRADO 500ML')).toBe('500ML')
    expect(extrairEmbalagemDescricao('TAMBOR 200L')).toBe('200L')
    expect(extrairEmbalagemDescricao('PRODUTO A GRANEL SEM EMBALAGEM')).toBe('')
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
