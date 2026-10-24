/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000041:
 * Reparar os registros já gravados em 'sim_produtos_base' a partir do seu próprio campo 'dados_extras'.
 *
 * Idempotente: lê os dados_extras já gravados no banco e rederiva:
 * - descricao: B1_DESC (nunca BM_DESC)
 * - ncm: B1_POSIPI formatado em máscara canônica 0000.00.00
 * - embalagem: extraído da descrição (ex. "1X20L", "4X5L", "200L", "20KG")
 * - origem: X5_TABELA ou sufixo (IMP)/(SS)
 * - fabricante: extraído do padrão "PRODUTO - FABRICANTE (AGENCIADO)"
 * - tipo_produto: derivado de BM_DESC / B1_GRUPO
 * - unidade: normalizada para L, KG, SC, etc.
 * - preco_base_sugerido: B1_PRV1 / coluna de preço se houver
 *
 * Regra do projeto: NENHUM dado de planilha embutido em código.
 */

migrate(
  (app) => {
    if (!app.hasTable('sim_produtos_base')) {
      return
    }

    function fmtNcm(raw) {
      const digits = String(raw || '').replace(/\D/g, '')
      if (digits.length === 8) {
        return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
      }
      if (digits.length > 0 && digits.length < 8) {
        const padded = digits.padStart(8, '0')
        return `${padded.slice(0, 4)}.${padded.slice(4, 6)}.${padded.slice(6, 8)}`
      }
      return ''
    }

    function extrairEmbalagem(texto) {
      if (!texto) return ''
      const m = String(texto).match(
        /\b(\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(?:L|LT|KG|G|ML|SC|DOSES)|\d+(?:[.,]\d+)?\s*(?:L|LT|KG|G|ML|SC|DOSES))\b/i,
      )
      if (m) {
        return m[1].replace(/\s+/g, '').replace('X', 'x')
      }
      return ''
    }

    function normalizarUnid(u, emb) {
      if (u) {
        const up = String(u).trim().toUpperCase()
        if (['L', 'KG', 'SC', 'UN', 'DOSES'].includes(up)) return up
        if (up === 'LT' || up === 'LITROS' || up === 'ML') return 'L'
        if (up === 'G' || up === 'KILOS' || up === 'QUILOS' || up === 'TON' || up === 'T')
          return 'KG'
        if (up === 'SACO' || up === 'SACAS') return 'SC'
        if (up === 'FRASCO' || up === 'BOMBONA' || up === 'TAMBOR' || up === 'LATA') return 'UN'
      }
      const embUp = String(emb || '').toUpperCase()
      if (embUp.includes('KG') || embUp.includes('QUILO') || embUp.includes('G')) return 'KG'
      if (embUp.includes('SC') || embUp.includes('SACO')) return 'SC'
      if (embUp.includes('DOSE')) return 'DOSES'
      if (embUp.includes('UN')) return 'UN'
      return 'L'
    }

    function derivarOrigem(x5, desc, emb) {
      if (x5) {
        const up = String(x5).toUpperCase()
        if (up.includes('IMP') || up.includes('ESTRANGEIR')) return 'Importado'
        if (up.includes('NAC')) return 'Nacional'
      }
      const dUp = String(desc || '').toUpperCase()
      const eUp = String(emb || '').toUpperCase()
      if (
        dUp.includes('(IMP)') ||
        dUp.includes(' IMP ') ||
        dUp.endsWith(' IMP') ||
        dUp.includes('(SS)') ||
        eUp.includes('IMP')
      ) {
        return 'Importado'
      }
      return 'Nacional'
    }

    function extrairFabricante(desc) {
      if (!desc) return ''
      const m = String(desc).match(
        /[-–—]\s*([A-Za-z0-9&.\s]+?)\s*\((?:AGENCIADO|AGENC|DISTRIBUIDO)\)/i,
      )
      if (m) {
        return m[1].trim()
      }
      return ''
    }

    function derivarTipoProduto(tipo, bmDesc, b1Grupo, desc) {
      const s =
        `${String(tipo || '')} ${String(bmDesc || '')} ${String(b1Grupo || '')} ${String(desc || '')}`.toUpperCase()
      if (s.includes('FERTILIZANTE') || s.includes('NPK') || s.includes('ORGANOMINERAL')) {
        return 'Fertilizante Mineral / Organomineral'
      }
      if (
        s.includes('ADJUVANTE') ||
        s.includes('ESPALHANTE') ||
        s.includes('OLEO MINERAL') ||
        s.includes('ÓLEO MINERAL')
      ) {
        return 'Adjuvante / Espalhante Adesivo'
      }
      if (s.includes('BIOLOGICO') || s.includes('BIOLÓGICO') || s.includes('INOCULANTE')) {
        return 'Inoculante / Biológico'
      }
      if (
        s.includes('CORRETIVO') ||
        s.includes('CONDICIONADOR') ||
        s.includes('CALCARIO') ||
        s.includes('GESSO')
      ) {
        return 'Corretivo / Condicionador de Solo'
      }
      if (s.includes('SEMENTE')) {
        return 'Semente Certificada'
      }
      if (s.includes('TECNICO') || s.includes('TÉCNICO')) {
        return 'Produto Técnico Industrial'
      }
      if (s.includes('PRE-MISTURA') || s.includes('PRÉ-MISTURA')) {
        return 'Pré-Mistura Industrial'
      }
      return 'Produto Formulado Comercial'
    }

    // Busca todos os registros de sim_produtos_base em blocos de até 1000
    let offset = 0
    const limit = 500
    let hasMore = true

    while (hasMore) {
      const records = app.findRecordsByFilter('sim_produtos_base', '', 'id', limit, offset) || []
      if (records.length === 0) {
        hasMore = false
        break
      }

      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        const rawExtras = record.getString('dados_extras')
        if (!rawExtras) continue

        let extras = null
        try {
          extras = JSON.parse(rawExtras)
        } catch (_) {
          extras = null
        }
        if (!extras || typeof extras !== 'object') continue

        // 1. Descrição real: B1_DESC
        const b1Desc = String(extras.B1_DESC || extras.b1_desc || '').trim()
        const bmDesc = String(extras.BM_DESC || extras.bm_desc || '').trim()
        const b1Cod = String(extras.B1_COD || extras.b1_cod || '').trim()
        const b1Posipi = String(extras.B1_POSIPI || extras.b1_posipi || '').trim()
        const b1Um = String(extras.B1_UM || extras.b1_um || '').trim()
        const b1Grupo = String(extras.B1_GRUPO || extras.b1_grupo || '').trim()
        const x5 = String(extras.X5_TABELA || extras.X5_DESC || extras.x5_tabela || '').trim()
        const b1Prv1 = extras.B1_PRV1 || extras.b1_prv1 || extras.preco || 0

        const descFinal = b1Desc || record.getString('descricao')
        if (descFinal) {
          record.set('descricao', descFinal)
        }

        // 2. NCM canônico
        const ncmFinal = fmtNcm(b1Posipi || record.getString('ncm'))
        if (ncmFinal) {
          record.set('ncm', ncmFinal)
        }

        // 3. Código
        if (b1Cod) {
          record.set('codigo', b1Cod)
        }

        // 4. Embalagem
        const embFinal = extrairEmbalagem(descFinal) || record.getString('embalagem')
        record.set('embalagem', embFinal)

        // 5. Unidade
        const unidFinal = normalizarUnid(b1Um, embFinal)
        record.set('unidade', unidFinal)

        // 6. Origem
        const origemFinal = derivarOrigem(x5, descFinal, embFinal)
        record.set('origem', origemFinal)

        // 7. Fabricante
        const fabFinal = extrairFabricante(descFinal) || record.getString('fabricante')
        record.set('fabricante', fabFinal)

        // 8. Tipo de produto
        const tipoFinal = derivarTipoProduto(
          record.getString('tipo_produto'),
          bmDesc,
          b1Grupo,
          descFinal,
        )
        record.set('tipo_produto', tipoFinal)

        // 9. Moeda e Preço
        const moedaFinal = origemFinal === 'Importado' ? 'USD' : 'BRL'
        record.set('moeda', moedaFinal)

        const precoFinal = Number(b1Prv1) || record.getFloat('preco_base_sugerido') || 0
        record.set('preco_base_sugerido', precoFinal)

        app.save(record)
      }

      offset += limit
      if (records.length < limit) {
        hasMore = false
      }
    }
  },
  (app) => {
    // Reversão neutra (preserva os dados_extras intactos)
  },
)
