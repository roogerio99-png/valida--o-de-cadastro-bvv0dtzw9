migrate(
  (app) => {
    // Migration 1740000006: Reversão e correção canônica definitiva do ROUNDUP WG e Glifosato para NCM 38089324 / 3808.93.24
    // Idempotente para executar com sucesso em bases povoadas ou vazias.

    // 1. Corrigir o registro específico do ROUNDUP WG (MAPA Nº 002094 / marca ROUNDUP WG) na base_mestre
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
        rec.set('ncm', '38089324')
        rec.set('ncm_padrao', '3808.93.24')
        rec.set('ncm_faixa1_ate_300g', '3808.93.24')
        rec.set('ncm_faixa2_300g_a_7_5kg', '3808.93.24')
        rec.set('ncm_faixa3_7_5kg_a_10kg', '3808.93.24')
        rec.set('ncm_faixa4_acima_10kg', '3808.93.24')
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
      console.log('Aviso ao corrigir ROUNDUP WG na migration 1740000006:', err.message)
    }

    // 2. Corrigir princípio ativo GLIFOSATO e variantes na coleção dicionario_principios_ativos
    // Onde tiver 38089234 / 3808.92.34 gravado, repor NCM padrão e faixas para 38089324 / 3808.93.24, classe Herbicida
    try {
      const paGlifosato =
        app.findRecordsByFilter(
          'dicionario_principios_ativos',
          "principio_ativo ~ 'GLIFOSATO' || principio_ativo ~ 'Glifosato' || ncm_padrao_referencia ~ '38089234' || ncm_padrao_referencia ~ '3808.92.34' || ncm_faixa1_ate_300g ~ '3808.92.34'",
          '-created',
          200,
          0,
        ) || []

      for (const recPa of paGlifosato) {
        let mod = false
        const paNome = (recPa.getString('principio_ativo') || '').toUpperCase()
        const ncmPad = recPa.getString('ncm_padrao_referencia') || ''
        const f1 = recPa.getString('ncm_faixa1_ate_300g') || ''
        const classe = recPa.getString('classe') || ''

        // Se contiver 38089234 em qualquer campo ou for Glifosato agrícola
        const has38089234 =
          ncmPad.includes('38089234') ||
          ncmPad.includes('3808.92.34') ||
          f1.includes('38089234') ||
          f1.includes('3808.92.34')

        if (has38089234 || paNome.includes('GLIFOSATO')) {
          // Se for produto técnico/pré-mistura mantém o enquadramento de insumo se for o caso,
          // mas se tiver 3808.92.34 (fungicida) ou for formulado comercial agrícola, ajusta para 3808.93.24
          if (has38089234) {
            recPa.set('ncm_padrao_referencia', '3808.93.24')
            recPa.set('ncm_faixa1_ate_300g', '3808.93.24')
            recPa.set('ncm_faixa2_300g_a_7_5kg', '3808.93.24')
            recPa.set('ncm_faixa3_7_5kg_a_10kg', '3808.93.24')
            recPa.set('ncm_faixa4_acima_10kg', '3808.93.24')
            recPa.set('ncm_granel_tecnico', '3808.93.24')
            mod = true
          }

          if (classe.includes('Fungicida') || !classe) {
            recPa.set('classe', 'Defensivos — Herbicida')
            recPa.set('macro_grupo_subgrupo_padrao', 'Defensivos — Herbicida')
            mod = true
          }
        }

        if (mod) {
          app.save(recPa)
        }
      }
    } catch (errPa) {
      console.log(
        'Aviso ao alinhar dicionario_principios_ativos na migration 1740000006:',
        errPa.message,
      )
    }

    // 3. Varrer base_mestre procurando registros com 38089234/3808.92.34 que sejam herbicidas ou sub_grupo Herbicida
    // e corrigi-los para 38089324/3808.93.24 (NÃO tocar em fungicidas legítimos 380892xx)
    try {
      const registros38089234 =
        app.findRecordsByFilter(
          'base_mestre',
          "ncm = '38089234' || ncm_padrao ~ '3808.92.34' || ncm_faixa1_ate_300g ~ '3808.92.34'",
          '-created',
          200,
          0,
        ) || []

      for (const rec of registros38089234) {
        const sub = rec.getString('sub_grupo') || ''
        const macroSub = rec.getString('macro_grupo_subgrupo') || ''
        const pa = (rec.getString('principio_ativo') || '').toUpperCase()
        const nome = (
          rec.getString('nome_completo') ||
          rec.getString('nome_produto') ||
          ''
        ).toUpperCase()

        const isHerbicida =
          sub.toLowerCase().includes('herbicida') ||
          macroSub.toLowerCase().includes('herbicida') ||
          pa.includes('GLIFOSATO') ||
          nome.includes('ROUNDUP')

        if (isHerbicida) {
          rec.set('ncm', '38089324')
          rec.set('ncm_padrao', '3808.93.24')
          rec.set('ncm_faixa1_ate_300g', '3808.93.24')
          rec.set('ncm_faixa2_300g_a_7_5kg', '3808.93.24')
          rec.set('ncm_faixa3_7_5kg_a_10kg', '3808.93.24')
          rec.set('ncm_faixa4_acima_10kg', '3808.93.24')
          rec.set('sub_grupo', 'Herbicida')
          rec.set('macro_grupo', 'Defensivos')
          rec.set('macro_grupo_subgrupo', 'Defensivos — Herbicida')
          app.save(rec)
        }
      }
    } catch (errVarredura) {
      console.log('Aviso ao varrer base_mestre na migration 1740000006:', errVarredura.message)
    }
  },
  (app) => {
    // Revert opcional idempotente
  },
)
