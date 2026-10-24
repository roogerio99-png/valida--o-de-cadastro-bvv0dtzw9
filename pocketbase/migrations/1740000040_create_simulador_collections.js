/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000040:
 * Criação das coleções do Simulador Comercial (Fase 1 - MVP):
 * 1. 'sim_produtos_base' (Aba Produtos Base ≈ 1.178 itens da planilha)
 *    - codigo text
 *    - descricao text (obrigatório)
 *    - ncm text
 *    - unidade text
 *    - tipo_produto text
 *    - origem text (Nacional / Importado)
 *    - embalagem text
 *    - principio_ativo text
 *    - fabricante text
 *    - moeda text ('BRL' | 'USD')
 *    - preco_base_sugerido number
 *    - dados_extras json
 *
 * 2. 'sim_regras_icms' (Aba Regra ICMS ≈ 7.291 regras da planilha)
 *    - uf_origem text (obrigatório, 2 chars)
 *    - uf_destino text (obrigatório, 2 chars)
 *    - aliquota_icms number (obrigatório, ex. 4, 7, 12, 17, 18)
 *    - reducao_base number (percentual de redução, ex. 0 ou 30, 60, etc.)
 *    - aliquota_efetiva number
 *    - diferimento bool
 *    - percentual_diferimento number
 *    - fundamentacao_legal text
 *    - tipo_operacao text (Interna / Interestadual)
 *    - chave_origem_destino text (UF_ORIGEM + '_' + UF_DESTINO para índice único e busca direta)
 *    - dados_extras json
 */

migrate(
  (app) => {
    // 1. Coleção sim_produtos_base
    if (!app.hasTable('sim_produtos_base')) {
      const colProdutos = new Collection({
        name: 'sim_produtos_base',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'codigo', type: 'text' },
          { name: 'descricao', type: 'text', required: true },
          { name: 'ncm', type: 'text' },
          { name: 'unidade', type: 'text' },
          { name: 'tipo_produto', type: 'text' },
          { name: 'origem', type: 'text' },
          { name: 'embalagem', type: 'text' },
          { name: 'principio_ativo', type: 'text' },
          { name: 'fabricante', type: 'text' },
          { name: 'moeda', type: 'text' },
          { name: 'preco_base_sugerido', type: 'number' },
          { name: 'dados_extras', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_sim_produtos_desc ON sim_produtos_base (descricao)',
          'CREATE INDEX idx_sim_produtos_ncm ON sim_produtos_base (ncm)',
          'CREATE INDEX idx_sim_produtos_codigo ON sim_produtos_base (codigo)',
        ],
      })
      app.save(colProdutos)
    }

    // 2. Coleção sim_regras_icms
    if (!app.hasTable('sim_regras_icms')) {
      const colIcms = new Collection({
        name: 'sim_regras_icms',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'uf_origem', type: 'text', required: true },
          { name: 'uf_destino', type: 'text', required: true },
          { name: 'aliquota_icms', type: 'number', required: true },
          { name: 'reducao_base', type: 'number' },
          { name: 'aliquota_efetiva', type: 'number' },
          { name: 'diferimento', type: 'bool' },
          { name: 'percentual_diferimento', type: 'number' },
          { name: 'fundamentacao_legal', type: 'text' },
          { name: 'tipo_operacao', type: 'text' },
          { name: 'chave_origem_destino', type: 'text', required: true },
          { name: 'dados_extras', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_sim_icms_chave ON sim_regras_icms (chave_origem_destino)',
          'CREATE INDEX idx_sim_icms_origem ON sim_regras_icms (uf_origem)',
          'CREATE INDEX idx_sim_icms_destino ON sim_regras_icms (uf_destino)',
        ],
      })
      app.save(colIcms)
    }
  },
  (app) => {
    try {
      const colIcms = app.findCollectionByNameOrId('sim_regras_icms')
      if (colIcms) app.delete(colIcms)
    } catch (_) {}

    try {
      const colProdutos = app.findCollectionByNameOrId('sim_produtos_base')
      if (colProdutos) app.delete(colProdutos)
    } catch (_) {}
  },
)
