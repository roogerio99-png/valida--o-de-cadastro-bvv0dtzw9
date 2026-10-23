/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000030: Correção canônica de ncm_especifica indevidamente definida como 3808.93.24
 *
 * A NCM 3808.93.24 aplica-se EXCLUSIVAMENTE ao ROUNDUP WG / Glifosato formulado (MAPA 002094).
 * Registros de fertilizantes, produtos técnicos e outros defensivos tiveram 3808.93.24
 * atribuído incorretamente pela migration 1740000029 ou fallbacks.
 *
 * Esta migração recalcula e restaura idempotentemente a ncm_especifica correta para cada registro
 * de base_mestre que NÃO seja ROUNDUP WG / Glifosato formulado:
 * 1. Fertilizantes (Capítulo 31 / 3105.xx / macro_grupo Fertilizantes):
 *    - Se quantidade <= 10 e unidade = 'KG' -> 3105.10.00
 *    - Caso contrário -> ncm_padrao (ex: 3105.90.90)
 * 2. Produtos sujeitos à Nota de Subposições 2 do Cap. 38 (nota_subpos_2 = 'SIM'):
 *    - Se quantidade <= 0.3 -> ncm_faixa1_ate_300g (3808.61.00)
 *    - Se quantidade <= 7.5 -> ncm_faixa2_300g_a_7_5kg (3808.62.90)
 *    - Caso contrário -> ncm_faixa4_acima_10kg ou ncm_faixa3_7_5kg_a_10kg ou ncm_padrao (3808.69.90)
 * 3. Demais defensivos / produtos:
 *    - ncm_especifica = ncm_padrao (ou ncm formatada com máscara)
 * 4. Preserva estritamente ROUNDUP WG / MAPA 002094 com 3808.93.24 e 38089324.
 * 5. Garante alinhamento de regra_tipi e regra_tipi_embalagem para fertilizantes.
 */
migrate(
  (app) => {
    try {
      // 1. Localizar registros com ncm_especifica = '3808.93.24'
      // O PocketBase permite findRecordsByFilter com limite
      const records =
        app.findRecordsByFilter(
          'base_mestre',
          "ncm_especifica = '3808.93.24' || ncm_especifica = '38089324'",
          '-created',
          2000,
          0,
        ) || []

      for (let i = 0; i < records.length; i++) {
        const r = records[i]
        const regMapa = String(r.getString('registro_mapa') || '').trim()
        const marcaPad = String(r.getString('marca_padronizada') || '').toUpperCase()
        const nomeProd = String(r.getString('nome_completo') || '').toUpperCase()
        const pa = String(r.getString('principio_ativo') || '').toUpperCase()

        // Regra permanente do projeto: Preservar ROUNDUP WG (MAPA 002094 / Glifosato formulado comercial)
        const isRoundupWg =
          regMapa.includes('002094') ||
          marcaPad.includes('ROUNDUP WG') ||
          nomeProd.includes('ROUNDUP WG') ||
          (pa.includes('GLIFOSATO') && marcaPad.includes('ROUNDUP'))

        if (isRoundupWg) {
          // ROUNDUP WG DEVE PERMANECER com 3808.93.24 / 38089324
          r.set('ncm_especifica', '3808.93.24')
          r.set('ncm_padrao', '3808.93.24')
          r.set('ncm', '38089324')
          app.save(r)
          continue
        }

        // Para os produtos que NÃO são ROUNDUP WG, resolver a NCM específica correta
        const macroGrupo = String(r.getString('macro_grupo') || '').toUpperCase()
        const tipoProd = String(r.getString('tipo_produto') || '').toUpperCase()
        const isNota2 = r.getString('nota_subpos_2') === 'SIM'

        const ncmPadraoRaw = String(r.getString('ncm_padrao') || '').trim()
        const ncmRaw = String(r.getString('ncm') || '').trim()
        const ncmF1 = String(r.getString('ncm_faixa1_ate_300g') || '').trim()
        const ncmF2 = String(r.getString('ncm_faixa2_300g_a_7_5kg') || '').trim()
        const ncmF4 = String(r.getString('ncm_faixa4_acima_10kg') || '').trim()

        const qtd = r.getFloat('quantidade_embalagem_principal') || 20
        const un = String(r.getString('unidade_medida_principal') || 'L').toUpperCase()

        let ncmBase = ncmPadraoRaw || ncmRaw
        // Se a ncm_padrao também foi indevidamente gravada como 3808.93.24 em produto que tem faixas diferentes
        if (
          ncmBase.replace(/\D/g, '') === '38089324' &&
          ncmF4 &&
          ncmF4.replace(/\D/g, '') !== '38089324'
        ) {
          ncmBase = ncmF4
        }

        let ncmResolvida = ncmBase

        // Caso A: Fertilizantes ou Posição 31.05 (Nota 1 Cap. 31 TIPI: até 10 kg bruta = 3105.10.00)
        const isFertilizante =
          macroGrupo.includes('FERTILIZANTE') ||
          tipoProd.includes('FERTILIZANTE') ||
          ncmBase.startsWith('3105') ||
          ncmF4.startsWith('3105')

        if (isFertilizante) {
          if (qtd <= 10 && un === 'KG') {
            ncmResolvida = ncmF1 || '3105.10.00'
          } else {
            ncmResolvida = ncmF4 || (ncmBase.startsWith('3105') ? ncmBase : '3105.90.90')
          }

          // Ajustar regra_tipi se estiver vazia ou com texto de 38.08
          const regraTipiAtual = r.getString('regra_tipi')
          if (
            !regraTipiAtual ||
            regraTipiAtual.includes('38.08') ||
            regraTipiAtual.includes('Defensivos')
          ) {
            r.set(
              'regra_tipi',
              'Nota 1 Cap. 31 TIPI: Embalagens brutas até 10 kg classificam-se obrigatoriamente na posição 3105.10.00',
            )
          }
          const regraTipiEmb = r.getString('regra_tipi_embalagem')
          if (
            regraTipiEmb &&
            (regraTipiEmb.includes('38.08') || regraTipiEmb.includes('Defensivos'))
          ) {
            r.set(
              'regra_tipi_embalagem',
              'Nota 1 Cap. 31 TIPI: Embalagens brutas até 10 kg classificam-se obrigatoriamente na posição 3105.10.00',
            )
          }
        }
        // Caso B: Nota de Subposições 2 Cap. 38 (ex: Imidacloprid, Lambda-Cialotrina, etc.)
        else if (isNota2) {
          if (qtd <= 0.3) {
            ncmResolvida = ncmF1 || '3808.61.00'
          } else if (qtd <= 7.5) {
            ncmResolvida = ncmF2 || '3808.62.90'
          } else {
            ncmResolvida = ncmF4 || ncmBase || '3808.69.90'
          }
        }
        // Caso C: Demais defensivos / produtos
        else {
          ncmResolvida = ncmBase
        }

        // Formatar com máscara xx.xx.xx
        const ncmLimpa = String(ncmResolvida).replace(/\D/g, '')
        let ncmFormatada = ncmResolvida
        if (ncmLimpa.length === 8) {
          ncmFormatada = `${ncmLimpa.slice(0, 4)}.${ncmLimpa.slice(4, 6)}.${ncmLimpa.slice(6, 8)}`
        }

        r.set('ncm_especifica', ncmFormatada)

        // Se ncm_padrao estava contaminada com 3808.93.24, restaurar também
        if (
          String(r.getString('ncm_padrao')).replace(/\D/g, '') === '38089324' &&
          ncmLimpa !== '38089324'
        ) {
          r.set('ncm_padrao', ncmFormatada)
        }
        if (
          String(r.getString('ncm')).replace(/\D/g, '') === '38089324' &&
          ncmLimpa !== '38089324'
        ) {
          r.set('ncm', ncmLimpa)
        }

        app.save(r)
      }

      // 2. Query de segurança extra via SQL para garantir que qualquer fertilizante não tenha ficado com 3808.93.24
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET ncm_especifica = CASE
              WHEN (quantidade_embalagem_principal <= 10 AND unidade_medida_principal = 'KG')
                THEN COALESCE(NULLIF(ncm_faixa1_ate_300g, ''), '3105.10.00')
              ELSE COALESCE(NULLIF(ncm_faixa4_acima_10kg, ''), NULLIF(ncm_padrao, ''), '3105.90.90')
            END
        WHERE (macro_grupo LIKE '%Fertilizante%' OR tipo_produto LIKE '%Fertilizante%' OR ncm_padrao LIKE '3105%' OR ncm_faixa4_acima_10kg LIKE '3105%')
          AND ncm_especifica = '3808.93.24'
          AND registro_mapa NOT LIKE '%002094%'
          AND marca_padronizada NOT LIKE '%ROUNDUP%'
      `)
        .execute()

      // 3. Query de segurança para defensivos comuns em saco / tambor que foram indevidamente alterados pelo passo 4 da migration 29
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET ncm_especifica = COALESCE(NULLIF(ncm_padrao, ''), ncm_faixa4_acima_10kg)
        WHERE ncm_especifica = '3808.93.24'
          AND ncm_padrao != '3808.93.24'
          AND ncm_padrao != ''
          AND ncm_padrao IS NOT NULL
          AND registro_mapa NOT LIKE '%002094%'
          AND marca_padronizada NOT LIKE '%ROUNDUP%'
          AND nome_completo NOT LIKE '%ROUNDUP WG%'
          AND principio_ativo NOT LIKE '%GLIFOSATO%'
      `)
        .execute()

      // 4. Se a ncm estiver sincronizada com ncm_especifica
      app
        .db()
        .newQuery(`
        UPDATE base_mestre
        SET ncm = REPLACE(REPLACE(ncm_especifica, '.', ''), '-', '')
        WHERE ncm = '38089324'
          AND ncm_especifica != '3808.93.24'
          AND registro_mapa NOT LIKE '%002094%'
          AND marca_padronizada NOT LIKE '%ROUNDUP%'
      `)
        .execute()
    } catch (err) {
      console.log('Erro na migration 1740000030:', err.message || err)
    }
  },
  (app) => {},
)
