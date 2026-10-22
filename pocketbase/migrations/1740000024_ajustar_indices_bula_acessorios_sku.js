/**
 * pocketbase/migrations/1740000024_ajustar_indices_bula_acessorios_sku.js
 *
 * Atualiza os índices de todas as 6 coleções acessórias de Cadastro de Bula:
 * - bula_composicao (Aba 2: Composicao_Em_Linhas)
 * - bula_empresas (Aba 3: Cadeia_Empresas_Linhas)
 * - bula_embalagens (Aba 4: Embalagens_NCM_Linhas)
 * - bula_culturas (Aba 5: Culturas_Carencia_Linhas)
 * - bula_alvos (Aba 6: Alvos_e_Doses_Linhas)
 * - bula_aplicacao (Aba 7: Aplicacao_e_EPI_Linhas)
 *
 * Objetivo:
 * Substituir índices únicos que causavam colapso/fusão entre linhas de produtos/SKUs diferentes
 * que compartilham o mesmo Registro MAPA por índices não-únicos de busca ou compostos com `codigo`,
 * garantindo a ingestão 1:1 integral por linha de cada produto/SKU da planilha.
 *
 * Idempotente e seguro contra bancos com ou sem dados existentes.
 */

migrate(
  (app) => {
    // -------------------------------------------------------------------------
    // 1. bula_composicao
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_composicao')) {
      try {
        const col = app.findCollectionByNameOrId('bula_composicao')
        col.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_comp_mapa ON bula_composicao (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_comp_mapa_codigo ON bula_composicao (registro_mapa, codigo)',
          'CREATE INDEX IF NOT EXISTS idx_bula_comp_ia ON bula_composicao (ingrediente_ativo)',
          'CREATE INDEX IF NOT EXISTS idx_bula_comp_nome ON bula_composicao (nome_produto)',
        ]
        app.save(col)
        console.log('Índices de bula_composicao atualizados com sucesso.')
      } catch (err) {
        console.log(
          'Aviso ao ajustar índices de bula_composicao:',
          err && err.message ? err.message : err,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 2. bula_empresas
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_empresas')) {
      try {
        const col = app.findCollectionByNameOrId('bula_empresas')
        col.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_emp_mapa ON bula_empresas (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emp_mapa_codigo ON bula_empresas (registro_mapa, codigo)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emp_razao ON bula_empresas (razao_social)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emp_tipo ON bula_empresas (tipo_relacao)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emp_cnpj ON bula_empresas (cnpj)',
        ]
        app.save(col)
        console.log('Índices de bula_empresas atualizados com sucesso.')
      } catch (err) {
        console.log(
          'Aviso ao ajustar índices de bula_empresas:',
          err && err.message ? err.message : err,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 3. bula_embalagens
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_embalagens')) {
      try {
        const col = app.findCollectionByNameOrId('bula_embalagens')
        col.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_emb_mapa ON bula_embalagens (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emb_mapa_codigo ON bula_embalagens (registro_mapa, codigo)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emb_tipo ON bula_embalagens (tipo_embalagem)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emb_ncm ON bula_embalagens (ncm)',
        ]
        app.save(col)
        console.log('Índices de bula_embalagens atualizados com sucesso.')
      } catch (err) {
        console.log(
          'Aviso ao ajustar índices de bula_embalagens:',
          err && err.message ? err.message : err,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 4. bula_culturas
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_culturas')) {
      try {
        const col = app.findCollectionByNameOrId('bula_culturas')
        col.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_cult_mapa ON bula_culturas (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_cult_mapa_codigo ON bula_culturas (registro_mapa, codigo)',
          'CREATE INDEX IF NOT EXISTS idx_bula_cult_cultura ON bula_culturas (cultura)',
        ]
        app.save(col)
        console.log('Índices de bula_culturas atualizados com sucesso.')
      } catch (err) {
        console.log(
          'Aviso ao ajustar índices de bula_culturas:',
          err && err.message ? err.message : err,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 5. bula_alvos
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_alvos')) {
      try {
        const col = app.findCollectionByNameOrId('bula_alvos')
        col.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_alv_mapa ON bula_alvos (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_alv_mapa_codigo ON bula_alvos (registro_mapa, codigo)',
          'CREATE INDEX IF NOT EXISTS idx_bula_alv_alvo ON bula_alvos (alvo_biologico)',
          'CREATE INDEX IF NOT EXISTS idx_bula_alv_cultura ON bula_alvos (cultura)',
        ]
        app.save(col)
        console.log('Índices de bula_alvos atualizados com sucesso.')
      } catch (err) {
        console.log(
          'Aviso ao ajustar índices de bula_alvos:',
          err && err.message ? err.message : err,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 6. bula_aplicacao
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_aplicacao')) {
      try {
        const col = app.findCollectionByNameOrId('bula_aplicacao')
        col.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_apl_mapa ON bula_aplicacao (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_apl_mapa_codigo ON bula_aplicacao (registro_mapa, codigo)',
          'CREATE INDEX IF NOT EXISTS idx_bula_apl_tipo ON bula_aplicacao (tipo_aplicacao)',
        ]
        app.save(col)
        console.log('Índices de bula_aplicacao atualizados com sucesso.')
      } catch (err) {
        console.log(
          'Aviso ao ajustar índices de bula_aplicacao:',
          err && err.message ? err.message : err,
        )
      }
    }
  },
  (app) => {
    // Reversão defensiva
    const acessorios = [
      'bula_composicao',
      'bula_empresas',
      'bula_embalagens',
      'bula_culturas',
      'bula_alvos',
      'bula_aplicacao',
    ]
    for (let i = 0; i < acessorios.length; i++) {
      try {
        if (!app.hasTable(acessorios[i])) continue
        const col = app.findCollectionByNameOrId(acessorios[i])
        col.indexes = [
          `CREATE INDEX IF NOT EXISTS idx_${col.name}_mapa ON ${col.name} (registro_mapa)`,
        ]
        app.save(col)
      } catch (_) {}
    }
  },
)
