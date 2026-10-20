/**
 * POST /backend/v1/validar-produto
 * Executa as 6 travas de auditoria agropecuária no servidor PocketBase:
 * 1. NCM Obrigatório (8 dígitos, confere com regras_ncm_embalagem)
 * 2. Embalagem vs NCM (matriz de embalagens permitidas para o NCM)
 * 3. Princípio Ativo Obrigatório (dicionario_principios_ativos)
 * 4. Duplicidade (NCM + principio_ativo + fabricante em base_mestre)
 * 5. Concentração Válida (faixa concentracao_min / concentracao_max)
 * 6. Registro MAPA (formato/máscara: ex. 0012345/99 ou 00012-34 ou dígitos válidos)
 *
 * Registra o histórico de validações na collection 'log_validacoes'.
 */

routerAdd('POST', '/backend/v1/validar-produto', (e) => {
  const info = e.requestInfo()
  const data = info.body || {}

  const nomeProduto = String(data.nome_produto || '').trim()
  // Limpar NCM mantendo apenas números
  const ncmRaw = String(data.ncm || '').trim()
  const ncm = ncmRaw.replace(/\D/g, '')
  let embalagem = String(data.embalagem || '').trim()
  const quantidadeEmbalagem = String(
    data.quantidade_embalagem || data.qtd_embalagem_principal || '',
  ).trim()
  const unidadeEmbalagem = String(
    data.unidade_embalagem || data.unidade_embalagem_principal || '',
  ).trim()

  // Se a quantidade da embalagem foi informada separadamente e não consta na string de embalagem, compor
  let qtdFormatada = ''
  if (quantidadeEmbalagem) {
    const qtdUpper = quantidadeEmbalagem.toUpperCase().replace(/\s+/g, '')
    const unidUpper = unidadeEmbalagem.toUpperCase().replace(/\s+/g, '')
    // Se a quantidade já contém unidade (ex.: 5L, 25KG), usa direto
    if (/[A-Z]/.test(qtdUpper)) {
      qtdFormatada = qtdUpper
    } else if (unidUpper) {
      qtdFormatada = `${qtdUpper}${unidUpper}`
    } else {
      qtdFormatada = qtdUpper
    }
  }

  // Compor a embalagem principal se fornecida
  if (qtdFormatada) {
    if (!embalagem) {
      embalagem = qtdFormatada
    } else if (!embalagem.toUpperCase().includes(qtdFormatada)) {
      // Ex.: "Bombona 5L" ou "5L (Bombona)"
      embalagem = `${embalagem} ${qtdFormatada}`.trim()
    }
  }

  const principioAtivo = String(data.principio_ativo || '').trim()
  const fabricante = String(data.fabricante || '').trim()
  const registroMapa = String(data.registro_mapa || '').trim()
  const concentracao = Number(data.concentracao)

  const travas = []

  // -------------------------------------------------------------------------
  // TRAVA 1: NCM Obrigatório (8 dígitos e cadastrado na regra TIPI)
  // -------------------------------------------------------------------------
  let trava1Passou = false
  let trava1Msg = ''
  let regraNcmRecord = null

  if (!ncm) {
    trava1Msg = 'NCM não informado. Obrigatório 8 dígitos.'
  } else if (ncm.length !== 8) {
    trava1Msg = `NCM "${ncmRaw}" inválido. Deve conter exatamente 8 dígitos numéricos (informado: ${ncm.length}).`
  } else {
    try {
      const records = $app.findRecordsByFilter(
        'regras_ncm_embalagem',
        `ncm = '${ncm}'`,
        '-created',
        1,
        0,
      )
      if (records && records.length > 0) {
        regraNcmRecord = records[0]
        trava1Passou = true
        trava1Msg = `NCM ${ncm} válido e localizado na tabela TIPI (${regraNcmRecord.getString('descricao') || 'Sem descrição'}).`
      } else {
        trava1Msg = `NCM ${ncm} não cadastrado na tabela de Regras NCM × Embalagem (TIPI).`
      }
    } catch (err) {
      trava1Msg = `Erro ao consultar regras para o NCM ${ncm}: ${err.message}`
    }
  }

  travas.push({
    id_trava: 1,
    trava_nome: 'NCM Obrigatório',
    aprovado: trava1Passou,
    mensagem: trava1Msg,
  })

  // -------------------------------------------------------------------------
  // TRAVA 2: Embalagem vs NCM (matriz de embalagens permitidas)
  // -------------------------------------------------------------------------
  let trava2Passou = false
  let trava2Msg = ''

  if (!embalagem) {
    trava2Msg = 'Tipo de embalagem não informado.'
  } else if (!regraNcmRecord) {
    trava2Msg = 'Não foi possível validar embalagem pois o NCM não foi localizado nas regras.'
  } else {
    try {
      const rawJson = regraNcmRecord.getString('embalagens_permitidas')
      let permitidas = []
      if (rawJson) {
        try {
          const parsed = JSON.parse(rawJson)
          if (Array.isArray(parsed)) {
            permitidas = parsed
          } else if (typeof parsed === 'string') {
            permitidas = parsed.split(/[,;/|]/).map((s) => s.trim())
          }
        } catch (_) {
          permitidas = rawJson.split(/[,;/|]/).map((s) => s.trim())
        }
      }

      permitidas = permitidas.map((s) => String(s).trim()).filter(Boolean)

      if (!Array.isArray(permitidas) || permitidas.length === 0) {
        // Se a regra não lista restrições específicas, aceita com ressalva ou aprova
        trava2Passou = true
        trava2Msg = `Nenhuma restrição específica de embalagem cadastrada para o NCM ${ncm}. Embalagem "${embalagem}" aceita.`
      } else {
        // Normalização agressiva para bater embalagens como "4X5L", "5L", "Bombona", "Saco", "Bombona 5L"
        const cleanStr = (s) =>
          String(s || '')
            .toLowerCase()
            .replace(/[\s\-_]/g, '')

        const embNorm = cleanStr(embalagem)
        const qtdNorm = cleanStr(qtdFormatada)

        const match = permitidas.some((p) => {
          const pNorm = cleanStr(p)
          if (!pNorm) return false
          if (embNorm === pNorm) return true
          if (embNorm.includes(pNorm) || pNorm.includes(embNorm)) return true

          // Se a quantidade informada bater com a permitida (ex.: "5L" ou "10KG")
          if (
            qtdNorm &&
            (pNorm === qtdNorm || pNorm.includes(qtdNorm) || qtdNorm.includes(pNorm))
          ) {
            return true
          }

          // Se a embalagem contiver o volume unitário (ex.: 5L contido em 4X5L)
          const embOnlyNumberUnit = embNorm.replace(/[^0-9a-z]/g, '')
          const pOnlyNumberUnit = pNorm.replace(/[^0-9a-z]/g, '')
          if (embOnlyNumberUnit && pOnlyNumberUnit) {
            if (
              embOnlyNumberUnit.includes(pOnlyNumberUnit) ||
              pOnlyNumberUnit.includes(embOnlyNumberUnit)
            ) {
              return true
            }
          }
          return false
        })

        if (match) {
          trava2Passou = true
          trava2Msg = `Embalagem "${embalagem}" autorizada para o NCM ${ncm}. Permitidas: ${permitidas.slice(0, 6).join(', ')}${permitidas.length > 6 ? '...' : ''}.`
        } else {
          trava2Msg = `Embalagem "${embalagem}" NÃO autorizada para o NCM ${ncm}. Permitidas: ${permitidas.slice(0, 6).join(', ')}${permitidas.length > 6 ? '...' : ''}.`
        }
      }
    } catch (err) {
      trava2Msg = `Falha ao processar matriz de embalagens permitidas: ${err.message}`
    }
  }

  travas.push({
    id_trava: 2,
    trava_nome: 'Embalagem vs NCM',
    aprovado: trava2Passou,
    mensagem: trava2Msg,
  })

  // -------------------------------------------------------------------------
  // TRAVA 3: Princípio Ativo Obrigatório (dicionario_principios_ativos)
  // -------------------------------------------------------------------------
  let trava3Passou = false
  let trava3Msg = ''
  let principioRecord = null

  if (!principioAtivo) {
    trava3Msg = 'Princípio ativo não informado.'
  } else {
    try {
      const escaped = principioAtivo.replace(/'/g, "\\'")
      const records = $app.findRecordsByFilter(
        'dicionario_principios_ativos',
        `principio_ativo ~ '${escaped}'`,
        '-created',
        1,
        0,
      )
      if (records && records.length > 0) {
        principioRecord = records[0]
        trava3Passou = true
        const classe = principioRecord.getString('classe') || 'N/D'
        const grupo = principioRecord.getString('grupo_quimico') || 'N/D'
        trava3Msg = `Princípio ativo "${principioRecord.getString('principio_ativo')}" homologado no dicionário (Classe: ${classe}, Grupo: ${grupo}).`
      } else {
        trava3Msg = `Princípio ativo "${principioAtivo}" não encontrado no Dicionário de Princípios Ativos.`
      }
    } catch (err) {
      trava3Msg = `Erro ao consultar Dicionário de Princípios Ativos: ${err.message}`
    }
  }

  travas.push({
    id_trava: 3,
    trava_nome: 'Princípio Ativo Obrigatório',
    aprovado: trava3Passou,
    mensagem: trava3Msg,
  })

  // -------------------------------------------------------------------------
  // TRAVA 4: Duplicidade Multicritério na Base Mestre
  // Critérios de detecção:
  // (a) Tríplice exata: NCM + Princípio Ativo + Fabricante (quando fabricante informado)
  // (b) Nome de produto normalizado + NCM
  // (c) Registro MAPA + NCM (quando registro MAPA for numérico com >= 4 dígitos)
  // (d) NCM + Princípio Ativo homologado
  // -------------------------------------------------------------------------
  let trava4Passou = false
  let trava4Msg = ''
  let duplicataEncontrada = null
  let motivoDuplicidade = ''

  // Função interna de normalização de texto simples no Goja
  const normTxt = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')

  if (!ncm && !nomeProduto) {
    trava4Msg = 'Dados insuficientes para verificação de duplicidade (NCM ou Nome ausente).'
  } else {
    try {
      const escNcm = ncm.replace(/'/g, "\\'")
      const escNome = nomeProduto.replace(/'/g, "\\'")
      const escPa = principioAtivo.replace(/'/g, "\\'")
      const escFab = fabricante.replace(/'/g, "\\'")
      const escMapa = registroMapa.replace(/'/g, "\\'")

      // 1. Checagem por Nome do Produto + NCM
      if (nomeProduto && ncm) {
        const porNome = $app.findRecordsByFilter(
          'base_mestre',
          `ncm = '${escNcm}' && nome_produto ~ '${escNome}'`,
          '-created',
          5,
          0,
        )
        const matchNome = (porNome || []).find((r) => {
          return normTxt(r.getString('nome_produto')) === normTxt(nomeProduto)
        })
        if (matchNome) {
          duplicataEncontrada = matchNome
          motivoDuplicidade = `Nome de produto normalizado idêntico ("${matchNome.getString('nome_produto')}") com mesmo NCM ${ncm}.`
        }
      }

      // 2. Checagem por Registro MAPA + NCM
      if (!duplicataEncontrada && registroMapa && registroMapa.replace(/\D/g, '').length >= 4) {
        const limpoMapa = registroMapa.trim()
        const porMapa = $app.findRecordsByFilter(
          'base_mestre',
          `registro_mapa ~ '${escMapa}'`,
          '-created',
          5,
          0,
        )
        const matchMapa = (porMapa || []).find((r) => {
          const m1 = r.getString('registro_mapa').replace(/\D/g, '')
          const m2 = limpoMapa.replace(/\D/g, '')
          return m1 && m2 && m1 === m2
        })
        if (matchMapa) {
          duplicataEncontrada = matchMapa
          motivoDuplicidade = `Registro MAPA ${matchMapa.getString('registro_mapa')} já cadastrado no produto "${matchMapa.getString('nome_produto')}".`
        }
      }

      // 3. Checagem por Tríplice (NCM + Princípio Ativo + Fabricante) se fabricante informado
      if (
        !duplicataEncontrada &&
        ncm &&
        principioAtivo &&
        fabricante &&
        fabricante !== 'Não Informado'
      ) {
        const porTriplice = $app.findRecordsByFilter(
          'base_mestre',
          `ncm = '${escNcm}' && principio_ativo ~ '${escPa}' && fabricante ~ '${escFab}'`,
          '-created',
          1,
          0,
        )
        if (porTriplice && porTriplice.length > 0) {
          duplicataEncontrada = porTriplice[0]
          motivoDuplicidade = `Combinação NCM + Princípio Ativo + Fabricante idêntica ao produto "${duplicataEncontrada.getString('nome_produto')}".`
        }
      }

      // 4. Checagem por NCM + Princípio Ativo idêntico (quando fabricante não informado ou ambos sem fab)
      if (!duplicataEncontrada && ncm && principioAtivo && principioAtivo !== 'Não Informado') {
        const porPa = $app.findRecordsByFilter(
          'base_mestre',
          `ncm = '${escNcm}' && principio_ativo ~ '${escPa}'`,
          '-created',
          5,
          0,
        )
        const matchPa = (porPa || []).find((r) => {
          return normTxt(r.getString('principio_ativo')) === normTxt(principioAtivo)
        })
        if (matchPa) {
          duplicataEncontrada = matchPa
          motivoDuplicidade = `NCM ${ncm} e Princípio Ativo idêntico ao produto existente "${matchPa.getString('nome_produto')}".`
        }
      }

      if (duplicataEncontrada) {
        trava4Passou = false
        trava4Msg = `Produto duplicado detectado na Base Mestre: ${motivoDuplicidade}`
      } else {
        trava4Passou = true
        trava4Msg =
          'Nenhuma duplicidade encontrada na Base Mestre pelos critérios de NCM, Nome, MAPA e Fabricante.'
      }
    } catch (err) {
      trava4Msg = `Erro ao checar duplicidade na Base Mestre: ${err.message}`
    }
  }

  travas.push({
    id_trava: 4,
    trava_nome: 'Duplicidade',
    aprovado: trava4Passou,
    mensagem: trava4Msg,
  })

  // -------------------------------------------------------------------------
  // TRAVA 5: Concentração Válida (faixa concentracao_min / concentracao_max)
  // -------------------------------------------------------------------------
  let trava5Passou = false
  let trava5Msg = ''

  if (isNaN(concentracao) || concentracao <= 0) {
    trava5Msg = 'Concentração não informada ou valor numérico inválido.'
  } else if (!principioRecord) {
    trava5Msg =
      'Não foi possível validar faixa de concentração pois o princípio ativo não foi localizado no dicionário.'
  } else {
    const min = principioRecord.getFloat('concentracao_min')
    const max = principioRecord.getFloat('concentracao_max')
    const unidade = principioRecord.getString('unidade') || '%'

    if (min === 0 && max === 0) {
      trava5Passou = true
      trava5Msg = `Concentração informada (${concentracao} ${unidade}). Princípio ativo sem restrição rígida de faixa.`
    } else if (concentracao < min) {
      trava5Msg = `Concentração informada (${concentracao} ${unidade}) está abaixo do mínimo regulamentar (${min} ${unidade}).`
    } else if (max > 0 && concentracao > max) {
      trava5Msg = `Concentração informada (${concentracao} ${unidade}) excede o limite máximo permitido (${max} ${unidade}).`
    } else {
      trava5Passou = true
      trava5Msg = `Concentração ${concentracao} ${unidade} está dentro da faixa regulamentar (${min} a ${max} ${unidade}).`
    }
  }

  travas.push({
    id_trava: 5,
    trava_nome: 'Concentração Válida',
    aprovado: trava5Passou,
    mensagem: trava5Msg,
  })

  // -------------------------------------------------------------------------
  // TRAVA 6: Registro MAPA (formato e máscara regulamentar)
  // Formatos comuns no Brasil: 00123/99, 12345/21, SP 001234-5.000001, 1234-9, etc.
  // Padrão aceito: de 4 a 25 caracteres contendo números, barras ou traços
  // -------------------------------------------------------------------------
  let trava6Passou = false
  let trava6Msg = ''

  if (!registroMapa) {
    trava6Msg = 'Número de Registro MAPA não informado.'
  } else {
    // Regex flexível mas formal: números, barras, hífens e pontos, exigindo pelo menos 4 dígitos
    const digitsOnly = registroMapa.replace(/\D/g, '')
    const formatRegex = /^[A-Z0-9.\-\/ ]{4,25}$/i

    if (digitsOnly.length < 4) {
      trava6Msg = `Registro MAPA "${registroMapa}" inválido: deve possuir pelo menos 4 dígitos numéricos.`
    } else if (!formatRegex.test(registroMapa)) {
      trava6Msg = `Formato do Registro MAPA "${registroMapa}" inválido. Utilize o padrão oficial do Ministério da Agricultura (ex.: 00123/21 ou 1234-9).`
    } else {
      trava6Passou = true
      trava6Msg = `Registro MAPA "${registroMapa}" válido conforme padrões de formatação vigentes.`
    }
  }

  travas.push({
    id_trava: 6,
    trava_nome: 'Registro MAPA',
    aprovado: trava6Passou,
    mensagem: trava6Msg,
  })

  // -------------------------------------------------------------------------
  // Cálculo de Aprovado / Reprovado e Score
  // -------------------------------------------------------------------------
  const totalTravas = travas.length
  const totalAprovadas = travas.filter((t) => t.aprovado).length
  const score = Math.round((totalAprovadas / totalTravas) * 100)
  const statusGeral = totalAprovadas === totalTravas ? 'APROVADO' : 'REPROVADO'

  // -------------------------------------------------------------------------
  // Gravação no log_validacoes
  // -------------------------------------------------------------------------
  try {
    const logCol = $app.findCollectionByNameOrId('log_validacoes')
    for (const t of travas) {
      const logRec = new Record(logCol)
      logRec.set('nome_produto', nomeProduto || 'Não informado')
      logRec.set('ncm', ncm || ncmRaw)
      logRec.set('embalagem', embalagem)
      logRec.set('principio_ativo', principioAtivo)
      logRec.set('id_trava', t.id_trava)
      logRec.set('trava_nome', t.trava_nome)
      logRec.set('aprovado', t.aprovado)
      logRec.set('mensagem', t.mensagem)
      $app.save(logRec)
    }
  } catch (logErr) {
    console.log('Aviso ao registrar log_validacoes:', logErr.message)
  }

  // -------------------------------------------------------------------------
  // Consulta de Parametrização Fiscal (se NCM fornecido)
  // -------------------------------------------------------------------------
  let dadosFiscais = null
  if (ncm) {
    try {
      const fiscalRecords = $app.findRecordsByFilter(
        'parametrizacao_fiscal',
        `ncm = '${ncm}'`,
        '-created',
        1,
        0,
      )
      if (fiscalRecords && fiscalRecords.length > 0) {
        const fr = fiscalRecords[0]
        dadosFiscais = {
          ncm: fr.getString('ncm'),
          aliquota_pis: fr.getFloat('aliquota_pis'),
          aliquota_cofins: fr.getFloat('aliquota_cofins'),
          regime: fr.getString('regime'),
          aliquota_ibs: fr.getFloat('aliquota_ibs'),
          aliquota_cbs: fr.getFloat('aliquota_cbs'),
          classificacao: fr.getString('classificacao'),
          tributacao: fr.getString('tributacao'),
        }
      }
    } catch (_) {}
  }

  return e.json(200, {
    status: statusGeral,
    score: score,
    total_travas: totalTravas,
    total_aprovadas: totalAprovadas,
    travas: travas,
    parametrizacao_fiscal: dadosFiscais,
    produto_validado: {
      nome_produto: nomeProduto,
      ncm: ncm,
      embalagem: embalagem,
      quantidade_embalagem: qtdFormatada || undefined,
      principio_ativo: principioAtivo,
      fabricante: fabricante,
      registro_mapa: registroMapa,
      concentracao: concentracao,
    },
  })
})

/**
 * GET /backend/v1/relatorio-duplicidades
 * Retorna os grupos de duplicidades identificados na collection base_mestre pelos critérios:
 * (a) NCM + Princípio Ativo normalizado
 * (b) Registro MAPA repetido para produtos/NCMs
 * (c) Nome de produto normalizado + NCM
 */
routerAdd('GET', '/backend/v1/relatorio-duplicidades', (e) => {
  try {
    // Buscar todos os registros da base_mestre (limit 1500)
    const records = $app.findRecordsByFilter('base_mestre', 'id != ""', '-created', 1500, 0) || []

    const norm = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')

    const simplifyRecord = (r) => ({
      id: r.id,
      nome_produto: r.getString('nome_produto'),
      ncm: r.getString('ncm'),
      embalagem: r.getString('embalagem'),
      principio_ativo: r.getString('principio_ativo'),
      fabricante: r.getString('fabricante'),
      registro_mapa: r.getString('registro_mapa'),
      concentracao: r.getFloat('concentracao'),
      unidade_concentracao: r.getString('unidade_concentracao'),
      status_validacao: r.getString('status_validacao'),
      created: r.getString('created'),
    })

    // Mapas de agrupamento
    const gruposMap = {}

    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      const id = rec.id
      const ncm = String(rec.getString('ncm') || '').replace(/\D/g, '')
      const nome = rec.getString('nome_produto')
      const nomeNorm = norm(nome)
      const pa = rec.getString('principio_ativo')
      const paNorm = norm(pa)
      const mapa = rec.getString('registro_mapa')
      const mapaDigits = mapa.replace(/\D/g, '')

      const item = simplifyRecord(rec)

      // Critério C: Nome do Produto Normalizado + NCM
      if (nomeNorm && ncm && ncm.length === 8) {
        const key = `c_nome_ncm:${nomeNorm}_${ncm}`
        if (!gruposMap[key]) {
          gruposMap[key] = {
            id: key,
            criterio: 'Nome do Produto Normalizado + NCM',
            criterio_tipo: 'nome_ncm',
            chave: `${nome} (NCM ${ncm})`,
            registros: [],
          }
        }
        gruposMap[key].registros.push(item)
      }

      // Critério B: Registro MAPA repetido (quando possui pelo menos 4 dígitos)
      if (mapaDigits.length >= 4) {
        const key = `b_mapa:${mapaDigits}`
        if (!gruposMap[key]) {
          gruposMap[key] = {
            id: key,
            criterio: 'Registro MAPA Duplicado',
            criterio_tipo: 'registro_mapa',
            chave: `MAPA ${mapa}`,
            registros: [],
          }
        }
        gruposMap[key].registros.push(item)
      }

      // Critério A: NCM + Princípio Ativo Normalizado
      if (ncm && ncm.length === 8 && paNorm && paNorm !== 'naoinformado' && paNorm !== 'padrao') {
        const key = `a_ncm_pa:${ncm}_${paNorm}`
        if (!gruposMap[key]) {
          gruposMap[key] = {
            id: key,
            criterio: 'NCM + Princípio Ativo',
            criterio_tipo: 'ncm_pa',
            chave: `NCM ${ncm} + ${pa}`,
            registros: [],
          }
        }
        gruposMap[key].registros.push(item)
      }
    }

    // Filtrar apenas grupos que tenham 2 ou mais registros
    const gruposDuplicados = []
    const idsProdutosDuplicados = {}

    for (const k in gruposMap) {
      const g = gruposMap[k]
      // Desduplicar registros dentro do mesmo grupo por id
      const uniqueRegs = []
      const seenIds = {}
      for (let j = 0; j < g.registros.length; j++) {
        const r = g.registros[j]
        if (!seenIds[r.id]) {
          seenIds[r.id] = true
          uniqueRegs.push(r)
        }
      }

      if (uniqueRegs.length > 1) {
        g.registros = uniqueRegs
        g.total_ocorrencias = uniqueRegs.length
        gruposDuplicados.push(g)

        uniqueRegs.forEach((r) => {
          idsProdutosDuplicados[r.id] = true
        })
      }
    }

    // Ordenar grupos pelo número de ocorrências desc
    gruposDuplicados.sort((a, b) => b.total_ocorrencias - a.total_ocorrencias)

    return e.json(200, {
      total_grupos: gruposDuplicados.length,
      total_produtos_duplicados: Object.keys(idsProdutosDuplicados).length,
      grupos: gruposDuplicados,
    })
  } catch (err) {
    return e.json(500, {
      error: 'Erro ao analisar duplicidades na Base Mestre: ' + err.message,
    })
  }
})
