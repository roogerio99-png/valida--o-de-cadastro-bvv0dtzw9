/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000027: Reformulação da Base Mestre para granuladidade por Embalagem Comercial (SKU Final)
 *
 * Novos campos:
 * - quantidade_embalagem_principal (number): quantidade em kg ou L da embalagem principal (ex: 4x5L -> 5)
 * - unidade_medida_principal (text): L, KG, SC, etc.
 * - forma_acondicionamento (text): bombona, saco, tambor, big bag, galão, frasco, balde, etc.
 * - embalagem_original (text): texto original completo da embalagem para rastreabilidade (ex: "4x5L", "saco 20 kg")
 * - ncm_especifica (text): NCM exata e fiel resolvida para a embalagem comercial do cadastro
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('base_mestre')

    const novosCampos = [
      new NumberField({ name: 'quantidade_embalagem_principal' }),
      new TextField({ name: 'unidade_medida_principal', max: 50 }),
      new TextField({ name: 'forma_acondicionamento', max: 100 }),
      new TextField({ name: 'embalagem_original', max: 255 }),
      new TextField({ name: 'ncm_especifica', max: 20 }),
    ]

    for (let i = 0; i < novosCampos.length; i++) {
      const campo = novosCampos[i]
      if (!col.fields.getByName(campo.name)) {
        col.fields.add(campo)
      }
    }

    // Criar índice para busca por MAPA + Quantidade + Acondicionamento
    try {
      col.addIndex(
        'idx_cadmestre_sku_emb',
        false,
        'registro_mapa, quantidade_embalagem_principal, forma_acondicionamento',
        '',
      )
    } catch (_) {}

    app.save(col)

    // Backfill seguro dos registros existentes na base_mestre
    // Preenche quantidade principal, unidade, forma de acondicionamento e NCM específica
    try {
      const records = app.findRecordsByFilter('base_mestre', '1 = 1', '-created', 500, 0) || []

      for (let i = 0; i < records.length; i++) {
        const r = records[i]
        const embTexto = String(
          r.getString('embalagem') || r.getString('nome_completo') || '',
        ).trim()
        const paTexto = String(r.getString('principio_ativo') || '').toUpperCase()
        const regMapa = String(r.getString('registro_mapa') || '').trim()

        let qtd = 20
        let un = 'L'
        let acond = 'Bombona'

        // Parser heurístico da embalagem existente
        const embUpper = embTexto.toUpperCase()
        const matchQtd = embUpper.match(
          /(?:(\d+)\s*[xX]\s*)?(\d+(?:[.,]\d+)?)\s*(L|LT|LITROS?|KG|QUILOS?|G|SC|SACO)/i,
        )
        if (matchQtd) {
          const valNum = parseFloat(matchQtd[2].replace(',', '.'))
          if (!isNaN(valNum) && valNum > 0) {
            qtd = valNum
          }
          const rawUn = matchQtd[3].toUpperCase()
          if (rawUn.startsWith('KG') || rawUn.startsWith('QUILO') || rawUn === 'G') {
            un = 'KG'
          } else if (rawUn.startsWith('SC') || rawUn.startsWith('SACO')) {
            un = 'SC'
          } else {
            un = 'L'
          }
        }

        // Acondicionamento
        if (embUpper.includes('SACO') || embUpper.includes('SACARIA')) {
          acond = 'Saco'
        } else if (embUpper.includes('BIG BAG') || embUpper.includes('BIG-BAG')) {
          acond = 'Big Bag'
        } else if (embUpper.includes('TAMBOR')) {
          acond = 'Tambor'
        } else if (embUpper.includes('GALÃO') || embUpper.includes('GALAO')) {
          acond = 'Galão'
        } else if (embUpper.includes('BALDE')) {
          acond = 'Balde'
        } else if (embUpper.includes('FRASCO')) {
          acond = 'Frasco'
        } else if (embUpper.includes('CONTAINER') || embUpper.includes('IBC')) {
          acond = 'Container / IBC'
        } else {
          if (un === 'KG') {
            acond = qtd > 25 ? 'Big Bag' : 'Saco'
          } else {
            if (qtd <= 1) acond = 'Frasco'
            else if (qtd <= 5) acond = 'Galão'
            else if (qtd <= 50) acond = 'Bombona'
            else if (qtd <= 200) acond = 'Tambor'
            else acond = 'Container / IBC'
          }
        }

        // NCM específica
        let ncmEsp = r.getString('ncm_padrao') || r.getString('ncm')
        if (regMapa.includes('002094') || paTexto.includes('ROUNDUP WG')) {
          ncmEsp = '3808.93.24'
        } else if (r.getString('nota_subpos_2') === 'SIM') {
          if (qtd <= 0.3) ncmEsp = '3808.61.00'
          else if (qtd <= 7.5) ncmEsp = '3808.62.90'
          else ncmEsp = '3808.69.90'
        } else if (!ncmEsp) {
          ncmEsp = '3808.93.24'
        }

        // Formatar NCM com máscara
        const ncmLimpa = String(ncmEsp).replace(/\D/g, '')
        let ncmFormatada = ncmEsp
        if (ncmLimpa.length === 8) {
          ncmFormatada = `${ncmLimpa.slice(0, 4)}.${ncmLimpa.slice(4, 6)}.${ncmLimpa.slice(6, 8)}`
        }

        r.set('quantidade_embalagem_principal', qtd)
        r.set('unidade_medida_principal', un)
        r.set('forma_acondicionamento', acond)
        r.set('embalagem_original', embTexto || `${qtd} ${un}`)
        r.set('ncm_especifica', ncmFormatada)
        r.set('ncm_padrao', ncmFormatada)
        r.set('ncm', ncmLimpa)

        app.save(r)
      }
    } catch (errBackfill) {
      console.log(
        'Aviso: backfill de embalagens na base_mestre:',
        errBackfill.message || errBackfill,
      )
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('base_mestre')
      try {
        col.removeIndex('idx_cadmestre_sku_emb')
      } catch (_) {}
      app.save(col)
    } catch (_) {}
  },
)
