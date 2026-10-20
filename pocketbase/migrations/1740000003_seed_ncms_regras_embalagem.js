/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000003: Semeia NCMs agropecuárias faltantes em regras_ncm_embalagem
 * com os campos corretos da coleção: ncm, descricao, embalagens_permitidas, regra_especial.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('regras_ncm_embalagem')

    const ncmsAdicionais = [
      {
        ncm: '38089399',
        descricao:
          'Outros herbicidas, inibidores de germinação e reguladores de crescimento de plantas',
        embalagens_permitidas: [
          'Bombona',
          'Frasco',
          'Tambor',
          'Balde',
          'Saco',
          'Big Bag',
          'Container',
          '1L',
          '5L',
          '10L',
          '20L',
          '200L',
          '1000L',
          '1KG',
          '5KG',
          '10KG',
          '25KG',
        ],
        regra_especial:
          'Subitem residual TIPI para herbicidas e reguladores não especificados em subitens diretos.',
      },
      {
        ncm: '38089319',
        descricao: 'Outros herbicidas à base de atrazina',
        embalagens_permitidas: [
          'Saco',
          'Sacaria',
          'Big Bag',
          'Bombona',
          'Balde',
          'Frasco',
          '5L',
          '10L',
          '20L',
          '5KG',
          '10KG',
        ],
        regra_especial: 'Formulações de atrazina em embalagens comerciais autorizadas pelo MAPA.',
      },
      {
        ncm: '38089359',
        descricao: 'Outros herbicidas e reguladores à base de 2,4-D ou seus sais',
        embalagens_permitidas: [
          'Bombona',
          'Tambor',
          'Frasco',
          'Balde',
          'Container',
          '1L',
          '5L',
          '20L',
          '200L',
        ],
        regra_especial: 'Herbicidas hormonais derivados de ácido fenoxiacético.',
      },
      {
        ncm: '38089320',
        descricao: 'Herbicidas à base de glifosato',
        embalagens_permitidas: [
          'Bombona',
          'Tambor',
          'Frasco',
          'Balde',
          'Container',
          '1L',
          '5L',
          '20L',
          '200L',
          '1000L',
        ],
        regra_especial: 'Classificação genérica de formulações com princípio ativo glifosato.',
      },
      {
        ncm: '38089322',
        descricao: 'Herbicidas à base de 2,4-D e derivados',
        embalagens_permitidas: ['Frasco', 'Bombona', 'Balde', '1L', '5L', '20L'],
        regra_especial: 'Classificação TIPI para formulações comerciais de 2,4-D.',
      },
      {
        ncm: '38086100',
        descricao:
          'Mercadorias da Nota 2 de Subposições do Cap. 38 em embalagens unitárias <= 300 g ou mL',
        embalagens_permitidas: [
          'Frasco',
          'Sache',
          'Ampola',
          'Cartucho',
          '100ML',
          '250ML',
          '100G',
          '250G',
          '300G',
        ],
        regra_especial: 'Faixa 1 TIPI: Embalagens comerciais pequenas até 300 g ou mL.',
      },
      {
        ncm: '38089995',
        descricao: 'Acaricidas agropecuários',
        embalagens_permitidas: ['Frasco', 'Bombona', 'Balde', '1L', '5L', '20L'],
        regra_especial: 'Acaricidas fitossanitários com registro comercial no MAPA.',
      },
      {
        ncm: '31051000',
        descricao: 'Adubos ou fertilizantes em tabletes ou embalagens brutas <= 10 kg',
        embalagens_permitidas: ['Pacote', 'Saco', 'Balde', 'Caixa', '1KG', '2KG', '5KG', '10KG'],
        regra_especial: 'Nota 1 do Cap. 31 TIPI: Embalagens unitárias brutas até 10 kg.',
      },
      {
        ncm: '31059090',
        descricao: 'Outros adubos ou fertilizantes minerais ou químicos',
        embalagens_permitidas: ['Saco', 'Big Bag', 'Granel', '25KG', '50KG', '1000KG'],
        regra_especial: 'Fertilizantes minerais compostos a granel ou sacarias industriais.',
      },
      {
        ncm: '30024999',
        descricao: 'Culturas de microrganismos e inoculantes biológicos para agricultura',
        embalagens_permitidas: ['Frasco', 'Bombona', 'Saco', 'Dose', '1L', '2L', '5L'],
        regra_especial: 'Posição 3002 TIPI para insumos biológicos e fixadores de nitrogênio.',
      },
      {
        ncm: '25201019',
        descricao: 'Gesso agrícola (gipsita)',
        embalagens_permitidas: ['Granel', 'Big Bag', 'Saco', '40KG', '50KG', '1000KG'],
        regra_especial: 'Condicionador mineral de solo enquadrado no Cap. 25 TIPI.',
      },
      {
        ncm: '25210000',
        descricao: 'Calcário agrícola e pedras calcárias para correção de solo',
        embalagens_permitidas: ['Granel', 'Big Bag', 'Saco', '40KG', '50KG', '1000KG'],
        regra_especial: 'Corretivo mineral de acidez de solo enquadrado no Cap. 25 TIPI.',
      },
      {
        ncm: '25030090',
        descricao: 'Enxofre elementar para agricultura',
        embalagens_permitidas: ['Granel', 'Big Bag', 'Saco', '25KG', '50KG', '1000KG'],
        regra_especial: 'Enxofre para nutrição e condicionamento de solo.',
      },
    ]

    for (const item of ncmsAdicionais) {
      try {
        const existing = app.findFirstRecordByFilter('regras_ncm_embalagem', `ncm = '${item.ncm}'`)
        if (existing) {
          // Atualiza campos se estiver incompleto
          if (!existing.getString('descricao')) existing.set('descricao', item.descricao)
          if (!existing.getString('regra_especial'))
            existing.set('regra_especial', item.regra_especial)
          if (!existing.getString('embalagens_permitidas')) {
            existing.set('embalagens_permitidas', JSON.stringify(item.embalagens_permitidas))
          }
          app.save(existing)
        }
      } catch (_err) {
        // Registro não existe: cria novo
        try {
          const record = new Record(collection)
          record.set('ncm', item.ncm)
          record.set('descricao', item.descricao)
          record.set('embalagens_permitidas', JSON.stringify(item.embalagens_permitidas))
          record.set('regra_especial', item.regra_especial)
          app.save(record)
        } catch (errSave) {
          console.log(`Aviso ao semear NCM ${item.ncm}:`, errSave.message)
        }
      }
    }
  },
  (app) => {
    // down: no-op para preservar integridade
  },
)
