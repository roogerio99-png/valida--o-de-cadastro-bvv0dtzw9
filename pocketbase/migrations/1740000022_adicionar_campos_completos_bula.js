/**
 * pocketbase/migrations/1740000022_adicionar_campos_completos_bula.js
 *
 * Expansão de campos nas 7 coleções de Cadastro de Bula para cobrir 100% das
 * colunas das 7 abas da planilha oficial consolidada:
 * 1. bula_produtos (Sheet 1: Cadastro_Mestre_1a1)
 *    - adiciona: codigo, pa_oficial_correto, mapa_oficial_limpo, embalagem, ncm_oficial_exata,
 *      url_oficial, macro_grupo, sub_grupo, nota_subpos_2, regra_tipi
 * 2. bula_composicao (Sheet 2: Composicao_Em_Linhas)
 *    - adiciona: codigo, percentual_peso, percentual_volume
 * 3. bula_empresas (Sheet 3: Cadeia_Empresas_Linhas)
 *    - adiciona: codigo, cep, bairro, inscricao_estadual
 * 4. bula_embalagens (Sheet 4: Embalagens_NCM_Linhas)
 *    - adiciona: codigo, ncm_faixa, descricao_embalagem
 * 5. bula_culturas (Sheet 5: Culturas_Carencia_Linhas)
 *    - adiciona: codigo, tipo_cultura, epoca_carencia
 * 6. bula_alvos (Sheet 6: Alvos_e_Doses_Linhas)
 *    - adiciona: codigo, tipo_alvo, intervalo_aplicacao_dias
 * 7. bula_aplicacao (Sheet 7: Aplicacao_e_EPI_Linhas)
 *    - adiciona: codigo, volume_calda_aplicacao, classe_toxicologica_aplicacao, orientacoes_gerais
 *
 * Todos os novos campos são do tipo text (max: 2000 ou 5000) e opcionais (required: false).
 * Idempotente com verificação prévia de existência de campo.
 */

migrate(
  (app) => {
    const novosCamposPorColecao = [
      {
        tabela: 'bula_produtos',
        campos: [
          { name: 'codigo', max: 200 },
          { name: 'pa_oficial_correto', max: 2000 },
          { name: 'mapa_oficial_limpo', max: 200 },
          { name: 'embalagem', max: 1000 },
          { name: 'ncm_oficial_exata', max: 100 },
          { name: 'url_oficial', max: 2000 },
          { name: 'macro_grupo', max: 500 },
          { name: 'sub_grupo', max: 500 },
          { name: 'nota_subpos_2', max: 50 },
          { name: 'regra_tipi', max: 2000 },
        ],
      },
      {
        tabela: 'bula_composicao',
        campos: [
          { name: 'codigo', max: 200 },
          { name: 'percentual_peso', max: 200 },
          { name: 'percentual_volume', max: 200 },
        ],
      },
      {
        tabela: 'bula_empresas',
        campos: [
          { name: 'codigo', max: 200 },
          { name: 'cep', max: 50 },
          { name: 'bairro', max: 500 },
          { name: 'inscricao_estadual', max: 100 },
        ],
      },
      {
        tabela: 'bula_embalagens',
        campos: [
          { name: 'codigo', max: 200 },
          { name: 'ncm_faixa', max: 200 },
          { name: 'descricao_embalagem', max: 2000 },
        ],
      },
      {
        tabela: 'bula_culturas',
        campos: [
          { name: 'codigo', max: 200 },
          { name: 'tipo_cultura', max: 500 },
          { name: 'epoca_carencia', max: 1000 },
        ],
      },
      {
        tabela: 'bula_alvos',
        campos: [
          { name: 'codigo', max: 200 },
          { name: 'tipo_alvo', max: 500 },
          { name: 'intervalo_aplicacao_dias', max: 500 },
        ],
      },
      {
        tabela: 'bula_aplicacao',
        campos: [
          { name: 'codigo', max: 200 },
          { name: 'volume_calda_aplicacao', max: 1000 },
          { name: 'classe_toxicologica_aplicacao', max: 1000 },
          { name: 'orientacoes_gerais', max: 5000 },
        ],
      },
    ]

    for (let i = 0; i < novosCamposPorColecao.length; i++) {
      const item = novosCamposPorColecao[i]
      if (!app.hasTable(item.tabela)) continue

      try {
        const col = app.findCollectionByNameOrId(item.tabela)
        let alterou = false

        for (let j = 0; j < item.campos.length; j++) {
          const c = item.campos[j]
          const fExistente = col.fields.getByName(c.name)
          if (!fExistente) {
            col.fields.add(new TextField({ name: c.name, max: c.max, required: false }))
            alterou = true
          } else {
            // Se já existe, garante limites amplos
            if (fExistente.max && fExistente.max < c.max) {
              fExistente.max = c.max
              alterou = true
            }
          }
        }

        if (alterou) {
          app.save(col)
        }
      } catch (err) {
        console.log(
          `Erro ao adicionar campos na coleção ${item.tabela}:`,
          err && err.message ? err.message : err,
        )
      }
    }
  },
  (app) => {
    // Reversão defensiva (no-op para evitar remoção acidental de colunas)
  },
)
