/**
 * pocketbase/migrations/1740000036_limpar_ncm_colecoes_bula.js
 *
 * Limpa o campo NCM de todas as coleções analíticas do Cadastro de Bula
 * (bula_produtos e bula_embalagens), deixando a Bula sem dados tributários de NCM.
 * A NCM passa a ser estrita e exclusivamente resolvida e validada na Base Mestre por embalagem comercial.
 * Idempotente: seguro em base preenchida e no-op em base vazia. Não toca na base_mestre.
 */

migrate(
  (app) => {
    // 1. Limpar campos de NCM na coleção bula_produtos se a tabela existir
    if (app.hasTable('bula_produtos')) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE bula_produtos SET ncm_padrao = '', ncm_oficial_exata = '' WHERE ncm_padrao != '' OR ncm_oficial_exata != ''`,
          )
          .execute()
        console.log('Migração 1740000036: NCM limpa com sucesso em bula_produtos.')
      } catch (err) {
        console.log('Aviso ao limpar NCM em bula_produtos:', err && err.message ? err.message : err)
      }
    }

    // 2. Limpar campos de NCM na coleção bula_embalagens se a tabela existir
    if (app.hasTable('bula_embalagens')) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE bula_embalagens SET ncm = '', ncm_faixa = '' WHERE ncm != '' OR ncm_faixa != ''`,
          )
          .execute()
        console.log('Migração 1740000036: NCM limpa com sucesso em bula_embalagens.')
      } catch (err) {
        console.log(
          'Aviso ao limpar NCM em bula_embalagens:',
          err && err.message ? err.message : err,
        )
      }
    }
  },
  (app) => {
    // Rollback no-op defensivo
    console.log('Rollback da migração 1740000036: NCMs em coleções da bula permanecem limpas.')
  },
)
