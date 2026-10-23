/**
 * pocketbase/migrations/1740000034_garantir_registro_comercial_roundup_original_mais.js
 *
 * Correção e saneamento de registros MAPA do ROUNDUP ORIGINAL MAIS:
 * - Garante que nenhum registro de ROUNDUP ORIGINAL / ROUNDUP ORIGINAL MAIS permaneça
 *   com registro_mapa do produto técnico ('01998' ou 'Nº 01998').
 * - Atualiza todas as coleções (bula_produtos, bula_composicao, bula_empresas,
 *   bula_embalagens, bula_culturas, bula_alvos, bula_aplicacao e espelho base_mestre)
 *   para o registro comercial oficial 'Nº 01119' e nome comercial completo 'ROUNDUP ORIGINAL MAIS'.
 * - Garante NCM 3808.93.29 (exclusividade de 3808.93.24 apenas para ROUNDUP WG).
 * - Idempotente: seguro para reexecuções em bases vazias ou já corrigidas.
 */

migrate(
  (app) => {
    // 1. bula_produtos
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_produtos
        SET
          registro_mapa = 'Nº 01119',
          mapa_oficial_limpo = '01119',
          nome_comercial = 'ROUNDUP ORIGINAL MAIS',
          marca_padronizada = 'ROUNDUP ORIGINAL MAIS',
          ncm_padrao = '3808.93.29'
        WHERE (registro_mapa LIKE '%01998%' OR registro_mapa LIKE '%1998%')
          AND (
            nome_comercial LIKE '%ROUNDUP ORIGINAL%'
            OR marca_padronizada LIKE '%ROUNDUP ORIGINAL%'
            OR titular_registro LIKE '%MONSANTO%'
            OR titular_registro LIKE '%BAYER%'
            OR principio_ativo LIKE '%GLIFOSATO%'
          );
      `)
        .execute()
    } catch (e1) {
      console.log('Aviso ao sanear bula_produtos (migration 1740000034):', e1.message || e1)
    }

    // 2. bula_composicao
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_composicao
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa LIKE '%01998%' OR registro_mapa LIKE '%1998%')
          AND (
            nome_produto LIKE '%ROUNDUP ORIGINAL%'
            OR ingrediente_ativo LIKE '%GLIFOSATO%'
          );
      `)
        .execute()
    } catch (e2) {
      console.log('Aviso ao sanear bula_composicao (migration 1740000034):', e2.message || e2)
    }

    // 3. bula_empresas
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_empresas
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa LIKE '%01998%' OR registro_mapa LIKE '%1998%')
          AND (
            nome_produto LIKE '%ROUNDUP ORIGINAL%'
            OR razao_social LIKE '%MONSANTO%'
            OR razao_social LIKE '%BAYER%'
          );
      `)
        .execute()
    } catch (e3) {
      console.log('Aviso ao sanear bula_empresas (migration 1740000034):', e3.message || e3)
    }

    // 4. bula_embalagens
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_embalagens
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS',
          ncm = '3808.93.29'
        WHERE (registro_mapa LIKE '%01998%' OR registro_mapa LIKE '%1998%')
          AND (nome_produto LIKE '%ROUNDUP ORIGINAL%');
      `)
        .execute()
    } catch (e4) {
      console.log('Aviso ao sanear bula_embalagens (migration 1740000034):', e4.message || e4)
    }

    // 5. bula_culturas
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_culturas
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa LIKE '%01998%' OR registro_mapa LIKE '%1998%')
          AND (nome_produto LIKE '%ROUNDUP ORIGINAL%');
      `)
        .execute()
    } catch (e5) {
      console.log('Aviso ao sanear bula_culturas (migration 1740000034):', e5.message || e5)
    }

    // 6. bula_alvos
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_alvos
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa LIKE '%01998%' OR registro_mapa LIKE '%1998%')
          AND (nome_produto LIKE '%ROUNDUP ORIGINAL%');
      `)
        .execute()
    } catch (e6) {
      console.log('Aviso ao sanear bula_alvos (migration 1740000034):', e6.message || e6)
    }

    // 7. bula_aplicacao
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_aplicacao
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa LIKE '%01998%' OR registro_mapa LIKE '%1998%')
          AND (nome_produto LIKE '%ROUNDUP ORIGINAL%');
      `)
        .execute()
    } catch (e7) {
      console.log('Aviso ao sanear bula_aplicacao (migration 1740000034):', e7.message || e7)
    }

    // 8. base_mestre (espelho tributário e cadastros manuais/planilha)
    try {
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS',
          nome_completo = 'ROUNDUP ORIGINAL MAIS',
          marca_padronizada = 'ROUNDUP ORIGINAL MAIS',
          ncm = '38089329',
          ncm_padrao = '3808.93.29',
          ncm_especifica = '3808.93.29',
          ncm_faixa1_ate_300g = '3808.93.29',
          ncm_faixa2_300g_a_7_5kg = '3808.93.29',
          ncm_faixa3_7_5kg_a_10kg = '3808.93.29',
          ncm_faixa4_acima_10kg = '3808.93.29'
        WHERE (registro_mapa LIKE '%01998%' OR registro_mapa LIKE '%1998%')
          AND (
            nome_produto LIKE '%ROUNDUP ORIGINAL%'
            OR nome_completo LIKE '%ROUNDUP ORIGINAL%'
            OR titular_fabricante LIKE '%MONSANTO%'
            OR titular_fabricante LIKE '%BAYER%'
          );
      `)
        .execute()
    } catch (e8) {
      console.log('Aviso ao sanear base_mestre (migration 1740000034):', e8.message || e8)
    }
  },
  (app) => {
    // Reversão no-op
  },
)
