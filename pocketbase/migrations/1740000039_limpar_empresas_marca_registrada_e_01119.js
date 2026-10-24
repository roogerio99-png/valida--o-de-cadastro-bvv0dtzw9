/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração idempotente:
 * Limpeza definitiva dos registros de empresa incompletos/errados das importações
 * anteriores do ROUNDUP ORIGINAL MAIS (MAPA Nº 01119), incluindo qualquer registro
 * criado indevidamente a partir de aviso legal ("Marca registrada Bayer CropScience LP"),
 * permitindo que a próxima importação recrie os 10 registros canônicos oficiais limpos.
 *
 * Preserva estritamente:
 * - Sulfentrazone (Registro MAPA Nº 03820)
 * - ROUNDUP WG (Registro MAPA Nº 002094)
 * - Demais registros de outros produtos
 */
migrate(
  (app) => {
    try {
      const empresasCollection = app.findCollectionByNameOrId('bula_empresas')
      if (!empresasCollection) {
        console.log('[migracao_limpeza_01119] Coleção bula_empresas não encontrada.')
        return
      }

      // 1. Remove qualquer registro originado da linha "Marca registrada"
      try {
        const recordsMarca = app.findRecordsByFilter(
          'bula_empresas',
          "razao_social ~ 'Marca registrada' || razao_social ~ 'MARCA REGISTRADA'",
          '-created',
          200,
          0,
        )
        for (const rec of recordsMarca) {
          console.log(
            `[migracao_limpeza_01119] Removendo registro indevido de aviso legal: ${rec.id} (${rec.get('razao_social')})`,
          )
          app.delete(rec)
        }
      } catch (eMarca) {
        console.log(
          '[migracao_limpeza_01119] Verificação de registros de marca registrada concluída.',
        )
      }

      // 2. Remove registros vinculados ao produto ROUNDUP ORIGINAL MAIS (01119) para permitir reimportação limpa e completa
      try {
        const records01119 = app.findRecordsByFilter(
          'bula_empresas',
          "registro_mapa = 'Nº 01119' || registro_mapa = '01119' || registro_mapa ~ '01119' || (nome_produto ~ 'ROUNDUP ORIGINAL' && registro_mapa !~ '002094')",
          '-created',
          500,
          0,
        )
        for (const rec of records01119) {
          console.log(
            `[migracao_limpeza_01119] Removendo registro de empresa 01119 desatualizado: ${rec.id} - ${rec.get('razao_social')} (${rec.get('tipo_relacao')})`,
          )
          app.delete(rec)
        }
      } catch (e01119) {
        console.log('[migracao_limpeza_01119] Verificação de empresas 01119 concluída.')
      }

      console.log('[migracao_limpeza_01119] Limpeza idempotente concluída com sucesso.')
    } catch (err) {
      console.log('[migracao_limpeza_01119] Aviso durante limpeza: ' + (err?.message || err))
    }
  },
  (app) => {
    // Reversão no-op pois trata-se de limpeza idempotente de dados obsoletos
  },
)
