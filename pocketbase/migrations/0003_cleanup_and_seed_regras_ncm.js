migrate(
  (app) => {
    // 1. Limpar linhas corrompidas ou inválidas da collection regras_ncm_embalagem
    // Linhas que não são NCM válido (deve ter comprimento de 8 dígitos)
    app
      .db()
      .newQuery(`
      DELETE FROM regras_ncm_embalagem
      WHERE LENGTH(TRIM(ncm)) != 8
         OR ncm GLOB '*[^0-9]*'
    `)
      .execute()

    // 2. Inserir a matriz oficial de regras TIPI / RFB para defensivos agrícolas
    // Se algum NCM já existir, não duplicar
    const col = app.findCollectionByNameOrId('regras_ncm_embalagem')

    const regrasOficiais = [
      {
        ncm: '38089322',
        descricao: 'Herbicidas à base de 2,4-D, seus sais e ésteres',
        embalagens: [
          'Bombona',
          'Tambor',
          'Container',
          'Balde',
          'Frasco',
          '1X20L',
          '4X5L',
          '20L',
          '5L',
        ],
        regra_especial:
          'Nota 2 Cap. 38 TIPI: Exclusivo uso agropecuário. Venda restrita sob receituário.',
      },
      {
        ncm: '38089323',
        descricao: 'Herbicidas à base de atrazina',
        embalagens: [
          'Saco',
          'Sacaria',
          'Big Bag',
          'Bombona',
          'Balde',
          '1X10KG',
          '4X5KG',
          '10X2KG',
          '4X5L',
          '5KG',
          '10KG',
          '5L',
        ],
        regra_especial:
          'Exige embalagem impermeável para formulação granulada/WG e frascos vedados para SC.',
      },
      {
        ncm: '38089324',
        descricao: 'Herbicidas à base de glifosato ou seus sais',
        embalagens: [
          'Bombona',
          'Tambor',
          'Container',
          'Balde',
          'Frasco',
          '1X20L',
          '4X5L',
          '200L',
          '1000L',
          '5L',
          '20L',
        ],
        regra_especial:
          'Nota Subposições Cap. 38 TIPI: Proibida embalagem de consumo doméstico sem registro específico.',
      },
      {
        ncm: '38089329',
        descricao: 'Outros herbicidas, inibidores de germinação e reguladores de crescimento',
        embalagens: [
          'Bombona',
          'Tambor',
          'Frasco',
          'Balde',
          'Container',
          'Saco',
          '1X20L',
          '4X5L',
          '10X0,240 KG',
          '1X5L',
          '5L',
          '20L',
        ],
        regra_especial: 'Acondicionamento unitário conforme registro MAPA vigente.',
      },
      {
        ncm: '38089191',
        descricao: 'Inseticidas à base de acefato',
        embalagens: [
          'Saco',
          'Sacaria',
          'Balde',
          'Caixa',
          '2X5KG',
          '4X5KG',
          '8X3KG',
          '1KG',
          '3KG',
          '5KG',
        ],
        regra_especial: 'Solúvel em pó (SP). Embalagem hidrossolúvel ou multifolhada obrigatória.',
      },
      {
        ncm: '38089192',
        descricao: 'Inseticidas à base de cipermetrina ou seus sais',
        embalagens: [
          'Frasco',
          'Bombona',
          'Tambor',
          'Balde',
          '4X5L',
          '1X20L',
          '1X1L',
          '1L',
          '5L',
          '20L',
        ],
        regra_especial: 'Líquido emulsionável. Recipiente resistente a solventes aromáticos.',
      },
      {
        ncm: '38089199',
        descricao: 'Outros inseticidas para uso agropecuário',
        embalagens: [
          'Frasco',
          'Bombona',
          'Tambor',
          'Container',
          'Saco',
          'Balde',
          '4X5L',
          '4X5KG',
          '5X1KG',
          '1X20L',
          '1L',
          '5L',
          '20L',
          '1KG',
          '5KG',
        ],
        regra_especial:
          'TIPI 3808.91: Formulações agropecuárias vedadas em volumes inferiores a fracionamento autorizado.',
      },
      {
        ncm: '38089299',
        descricao: 'Outros fungicidas para uso agropecuário',
        embalagens: [
          'Bombona',
          'Frasco',
          'Saco',
          'Balde',
          'Tambor',
          'Container',
          '4X5L',
          '1X20L',
          '1X25KG',
          '1X10KG',
          '5L',
          '20L',
          '10KG',
          '25KG',
        ],
        regra_especial: 'Nota 2 Cap. 38 TIPI: Exige rótulo e bula com classe toxicológica MAPA.',
      },
      {
        ncm: '38086290',
        descricao:
          'Mercadorias mencionadas na Nota 2 de Subposições de peso unitário > 300g até 7,5kg',
        embalagens: [
          'Bombona',
          'Frasco',
          'Balde',
          'Caixa',
          'Saco',
          '4X5L',
          '4X5KG',
          '2X5L',
          '1L',
          '5L',
          '5KG',
        ],
        regra_especial:
          'Faixa 2 TIPI: Peso unitário líquido maior que 300g e não superior a 7,5kg.',
      },
      {
        ncm: '38086990',
        descricao:
          'Outras mercadorias da subposição 3808.6 acondicionadas em outras formas ou embalagens',
        embalagens: [
          'Tambor',
          'Container',
          'Big Bag',
          'Bombona',
          '1X20L',
          '1X200L',
          '1X1000L',
          '10L',
          '20L',
          '200L',
          '1000L',
        ],
        regra_especial: 'Faixa 3/4 TIPI: Embalagens industriais e grandes volumes acima de 7,5kg.',
      },
      {
        ncm: '38089419',
        descricao: 'Desinfetantes agropecuários e domissanitários',
        embalagens: [
          'Bombona',
          'Tambor',
          'Frasco',
          'Balde',
          'Container',
          '1X5L',
          '4X5L',
          '1X20L',
          '1L',
          '5L',
          '20L',
        ],
        regra_especial: 'Acondicionados para venda a retalho com registro ANVISA/MAPA.',
      },
      {
        ncm: '38089999',
        descricao: 'Outros raticidas, formicidas e produtos afins',
        embalagens: ['Saco', 'Balde', 'Pote', 'Caixa', 'Frasco', '1KG', '5KG', '10KG', '25KG'],
        regra_especial: 'Iscas e formulações sólidas com sistema de dosagem segura.',
      },
    ]

    for (const item of regrasOficiais) {
      const existing = app.findRecordsByFilter(
        'regras_ncm_embalagem',
        `ncm = '${item.ncm}'`,
        '-created',
        1,
        0,
      )
      if (!existing || existing.length === 0) {
        const rec = new Record(col)
        rec.set('ncm', item.ncm)
        rec.set('descricao', item.descricao)
        rec.set('embalagens_permitidas', item.embalagens)
        rec.set('regra_especial', item.regra_especial)
        app.save(rec)
      }
    }
  },
  (app) => {
    // Reverter não destrutivo: apenas mantém os dados
  },
)
