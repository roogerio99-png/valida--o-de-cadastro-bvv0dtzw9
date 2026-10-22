/**
 * pocketbase/migrations/1740000018_expandir_limites_bula_produtos.js
 *
 * Expande os limites de caracteres dos campos de texto da coleção `bula_produtos`
 * (especialmente titular_registro e fabricante_formulador de 500 para 2000 caracteres,
 * além de principio_ativo, modo_acao e outros campos suscetíveis a textos extensos),
 * evitando recusas na importação de produtos com descrições corporativas completas
 * (razão social + endereço completo + vínculo de registro).
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('bula_produtos')

    const camposParaExpandir = [
      { name: 'titular_registro', max: 2000 },
      { name: 'fabricante_formulador', max: 2000 },
      { name: 'principio_ativo', max: 1000 },
      { name: 'modo_acao', max: 1000 },
      { name: 'classe_agronomica', max: 500 },
      { name: 'grupo_quimico', max: 500 },
      { name: 'classificacao_toxicologica', max: 500 },
      { name: 'classificacao_ambiental', max: 500 },
      { name: 'tipo_formulacao', max: 500 },
      { name: 'nome_comercial', max: 500 },
      { name: 'marca_padronizada', max: 500 },
    ]

    for (let i = 0; i < camposParaExpandir.length; i++) {
      const item = camposParaExpandir[i]
      const f = col.fields.getByName(item.name)
      if (f) {
        f.max = item.max
      } else {
        col.fields.add(new TextField({ name: item.name, max: item.max }))
      }
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('bula_produtos')
      const fTitular = col.fields.getByName('titular_registro')
      if (fTitular) fTitular.max = 500
      const fFab = col.fields.getByName('fabricante_formulador')
      if (fFab) fFab.max = 500
      app.save(col)
    } catch (_) {}
  },
)
