/**
 * pocketbase/migrations/1740000033_corrigir_roundup_original_mais_bula.js
 *
 * Correção do registro MAPA e nome comercial do ROUNDUP ORIGINAL MAIS no banco:
 * 1. O extrator de PDF anterior capturou erroneamente o registro do produto técnico (Nº 01998)
 *    e truncou o nome comercial ("ROUNDUP ORIGINAL" em vez de "ROUNDUP ORIGINAL MAIS").
 * 2. Esta migração corrige os registros da importação de bula que foram gravados com Nº 01998
 *    ou nome "ROUNDUP ORIGINAL" para o correto registro comercial Nº 01119 e nome "ROUNDUP ORIGINAL MAIS".
 * 3. Preserva todos os blocos acessórios vinculados: bula_composicao, bula_empresas, bula_embalagens,
 *    bula_culturas, bula_alvos, bula_aplicacao e espelho tributário na base_mestre.
 * 4. Idempotente: seguro para reexecuções em bases novas ou já migradas.
 */

migrate(
  (app) => {
    // 1. Atualiza bula_produtos
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_produtos
        SET
          registro_mapa = 'Nº 01119',
          nome_comercial = 'ROUNDUP ORIGINAL MAIS',
          marca_padronizada = 'ROUNDUP ORIGINAL MAIS',
          ncm_padrao = '3808.93.29'
        WHERE (registro_mapa = 'Nº 01998' OR registro_mapa = '01998')
          AND (nome_comercial = 'ROUNDUP ORIGINAL' OR nome_comercial = 'ROUNDUP ORIGINAL MAIS' OR titular_registro LIKE '%MONSANTO%');
      `)
        .execute()
    } catch (e1) {
      console.log('Aviso ao atualizar bula_produtos na migration 1740000033:', e1.message || e1)
    }

    // 2. Atualiza bula_composicao
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_composicao
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa = 'Nº 01998' OR registro_mapa = '01998')
          AND (nome_produto = 'ROUNDUP ORIGINAL' OR nome_produto = 'ROUNDUP ORIGINAL MAIS' OR ingrediente_ativo LIKE '%GLIFOSATO%');
      `)
        .execute()
    } catch (e2) {
      console.log('Aviso ao atualizar bula_composicao na migration 1740000033:', e2.message || e2)
    }

    // 3. Atualiza bula_empresas
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_empresas
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa = 'Nº 01998' OR registro_mapa = '01998')
          AND (nome_produto = 'ROUNDUP ORIGINAL' OR nome_produto = 'ROUNDUP ORIGINAL MAIS' OR razao_social LIKE '%MONSANTO%');
      `)
        .execute()
    } catch (e3) {
      console.log('Aviso ao atualizar bula_empresas na migration 1740000033:', e3.message || e3)
    }

    // 4. Atualiza bula_embalagens
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_embalagens
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS',
          ncm = '3808.93.29'
        WHERE (registro_mapa = 'Nº 01998' OR registro_mapa = '01998')
          AND (nome_produto = 'ROUNDUP ORIGINAL' OR nome_produto = 'ROUNDUP ORIGINAL MAIS');
      `)
        .execute()
    } catch (e4) {
      console.log('Aviso ao atualizar bula_embalagens na migration 1740000033:', e4.message || e4)
    }

    // 5. Atualiza bula_culturas
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_culturas
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa = 'Nº 01998' OR registro_mapa = '01998')
          AND (nome_produto = 'ROUNDUP ORIGINAL' OR nome_produto = 'ROUNDUP ORIGINAL MAIS');
      `)
        .execute()
    } catch (e5) {
      console.log('Aviso ao atualizar bula_culturas na migration 1740000033:', e5.message || e5)
    }

    // 6. Atualiza bula_alvos
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_alvos
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa = 'Nº 01998' OR registro_mapa = '01998')
          AND (nome_produto = 'ROUNDUP ORIGINAL' OR nome_produto = 'ROUNDUP ORIGINAL MAIS');
      `)
        .execute()
    } catch (e6) {
      console.log('Aviso ao atualizar bula_alvos na migration 1740000033:', e6.message || e6)
    }

    // 7. Atualiza bula_aplicacao
    try {
      app
        .db()
        .newQuery(`
        UPDATE bula_aplicacao
        SET
          registro_mapa = 'Nº 01119',
          nome_produto = 'ROUNDUP ORIGINAL MAIS'
        WHERE (registro_mapa = 'Nº 01998' OR registro_mapa = '01998')
          AND (nome_produto = 'ROUNDUP ORIGINAL' OR nome_produto = 'ROUNDUP ORIGINAL MAIS');
      `)
        .execute()
    } catch (e7) {
      console.log('Aviso ao atualizar bula_aplicacao na migration 1740000033:', e7.message || e7)
    }

    // 8. Atualiza espelho na base_mestre (registros gerados por BULA_PDF_ESPELHO_TRIBUTARIO)
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
        WHERE (registro_mapa = 'Nº 01998' OR registro_mapa = '01998')
          AND (nome_produto = 'ROUNDUP ORIGINAL' OR nome_produto = 'ROUNDUP ORIGINAL MAIS' OR titular_fabricante LIKE '%MONSANTO%');
      `)
        .execute()
    } catch (e8) {
      console.log('Aviso ao atualizar base_mestre na migration 1740000033:', e8.message || e8)
    }
  },
  (app) => {
    // Reversão
  },
)
