migrate(
  (app) => {
    // 1. Remodelar dicionario_principios_ativos com os 13 campos canônicos
    const colPa = app.findCollectionByNameOrId('dicionario_principios_ativos')

    // Remover índice antigo se existir
    try {
      colPa.removeIndex('idx_dicionario_pa')
    } catch (_) {}

    // Campos canônicos da Matriz de Princípios Ativos (13 campos)
    const novosCamposPa = [
      new TextField({ name: 'principio_ativo_chave', max: 255 }),
      new TextField({ name: 'macro_grupo_subgrupo_padrao', max: 150 }),
      new SelectField({
        name: 'nota_subpos_2',
        values: ['SIM', 'NÃO'],
        maxSelect: 1,
      }),
      new TextField({ name: 'ncm_padrao_referencia', max: 10 }),
      new TextField({ name: 'ncm_faixa1_ate_300g', max: 10 }),
      new TextField({ name: 'ncm_faixa2_300g_a_7_5kg', max: 10 }),
      new TextField({ name: 'ncm_faixa3_7_5kg_a_10kg', max: 10 }),
      new TextField({ name: 'ncm_faixa4_acima_10kg', max: 10 }),
      new TextField({ name: 'ncm_granel_tecnico', max: 10 }),
      new TextField({ name: 'regra_tipi_embalagem' }),
      new TextField({ name: 'sistema_registro_mapa', max: 150 }),
      new TextField({ name: 'enquadramento_pis_cofins', max: 150 }),
      new TextField({ name: 'cst_recomendado', max: 80 }),
    ]

    for (let i = 0; i < novosCamposPa.length; i++) {
      const f = novosCamposPa[i]
      if (!colPa.fields.getByName(f.name)) {
        colPa.fields.add(f)
      }
    }

    // Índices da matriz
    colPa.addIndex('idx_matriz_pa_chave', false, 'principio_ativo_chave', '')
    colPa.addIndex('idx_matriz_nota2', false, 'nota_subpos_2', '')

    app.save(colPa)

    // 2. Adicionar principio_ativo_id na collection base_mestre apontando para dicionario_principios_ativos
    const colMestre = app.findCollectionByNameOrId('base_mestre')

    if (!colMestre.fields.getByName('principio_ativo_id')) {
      colMestre.fields.add(
        new RelationField({
          name: 'principio_ativo_id',
          collectionId: colPa.id,
          maxSelect: 1,
          cascadeDelete: false, // PocketBase cascadeDelete: false garante RESTRICT por default no banco / hooks
        }),
      )
    }

    colMestre.addIndex('idx_cadmestre_pa_id', false, 'principio_ativo_id', '')

    app.save(colMestre)
  },
  (app) => {
    try {
      const colMestre = app.findCollectionByNameOrId('base_mestre')
      colMestre.removeIndex('idx_cadmestre_pa_id')
      const campoPaId = colMestre.fields.getByName('principio_ativo_id')
      if (campoPaId) colMestre.fields.remove(campoPaId)
      app.save(colMestre)
    } catch (_) {}

    try {
      const colPa = app.findCollectionByNameOrId('dicionario_principios_ativos')
      colPa.removeIndex('idx_matriz_pa_chave')
      colPa.removeIndex('idx_matriz_nota2')
      app.save(colPa)
    } catch (_) {}
  },
)
