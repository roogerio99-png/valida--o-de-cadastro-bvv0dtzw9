/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000002: Semeadura de NCMs TIPI agropecuárias e regras de embalagem
 * Enriquecimento para subitens 3808.9x (incluindo 3808.93.99 - Herbicidas outros),
 * 3808.6x, 3808.91/92/94/99, 3101-3105, 3002, 2520, 2521, 2503.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId('regras_ncm_embalagem')

  const ncmsAdicionais = [
    {
      ncm: '38089399',
      descricao_ncm:
        'Herbicidas, inibidores de germinação e reguladores de crescimento para plantas - Outros',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Qualquer / Granel',
      ativo: true,
    },
    {
      ncm: '38089329',
      descricao_ncm: 'Herbicidas à base de glifosato ou seus sais - Outros',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Qualquer / Granel',
      ativo: true,
    },
    {
      ncm: '38089319',
      descricao_ncm: 'Herbicidas à base de atrazina - Outros',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Qualquer / Granel',
      ativo: true,
    },
    {
      ncm: '38089320',
      descricao_ncm: 'Herbicidas à base de glifosato',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Qualquer / Granel',
      ativo: true,
    },
    {
      ncm: '38089322',
      descricao_ncm: 'Herbicidas à base de glifosato ou seus sais em embalagem <= 5 litros',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 5,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Frasco / Bombona',
      ativo: true,
    },
    {
      ncm: '38089323',
      descricao_ncm: 'Herbicidas à base de glifosato ou seus sais em embalagem > 5 L e <= 20 L',
      faixa_capacidade_min: 5.001,
      faixa_capacidade_max: 20,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Bombona',
      ativo: true,
    },
    {
      ncm: '38089324',
      descricao_ncm: 'Herbicidas à base de glifosato ou seus sais em embalagem > 20 L e <= 200 L',
      faixa_capacidade_min: 20.001,
      faixa_capacidade_max: 200,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Tambor',
      ativo: true,
    },
    {
      ncm: '38089325',
      descricao_ncm: 'Herbicidas à base de glifosato ou seus sais em embalagem > 200 L e <= 1000 L',
      faixa_capacidade_min: 200.001,
      faixa_capacidade_max: 1000,
      unidade_capacidade: 'L',
      tipo_embalagem: 'IBC / Contêiner',
      ativo: true,
    },
    {
      ncm: '38089326',
      descricao_ncm: 'Herbicidas à base de glifosato ou seus sais em embalagem <= 1 kg',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 1,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Pacote / Sache',
      ativo: true,
    },
    {
      ncm: '38089327',
      descricao_ncm: 'Herbicidas à base de glifosato ou seus sais em embalagem > 1 kg e <= 5 kg',
      faixa_capacidade_min: 1.001,
      faixa_capacidade_max: 5,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Saco / Balde',
      ativo: true,
    },
    {
      ncm: '38089328',
      descricao_ncm: 'Herbicidas à base de glifosato ou seus sais em embalagem > 5 kg',
      faixa_capacidade_min: 5.001,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Saco / Big Bag',
      ativo: true,
    },
    {
      ncm: '38089359',
      descricao_ncm: 'Herbicidas à base de 2,4-D ou seus sais - Outros',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Qualquer / Granel',
      ativo: true,
    },
    {
      ncm: '38086100',
      descricao_ncm:
        'Mercadorias mencionadas na Nota de Subposições 1 do Cap. 38 em embalagens <= 300 g',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 0.3,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Frasco pequeno',
      ativo: true,
    },
    {
      ncm: '38086290',
      descricao_ncm:
        'Mercadorias mencionadas na Nota de Subposições 1 do Cap. 38 em embalagens > 300 g e <= 7,5 kg - Outras',
      faixa_capacidade_min: 0.301,
      faixa_capacidade_max: 7.5,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Embalagem intermediária',
      ativo: true,
    },
    {
      ncm: '38086990',
      descricao_ncm:
        'Mercadorias mencionadas na Nota de Subposições 1 do Cap. 38 em embalagens > 7,5 kg - Outras',
      faixa_capacidade_min: 7.501,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Embalagem grande / Granel',
      ativo: true,
    },
    {
      ncm: '38089995',
      descricao_ncm: 'Acaricidas apresentados em outras formas ou embalagens',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Qualquer',
      ativo: true,
    },
    {
      ncm: '31051000',
      descricao_ncm:
        'Produtos deste Capítulo em tabletes ou formas semelhantes, ou em embalagens de peso bruto <= 10 kg',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 10,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Pacote / Saco pequeno',
      ativo: true,
    },
    {
      ncm: '31059090',
      descricao_ncm: 'Outros adubos ou fertilizantes minerais ou químicos',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Qualquer',
      ativo: true,
    },
    {
      ncm: '30024999',
      descricao_ncm: 'Inoculantes e outros produtos biológicos para agricultura',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'L',
      tipo_embalagem: 'Qualquer',
      ativo: true,
    },
    {
      ncm: '25201019',
      descricao_ncm: 'Gipsita / Gesso agrícola',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Granel / Saco',
      ativo: true,
    },
    {
      ncm: '25210000',
      descricao_ncm: 'Calcário agrícola e pedras calcárias',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Granel / Saco',
      ativo: true,
    },
    {
      ncm: '25030090',
      descricao_ncm:
        'Enxofre de qualquer espécie, exceto o enxofre sublimado, precipitado ou coloidal',
      faixa_capacidade_min: 0,
      faixa_capacidade_max: 999999,
      unidade_capacidade: 'KG',
      tipo_embalagem: 'Granel / Saco',
      ativo: true,
    },
  ]

  for (const item of ncmsAdicionais) {
    try {
      const existing = app.findFirstRecordByFilter(
        'regras_ncm_embalagem',
        `ncm = '${item.ncm}' && faixa_capacidade_min = ${item.faixa_capacidade_min} && faixa_capacidade_max = ${item.faixa_capacidade_max}`,
      )
      if (!existing) {
        const record = new Record(collection)
        record.set('ncm', item.ncm)
        record.set('descricao_ncm', item.descricao_ncm)
        record.set('faixa_capacidade_min', item.faixa_capacidade_min)
        record.set('faixa_capacidade_max', item.faixa_capacidade_max)
        record.set('unidade_capacidade', item.unidade_capacidade)
        record.set('tipo_embalagem', item.tipo_embalagem)
        record.set('ativo', item.ativo)
        app.save(record)
      }
    } catch (_err) {
      // Ignorar se já existir
    }
  }
})
