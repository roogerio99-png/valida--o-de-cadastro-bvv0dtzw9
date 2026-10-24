/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Limpa registros incompletos/corrompidos da importação anterior do ROUNDUP ORIGINAL MAIS (Nº 01119) na bula_empresas.
    // Isso permite que o novo parser reconstrua de forma 100% limpa as 10 ocorrências corretas na próxima importação/gravação,
    // sem duplicar ou manter registros com razão social espúria como 'SP MONSANTO DO BRASIL LTDA'.
    try {
      app
        .db()
        .newQuery(`
      DELETE FROM bula_empresas
      WHERE (registro_mapa = 'Nº 01119' OR registro_mapa = 'Nº 1119')
        AND (razao_social LIKE 'SP %' OR endereco = '' OR endereco IS NULL OR razao_social = 'Monsanto' OR razao_social = 'Bayer')
    `)
        .execute()
    } catch (err) {
      console.log('[1740000037_limpar_empresas_incompletas_01119] Aviso ao limpar:', err)
    }
  },
  (app) => {
    // Operação irreversível idempotente de saneamento
  },
)
