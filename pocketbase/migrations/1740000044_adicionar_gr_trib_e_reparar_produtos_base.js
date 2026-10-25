/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000044:
 * 1. Adicionar campo 'gr_trib' (texto, opcional) na coleção 'sim_produtos_base'
 * 2. Backfill e reparo idempotente dos registros existentes de 'sim_produtos_base':
 *    - gr_trib: extraído de dados_extras.B1_GRTRIB2 (ou aliases b1_grtrib2, gr_trib, grtrib, grupo_tributario)
 *    - embalagem: re-derivada da descrição preferindo o padrão quantidade×conteúdo (\d+X\d+(?:\.\d+)?(?:L|KG|ML|G|SC|DOSES))
 *      e em sua ausência número+unidade próximo ao fim (\d+(?:\.\d+)?(?:L|KG|ML|G|SC|DOSES)).
 *      Exemplo: "SYNPROLE 480 SC 1X20L (IMP) SS" -> "1X20L" (em vez de "480SC")
 *    - unidade: derivada por tipo de produto e embalagem (líquidos em L/ML -> "L"; sólidos/granulados KG/G -> "KG";
 *      fertilizantes granulados/sólidos -> "KG"; manter SC/UN/DOSES quando coerente).
 *      Exemplo: "FFALM 10 15 15 - MOSAIC (AGENCIADO)" (granulado) -> "KG" (em vez de "L")
 *    - preco_base_sugerido: investigação e mapeamento a partir de dados_extras (B1_PRV1, b1_prv1, preco, valor, etc.).
 *      Se nenhuma coluna de preço válida estiver presente em dados_extras, permanece 0.
 *
 * Idempotente: seguro para ser executado múltiplas vezes e em bancos vazios.
 */

migrate(
  (app) => {
    if (!app.hasTable('sim_produtos_base')) {
      return
    }

    // 1. Adicionar o campo gr_trib se não existir
    const col = app.findCollectionByNameOrId('sim_produtos_base')
    let salvouSchema = false

    if (!col.fields.getByName('gr_trib')) {
      col.fields.add(
        new TextField({
          name: 'gr_trib',
          required: false,
        }),
      )
      salvouSchema = true
    }

    if (salvouSchema) {
      app.save(col)
      console.log(
        "[Migration 1740000044] Campo 'gr_trib' adicionado com sucesso a 'sim_produtos_base'.",
      )
    }

    // Funções canônicas de extração e normalização
    function extrairEmbalagemRefinada(texto) {
      if (!texto) return ''
      const s = String(texto).trim()

      // 1. Preferência absoluta para quantidade × conteúdo: \d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(?:L|LT|KG|G|ML|SC|DOSES)
      const mMult = s.match(/\b(\d+)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(L|LT|KG|G|ML|SC|DOSES)\b/i)
      if (mMult) {
        let un = mMult[3].toUpperCase()
        if (un === 'LT') un = 'L'
        return `${mMult[1]}X${mMult[2]}${un}`
      }

      // 2. Em sua ausência: número + unidade mais próximo ao fim da string
      const regexFim = /\b(\d+(?:[.,]\d+)?)\s*(L|LT|KG|G|ML|SC|DOSES)\b/gi
      let match
      let lastMatch = null
      while ((match = regexFim.exec(s)) !== null) {
        lastMatch = match
      }

      if (lastMatch) {
        let un = lastMatch[2].toUpperCase()
        if (un === 'LT') un = 'L'
        return `${lastMatch[1]}${un}`
      }

      return ''
    }

    function normalizarUnidadeRefinada(b1Um, emb, desc, bmDesc, b1Grupo) {
      const embUp = String(emb || '').toUpperCase()
      const dUp =
        `${String(desc || '')} ${String(bmDesc || '')} ${String(b1Grupo || '')}`.toUpperCase()
      const uUp = String(b1Um || '')
        .trim()
        .toUpperCase()

      // 1. Se a embalagem claramente aponta para líquido
      const embIsLiquido =
        /\b\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(L|LT|ML)\b/i.test(embUp) ||
        /\b\d+(?:[.,]\d+)?\s*(L|LT|ML)\b/i.test(embUp) ||
        embUp.endsWith('L') ||
        embUp.endsWith('LT') ||
        embUp.endsWith('ML')

      // 2. Se a embalagem claramente aponta para sólidos/granulados
      const embIsSolido =
        /\b\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(KG|G|TON|T)\b/i.test(embUp) ||
        /\b\d+(?:[.,]\d+)?\s*(KG|G|TON|T)\b/i.test(embUp) ||
        embUp.endsWith('KG') ||
        embUp.endsWith('G')

      if (embIsLiquido) {
        return 'L'
      }
      if (embIsSolido) {
        return 'KG'
      }

      // 3. Sólidos por descrição/grupo (ex: fertilizantes granulados, pó solúvel, grânulos)
      if (
        dUp.includes('GRANULADO') ||
        dUp.includes('GRANULADOS') ||
        dUp.includes('FARELO') ||
        dUp.includes('PO SOLUVEL') ||
        dUp.includes('PÓ SOLÚVEL') ||
        dUp.includes('SÓLIDO') ||
        dUp.includes('SOLIDO') ||
        dUp.includes('CALCARIO') ||
        dUp.includes('GESSO')
      ) {
        if (['SC', 'SACAS', 'SACO'].includes(uUp)) return 'SC'
        return 'KG'
      }

      // 4. Se informada unidade de ERP coerente
      if (uUp) {
        if (['L', 'LT', 'LITROS', 'ML'].includes(uUp)) return 'L'
        if (['KG', 'KILOS', 'QUILOS', 'TON', 'T', 'G'].includes(uUp)) return 'KG'
        if (['SC', 'SACO', 'SACAS'].includes(uUp)) return 'SC'
        if (['DOSES', 'DOSE'].includes(uUp)) return 'DOSES'
        if (['UN', 'FRASCO', 'BOMBONA', 'TAMBOR', 'LATA'].includes(uUp)) return 'UN'
      }

      // 5. Verificação da descrição por termos de formulação líquida vs pó
      if (
        /\b(SC|SL|EC|EW|FS|OD|CS|SE)\b/.test(dUp) ||
        dUp.includes('OLEO') ||
        dUp.includes('ÓLEO') ||
        dUp.includes('LIQUIDO') ||
        dUp.includes('LÍQUIDO')
      ) {
        return 'L'
      }
      if (/\b(WG|WP|GR|DP|SP)\b/.test(dUp)) {
        return 'KG'
      }

      return 'L'
    }

    // 2. Percorrer os registros para aplicar backfill
    let offset = 0
    const limit = 500
    let hasMore = true
    let totalProcessados = 0
    let totalGrTribAtualizados = 0
    let totalEmbalagemAtualizados = 0
    let totalUnidadeAtualizados = 0
    let totalPrecoAtualizados = 0

    // Amostragem para investigação de preços
    let chavesExtrasEncontradas = {}
    let camposComPrecoDetectados = 0

    while (hasMore) {
      const records = app.findRecordsByFilter('sim_produtos_base', '', 'id', limit, offset) || []
      if (records.length === 0) {
        hasMore = false
        break
      }

      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        totalProcessados++

        const rawExtras = record.getString('dados_extras')
        let extras = null
        if (rawExtras) {
          try {
            extras = JSON.parse(rawExtras)
          } catch (_) {
            extras = null
          }
        }
        extras = extras && typeof extras === 'object' ? extras : {}

        // Mapear chaves presentes para auditoria
        for (const k in extras) {
          chavesExtrasEncontradas[k] = (chavesExtrasEncontradas[k] || 0) + 1
        }

        let modificado = false

        // 1. Campo gr_trib (B1_GRTRIB2)
        const grTribVal = String(
          extras.B1_GRTRIB2 ||
            extras.b1_grtrib2 ||
            extras.GRTRIB2 ||
            extras.grtrib2 ||
            extras.GRTRIB ||
            extras.grtrib ||
            extras.gr_trib ||
            extras.grupo_tributario ||
            '',
        ).trim()

        const grTribAtual = record.getString('gr_trib')
        if (grTribVal && grTribAtual !== grTribVal) {
          record.set('gr_trib', grTribVal)
          modificado = true
          totalGrTribAtualizados++
        }

        // 2. Embalagem refinada
        const descTexto = String(
          extras.B1_DESC || extras.b1_desc || record.getString('descricao') || '',
        ).trim()
        const embNova = extrairEmbalagemRefinada(descTexto)
        const embAtual = record.getString('embalagem')
        if (embNova && embAtual !== embNova) {
          record.set('embalagem', embNova)
          modificado = true
          totalEmbalagemAtualizados++
        }

        // 3. Unidade refinada
        const b1Um = String(extras.B1_UM || extras.b1_um || '').trim()
        const bmDesc = String(extras.BM_DESC || extras.bm_desc || '').trim()
        const b1Grupo = String(extras.B1_GRUPO || extras.b1_grupo || '').trim()
        const unidNova = normalizarUnidadeRefinada(
          b1Um,
          embNova || embAtual,
          descTexto,
          bmDesc,
          b1Grupo,
        )
        const unidAtual = record.getString('unidade')
        if (unidNova && unidAtual !== unidNova) {
          record.set('unidade', unidNova)
          modificado = true
          totalUnidadeAtualizados++
        }

        // 4. Investigação e preenchimento de preco_base_sugerido
        const precoCandidato =
          extras.B1_PRV1 !== undefined
            ? extras.B1_PRV1
            : extras.b1_prv1 !== undefined
              ? extras.b1_prv1
              : extras.PRV1 !== undefined
                ? extras.PRV1
                : extras.prv1 !== undefined
                  ? extras.prv1
                  : extras.PRECO !== undefined
                    ? extras.PRECO
                    : extras.preco !== undefined
                      ? extras.preco
                      : extras.VALOR !== undefined
                        ? extras.VALOR
                        : extras.valor !== undefined
                          ? extras.valor
                          : undefined

        if (precoCandidato !== undefined && precoCandidato !== null && precoCandidato !== '') {
          const num =
            typeof precoCandidato === 'number'
              ? precoCandidato
              : parseFloat(String(precoCandidato).replace(',', '.'))
          if (!isNaN(num) && num > 0) {
            camposComPrecoDetectados++
            if (record.getFloat('preco_base_sugerido') !== num) {
              record.set('preco_base_sugerido', num)
              modificado = true
              totalPrecoAtualizados++
            }
          }
        }

        if (modificado) {
          app.save(record)
        }
      }

      offset += limit
      if (records.length < limit) {
        hasMore = false
      }
    }

    console.log(
      `[Migration 1740000044] Concluída. Registros inspecionados: ${totalProcessados}. ` +
        `gr_trib atualizados: ${totalGrTribAtualizados}. ` +
        `embalagem corrigidos: ${totalEmbalagemAtualizados}. ` +
        `unidade corrigidos: ${totalUnidadeAtualizados}. ` +
        `precos com valor preenchido: ${totalPrecoAtualizados}.`,
    )
    console.log(
      `[Migration 1740000044] Investigação de preço: campos com valor numérico positivo identificados em dados_extras: ${camposComPrecoDetectados}.`,
    )
    console.log(
      `[Migration 1740000044] Chaves existentes em dados_extras: ${JSON.stringify(Object.keys(chavesExtrasEncontradas))}`,
    )
  },
  (app) => {
    // Reversão
    try {
      const col = app.findCollectionByNameOrId('sim_produtos_base')
      const campo = col.fields.getByName('gr_trib')
      if (campo) {
        col.fields.remove(campo)
        app.save(col)
      }
    } catch (_) {}
  },
)
