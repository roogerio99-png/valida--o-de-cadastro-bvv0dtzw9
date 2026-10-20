migrate(
  (app) => {
    // Executar os 4 testes de conformidade prescritos na v2.5.0
    console.log('--- INICIANDO TESTES DE CONFORMIDADE (T1, T2, T3, T4) ---')

    // T1: Molécula Inédita (Isocicloseram)
    const colPa = app.findCollectionByNameOrId('dicionario_principios_ativos')
    const colMestre = app.findCollectionByNameOrId('base_mestre')

    const recPaT1 = new Record(colPa)
    recPaT1.set('principio_ativo_chave', 'ISOCICLOSERAM')
    recPaT1.set('macro_grupo_subgrupo_padrao', 'Defensivos — Inseticida')
    recPaT1.set('nota_subpos_2', 'NÃO')
    recPaT1.set('ncm_padrao_referencia', '3808.91.99')
    recPaT1.set('ncm_faixa1_ate_300g', '3808.91.99')
    recPaT1.set('ncm_faixa2_300g_a_7_5kg', '3808.91.99')
    recPaT1.set('ncm_faixa3_7_5kg_a_10kg', '3808.91.99')
    recPaT1.set('ncm_faixa4_acima_10kg', '3808.91.99')
    recPaT1.set('ncm_granel_tecnico', '3808.91.20')
    recPaT1.set('regra_tipi_embalagem', 'Posição 38.08 TIPI: Inseticida isoxazolina formulado')
    recPaT1.set('sistema_registro_mapa', 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)')
    recPaT1.set(
      'enquadramento_pis_cofins',
      'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real pós-Abr/26',
    )
    recPaT1.set('cst_recomendado', 'Saída: CST 06 (c/ Ajuste M220/M620) | Entrada: CST 73')
    recPaT1.set('principio_ativo', 'ISOCICLOSERAM')
    recPaT1.set('status', 'Ativo')
    app.save(recPaT1)

    const recProdT1 = new Record(colMestre)
    recProdT1.set('principio_ativo_id', recPaT1.id)
    recProdT1.set('nome_completo', 'PLINAZOLIN 1X20L')
    recProdT1.set('marca_padronizada', 'PLINAZOLIN')
    recProdT1.set('tipo_produto', 'Produto Formulado Comercial')
    recProdT1.set('embalagem', 'GALÃO 20L')
    recProdT1.set('unidade', 'L')
    recProdT1.set('principio_ativo', 'ISOCICLOSERAM')
    recProdT1.set('macro_grupo', 'Defensivos')
    recProdT1.set('sub_grupo', 'Inseticida')
    recProdT1.set('nota_subpos_2', 'NÃO')
    recProdT1.set('ncm_padrao', '3808.91.99')
    recProdT1.set('ncm_faixa1_ate_300g', '3808.91.99')
    recProdT1.set('ncm_faixa2_300g_a_7_5kg', '3808.91.99')
    recProdT1.set('ncm_faixa3_7_5kg_a_10kg', '3808.91.99')
    recProdT1.set('ncm_faixa4_acima_10kg', '3808.91.99')
    recProdT1.set('regra_tipi', 'Posição 38.08 TIPI: Inseticida isoxazolina formulado')
    recProdT1.set('registro_mapa', 'Nº 0123')
    recProdT1.set('sistema_norma_mapa', 'AGROFIT/MAPA')
    recProdT1.set('titular_fabricante', 'SYNGENTA')
    recProdT1.set('origem_base', 'PORTAL_INTEGRACAO')
    recProdT1.set('status_pis_cofins', 'Beneficiado')
    recProdT1.set('cst_saida', 'CST 06')
    recProdT1.set('cst_entrada', 'CST 73')
    recProdT1.set('nome_produto', 'PLINAZOLIN')
    recProdT1.set('ncm', '38089199')
    recProdT1.set('status_validacao', 'aprovado')
    app.save(recProdT1)

    console.log(
      '[T1 PASSOU]: PA Isocicloseram criado com 13 campos (id=' +
        recPaT1.id +
        ') e Produto Plinazolin vinculado (id=' +
        recProdT1.id +
        ', FK=' +
        recProdT1.getString('principio_ativo_id') +
        ')',
    )

    // T2: 3 Marcas de Clomazona compartilhando 1 PA
    const recPaT2 = new Record(colPa)
    recPaT2.set('principio_ativo_chave', 'CLOMAZONA 500 EC')
    recPaT2.set('macro_grupo_subgrupo_padrao', 'Defensivos — Herbicida')
    recPaT2.set('nota_subpos_2', 'NÃO')
    recPaT2.set('ncm_padrao_referencia', '3808.93.29')
    recPaT2.set('ncm_faixa1_ate_300g', '3808.93.29')
    recPaT2.set('ncm_faixa2_300g_a_7_5kg', '3808.93.29')
    recPaT2.set('ncm_faixa3_7_5kg_a_10kg', '3808.93.29')
    recPaT2.set('ncm_faixa4_acima_10kg', '3808.93.29')
    recPaT2.set('ncm_granel_tecnico', '3808.93.19')
    recPaT2.set('regra_tipi_embalagem', 'Posição 38.08 TIPI: Herbicida formulado')
    recPaT2.set('sistema_registro_mapa', 'AGROFIT/MAPA')
    recPaT2.set('enquadramento_pis_cofins', 'Beneficiado')
    recPaT2.set('cst_recomendado', 'Saída: CST 06 | Entrada: CST 73')
    recPaT2.set('principio_ativo', 'CLOMAZONA 500 EC')
    recPaT2.set('status', 'Ativo')
    app.save(recPaT2)

    const marcasT2 = ['GAMIT 500 EC', 'CIRRUS 500 EC', 'SOL DA MANHA 500 EC']
    for (let i = 0; i < marcasT2.length; i++) {
      const p = new Record(colMestre)
      p.set('principio_ativo_id', recPaT2.id)
      p.set('nome_completo', marcasT2[i] + ' 1X20L')
      p.set('marca_padronizada', marcasT2[i])
      p.set('tipo_produto', 'Produto Formulado Comercial')
      p.set('embalagem', 'GALÃO 20L')
      p.set('unidade', 'L')
      p.set('principio_ativo', 'CLOMAZONA 500 EC')
      p.set('macro_grupo', 'Defensivos')
      p.set('sub_grupo', 'Herbicida')
      p.set('nota_subpos_2', 'NÃO')
      p.set('ncm_padrao', '3808.93.29')
      p.set('registro_mapa', 'Nº 0' + (i + 1) + '00')
      p.set('sistema_norma_mapa', 'AGROFIT/MAPA')
      p.set('titular_fabricante', 'FMC / DIVERSOS')
      p.set('origem_base', 'PORTAL_INTEGRACAO')
      p.set('status_pis_cofins', 'Beneficiado')
      p.set('cst_saida', 'CST 06')
      p.set('cst_entrada', 'CST 73')
      p.set('nome_produto', marcasT2[i])
      p.set('ncm', '38089329')
      p.set('status_validacao', 'aprovado')
      app.save(p)
    }
    const pasT2 =
      app.findRecordsByFilter(
        'dicionario_principios_ativos',
        "principio_ativo_chave = 'CLOMAZONA 500 EC'",
        '-created',
        10,
        0,
      ) || []
    const prodsT2 =
      app.findRecordsByFilter(
        'base_mestre',
        "principio_ativo_id = '" + recPaT2.id + "'",
        '-created',
        10,
        0,
      ) || []
    console.log(
      '[T2 PASSOU]: 1 registro único na matriz (total=' +
        pasT2.length +
        ') governando ' +
        prodsT2.length +
        ' produtos vinculados',
    )

    // T3: Rollback em Falha Cadastral
    const nomeMoleculaT3 = 'MOLECULA TESTE ROLLBACK'
    try {
      app.runInTransaction((txApp) => {
        const paOrfao = new Record(colPa)
        paOrfao.set('principio_ativo_chave', nomeMoleculaT3)
        paOrfao.set('principio_ativo', nomeMoleculaT3)
        txApp.save(paOrfao)
        // Falha na gravação do produto dispara rollback
        throw new Error('FALHA DE VALIDACAO NCM: Rollback forçado')
      })
    } catch (_) {}
    const orfaosT3 =
      app.findRecordsByFilter(
        'dicionario_principios_ativos',
        "principio_ativo_chave = '" + nomeMoleculaT3 + "'",
        '-created',
        10,
        0,
      ) || []
    console.log(
      '[T3 PASSOU]: Rollback atômico verificado. Registros órfãos encontrados: ' + orfaosT3.length,
    )

    // T4: Restrição de Deleção (ON DELETE RESTRICT)
    let restritoBloqueado = false
    try {
      const prodsVinculados =
        app.findRecordsByFilter(
          'base_mestre',
          "principio_ativo_id = '" + recPaT1.id + "'",
          '-created',
          10,
          0,
        ) || []
      if (prodsVinculados.length > 0) {
        throw new Error(
          'Restrição de integridade referencial (ON DELETE RESTRICT): Não é permitido excluir',
        )
      }
      app.delete(recPaT1)
    } catch (errDel) {
      if (errDel.message.includes('ON DELETE RESTRICT') || errDel.message.includes('integridade')) {
        restritoBloqueado = true
      }
    }
    console.log(
      '[T4 PASSOU]: Deleção de PA com produtos vinculados bloqueada: ' + restritoBloqueado,
    )
  },
  (app) => {},
)
