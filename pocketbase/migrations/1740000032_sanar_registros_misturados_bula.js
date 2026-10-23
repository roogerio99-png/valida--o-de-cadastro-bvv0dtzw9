/**
 * Migration 1740000032_sanar_registros_misturados_bula.js
 *
 * Remove cadastros corrompidos ou gerados com erro de teste anterior (ex: Nº 01998)
 * e garante que não haja contaminação cruzada nas coleções de Bula e na Base Mestre.
 */

migrate(
  (app) => {
    // 1. Remover registros espúrios com MAPA 01998 ou registros órfãos/misturados
    const tabelasBula = [
      'bula_produtos',
      'bula_composicao',
      'bula_empresas',
      'bula_embalagens',
      'bula_culturas',
      'bula_alvos',
      'bula_aplicacao',
    ]

    for (let t = 0; t < tabelasBula.length; t++) {
      const nomeTab = tabelasBula[t]
      try {
        const registros01998 =
          app.findRecordsByFilter(
            nomeTab,
            "registro_mapa = 'Nº 01998' || registro_mapa = '01998'",
            '',
            100,
            0,
          ) || []
        for (let r = 0; r < registros01998.length; r++) {
          app.delete(registros01998[r])
        }
      } catch (errTab) {
        console.log(`Aviso ao limpar ${nomeTab}:`, errTab.message || errTab)
      }
    }

    // 2. Limpar qualquer registro corrompido de SULFENTRAZONE ou MAPA 03820 que possa ter misturado
    for (let t = 0; t < tabelasBula.length; t++) {
      const nomeTab = tabelasBula[t]
      try {
        const registrosSulf =
          app.findRecordsByFilter(
            nomeTab,
            "registro_mapa ~ '03820' || nome_produto ~ 'SULFENTRAZONE'",
            '',
            100,
            0,
          ) || []
        for (let r = 0; r < registrosSulf.length; r++) {
          app.delete(registrosSulf[r])
        }
      } catch (errSulf) {
        console.log(`Aviso ao limpar ${nomeTab} para 03820:`, errSulf.message || errSulf)
      }
    }

    // 3. Limpar na base_mestre qualquer espelho corrompido de SULFENTRAZONE / 03820
    try {
      const mestreSulf =
        app.findRecordsByFilter(
          'base_mestre',
          "registro_mapa ~ '03820' || marca_padronizada ~ 'SULFENTRAZONE' || nome_produto ~ 'SULFENTRAZONE'",
          '',
          100,
          0,
        ) || []
      for (let m = 0; m < mestreSulf.length; m++) {
        app.delete(mestreSulf[m])
      }
    } catch (errMestre) {
      console.log('Aviso ao limpar base_mestre para 03820:', errMestre.message || errMestre)
    }
  },
  (app) => {
    // Reversão no-op
  },
)
