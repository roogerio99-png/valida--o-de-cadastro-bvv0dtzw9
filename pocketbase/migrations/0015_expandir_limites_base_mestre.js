migrate(
  (app) => {
    // Expandir limites de caracteres na coleção base_mestre para evitar rejeição
    // por campos text com descrições/titulares longos concatenados vindos de planilhas
    // (ex: produtos técnicos com titular + CNPJ + endereço + vínculo)
    const col = app.findCollectionByNameOrId('base_mestre')

    const camposParaExpandir = [
      { name: 'titular_fabricante', max: 500 },
      { name: 'fabricante', max: 500 },
      { name: 'nome_completo', max: 500 },
      { name: 'nome_produto', max: 500 },
      { name: 'marca_padronizada', max: 500 },
      { name: 'principio_ativo', max: 500 },
      { name: 'sistema_norma_mapa', max: 500 },
      { name: 'status_pis_cofins', max: 500 },
      { name: 'regra_tipi', max: 500 },
      { name: 'regra_tipi_embalagem', max: 500 },
      { name: 'macro_grupo_subgrupo', max: 500 },
      { name: 'macro_grupo', max: 500 },
      { name: 'sub_grupo', max: 500 },
      { name: 'cst_recomendado', max: 500 },
      { name: 'ibs_cbs_2027', max: 500 },
      { name: 'url_oficial', max: 500 },
      { name: 'origem_base', max: 500 },
      { name: 'aliquota_ate_mar2026', max: 255 },
      { name: 'aliquota_pos_abr2026_real', max: 255 },
      { name: 'aliquota_pos_abr2026_presumido', max: 255 },
      { name: 'cst_saida', max: 100 },
      { name: 'cst_entrada', max: 100 },
      { name: 'registro_mapa', max: 200 },
      { name: 'embalagem', max: 255 },
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
      const col = app.findCollectionByNameOrId('base_mestre')
      const fTitular = col.fields.getByName('titular_fabricante')
      if (fTitular) fTitular.max = 200
      app.save(col)
    } catch (_) {}
  },
)
