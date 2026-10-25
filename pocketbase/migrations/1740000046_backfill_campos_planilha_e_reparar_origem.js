/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000046:
 * Backfill e reparo idempotente da coleção 'sim_produtos_base':
 *
 * 1. Preenchimento a partir de dados_extras (quando os campos novos estiverem vazios / não editados):
 *    - grupo_codigo: B1_GRUPO (ou B1_GRUPO_ORIGINAL, b1_grupo, grupo_codigo)
 *    - grupo_descricao: BM_DESC (ou BM_DESC_ORIGINAL, bm_desc, grupo_descricao)
 *    - descricao_grupo_tributario: "DESCRIÇÃO GRUPO TRIBUTARIO" (ou variantes sem acento / aliases)
 *    - segmento: "SEGMENTO" (ou segmento)
 *    - comissao_padrao: "COMISSAO_PADRAO" (ou comissao_padrao, comissao) parseado para número
 *
 * 2. Sanear a contaminação do campo 'origem' e 'moeda':
 *    - Se origem !== 'Nacional' && origem !== 'Importado' (ex: "DEFENSIVO - ORIGEM 0,4,5,6,7 (NCM 3808)",
 *      "FERTILIZANTE - ORIGEM 0,4,5,6,7 (NCM 31)", "PRODUTOS TRIBUTADOS (SEM BENEFICIO FISCAL)", etc.):
 *      * Recalcular procedência pelas regras existentes:
 *        se sufixo (IMP)/(SS) ou termo IMP na descrição / embalagem, ou X5_TABELA contendo IMP/ESTRANGEIR -> 'Importado'
 *        caso contrário -> 'Nacional'
 *      * Ajustar 'moeda': Importado -> 'USD', Nacional -> 'BRL' apenas quando a origem estiver sendo reparada.
 *    - Se descricao_grupo_tributario estiver vazio e a origem contaminada contiver a descrição do grupo fiscal
 *      (ex: "DEFENSIVO - ORIGEM 0,4,5,6,7 (NCM 3808)"), aproveitar para preencher descricao_grupo_tributario
 *      se nenhuma outra fonte forneceu.
 *
 * REGRA INEGOCIÁVEL: lê APENAS dados_extras já gravados no banco. Nenhuma linha de dado de planilha embutida.
 * Idempotente: seguro para ser executado múltiplas vezes e em bancos vazios.
 */

migrate(
  (app) => {
    if (!app.hasTable('sim_produtos_base')) {
      return
    }

    function extrairOrigemLegitima(desc, emb, x5) {
      if (x5) {
        const x5Up = String(x5).toUpperCase()
        // Cuidado: não confundir X5 descritivo de imposto com procedural se contiver NAC/IMP
        if (x5Up.includes('ESTRANGEIR') || /\bIMP\b/.test(x5Up) || x5Up.startsWith('IMP')) {
          return 'Importado'
        }
        if (/\bNAC\b/.test(x5Up) || x5Up.startsWith('NAC')) {
          return 'Nacional'
        }
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

    let offset = 0
    const limit = 500
    let hasMore = true
    let totalProcessados = 0
    let totalCamposNovosAtualizados = 0
    let totalOrigemReparada = 0

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

        let modificado = false

        // 1. grupo_codigo (B1_GRUPO)
        const grupoCodigoAtual = record.getString('grupo_codigo')
        if (!grupoCodigoAtual) {
          const val = String(
            extras.B1_GRUPO ||
              extras.b1_grupo ||
              extras.B1_GRUPO_ORIGINAL ||
              extras.grupo_codigo ||
              '',
          ).trim()
          if (val) {
            record.set('grupo_codigo', val)
            modificado = true
            totalCamposNovosAtualizados++
          }
        }

        // 2. grupo_descricao (BM_DESC)
        const grupoDescAtual = record.getString('grupo_descricao')
        if (!grupoDescAtual) {
          const val = String(
            extras.BM_DESC ||
              extras.bm_desc ||
              extras.BM_DESC_ORIGINAL ||
              extras.grupo_descricao ||
              '',
          ).trim()
          if (val) {
            record.set('grupo_descricao', val)
            modificado = true
            totalCamposNovosAtualizados++
          }
        }

        // 3. descricao_grupo_tributario ("DESCRIÇÃO GRUPO TRIBUTARIO")
        const descGrTribAtual = record.getString('descricao_grupo_tributario')
        let descGrTribVal = ''
        if (!descGrTribAtual) {
          descGrTribVal = String(
            extras['DESCRIÇÃO GRUPO TRIBUTARIO'] ||
              extras['DESCRICAO GRUPO TRIBUTARIO'] ||
              extras['DESCRIÇÃO DO GRUPO TRIBUTÁRIO'] ||
              extras.descricao_grupo_tributario ||
              extras.desc_grupo_tributario ||
              extras.desc_grtrib ||
              '',
          ).trim()

          // Fallback adicional: se não veio na chave exata mas X5_DESCRI traz a descrição fiscal
          if (!descGrTribVal) {
            const x5Descri = String(extras.X5_DESCRI || extras.x5_descri || '').trim()
            if (
              x5Descri &&
              (x5Descri.includes('(NCM') ||
                x5Descri.includes('TRIBUTADO') ||
                x5Descri.includes('ORIGEM'))
            ) {
              descGrTribVal = x5Descri
            }
          }

          if (descGrTribVal) {
            record.set('descricao_grupo_tributario', descGrTribVal)
            modificado = true
            totalCamposNovosAtualizados++
          }
        }

        // 4. segmento ("SEGMENTO")
        const segmentoAtual = record.getString('segmento')
        if (!segmentoAtual) {
          const val = String(extras.SEGMENTO || extras.segmento || '').trim()
          if (val) {
            record.set('segmento', val)
            modificado = true
            totalCamposNovosAtualizados++
          }
        }

        // 5. comissao_padrao ("COMISSAO_PADRAO")
        const comissaoAtual = record.getFloat('comissao_padrao')
        if (comissaoAtual === 0 || comissaoAtual === null || isNaN(comissaoAtual)) {
          const rawCom =
            extras.COMISSAO_PADRAO !== undefined
              ? extras.COMISSAO_PADRAO
              : extras.comissao_padrao !== undefined
                ? extras.comissao_padrao
                : extras.comissao
          if (rawCom !== undefined && rawCom !== null && rawCom !== '') {
            const num =
              typeof rawCom === 'number' ? rawCom : parseFloat(String(rawCom).replace(',', '.'))
            if (!isNaN(num)) {
              record.set('comissao_padrao', num)
              modificado = true
              totalCamposNovosAtualizados++
            }
          }
        }

        // 6. SANEAMENTO DE ORIGEM E MOEDA CONTAMINADAS
        const origemAtual = record.getString('origem').trim()
        const isOrigemValida = origemAtual === 'Nacional' || origemAtual === 'Importado'

        if (!isOrigemValida) {
          // Se a origem estava contaminada com um texto descritivo fiscal e descricao_grupo_tributario estava vazia
          if (!record.getString('descricao_grupo_tributario') && origemAtual) {
            record.set('descricao_grupo_tributario', origemAtual)
          }

          const desc = record.getString('descricao')
          const emb = record.getString('embalagem')
          const x5 = String(extras.X5_TABELA || extras.x5_tabela || '').trim()

          const origemReparada = extrairOrigemLegitima(desc, emb, x5)
          record.set('origem', origemReparada)

          // Corrigir moeda correspondente à origem sanada
          const moedaReparada = origemReparada === 'Importado' ? 'USD' : 'BRL'
          record.set('moeda', moedaReparada)

          modificado = true
          totalOrigemReparada++
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
      `[Migration 1740000046] Backfill concluído. Registros processados: ${totalProcessados}. ` +
        `Campos novos preenchidos: ${totalCamposNovosAtualizados}. ` +
        `Origens/moedas contaminadas reparadas: ${totalOrigemReparada}.`,
    )
  },
  () => {
    // Reversão de dados (não destrutiva)
  },
)
