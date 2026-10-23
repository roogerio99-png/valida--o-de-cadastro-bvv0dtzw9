/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000029: Backfill via SQL direto dos novos campos de embalagem na base_mestre
 */
migrate(
  (app) => {
    try {
      // 1. Atualizar registros que possuem "20L" na embalagem ou nome
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET quantidade_embalagem_principal = 20,
            unidade_medida_principal = 'L',
            forma_acondicionamento = 'Bombona',
            embalagem_original = COALESCE(NULLIF(embalagem, ''), '1X20L (20 L)'),
            ncm_especifica = ncm_padrao
        WHERE (embalagem LIKE '%20L%' OR nome_completo LIKE '%20L%')
      `)
        .execute()

      // 2. Atualizar registros que possuem "5L" na embalagem ou nome
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET quantidade_embalagem_principal = 5,
            unidade_medida_principal = 'L',
            forma_acondicionamento = 'Galão',
            embalagem_original = COALESCE(NULLIF(embalagem, ''), '4X5L (5 L)'),
            ncm_especifica = ncm_padrao
        WHERE (embalagem LIKE '%5L%' OR nome_completo LIKE '%5L%')
          AND (quantidade_embalagem_principal IS NULL OR quantidade_embalagem_principal = 0)
      `)
        .execute()

      // 3. Atualizar registros que possuem "1L" na embalagem ou nome
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET quantidade_embalagem_principal = 1,
            unidade_medida_principal = 'L',
            forma_acondicionamento = 'Frasco',
            embalagem_original = COALESCE(NULLIF(embalagem, ''), '12X1L (1 L)'),
            ncm_especifica = ncm_padrao
        WHERE (embalagem LIKE '%1L%' OR nome_completo LIKE '%1L%')
          AND (quantidade_embalagem_principal IS NULL OR quantidade_embalagem_principal = 0)
      `)
        .execute()

      // 4. Atualizar registros com KG / SACO
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET quantidade_embalagem_principal = 20,
            unidade_medida_principal = 'KG',
            forma_acondicionamento = 'Saco',
            embalagem_original = COALESCE(NULLIF(embalagem, ''), 'Saco 20 kg'),
            ncm_especifica = '3808.93.24'
        WHERE (embalagem LIKE '%KG%' OR embalagem LIKE '%SACO%' OR nome_completo LIKE '%SACO%' OR nome_completo LIKE '%ROUNDUP WG%')
      `)
        .execute()

      // 5. Fallback para quaisquer outros que ainda estejam com 0
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET quantidade_embalagem_principal = 20,
            unidade_medida_principal = 'L',
            forma_acondicionamento = 'Bombona',
            embalagem_original = COALESCE(NULLIF(embalagem, ''), '1X20L (20 L)'),
            ncm_especifica = COALESCE(NULLIF(ncm_padrao, ''), '3808.93.24')
        WHERE quantidade_embalagem_principal IS NULL OR quantidade_embalagem_principal = 0
      `)
        .execute()

      // 6. Garantir regra crítica do ROUNDUP WG (MAPA 002094): NCM 38089324 / 3808.93.24
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET ncm_especifica = '3808.93.24',
            ncm_padrao = '3808.93.24',
            ncm = '38089324',
            forma_acondicionamento = 'Saco',
            unidade_medida_principal = 'KG',
            quantidade_embalagem_principal = 20
        WHERE registro_mapa LIKE '%002094%' OR marca_padronizada = 'ROUNDUP WG' OR nome_completo LIKE '%ROUNDUP WG%'
      `)
        .execute()
    } catch (err) {
      console.log('Erro na migration 1740000029:', err.message || err)
    }
  },
  (app) => {},
)
