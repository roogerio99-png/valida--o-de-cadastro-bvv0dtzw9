migrate(
  (app) => {
    // Limpeza sob demanda solicitada pelo usuário:
    // "limpe toda a base de produtos e principios ativo"
    // Apaga TODOS os registros das coleções 'base_mestre' e 'dicionario_principios_ativos'
    // Mantém intactas: log_validacoes, sincronizacao_historico, regras_ncm_embalagem, parametrizacao_fiscal, users.

    const countBase = app.countRecords('base_mestre')
    const countPa = app.countRecords('dicionario_principios_ativos')

    console.log(
      `[Migration 0010] Limpando base_mestre (${countBase} registros) e dicionario_principios_ativos (${countPa} registros)...`,
    )

    try {
      const colBase = app.findCollectionByNameOrId('base_mestre')
      app.truncateCollection(colBase)
    } catch (_) {
      app.db().newQuery('DELETE FROM base_mestre').execute()
    }

    try {
      const colPa = app.findCollectionByNameOrId('dicionario_principios_ativos')
      app.truncateCollection(colPa)
    } catch (_) {
      app.db().newQuery('DELETE FROM dicionario_principios_ativos').execute()
    }

    console.log('[Migration 0010] Limpeza concluída com sucesso.')
  },
  () => {
    // Reversão não recupera registros excluídos intencionalmente
  },
)
