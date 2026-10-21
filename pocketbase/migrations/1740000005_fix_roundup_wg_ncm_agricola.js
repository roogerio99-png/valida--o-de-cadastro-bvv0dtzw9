migrate(
  (app) => {
    // Migration 1740000005: Corrigir ROUNDUP WG e cadastros formulados comerciais contraditórios na base_mestre
    // e alinhar matriz de princípios ativos.
    // Idempotente para executar com sucesso em bases povoadas ou vazias.

    // 1. Corrigir o registro específico do ROUNDUP WG (MAPA Nº 002094)
    try {
      const roundupRecords =
        app.findRecordsByFilter(
          'base_mestre',
          "registro_mapa ~ '002094' || registro_mapa ~ '2094' || marca_padronizada = 'ROUNDUP WG' || nome_produto = 'ROUNDUP WG'",
          '-created',
          50,
          0,
        ) || []

      for (const rec of roundupRecords) {
        rec.set('ncm', '38089234')
        rec.set('ncm_padrao', '3808.92.34')
        rec.set('ncm_faixa1_ate_300g', '3808.92.34')
        rec.set('ncm_faixa2_300g_a_7_5kg', '3808.92.34')
        rec.set('ncm_faixa3_7_5kg_a_10kg', '3808.92.34')
        rec.set('ncm_faixa4_acima_10kg', '3808.92.34')
        rec.set('sub_grupo', 'Herbicida')
        rec.set('macro_grupo', 'Defensivos')
        rec.set('macro_grupo_subgrupo', 'Defensivos — Herbicida')
        rec.set('tipo_produto', 'Produto Formulado Comercial')
        rec.set('sistema_norma_mapa', 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)')
        rec.set(
          'regra_tipi',
          'Posição 38.08 TIPI: Embalagem comercial agrícola usa subitens agrícolas (.2x/.9x), vedada subposição domissanitária (.1x)',
        )
        rec.set(
          'regra_tipi_embalagem',
          'Posição 38.08 TIPI: Embalagem comercial agrícola usa subitens agrícolas (.2x/.9x), vedada subposição domissanitária (.1x)',
        )
        rec.set(
          'status_pis_cofins',
          'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
        )
        rec.set('cst_saida', 'CST 06')
        rec.set('cst_entrada', 'CST 73')
        rec.set('cst_recomendado', 'Saída: CST 06 | Entrada: CST 73')
        app.save(rec)
      }
    } catch (err) {
      console.log('Aviso ao corrigir ROUNDUP WG:', err.message)
    }

    // 2. Varrer toda a base_mestre atrás de formulados comerciais com ncm_padrao contraditório (.1x técnico/domissanitário)
    // ou sub_grupo poluído com "Produto Técnico"
    try {
      const formulados =
        app.findRecordsByFilter(
          'base_mestre',
          "tipo_produto = 'Produto Formulado Comercial'",
          '-created',
          2000,
          0,
        ) || []

      for (const rec of formulados) {
        let modificado = false
        const sub = rec.getString('sub_grupo') || ''
        const macroSub = rec.getString('macro_grupo_subgrupo') || ''
        const ncmPadrao = rec.getString('ncm_padrao') || rec.getString('ncm') || ''
        const f1 = rec.getString('ncm_faixa1_ate_300g') || ''
        const f2 = rec.getString('ncm_faixa2_300g_a_7_5kg') || ''
        const f3 = rec.getString('ncm_faixa3_7_5kg_a_10kg') || ''
        const f4 = rec.getString('ncm_faixa4_acima_10kg') || ''
        const pa = rec.getString('principio_ativo') || ''
        const paUpper = pa.toUpperCase()

        // 2.1 Limpar sub_grupo poluído
        if (sub.includes('Produto Técnico') || sub.includes('Insumo Industrial')) {
          let subLimpo = 'Herbicida'
          if (sub.includes('Fungicida') || paUpper.includes('FUNGICIDA')) {
            subLimpo = 'Fungicida'
          } else if (sub.includes('Inseticida') || paUpper.includes('INSETICIDA')) {
            subLimpo = 'Inseticida'
          }
          rec.set('sub_grupo', subLimpo)
          rec.set('macro_grupo_subgrupo', `Defensivos — ${subLimpo}`)
          modificado = true
        }

        // 2.2 Se o ncm_padrao for de domissanitário / técnico (.1x) mas as faixas trouxerem ncm canônica
        const cleanPadrao = ncmPadrao.replace(/\D/g, '')
        const faixas = [f1, f2, f3, f4]
          .map((f) => f.replace(/\D/g, ''))
          .filter((f) => f.length === 8)
        const faixaNaoDomiss = faixas.find(
          (f) => !f.startsWith('3808911') && !f.startsWith('3808921') && !f.startsWith('3808931'),
        )

        if (
          cleanPadrao.startsWith('3808931') ||
          cleanPadrao.startsWith('3808921') ||
          cleanPadrao.startsWith('3808911')
        ) {
          if (faixaNaoDomiss) {
            const ncmFormatada = `${faixaNaoDomiss.slice(0, 4)}.${faixaNaoDomiss.slice(4, 6)}.${faixaNaoDomiss.slice(6, 8)}`
            rec.set('ncm', faixaNaoDomiss)
            rec.set('ncm_padrao', ncmFormatada)
            modificado = true
          } else if (paUpper.includes('GLIFOSATO') || paUpper.includes('GLYPHOSATE')) {
            // Glifosato formulado agrícola padrão
            rec.set('ncm', '38089324')
            rec.set('ncm_padrao', '3808.93.24')
            rec.set('ncm_faixa1_ate_300g', '3808.93.24')
            rec.set('ncm_faixa2_300g_a_7_5kg', '3808.93.24')
            rec.set('ncm_faixa3_7_5kg_a_10kg', '3808.93.24')
            rec.set('ncm_faixa4_acima_10kg', '3808.93.24')
            modificado = true
          }
        }

        if (modificado) {
          app.save(rec)
        }
      }
    } catch (errF) {
      console.log('Aviso ao normalizar formulados da base_mestre:', errF.message)
    }

    // 3. Atualizar matriz de princípios ativos se houver glifosato agrícola
    try {
      const paGlifosato =
        app.findRecordsByFilter(
          'dicionario_principios_ativos',
          "principio_ativo ~ 'GLIFOSATO' || principio_ativo ~ 'Glifosato'",
          '-created',
          50,
          0,
        ) || []

      for (const recPa of paGlifosato) {
        const chave = recPa.getString('principio_ativo_chave') || recPa.getString('principio_ativo')
        if (chave === 'GLIFOSATO 720' || chave === 'GLIFOSATO WG' || chave === 'GLIFOSATO 792') {
          // Alinhado para uso agrícola
          recPa.set('classe', 'Defensivos — Herbicida')
          recPa.set('macro_grupo_subgrupo_padrao', 'Defensivos — Herbicida')
          app.save(recPa)
        }
      }
    } catch (errPa) {
      console.log('Aviso ao alinhar dicionario_principios_ativos:', errPa.message)
    }
  },
  (app) => {
    // Revert opcional idempotente
  },
)
