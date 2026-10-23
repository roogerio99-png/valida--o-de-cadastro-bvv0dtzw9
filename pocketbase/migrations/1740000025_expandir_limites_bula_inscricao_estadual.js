/**
 * pocketbase/migrations/1740000025_expandir_limites_bula_inscricao_estadual.js
 *
 * Ampliação de limites em todas as coleções de Cadastro de Bula:
 * - bula_empresas: inscricao_estadual (max: 2000), cep (max: 100), bairro (max: 1000),
 *   municipio (max: 1000), endereco (max: 3000), razao_social (max: 2000)
 * - bula_produtos: titular_registro, fabricante_formulador, modo_acao, principio_ativo,
 *   embalagem, pa_oficial_correto, regra_tipi
 * - bula_aplicacao, bula_culturas, bula_alvos, bula_embalagens, bula_composicao
 *
 * Evita recusas e erros 500 por estouro de tamanho de colunas ao gravar bulas oficiais em PDF.
 * Idempotente com verificação prévia de existência de collection e campo.
 */

migrate(
  (app) => {
    const expansoes = [
      {
        tabela: 'bula_empresas',
        campos: [
          { name: 'inscricao_estadual', max: 2000 },
          { name: 'cep', max: 100 },
          { name: 'bairro', max: 1000 },
          { name: 'municipio', max: 1000 },
          { name: 'endereco', max: 3000 },
          { name: 'razao_social', max: 2000 },
          { name: 'nome_fantasia', max: 2000 },
          { name: 'tipo_relacao', max: 1000 },
          { name: 'cnpj', max: 100 },
          { name: 'pais', max: 500 },
          { name: 'codigo', max: 200 },
        ],
      },
      {
        tabela: 'bula_produtos',
        campos: [
          { name: 'titular_registro', max: 5000 },
          { name: 'fabricante_formulador', max: 5000 },
          { name: 'principio_ativo', max: 3000 },
          { name: 'pa_oficial_correto', max: 3000 },
          { name: 'modo_acao', max: 3000 },
          { name: 'embalagem', max: 2000 },
          { name: 'nome_comercial', max: 1000 },
          { name: 'marca_padronizada', max: 1000 },
          { name: 'regra_tipi', max: 3000 },
          { name: 'codigo', max: 200 },
        ],
      },
      {
        tabela: 'bula_composicao',
        campos: [
          { name: 'ingrediente_ativo', max: 2000 },
          { name: 'nome_quimico', max: 3000 },
          { name: 'funcao_ingrediente', max: 1000 },
          { name: 'grupo_quimico', max: 1000 },
          { name: 'concentracao', max: 500 },
          { name: 'unidade_medida', max: 200 },
          { name: 'numero_cas', max: 200 },
          { name: 'codigo', max: 200 },
        ],
      },
      {
        tabela: 'bula_embalagens',
        campos: [
          { name: 'tipo_embalagem', max: 1000 },
          { name: 'material', max: 1000 },
          { name: 'capacidade', max: 500 },
          { name: 'destinacao_final', max: 3000 },
          { name: 'descricao_embalagem', max: 3000 },
          { name: 'codigo', max: 200 },
        ],
      },
      {
        tabela: 'bula_culturas',
        campos: [
          { name: 'cultura', max: 1000 },
          { name: 'modalidade_emprego', max: 3000 },
          { name: 'observacoes', max: 4000 },
          { name: 'intervalo_seguranca_dias', max: 500 },
          { name: 'intervalo_reentrada_horas', max: 500 },
          { name: 'limite_maximo_residuos_lmr', max: 1000 },
          { name: 'codigo', max: 200 },
        ],
      },
      {
        tabela: 'bula_alvos',
        campos: [
          { name: 'alvo_biologico', max: 2000 },
          { name: 'nome_cientifico', max: 2000 },
          { name: 'cultura', max: 1000 },
          { name: 'epoca_aplicacao', max: 3000 },
          { name: 'volume_calda', max: 1000 },
          { name: 'tipo_alvo', max: 1000 },
          { name: 'codigo', max: 200 },
        ],
      },
      {
        tabela: 'bula_aplicacao',
        campos: [
          { name: 'tipo_aplicacao', max: 1000 },
          { name: 'equipamento_recomendado', max: 3000 },
          { name: 'condicoes_meteorologicas', max: 3000 },
          { name: 'epi_preparo_calda', max: 3000 },
          { name: 'epi_aplicacao', max: 3000 },
          { name: 'medidas_primeiros_socorros', max: 4000 },
          { name: 'descarte_embalagens', max: 4000 },
          { name: 'volume_calda_aplicacao', max: 1000 },
          { name: 'classe_toxicologica_aplicacao', max: 1000 },
          { name: 'orientacoes_gerais', max: 5000 },
          { name: 'codigo', max: 200 },
        ],
      },
    ]

    for (let i = 0; i < expansoes.length; i++) {
      const exp = expansoes[i]
      if (!app.hasTable(exp.tabela)) continue

      try {
        const col = app.findCollectionByNameOrId(exp.tabela)
        let alterou = false

        for (let j = 0; j < exp.campos.length; j++) {
          const c = exp.campos[j]
          const f = col.fields.getByName(c.name)
          if (f) {
            if (!f.max || f.max < c.max) {
              f.max = c.max
              alterou = true
            }
            if (f.required) {
              f.required = false
              alterou = true
            }
          } else {
            col.fields.add(new TextField({ name: c.name, max: c.max, required: false }))
            alterou = true
          }
        }

        if (alterou) {
          app.save(col)
          console.log(`Limites expandidos com sucesso para ${exp.tabela}.`)
        }
      } catch (err) {
        console.log(
          `Aviso ao atualizar coleção ${exp.tabela}:`,
          err && err.message ? err.message : err,
        )
      }
    }
  },
  (app) => {
    // Reversão defensiva (no-op para não degradar colunas)
  },
)
