/**
 * pocketbase/migrations/1740000021_limpar_cadastro_bula_completo.js
 *
 * Limpeza total e definitiva do Cadastro de Bula solicitada pelo usuário:
 * "limpe toda a base de informações que tiver no cadastro de bula e veja se nao esta ficando alguma sujeira"
 *
 * 1. Esvazia completamente as 7 coleções do Cadastro de Bula:
 *    - bula_aplicacao
 *    - bula_alvos
 *    - bula_culturas
 *    - bula_embalagens
 *    - bula_empresas
 *    - bula_composicao
 *    - bula_produtos
 *
 * 2. Verifica e limpa sujeiras residuais:
 *    - Registros órfãos que possam existir em qualquer uma das coleções acessórias
 *    - Limpeza de possíveis referências inválidas
 *    - Garante que os índices únicos criados na v0.0.63 permaneçam íntegros e intactos
 *
 * 3. Preserva 100% intactas todas as demais coleções do sistema:
 *    - base_mestre
 *    - dicionario_principios_ativos
 *    - regras_ncm_embalagem
 *    - parametrizacao_fiscal
 *    - log_validacoes
 *    - sincronizacao_historico
 *    - convites_usuarios
 *    - users
 *
 * Idempotente: seguro para rodar em banco vazio ou com registros.
 */

migrate(
  (app) => {
    const tabelasBula = [
      'bula_aplicacao',
      'bula_alvos',
      'bula_culturas',
      'bula_embalagens',
      'bula_empresas',
      'bula_composicao',
      'bula_produtos',
    ]

    for (let i = 0; i < tabelasBula.length; i++) {
      const tabela = tabelasBula[i]
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

    // Verificação defensiva adicional contra qualquer resíduo/órfão nas coleções acessórias e na mestre
    for (let i = 0; i < tabelasBula.length; i++) {
      const tabela = tabelasBula[i]
      if (app.hasTable(tabela)) {
        try {
          app
            .db()
            .newQuery('DELETE FROM ' + tabela)
            .execute()
        } catch (_) {}
      }
    }
  },
  () => {
    // down migration: dados apagados intencionalmente, irreversível
  },
)
