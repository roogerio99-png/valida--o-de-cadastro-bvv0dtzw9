/**
 * pocketbase/migrations/1740000043_expandir_sim_regras_icms_campos_reais.js
 *
 * Adiciona à coleção sim_regras_icms os campos da estrutura real da planilha do usuário:
 * - id_regra (text, opcional, max: 100): Identificador da regra (ex.: BAALInterestadual001)
 * - tipo_uf_origem (text, opcional, max: 100): Classificação do estado de origem
 * - tipo_uf_destino (text, opcional, max: 100): Classificação do estado de destino
 * - grupo_tributario_codigo (text, opcional, max: 50): Código do grupo tributário (GrTrib, ex.: 001)
 * - grupo_tributario_descricao (text, opcional, max: 500): Descrição do grupo tributário
 * - prod_importado (text, opcional, max: 20): Flag Sim/Não se produto importado
 * - tipo_desonerado (text, opcional, max: 100): Classificação da desoneração
 * - icms_desonerado (number, opcional): Percentual de ICMS desonerado
 * - regra_credito_entrada (text, opcional, max: 500): Regra de crédito na entrada
 *
 * E expande max de chave_origem_destino para 120 (para comportar ORIGEM_DESTINO_GRTRIB_ID).
 */
migrate(
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('sim_regras_icms')
      if (!collection) return

      let modified = false

      // Expandir tamanho de chave_origem_destino se necessário
      const chaveField = collection.fields.getByName('chave_origem_destino')
      if (chaveField && (!chaveField.max || chaveField.max < 150)) {
        chaveField.max = 150
        modified = true
      }

      // Adicionar id_regra
      if (!collection.fields.getByName('id_regra')) {
        collection.fields.add(
          new TextField({
            name: 'id_regra',
            required: false,
            max: 100,
          }),
        )
        modified = true
      }

      // Adicionar tipo_uf_origem
      if (!collection.fields.getByName('tipo_uf_origem')) {
        collection.fields.add(
          new TextField({
            name: 'tipo_uf_origem',
            required: false,
            max: 100,
          }),
        )
        modified = true
      }

      // Adicionar tipo_uf_destino
      if (!collection.fields.getByName('tipo_uf_destino')) {
        collection.fields.add(
          new TextField({
            name: 'tipo_uf_destino',
            required: false,
            max: 100,
          }),
        )
        modified = true
      }

      // Adicionar grupo_tributario_codigo
      if (!collection.fields.getByName('grupo_tributario_codigo')) {
        collection.fields.add(
          new TextField({
            name: 'grupo_tributario_codigo',
            required: false,
            max: 50,
          }),
        )
        modified = true
      }

      // Adicionar grupo_tributario_descricao
      if (!collection.fields.getByName('grupo_tributario_descricao')) {
        collection.fields.add(
          new TextField({
            name: 'grupo_tributario_descricao',
            required: false,
            max: 500,
          }),
        )
        modified = true
      }

      // Adicionar prod_importado
      if (!collection.fields.getByName('prod_importado')) {
        collection.fields.add(
          new TextField({
            name: 'prod_importado',
            required: false,
            max: 20,
          }),
        )
        modified = true
      }

      // Adicionar tipo_desonerado
      if (!collection.fields.getByName('tipo_desonerado')) {
        collection.fields.add(
          new TextField({
            name: 'tipo_desonerado',
            required: false,
            max: 100,
          }),
        )
        modified = true
      }

      // Adicionar icms_desonerado
      if (!collection.fields.getByName('icms_desonerado')) {
        collection.fields.add(
          new NumberField({
            name: 'icms_desonerado',
            required: false,
          }),
        )
        modified = true
      }

      // Adicionar regra_credito_entrada
      if (!collection.fields.getByName('regra_credito_entrada')) {
        collection.fields.add(
          new TextField({
            name: 'regra_credito_entrada',
            required: false,
            max: 500,
          }),
        )
        modified = true
      }

      if (modified) {
        app.save(collection)
        console.log(
          '[MIGRATION 1740000043] Campos reais adicionados a sim_regras_icms com sucesso.',
        )
      }
    } catch (e) {
      console.log('[MIGRATION 1740000043] Erro ao adicionar campos a sim_regras_icms:', e)
      throw e
    }
  },
  (app) => {
    // Reversão defensiva (opcional)
  },
)
