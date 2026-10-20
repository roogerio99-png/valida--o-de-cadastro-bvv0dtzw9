migrate(
  (app) => {
    // 1. Criar collection sincronizacao_historico
    const historicoCol = new Collection({
      name: 'sincronizacao_historico',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'fontes_executadas', type: 'json' },
        { name: 'auto_inclusao', type: 'bool' },
        { name: 'total_baixado', type: 'number' },
        { name: 'novos_cadastrados', type: 'number' },
        { name: 'atualizados', type: 'number' },
        { name: 'ignorados_duplicidade', type: 'number' },
        { name: 'detalhes_fontes', type: 'json' },
        { name: 'duracao_ms', type: 'number' },
        { name: 'status_geral', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_sincronizacao_historico_data ON sincronizacao_historico (created DESC)',
      ],
    })
    app.save(historicoCol)

    // 2. Adicionar campos complementares em base_mestre se não existirem
    const baseMestreCol = app.findCollectionByNameOrId('base_mestre')
    if (!baseMestreCol.fields.getByName('origem_base')) {
      baseMestreCol.fields.add(new TextField({ name: 'origem_base' }))
    }
    if (!baseMestreCol.fields.getByName('macro_grupo_subgrupo')) {
      baseMestreCol.fields.add(new TextField({ name: 'macro_grupo_subgrupo' }))
    }
    if (!baseMestreCol.fields.getByName('regra_tipi_embalagem')) {
      baseMestreCol.fields.add(new TextField({ name: 'regra_tipi_embalagem' }))
    }
    if (!baseMestreCol.fields.getByName('cst_recomendado')) {
      baseMestreCol.fields.add(new TextField({ name: 'cst_recomendado' }))
    }
    if (!baseMestreCol.fields.getByName('ibs_cbs_2027')) {
      baseMestreCol.fields.add(new TextField({ name: 'ibs_cbs_2027' }))
    }
    if (!baseMestreCol.fields.getByName('dados_classificacao')) {
      baseMestreCol.fields.add(new JSONField({ name: 'dados_classificacao' }))
    }
    app.save(baseMestreCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('sincronizacao_historico')
      app.delete(col)
    } catch (_) {}
  },
)
