/**
 * pocketbase/migrations/1740000035_corrigir_mae_roundup_original_mais.js
 *
 * Correção definitiva da linha-mãe e saneamento de empresas do ROUNDUP ORIGINAL MAIS:
 * 1. Insere a linha-mãe em bula_produtos para o registro MAPA 'Nº 01119' caso não exista.
 * 2. Em bula_empresas, remove linhas corrompidas cujo razao_social contenha 'CNPJ' ou
 *    ultrapasse 150 caracteres, preservando as empresas íntegras.
 * 3. Idempotente: seguro para reexecuções em bases vazias ou já migradas.
 */

migrate(
  (app) => {
    // 1. Garantir linha-mãe em bula_produtos
    try {
      const colProd = app.findCollectionByNameOrId('bula_produtos')
      const prods =
        app.findRecordsByFilter(
          'bula_produtos',
          "registro_mapa = 'Nº 01119' || registro_mapa = '01119' || mapa_oficial_limpo = '01119'",
          '-created',
          1,
          0,
        ) || []

      if (prods.length === 0) {
        const rec = new Record(colProd)
        rec.set('nome_comercial', 'ROUNDUP ORIGINAL MAIS')
        rec.set('marca_padronizada', 'ROUNDUP ORIGINAL MAIS')
        rec.set('registro_mapa', 'Nº 01119')
        rec.set('mapa_oficial_limpo', '01119')
        rec.set('principio_ativo', 'Sal de Di-amônio de N-(phosphonomethyl)glycine (GLIFOSATO)')
        rec.set('titular_registro', 'MONSANTO DO BRASIL LTDA.')
        rec.set('fabricante_formulador', 'MONSANTO DO BRASIL LTDA.')
        rec.set('grupo_quimico', 'Glicina substituída')
        rec.set('tipo_formulacao', 'SL')
        rec.set('tipo_produto', 'Produto Formulado Comercial')
        rec.set('sub_grupo', 'Herbicida')
        rec.set('macro_grupo', 'Defensivos')
        rec.set('embalagem', '20 L (Bombona)')
        rec.set('ncm_padrao', '3808.93.29')
        rec.set('ncm_oficial_exata', '3808.93.29')
        rec.set(
          'classificacao_toxicologica',
          'Categoria 5 — Produto Improvável de Causar Dano Agudo',
        )
        rec.set('classificacao_ambiental', 'Classe III — Perigoso ao Meio Ambiente')
        rec.set('status_registro', 'Ativo')
        rec.set(
          'regra_tipi',
          'Posição 38.08 TIPI: Embalagem comercial agrícola usa subitens .2x/.9x',
        )
        rec.set('nota_subpos_2', 'NÃO')
        rec.set('url_oficial', 'https://dados.agricultura.gov.br')
        app.save(rec)
        console.log(
          '[migration 1740000035] Linha-mãe ROUNDUP ORIGINAL MAIS (Nº 01119) inserida em bula_produtos com sucesso.',
        )
      } else {
        console.log(
          '[migration 1740000035] Linha-mãe ROUNDUP ORIGINAL MAIS (Nº 01119) já existe em bula_produtos.',
        )
      }
    } catch (errProd) {
      console.log(
        'Erro ao garantir linha-mãe em bula_produtos (migration 1740000035):',
        errProd && errProd.message ? errProd.message : errProd,
      )
    }

    // 2. Deletar linhas corrompidas em bula_empresas
    try {
      app
        .db()
        .newQuery(`
        DELETE FROM bula_empresas
        WHERE (registro_mapa = 'Nº 01119' OR registro_mapa = '01119')
          AND (razao_social LIKE '%CNPJ%' OR LENGTH(razao_social) > 150);
      `)
        .execute()
      console.log(
        '[migration 1740000035] Linhas corrompidas de bula_empresas (Nº 01119) saneadas com sucesso.',
      )
    } catch (errEmp) {
      console.log(
        'Erro ao sanear bula_empresas corrompidas (migration 1740000035):',
        errEmp && errEmp.message ? errEmp.message : errEmp,
      )
    }
  },
  (app) => {
    // Reversão no-op
  },
)
