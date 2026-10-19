migrate(
  (app) => {
    // 1. regras_ncm_embalagem
    const regrasCol = new Collection({
      name: 'regras_ncm_embalagem',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ncm', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'embalagens_permitidas', type: 'json' },
        { name: 'regra_especial', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_regras_ncm ON regras_ncm_embalagem (ncm)'],
    })
    app.save(regrasCol)

    // 2. dicionario_principios_ativos
    const dicionarioCol = new Collection({
      name: 'dicionario_principios_ativos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'principio_ativo', type: 'text', required: true },
        { name: 'classe', type: 'text' },
        { name: 'grupo_quimico', type: 'text' },
        { name: 'concentracao_min', type: 'number' },
        { name: 'concentracao_max', type: 'number' },
        { name: 'unidade', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_dicionario_pa ON dicionario_principios_ativos (principio_ativo)'],
    })
    app.save(dicionarioCol)

    // 3. base_mestre
    const baseMestreCol = new Collection({
      name: 'base_mestre',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome_produto', type: 'text', required: true },
        { name: 'ncm', type: 'text' },
        { name: 'embalagem', type: 'text' },
        { name: 'principio_ativo', type: 'text' },
        { name: 'fabricante', type: 'text' },
        { name: 'registro_mapa', type: 'text' },
        { name: 'concentracao', type: 'number' },
        { name: 'unidade_concentracao', type: 'text' },
        {
          name: 'status_validacao',
          type: 'select',
          values: ['aprovado', 'reprovado', 'pendente'],
          maxSelect: 1,
        },
        { name: 'data_inclusao', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_base_mestre_busca ON base_mestre (nome_produto, ncm, fabricante)',
        "CREATE UNIQUE INDEX idx_base_mestre_unique ON base_mestre (ncm, principio_ativo, fabricante) WHERE ncm != '' AND principio_ativo != '' AND fabricante != ''",
      ],
    })
    app.save(baseMestreCol)

    // 4. parametrizacao_fiscal
    const parametrizacaoCol = new Collection({
      name: 'parametrizacao_fiscal',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ncm', type: 'text', required: true },
        { name: 'aliquota_pis', type: 'number' },
        { name: 'aliquota_cofins', type: 'number' },
        { name: 'regime', type: 'select', values: ['cumulativo', 'nao_cumulativo'], maxSelect: 1 },
        { name: 'aliquota_ibs', type: 'number' },
        { name: 'aliquota_cbs', type: 'number' },
        { name: 'classificacao', type: 'text' },
        { name: 'tributacao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_param_fiscal_ncm ON parametrizacao_fiscal (ncm)'],
    })
    app.save(parametrizacaoCol)

    // 5. log_validacoes
    const logValidacoesCol = new Collection({
      name: 'log_validacoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome_produto', type: 'text' },
        { name: 'ncm', type: 'text' },
        { name: 'embalagem', type: 'text' },
        { name: 'principio_ativo', type: 'text' },
        { name: 'id_trava', type: 'number' },
        { name: 'trava_nome', type: 'text' },
        { name: 'aprovado', type: 'bool' },
        { name: 'mensagem', type: 'text' },
        { name: 'data_validacao', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_log_validacoes_data ON log_validacoes (data_validacao DESC)'],
    })
    app.save(logValidacoesCol)
  },
  (app) => {
    const collections = [
      'log_validacoes',
      'parametrizacao_fiscal',
      'base_mestre',
      'dicionario_principios_ativos',
      'regras_ncm_embalagem',
    ]
    for (const name of collections) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    }
  },
)
