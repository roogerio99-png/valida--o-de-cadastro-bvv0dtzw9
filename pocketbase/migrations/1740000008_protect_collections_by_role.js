migrate(
  (app) => {
    // 1. base_mestre: list/view para qualquer autenticado; create/update/delete apenas admin
    const baseMestre = app.findCollectionByNameOrId('base_mestre')
    baseMestre.listRule = "@request.auth.id != ''"
    baseMestre.viewRule = "@request.auth.id != ''"
    baseMestre.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    baseMestre.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    baseMestre.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(baseMestre)

    // 2. dicionario_principios_ativos: list/view autenticado; create/update/delete apenas admin
    const dicPa = app.findCollectionByNameOrId('dicionario_principios_ativos')
    dicPa.listRule = "@request.auth.id != ''"
    dicPa.viewRule = "@request.auth.id != ''"
    dicPa.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    dicPa.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    dicPa.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(dicPa)

    // 3. regras_ncm_embalagem: list/view autenticado; create/update/delete apenas admin
    const regrasNcm = app.findCollectionByNameOrId('regras_ncm_embalagem')
    regrasNcm.listRule = "@request.auth.id != ''"
    regrasNcm.viewRule = "@request.auth.id != ''"
    regrasNcm.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    regrasNcm.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    regrasNcm.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(regrasNcm)

    // 4. parametrizacao_fiscal: list/view autenticado; create/update/delete apenas admin
    const paramFiscal = app.findCollectionByNameOrId('parametrizacao_fiscal')
    paramFiscal.listRule = "@request.auth.id != ''"
    paramFiscal.viewRule = "@request.auth.id != ''"
    paramFiscal.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    paramFiscal.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    paramFiscal.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(paramFiscal)

    // 5. sincronizacao_historico: list/view autenticado; create/update/delete apenas admin
    const sincHist = app.findCollectionByNameOrId('sincronizacao_historico')
    sincHist.listRule = "@request.auth.id != ''"
    sincHist.viewRule = "@request.auth.id != ''"
    sincHist.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    sincHist.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    sincHist.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(sincHist)

    // 6. log_validacoes: list/view autenticado; create liberado para autenticado (ao validar) ou admin
    const logVal = app.findCollectionByNameOrId('log_validacoes')
    logVal.listRule = "@request.auth.id != ''"
    logVal.viewRule = "@request.auth.id != ''"
    logVal.createRule = "@request.auth.id != ''"
    logVal.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    logVal.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(logVal)
  },
  (app) => {
    // Reverter para @request.auth.id != '' em todas
    const nomes = ['base_mestre', 'dicionario_principios_ativos', 'regras_ncm_embalagem', 'parametrizacao_fiscal', 'sincronizacao_historico']
    for (let i = 0; i < nomes.length; i++) {
      try {
        const col = app.findCollectionByNameOrId(nomes[i])
        col.createRule = "@request.auth.id != ''"
        col.updateRule = "@request.auth.id != ''"
        col.deleteRule = "@request.auth.id != ''"
        app.save(col)
      } catch (_) {}
    }
  },
)
