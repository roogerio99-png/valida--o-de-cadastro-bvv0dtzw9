/**
 * pocketbase/hooks/simulador_comercial.js
 *
 * Endpoint de cálculo e simulação comercial no servidor:
 * POST /backend/v1/simulador/calcular
 *
 * Executa a regra de negócio comercial e fiscal no servidor com:
 * 1. Resolução do produto em sim_produtos_base ou base_mestre (caso informado código/nome)
 * 2. Embalagens e volume total da simulação
 * 3. Modalidade de frete CIF vs FOB
 * 4. Consulta de regra de ICMS por UF_ORIGEM e UF_DESTINO com prioridade para gr_trib
 * 5. Dedução de ICMS detalhado (débito, diferimento, desonerado, créditos)
 * 6. PIS/COFINS com base de cálculo com exclusão do ICMS (Tema 69 STF)
 * 7. IBS/CBS com redução de 60% para insumos agrícolas
 * 8. DRE / Cascata de preço (faturamento, receita líquida, CMV, comissão, juros, margem de contribuição)
 */

routerAdd('POST', '/backend/v1/simulador/calcular', (e) => {
  try {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, {
        sucesso: false,
        error: 'Acesso não autorizado. É necessário estar autenticado.',
      })
    }

    const info = e.requestInfo()
    const body = info.body || {}

    const produtoId = String(body.produto_id || '').trim()
    const produtoNomeManual = String(body.produto_nome || '').trim()
    const ncmManual = String(body.ncm || '').trim()
    const grTribManual = String(body.gr_trib || '').trim()
    const ufOrigem = String(body.uf_origem || 'SP')
      .trim()
      .toUpperCase()
    const ufDestino = String(body.uf_destino || 'MT')
      .trim()
      .toUpperCase()
    const quantidade = Number(body.quantidade) || 0
    const precoUnitario = Number(body.preco_unitario) || 0
    const frete = Number(body.frete) || 0
    const modalidadeFrete = String(body.modalidade_frete || 'CIF')
      .trim()
      .toUpperCase()
    const seguro = Number(body.seguro) || 0
    const outrasDespesas = Number(body.outras_despesas) || 0
    const ptaxManual = Number(body.ptax_manual) || 0
    const margemPerc = Number(body.margem_perc) || 0
    const comissaoPercInput =
      body.comissao_perc !== undefined ? Number(body.comissao_perc) : undefined
    const custoFinanceiroPerc = Number(body.custo_financeiro_perc) || 0
    const enquadramentoCliente = String(body.enquadramento_cliente || 'produtor_rural').trim()

    let produtoEncontrado = null

    // 1. Tentar localizar o produto em sim_produtos_base
    if (produtoId) {
      try {
        produtoEncontrado = $app.findRecordById('sim_produtos_base', produtoId)
      } catch (_) {
        try {
          produtoEncontrado = $app.findRecordById('base_mestre', produtoId)
        } catch (_) {}
      }
    }

    let descricao = produtoNomeManual || 'Produto Simulado'
    let ncm = ncmManual || '3808.93.29'
    let unidade = 'L'
    let moeda = 'BRL'
    let origem = 'Nacional'
    let codigo = 'S/C'
    let embalagem = 'Padrão'
    let comissaoPadrao = 2.5

    if (produtoEncontrado) {
      descricao =
        produtoEncontrado.getString('descricao') ||
        produtoEncontrado.getString('nome_produto') ||
        descricao
      ncm =
        produtoEncontrado.getString('ncm') ||
        produtoEncontrado.getString('ncm_especifica') ||
        produtoEncontrado.getString('ncm_padrao') ||
        ncm
      unidade =
        produtoEncontrado.getString('unidade') ||
        produtoEncontrado.getString('unidade_medida_principal') ||
        unidade
      moeda =
        produtoEncontrado.getString('moeda') ||
        (produtoEncontrado.getString('origem')?.toUpperCase().includes('IMP') ? 'USD' : 'BRL')
      origem = produtoEncontrado.getString('origem') || 'Nacional'
      codigo =
        produtoEncontrado.getString('codigo') ||
        produtoEncontrado.getString('registro_mapa') ||
        codigo
      embalagem = produtoEncontrado.getString('embalagem') || embalagem
      const cp = produtoEncontrado.getFloat('comissao_padrao')
      if (cp > 0) {
        comissaoPadrao = cp < 1 ? cp * 100 : cp
      }
    }

    const comissaoPerc = comissaoPercInput !== undefined ? comissaoPercInput : comissaoPadrao
    const grTrib =
      (produtoEncontrado && produtoEncontrado.getString('gr_trib')) || grTribManual || ''

    const isImportado =
      origem.toUpperCase().includes('IMP') ||
      descricao.toUpperCase().includes('(IMP)') ||
      moeda === 'USD'
    let ptaxAplicada = 1.0
    let valorUnitarioReais = precoUnitario

    const alertas = []
    const memoriaCalculo = []

    if (moeda === 'USD' || isImportado) {
      if (ptaxManual <= 0) {
        alertas.push(
          'Insumo importado cotado em dólar: informe a cotação PTAX manual para a conversão exata.',
        )
      }
      ptaxAplicada = ptaxManual > 0 ? ptaxManual : 1.0
      valorUnitarioReais = precoUnitario * ptaxAplicada
      memoriaCalculo.push(
        `PTAX manual aplicada: US$ ${precoUnitario.toFixed(2)} × R$ ${ptaxAplicada.toFixed(4)} = R$ ${valorUnitarioReais.toFixed(2)} / ${unidade}`,
      )
    } else {
      memoriaCalculo.push(
        `Preço unitário em moeda nacional: R$ ${valorUnitarioReais.toFixed(2)} / ${unidade}`,
      )
    }

    const valorMercadoriaReais = quantidade * valorUnitarioReais
    const totalDespesas = frete + seguro + outrasDespesas
    const baseOperacao = valorMercadoriaReais + totalDespesas
    const freteNaBaseIcms = modalidadeFrete === 'CIF' ? frete : 0
    const baseCalculoBrutaIcms = valorMercadoriaReais + freteNaBaseIcms + seguro + outrasDespesas

    // 2. Consulta da Regra de ICMS para ufOrigem -> ufDestino com cruzamento por gr_trib
    let regraIcmsEncontrada = null
    let temRegraIcms = false
    let statusRegra = 'sem_regra'
    let avisoIcms = null

    try {
      const escOrigem = ufOrigem.replace(/'/g, "\\'")
      const escDestino = ufDestino.replace(/'/g, "\\'")

      if (grTrib) {
        const escGr = grTrib.replace(/'/g, "\\'")
        const recordsExatos =
          $app.findRecordsByFilter(
            'sim_regras_icms',
            `uf_origem = '${escOrigem}' && uf_destino = '${escDestino}' && grupo_tributario_codigo = '${escGr}'`,
            '-created',
            1,
            0,
          ) || []
        if (recordsExatos.length > 0) {
          regraIcmsEncontrada = recordsExatos[0]
          temRegraIcms = true
          statusRegra = 'exata_grtrib'
        }
      }

      if (!regraIcmsEncontrada) {
        const recordsIcms =
          $app.findRecordsByFilter(
            'sim_regras_icms',
            `uf_origem = '${escOrigem}' && uf_destino = '${escDestino}'`,
            '-created',
            1,
            0,
          ) || []
        if (recordsIcms.length > 0) {
          regraIcmsEncontrada = recordsIcms[0]
          temRegraIcms = true
          statusRegra = 'fallback_uf'
          if (grTrib) {
            alertas.push(
              `Não há regra específica para GrTrib "${grTrib}" em ${ufOrigem} → ${ufDestino}. Aplicada regra geral da UF.`,
            )
          } else {
            alertas.push(
              `Produto sem Grupo Tributário (GrTrib). Aplicada regra genérica do par ${ufOrigem} → ${ufDestino}.`,
            )
          }
        }
      }
    } catch (eIcms) {
      console.log('Aviso ao consultar sim_regras_icms:', eIcms.message || eIcms)
    }

    let icmsAliqNominal = 0
    let icmsRedBase = 0
    let icmsAliqEfetiva = 0
    let icmsDiferimento = false
    let icmsPercDif = 0
    let icmsDebito = 0
    let icmsValorDiferido = 0
    let icmsDesoneradoValor = 0
    let icmsCreditoValor = 0
    let icmsEfetivoRecolher = 0
    let tipoDesonerado = 'Não Calcula'
    let icmsFundamentacao = ''

    if (temRegraIcms && regraIcmsEncontrada) {
      icmsAliqNominal = regraIcmsEncontrada.getFloat('aliquota_icms') || 0
      icmsRedBase = regraIcmsEncontrada.getFloat('reducao_base') || 0
      icmsDiferimento = regraIcmsEncontrada.getBool('diferimento')
      icmsPercDif =
        regraIcmsEncontrada.getFloat('percentual_diferimento') || (icmsDiferimento ? 100 : 0)
      icmsAliqEfetiva =
        regraIcmsEncontrada.getFloat('aliquota_efetiva') ||
        icmsAliqNominal * (1 - icmsRedBase / 100)
      icmsFundamentacao =
        regraIcmsEncontrada.getString('fundamentacao_legal') || `Regra ${ufOrigem} → ${ufDestino}`
      tipoDesonerado = regraIcmsEncontrada.getString('tipo_desonerado') || 'Não Calcula'
      const taxaDeson = regraIcmsEncontrada.getFloat('icms_desonerado') || 0

      const baseReduzida = baseCalculoBrutaIcms * (1 - icmsRedBase / 100)
      icmsDebito = baseReduzida * (icmsAliqNominal / 100)

      if (icmsDiferimento || icmsPercDif > 0) {
        icmsValorDiferido = icmsDebito * (icmsPercDif / 100)
      }

      if (tipoDesonerado.toLowerCase().includes('desconta') || taxaDeson > 0) {
        const percDeson = taxaDeson > 0 ? taxaDeson : icmsAliqNominal - icmsAliqEfetiva
        if (percDeson > 0) {
          icmsDesoneradoValor = baseCalculoBrutaIcms * (percDeson / 100)
        }
      }

      const regraCredito = regraIcmsEncontrada.getString('regra_credito_entrada') || ''
      if (regraCredito.toLowerCase().includes('presumido')) {
        icmsCreditoValor = baseReduzida * ((icmsAliqEfetiva * 0.5) / 100)
      }

      icmsEfetivoRecolher = Math.max(
        0,
        icmsDebito -
          icmsValorDiferido -
          icmsCreditoValor -
          (tipoDesonerado.toLowerCase().includes('desconta') ? icmsDesoneradoValor : 0),
      )
    } else {
      avisoIcms = `Sem regra de ICMS para origem ${ufOrigem} → destino ${ufDestino}${grTrib ? ` (GrTrib ${grTrib})` : ''}. Importe a planilha de regras ou cadastre o par na central.`
      alertas.push(avisoIcms)

      const aliqFallback =
        ufOrigem === ufDestino
          ? 18
          : ['SP', 'RJ', 'MG', 'PR', 'RS', 'SC'].includes(ufOrigem) &&
              !['SP', 'RJ', 'MG', 'PR', 'RS', 'SC'].includes(ufDestino)
            ? 7
            : 12
      icmsAliqNominal = aliqFallback
      icmsAliqEfetiva = aliqFallback
      icmsDebito = baseCalculoBrutaIcms * (aliqFallback / 100)
      icmsEfetivoRecolher = icmsDebito
      icmsFundamentacao = 'Alíquota padrão estimada (sem regra origem→destino)'
    }

    // 3. PIS/COFINS Agro (Tema 69 STF - Exclusão do ICMS)
    const basePisCofins = Math.max(0, baseOperacao - icmsEfetivoRecolher)
    const pisAliq = 0.165
    const cofinsAliq = 0.76
    const pisValor = basePisCofins * (pisAliq / 100)
    const cofinsValor = basePisCofins * (cofinsAliq / 100)

    // 4. IBS/CBS (LC 214/2025 com 60% de redução no agro)
    const ibsAliqEfetiva = 0.1 * 0.4 // 0,04%
    const cbsAliqEfetiva = 0.9 * 0.4 // 0,36%
    const baseIbsCbs = baseOperacao * 0.4
    const ibsValor = baseIbsCbs * (0.1 / 100)
    const cbsValor = baseIbsCbs * (0.9 / 100)

    const totalTributos = icmsEfetivoRecolher + pisValor + cofinsValor + ibsValor + cbsValor
    const comissaoValor = baseOperacao * (comissaoPerc / 100)
    const custoFinanceiroValor = baseOperacao * (custoFinanceiroPerc / 100)

    const receitaBruta = baseOperacao
    const receitaLiquida = receitaBruta - totalTributos
    const custosOperacionais =
      valorMercadoriaReais +
      (modalidadeFrete === 'CIF' ? frete : 0) +
      seguro +
      outrasDespesas +
      comissaoValor +
      custoFinanceiroValor
    const margemContribuicaoValor = receitaLiquida - custosOperacionais
    const margemContribuicaoPerc =
      receitaBruta > 0 ? (margemContribuicaoValor / receitaBruta) * 100 : 0

    // Formação de preço
    const somaCargasPerc =
      (baseOperacao > 0 ? (totalTributos / baseOperacao) * 100 : 0) +
      comissaoPerc +
      custoFinanceiroPerc
    const custoBaseFixo =
      valorMercadoriaReais + (modalidadeFrete === 'CIF' ? frete : 0) + seguro + outrasDespesas
    const divisorBreakEven = Math.max(0.01, 1 - somaCargasPerc / 100)
    const precoMinimoBreakEven = custoBaseFixo / divisorBreakEven
    const divisorComMargem = Math.max(0.01, 1 - somaCargasPerc / 100 - margemPerc / 100)
    const precoVendaSugerido =
      margemPerc > 0 && divisorComMargem > 0
        ? custoBaseFixo / divisorComMargem
        : precoMinimoBreakEven * (1 + margemPerc / 100)

    return e.json(200, {
      sucesso: true,
      produto: {
        id: produtoId,
        codigo: codigo,
        descricao: descricao,
        ncm: ncm,
        unidade: unidade,
        embalagem: embalagem,
        origem: origem,
        gr_trib: grTrib,
        is_importado: isImportado,
        enquadramento_cliente: enquadramentoCliente,
      },
      operacao: {
        uf_origem: ufOrigem,
        uf_destino: ufDestino,
        tipo: ufOrigem === ufDestino ? 'Interna' : 'Interestadual',
        modalidade_frete: modalidadeFrete,
      },
      cambio: {
        moeda: moeda,
        ptax_aplicada: ptaxAplicada,
        preco_unitario_original: precoUnitario,
        preco_unitario_reais: valorUnitarioReais,
      },
      valores_base: {
        quantidade: quantidade,
        valor_mercadoria_reais: valorMercadoriaReais,
        frete: frete,
        modalidade_frete: modalidadeFrete,
        seguro: seguro,
        outras_despesas: outrasDespesas,
        base_operacao: baseOperacao,
        base_calculo_bruta_icms: baseCalculoBrutaIcms,
        comissao_perc: comissaoPerc,
        comissao_valor: comissaoValor,
        custo_financeiro_perc: custoFinanceiroPerc,
        custo_financeiro_valor: custoFinanceiroValor,
      },
      tributos: {
        icms: {
          nome: 'ICMS',
          base_calculo_bruta: baseCalculoBrutaIcms,
          base_calculo_efetiva: baseCalculoBrutaIcms * (1 - icmsRedBase / 100),
          aliquota_nominal: icmsAliqNominal,
          reducao_base: icmsRedBase,
          aliquota_efetiva: icmsAliqEfetiva,
          debito_icms: icmsDebito,
          diferimento: icmsDiferimento,
          percentual_diferimento: icmsPercDif,
          valor_diferimento: icmsValorDiferido,
          tipo_desonerado: tipoDesonerado,
          valor_desonerado: icmsDesoneradoValor,
          credito_entrada_valor: icmsCreditoValor,
          icms_efetivo_recolher: icmsEfetivoRecolher,
          tem_regra: temRegraIcms,
          status_regra: statusRegra,
          aviso: avisoIcms,
          fundamentacao: icmsFundamentacao,
        },
        pis: {
          nome: 'PIS',
          base_calculo: basePisCofins,
          aliquota: pisAliq,
          valor: pisValor,
          fundamentacao: 'LC 224/2025 (Tema 69 STF: base sem ICMS)',
        },
        cofins: {
          nome: 'COFINS',
          base_calculo: basePisCofins,
          aliquota: cofinsAliq,
          valor: cofinsValor,
          fundamentacao: 'LC 224/2025 (Tema 69 STF: base sem ICMS)',
        },
        ibs: {
          nome: 'IBS',
          base_calculo: baseIbsCbs,
          aliquota: ibsAliqEfetiva,
          valor: ibsValor,
          fundamentacao: 'LC 214/2025 (Redução 60% insumos agro)',
        },
        cbs: {
          nome: 'CBS',
          base_calculo: baseIbsCbs,
          aliquota: cbsAliqEfetiva,
          valor: cbsValor,
          fundamentacao: 'LC 214/2025 (Redução 60% insumos agro)',
        },
        total_tributos: totalTributos,
        carga_efetiva_perc: baseOperacao > 0 ? (totalTributos / baseOperacao) * 100 : 0,
      },
      dre: {
        receita_bruta: receitaBruta,
        deducoes_tributarias: totalTributos,
        receita_liquida: receitaLiquida,
        cmv: valorMercadoriaReais,
        frete: modalidadeFrete === 'CIF' ? frete : 0,
        seguro_outros: seguro + outrasDespesas,
        comissao_valor: comissaoValor,
        custo_financeiro_valor: custoFinanceiroValor,
        margem_contribuicao_valor: margemContribuicaoValor,
        margem_contribuicao_perc: margemContribuicaoPerc,
      },
      resultado_comercial: {
        preco_minimo_break_even: precoMinimoBreakEven,
        preco_venda_sugerido: precoVendaSugerido,
        margem_perc: margemPerc,
      },
      alertas: alertas,
      memoria_calculo: memoriaCalculo,
    })
  } catch (err) {
    console.log('Erro ao executar simulação comercial no backend:', err.message || err)
    return e.json(500, {
      sucesso: false,
      error: `Erro ao executar cálculo da simulação: ${err.message || String(err)}`,
    })
  }
})
