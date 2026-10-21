/**
 * pocketbase/migrations/1740000017_limpar_cadastro_bula_inicial.js
 *
 * Limpeza imediata solicitada pelo usuário:
 * "limpe toda a base de cadastro de bula"
 *
 * Apaga TODOS os registros das 7 coleções do Cadastro de Bula:
 * - bula_aplicacao
 * - bula_alvos
 * - bula_culturas
 * - bula_embalagens
 * - bula_empresas
 * - bula_composicao
 * - bula_produtos
 *
 * Preserva 100% intactas todas as outras coleções:
 * base_mestre, users, regras_ncm_embalagem, dicionario_principios_ativos, etc.
 *
 * Idempotente: se já estiverem vazias ou as tabelas não existirem, no-op seguro.
 */

migrate(
  (app) => {
    const tabelas = [
      'bula_aplicacao',
      'bula_alvos',
      'bula_culturas',
      'bula_embalagens',
      'bula_empresas',
      'bula_composicao',
      'bula_produtos',
    ]

    for (let i = 0; i < tabelas.length; i++) {
      const tabela = tabelas[i]
      if (app.hasTable(tabela)) {
        try {
          const col = app.findCollectionByNameOrId(tabela)
          app.truncateCollection(col)
        } catch (err) {
          try {
            app
              .db()
              .newQuery('DELETE FROM ' + tabela)
              .execute()
          } catch (_) {}
        }
      }
    }
  },
  () => {
    // down migration: os dados apagados não são restauráveis
  },
)
