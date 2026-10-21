migrate(
  (app) => {
    const colPa = app.findCollectionByNameOrId('dicionario_principios_ativos')
    const colBase = app.findCollectionByNameOrId('base_mestre')

    // 1. Corrigir sub_grupo da linha FOLICRON na base_mestre se estiver como 'Herbicida'
    try {
      const recsFolicron =
        app.findRecordsByFilter(
          'base_mestre',
          "nome_completo ~ 'FOLICRON' || marca_padronizada ~ 'FOLICRON' || nome_produto ~ 'FOLICRON'",
          '-created',
          10,
          0,
        ) || []
      for (const rec of recsFolicron) {
        if (rec.getString('sub_grupo') === 'Herbicida') {
          rec.set('sub_grupo', 'Fungicida')
          rec.set('ncm_padrao', '3808.92.99')
          rec.set('ncm', '38089299')
          rec.set('ncm_faixa1_ate_300g', '3808.92.99')
          rec.set('ncm_faixa2_300g_a_7_5kg', '3808.92.99')
          rec.set('ncm_faixa3_7_5kg_a_10kg', '3808.92.99')
          rec.set('ncm_faixa4_acima_10kg', '3808.92.99')
          app.save(rec)
        }
      }
    } catch (err) {
      console.log('Aviso ao corrigir registros FOLICRON na base_mestre:', err.message)
    }

    // 2. Semear Princípios Ativos Individuais na matriz dicionario_principios_ativos se não existirem
    const paSeeds = [
      {
        nome: 'CIPROCONAZOL',
        classe: 'Fungicida',
        subgrupo: 'Defensivos — Fungicida',
        ncm: '3808.92.99',
        grupoQuimico: 'Triazol',
      },
      {
        nome: 'PICOXISTROBINA',
        classe: 'Fungicida',
        subgrupo: 'Defensivos — Fungicida',
        ncm: '3808.92.99',
        grupoQuimico: 'Estrobilurina',
      },
      {
        nome: 'CIPROCONAZOL + PICOXISTROBINA',
        classe: 'Fungicida',
        subgrupo: 'Defensivos — Fungicida',
        ncm: '3808.92.99',
        grupoQuimico: 'Triazol + Estrobilurina',
      },
    ]

    for (const s of paSeeds) {
      try {
        const esc = s.nome.replace(/'/g, "\\'")
        const exist = app.findRecordsByFilter(
          'dicionario_principios_ativos',
          `principio_ativo = '${esc}' || principio_ativo_chave = '${esc}'`,
          '-created',
          1,
          0,
        )
        if (exist && exist.length > 0) {
          // Já existe: se a classe não estiver coerente com Fungicida, atualiza
          const recExist = exist[0]
          if (
            !recExist.getString('classe') ||
            recExist.getString('classe').toLowerCase().includes('herbicida')
          ) {
            recExist.set('classe', s.classe)
            recExist.set('macro_grupo_subgrupo_padrao', s.subgrupo)
            recExist.set('ncm_padrao_referencia', s.ncm)
            recExist.set('ncm_faixa1_ate_300g', s.ncm)
            recExist.set('ncm_faixa2_300g_a_7_5kg', s.ncm)
            recExist.set('ncm_faixa3_7_5kg_a_10kg', s.ncm)
            recExist.set('ncm_faixa4_acima_10kg', s.ncm)
            recExist.set('ncm_granel_tecnico', s.ncm)
            app.save(recExist)
          }
          continue
        }

        const rec = new Record(colPa)
        rec.set('principio_ativo', s.nome)
        rec.set('principio_ativo_chave', s.nome)
        rec.set('classe', s.classe)
        rec.set('macro_grupo_subgrupo_padrao', s.subgrupo)
        rec.set('grupo_quimico', s.grupoQuimico)
        rec.set('status', 'Ativo')
        rec.set('nota_subpos_2', 'NÃO')
        rec.set('ncm_padrao_referencia', s.ncm)
        rec.set('ncm_faixa1_ate_300g', s.ncm)
        rec.set('ncm_faixa2_300g_a_7_5kg', s.ncm)
        rec.set('ncm_faixa3_7_5kg_a_10kg', s.ncm)
        rec.set('ncm_faixa4_acima_10kg', s.ncm)
        rec.set('ncm_granel_tecnico', s.ncm)
        rec.set(
          'regra_tipi_embalagem',
          'Posição 38.08 TIPI: Embalagem comercial agrícola usa subitens .2x ou .9x (vedado .1x de venda direta domissanitária)',
        )
        rec.set('sistema_registro_mapa', 'Registro Numérico AGROFIT Obrigatório')
        rec.set(
          'enquadramento_pis_cofins',
          'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
        )
        rec.set(
          'cst_recomendado',
          'Saída: CST 06 (c/ Ajuste M220/M620 pós-Abr/26) | Entrada Revenda: CST 73',
        )
        rec.set('concentracao_min', 0)
        rec.set('concentracao_max', 0)
        rec.set('unidade', '%')
        app.save(rec)
      } catch (errSeed) {
        console.log('Aviso ao semear PA ' + s.nome + ':', errSeed.message)
      }
    }
  },
  (app) => {
    // Rollback opcional
  },
)
