/**
 * pocketbase/migrations/1740000015_create_bula_collections.js
 *
 * Criação da estrutura de Cadastro de Bula:
 * 1. bula_produtos (Cadastro Mestre 1:1)
 * 2. bula_composicao (Sheet 2: Composição em Linhas)
 * 3. bula_empresas (Sheet 3: Cadeia de Empresas em Linhas)
 * 4. bula_embalagens (Sheet 4: Embalagens × NCM em Linhas)
 * 5. bula_culturas (Sheet 5: Culturas e Carência em Linhas)
 * 6. bula_alvos (Sheet 6: Alvos e Doses em Linhas)
 * 7. bula_aplicacao (Sheet 7: Aplicação e EPI em Linhas)
 *
 * Chaves naturais de relacionamento:
 * - registro_mapa (chave forte canônica de produtos agropecuários)
 * - nome_produto / marca_comercial (chave auxiliar complementar)
 *
 * Todas as regras de acesso (RLS):
 * - list/view: usuários autenticados (@request.auth.id != '')
 * - create/update/delete: administradores (@request.auth.id != '' && @request.auth.role = 'admin')
 *
 * ZERO dados fixos ou seed na migração (estritamente idempotente e compatível com banco vazio).
 */

migrate(
  (app) => {
    // -------------------------------------------------------------------------
    // 1. Coleção Principal: bula_produtos (Sheet 1: Cadastro_Mestre_1a1)
    // -------------------------------------------------------------------------
    if (!app.hasTable('bula_produtos')) {
      const colBula = new Collection({
        name: 'bula_produtos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'registro_mapa', type: 'text', required: true, max: 100 },
          { name: 'nome_comercial', type: 'text', required: true, max: 255 },
          { name: 'marca_padronizada', type: 'text', max: 200 },
          { name: 'titular_registro', type: 'text', max: 500 },
          { name: 'fabricante_formulador', type: 'text', max: 500 },
          { name: 'principio_ativo', type: 'text', max: 500 },
          { name: 'classe_agronomica', type: 'text', max: 200 },
          { name: 'grupo_quimico', type: 'text', max: 300 },
          { name: 'classificacao_toxicologica', type: 'text', max: 200 },
          { name: 'classificacao_ambiental', type: 'text', max: 200 },
          { name: 'tipo_formulacao', type: 'text', max: 200 },
          { name: 'modo_acao', type: 'text', max: 500 },
          { name: 'ncm_padrao', type: 'text', max: 20 },
          { name: 'tipo_produto', type: 'text', max: 200 },
          { name: 'status_registro', type: 'text', max: 100 },
          { name: 'dados_extras', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_bula_regmapa ON bula_produtos (registro_mapa)',
          'CREATE INDEX idx_bula_nomecomercial ON bula_produtos (nome_comercial)',
          'CREATE INDEX idx_bula_classe ON bula_produtos (classe_agronomica)',
          'CREATE INDEX idx_bula_pa ON bula_produtos (principio_ativo)',
        ],
      })
      app.save(colBula)
    }

    // -------------------------------------------------------------------------
    // 2. Bloco Acessório: bula_composicao (Sheet 2: Composicao_Em_Linhas)
    // -------------------------------------------------------------------------
    if (!app.hasTable('bula_composicao')) {
      const colComp = new Collection({
        name: 'bula_composicao',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'registro_mapa', type: 'text', required: true, max: 100 },
          { name: 'nome_produto', type: 'text', max: 255 },
          { name: 'ingrediente_ativo', type: 'text', required: true, max: 300 },
          { name: 'nome_quimico', type: 'text', max: 500 },
          { name: 'numero_cas', type: 'text', max: 50 },
          { name: 'concentracao', type: 'text', max: 100 },
          { name: 'unidade_medida', type: 'text', max: 50 },
          { name: 'funcao_ingrediente', type: 'text', max: 200 },
          { name: 'grupo_quimico', type: 'text', max: 300 },
          { name: 'dados_extras', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bula_comp_mapa ON bula_composicao (registro_mapa)',
          'CREATE INDEX idx_bula_comp_ia ON bula_composicao (ingrediente_ativo)',
        ],
      })
      app.save(colComp)
    }

    // -------------------------------------------------------------------------
    // 3. Bloco Acessório: bula_empresas (Sheet 3: Cadeia_Empresas_Linhas)
    // -------------------------------------------------------------------------
    if (!app.hasTable('bula_empresas')) {
      const colEmp = new Collection({
        name: 'bula_empresas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'registro_mapa', type: 'text', required: true, max: 100 },
          { name: 'nome_produto', type: 'text', max: 255 },
          { name: 'tipo_relacao', type: 'text', max: 150 }, // Titular, Formulador, Manipulador, Importador
          { name: 'razao_social', type: 'text', required: true, max: 300 },
          { name: 'nome_fantasia', type: 'text', max: 300 },
          { name: 'cnpj', type: 'text', max: 30 },
          { name: 'endereco', type: 'text', max: 500 },
          { name: 'municipio', type: 'text', max: 150 },
          { name: 'uf', type: 'text', max: 10 },
          { name: 'pais', type: 'text', max: 100 },
          { name: 'dados_extras', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bula_emp_mapa ON bula_empresas (registro_mapa)',
          'CREATE INDEX idx_bula_emp_razao ON bula_empresas (razao_social)',
          'CREATE INDEX idx_bula_emp_tipo ON bula_empresas (tipo_relacao)',
        ],
      })
      app.save(colEmp)
    }

    // -------------------------------------------------------------------------
    // 4. Bloco Acessório: bula_embalagens (Sheet 4: Embalagens_NCM_Linhas)
    // -------------------------------------------------------------------------
    if (!app.hasTable('bula_embalagens')) {
      const colEmb = new Collection({
        name: 'bula_embalagens',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'registro_mapa', type: 'text', required: true, max: 100 },
          { name: 'nome_produto', type: 'text', max: 255 },
          { name: 'tipo_embalagem', type: 'text', max: 200 }, // Frasco, Bombona, Tambor, Saco...
          { name: 'material', type: 'text', max: 200 }, // PEAD, COEX, Alumínio, Papelão...
          { name: 'capacidade', type: 'text', max: 100 }, // 1L, 5L, 20L, 200L...
          { name: 'unidade_medida', type: 'text', max: 50 },
          { name: 'ncm', type: 'text', max: 20 },
          { name: 'destinacao_final', type: 'text', max: 300 },
          { name: 'dados_extras', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bula_emb_mapa ON bula_embalagens (registro_mapa)',
          'CREATE INDEX idx_bula_emb_ncm ON bula_embalagens (ncm)',
        ],
      })
      app.save(colEmb)
    }

    // -------------------------------------------------------------------------
    // 5. Bloco Acessório: bula_culturas (Sheet 5: Culturas_Carencia_Linhas)
    // -------------------------------------------------------------------------
    if (!app.hasTable('bula_culturas')) {
      const colCult = new Collection({
        name: 'bula_culturas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'registro_mapa', type: 'text', required: true, max: 100 },
          { name: 'nome_produto', type: 'text', max: 255 },
          { name: 'cultura', type: 'text', required: true, max: 200 },
          { name: 'intervalo_seguranca_dias', type: 'text', max: 100 }, // Dias de carência
          { name: 'intervalo_reentrada_horas', type: 'text', max: 100 },
          { name: 'modalidade_emprego', type: 'text', max: 300 },
          { name: 'limite_maximo_residuos_lmr', type: 'text', max: 100 },
          { name: 'observacoes', type: 'text', max: 500 },
          { name: 'dados_extras', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bula_cult_mapa ON bula_culturas (registro_mapa)',
          'CREATE INDEX idx_bula_cult_cultura ON bula_culturas (cultura)',
        ],
      })
      app.save(colCult)
    }

    // -------------------------------------------------------------------------
    // 6. Bloco Acessório: bula_alvos (Sheet 6: Alvos_e_Doses_Linhas)
    // -------------------------------------------------------------------------
    if (!app.hasTable('bula_alvos')) {
      const colAlv = new Collection({
        name: 'bula_alvos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'registro_mapa', type: 'text', required: true, max: 100 },
          { name: 'nome_produto', type: 'text', max: 255 },
          { name: 'cultura', type: 'text', max: 200 },
          { name: 'alvo_biologico', type: 'text', required: true, max: 300 }, // Praga, doença ou planta daninha
          { name: 'nome_cientifico', type: 'text', max: 300 },
          { name: 'dose_minima', type: 'text', max: 100 },
          { name: 'dose_maxima', type: 'text', max: 100 },
          { name: 'unidade_dose', type: 'text', max: 100 }, // L/ha, kg/ha, mL/100L...
          { name: 'volume_calda', type: 'text', max: 150 },
          { name: 'numero_maximo_aplicacoes', type: 'text', max: 100 },
          { name: 'epoca_aplicacao', type: 'text', max: 500 },
          { name: 'dados_extras', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bula_alv_mapa ON bula_alvos (registro_mapa)',
          'CREATE INDEX idx_bula_alv_alvo ON bula_alvos (alvo_biologico)',
          'CREATE INDEX idx_bula_alv_cultura ON bula_alvos (cultura)',
        ],
      })
      app.save(colAlv)
    }

    // -------------------------------------------------------------------------
    // 7. Bloco Acessório: bula_aplicacao (Sheet 7: Aplicacao_e_EPI_Linhas)
    // -------------------------------------------------------------------------
    if (!app.hasTable('bula_aplicacao')) {
      const colApl = new Collection({
        name: 'bula_aplicacao',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'registro_mapa', type: 'text', required: true, max: 100 },
          { name: 'nome_produto', type: 'text', max: 255 },
          { name: 'tipo_aplicacao', type: 'text', max: 200 }, // Terrestre, Aérea, Fertirrigação...
          { name: 'equipamento_recomendado', type: 'text', max: 300 },
          { name: 'condicoes_meteorologicas', type: 'text', max: 500 }, // Vento, umidade, temperatura
          { name: 'epi_preparo_calda', type: 'text', max: 500 },
          { name: 'epi_aplicacao', type: 'text', max: 500 },
          { name: 'medidas_primeiros_socorros', type: 'text', max: 500 },
          { name: 'descarte_embalagens', type: 'text', max: 500 },
          { name: 'dados_extras', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bula_apl_mapa ON bula_aplicacao (registro_mapa)',
          'CREATE INDEX idx_bula_apl_tipo ON bula_aplicacao (tipo_aplicacao)',
        ],
      })
      app.save(colApl)
    }
  },
  (app) => {
    const tabelas = [
      'bula_aplicacao',
      'bula_alvos',
      'bula_culturas',
      'bula_embalagens',
      'bula_empresas',
      'bula_composicao',
      'bula_produtos',
    ]
    for (let i = 0; i < tabelas.length; i++) {
      try {
        const col = app.findCollectionByNameOrId(tabelas[i])
        app.delete(col)
      } catch (_) {}
    }
  },
)
