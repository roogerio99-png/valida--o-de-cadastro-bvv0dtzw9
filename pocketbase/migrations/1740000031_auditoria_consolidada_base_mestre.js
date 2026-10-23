/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Migration 1740000031_auditoria_consolidada_base_mestre.js
    // Consolidação de auditoria da rotina de Base Mestre:
    // 1. Garante que ROUNDUP WG (MAPA 002094) mantenha exclusivamente NCM 38089324 / 3808.93.24.
    // 2. Corrige produtos técnicos e fertilizantes que foram indevidamente contaminados com 38089324:
    //    - TC08525 (ROUNDUP MEA PREMIX): produto técnico industrial -> NCM 3808.93.19 / 38089319
    //    - Nº 10901 (ROUNDUP AMÔNIO PRÉ MIX): pré-mistura técnica industrial -> NCM 3808.93.19 / 38089319
    // 3. Recalcula e padroniza a quantidade_embalagem_principal e forma_acondicionamento em toda a base_mestre:
    //    - Formato "4x5KG" -> quantidade = 5, unidade = KG, forma = Saco/Galão
    //    - Formato "4x5L" -> quantidade = 5, unidade = L
    //    - Formato "1x20L" -> quantidade = 20, unidade = L, forma = Bombona
    //    - Formato "0,200KG" -> quantidade = 0.2, unidade = KG, forma = Saco
    //    - Formato "0,200L" -> quantidade = 0.2, unidade = L, forma = Frasco/Bombona
    // 4. Formata e mascara ncm_especifica em 0000.00.00 sem faixas para todos os registros.
    // 5. Totalmente idempotente.

    function fmtNcm(raw) {
      const d = String(raw || '').replace(/\D/g, '')
      if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
      return raw ? String(raw).trim() : ''
    }

    try {
      const todos = app.findRecordsByFilter('base_mestre', 'id != ""', 'created', 500, 0) || []

      for (const rec of todos) {
        let mod = false
        const regMapa = rec.getString('registro_mapa') || ''
        const marca = (
          rec.getString('marca_padronizada') ||
          rec.getString('nome_produto') ||
          ''
        ).toUpperCase()
        const nome = (rec.getString('nome_completo') || '').toUpperCase()
        const embTexto = (
          rec.getString('embalagem_original') ||
          rec.getString('embalagem') ||
          ''
        ).toUpperCase()
        const embOrig = rec.getString('embalagem_original') || rec.getString('embalagem') || ''

        // 1. Parser refinado de quantidade e unidade da embalagem comercial
        let qtdPrinc = rec.getFloat('quantidade_embalagem_principal') || 0
        let unPrinc = (
          rec.getString('unidade_medida_principal') ||
          rec.getString('unidade') ||
          'L'
        ).toUpperCase()

        const mMultiplo = embTexto.match(
          /(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(KG|KGS|KILOS?|QUILOS?|G\b|L\b|LT|LITROS?|ML)/,
        )
        if (mMultiplo) {
          let q = parseFloat(mMultiplo[2].replace(',', '.'))
          const u = mMultiplo[3]
          if (u === 'G' || u === 'ML') q = q * 0.001
          qtdPrinc = q
          unPrinc =
            u.startsWith('KG') || u.startsWith('QUILO') || u.startsWith('KILO') || u === 'G'
              ? 'KG'
              : 'L'
        } else {
          const mDireto = embTexto.match(
            /(\d+(?:[.,]\d+)?)\s*(KG|KGS|KILOS?|QUILOS?|G\b|L\b|LT|LITROS?|ML)\b/,
          )
          if (mDireto) {
            let q = parseFloat(mDireto[1].replace(',', '.'))
            const u = mDireto[2]
            if (u === 'G' || u === 'ML') q = q * 0.001
            qtdPrinc = q
            unPrinc =
              u.startsWith('KG') || u.startsWith('QUILO') || u.startsWith('KILO') || u === 'G'
                ? 'KG'
                : 'L'
          }
        }

        if (qtdPrinc > 0 && rec.getFloat('quantidade_embalagem_principal') !== qtdPrinc) {
          rec.set('quantidade_embalagem_principal', qtdPrinc)
          mod = true
        }
        if (unPrinc && rec.getString('unidade_medida_principal') !== unPrinc) {
          rec.set('unidade_medida_principal', unPrinc)
          rec.set('unidade', unPrinc)
          mod = true
        }

        // 2. Normalização da forma de acondicionamento
        let acond = rec.getString('forma_acondicionamento') || ''
        const formaBusca = `${acond} ${embTexto}`.toUpperCase()
        if (formaBusca.includes('BIG BAG') || formaBusca.includes('BIG-BAG')) acond = 'Big Bag'
        else if (formaBusca.includes('BOMBONA')) acond = 'Bombona'
        else if (formaBusca.includes('TAMBOR')) acond = 'Tambor'
        else if (
          formaBusca.includes('SACARIA') ||
          formaBusca.includes('SACO') ||
          formaBusca.includes('SACA')
        )
          acond = 'Saco'
        else if (formaBusca.includes('BALDE')) acond = 'Balde'
        else if (formaBusca.includes('FRASCO') || formaBusca.includes('AMPOULA')) acond = 'Frasco'
        else if (formaBusca.includes('GALÃO') || formaBusca.includes('GALAO')) acond = 'Galão'
        else if (
          formaBusca.includes('CONTAINER') ||
          formaBusca.includes('CONTÊINER') ||
          formaBusca.includes('IBC')
        )
          acond = 'Container / IBC'
        else if (formaBusca.includes('CAIXA') || formaBusca.includes('CARTUCHO')) acond = 'Caixa'
        else if (formaBusca.includes('SACHE') || formaBusca.includes('SACHET')) acond = 'Sache'
        else {
          if (unPrinc === 'KG') acond = qtdPrinc > 25 ? 'Big Bag' : 'Saco'
          else {
            if (qtdPrinc <= 1) acond = 'Frasco'
            else if (qtdPrinc <= 5) acond = 'Galão'
            else if (qtdPrinc <= 50) acond = 'Bombona'
            else if (qtdPrinc <= 250) acond = 'Tambor'
            else acond = 'Container / IBC'
          }
        }

        if (acond && rec.getString('forma_acondicionamento') !== acond) {
          rec.set('forma_acondicionamento', acond)
          mod = true
        }

        // 3. Resolução de NCM específica com preservação do ROUNDUP WG e correção dos técnicos contaminados
        const isRoundupWg =
          regMapa.includes('002094') || marca === 'ROUNDUP WG' || nome === 'ROUNDUP WG'

        const isRoundupTecnico =
          regMapa.includes('08525') ||
          regMapa.includes('10901') ||
          marca.includes('ROUNDUP MEA') ||
          marca.includes('ROUNDUP AMÔNIO') ||
          nome.includes('ROUNDUP MEA') ||
          nome.includes('ROUNDUP AMÔNIO')

        if (isRoundupWg) {
          // Exceção exclusiva ROUNDUP WG: 3808.93.24
          if (rec.getString('ncm_especifica') !== '3808.93.24') {
            rec.set('ncm_especifica', '3808.93.24')
            mod = true
          }
          if (rec.getString('ncm_padrao') !== '3808.93.24') {
            rec.set('ncm_padrao', '3808.93.24')
            mod = true
          }
          if (rec.getString('ncm') !== '38089324') {
            rec.set('ncm', '38089324')
            mod = true
          }
        } else if (isRoundupTecnico) {
          // Descontaminar ROUNDUP técnico / pré-mistura industrial para 3808.93.19
          rec.set('ncm_especifica', '3808.93.19')
          rec.set('ncm_padrao', '3808.93.19')
          rec.set('ncm', '38089319')
          rec.set('ncm_faixa1_ate_300g', '3808.93.19')
          rec.set('ncm_faixa2_300g_a_7_5kg', '3808.93.19')
          rec.set('ncm_faixa3_7_5kg_a_10kg', '3808.93.19')
          rec.set('ncm_faixa4_acima_10kg', '3808.93.19')
          rec.set('tipo_produto', 'Produto Técnico Industrial')
          rec.set('macro_grupo', 'Produtos Técnicos')
          rec.set('sub_grupo', 'Matéria-Prima Técnica Industrial')
          mod = true
        } else {
          // Outros produtos: garantir formato canônico da NCM específica sem contaminação
          let ncmEsp =
            rec.getString('ncm_especifica') ||
            rec.getString('ncm_padrao') ||
            rec.getString('ncm') ||
            ''
          if (ncmEsp.replace(/\D/g, '') === '38089324') {
            // Contaminação de produto não-roundup por 38089324 -> reverter para ncm_faixa4 ou 3808.93.29
            const f4 = rec.getString('ncm_faixa4_acima_10kg') || ''
            ncmEsp = f4 && f4.replace(/\D/g, '') !== '38089324' ? f4 : '3808.93.29'
          }
          const ncmFmt = fmtNcm(ncmEsp)
          if (rec.getString('ncm_especifica') !== ncmFmt) {
            rec.set('ncm_especifica', ncmFmt)
            rec.set('ncm', ncmFmt.replace(/\D/g, ''))
            mod = true
          }
        }

        if (mod) {
          app.save(rec)
        }
      }
    } catch (err) {
      console.log(
        'Aviso ao auditar e sanear base_mestre na migration 1740000031:',
        err.message || err,
      )
    }
  },
  (app) => {
    // Revert opcional idempotente
  },
)
