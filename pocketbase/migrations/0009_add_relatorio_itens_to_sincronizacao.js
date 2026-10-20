migrate(
  (app) => {
    const historicoCol = app.findCollectionByNameOrId('sincronizacao_historico')

    if (!historicoCol.fields.getByName('itens_relatorio')) {
      historicoCol.fields.add(new JSONField({ name: 'itens_relatorio' }))
    }
    if (!historicoCol.fields.getByName('contadores_desfecho')) {
      historicoCol.fields.add(new JSONField({ name: 'contadores_desfecho' }))
    }

    app.save(historicoCol)
  },
  (app) => {
    try {
      const historicoCol = app.findCollectionByNameOrId('sincronizacao_historico')
      const f1 = historicoCol.fields.getByName('itens_relatorio')
      if (f1) historicoCol.fields.removeByName('itens_relatorio')
      const f2 = historicoCol.fields.getByName('contadores_desfecho')
      if (f2) historicoCol.fields.removeByName('contadores_desfecho')
      app.save(historicoCol)
    } catch (_) {}
  },
)
