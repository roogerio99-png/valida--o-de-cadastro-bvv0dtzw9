/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Limpeza idempotente dos registros antigos/incompletos de bula_empresas vinculados ao registro Nº 01119 (ROUNDUP ORIGINAL MAIS).
    // Apenas os registros de 01119 são removidos para permitir que a reimportação reconstrua
    // as 10 empresas (titular, fabricantes, formuladores, importadores) completas.
    // Registros de outros produtos (SULFENTRAZONE 03820, ROUNDUP WG 002094, etc.) permanecem rigorosamente intocados.
    try {
      app
        .db()
        .newQuery(`
          DELETE FROM bula_empresas
          WHERE (registro_mapa = 'Nº 01119' OR registro_mapa = '01119' OR registro_mapa = 'Nº 1119')
        `)
        .execute()
      console.log(
        '[1740000038_limpar_empresas_incompletas_01119_total] Registros antigos de bula_empresas (Nº 01119) limpos com sucesso.',
      )
    } catch (err) {
      console.log('[1740000038_limpar_empresas_incompletas_01119_total] Aviso ao limpar:', err)
    }
  },
  (app) => {
    // Operação idempotente de saneamento
  },
)
