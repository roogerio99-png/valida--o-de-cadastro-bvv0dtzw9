/**
 * pocketbase/hooks/simulador_comercial.js
 *
 * Endpoint server-side para simulação comercial e DRE em 3 colunas (POST /backend/v1/agro/simular-operacao).
 *
 * Suporta o fluxo comercial completo segregando:
 * 1. OPERAÇÃO DE COMPRA (Aquisição):
 *    - Data da compra, prazo de pagamento em dias corridos, data de vencimento calculada
 *    - Custo de aquisição unitário (BRL ou USD c/ PTAX)
 *    - Despesas acessórias (frete FOB/CIF, seguro, outros)
 *    - Créditos de entrada (ICMS e PIS/COFINS)
 *    - Juros de compra proporcionais ao prazo pró-rata 30 dias
 *
 * 2. OPERAÇÃO DE VENDA (Revenda Comercial):
 *    - Data da venda, prazo concedido em dias corridos, data de vencimento calculada
 *    - Preço de venda unitário e faturamento bruto
 *    - Despesas de venda (frete CIF/FOB, seguro, comissão de venda)
 *    - Tributos incidentes (ICMS próprio, diferimento, PIS/COFINS Tema 69 STF, IBS/CBS c/ red. 60%)
 *    - Juros de financiamento ao cliente proporcionais ao prazo
 *
 * 3. RESULTADO DA OPERAÇÃO:
 *    - Margem operacional líquida
 *    - Resultado financeiro líquido (Juros Venda - Juros Compra)
 *    - Resultado final da operação consolidado em R$ e %
 */

routerAdd('POST', '/backend/v1/agro/simular-operacao', (e) => {
  let body = {}
  try {
    const info = e.requestInfo()
    body = info.body || {}
  } catch (_) {
    body = {}
  }

  const codProduto = body.codigo_produto || ''
  const idProduto = body.produto_id || ''
  const descProduto = body.descricao || ''

  // 1. Busca do produto na base sim_produtos_base
  let produtoRecord = null
  if (idProduto) {
    try {
      produtoRecord = $app.findRecordById('sim_produtos_base', idProduto)
    } catch (_) {}
  }
  if (!produtoRecord && codProduto) {
    try {
      produtoRecord = $app.findFirstRecordByData('sim_produtos_base', 'codigo', codProduto)
    } catch (_) {}
  }
  if (!produtoRecord && descProduto) {
    try {
      produtoRecord = $app.findFirstRecordByFilter('sim_produtos_base', `descricao ~ {:desc}`, {
        desc: descProduto,
      })
    } catch (_) {}
  }

  // Dados do Produto
  const desc = produtoRecord
    ? produtoRecord.getString('descricao')
    : descProduto || 'Produto Base Insumo'
  const cod = produtoRecord ? produtoRecord.getString('codigo') : codProduto || 'S/C'
  const ncm = produtoRecord ? produtoRecord.getString('ncm') : body.ncm || '3808.93.29'
  const unid = produtoRecord ? produtoRecord.getString('unidade') : body.unidade || 'L'
  const emb = produtoRecord ? produtoRecord.getString('embalagem') : body.embalagem || 'Padrão'
  const grTrib = produtoRecord ? produtoRecord.getString('gr_trib') : body.gr_trib || ''
  const origem = produtoRecord ? produtoRecord.getString('origem') : 'Nacional'
  const moedaPadrao = produtoRecord ? produtoRecord.getString('moeda') : 'BRL'
  const precoBasePadrao = produtoRecord ? produtoRecord.getFloat('preco_base_sugerido') : 0
  const comissaoPadrao = produtoRecord ? produtoRecord.getFloat('comissao_padrao') : 0.025

  // 2. Volume e Embalagens
  const qtdInformada = Math.max(0, Number(body.quantidade) || 1000)
  const volumePorEmb = Math.max(1, Number(body.volume_por_embalagem) || 20)
  const qtdEmbalagens = Math.ceil(qtdInformada / volumePorEmb)
  const volumeTotal = qtdInformada

  // PTAX Manual
  const isImportado =
    moedaPadrao.toUpperCase() === 'USD' ||
    origem.toLowerCase().indexOf('imp') >= 0 ||
    desc.toUpperCase().indexOf('(IMP)') >= 0
  const ptaxManual = isImportado ? Math.max(0.0001, Number(body.ptax_manual) || 5.75) : 1.0

  // 3. OPERAÇÃO DE COMPRA
  const compraIn = body.compra || {}
  const dataCompra = compraIn.data_operacao || body.data_compra || '2026-03-01'
  const prazoCompraDias = Math.max(0, Number(compraIn.prazo_dias ?? body.prazo_compra_dias ?? 30))

  // Data de vencimento da compra
  const dCompra = new Date(dataCompra)
  dCompra.setDate(dCompra.getDate() + prazoCompraDias)
  const vencimentoCompra = dCompra.toISOString().split('T')[0]

  const precoUnitarioCompra = Math.max(
    0,
    Number(
      compraIn.preco_unitario ??
        (precoBasePadrao > 0 ? precoBasePadrao : (body.preco_unitario_compra ?? 30)),
    ),
  )
  const moedaCompra = (compraIn.moeda || moedaPadrao || 'BRL').toUpperCase()
  const precoUnitarioCompraReais =
    moedaCompra === 'USD' ? precoUnitarioCompra * ptaxManual : precoUnitarioCompra
  const valorMercadoriaCompraReais = volumeTotal * precoUnitarioCompraReais

  const freteCompra = Math.max(0, Number(compraIn.frete ?? body.frete_compra ?? 1200))
  const seguroCompra = Math.max(0, Number(compraIn.seguro ?? body.seguro_compra ?? 200))
  const outrasDespesasCompra = Math.max(
    0,
    Number(compraIn.outras_despesas ?? body.outras_despesas_compra ?? 100),
  )
  const totalDespesasCompra = freteCompra + seguroCompra + outrasDespesasCompra
  const custoAquisicaoMercadoria = valorMercadoriaCompraReais + totalDespesasCompra

  // Juros de Compra (pró-rata mês 30 dias)
  const taxaJurosCompraMensal = Math.max(
    0,
    Number(compraIn.taxa_juros_mensal_perc ?? body.taxa_juros_compra_perc ?? 1.2),
  )
  const taxaEfetivaCompraPerc = (taxaJurosCompraMensal / 30) * prazoCompraDias
  const jurosCompraValor = custoAquisicaoMercadoria * (taxaEfetivaCompraPerc / 100)
  const custoTotalCompraComJuros = custoAquisicaoMercadoria + jurosCompraValor

  // 4. OPERAÇÃO DE VENDA
  const vendaIn = body.venda || {}
  const dataVenda = vendaIn.data_operacao || body.data_venda || '2026-03-01'
  const prazoVendaDias = Math.max(0, Number(vendaIn.prazo_dias ?? body.prazo_venda_dias ?? 60))

  const dVenda = new Date(dataVenda)
  dVenda.setDate(dVenda.getDate() + prazoVendaDias)
  const vencimentoVenda = dVenda.toISOString().split('T')[0]

  const precoUnitarioVenda = Math.max(
    0,
    Number(vendaIn.preco_unitario ?? body.preco_unitario_venda ?? precoUnitarioCompraReais * 1.35),
  )
  const moedaVenda = (vendaIn.moeda || 'BRL').toUpperCase()
  const precoUnitarioVendaReais =
    moedaVenda === 'USD' ? precoUnitarioVenda * ptaxManual : precoUnitarioVenda
  const valorMercadoriaVendaReais = volumeTotal * precoUnitarioVendaReais

  const ufOrigemVenda = (vendaIn.uf_origem || body.uf_origem || 'SP').trim().toUpperCase()
  const ufDestinoVenda = (vendaIn.uf_destino || body.uf_destino || 'MT').trim().toUpperCase()
  const modalidadeFreteVenda = (
    vendaIn.modalidade_frete ||
    body.modalidade_frete ||
    'CIF'
  ).toUpperCase()
  const freteVenda = Math.max(0, Number(vendaIn.frete ?? body.frete ?? 2500))
  const seguroVenda = Math.max(0, Number(vendaIn.seguro ?? body.seguro ?? 350))
  const outrasDespesasVenda = Math.max(
    0,
    Number(vendaIn.outras_despesas ?? body.outras_despesas ?? 150),
  )
  const totalDespesasVenda = freteVenda + seguroVenda + outrasDespesasVenda

  const freteNaBaseIcms = modalidadeFreteVenda === 'CIF' ? freteVenda : 0
  const baseCalculoBrutaIcms =
    valorMercadoriaVendaReais + freteNaBaseIcms + seguroVenda + outrasDespesasVenda
  const baseOperacaoComercialVenda = valorMercadoriaVendaReais + totalDespesasVenda

  // Juros de Venda concedidos ao cliente
  const taxaJurosVendaMensal = Math.max(
    0,
    Number(vendaIn.taxa_juros_mensal_perc ?? body.taxa_juros_venda_perc ?? 1.8),
  )
  const taxaEfetivaVendaPerc = (taxaJurosVendaMensal / 30) * prazoVendaDias
  const jurosVendaValor = baseOperacaoComercialVenda * (taxaEfetivaVendaPerc / 100)

  // 5. REGRA DE ICMS
  let regraRecord = null
  if (grTrib) {
    try {
      regraRecord = $app.findFirstRecordByFilter(
        'sim_regras_icms',
        `uf_origem = {:orig} && uf_destino = {:dest} && grupo_tributario_codigo = {:gr}`,
        { orig: ufOrigemVenda, dest: ufDestinoVenda, gr: grTrib },
      )
    } catch (_) {}
  }
  if (!regraRecord) {
    try {
      regraRecord = $app.findFirstRecordByFilter(
        'sim_regras_icms',
        `uf_origem = {:orig} && uf_destino = {:dest}`,
        { orig: ufOrigemVenda, dest: ufDestinoVenda },
      )
    } catch (_) {}
  }

  let aliqNominalIcms = 7.0
  let redBasePerc = 60.0
  let percDiferimento = 0.0

  if (regraRecord) {
    aliqNominalIcms = regraRecord.getFloat('aliquota_icms') || 7.0
    redBasePerc = regraRecord.getFloat('reducao_base') || 0.0
    if (regraRecord.getBool('diferimento')) {
      percDiferimento = regraRecord.getFloat('percentual_diferimento') || 100.0
    }
  }

  const baseCalculoEfetivaIcms = baseCalculoBrutaIcms * (1 - redBasePerc / 100)
  const debitoIcms = baseCalculoEfetivaIcms * (aliqNominalIcms / 100)
  const valorDiferimento = debitoIcms * (percDiferimento / 100)
  const icmsEfetivoRecolher = Math.max(0, debitoIcms - valorDiferimento)

  // PIS / COFINS (Tema 69 STF)
  const basePisCofins = Math.max(0, baseOperacaoComercialVenda - icmsEfetivoRecolher)
  const aliqPis = 0.165
  const aliqCofins = 0.76
  const valorPis = basePisCofins * (aliqPis / 100)
  const valorCofins = basePisCofins * (aliqCofins / 100)

  // IBS / CBS c/ redução 60%
  const baseIbsCbs = baseOperacaoComercialVenda * 0.4
  const valorIbs = baseIbsCbs * 0.001
  const valorCbs = baseIbsCbs * 0.009
  const totalTributosVenda = icmsEfetivoRecolher + valorPis + valorCofins + valorIbs + valorCbs

  // Comissão de Venda
  const comissaoPerc = Math.max(
    0,
    Number(vendaIn.comissao_perc ?? body.comissao_perc ?? comissaoPadrao * 100),
  )
  const comissaoValor = baseOperacaoComercialVenda * (comissaoPerc / 100)

  const receitaBrutaVenda = baseOperacaoComercialVenda
  const receitaLiquidaVenda = receitaBrutaVenda - totalTributosVenda

  // 6. RESULTADO DA OPERAÇÃO
  const despesasOperacionaisVenda =
    (modalidadeFreteVenda === 'CIF' ? freteVenda : 0) +
    seguroVenda +
    outrasDespesasVenda +
    comissaoValor
  const custoAquisicaoBase = custoAquisicaoMercadoria
  const resultadoOperacionalBruto = receitaLiquidaVenda - custoAquisicaoBase
  const margemContribuicaoOperacional = resultadoOperacionalBruto - despesasOperacionaisVenda

  const resultadoFinanceiroLiquido = jurosVendaValor - jurosCompraValor
  const resultadoFinalOperacao = margemContribuicaoOperacional + resultadoFinanceiroLiquido
  const margemSobreReceitaBrutaPerc =
    receitaBrutaVenda > 0 ? (resultadoFinalOperacao / receitaBrutaVenda) * 100 : 0
  const margemSobreCustoInvestidoPerc =
    custoTotalCompraComJuros > 0 ? (resultadoFinalOperacao / custoTotalCompraComJuros) * 100 : 0

  return e.json(200, {
    produto: {
      codigo: cod,
      descricao: desc,
      ncm,
      unidade: unid,
      embalagem: emb,
      gr_trib: grTrib,
    },
    compra: {
      data_operacao: dataCompra,
      prazo_dias: prazoCompraDias,
      data_vencimento: vencimentoCompra,
      moeda: moedaCompra,
      ptax: ptaxManual,
      preco_unitario: precoUnitarioCompraReais,
      valor_mercadoria: valorMercadoriaCompraReais,
      despesas_acessorias: totalDespesasCompra,
      taxa_juros_mensal_perc: taxaJurosCompraMensal,
      taxa_efetiva_perc: taxaEfetivaCompraPerc,
      juros_valor: jurosCompraValor,
      custo_aquisicao_mercadoria: custoAquisicaoMercadoria,
      custo_total_com_juros: custoTotalCompraComJuros,
    },
    venda: {
      data_operacao: dataVenda,
      prazo_dias: prazoVendaDias,
      data_vencimento: vencimentoVenda,
      moeda: moedaVenda,
      preco_unitario: precoUnitarioVendaReais,
      faturamento_bruto: receitaBrutaVenda,
      tributos_total: totalTributosVenda,
      receita_liquida: receitaLiquidaVenda,
      comissao_valor: comissaoValor,
      taxa_juros_mensal_perc: taxaJurosVendaMensal,
      taxa_efetiva_perc: taxaEfetivaVendaPerc,
      juros_valor: jurosVendaValor,
    },
    resultado_operacao: {
      receita_liquida: receitaLiquidaVenda,
      custo_aquisicao: custoAquisicaoBase,
      despesas_operacionais_venda: despesasOperacionaisVenda,
      margem_operacional: margemContribuicaoOperacional,
      juros_recebidos_venda: jurosVendaValor,
      juros_pagos_compra: jurosCompraValor,
      resultado_financeiro_liquido: resultadoFinanceiroLiquido,
      resultado_final_operacao: resultadoFinalOperacao,
      margem_sobre_faturamento_perc: margemSobreReceitaBrutaPerc,
      margem_sobre_custo_compra_perc: margemSobreCustoInvestidoPerc,
    },
  })
})
