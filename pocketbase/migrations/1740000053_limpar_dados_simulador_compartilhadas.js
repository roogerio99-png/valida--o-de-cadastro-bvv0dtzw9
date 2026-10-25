migrate(
  (app) => {
    // Limpeza sob demanda autorizada pelo usuário (cartão de impacto respondido):
    // Esvazia os dados das coleções compartilhadas 'sim_produtos_base' e 'sim_regras_icms'.
    // As coleções em si permanecem (a estrutura é mantida para o app separado).
    // Todas as outras coleções permanecem intactas (base_mestre, regras_ncm_embalagem,
    // dicionario_principios_ativos, parametrizacao_fiscal, users etc.).

    if (app.hasTable('sim_produtos_base')) {
      const countProd = app.countRecords('sim_produtos_base')
      console.log(`[Migration 1740000053] Limpando sim_produtos_base (${countProd} registros)...`)
      try {
        const colProd = app.findCollectionByNameOrId('sim_produtos_base')
        app.truncateCollection(colProd)
      } catch (err) {
        console.log('Aviso truncate sim_produtos_base, usando fallback DELETE:', err)
        app.db().newQuery('DELETE FROM sim_produtos_base').execute()
      }
    }

    if (app.hasTable('sim_regras_icms')) {
      const countRegras = app.countRecords('sim_regras_icms')
      console.log(`[Migration 1740000053] Limpando sim_regras_icms (${countRegras} registros)...`)
      try {
        const colRegras = app.findCollectionByNameOrId('sim_regras_icms')
        app.truncateCollection(colRegras)
      } catch (err) {
        console.log('Aviso truncate sim_regras_icms, usando fallback DELETE:', err)
        app.db().newQuery('DELETE FROM sim_regras_icms').execute()
      }
    }

    console.log(
      '[Migration 1740000053] Esvaziamento de sim_produtos_base e sim_regras_icms concluído com sucesso.',
    )
  },
  () => {
    // Reversão no-op — exclusão intencional de registros
  },
)
