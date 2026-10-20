migrate(
  (app) => {
    // Expandir limites de caracteres na matriz de princípios ativos para evitar recusa
    // em textos analíticos longos de CST (ex: pós-Abril/26), enquadramento PIS/COFINS,
    // sistema MAPA e macro-grupo/subgrupo.
    const colPa = app.findCollectionByNameOrId('dicionario_principios_ativos')

    // cst_recomendado: expandir de max 80 para max 255
    const fCst = colPa.fields.getByName('cst_recomendado')
    if (fCst) {
      fCst.max = 255
    } else {
      colPa.fields.add(new TextField({ name: 'cst_recomendado', max: 255 }))
    }

    // enquadramento_pis_cofins: expandir de 150 para 255
    const fPis = colPa.fields.getByName('enquadramento_pis_cofins')
    if (fPis) {
      fPis.max = 255
    } else {
      colPa.fields.add(new TextField({ name: 'enquadramento_pis_cofins', max: 255 }))
    }

    // sistema_registro_mapa: expandir de 150 para 255
    const fMapa = colPa.fields.getByName('sistema_registro_mapa')
    if (fMapa) {
      fMapa.max = 255
    } else {
      colPa.fields.add(new TextField({ name: 'sistema_registro_mapa', max: 255 }))
    }

    // macro_grupo_subgrupo_padrao: expandir de 150 para 255
    const fMacro = colPa.fields.getByName('macro_grupo_subgrupo_padrao')
    if (fMacro) {
      fMacro.max = 255
    } else {
      colPa.fields.add(new TextField({ name: 'macro_grupo_subgrupo_padrao', max: 255 }))
    }

    app.save(colPa)
  },
  (app) => {
    // Reverter caso necessário
    try {
      const colPa = app.findCollectionByNameOrId('dicionario_principios_ativos')
      const fCst = colPa.fields.getByName('cst_recomendado')
      if (fCst) fCst.max = 80
      const fPis = colPa.fields.getByName('enquadramento_pis_cofins')
      if (fPis) fPis.max = 150
      const fMapa = colPa.fields.getByName('sistema_registro_mapa')
      if (fMapa) fMapa.max = 150
      const fMacro = colPa.fields.getByName('macro_grupo_subgrupo_padrao')
      if (fMacro) fMacro.max = 150
      app.save(colPa)
    } catch (_) {}
  },
)
