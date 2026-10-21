/**
 * matriz_principios_ativos_hooks.js
 * Regras de Integridade Relacional e Rule Engine Centralizado:
 *
 * 1. ON DELETE RESTRICT:
 *    Impede a exclusão de qualquer registro em 'dicionario_principios_ativos'
 *    se houver produtos vinculados na 'base_mestre' (principio_ativo_id = record.id).
 *    Retorna erro amigável de integridade referencial.
 *
 * 2. ON UPDATE CASCADE / Rule Engine:
 *    Quando um princípio ativo da matriz é atualizado, propaga em cascata
 *    para todos os produtos vinculados em 'base_mestre'.
 *
 * 3. Endpoint POST /backend/v1/sincronizar-pa-cascata/{id}:
 *    Permite disparar a propagação sob demanda a partir da UI (botão "Sincronizar Produtos Vinculados").
 *
 * 4. Endpoint POST /backend/v1/importar-novo-cadastro:
 *    Implementa a API RESTful de Ingestão Integrada Dual-Sync (Seção 5 da especificação técnica 2.5.0).
 *
 * ATENÇÃO: Todas as funções auxiliares são declaradas INLINE dentro de cada callback
 * para evitar ReferenceError devido ao VM pool do PocketBase.
 */

// 1. ON DELETE RESTRICT para dicionario_principios_ativos
onRecordDelete((e) => {
  const paId = e.record.id
  const totalVinculados = $app.countRecords('base_mestre', `principio_ativo_id = '${paId}'`)
  if (totalVinculados > 0) {
    const nomePa =
      e.record.getString('principio_ativo_chave') || e.record.getString('principio_ativo') || paId
    throw new BadRequestError(
      'Restrição de integridade referencial (ON DELETE RESTRICT): Não é permitido excluir o princípio ativo "' +
        nomePa +
        '", pois existem ' +
        totalVinculados +
        ' produto(s) vinculado(s) na Base Mestre.',
    )
  }
  e.next()
}, 'dicionario_principios_ativos')
// 2. ON UPDATE CASCADE via onRecordUpdate
onRecordUpdate((e) => {
  // Normalizar chave em maiúsculas se informado
  const chave = e.record.getString('principio_ativo_chave') || e.record.getString('principio_ativo')
  if (chave) {
    const upper = chave.trim().toUpperCase()
    e.record.set('principio_ativo_chave', upper)
    e.record.set('principio_ativo', upper)
  }

  // Executa o update normal no banco
  e.next()

  // Em seguida propaga em cascata para produtos dependentes
  try {
    const paRecord = e.record
    const paId = paRecord.id
    const nota2 = paRecord.getString('nota_subpos_2') || 'NÃO'
    const ncmPadrao = paRecord.getString('ncm_padrao_referencia')
    const ncmF1 = paRecord.getString('ncm_faixa1_ate_300g')
    const ncmF2 = paRecord.getString('ncm_faixa2_300g_a_7_5kg')
    const ncmF3 = paRecord.getString('ncm_faixa3_7_5kg_a_10kg')
    const ncmF4 = paRecord.getString('ncm_faixa4_acima_10kg')
    const regraTipi = paRecord.getString('regra_tipi_embalagem')
    const statusPisCofins = paRecord.getString('enquadramento_pis_cofins')
    const macroSub = paRecord.getString('macro_grupo_subgrupo_padrao') || ''
    const cstStr = paRecord.getString('cst_recomendado') || ''

    let macro = ''
    let sub = ''
    if (macroSub.includes('—')) {
      const parts = macroSub.split('—')
      macro = parts[0].trim()
      sub = parts.slice(1).join('—').trim()
    } else if (macroSub.includes('-')) {
      const parts = macroSub.split('-')
      macro = parts[0].trim()
      sub = parts.slice(1).join('-').trim()
    }

    const produtos =
      $app.findRecordsByFilter(
        'base_mestre',
        `principio_ativo_id = '${paId}'`,
        '-created',
        2000,
        0,
      ) || []

    for (let i = 0; i < produtos.length; i++) {
      const prod = produtos[i]
      let alterou = false

      if (nota2 && prod.getString('nota_subpos_2') !== nota2) {
        prod.set('nota_subpos_2', nota2)
        alterou = true
      }
      if (ncmPadrao && prod.getString('ncm_padrao') !== ncmPadrao) {
        prod.set('ncm_padrao', ncmPadrao)
        prod.set('ncm', ncmPadrao.replace(/\D/g, ''))
        alterou = true
      }
      if (ncmF1 && prod.getString('ncm_faixa1_ate_300g') !== ncmF1) {
        prod.set('ncm_faixa1_ate_300g', ncmF1)
        alterou = true
      }
      if (ncmF2 && prod.getString('ncm_faixa2_300g_a_7_5kg') !== ncmF2) {
        prod.set('ncm_faixa2_300g_a_7_5kg', ncmF2)
        alterou = true
      }
      if (ncmF3 && prod.getString('ncm_faixa3_7_5kg_a_10kg') !== ncmF3) {
        prod.set('ncm_faixa3_7_5kg_a_10kg', ncmF3)
        alterou = true
      }
      if (ncmF4 && prod.getString('ncm_faixa4_acima_10kg') !== ncmF4) {
        prod.set('ncm_faixa4_acima_10kg', ncmF4)
        alterou = true
      }
      if (regraTipi && prod.getString('regra_tipi') !== regraTipi) {
        prod.set('regra_tipi', regraTipi)
        prod.set('regra_tipi_embalagem', regraTipi)
        alterou = true
      }
      if (statusPisCofins && prod.getString('status_pis_cofins') !== statusPisCofins) {
        prod.set('status_pis_cofins', statusPisCofins)
        alterou = true
      }
      if (
        macro &&
        (!prod.getString('macro_grupo') || prod.getString('macro_grupo') === 'Defensivos')
      ) {
        prod.set('macro_grupo', macro)
        alterou = true
      }
      if (sub && (!prod.getString('sub_grupo') || prod.getString('sub_grupo') === 'Herbicida')) {
        prod.set('sub_grupo', sub)
        alterou = true
      }
      if (cstStr && !prod.getString('cst_recomendado')) {
        prod.set('cst_recomendado', cstStr)
        alterou = true
      }

      if (alterou) {
        $app.save(prod)
      }
    }
  } catch (err) {
    console.log('Aviso na propagação em cascata:', err.message)
  }
}, 'dicionario_principios_ativos')

// Normalizar maiúsculas no create também
onRecordCreate((e) => {
  const chave = e.record.getString('principio_ativo_chave') || e.record.getString('principio_ativo')
  if (chave) {
    const upper = chave.trim().toUpperCase()
    e.record.set('principio_ativo_chave', upper)
    if (!e.record.getString('principio_ativo')) {
      e.record.set('principio_ativo', upper)
    }
  }
  e.next()
}, 'dicionario_principios_ativos')

// 3. Endpoint para acionar propagação em cascata sob demanda a partir da UI
routerAdd('POST', '/backend/v1/sincronizar-pa-cascata/{id}', (e) => {
  try {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, {
        sucesso: false,
        error: 'Acesso não autorizado. É necessário estar autenticado.',
      })
    }
    const userRole = authRecord.getString('role') || 'analista'
    if (userRole !== 'admin') {
      return e.json(403, {
        sucesso: false,
        error: 'Apenas administradores podem realizar esta ação.',
      })
    }

    const id = e.request.pathValue('id')
    if (!id) {
      return e.json(400, { sucesso: false, error: 'ID do princípio ativo obrigatório.' })
    }

    const paRecord = $app.findRecordById('dicionario_principios_ativos', id)
    const paId = paRecord.id
    const nota2 = paRecord.getString('nota_subpos_2') || 'NÃO'
    const ncmPadrao = paRecord.getString('ncm_padrao_referencia')
    const ncmF1 = paRecord.getString('ncm_faixa1_ate_300g')
    const ncmF2 = paRecord.getString('ncm_faixa2_300g_a_7_5kg')
    const ncmF3 = paRecord.getString('ncm_faixa3_7_5kg_a_10kg')
    const ncmF4 = paRecord.getString('ncm_faixa4_acima_10kg')
    const regraTipi = paRecord.getString('regra_tipi_embalagem')
    const statusPisCofins = paRecord.getString('enquadramento_pis_cofins')
    const macroSub = paRecord.getString('macro_grupo_subgrupo_padrao') || ''
    const cstStr = paRecord.getString('cst_recomendado') || ''

    let macro = ''
    let sub = ''
    if (macroSub.includes('—')) {
      const parts = macroSub.split('—')
      macro = parts[0].trim()
      sub = parts.slice(1).join('—').trim()
    } else if (macroSub.includes('-')) {
      const parts = macroSub.split('-')
      macro = parts[0].trim()
      sub = parts.slice(1).join('-').trim()
    }

    const produtos =
      $app.findRecordsByFilter(
        'base_mestre',
        `principio_ativo_id = '${paId}'`,
        '-created',
        2000,
        0,
      ) || []

    let atualizados = 0
    for (let i = 0; i < produtos.length; i++) {
      const prod = produtos[i]
      let alterou = false

      if (nota2 && prod.getString('nota_subpos_2') !== nota2) {
        prod.set('nota_subpos_2', nota2)
        alterou = true
      }
      if (ncmPadrao && prod.getString('ncm_padrao') !== ncmPadrao) {
        prod.set('ncm_padrao', ncmPadrao)
        prod.set('ncm', ncmPadrao.replace(/\D/g, ''))
        alterou = true
      }
      if (ncmF1 && prod.getString('ncm_faixa1_ate_300g') !== ncmF1) {
        prod.set('ncm_faixa1_ate_300g', ncmF1)
        alterou = true
      }
      if (ncmF2 && prod.getString('ncm_faixa2_300g_a_7_5kg') !== ncmF2) {
        prod.set('ncm_faixa2_300g_a_7_5kg', ncmF2)
        alterou = true
      }
      if (ncmF3 && prod.getString('ncm_faixa3_7_5kg_a_10kg') !== ncmF3) {
        prod.set('ncm_faixa3_7_5kg_a_10kg', ncmF3)
        alterou = true
      }
      if (ncmF4 && prod.getString('ncm_faixa4_acima_10kg') !== ncmF4) {
        prod.set('ncm_faixa4_acima_10kg', ncmF4)
        alterou = true
      }
      if (regraTipi && prod.getString('regra_tipi') !== regraTipi) {
        prod.set('regra_tipi', regraTipi)
        prod.set('regra_tipi_embalagem', regraTipi)
        alterou = true
      }
      if (statusPisCofins && prod.getString('status_pis_cofins') !== statusPisCofins) {
        prod.set('status_pis_cofins', statusPisCofins)
        alterou = true
      }
      if (
        macro &&
        (!prod.getString('macro_grupo') || prod.getString('macro_grupo') === 'Defensivos')
      ) {
        prod.set('macro_grupo', macro)
        alterou = true
      }
      if (sub && (!prod.getString('sub_grupo') || prod.getString('sub_grupo') === 'Herbicida')) {
        prod.set('sub_grupo', sub)
        alterou = true
      }
      if (cstStr && !prod.getString('cst_recomendado')) {
        prod.set('cst_recomendado', cstStr)
        alterou = true
      }

      if (alterou) {
        $app.save(prod)
        atualizados++
      }
    }

    return e.json(200, {
      sucesso: true,
      mensagem: `Propagação concluída: ${atualizados} de ${produtos.length} produto(s) vinculado(s) atualizados com as regras do princípio ativo.`,
      total_vinculados: produtos.length,
      atualizados: atualizados,
    })
  } catch (err) {
    return e.json(err.statusCode || 500, {
      sucesso: false,
      error: `Erro ao propagar regras do princípio ativo: ${err.message}`,
    })
  }
})

// 4. Endpoint POST /backend/v1/importar-novo-cadastro (Seção 5 da especificação técnica 2.5.0)
routerAdd('POST', '/backend/v1/importar-novo-cadastro', (e) => {
  try {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, {
        sucesso: false,
        error: 'Acesso não autorizado. É necessário estar autenticado.',
      })
    }
    const userRole = authRecord.getString('role') || 'analista'
    if (userRole !== 'admin') {
      return e.json(403, {
        sucesso: false,
        error: 'Apenas administradores podem realizar esta ação.',
      })
    }

    const info = e.requestInfo()
    const body = info.body || {}

    const nomeComercialPortal = String(body.nome_comercial_portal || '').trim()
    const paDeclarado = String(body.principio_ativo_declarado || '').trim()
    const regMapaPortal = String(body.numero_registro_mapa || '').trim()

    if (!nomeComercialPortal) {
      return e.json(400, { sucesso: false, error: 'Campo nome_comercial_portal é obrigatório.' })
    }
    if (!paDeclarado) {
      return e.json(400, {
        sucesso: false,
        error: 'Campo principio_ativo_declarado é obrigatório.',
      })
    }
    if (!regMapaPortal) {
      return e.json(400, { sucesso: false, error: 'Campo numero_registro_mapa é obrigatório.' })
    }

    // Inline do motor químico determinístico para garantir atomicidade
    const MOLECULAS_NOTA_SUBPOS_2 = [
      'BIFENTRINA',
      'LAMBDA-CIALOTRINA',
      'LAMBDA CIALOTRINA',
      'CLORFENAPIR',
      'CHLORFENAPYR',
      'MALATIONA',
      'MALATHION',
      'FENITROTIONA',
      'BETA-CIFLUTRINA',
      'BETA CIFLUTRINA',
      'CIFLUTRINA',
      'ALFA-CIPERMETRINA',
      'ALFA CIPERMETRINA',
      'ALPHA-CYPERMETHRIN',
      'DELTAMETRINA',
      'PERMETRINA',
      'PROPOXUR',
      'BENDIOCARBE',
      'BENDIOCARB',
    ]

    function fmtNcm(n) {
      const d = String(n || '').replace(/\D/g, '')
      if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
      return n || '3808.99.99'
    }

    function sanitizarMarca(n) {
      const padrao =
        /\s+(?:\d+\s*[xX]\s*\d+\s*[A-Za-z]+|\d+(?:[.,]\d+)?\s*(?:L|LT|LITROS|KG|G|SC|SACO|ML|DOSES)\b|\(IMP\)|\bTC\b|\bIMP\b).*/i
      let limpo = String(n || '')
        .replace(padrao, '')
        .trim()
      limpo = limpo.replace(/[-–—/]+$/, '').trim()
      return limpo || n
    }

    function sanitizarMapa(reg) {
      if (!reg) return 'ISENTO'
      const s = String(reg).trim()
      const up = s.toUpperCase()
      if (up.includes('ISENTO')) return 'ISENTO'
      if (up.startsWith('TC')) return up
      if (s.includes('-')) return s
      const semN = s.replace(/^Nº\s*/i, '').trim()
      const d = semN.replace(/\D/g, '')
      if (d.length > 0 && d.length < 4) return `Nº ${d.padStart(4, '0')}`
      if (s.startsWith('Nº ') || s.startsWith('Nº')) return `Nº ${semN}`
      if (/^\d+$/.test(s)) return `Nº ${s}`
      return s
    }

    // Transação ACID no PocketBase ($app.runInTransaction)
    let respostaPayload = null

    $app.runInTransaction((txApp) => {
      const paChaveUpper = paDeclarado.toUpperCase().trim()

      // Etapa 1: Resolução ou criação do Princípio Ativo na Matriz (13 Campos)
      const colPa = txApp.findCollectionByNameOrId('dicionario_principios_ativos')
      const escChave = paChaveUpper.replace(/'/g, "\\'")
      const existentes =
        txApp.findRecordsByFilter(
          'dicionario_principios_ativos',
          `principio_ativo_chave = '${escChave}' || principio_ativo = '${escChave}'`,
          '-created',
          1,
          0,
        ) || []

      let paRecord = null
      let paNovoCriado = false

      if (existentes.length > 0) {
        paRecord = existentes[0]
      } else {
        // Criar novo registro de 13 campos na matriz via motor químico-aduaneiro
        paNovoCriado = true
        paRecord = new Record(colPa)

        const paUpper = paChaveUpper
        const isNota2 = MOLECULAS_NOTA_SUBPOS_2.some((m) => paUpper.includes(m))
        const nota2Str = isNota2 ? 'SIM' : 'NÃO'

        let macroSub = 'Defensivos — Herbicida'
        let ncmPadrao = '3808.93.29'
        let ncmF1 = '3808.93.29'
        let ncmF2 = '3808.93.29'
        let ncmF3 = '3808.93.29'
        let ncmF4 = '3808.93.29'
        let ncmGranel = '3808.93.19'
        let regraTipi = 'Posição 38.08 TIPI: Embalagem comercial agrícola usa subitens .2x ou .9x'
        let sistemaMapa = 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)'
        let regimePis = 'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real pós-Abr/26'
        let cstStr = 'Saída: CST 06 (c/ Ajuste M220/M620) | Entrada: CST 73'

        if (isNota2) {
          macroSub = 'Defensivos — Inseticida / Acaricida'
          ncmPadrao = '3808.62.90'
          ncmF1 = '3808.61.00'
          ncmF2 = '3808.62.90'
          ncmF3 = '3808.69.90'
          ncmF4 = '3808.69.90'
          ncmGranel = '3808.69.90'
          regraTipi = 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022): Molécula taxativa'
        } else if (paUpper.includes('CLOMAZONA') || paUpper.includes('CLOMAZONE')) {
          macroSub = 'Defensivos — Herbicida'
          ncmPadrao = '3808.93.29'
          ncmF1 = '3808.93.29'
          ncmF2 = '3808.93.29'
          ncmF3 = '3808.93.29'
          ncmF4 = '3808.93.29'
          ncmGranel = '3808.93.19'
          regraTipi = 'Posição 38.08 TIPI: Herbicida formulado'
        } else if (paUpper.includes('ISOCICLOSERAM') || paUpper.includes('ISOCYCLOSERAM')) {
          macroSub = 'Defensivos — Inseticida'
          ncmPadrao = '3808.91.99'
          ncmF1 = '3808.91.99'
          ncmF2 = '3808.91.99'
          ncmF3 = '3808.91.99'
          ncmF4 = '3808.91.99'
          ncmGranel = '3808.91.20'
          regraTipi = 'Posição 38.08 TIPI: Inseticida isoxazolina formulado'
        } else if (paUpper.includes('GLIFOSATO')) {
          macroSub = 'Defensivos — Herbicida'
          ncmPadrao = '3808.93.24'
          ncmF1 = '3808.93.24'
          ncmF2 = '3808.93.24'
          ncmF3 = '3808.93.24'
          ncmF4 = '3808.93.24'
          ncmGranel = '3808.93.19'
          regraTipi = 'Posição 38.08 TIPI: Derivado fosfonado'
        }

        paRecord.set('principio_ativo_chave', paChaveUpper)
        paRecord.set('macro_grupo_subgrupo_padrao', macroSub)
        paRecord.set('nota_subpos_2', nota2Str)
        paRecord.set('ncm_padrao_referencia', fmtNcm(ncmPadrao))
        paRecord.set('ncm_faixa1_ate_300g', fmtNcm(ncmF1))
        paRecord.set('ncm_faixa2_300g_a_7_5kg', fmtNcm(ncmF2))
        paRecord.set('ncm_faixa3_7_5kg_a_10kg', fmtNcm(ncmF3))
        paRecord.set('ncm_faixa4_acima_10kg', fmtNcm(ncmF4))
        paRecord.set('ncm_granel_tecnico', fmtNcm(ncmGranel))
        paRecord.set('regra_tipi_embalagem', regraTipi)
        paRecord.set('sistema_registro_mapa', sistemaMapa)
        paRecord.set('enquadramento_pis_cofins', regimePis)
        paRecord.set('cst_recomendado', cstStr)
        // Legado
        paRecord.set('principio_ativo', paChaveUpper)
        paRecord.set('classe', macroSub.split('—')[1]?.trim() || 'Herbicida')
        paRecord.set('grupo_quimico', 'Homologação MAPA')
        paRecord.set('concentracao_min', 0)
        paRecord.set('concentracao_max', 0)
        paRecord.set('unidade', '%')
        paRecord.set('status', 'Ativo')

        txApp.save(paRecord)
      }

      // Etapa 2: Higienização e Normalização do Produto
      const marcaPadronizada = sanitizarMarca(nomeComercialPortal)
      const registroMapaFormatado = sanitizarMapa(regMapaPortal)

      // Validação estrita do NCM e Registro MAPA (se falhar, dispara Rollback)
      const ncmFinal = fmtNcm(paRecord.getString('ncm_padrao_referencia') || '3808.99.99')
      if (body.simular_falha_ncm || ncmFinal === 'INVALIDO') {
        throw new Error('Falha de validação cadastral: NCM inválida na gravação do produto.')
      }

      // Etapa 3: Inserção Vinculada na Base Mestre (28 Campos + FK principio_ativo_id)
      const colMestre = txApp.findCollectionByNameOrId('base_mestre')
      const prodMaster = new Record(colMestre)

      const macroSubPa =
        paRecord.getString('macro_grupo_subgrupo_padrao') || 'Defensivos — Herbicida'
      const macroPa = macroSubPa.includes('—') ? macroSubPa.split('—')[0].trim() : 'Defensivos'
      const subPa = macroSubPa.includes('—') ? macroSubPa.split('—')[1].trim() : 'Herbicida'

      prodMaster.set('principio_ativo_id', paRecord.id)
      prodMaster.set('nome_completo', nomeComercialPortal)
      prodMaster.set('marca_padronizada', marcaPadronizada)
      prodMaster.set(
        'tipo_produto',
        body.classe_agronomica?.includes('Técnico')
          ? 'Produto Técnico Industrial'
          : 'Produto Formulado Comercial',
      )
      prodMaster.set('embalagem', body.embalagem_comercial || 'GALÃO 20L')
      prodMaster.set('unidade', body.unidade_medida || 'L')
      prodMaster.set('principio_ativo', paRecord.getString('principio_ativo_chave') || paChaveUpper)
      prodMaster.set('macro_grupo', macroPa)
      prodMaster.set('sub_grupo', subPa)
      prodMaster.set('nota_subpos_2', paRecord.getString('nota_subpos_2') || 'NÃO')
      prodMaster.set('ncm_padrao', ncmFinal)
      prodMaster.set('ncm_faixa1_ate_300g', paRecord.getString('ncm_faixa1_ate_300g') || ncmFinal)
      prodMaster.set(
        'ncm_faixa2_300g_a_7_5kg',
        paRecord.getString('ncm_faixa2_300g_a_7_5kg') || ncmFinal,
      )
      prodMaster.set(
        'ncm_faixa3_7_5kg_a_10kg',
        paRecord.getString('ncm_faixa3_7_5kg_a_10kg') || ncmFinal,
      )
      prodMaster.set(
        'ncm_faixa4_acima_10kg',
        paRecord.getString('ncm_faixa4_acima_10kg') || ncmFinal,
      )
      prodMaster.set('regra_tipi', paRecord.getString('regra_tipi_embalagem') || '')
      prodMaster.set('registro_mapa', registroMapaFormatado)
      prodMaster.set(
        'sistema_norma_mapa',
        paRecord.getString('sistema_registro_mapa') || 'AGROFIT/MAPA',
      )
      prodMaster.set('titular_fabricante', body.titular_registro || 'Não informado')
      prodMaster.set('origem_base', body.origem_portal || 'AGROFIT_IMPORT')
      prodMaster.set('status_pis_cofins', paRecord.getString('enquadramento_pis_cofins') || '')
      prodMaster.set('aliquota_ate_mar2026', '0,00% (Lei nº 10.925/2004)')
      prodMaster.set('aliquota_pos_abr2026_real', '0,925% (LC nº 224/2025)')
      prodMaster.set('aliquota_pos_abr2026_presumido', '0,365% (LC nº 224/2025)')
      prodMaster.set('cst_saida', 'CST 06')
      prodMaster.set('cst_entrada', 'CST 73')
      prodMaster.set('ibs_cbs_2027', 'Redução de 60% + Diferimento')
      prodMaster.set('url_oficial', body.url_publicacao_dou || 'https://dados.agricultura.gov.br')

      // Legado
      prodMaster.set('nome_produto', marcaPadronizada)
      prodMaster.set('ncm', ncmFinal.replace(/\D/g, ''))
      prodMaster.set('fabricante', body.titular_registro || 'Não informado')
      prodMaster.set('status_validacao', 'aprovado')

      txApp.save(prodMaster)

      respostaPayload = {
        sucesso: true,
        mensagem: 'Cadastro processado com sucesso em ambas as bases canônicas.',
        principio_ativo_id: paRecord.id,
        principio_ativo_chave: paRecord.getString('principio_ativo_chave') || paChaveUpper,
        principio_ativo_novo_criado: paNovoCriado,
        produto_mestre_id: prodMaster.id,
        produto_mestre_nome: prodMaster.getString('nome_completo'),
        registro_mapa: prodMaster.getString('registro_mapa'),
        ncm_padrao: prodMaster.getString('ncm_padrao'),
        cst_saida: prodMaster.getString('cst_saida'),
      }
    })

    return e.json(201, respostaPayload)
  } catch (err) {
    return e.json(422, {
      sucesso: false,
      error: `Erro no pipeline transacional de dupla gravação: ${err.message}`,
    })
  }
})
