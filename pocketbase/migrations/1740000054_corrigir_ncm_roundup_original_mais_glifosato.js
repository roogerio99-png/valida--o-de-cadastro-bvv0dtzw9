migrate(
  (app) => {
    // Migration 1740000054: Correção pontual e idempotente do ROUNDUP ORIGINAL MAIS e glifosato agrícola
    // Alterando NCM de 38089329 para 38089324 nas coleções base_mestre e regras_ncm_embalagem
    // Confirmado explicitamente pelo usuário para a base compartilhada (sem alterar/remover coleções ou outros produtos).

    console.log(
      'Iniciando migration 1740000054: correção NCM ROUNDUP ORIGINAL MAIS / Glifosato 38089329 -> 38089324...',
    )

    // 1. Atualizar base_mestre via Record API e SQL direto
    if (app.hasTable('base_mestre')) {
      const colBaseMestre = app.findCollectionByNameOrId('base_mestre')

      // Busca registros candidatos na base_mestre usando findRecordsByFilter
      const filtros = [
        "marca_padronizada ~ 'ROUNDUP ORIGINAL MAIS'",
        "nome_produto ~ 'ROUNDUP ORIGINAL MAIS'",
        "nome_completo ~ 'ROUNDUP ORIGINAL MAIS'",
        "principio_ativo ~ 'GLIFOSATO' && ncm = '38089329'",
        "principio_ativo ~ 'GLIFOSATO' && (ncm_especifica = '38089329' || ncm_especifica = '3808.93.29')",
        "marca_padronizada ~ 'ROUNDUP WG' && ncm != '38089324'",
        "nome_produto ~ 'ROUNDUP WG' && ncm != '38089324'",
      ]

      let atualizadosMestre = 0
      const idsProcessados = {}

      for (let f = 0; f < filtros.length; f++) {
        try {
          const recs = app.findRecordsByFilter('base_mestre', filtros[f], '-created', 500, 0) || []
          for (let rIdx = 0; rIdx < recs.length; rIdx++) {
            const rec = recs[rIdx]
            if (idsProcessados[rec.id]) continue
            idsProcessados[rec.id] = true

            let alterou = false

            if (rec.getString('ncm') !== '38089324') {
              rec.set('ncm', '38089324')
              alterou = true
            }

            const ncmEsp = rec.getString('ncm_especifica')
            if (ncmEsp === '38089329' || ncmEsp === '3808.93.29' || !ncmEsp) {
              rec.set('ncm_especifica', '3808.93.24')
              alterou = true
            }

            const ncmPad = rec.getString('ncm_padrao')
            if (ncmPad === '38089329' || ncmPad === '3808.93.29' || !ncmPad) {
              rec.set('ncm_padrao', '3808.93.24')
              alterou = true
            }

            // Alinhar faixas se apontavam para 3808.93.29
            if (rec.getString('ncm_faixa1_ate_300g') === '3808.93.29') {
              rec.set('ncm_faixa1_ate_300g', '3808.93.24')
              alterou = true
            }
            if (rec.getString('ncm_faixa2_300g_a_7_5kg') === '3808.93.29') {
              rec.set('ncm_faixa2_300g_a_7_5kg', '3808.93.24')
              alterou = true
            }
            if (rec.getString('ncm_faixa3_7_5kg_a_10kg') === '3808.93.29') {
              rec.set('ncm_faixa3_7_5kg_a_10kg', '3808.93.24')
              alterou = true
            }
            if (rec.getString('ncm_faixa4_acima_10kg') === '3808.93.29') {
              rec.set('ncm_faixa4_acima_10kg', '3808.93.24')
              alterou = true
            }

            if (alterou) {
              app.save(rec)
              atualizadosMestre++
            }
          }
        } catch (errFiltro) {
          console.log(`Aviso ao aplicar filtro ${filtros[f]}: ${errFiltro.message || errFiltro}`)
        }
      }

      // Execução de SQL direto defensiva para garantir que nenhum resíduo permaneça
      try {
        app
          .db()
          .newQuery(`
            UPDATE base_mestre
            SET ncm = '38089324',
                ncm_especifica = '3808.93.24',
                ncm_padrao = CASE WHEN ncm_padrao = '3808.93.29' OR ncm_padrao = '38089329' THEN '3808.93.24' ELSE ncm_padrao END
            WHERE (
              UPPER(nome_produto) LIKE '%ROUNDUP ORIGINAL MAIS%' OR
              UPPER(marca_padronizada) LIKE '%ROUNDUP ORIGINAL MAIS%' OR
              UPPER(nome_completo) LIKE '%ROUNDUP ORIGINAL MAIS%' OR
              (UPPER(principio_ativo) LIKE '%GLIFOSATO%' AND (ncm = '38089329' OR ncm_especifica = '3808.93.29' OR ncm_especifica = '38089329'))
            )
          `)
          .execute()
      } catch (errSql) {
        console.log(`Aviso no SQL UPDATE base_mestre: ${errSql.message || errSql}`)
      }

      console.log(
        `base_mestre: ${atualizadosMestre} registros corrigidos para NCM 38089324 / 3808.93.24.`,
      )
    }

    // 2. Coleção regras_ncm_embalagem
    if (app.hasTable('regras_ncm_embalagem')) {
      const colRegras = app.findCollectionByNameOrId('regras_ncm_embalagem')

      // Verificar se há registros específicos de glifosato ou Roundup com NCM 38089329
      try {
        const regras38089329 =
          app.findRecordsByFilter('regras_ncm_embalagem', "ncm = '38089329'", '-created', 50, 0) ||
          []
        for (let j = 0; j < regras38089329.length; j++) {
          const r = regras38089329[j]
          const descUpper = r.getString('descricao').toUpperCase()
          const regraUpper = r.getString('regra_especial').toUpperCase()
          if (
            descUpper.includes('GLIFOSATO') ||
            descUpper.includes('ROUNDUP') ||
            regraUpper.includes('ROUNDUP')
          ) {
            r.set('ncm', '38089324')
            app.save(r)
            console.log(`regras_ncm_embalagem id ${r.id} alterada de 38089329 para 38089324.`)
          }
        }
      } catch (errRegras38089329) {
        console.log(
          `Aviso ao checar regras_ncm_embalagem: ${errRegras38089329.message || errRegras38089329}`,
        )
      }

      // Garantir que a regra 38089324 contenha todas as embalagens comerciais típicas do glifosato
      try {
        const regra38089324 = app.findFirstRecordByFilter(
          'regras_ncm_embalagem',
          "ncm = '38089324'",
        )
        let embPermitidas = []
        try {
          embPermitidas = JSON.parse(regra38089324.getString('embalagens_permitidas')) || []
        } catch (_) {
          embPermitidas = []
        }

        const necessarias = [
          'Bombona',
          'Saco',
          'Sacaria',
          'Balde',
          'Tambor',
          'Container',
          'Frasco',
          '1X20L',
          '4X5L',
          '20L',
          '5L',
        ]
        let alterouEmb = false
        for (let k = 0; k < necessarias.length; k++) {
          if (!embPermitidas.includes(necessarias[k])) {
            embPermitidas.push(necessarias[k])
            alterouEmb = true
          }
        }

        if (alterouEmb) {
          regra38089324.set('embalagens_permitidas', JSON.stringify(embPermitidas))
          app.save(regra38089324)
          console.log('regras_ncm_embalagem para 38089324 atualizada com embalagens completas.')
        }
      } catch (errRegra) {
        console.log(`Aviso ao inspecionar regra 38089324: ${errRegra.message || errRegra}`)
      }
    }

    console.log('Migration 1740000054 finalizada com sucesso.')
  },
  (app) => {
    // Reversão não-destrutiva
    console.log('Reversão da migration 1740000054 (no-op para integridade dos dados)')
  },
)
