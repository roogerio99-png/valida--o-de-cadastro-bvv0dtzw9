/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000028: Backfill dos novos campos de embalagem nos registros existentes de base_mestre
 */
migrate(
  (app) => {
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
    } catch (err) {
      console.log('Erro no backfill 1740000028:', err.message || err)
    }
  },
  (app) => {},
)
