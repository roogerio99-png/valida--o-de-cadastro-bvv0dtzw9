/**
 * pocketbase/migrations/1740000016_deduplicar_e_indices_bula.js
 *
 * Migração idempotente para deduplicação e garantia de unicidade no Cadastro de Bula:
 * 1. Normalização do registro_mapa em formato canônico nas 7 coleções de bula.
 * 2. Deduplicação idempotente dos registros existentes por chave natural (mantendo o mais recente).
 * 3. Criação de índices únicos nas coleções acessórias e confirmação na principal.
 *
 * Compatível com execução em banco vazio (no-op).
 */

migrate(
  (app) => {
    function normMapa(s) {
      if (!s) return 'ISENTO'
      const str = String(s).trim()
      if (!str) return 'ISENTO'
      const up = str.toUpperCase()
      if (up.includes('ISENTO')) return 'ISENTO'
      if (up.startsWith('TC') || str.includes('-')) return str
      const digits = str.replace(/\D/g, '')
      if (digits.length > 0 && digits.length < 4) {
        return `Nº ${digits.padStart(4, '0')}`
      }
      if (digits.length > 0) {
        return `Nº ${digits}`
      }
      return str
    }

    function normTxt(s) {
      return String(s || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]/g, '')
    }

    // -------------------------------------------------------------------------
    // 1. Deduplicação em bula_produtos (Chave: registro_mapa normalizado)
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_produtos')) {
      try {
        const records =
          app.findRecordsByFilter('bula_produtos', 'id != ""', '-created', 5000, 0) || []
        const seenMap = {}

        for (let i = 0; i < records.length; i++) {
          const rec = records[i]
          const regRaw = rec.getString('registro_mapa')
          const regCanonico = normMapa(regRaw)

          if (seenMap[regCanonico]) {
            // Duplicata encontrada: remove o registro mais antigo
            try {
              app.delete(rec)
            } catch (_) {}
          } else {
            seenMap[regCanonico] = true
            if (regRaw !== regCanonico) {
              rec.set('registro_mapa', regCanonico)
              try {
                app.save(rec)
              } catch (_) {}
            }
          }
        }
      } catch (e) {
        console.log('Aviso ao deduplicar bula_produtos:', e && e.message ? e.message : e)
      }
    }

    // -------------------------------------------------------------------------
    // 2. Deduplicação em bula_composicao (Chave: registro_mapa + ingrediente_ativo)
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_composicao')) {
      try {
        const records =
          app.findRecordsByFilter('bula_composicao', 'id != ""', '-created', 10000, 0) || []
        const seenMap = {}

        for (let i = 0; i < records.length; i++) {
          const rec = records[i]
          const regRaw = rec.getString('registro_mapa')
          const regCanonico = normMapa(regRaw)
          const iaNorm = normTxt(rec.getString('ingrediente_ativo'))
          const chave = `${regCanonico}___${iaNorm}`

          if (seenMap[chave]) {
            try {
              app.delete(rec)
            } catch (_) {}
          } else {
            seenMap[chave] = true
            if (regRaw !== regCanonico) {
              rec.set('registro_mapa', regCanonico)
              try {
                app.save(rec)
              } catch (_) {}
            }
          }
        }

        // Criar índice único composto
        const colComp = app.findCollectionByNameOrId('bula_composicao')
        colComp.indexes = [
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_bula_comp_mapa_ia ON bula_composicao (registro_mapa, ingrediente_ativo)',
          'CREATE INDEX IF NOT EXISTS idx_bula_comp_mapa ON bula_composicao (registro_mapa)',
        ]
        app.save(colComp)
      } catch (e) {
        console.log('Aviso ao deduplicar bula_composicao:', e && e.message ? e.message : e)
      }
    }

    // -------------------------------------------------------------------------
    // 3. Deduplicação em bula_empresas (Chave: registro_mapa + tipo_relacao + razao_social + cnpj)
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_empresas')) {
      try {
        const records =
          app.findRecordsByFilter('bula_empresas', 'id != ""', '-created', 10000, 0) || []
        const seenMap = {}

        for (let i = 0; i < records.length; i++) {
          const rec = records[i]
          const regRaw = rec.getString('registro_mapa')
          const regCanonico = normMapa(regRaw)
          const tipoNorm = normTxt(rec.getString('tipo_relacao'))
          const razaoNorm = normTxt(rec.getString('razao_social'))
          const cnpjDigits = rec.getString('cnpj').replace(/\D/g, '')
          const chave = `${regCanonico}___${tipoNorm}___${razaoNorm}___${cnpjDigits}`

          if (seenMap[chave]) {
            try {
              app.delete(rec)
            } catch (_) {}
          } else {
            seenMap[chave] = true
            if (regRaw !== regCanonico) {
              rec.set('registro_mapa', regCanonico)
              try {
                app.save(rec)
              } catch (_) {}
            }
          }
        }

        // Atualizar índices
        const colEmp = app.findCollectionByNameOrId('bula_empresas')
        colEmp.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_emp_mapa ON bula_empresas (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emp_razao ON bula_empresas (razao_social)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emp_tipo ON bula_empresas (tipo_relacao)',
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_bula_emp_natural ON bula_empresas (registro_mapa, tipo_relacao, razao_social, cnpj)',
        ]
        app.save(colEmp)
      } catch (e) {
        console.log('Aviso ao deduplicar bula_empresas:', e && e.message ? e.message : e)
      }
    }

    // -------------------------------------------------------------------------
    // 4. Deduplicação em bula_embalagens (Chave: registro_mapa + tipo_embalagem + capacidade + material)
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_embalagens')) {
      try {
        const records =
          app.findRecordsByFilter('bula_embalagens', 'id != ""', '-created', 10000, 0) || []
        const seenMap = {}

        for (let i = 0; i < records.length; i++) {
          const rec = records[i]
          const regRaw = rec.getString('registro_mapa')
          const regCanonico = normMapa(regRaw)
          const tipoNorm = normTxt(rec.getString('tipo_embalagem'))
          const capNorm = normTxt(rec.getString('capacidade'))
          const matNorm = normTxt(rec.getString('material'))
          const chave = `${regCanonico}___${tipoNorm}___${capNorm}___${matNorm}`

          if (seenMap[chave]) {
            try {
              app.delete(rec)
            } catch (_) {}
          } else {
            seenMap[chave] = true
            if (regRaw !== regCanonico) {
              rec.set('registro_mapa', regCanonico)
              try {
                app.save(rec)
              } catch (_) {}
            }
          }
        }

        const colEmb = app.findCollectionByNameOrId('bula_embalagens')
        colEmb.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_emb_mapa ON bula_embalagens (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_emb_ncm ON bula_embalagens (ncm)',
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_bula_emb_natural ON bula_embalagens (registro_mapa, tipo_embalagem, capacidade, material)',
        ]
        app.save(colEmb)
      } catch (e) {
        console.log('Aviso ao deduplicar bula_embalagens:', e && e.message ? e.message : e)
      }
    }

    // -------------------------------------------------------------------------
    // 5. Deduplicação em bula_culturas (Chave: registro_mapa + cultura)
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_culturas')) {
      try {
        const records =
          app.findRecordsByFilter('bula_culturas', 'id != ""', '-created', 10000, 0) || []
        const seenMap = {}

        for (let i = 0; i < records.length; i++) {
          const rec = records[i]
          const regRaw = rec.getString('registro_mapa')
          const regCanonico = normMapa(regRaw)
          const cultNorm = normTxt(rec.getString('cultura'))
          const chave = `${regCanonico}___${cultNorm}`

          if (seenMap[chave]) {
            try {
              app.delete(rec)
            } catch (_) {}
          } else {
            seenMap[chave] = true
            if (regRaw !== regCanonico) {
              rec.set('registro_mapa', regCanonico)
              try {
                app.save(rec)
              } catch (_) {}
            }
          }
        }

        const colCult = app.findCollectionByNameOrId('bula_culturas')
        colCult.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_cult_mapa ON bula_culturas (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_cult_cultura ON bula_culturas (cultura)',
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_bula_cult_mapa_cultura ON bula_culturas (registro_mapa, cultura)',
        ]
        app.save(colCult)
      } catch (e) {
        console.log('Aviso ao deduplicar bula_culturas:', e && e.message ? e.message : e)
      }
    }

    // -------------------------------------------------------------------------
    // 6. Deduplicação em bula_alvos (Chave: registro_mapa + cultura + alvo_biologico)
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_alvos')) {
      try {
        const records =
          app.findRecordsByFilter('bula_alvos', 'id != ""', '-created', 15000, 0) || []
        const seenMap = {}

        for (let i = 0; i < records.length; i++) {
          const rec = records[i]
          const regRaw = rec.getString('registro_mapa')
          const regCanonico = normMapa(regRaw)
          const cultNorm = normTxt(rec.getString('cultura'))
          const alvoNorm = normTxt(rec.getString('alvo_biologico'))
          const chave = `${regCanonico}___${cultNorm}___${alvoNorm}`

          if (seenMap[chave]) {
            try {
              app.delete(rec)
            } catch (_) {}
          } else {
            seenMap[chave] = true
            if (regRaw !== regCanonico) {
              rec.set('registro_mapa', regCanonico)
              try {
                app.save(rec)
              } catch (_) {}
            }
          }
        }

        const colAlv = app.findCollectionByNameOrId('bula_alvos')
        colAlv.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_alv_mapa ON bula_alvos (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_alv_alvo ON bula_alvos (alvo_biologico)',
          'CREATE INDEX IF NOT EXISTS idx_bula_alv_cultura ON bula_alvos (cultura)',
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_bula_alv_natural ON bula_alvos (registro_mapa, cultura, alvo_biologico)',
        ]
        app.save(colAlv)
      } catch (e) {
        console.log('Aviso ao deduplicar bula_alvos:', e && e.message ? e.message : e)
      }
    }

    // -------------------------------------------------------------------------
    // 7. Deduplicação em bula_aplicacao (Chave: registro_mapa + tipo_aplicacao)
    // -------------------------------------------------------------------------
    if (app.hasTable('bula_aplicacao')) {
      try {
        const records =
          app.findRecordsByFilter('bula_aplicacao', 'id != ""', '-created', 5000, 0) || []
        const seenMap = {}

        for (let i = 0; i < records.length; i++) {
          const rec = records[i]
          const regRaw = rec.getString('registro_mapa')
          const regCanonico = normMapa(regRaw)
          const tipoNorm = normTxt(rec.getString('tipo_aplicacao'))
          const chave = `${regCanonico}___${tipoNorm}`

          if (seenMap[chave]) {
            try {
              app.delete(rec)
            } catch (_) {}
          } else {
            seenMap[chave] = true
            if (regRaw !== regCanonico) {
              rec.set('registro_mapa', regCanonico)
              try {
                app.save(rec)
              } catch (_) {}
            }
          }
        }

        const colApl = app.findCollectionByNameOrId('bula_aplicacao')
        colApl.indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bula_apl_mapa ON bula_aplicacao (registro_mapa)',
          'CREATE INDEX IF NOT EXISTS idx_bula_apl_tipo ON bula_aplicacao (tipo_aplicacao)',
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_bula_apl_natural ON bula_aplicacao (registro_mapa, tipo_aplicacao)',
        ]
        app.save(colApl)
      } catch (e) {
        console.log('Aviso ao deduplicar bula_aplicacao:', e && e.message ? e.message : e)
      }
    }
  },
  (app) => {
    // Reversão de índices únicos para índices simples
    const collections = [
      'bula_composicao',
      'bula_empresas',
      'bula_embalagens',
      'bula_culturas',
      'bula_alvos',
      'bula_aplicacao',
    ]
    for (let i = 0; i < collections.length; i++) {
      try {
        const col = app.findCollectionByNameOrId(collections[i])
        col.indexes = [
          `CREATE INDEX IF NOT EXISTS idx_${col.name}_mapa ON ${col.name} (registro_mapa)`,
        ]
        app.save(col)
      } catch (_) {}
    }
  },
)
