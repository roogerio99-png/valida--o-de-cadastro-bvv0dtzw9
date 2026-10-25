/**
 * pocketbase/migrations/1740000047_ajustar_indice_composto_sim_produtos_base.js
 *
 * Migration 1740000047:
 * Ajuste do índice de 'sim_produtos_base' para índice composto por (codigo, embalagem).
 *
 * Regra de identidade de produto:
 * Um produto na base é identificado pelo par composto B1_COD + Embalagem.
 * Variantes de embalagem do mesmo código convivem como registros distintos.
 *
 * Esta migração:
 * 1. Remove o índice simples antigo 'idx_sim_produtos_codigo' (se existir).
 * 2. Adiciona o novo índice composto 'idx_sim_produtos_cod_emb' sobre (codigo, embalagem).
 * 3. Mantém a integridade dos dados existentes sem exclusão ou fusão arbitrária.
 */

migrate(
  (app) => {
    if (!app.hasTable('sim_produtos_base')) {
      console.log("[Migration 1740000047] Tabela 'sim_produtos_base' inexistente. Pulando.")
      return
    }

    const col = app.findCollectionByNameOrId('sim_produtos_base')

    // 1. Remover índice antigo simples de código caso exista
    try {
      col.removeIndex('idx_sim_produtos_codigo')
      console.log("[Migration 1740000047] Índice 'idx_sim_produtos_codigo' removido.")
    } catch (err) {
      console.log('[Migration 1740000047] Aviso ao remover idx_sim_produtos_codigo:', err.message)
    }

    // 2. Adicionar novo índice composto (codigo, embalagem)
    // Usamos col.addIndex(name, unique, columns, where)
    // Criamos índice não-exclusivo no nível do banco ou índice composto de busca rápida
    try {
      col.addIndex('idx_sim_produtos_cod_emb', false, 'codigo, embalagem', '')
      console.log(
        "[Migration 1740000047] Índice composto 'idx_sim_produtos_cod_emb' adicionado com sucesso.",
      )
    } catch (err) {
      console.log(
        '[Migration 1740000047] Aviso ao adicionar idx_sim_produtos_cod_emb:',
        err.message,
      )
    }

    app.save(col)
    console.log("[Migration 1740000047] Migração aplicada com sucesso para 'sim_produtos_base'.")
  },
  (app) => {
    if (!app.hasTable('sim_produtos_base')) return
    const col = app.findCollectionByNameOrId('sim_produtos_base')
    try {
      col.removeIndex('idx_sim_produtos_cod_emb')
    } catch (_) {}
    try {
      col.addIndex('idx_sim_produtos_codigo', false, 'codigo', '')
    } catch (_) {}
    app.save(col)
  },
)
