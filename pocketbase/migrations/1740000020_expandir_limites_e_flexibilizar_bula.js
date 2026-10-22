/**
 * pocketbase/migrations/1740000020_expandir_limites_e_flexibilizar_bula.js
 *
 * 1. Remove obrigatoriedade estrita de campos em todas as 7 coleções de bula:
 *    - bula_produtos: registro_mapa (mantém required se possível, mas tira de nome_comercial para permitir linhas parciais)
 *    - bula_composicao: tira required de ingrediente_ativo e registro_mapa
 *    - bula_empresas: tira required de razao_social e registro_mapa
 *    - bula_embalagens: tira required de registro_mapa
 *    - bula_culturas: tira required de cultura e registro_mapa
 *    - bula_alvos: tira required de alvo_biologico e registro_mapa
 *    - bula_aplicacao: tira required de registro_mapa
 * 2. Expande limites de caracteres (max = 5000 ou 2000) para evitar estouro de texto:
 *    - bula_produtos: titular_registro, fabricante_formulador, principio_ativo, modo_acao, nome_comercial, marca_padronizada
 *    - bula_empresas: razao_social, nome_fantasia, endereco, municipio, tipo_relacao
 *    - bula_composicao: ingrediente_ativo, nome_quimico, funcao_ingrediente, grupo_quimico
 *    - bula_embalagens: tipo_embalagem, material, destinacao_final
 *    - bula_culturas: cultura, modalidade_emprego, observacoes
 *    - bula_alvos: alvo_biologico, nome_cientifico, epoca_aplicacao
 *    - bula_aplicacao: equipamento_recomendado, condicoes_meteorologicas, epi_preparo_calda, epi_aplicacao, medidas_primeiros_socorros, descarte_embalagens
 *
 * Idempotente e compatível com banco vazio ou preenchido.
 */

migrate(
  (app) => {
    const expansoes = [
      {
        tabela: 'bula_produtos',
        campos: [
          { name: 'titular_registro', max: 5000, required: false },
          { name: 'fabricante_formulador', max: 5000, required: false },
          { name: 'principio_ativo', max: 2000, required: false },
          { name: 'modo_acao', max: 2000, required: false },
          { name: 'nome_comercial', max: 1000, required: false },
          { name: 'marca_padronizada', max: 1000, required: false },
          { name: 'registro_mapa', max: 200, required: false },
          { name: 'classe_agronomica', max: 1000, required: false },
          { name: 'grupo_quimico', max: 1000, required: false },
          { name: 'classificacao_toxicologica', max: 1000, required: false },
          { name: 'classificacao_ambiental', max: 1000, required: false },
          { name: 'tipo_formulacao', max: 1000, required: false },
          { name: 'tipo_produto', max: 500, required: false },
          { name: 'status_registro', max: 200, required: false },
        ],
      },
      {
        tabela: 'bula_composicao',
        campos: [
          { name: 'registro_mapa', max: 200, required: false },
          { name: 'nome_produto', max: 1000, required: false },
          { name: 'ingrediente_ativo', max: 1000, required: false },
          { name: 'nome_quimico', max: 2000, required: false },
          { name: 'funcao_ingrediente', max: 1000, required: false },
          { name: 'grupo_quimico', max: 1000, required: false },
          { name: 'concentracao', max: 500, required: false },
          { name: 'unidade_medida', max: 200, required: false },
          { name: 'numero_cas', max: 200, required: false },
        ],
      },
      {
        tabela: 'bula_empresas',
        campos: [
          { name: 'registro_mapa', max: 200, required: false },
          { name: 'nome_produto', max: 1000, required: false },
          { name: 'tipo_relacao', max: 500, required: false },
          { name: 'razao_social', max: 2000, required: false },
          { name: 'nome_fantasia', max: 2000, required: false },
          { name: 'cnpj', max: 100, required: false },
          { name: 'endereco', max: 3000, required: false },
          { name: 'municipio', max: 500, required: false },
          { name: 'uf', max: 50, required: false },
          { name: 'pais', max: 200, required: false },
        ],
      },
      {
        tabela: 'bula_embalagens',
        campos: [
          { name: 'registro_mapa', max: 200, required: false },
          { name: 'nome_produto', max: 1000, required: false },
          { name: 'tipo_embalagem', max: 1000, required: false },
          { name: 'material', max: 1000, required: false },
          { name: 'capacidade', max: 500, required: false },
          { name: 'unidade_medida', max: 200, required: false },
          { name: 'ncm', max: 50, required: false },
          { name: 'destinacao_final', max: 2000, required: false },
        ],
      },
      {
        tabela: 'bula_culturas',
        campos: [
          { name: 'registro_mapa', max: 200, required: false },
          { name: 'nome_produto', max: 1000, required: false },
          { name: 'cultura', max: 1000, required: false },
          { name: 'intervalo_seguranca_dias', max: 500, required: false },
          { name: 'intervalo_reentrada_horas', max: 500, required: false },
          { name: 'modalidade_emprego', max: 2000, required: false },
          { name: 'limite_maximo_residuos_lmr', max: 500, required: false },
          { name: 'observacoes', max: 3000, required: false },
        ],
      },
      {
        tabela: 'bula_alvos',
        campos: [
          { name: 'registro_mapa', max: 200, required: false },
          { name: 'nome_produto', max: 1000, required: false },
          { name: 'cultura', max: 1000, required: false },
          { name: 'alvo_biologico', max: 2000, required: false },
          { name: 'nome_cientifico', max: 1000, required: false },
          { name: 'dose_minima', max: 500, required: false },
          { name: 'dose_maxima', max: 500, required: false },
          { name: 'unidade_dose', max: 500, required: false },
          { name: 'volume_calda', max: 500, required: false },
          { name: 'numero_maximo_aplicacoes', max: 500, required: false },
          { name: 'epoca_aplicacao', max: 2000, required: false },
        ],
      },
      {
        tabela: 'bula_aplicacao',
        campos: [
          { name: 'registro_mapa', max: 200, required: false },
          { name: 'nome_produto', max: 1000, required: false },
          { name: 'tipo_aplicacao', max: 1000, required: false },
          { name: 'equipamento_recomendado', max: 2000, required: false },
          { name: 'condicoes_meteorologicas', max: 2000, required: false },
          { name: 'epi_preparo_calda', max: 2000, required: false },
          { name: 'epi_aplicacao', max: 2000, required: false },
          { name: 'medidas_primeiros_socorros', max: 3000, required: false },
          { name: 'descarte_embalagens', max: 3000, required: false },
        ],
      },
    ]

    for (let i = 0; i < expansoes.length; i++) {
      const exp = expansoes[i]
      if (!app.hasTable(exp.tabela)) continue

      try {
        const col = app.findCollectionByNameOrId(exp.tabela)
        for (let j = 0; j < exp.campos.length; j++) {
          const c = exp.campos[j]
          const f = col.fields.getByName(c.name)
          if (f) {
            f.max = c.max
            f.required = c.required
          } else {
            col.fields.add(new TextField({ name: c.name, max: c.max, required: c.required }))
          }
        }
        app.save(col)
      } catch (err) {
        console.log(
          `Aviso ao atualizar coleção ${exp.tabela}:`,
          err && err.message ? err.message : err,
        )
      }
    }
  },
  (app) => {
    // Reversão defensiva (no-op para evitar corrupção)
  },
)
