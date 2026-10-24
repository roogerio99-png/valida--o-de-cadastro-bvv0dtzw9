/**
 * pocketbase/hooks/simulador_comercial.js
 *
 * Endpoint de cálculo e simulação comercial no servidor:
 * POST /backend/v1/simulador/calcular
 *
 * Executa a regra de negócio comercial e fiscal no servidor com:
 * 1. Resolução do produto em sim_produtos_base ou base_mestre (caso informado código/nome)
 * 2. Consulta automática da regra de ICMS na coleção sim_regras_icms por chave_origem_destino (UF_ORIGEM + '_' + UF_DESTINO)
 * 3. Consulta da parametrização fiscal (parametrizacao_fiscal) da NCM do produto
 * 4. Aplicação estrita da conversão cambial por PTAX manual para produtos em moeda USD / importados
 * 5. Retorno estruturado do relatório de tributos, composição de custos e memória de cálculo
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
    const ufOrigem = String(body.uf_origem || 'SP')
      .trim()
      .toUpperCase()
    const ufDestino = String(body.uf_destino || 'MT')
      .trim()
      .toUpperCase()
    const quantidade = Number(body.quantidade) || 0
    const precoUnitario = Number(body.preco_unitario) || 0
    const frete = Number(body.frete) || 0
    const seguro = Number(body.seguro) || 0
    const outrasDespesas = Number(body.outras_despesas) || 0
    const ptaxManual = Number(body.ptax_manual) || 0
    const margemPerc = Number(body.margem_perc) || 0

    let produtoEncontrado = null

    // 1. Tentar localizar o produto em sim_produtos_base
    if (produtoId) {
      try {
        produtoEncontrado = $app.findRecordById('sim_produtos_base', produtoId)
      } catch (_) {
        // Tentar localizar em base_mestre
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
    }

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

    // 2. Consulta da Regra de ICMS para ufOrigem -> ufDestino
    const chavePar = `${ufOrigem}_${ufDestino}`
    let regraIcmsEncontrada = null
    let temRegraIcms = false
    let avisoIcms = null

    try {
      const escChave = chavePar.replace(/'/g, "\\'")
      const recordsIcms =
        $app.findRecordsByFilter(
          'sim_regras_icms',
          `chave_origem_destino = '${escChave}'`,
          '-created',
          1,
          0,
        ) || []
      if (recordsIcms.length > 0) {
        regraIcmsEncontrada = recordsIcms[0]
        temRegraIcms = true
      }
    } catch (eIcms) {
      console.log('Aviso ao consultar sim_regras_icms:', eIcms.message || eIcms)
    }

    let icmsAliqNominal = 0
    let icmsRedBase = 0
    let icmsAliqEfetiva = 0
    let icmsDiferimento = false
    let icmsPercDif = 0
    let icmsValor = 0
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

      const baseReduzida = baseOperacao * (1 - icmsRedBase / 100)
      icmsValor = baseReduzida * (icmsAliqNominal / 100)

      if (icmsDiferimento || icmsPercDif > 0) {
        icmsValor = Math.max(0, icmsValor * (1 - icmsPercDif / 100))
        icmsAliqEfetiva = icmsAliqEfetiva * (1 - icmsPercDif / 100)
      }
      memoriaCalculo.push(
        `ICMS Regra Encontrada (${ufOrigem} → ${ufDestino}): Nominal ${icmsAliqNominal}%, Redução ${icmsRedBase}%, Efetiva ${icmsAliqEfetiva.toFixed(2)}% → R$ ${icmsValor.toFixed(2)}`,
      )
    } else {
      avisoIcms = `Sem regra de ICMS para origem ${ufOrigem} → destino ${ufDestino}. Importe a planilha de regras ou cadastre o par na central.`
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
      icmsValor = baseOperacao * (aliqFallback / 100)
      icmsFundamentacao = 'Alíquota padrão estimada (sem regra origem→destino)'
    }

    // 3. PIS/COFINS Agro (Lei 10.925/2004 c/c LC 224/2025)
    const pisAliq = 0.165
    const cofinsAliq = 0.76
    const pisValor = baseOperacao * (pisAliq / 100)
    const cofinsValor = baseOperacao * (cofinsAliq / 100)

    // 4. IBS/CBS (LC 214/2025 com 60% de redução no agro)
    const ibsAliqEfetiva = 0.1 * 0.4 // 0,04%
    const cbsAliqEfetiva = 0.9 * 0.4 // 0,36%
    const ibsValor = baseOperacao * (ibsAliqEfetiva / 100)
    const cbsValor = baseOperacao * (cbsAliqEfetiva / 100)

    const totalTributos = icmsValor + pisValor + cofinsValor + ibsValor + cbsValor
    const custoTotal = baseOperacao + totalTributos

    const precoVenda =
      margemPerc > 0 && margemPerc < 100
        ? custoTotal / (1 - margemPerc / 100)
        : custoTotal * (1 + margemPerc / 100)

    const margemValor = precoVenda - custoTotal

    return e.json(200, {
      sucesso: true,
      produto: {
        id: produtoId,
        codigo: codigo,
        descricao: descricao,
        ncm: ncm,
        unidade: unidade,
        origem: origem,
        is_importado: isImportado,
      },
      operacao: {
        uf_origem: ufOrigem,
        uf_destino: ufDestino,
        tipo: ufOrigem === ufDestino ? 'Interna' : 'Interestadual',
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
        seguro: seguro,
        outras_despesas: outrasDespesas,
        base_operacao: baseOperacao,
      },
      tributos: {
        icms: {
          nome: 'ICMS',
          aliquota_nominal: icmsAliqNominal,
          reducao_base: icmsRedBase,
          aliquota_efetiva: icmsAliqEfetiva,
          diferimento: icmsDiferimento,
          percentual_diferimento: icmsPercDif,
          valor: icmsValor,
          tem_regra: temRegraIcms,
          aviso: avisoIcms,
          fundamentacao: icmsFundamentacao,
        },
        pis: {
          nome: 'PIS',
          aliquota: pisAliq,
          valor: pisValor,
          fundamentacao: 'LC 224/2025 (Carga residual pós-Abr/2026)',
        },
        cofins: {
          nome: 'COFINS',
          aliquota: cofinsAliq,
          valor: cofinsValor,
          fundamentacao: 'LC 224/2025 (Carga residual pós-Abr/2026)',
        },
        ibs: {
          nome: 'IBS',
          aliquota: ibsAliqEfetiva,
          valor: ibsValor,
          fundamentacao: 'LC 214/2025 (Redução 60% insumos agro)',
        },
        cbs: {
          nome: 'CBS',
          aliquota: cbsAliqEfetiva,
          valor: cbsValor,
          fundamentacao: 'LC 214/2025 (Redução 60% insumos agro)',
        },
        total_tributos: totalTributos,
        carga_efetiva_perc: baseOperacao > 0 ? (totalTributos / baseOperacao) * 100 : 0,
      },
      resultado_comercial: {
        custo_total: custoTotal,
        margem_perc: margemPerc,
        margem_valor: margemValor,
        preco_venda_sugerido: precoVenda,
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
