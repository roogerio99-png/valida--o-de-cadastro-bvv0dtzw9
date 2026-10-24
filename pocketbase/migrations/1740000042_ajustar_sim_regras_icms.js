/**
 * pocketbase/migrations/1740000042_ajustar_sim_regras_icms.js
 *
 * Ajusta a coleção sim_regras_icms:
 * - Define aliquota_icms com required: false para permitir regras com alíquota zero ou isenção sem falha de validação do PocketBase
 * - Garante que os campos de texto tenham limites confortáveis
 */
migrate(
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('sim_regras_icms')
      if (!collection) return

      let modified = false

      // Encontrar campo aliquota_icms e garantir required: false
      const aliqField = collection.fields.getByName('aliquota_icms')
      if (aliqField && aliqField.required) {
        aliqField.required = false
        modified = true
      }

      // Encontrar campo chave_origem_destino e garantir max: 50
      const chaveField = collection.fields.getByName('chave_origem_destino')
      if (chaveField && (!chaveField.max || chaveField.max < 50)) {
        chaveField.max = 50
        modified = true
      }

      // Encontrar fundamentacao_legal e garantir max: 2000
      const fundField = collection.fields.getByName('fundamentacao_legal')
      if (fundField && (!fundField.max || fundField.max < 2000)) {
        fundField.max = 2000
        modified = true
      }

      if (modified) {
        app.save(collection)
        console.log('[MIGRATION 1740000042] Coleção sim_regras_icms atualizada com sucesso.')
      }
    } catch (e) {
      console.log('[MIGRATION 1740000042] Erro ao ajustar sim_regras_icms:', e)
    }
  },
  (app) => {
    // Reversão não necessária
  },
)
