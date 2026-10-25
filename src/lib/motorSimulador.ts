/**
 * src/lib/motorSimulador.ts
 *
 * Motor de Cálculo Comercial Canônico do AgroSimulador (Aba "Simulador" do Excel - 53 linhas).
 *
 * Suporta a segregação completa entre:
 * 1. OPERAÇÃO DE COMPRA (Aquisição):
 *    - Data da compra, prazo de pagamento (dias corridos), data de vencimento calculada
 *    - Preço/custo de aquisição unitário (BRL ou USD com PTAX manual)
 *    - Despesas de compra (frete compra CIF/FOB, seguro, outras despesas)
 *    - Tributos de compra / Créditos de entrada (ICMS crédito entrada, PIS/COFINS crédito)
 *    - Taxa de juros da compra (% a.m. ou % no período) e cálculo de juros proporcionais ao prazo
 *    - Produz: CUSTO TOTAL DE AQUISIÇÃO (com e sem juros)
 *
 * 2. OPERAÇÃO DE VENDA (Revenda Comercial):
 *    - Data da venda, prazo de pagamento concedido (dias corridos), data de vencimento calculada
 *    - Preço de venda unitário, faturamento bruto
 *    - Despesas de venda (frete venda CIF/FOB, seguro, outras despesas, comissão de vendas)
 *    - Tributos de venda / Débitos (ICMS débito próprio, diferimento, desonerado, ICMS efetivo, PIS/COFINS Tema 69 STF, IBS/CBS)
 *    - Taxa de juros da venda (% a.m. ou % no período) e juros proporcionais cobrados/embutidos
 *    - Produz: RECEITA BRUTA e RECEITA LÍQUIDA da venda
 *
 * 3. RESULTADO DA OPERAÇÃO:
 *    - Resultado Operacional Bruto (Receita Bruta - Custo de Aquisição)
 *    - Deduções Tributárias Líquidas (Tributos de Venda - Créditos de Compra)
 *    - Margem de Contribuição Operacional (Receita Líquida - Custo Total de Compra - Despesas)
 *    - Resultado Financeiro Segregado: (+/-) Juros da Venda (-) Juros da Compra = Resultado Financeiro Líquido
 *    - RESULTADO FINAL DA OPERAÇÃO (R$ e % sobre faturamento e sobre investimento)
 *    - Memória de cálculo detalhada com blocos segregados de Compra, Venda e Resultado
 */

export type EnquadramentoCliente = 'produtor_rural' | 'revenda' | 'cooperativa' | 'consumidor_final'

export type ModalidadeFrete = 'CIF' | 'FOB'

export interface ProdutoBaseSimulador {
  id?: string
  codigo?: string
  descricao: string
  ncm?: string
  unidade?: string
  tipo_produto?: string
  origem?: string
  embalagem?: string
  principio_ativo?: string
  fabricante?: string
  moeda?: string
  preco_base_sugerido?: number
  gr_trib?: string
  comissao_padrao?: number
  dados_extras?: Record<string, unknown>
}

export interface RegraIcmsSimulador {
  id?: string
  id_regra?: string
  uf_origem: string
  uf_destino: string
  aliquota_icms: number
  reducao_base?: number
  aliquota_efetiva?: number
  diferimento?: boolean
  percentual_diferimento?: number
  fundamentacao_legal?: string
  tipo_operacao?: string
  chave_origem_destino: string
  grupo_tributario_codigo?: string
  grupo_tributario_descricao?: string
  tipo_desonerado?: string
  icms_desonerado?: number
  regra_credito_entrada?: string
  prod_importado?: string
  dados_extras?: Record<string, unknown>
}

// -----------------------------------------------------------------------------
// ENTRADAS DA OPERAÇÃO DE COMPRA
// -----------------------------------------------------------------------------
export interface OperacaoCompraInput {
  // Prazos e Datas
  dataOperacao?: string // 'YYYY-MM-DD'
  prazoDias?: number // Prazo em dias corridos até o vencimento
  dataVencimentoManual?: string // Opcional: sobrescreve o cálculo dataOperacao + prazoDias

  // Custo de Aquisição Unitário
  precoUnitario: number // Na moeda indicada (BRL ou USD)
  moeda?: 'BRL' | 'USD'
  ptaxManual?: number // Cotação PTAX para compra se USD

  // Logística & Despesas de Compra
  modalidadeFrete?: ModalidadeFrete // 'CIF' (incluso) ou 'FOB' (adicional)
  frete?: number
  fretePerc?: number
  usarFretePerc?: boolean
  seguro?: number
  outrasDespesas?: number

  // Tributos / Créditos de Entrada
  ufOrigem?: string // UF do Fornecedor / Fabricante
  ufDestino?: string // UF da Empresa adquirente
  regraIcms?: RegraIcmsSimulador | null
  creditarIcms?: boolean // Se a empresa aproveita crédito de entrada (padrão true no Lucro Real/Presumido c/ débito)
  aliquotaIcmsCreditoManual?: number // % crédito de entrada
  creditarPisCofins?: boolean // Se aproveita crédito de PIS/COFINS (Lucro Real)
  aliquotaPisCreditoManual?: number
  aliquotaCofinsCreditoManual?: number

  // Custos Financeiros / Juros da Compra
  taxaJurosMensalPerc?: number // Taxa % a.m. (base 30 dias)
  taxaJurosPeriodoPerc?: number // Taxa % direta do período
  usarTaxaMensal?: boolean // true = calcula pró-rata dias: (taxa / 30) * prazoDias
}

// -----------------------------------------------------------------------------
// ENTRADAS DA OPERAÇÃO DE VENDA
// -----------------------------------------------------------------------------
export interface OperacaoVendaInput {
  // Prazos e Datas
  dataOperacao?: string // 'YYYY-MM-DD'
  prazoDias?: number // Prazo concedido em dias corridos
  dataVencimentoManual?: string

  // Preço de Venda
  precoUnitario: number
  moeda?: 'BRL' | 'USD'
  ptaxManual?: number

  // Destino e Cliente
  ufOrigem?: string
  ufDestino?: string
  enquadramentoCliente?: EnquadramentoCliente

  // Logística & Despesas de Venda
  modalidadeFrete?: ModalidadeFrete
  frete?: number
  fretePerc?: number
  usarFretePerc?: boolean
  seguro?: number
  outrasDespesas?: number

  // Comercial
  comissaoPerc?: number // % comissão de venda
  margemAlvoPerc?: number // % margem comercial desejada para preço sugerido

  // Tributos de Saída
  regraIcms?: RegraIcmsSimulador | null
  aliquotaPisManual?: number
  aliquotaCofinsManual?: number
  aliquotaIbsManual?: number
  aliquotaCbsManual?: number
  considerarReoneracao2026?: boolean // LC 224/2025
  usarAliquotaReformaPlena?: boolean // CBS 8,8% / IBS 17,7% vs teste 2026

  // Juros / Financiamento da Venda
  taxaJurosMensalPerc?: number // % a.m. cobrado do cliente
  taxaJurosPeriodoPerc?: number
  usarTaxaMensal?: boolean
}

// -----------------------------------------------------------------------------
// ENTRADA COMPLETA DO SIMULADOR
// Suporta a nova estrutura segregada (compra + venda) com retrocompatibilidade
// -----------------------------------------------------------------------------
export interface SimuladorInput {
  // Produto Base
  produto: ProdutoBaseSimulador

  // Volume & Embalagem (compartilhados pelo lote)
  quantidade: number
  unidade?: string
  embalagem?: string
  qtdEmbalagens?: number
  volumePorEmbalagem?: number

  // Operação Segregada de Compra (nova estrutura recomendada)
  compra?: OperacaoCompraInput

  // Operação Segregada de Venda (nova estrutura recomendada)
  venda?: OperacaoVendaInput

  // CAMPOS LEGADOS (mantidos para retrocompatibilidade direta com chamadas antigas):
  ufOrigem?: string
  ufDestino?: string
  enquadramentoCliente?: EnquadramentoCliente
  precoUnitario?: number
  moeda?: 'BRL' | 'USD'
  ptaxManual?: number
  modalidadeFrete?: ModalidadeFrete
  frete?: number
  fretePerc?: number
  usarFretePerc?: boolean
  seguro?: number
  outrasDespesas?: number
  comissaoPerc?: number
  custoFinanceiroPerc?: number
  margemComercialPerc?: number
  regraIcms?: RegraIcmsSimulador | null
  aliquotaPisManual?: number
  aliquotaCofinsManual?: number
  aliquotaIbsManual?: number
  aliquotaCbsManual?: number
  considerarReoneracao2026?: boolean
  usarAliquotaReformaPlena?: boolean

  // Prazos e Datas no nível raiz (se não passados dentro de compra/venda)
  dataCompra?: string
  prazoCompraDias?: number
  taxaJurosCompraPerc?: number
  dataVenda?: string
  prazoVendaDias?: number
  taxaJurosVendaPerc?: number
}

export interface DetalhamentoIcms {
  nome: string
  baseCalculoBruta: number
  baseCalculoEfetiva: number
  aliquotaNominal: number
  aliquotaEfetiva: number
  reducaoBasePerc: number
  debitoIcms: number
  temDiferimento: boolean
  percentualDiferimento: number
  valorDiferimento: number
  tipoDesonerado: string
  valorDesonerado: number
  creditoEntradaPerc: number
  valorCreditoEntrada: number
  icmsEfetivoRecolher: number
  fundamentacao: string
  observacoes?: string
}

export interface DetalhamentoTributo {
  nome: string
  baseCalculo: number
  aliquotaNominal: number
  aliquotaEfetiva: number
  reducaoBasePerc?: number
  valorImposto: number
  fundamentacao: string
  observacoes?: string
}

export interface LinhaDRE {
  descricao: string
  unitario: number
  total: number
  percSobreFaturamento: number
  natureza: 'receita' | 'deducao' | 'custo' | 'despesa' | 'subtotal' | 'resultado'
}

// -----------------------------------------------------------------------------
// RESULTADOS DETALHADOS DAS DUAS PONTAS
// -----------------------------------------------------------------------------
export interface ResultadoCompraSegregada {
  dataOperacao: string
  prazoDias: number
  dataVencimento: string

  ufOrigem: string
  ufDestino: string
  moedaOriginal: 'BRL' | 'USD'
  ptaxAplicada: number
  precoUnitarioOriginal: number
  precoUnitarioReais: number
  valorMercadoriaReais: number

  modalidadeFrete: ModalidadeFrete
  frete: number
  seguro: number
  outrasDespesas: number
  totalDespesasAcessorias: number

  // Juros da Compra
  taxaJurosMensalPerc: number
  taxaJurosEfetivaPerc: number
  jurosValor: number

  // Tributos / Créditos de Entrada
  icmsCreditoAliquota: number
  icmsCreditoValor: number
  pisCreditoAliquota: number
  pisCreditoValor: number
  cofinsCreditoAliquota: number
  cofinsCreditoValor: number
  totalCreditosTributarios: number

  // Custos Finais de Aquisição
  custoAquisicaoMercadoria: number // Valor mercadoria + frete + seguro + outros
  custoAquisicaoLiquidoSemTributos: number // Custo menos créditos fiscais
  custoTotalComJuros: number // Custo com juros financeiros de compra
  custoUnitarioTotal: number // Por unidade de volume
}

export interface ResultadoVendaSegregada {
  dataOperacao: string
  prazoDias: number
  dataVencimento: string

  ufOrigem: string
  ufDestino: string
  operacao: 'Interna' | 'Interestadual'
  enquadramentoCliente: EnquadramentoCliente

  moedaOriginal: 'BRL' | 'USD'
  ptaxAplicada: number
  precoUnitarioOriginal: number
  precoUnitarioReais: number
  valorMercadoriaReais: number

  modalidadeFrete: ModalidadeFrete
  frete: number
  seguro: number
  outrasDespesas: number
  totalDespesasAcessorias: number

  // Comercial
  comissaoPerc: number
  comissaoValor: number

  // Juros / Financiamento Concedido
  taxaJurosMensalPerc: number
  taxaJurosEfetivaPerc: number
  jurosValor: number

  // Tributos destacados
  icms: DetalhamentoIcms
  pis: DetalhamentoTributo
  cofins: DetalhamentoTributo
  ibs: DetalhamentoTributo
  cbs: DetalhamentoTributo
  totalTributos: number
  cargaTributariaEfetivaPerc: number

  // Faturamento e Receita Líquida
  faturamentoBrutoMercadoria: number
  faturamentoBrutoTotal: number // Com frete CIF e acréscimos
  receitaLiquida: number // Bruto - deduções tributárias
}

export interface ResultadoOperacaoConsolidado {
  receitaBruta: number
  faturamentoComJurosVenda: number
  custoAquisicaoTotal: number
  custoAquisicaoComJuros: number

  // Tributos
  tributosVenda: number
  creditosCompra: number
  tributacaoLiquida: number

  // Despesas Comerciais e Logísticas
  despesasOperacionaisVenda: number // frete CIF venda + seguro + comissão
  despesasOperacionaisCompra: number // frete compra + outros compra

  // Resultado Financeiro
  jurosRecebidosVenda: number
  jurosPagosCompra: number
  resultadoFinanceiroLiquido: number // juros venda - juros compra

  // Margens e Resultados
  resultadoOperacionalBruto: number // Receita Líquida - Custo de Aquisição Líquido
  resultadoOperacionalLiquido: number // Após comissões e despesas de venda
  resultadoFinalOperacao: number // Após resultado financeiro dos juros
  resultadoFinalUnitario: number
  margemSobreReceitaBrutaPerc: number
  margemSobreReceitaLiquidaPerc: number
  margemSobreCustoInvestidoPerc: number // ROI sobre o desembolso da compra
}

export interface SimuladorResultado {
  // Identificação do Produto e Operação
  produtoNome: string
  codigoProduto: string
  ncm: string
  unidade: string
  embalagem: string
  origem: string
  grTrib: string
  ufOrigem: string
  ufDestino: string
  operacao: 'Interna' | 'Interestadual'
  isImportado: boolean
  enquadramentoCliente: EnquadramentoCliente

  // Embalagens e Volume
  quantidade: number
  qtdEmbalagens: number
  volumePorEmbalagem: number
  volumeTotal: number

  // Câmbio (Venda / Geral)
  moedaOriginal: 'BRL' | 'USD'
  ptaxAplicada: number
  valorUnitarioOriginal: number
  valorUnitarioReais: number

  // Faturamento e Mercadoria
  valorMercadoriaOriginal: number
  valorMercadoriaReais: number

  // Logística & Despesas (Venda)
  modalidadeFrete: ModalidadeFrete
  frete: number
  seguro: number
  outrasDespesas: number
  totalDespesasAcessorias: number
  baseOperacaoComercial: number

  // Comercial & Financeiro (Venda)
  comissaoPerc: number
  comissaoValor: number
  custoFinanceiroPerc: number
  custoFinanceiroValor: number

  // Tributos destacados da Venda
  icms: DetalhamentoIcms
  temRegraIcms: boolean
  statusRegraIcms?: 'exata_grtrib' | 'fallback_uf' | 'sem_regra'
  avisoIcms?: string

  pis: DetalhamentoTributo
  cofins: DetalhamentoTributo
  ibs: DetalhamentoTributo
  cbs: DetalhamentoTributo

  totalTributos: number
  cargaTributariaEfetivaPerc: number

  // DRE / Cascata de Preço (3 Colunas)
  dre: LinhaDRE[]
  receitaBruta: number
  deducoesTributarias: number
  receitaLiquida: number
  custosEDespesas: number
  margemContribuicaoValor: number
  margemContribuicaoPercSobreFaturamento: number
  margemContribuicaoPercSobreReceitaLiquida: number

  // Preços e Markup
  markupMultiplicador: number
  precoMinimoBreakEven: number
  precoVendaSugerido: number
  precoVendaSugeridoUnitario: number

  // ---------------------------------------------------------------------------
  // NOVOS BLOCOS SEGREGADOS (Exigência do usuário para paridade com a planilha)
  // ---------------------------------------------------------------------------
  compra: ResultadoCompraSegregada
  venda: ResultadoVendaSegregada
  resultadoOperacao: ResultadoOperacaoConsolidado

  // Auditoria
  alertas: string[]
  memoriaCalculo: string[]
}

// -----------------------------------------------------------------------------
// UTILITÁRIOS DE DATA E JUROS
// -----------------------------------------------------------------------------

/**
 * Formata ou valida string de data YYYY-MM-DD
 */
export function formatarDataIso(data?: string | Date): string {
  if (!data) {
    const hoje = new Date()
    return hoje.toISOString().split('T')[0]
  }
  if (data instanceof Date) {
    return data.toISOString().split('T')[0]
  }
  const limpa = String(data).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpa)) return limpa
  const d = new Date(limpa)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }
  return new Date().toISOString().split('T')[0]
}

/**
 * Adiciona dias corridos a uma data no formato YYYY-MM-DD
 */
export function calcularDataVencimento(dataInicioIso: string, diasCorridos: number): string {
  const [ano, mes, dia] = dataInicioIso.split('-').map(Number)
  const d = new Date(ano, (mes || 1) - 1, dia || 1)
  d.setDate(d.getDate() + Math.max(0, Math.round(diasCorridos)))
  const a = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dt = String(d.getDate()).padStart(2, '0')
  return `${a}-${m}-${dt}`
}

/**
 * Calcula a taxa de juros efetiva proporcional aos dias corridos (base pró-rata mês comercial 30 dias)
 * Conforme convenção de planilhas de crédito comercial do agro:
 * taxa_periodo = (taxa_mensal / 30) * dias_corridos
 */
export function calcularTaxaJurosProporcional(
  taxaMensalPerc: number,
  prazoDias: number,
  taxaPeriodoDireta?: number,
  usarTaxaMensal: boolean = true,
): { taxaEfetivaPerc: number; jurosCalculadosSobreValor: (base: number) => number } {
  let taxaEfetivaPerc = 0

  if (!usarTaxaMensal && taxaPeriodoDireta !== undefined && taxaPeriodoDireta > 0) {
    taxaEfetivaPerc = taxaPeriodoDireta
  } else if (taxaMensalPerc > 0 && prazoDias > 0) {
    taxaEfetivaPerc = (taxaMensalPerc / 30) * prazoDias
  } else if (taxaMensalPerc > 0 && prazoDias === 0) {
    taxaEfetivaPerc = 0 // À vista: sem juros de prazo
  } else if (taxaPeriodoDireta !== undefined && taxaPeriodoDireta > 0) {
    taxaEfetivaPerc = taxaPeriodoDireta
  }

  return {
    taxaEfetivaPerc,
    jurosCalculadosSobreValor: (base: number) => base * (taxaEfetivaPerc / 100),
  }
}

/**
 * Tenta extrair a capacidade numérica da embalagem (ex: "4X5L" -> 20L, "Saco 20 kg" -> 20, "Bombona 20 L" -> 20)
 */
export function deduzirCapacidadeEmbalagem(textoEmbalagem?: string): number {
  if (!textoEmbalagem) return 1
  const t = textoEmbalagem.trim().toUpperCase()

  // Formato multix: 4X5L -> 20, 2X10L -> 20, 12X1L -> 12, 1X20L -> 20
  const multiMatch = t.match(/(\d+)\s*[X*]\s*([\d,.]+)/)
  if (multiMatch) {
    const qtd = parseFloat(multiMatch[1])
    const vol = parseFloat(multiMatch[2].replace(',', '.'))
    if (!isNaN(qtd) && !isNaN(vol) && qtd > 0 && vol > 0) {
      return qtd * vol
    }
  }

  // Formato direto: 20L, 200L, 20 KG, 1000L
  const numMatch = t.match(/([\d,.]+)\s*(L|KG|G|ML|SC|UN)/)
  if (numMatch) {
    const v = parseFloat(numMatch[1].replace(',', '.'))
    if (!isNaN(v) && v > 0) return v
  }

  return 1
}

// -----------------------------------------------------------------------------
// MOTOR PRINCIPAL DE CÁLCULO
// -----------------------------------------------------------------------------
export function executarCalculoSimulador(input: SimuladorInput): SimuladorResultado {
  const alertas: string[] = []
  const memoriaCalculo: string[] = []

  const produto = input.produto
  const desc = produto.descricao || 'Produto Base'
  const cod = produto.codigo || 'S/C'
  const ncm = produto.ncm || '3808.93.29'
  const unid = input.unidade || produto.unidade || 'L'
  const emb = input.embalagem || produto.embalagem || 'Padrão'
  const grTrib = (produto.gr_trib || '').trim()

  // 1. Quantidade e Volume da Simulação (Lote)
  const qtdInformada = Math.max(0, Number(input.quantidade) || 0)
  const volumePorEmb =
    input.volumePorEmbalagem !== undefined && input.volumePorEmbalagem > 0
      ? input.volumePorEmbalagem
      : deduzirCapacidadeEmbalagem(emb)

  let qtdEmbalagens = input.qtdEmbalagens || 0
  let volumeTotal = qtdInformada

  if (qtdEmbalagens > 0 && volumePorEmb > 0 && qtdInformada <= 0) {
    volumeTotal = qtdEmbalagens * volumePorEmb
  } else if (volumePorEmb > 0 && qtdInformada > 0) {
    qtdEmbalagens = Math.ceil(qtdInformada / volumePorEmb)
    volumeTotal = qtdInformada
  } else {
    qtdEmbalagens = qtdInformada
    volumeTotal = qtdInformada
  }

  // 2. Resolução de Parâmetros de COMPRA
  const compraIn: OperacaoCompraInput = input.compra || { precoUnitario: 0 }
  const dataCompraIso = formatarDataIso(compraIn.dataOperacao || input.dataCompra)
  const prazoCompraDias =
    compraIn.prazoDias !== undefined
      ? Math.max(0, Number(compraIn.prazoDias))
      : input.prazoCompraDias !== undefined
        ? Math.max(0, Number(input.prazoCompraDias))
        : 30
  const dataVencimentoCompraIso =
    compraIn.dataVencimentoManual || calcularDataVencimento(dataCompraIso, prazoCompraDias)

  const taxaJurosCompraMensal =
    compraIn.taxaJurosMensalPerc !== undefined
      ? Number(compraIn.taxaJurosMensalPerc)
      : input.taxaJurosCompraPerc !== undefined
        ? Number(input.taxaJurosCompraPerc)
        : 0
  const usarTaxaMensalCompra = compraIn.usarTaxaMensal !== false
  const { taxaEfetivaPerc: taxaEfetivaCompraPerc, jurosCalculadosSobreValor: calcularJurosCompra } =
    calcularTaxaJurosProporcional(
      taxaJurosCompraMensal,
      prazoCompraDias,
      compraIn.taxaJurosPeriodoPerc,
      usarTaxaMensalCompra,
    )

  const precoUnitarioCompra =
    compraIn.precoUnitario !== undefined
      ? Math.max(0, Number(compraIn.precoUnitario))
      : produto.preco_base_sugerido !== undefined && produto.preco_base_sugerido > 0
        ? Number(produto.preco_base_sugerido)
        : Number(input.precoUnitario) || 0

  const moedaCompra = compraIn.moeda || (produto.moeda?.toUpperCase() === 'USD' ? 'USD' : 'BRL')
  const isCompraImportada =
    moedaCompra === 'USD' ||
    produto.origem?.toLowerCase().includes('imp') ||
    desc.toUpperCase().includes('(IMP)')
  const ptaxCompra =
    compraIn.ptaxManual || (isCompraImportada ? Number(input.ptaxManual) || 1.0 : 1.0)
  const precoUnitarioCompraReais =
    moedaCompra === 'USD' ? precoUnitarioCompra * ptaxCompra : precoUnitarioCompra

  const valorMercadoriaCompraReais = volumeTotal * precoUnitarioCompraReais
  const modalidadeFreteCompra = compraIn.modalidadeFrete || 'FOB'
  let freteCompraReais = Math.max(0, Number(compraIn.frete) || 0)
  if (compraIn.usarFretePerc && compraIn.fretePerc !== undefined && compraIn.fretePerc > 0) {
    freteCompraReais = valorMercadoriaCompraReais * (compraIn.fretePerc / 100)
  }
  const seguroCompra = Math.max(0, Number(compraIn.seguro) || 0)
  const outrasDespesasCompra = Math.max(0, Number(compraIn.outrasDespesas) || 0)
  const totalDespesasCompra = freteCompraReais + seguroCompra + outrasDespesasCompra
  const custoAquisicaoMercadoria = valorMercadoriaCompraReais + totalDespesasCompra

  // Créditos Tributários na Entrada (Compra)
  // Regra ICMS na entrada: alíquota de crédito (geralmente alíquota interestadual 4%, 7%, 12% ou regra específica)
  let icmsCreditoAliq = 0
  if (compraIn.aliquotaIcmsCreditoManual !== undefined) {
    icmsCreditoAliq = Number(compraIn.aliquotaIcmsCreditoManual)
  } else if (compraIn.regraIcms) {
    icmsCreditoAliq =
      Number(compraIn.regraIcms.aliquota_efetiva ?? compraIn.regraIcms.aliquota_icms) || 0
  } else if (compraIn.creditarIcms !== false) {
    // Estimativa padrão de crédito de entrada para produtos agropecuários (alíquota efetiva de entrada)
    icmsCreditoAliq = 4.0
  }
  const baseCreditoIcms =
    modalidadeFreteCompra === 'CIF' ? custoAquisicaoMercadoria : valorMercadoriaCompraReais
  const icmsCreditoValor = baseCreditoIcms * (icmsCreditoAliq / 100)

  // Crédito PIS/COFINS na entrada
  const pisCreditoAliq =
    compraIn.aliquotaPisCreditoManual !== undefined
      ? Number(compraIn.aliquotaPisCreditoManual)
      : compraIn.creditarPisCofins
        ? 0.165
        : 0
  const cofinsCreditoAliq =
    compraIn.aliquotaCofinsCreditoManual !== undefined
      ? Number(compraIn.aliquotaCofinsCreditoManual)
      : compraIn.creditarPisCofins
        ? 0.76
        : 0
  const pisCreditoValor = custoAquisicaoMercadoria * (pisCreditoAliq / 100)
  const cofinsCreditoValor = custoAquisicaoMercadoria * (cofinsCreditoAliq / 100)
  const totalCreditosTributarios = icmsCreditoValor + pisCreditoValor + cofinsCreditoValor

  const custoAquisicaoLiquidoSemTributos = Math.max(
    0,
    custoAquisicaoMercadoria - totalCreditosTributarios,
  )

  // Juros de Compra (calculados sobre o valor financiado da aquisição)
  const jurosCompraValor = calcularJurosCompra(custoAquisicaoMercadoria)
  const custoTotalCompraComJuros = custoAquisicaoMercadoria + jurosCompraValor
  const custoUnitarioTotalCompra = volumeTotal > 0 ? custoTotalCompraComJuros / volumeTotal : 0

  const blocoCompra: ResultadoCompraSegregada = {
    dataOperacao: dataCompraIso,
    prazoDias: prazoCompraDias,
    dataVencimento: dataVencimentoCompraIso,
    ufOrigem: compraIn.ufOrigem || 'SP',
    ufDestino: compraIn.ufDestino || 'SP',
    moedaOriginal: moedaCompra,
    ptaxAplicada: ptaxCompra,
    precoUnitarioOriginal: precoUnitarioCompra,
    precoUnitarioReais: precoUnitarioCompraReais,
    valorMercadoriaReais: valorMercadoriaCompraReais,
    modalidadeFrete: modalidadeFreteCompra,
    frete: freteCompraReais,
    seguro: seguroCompra,
    outrasDespesas: outrasDespesasCompra,
    totalDespesasAcessorias: totalDespesasCompra,
    taxaJurosMensalPerc: taxaJurosCompraMensal,
    taxaJurosEfetivaPerc: taxaEfetivaCompraPerc,
    jurosValor: jurosCompraValor,
    icmsCreditoAliquota: icmsCreditoAliq,
    icmsCreditoValor: icmsCreditoValor,
    pisCreditoAliquota: pisCreditoAliq,
    pisCreditoValor: pisCreditoValor,
    cofinsCreditoAliquota: cofinsCreditoAliq,
    cofinsCreditoValor: cofinsCreditoValor,
    totalCreditosTributarios,
    custoAquisicaoMercadoria,
    custoAquisicaoLiquidoSemTributos,
    custoTotalComJuros: custoTotalCompraComJuros,
    custoUnitarioTotal: custoUnitarioTotalCompra,
  }

  // 3. Resolução de Parâmetros de VENDA
  const vendaIn: OperacaoVendaInput = input.venda || { precoUnitario: 0 }
  const dataVendaIso = formatarDataIso(vendaIn.dataOperacao || input.dataVenda)
  const prazoVendaDias =
    vendaIn.prazoDias !== undefined
      ? Math.max(0, Number(vendaIn.prazoDias))
      : input.prazoVendaDias !== undefined
        ? Math.max(0, Number(input.prazoVendaDias))
        : 60
  const dataVencimentoVendaIso =
    vendaIn.dataVencimentoManual || calcularDataVencimento(dataVendaIso, prazoVendaDias)

  const taxaJurosVendaMensal =
    vendaIn.taxaJurosMensalPerc !== undefined
      ? Number(vendaIn.taxaJurosMensalPerc)
      : input.taxaJurosVendaPerc !== undefined
        ? Number(input.taxaJurosVendaPerc)
        : input.custoFinanceiroPerc !== undefined
          ? Number(input.custoFinanceiroPerc)
          : 1.5
  const usarTaxaMensalVenda = vendaIn.usarTaxaMensal !== false
  const { taxaEfetivaPerc: taxaEfetivaVendaPerc, jurosCalculadosSobreValor: calcularJurosVenda } =
    calcularTaxaJurosProporcional(
      taxaJurosVendaMensal,
      prazoVendaDias,
      vendaIn.taxaJurosPeriodoPerc,
      usarTaxaMensalVenda,
    )

  const precoUnitarioVenda =
    vendaIn.precoUnitario !== undefined
      ? Math.max(0, Number(vendaIn.precoUnitario))
      : input.precoUnitario !== undefined
        ? Number(input.precoUnitario)
        : precoUnitarioCompraReais * 1.15

  const moedaVenda = vendaIn.moeda || input.moeda || 'BRL'
  const isVendaImportada =
    moedaVenda === 'USD' ||
    produto.origem?.toLowerCase().includes('imp') ||
    desc.toUpperCase().includes('(IMP)')
  const ptaxVenda = vendaIn.ptaxManual || (isVendaImportada ? Number(input.ptaxManual) || 1.0 : 1.0)
  const precoUnitarioVendaReais =
    moedaVenda === 'USD' ? precoUnitarioVenda * ptaxVenda : precoUnitarioVenda

  const valorMercadoriaVendaReais = volumeTotal * precoUnitarioVendaReais
  const modalidadeFreteVenda = vendaIn.modalidadeFrete || input.modalidadeFrete || 'CIF'
  let freteVendaReais =
    vendaIn.frete !== undefined
      ? Math.max(0, Number(vendaIn.frete))
      : Math.max(0, Number(input.frete) || 0)
  if (
    (vendaIn.usarFretePerc && vendaIn.fretePerc !== undefined && vendaIn.fretePerc > 0) ||
    (input.usarFretePerc && input.fretePerc !== undefined && input.fretePerc > 0)
  ) {
    const pFrete = vendaIn.fretePerc ?? input.fretePerc ?? 0
    freteVendaReais = valorMercadoriaVendaReais * (pFrete / 100)
  }
  const seguroVenda =
    vendaIn.seguro !== undefined
      ? Math.max(0, Number(vendaIn.seguro))
      : Math.max(0, Number(input.seguro) || 0)
  const outrasDespesasVenda =
    vendaIn.outrasDespesas !== undefined
      ? Math.max(0, Number(vendaIn.outrasDespesas))
      : Math.max(0, Number(input.outrasDespesas) || 0)
  const totalDespesasVenda = freteVendaReais + seguroVenda + outrasDespesasVenda

  const freteNaBaseIcmsVenda = modalidadeFreteVenda === 'CIF' ? freteVendaReais : 0
  const baseCalculoBrutaIcmsVenda =
    valorMercadoriaVendaReais + freteNaBaseIcmsVenda + seguroVenda + outrasDespesasVenda
  const baseOperacaoComercialVenda = valorMercadoriaVendaReais + totalDespesasVenda

  // Localização geográfica e enquadramento da venda
  const ufOrigemVenda = (vendaIn.ufOrigem || input.ufOrigem || 'SP').trim().toUpperCase()
  const ufDestinoVenda = (vendaIn.ufDestino || input.ufDestino || 'MT').trim().toUpperCase()
  const operacaoVenda: 'Interna' | 'Interestadual' =
    ufOrigemVenda === ufDestinoVenda ? 'Interna' : 'Interestadual'
  const enquadramentoCliente =
    vendaIn.enquadramentoCliente || input.enquadramentoCliente || 'produtor_rural'

  // Regra ICMS na Saída (Venda)
  const regraIcmsVenda = vendaIn.regraIcms !== undefined ? vendaIn.regraIcms : input.regraIcms
  let temRegraIcms = false
  let statusRegraIcms: 'exata_grtrib' | 'fallback_uf' | 'sem_regra' = 'sem_regra'
  let avisoIcms: string | undefined

  let aliqNominal = 0
  let redBasePerc = 0
  let aliqEfetiva = 0
  let diferimento = false
  let percDif = 0
  let tipoDesonerado = 'Não Calcula'
  let icmsDesoneradoTaxa = 0
  let regraCreditoEntrada = ''
  let fundamentacaoLegal = ''

  if (regraIcmsVenda) {
    const r = regraIcmsVenda
    const regraGrTrib = (r.grupo_tributario_codigo || '').trim()

    if (grTrib && regraGrTrib && grTrib === regraGrTrib) {
      statusRegraIcms = 'exata_grtrib'
      temRegraIcms = true
    } else if (!grTrib && regraGrTrib) {
      statusRegraIcms = 'fallback_uf'
      temRegraIcms = true
      alertas.push(
        `Produto sem Grupo Tributário (GrTrib). Aplicada regra da UF com GrTrib ${regraGrTrib}.`,
      )
    } else if (grTrib && !regraGrTrib) {
      statusRegraIcms = 'fallback_uf'
      temRegraIcms = true
      alertas.push(
        `Sem regra específica para GrTrib "${grTrib}" em ${ufOrigemVenda} → ${ufDestinoVenda}. Aplicada regra geral da UF.`,
      )
    } else if (grTrib && regraGrTrib && grTrib !== regraGrTrib) {
      statusRegraIcms = 'fallback_uf'
      temRegraIcms = true
      alertas.push(
        `Atenção: Produto é GrTrib "${grTrib}", mas a regra aplicada pertence a GrTrib "${regraGrTrib}" para ${ufOrigemVenda} → ${ufDestinoVenda}.`,
      )
    } else {
      statusRegraIcms = 'fallback_uf'
      temRegraIcms = true
    }

    aliqNominal = Number(r.aliquota_icms) || 0
    redBasePerc = Number(r.reducao_base) || 0
    diferimento = !!r.diferimento
    percDif = Number(r.percentual_diferimento) || (diferimento ? 100 : 0)
    aliqEfetiva =
      r.aliquota_efetiva !== undefined && r.aliquota_efetiva !== null
        ? Number(r.aliquota_efetiva)
        : aliqNominal * (1 - redBasePerc / 100)

    tipoDesonerado = r.tipo_desonerado || 'Não Calcula'
    icmsDesoneradoTaxa = Number(r.icms_desonerado) || 0
    regraCreditoEntrada = r.regra_credito_entrada || 'Crédito Proporcional à Saída'
    fundamentacaoLegal =
      r.fundamentacao_legal ||
      (operacaoVenda === 'Interna'
        ? `Operação Interna ${ufOrigemVenda}`
        : `Convênio ICMS 100/97 e alterações (${ufOrigemVenda} → ${ufDestinoVenda})`)
  } else {
    temRegraIcms = false
    statusRegraIcms = 'sem_regra'
    avisoIcms = `Sem regra de ICMS para origem ${ufOrigemVenda} → destino ${ufDestinoVenda}${grTrib ? ` (GrTrib ${grTrib})` : ''}. Aplicada alíquota interestadual padrão estimada.`
    alertas.push(avisoIcms)

    const aliqPadrao =
      operacaoVenda === 'Interna'
        ? 18
        : ['SP', 'RJ', 'MG', 'PR', 'RS', 'SC'].includes(ufOrigemVenda) &&
            !['SP', 'RJ', 'MG', 'PR', 'RS', 'SC'].includes(ufDestinoVenda)
          ? 7
          : 12
    aliqNominal = aliqPadrao
    aliqEfetiva = aliqPadrao
    fundamentacaoLegal =
      'Alíquota padrão interestadual estimada (sem regra cadastrada origem→destino)'
  }

  // Base efetiva de cálculo do ICMS
  const baseCalculoEfetivaIcms = baseCalculoBrutaIcmsVenda * (1 - redBasePerc / 100)
  const debitoIcms = baseCalculoEfetivaIcms * (aliqNominal / 100)

  // Diferimento
  let valorDiferimento = 0
  if (diferimento || percDif > 0) {
    valorDiferimento = debitoIcms * (percDif / 100)
  }

  // ICMS Desonerado
  let valorDesonerado = 0
  if (tipoDesonerado.toLowerCase().includes('desconta') || icmsDesoneradoTaxa > 0) {
    const taxaDeson = icmsDesoneradoTaxa > 0 ? icmsDesoneradoTaxa : aliqNominal - aliqEfetiva
    if (taxaDeson > 0) {
      valorDesonerado = baseCalculoBrutaIcmsVenda * (taxaDeson / 100)
    }
  }

  // Crédito de Entrada / Presumido aplicado no débito de ICMS
  let creditoEntradaPerc = 0
  let valorCreditoEntrada = 0
  if (regraCreditoEntrada.toLowerCase().includes('presumido')) {
    creditoEntradaPerc = aliqEfetiva * 0.5
    valorCreditoEntrada = baseCalculoEfetivaIcms * (creditoEntradaPerc / 100)
  }

  // ICMS efetivo a recolher
  const icmsEfetivoRecolher = Math.max(
    0,
    debitoIcms -
      valorDiferimento -
      valorCreditoEntrada -
      (tipoDesonerado.toLowerCase().includes('desconta') ? valorDesonerado : 0),
  )

  const icmsDetalhe: DetalhamentoIcms = {
    nome: 'ICMS',
    baseCalculoBruta: baseCalculoBrutaIcmsVenda,
    baseCalculoEfetiva: baseCalculoEfetivaIcms,
    aliquotaNominal: aliqNominal,
    aliquotaEfetiva: aliqEfetiva,
    reducaoBasePerc: redBasePerc,
    debitoIcms,
    temDiferimento: diferimento || percDif > 0,
    percentualDiferimento: percDif,
    valorDiferimento,
    tipoDesonerado,
    valorDesonerado,
    creditoEntradaPerc,
    valorCreditoEntrada,
    icmsEfetivoRecolher,
    fundamentacao: fundamentacaoLegal,
    observacoes: diferimento
      ? `Diferimento de ${percDif}% aplicado`
      : redBasePerc > 0
        ? `Redução de base de ${redBasePerc}%`
        : 'Tributação normal',
  }

  // PIS / COFINS (Tema 69 do STF - Exclusão do ICMS)
  const basePisCofinsComExclusaoStf = Math.max(0, baseOperacaoComercialVenda - icmsEfetivoRecolher)

  const considerarReoneracao =
    vendaIn.considerarReoneracao2026 !== undefined
      ? vendaIn.considerarReoneracao2026
      : input.considerarReoneracao2026 !== false
  const aliqPisPadrao =
    vendaIn.aliquotaPisManual !== undefined
      ? vendaIn.aliquotaPisManual
      : input.aliquotaPisManual !== undefined
        ? input.aliquotaPisManual
        : considerarReoneracao
          ? 0.165
          : 0.0

  const aliqCofinsPadrao =
    vendaIn.aliquotaCofinsManual !== undefined
      ? vendaIn.aliquotaCofinsManual
      : input.aliquotaCofinsManual !== undefined
        ? input.aliquotaCofinsManual
        : considerarReoneracao
          ? 0.76
          : 0.0

  const valorPis = basePisCofinsComExclusaoStf * (aliqPisPadrao / 100)
  const valorCofins = basePisCofinsComExclusaoStf * (aliqCofinsPadrao / 100)

  const pisDetalhe: DetalhamentoTributo = {
    nome: 'PIS',
    baseCalculo: basePisCofinsComExclusaoStf,
    aliquotaNominal: aliqPisPadrao,
    aliquotaEfetiva: aliqPisPadrao,
    valorImposto: valorPis,
    fundamentacao: considerarReoneracao
      ? 'LC 224/2025: reoneração linear de 10% do PIS (0,165% no Lucro Real pós-Abr/2026)'
      : 'Lei 10.925/2004: benefício de alíquota zero para insumos agropecuários',
    observacoes: 'Base com exclusão do ICMS destacado (Tema 69 STF)',
  }

  const cofinsDetalhe: DetalhamentoTributo = {
    nome: 'COFINS',
    baseCalculo: basePisCofinsComExclusaoStf,
    aliquotaNominal: aliqCofinsPadrao,
    aliquotaEfetiva: aliqCofinsPadrao,
    valorImposto: valorCofins,
    fundamentacao: considerarReoneracao
      ? 'LC 224/2025: reoneração linear de 10% da COFINS (0,760% no Lucro Real pós-Abr/2026)'
      : 'Lei 10.925/2004: benefício de alíquota zero para insumos agropecuários',
    observacoes: 'Base com exclusão do ICMS destacado (Tema 69 STF)',
  }

  // IBS / CBS (LC 214/2025 com redução de 60%)
  const usarPlena = !!(vendaIn.usarAliquotaReformaPlena ?? input.usarAliquotaReformaPlena)
  const aliqIbsNominal =
    vendaIn.aliquotaIbsManual !== undefined
      ? vendaIn.aliquotaIbsManual
      : input.aliquotaIbsManual !== undefined
        ? input.aliquotaIbsManual
        : usarPlena
          ? 17.7
          : 0.1
  const aliqCbsNominal =
    vendaIn.aliquotaCbsManual !== undefined
      ? vendaIn.aliquotaCbsManual
      : input.aliquotaCbsManual !== undefined
        ? input.aliquotaCbsManual
        : usarPlena
          ? 8.8
          : 0.9

  const reducaoReformaPerc = 60
  const aliqIbsEfetiva = aliqIbsNominal * (1 - reducaoReformaPerc / 100)
  const aliqCbsEfetiva = aliqCbsNominal * (1 - reducaoReformaPerc / 100)
  const baseCalculoIbsCbs = baseOperacaoComercialVenda * (1 - reducaoReformaPerc / 100)
  const valorIbs = baseCalculoIbsCbs * (aliqIbsNominal / 100)
  const valorCbs = baseCalculoIbsCbs * (aliqCbsNominal / 100)

  const ibsDetalhe: DetalhamentoTributo = {
    nome: 'IBS (Reforma)',
    baseCalculo: baseCalculoIbsCbs,
    aliquotaNominal: aliqIbsNominal,
    aliquotaEfetiva: aliqIbsEfetiva,
    reducaoBasePerc: reducaoReformaPerc,
    valorImposto: valorIbs,
    fundamentacao: 'LC 214/2025 Art. 138 e Anexo IX (Redução de 60% para insumos agropecuários)',
    observacoes: `Nominal ${aliqIbsNominal}% reduzida em 60% → Efetiva ${aliqIbsEfetiva.toFixed(3)}%`,
  }

  const cbsDetalhe: DetalhamentoTributo = {
    nome: 'CBS (Reforma)',
    baseCalculo: baseCalculoIbsCbs,
    aliquotaNominal: aliqCbsNominal,
    aliquotaEfetiva: aliqCbsEfetiva,
    reducaoBasePerc: reducaoReformaPerc,
    valorImposto: valorCbs,
    fundamentacao: 'LC 214/2025 Art. 138 e Anexo IX (Redução de 60% para insumos agropecuários)',
    observacoes: `Nominal ${aliqCbsNominal}% reduzida em 60% → Efetiva ${aliqCbsEfetiva.toFixed(3)}%`,
  }

  const totalTributosVenda = icmsEfetivoRecolher + valorPis + valorCofins + valorIbs + valorCbs
  const cargaTributariaEfetivaPerc =
    baseOperacaoComercialVenda > 0 ? (totalTributosVenda / baseOperacaoComercialVenda) * 100 : 0

  // Comissão de Venda
  const comissaoPadraoPerc =
    produto.comissao_padrao !== undefined && produto.comissao_padrao !== null
      ? Number(produto.comissao_padrao) * (produto.comissao_padrao < 1 ? 100 : 1)
      : 2.5
  const comissaoPerc =
    vendaIn.comissaoPerc !== undefined
      ? Number(vendaIn.comissaoPerc)
      : input.comissaoPerc !== undefined
        ? Number(input.comissaoPerc)
        : comissaoPadraoPerc
  const comissaoValor = baseOperacaoComercialVenda * (comissaoPerc / 100)

  // Juros da Venda (financiamento concedido ao cliente)
  const jurosVendaValor = calcularJurosVenda(baseOperacaoComercialVenda)
  const receitaBrutaVenda = baseOperacaoComercialVenda
  const receitaLiquidaVenda = receitaBrutaVenda - totalTributosVenda

  const blocoVenda: ResultadoVendaSegregada = {
    dataOperacao: dataVendaIso,
    prazoDias: prazoVendaDias,
    dataVencimento: dataVencimentoVendaIso,
    ufOrigem: ufOrigemVenda,
    ufDestino: ufDestinoVenda,
    operacao: operacaoVenda,
    enquadramentoCliente,
    moedaOriginal: moedaVenda,
    ptaxAplicada: ptaxVenda,
    precoUnitarioOriginal: precoUnitarioVenda,
    precoUnitarioReais: precoUnitarioVendaReais,
    valorMercadoriaReais: valorMercadoriaVendaReais,
    modalidadeFrete: modalidadeFreteVenda,
    frete: freteVendaReais,
    seguro: seguroVenda,
    outrasDespesas: outrasDespesasVenda,
    totalDespesasAcessorias: totalDespesasVenda,
    comissaoPerc,
    comissaoValor,
    taxaJurosMensalPerc: taxaJurosVendaMensal,
    taxaJurosEfetivaPerc: taxaEfetivaVendaPerc,
    jurosValor: jurosVendaValor,
    icms: icmsDetalhe,
    pis: pisDetalhe,
    cofins: cofinsDetalhe,
    ibs: ibsDetalhe,
    cbs: cbsDetalhe,
    totalTributos: totalTributosVenda,
    cargaTributariaEfetivaPerc,
    faturamentoBrutoMercadoria: valorMercadoriaVendaReais,
    faturamentoBrutoTotal: baseOperacaoComercialVenda,
    receitaLiquida: receitaLiquidaVenda,
  }

  // 4. CONSOLIDAÇÃO DO RESULTADO DA OPERAÇÃO (COMPRA × VENDA)
  // Tributação líquida = tributos de saída (venda) - créditos fiscais de entrada (compra)
  const tributacaoLiquida = Math.max(0, totalTributosVenda - totalCreditosTributarios)

  // Custos e Despesas Operacionais da Venda
  const despesasOperacionaisVenda =
    (modalidadeFreteVenda === 'CIF' ? freteVendaReais : 0) +
    seguroVenda +
    outrasDespesasVenda +
    comissaoValor

  // Despesas Operacionais de Compra
  const despesasOperacionaisCompra = totalDespesasCompra

  // Custo base de aquisição (CMV de referência)
  const custoAquisicaoBase = valorMercadoriaCompraReais + despesasOperacionaisCompra

  // Resultado Operacional Bruto = Receita Líquida - Custo de Aquisição Base
  const resultadoOperacionalBruto = receitaLiquidaVenda - custoAquisicaoBase

  // Margem de Contribuição Operacional = Resultado Bruto - Despesas Operacionais de Venda
  const margemContribuicaoOperacional = resultadoOperacionalBruto - despesasOperacionaisVenda

  // Resultado Financeiro Líquido = (+ Juros Cobrados na Venda) - (Juros Pagos na Compra)
  const resultadoFinanceiroLiquido = jurosVendaValor - jurosCompraValor

  // RESULTADO FINAL DA OPERAÇÃO = Margem de Contribuição Operacional + Resultado Financeiro Líquido
  const resultadoFinalOperacao = margemContribuicaoOperacional + resultadoFinanceiroLiquido
  const resultadoFinalUnitario = volumeTotal > 0 ? resultadoFinalOperacao / volumeTotal : 0

  const faturamentoComJurosVenda = receitaBrutaVenda + jurosVendaValor
  const custoAquisicaoComJuros = custoAquisicaoBase + jurosCompraValor

  const margemSobreReceitaBrutaPerc =
    receitaBrutaVenda > 0 ? (resultadoFinalOperacao / receitaBrutaVenda) * 100 : 0
  const margemSobreReceitaLiquidaPerc =
    receitaLiquidaVenda > 0 ? (resultadoFinalOperacao / receitaLiquidaVenda) * 100 : 0
  const margemSobreCustoInvestidoPerc =
    custoAquisicaoComJuros > 0 ? (resultadoFinalOperacao / custoAquisicaoComJuros) * 100 : 0

  const blocoResultadoOperacao: ResultadoOperacaoConsolidado = {
    receitaBruta: receitaBrutaVenda,
    faturamentoComJurosVenda,
    custoAquisicaoTotal: custoAquisicaoBase,
    custoAquisicaoComJuros,
    tributosVenda: totalTributosVenda,
    creditosCompra: totalCreditosTributarios,
    tributacaoLiquida,
    despesasOperacionaisVenda,
    despesasOperacionaisCompra,
    jurosRecebidosVenda: jurosVendaValor,
    jurosPagosCompra: jurosCompraValor,
    resultadoFinanceiroLiquido,
    resultadoOperacionalBruto,
    resultadoOperacionalLiquido: margemContribuicaoOperacional,
    resultadoFinalOperacao,
    resultadoFinalUnitario,
    margemSobreReceitaBrutaPerc,
    margemSobreReceitaLiquidaPerc,
    margemSobreCustoInvestidoPerc,
  }

  // 5. CÁLCULO DE MARKUP E PREÇO SUGERIDO (Venda)
  const margemAlvoPerc =
    vendaIn.margemAlvoPerc !== undefined
      ? Number(vendaIn.margemAlvoPerc)
      : Number(input.margemComercialPerc) || 15
  const somaCargasPercentuais =
    (cargaTributariaEfetivaPerc + comissaoPerc + taxaEfetivaVendaPerc) / 100
  const custoBaseFixoParaMarkup = custoAquisicaoBase
  const divisorBreakEven = Math.max(0.01, 1 - somaCargasPercentuais)
  const precoMinimoBreakEven = custoBaseFixoParaMarkup / divisorBreakEven
  const divisorComMargem = Math.max(0.01, 1 - somaCargasPercentuais - margemAlvoPerc / 100)
  const precoVendaSugerido =
    margemAlvoPerc > 0 && divisorComMargem > 0
      ? custoBaseFixoParaMarkup / divisorComMargem
      : precoMinimoBreakEven * (1 + margemAlvoPerc / 100)
  const markupMultiplicador =
    custoBaseFixoParaMarkup > 0 ? precoVendaSugerido / custoBaseFixoParaMarkup : 1.0
  const precoVendaSugeridoUnitario = volumeTotal > 0 ? precoVendaSugerido / volumeTotal : 0

  // 6. MONTAGEM DA DRE EM 3 COLUNAS
  const dre: LinhaDRE[] = [
    {
      descricao: '1. Faturamento Bruto da Venda',
      unitario: volumeTotal > 0 ? receitaBrutaVenda / volumeTotal : 0,
      total: receitaBrutaVenda,
      percSobreFaturamento: 100,
      natureza: 'receita',
    },
    {
      descricao: '(-) ICMS Efetivo da Venda',
      unitario: volumeTotal > 0 ? icmsEfetivoRecolher / volumeTotal : 0,
      total: icmsEfetivoRecolher,
      percSobreFaturamento:
        receitaBrutaVenda > 0 ? (icmsEfetivoRecolher / receitaBrutaVenda) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(-) PIS Agro (Venda)',
      unitario: volumeTotal > 0 ? valorPis / volumeTotal : 0,
      total: valorPis,
      percSobreFaturamento: receitaBrutaVenda > 0 ? (valorPis / receitaBrutaVenda) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(-) COFINS Agro (Venda)',
      unitario: volumeTotal > 0 ? valorCofins / volumeTotal : 0,
      total: valorCofins,
      percSobreFaturamento: receitaBrutaVenda > 0 ? (valorCofins / receitaBrutaVenda) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(-) IBS (Reforma LC 214/2025)',
      unitario: volumeTotal > 0 ? valorIbs / volumeTotal : 0,
      total: valorIbs,
      percSobreFaturamento: receitaBrutaVenda > 0 ? (valorIbs / receitaBrutaVenda) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(-) CBS (Reforma LC 214/2025)',
      unitario: volumeTotal > 0 ? valorCbs / volumeTotal : 0,
      total: valorCbs,
      percSobreFaturamento: receitaBrutaVenda > 0 ? (valorCbs / receitaBrutaVenda) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(=) Receita Líquida de Venda',
      unitario: volumeTotal > 0 ? receitaLiquidaVenda / volumeTotal : 0,
      total: receitaLiquidaVenda,
      percSobreFaturamento:
        receitaBrutaVenda > 0 ? (receitaLiquidaVenda / receitaBrutaVenda) * 100 : 0,
      natureza: 'subtotal',
    },
    {
      descricao: '(-) Custo de Aquisição do Produto (Compra)',
      unitario: volumeTotal > 0 ? valorMercadoriaCompraReais / volumeTotal : 0,
      total: valorMercadoriaCompraReais,
      percSobreFaturamento:
        receitaBrutaVenda > 0 ? (valorMercadoriaCompraReais / receitaBrutaVenda) * 100 : 0,
      natureza: 'custo',
    },
    {
      descricao: `(-) Despesas Logísticas de Compra (${modalidadeFreteCompra})`,
      unitario: volumeTotal > 0 ? totalDespesasCompra / volumeTotal : 0,
      total: totalDespesasCompra,
      percSobreFaturamento:
        receitaBrutaVenda > 0 ? (totalDespesasCompra / receitaBrutaVenda) * 100 : 0,
      natureza: 'custo',
    },
    {
      descricao: `(-) Frete de Venda (${modalidadeFreteVenda})`,
      unitario: volumeTotal > 0 ? freteVendaReais / volumeTotal : 0,
      total: freteVendaReais,
      percSobreFaturamento: receitaBrutaVenda > 0 ? (freteVendaReais / receitaBrutaVenda) * 100 : 0,
      natureza: 'despesa',
    },
    {
      descricao: '(-) Seguro e Outros da Venda',
      unitario: volumeTotal > 0 ? (seguroVenda + outrasDespesasVenda) / volumeTotal : 0,
      total: seguroVenda + outrasDespesasVenda,
      percSobreFaturamento:
        receitaBrutaVenda > 0 ? ((seguroVenda + outrasDespesasVenda) / receitaBrutaVenda) * 100 : 0,
      natureza: 'despesa',
    },
    {
      descricao: `(-) Comissão de Venda (${comissaoPerc.toFixed(1)}%)`,
      unitario: volumeTotal > 0 ? comissaoValor / volumeTotal : 0,
      total: comissaoValor,
      percSobreFaturamento: comissaoPerc,
      natureza: 'despesa',
    },
    {
      descricao: '(=) Resultado Operacional da Venda',
      unitario: volumeTotal > 0 ? margemContribuicaoOperacional / volumeTotal : 0,
      total: margemContribuicaoOperacional,
      percSobreFaturamento:
        receitaBrutaVenda > 0 ? (margemContribuicaoOperacional / receitaBrutaVenda) * 100 : 0,
      natureza: 'subtotal',
    },
    {
      descricao: `(-) Juros da Compra (${taxaEfetivaCompraPerc.toFixed(2)}% em ${prazoCompraDias}d)`,
      unitario: volumeTotal > 0 ? jurosCompraValor / volumeTotal : 0,
      total: jurosCompraValor,
      percSobreFaturamento:
        receitaBrutaVenda > 0 ? (jurosCompraValor / receitaBrutaVenda) * 100 : 0,
      natureza: 'despesa',
    },
    {
      descricao: `(+) Juros Financiamento da Venda (${taxaEfetivaVendaPerc.toFixed(2)}% em ${prazoVendaDias}d)`,
      unitario: volumeTotal > 0 ? jurosVendaValor / volumeTotal : 0,
      total: jurosVendaValor,
      percSobreFaturamento: receitaBrutaVenda > 0 ? (jurosVendaValor / receitaBrutaVenda) * 100 : 0,
      natureza: 'receita',
    },
    {
      descricao: '(=) RESULTADO FINAL DA OPERAÇÃO',
      unitario: volumeTotal > 0 ? resultadoFinalOperacao / volumeTotal : 0,
      total: resultadoFinalOperacao,
      percSobreFaturamento: margemSobreReceitaBrutaPerc,
      natureza: 'resultado',
    },
  ]

  // 7. MEMÓRIA DE CÁLCULO SEPARADA POR BLOCOS
  memoriaCalculo.push(
    `--- 1. OPERAÇÃO DE COMPRA (${dataCompraIso} | Vencimento ${dataVencimentoCompraIso} em ${prazoCompraDias} dias) ---`,
  )
  memoriaCalculo.push(
    `Mercadoria: ${volumeTotal.toLocaleString('pt-BR')} ${unid} × ${moedaCompra === 'USD' ? `US$ ${precoUnitarioCompra.toFixed(2)} (PTAX R$ ${ptaxCompra.toFixed(4)}) = ` : ''}R$ ${precoUnitarioCompraReais.toFixed(2)} = R$ ${valorMercadoriaCompraReais.toFixed(2)}`,
  )
  memoriaCalculo.push(
    `Despesas de Aquisição: Frete (${modalidadeFreteCompra}) R$ ${freteCompraReais.toFixed(2)} + Seguro R$ ${seguroCompra.toFixed(2)} + Outros R$ ${outrasDespesasCompra.toFixed(2)} = R$ ${totalDespesasCompra.toFixed(2)}`,
  )
  memoriaCalculo.push(
    `Custo Mercadoria: R$ ${custoAquisicaoMercadoria.toFixed(2)} | Juros da Compra: taxa ${taxaJurosCompraMensal.toFixed(2)}% a.m. (efetiva ${taxaEfetivaCompraPerc.toFixed(2)}% em ${prazoCompraDias}d) = R$ ${jurosCompraValor.toFixed(2)} | Custo Total c/ Juros: R$ ${custoTotalCompraComJuros.toFixed(2)} (R$ ${custoUnitarioTotalCompra.toFixed(2)}/${unid})`,
  )

  memoriaCalculo.push(
    `--- 2. OPERAÇÃO DE VENDA (${dataVendaIso} | Vencimento ${dataVencimentoVendaIso} em ${prazoVendaDias} dias) ---`,
  )
  memoriaCalculo.push(
    `Preço de Venda: R$ ${precoUnitarioVendaReais.toFixed(2)}/${unid} | Faturamento Bruto: R$ ${receitaBrutaVenda.toFixed(2)} | Comissão (${comissaoPerc}%): R$ ${comissaoValor.toFixed(2)}`,
  )
  memoriaCalculo.push(
    `ICMS (${ufOrigemVenda} → ${ufDestinoVenda}): Base Bruta R$ ${baseCalculoBrutaIcmsVenda.toFixed(2)} | Redução ${redBasePerc}% → Base Efetiva R$ ${baseCalculoEfetivaIcms.toFixed(2)} | Débito R$ ${debitoIcms.toFixed(2)} | Diferimento R$ ${valorDiferimento.toFixed(2)} | A Recolher R$ ${icmsEfetivoRecolher.toFixed(2)}`,
  )
  memoriaCalculo.push(
    `PIS/COFINS (Tema 69 STF): Base R$ ${basePisCofinsComExclusaoStf.toFixed(2)} (Faturamento R$ ${receitaBrutaVenda.toFixed(2)} - ICMS R$ ${icmsEfetivoRecolher.toFixed(2)}) | PIS ${aliqPisPadrao.toFixed(3)}% (R$ ${valorPis.toFixed(2)}) + COFINS ${aliqCofinsPadrao.toFixed(3)}% (R$ ${valorCofins.toFixed(2)})`,
  )
  memoriaCalculo.push(
    `IBS/CBS (LC 214/2025 c/ red. 60%): Base R$ ${baseCalculoIbsCbs.toFixed(2)} | IBS ${aliqIbsNominal}% (R$ ${valorIbs.toFixed(2)}) + CBS ${aliqCbsNominal}% (R$ ${valorCbs.toFixed(2)}) | Total Tributos Venda: R$ ${totalTributosVenda.toFixed(2)} (${cargaTributariaEfetivaPerc.toFixed(2)}%)`,
  )
  memoriaCalculo.push(
    `Juros Financiamento Concedido ao Cliente: taxa ${taxaJurosVendaMensal.toFixed(2)}% a.m. (efetiva ${taxaEfetivaVendaPerc.toFixed(2)}% em ${prazoVendaDias}d) = R$ ${jurosVendaValor.toFixed(2)}`,
  )

  memoriaCalculo.push(`--- 3. RESULTADO CONSOLIDADO DA OPERAÇÃO ---`)
  memoriaCalculo.push(
    `Receita Líquida R$ ${receitaLiquidaVenda.toFixed(2)} - Custo de Aquisição R$ ${custoAquisicaoBase.toFixed(2)} - Despesas Venda R$ ${despesasOperacionaisVenda.toFixed(2)} = Margem Operacional R$ ${margemContribuicaoOperacional.toFixed(2)}`,
  )
  memoriaCalculo.push(
    `Resultado Financeiro: Juros Venda (+) R$ ${jurosVendaValor.toFixed(2)} - Juros Compra (-) R$ ${jurosCompraValor.toFixed(2)} = R$ ${resultadoFinanceiroLiquido.toFixed(2)}`,
  )
  memoriaCalculo.push(
    `RESULTADO FINAL DA OPERAÇÃO: R$ ${resultadoFinalOperacao.toFixed(2)} (${margemSobreReceitaBrutaPerc.toFixed(2)}% da venda | ${margemSobreCustoInvestidoPerc.toFixed(2)}% ROI sobre compra)`,
  )

  return {
    produtoNome: desc,
    codigoProduto: cod,
    ncm,
    unidade: unid,
    embalagem: emb,
    origem: produto.origem || 'Nacional',
    grTrib: grTrib || 'Geral',
    ufOrigem: ufOrigemVenda,
    ufDestino: ufDestinoVenda,
    operacao: operacaoVenda,
    isImportado: isVendaImportada || isCompraImportada,
    enquadramentoCliente,
    quantidade: qtdInformada,
    qtdEmbalagens,
    volumePorEmbalagem: volumePorEmb,
    volumeTotal,
    moedaOriginal: moedaVenda,
    ptaxAplicada: ptaxVenda,
    valorUnitarioOriginal: precoUnitarioVenda,
    valorUnitarioReais: precoUnitarioVendaReais,
    valorMercadoriaOriginal: valorMercadoriaVendaReais,
    valorMercadoriaReais: valorMercadoriaVendaReais,
    modalidadeFrete: modalidadeFreteVenda,
    frete: freteVendaReais,
    seguro: seguroVenda,
    outrasDespesas: outrasDespesasVenda,
    totalDespesasAcessorias: totalDespesasVenda,
    baseOperacaoComercial: baseOperacaoComercialVenda,
    comissaoPerc,
    comissaoValor,
    custoFinanceiroPerc: taxaEfetivaVendaPerc,
    custoFinanceiroValor: jurosVendaValor,
    icms: icmsDetalhe,
    temRegraIcms,
    statusRegraIcms,
    avisoIcms,
    pis: pisDetalhe,
    cofins: cofinsDetalhe,
    ibs: ibsDetalhe,
    cbs: cbsDetalhe,
    totalTributos: totalTributosVenda,
    cargaTributariaEfetivaPerc,
    dre,
    receitaBruta: receitaBrutaVenda,
    deducoesTributarias: totalTributosVenda,
    receitaLiquida: receitaLiquidaVenda,
    custosEDespesas: custoAquisicaoBase + despesasOperacionaisVenda,
    margemContribuicaoValor: resultadoFinalOperacao,
    margemContribuicaoPercSobreFaturamento: margemSobreReceitaBrutaPerc,
    margemContribuicaoPercSobreReceitaLiquida: margemSobreReceitaLiquidaPerc,
    markupMultiplicador,
    precoMinimoBreakEven,
    precoVendaSugerido,
    precoVendaSugeridoUnitario,
    compra: blocoCompra,
    venda: blocoVenda,
    resultadoOperacao: blocoResultadoOperacao,
    alertas,
    memoriaCalculo,
  }
}
