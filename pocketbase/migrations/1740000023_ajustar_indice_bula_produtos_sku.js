/**
 * pocketbase/migrations/1740000023_ajustar_indice_bula_produtos_sku.js
 *
 * Atualiza os índices da coleção `bula_produtos`:
 * 1. Remove o índice único exclusivo `idx_bula_regmapa` sobre apenas (registro_mapa),
 *    que colapsava SKUs/produtos diferentes do mesmo registro MAPA.
 * 2. Cria índice de busca não-único em `registro_mapa` (para consultas rápidas e relacionamento com blocos acessórios).
 * 3. Cria índice composto em (registro_mapa, codigo) para suportar a nova chave de idempotência por produto/SKU.
 * 4. Idempotente e seguro contra bancos com ou sem dados existentes.
 */

migrate(
  (app) => {
    if (!app.hasTable('bula_produtos')) return

    try {
      const col = app.findCollectionByNameOrId('bula_produtos')

      // Filtrar índices removendo o índice único legado sobre registro_mapa puro
      const novosIndices = [
        'CREATE INDEX IF NOT EXISTS idx_bula_regmapa_lookup ON bula_produtos (registro_mapa)',
        'CREATE INDEX IF NOT EXISTS idx_bula_regmapa_codigo ON bula_produtos (registro_mapa, codigo)',
        'CREATE INDEX IF NOT EXISTS idx_bula_nomecomercial ON bula_produtos (nome_comercial)',
        'CREATE INDEX IF NOT EXISTS idx_bula_classe ON bula_produtos (classe_agronomica)',
        'CREATE INDEX IF NOT EXISTS idx_bula_pa ON bula_produtos (principio_ativo)',
      ]

      col.indexes = novosIndices
      app.save(col)
      console.log(
        'Índices de bula_produtos atualizados com sucesso para chave composta registro_mapa + codigo.',
      )
    } catch (err) {
      console.log(
        'Aviso ao ajustar índices de bula_produtos:',
        err && err.message ? err.message : err,
      )
    }
  },
  (app) => {
    if (!app.hasTable('bula_produtos')) return
    try {
      const col = app.findCollectionByNameOrId('bula_produtos')
      col.indexes = [
        'CREATE INDEX IF NOT EXISTS idx_bula_regmapa ON bula_produtos (registro_mapa)',
        'CREATE INDEX IF NOT EXISTS idx_bula_nomecomercial ON bula_produtos (nome_comercial)',
      ]
      app.save(col)
    } catch (_) {}
  },
)
