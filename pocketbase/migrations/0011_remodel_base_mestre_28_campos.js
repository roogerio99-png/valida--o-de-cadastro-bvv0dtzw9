migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('base_mestre')

    // Garantir remoção de índices legados antes de alterar campos para evitar conflitos
    try {
      col.removeIndex('idx_base_mestre_busca')
    } catch (_) {}
    try {
      col.removeIndex('idx_base_mestre_unique')
    } catch (_) {}

    // Lista dos novos campos canônicos a adicionar se não existirem
    const camposNovos = [
      new TextField({ name: 'nome_completo', max: 255 }),
      new TextField({ name: 'marca_padronizada', max: 150 }),
      new SelectField({
        name: 'tipo_produto',
        values: [
          'Produto Formulado Comercial',
          'Produto Técnico Industrial',
          'Pré-Mistura Industrial',
          'Fertilizante Mineral / Organomineral',
          'Inoculante / Biológico',
          'Corretivo / Condicionador de Solo',
          'Semente Certificada',
          'Adjuvante / Espalhante Adesivo',
          'Outros Insumos Químicos e Reagentes',
        ],
        maxSelect: 1,
      }),
      new SelectField({
        name: 'unidade',
        values: ['L', 'KG', 'SC', 'UN', 'DOSES'],
        maxSelect: 1,
      }),
      new TextField({ name: 'macro_grupo', max: 100 }),
      new TextField({ name: 'sub_grupo', max: 100 }),
      new SelectField({
        name: 'nota_subpos_2',
        values: ['SIM', 'NÃO'],
        maxSelect: 1,
      }),
      new TextField({ name: 'ncm_padrao', max: 10 }),
      new TextField({ name: 'ncm_faixa1_ate_300g', max: 10 }),
      new TextField({ name: 'ncm_faixa2_300g_a_7_5kg', max: 10 }),
      new TextField({ name: 'ncm_faixa3_7_5kg_a_10kg', max: 10 }),
      new TextField({ name: 'ncm_faixa4_acima_10kg', max: 10 }),
      new TextField({ name: 'regra_tipi' }),
      new TextField({ name: 'sistema_norma_mapa', max: 150 }),
      new TextField({ name: 'titular_fabricante', max: 200 }),
      new TextField({ name: 'status_pis_cofins', max: 150 }),
      new TextField({ name: 'aliquota_ate_mar2026', max: 50 }),
      new TextField({ name: 'aliquota_pos_abr2026_real', max: 50 }),
      new TextField({ name: 'aliquota_pos_abr2026_presumido', max: 50 }),
      new TextField({ name: 'cst_saida', max: 30 }),
      new TextField({ name: 'cst_entrada', max: 30 }),
      new TextField({ name: 'url_oficial', max: 255 }),
    ]

    for (let i = 0; i < camposNovos.length; i++) {
      const f = camposNovos[i]
      if (!col.fields.getByName(f.name)) {
        col.fields.add(f)
      }
    }

    // Índices canônicos solicitados na especificação técnica
    col.addIndex('idx_cadmestre_regmapa', false, 'registro_mapa', '')
    col.addIndex('idx_cadmestre_marca_pad', false, 'marca_padronizada', '')
    col.addIndex('idx_cadmestre_ncm_padrao', false, 'ncm_padrao', '')
    col.addIndex('idx_cadmestre_macro', false, 'macro_grupo', '')

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('base_mestre')
    try {
      col.removeIndex('idx_cadmestre_regmapa')
      col.removeIndex('idx_cadmestre_marca_pad')
      col.removeIndex('idx_cadmestre_ncm_padrao')
      col.removeIndex('idx_cadmestre_macro')
    } catch (_) {}
    app.save(col)
  },
)
