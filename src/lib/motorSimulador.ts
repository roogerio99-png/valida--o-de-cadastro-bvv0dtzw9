/**
 * src/lib/motorSimulador.ts
 *
 * Motor de Cálculo Comercial Canônico do AgroSimulador (Aba "Simulador" do Excel - 53 linhas).
 *
 * Responsável por:
 * 1. Composição de Volume e Embalagens:
 *    - Quantidade de embalagens (unidades físicas de embalagem)
 *    - Volume/peso por embalagem e Volume total da simulação (L/Kg/un)
 * 2. Conversão cambial quando produto for importado via PTAX digitada manualmente.
 * 3. Modalidade de Frete (CIF vs FOB):
 *    - Se CIF: frete entra na base de cálculo do ICMS e no custo/DRE.
 *    - Se FOB: frete sai da base do ICMS (responsabilidade do cliente).
 *    - Suporta frete informado em R$ ou em % sobre a mercadoria.
 * 4. Despesas Comerciais e Financeiras:
 *    - Comissão de vendas (%) sugerida da comissao_padrao do produto, editável.
 *    - Custo financeiro / prazo de pagamento (% de juros/prazo embutidos).
 *    - Enquadramento do cliente (Produtor Rural / Revenda / Cooperativa / Consumidor Final).
 * 5. ICMS Detalhado:
 *    - Base bruta e base efetiva (reduzida)
 *    - Alíquota nominal vs efetiva
 *    - ICMS débito próprio em R$
 *    - % e valor do diferimento em R$
 *    - ICMS desonerado em R$ com tipo ("Desconta do Preço", "Demonstra", "Não Calcula")
 *    - Crédito presumido / regra crédito entrada
 *    - ICMS efetivo a recolher (débito - diferimento - créditos)
 * 6. PIS / COFINS (Tema 69 do STF):
 *    - Exclusão do ICMS destacado da base de cálculo do PIS/COFINS (Base = Faturamento - ICMS)
 *    - Discriminação das alíquotas conforme regime (Lei 10.925 isento vs LC 224/2025 reoneração 0,925%)
 * 7. IBS / CBS (Transição Reforma LC 214/2025):
 *    - Alíquotas padrão (CBS 8,8% / IBS 17,7%), alíquotas efetivas com redução de 60% (CBS 3,52% / IBS 7,08%)
 *    - Alíquotas de teste 2026 (0,1% IBS / 0,9% CBS) opcionais
 * 8. DRE / CASCATA DE PREÇO (3 colunas: Unitário R$, Total do lote R$, % sobre Faturamento):
 *    - Faturamento bruto
 *    - (-) Deduções tributárias: ICMS efetivo, PIS, COFINS, IBS, CBS
 *    - (=) Receita líquida
 *    - (-) CMV / Custo da mercadoria
 *    - (-) Frete (CIF)
 *    - (-) Seguro & outras despesas
 *    - (-) Comissão de vendas (R$)
 *    - (-) Custo financeiro (R$)
 *    - (=) MARGEM DE CONTRIBUIÇÃO (R$ e % sobre receita líquida)
 *    - Markup multiplicador
 *    - Preço mínimo (break-even para margem zero)
 *    - Preço sugerido para a margem-alvo digitada
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

export interface SimuladorInput {
  // Produto
  produto: ProdutoBaseSimulador
  // Par interestadual
  ufOrigem: string
  ufDestino: string

  // Quantidade e Embalagem
  quantidade: number // Em volume/peso (ex: 1.000 L ou 1.000 KG) ou unidades
  unidade?: string
  embalagem?: string
  qtdEmbalagens?: number // Quantidade de caixas/tambores/sacos (opcional, calculado ou digitado)
  volumePorEmbalagem?: number // Capacidade por embalagem em L ou KG (ex: 20 para galão de 20L)

  // Enquadramento do Cliente
  enquadramentoCliente?: EnquadramentoCliente

  // Comercial & Moeda
  precoUnitario: number // Na moeda do produto (BRL ou USD)
  moeda?: 'BRL' | 'USD'
  ptaxManual?: number // Cotação Dólar informada manualmente

  // Logística & Modalidade de Frete
  modalidadeFrete?: ModalidadeFrete // 'CIF' (incluso na base ICMS) ou 'FOB' (fora da base ICMS)
  frete?: number // R$
  fretePerc?: number // % opcional sobre mercadoria
  usarFretePerc?: boolean
  seguro?: number // R$
  outrasDespesas?: number // R$

  // Variáveis Comerciais
  comissaoPerc?: number // % comissão sobre faturamento (padrão sugerido do produto)
  custoFinanceiroPerc?: number // % juros embutidos / custo de prazo de pagamento
  margemComercialPerc?: number // % de margem de contribuição desejada

  // Parâmetros Fiscais Opcionais
  regraIcms?: RegraIcmsSimulador | null
  aliquotaPisManual?: number
  aliquotaCofinsManual?: number
  aliquotaIbsManual?: number
  aliquotaCbsManual?: number
  considerarReoneracao2026?: boolean
  usarAliquotaReformaPlena?: boolean // CBS 8,8% e IBS 17,7% (com redução de 60%) vs alíquota teste 2026
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

  // Câmbio
  moedaOriginal: 'BRL' | 'USD'
  ptaxAplicada: number
  valorUnitarioOriginal: number
  valorUnitarioReais: number

  // Faturamento e Mercadoria
  valorMercadoriaOriginal: number
  valorMercadoriaReais: number

  // Logística & Despesas
  modalidadeFrete: ModalidadeFrete
  frete: number
  seguro: number
  outrasDespesas: number
  totalDespesasAcessorias: number
  baseOperacaoComercial: number

  // Comercial & Financeiro
  comissaoPerc: number
  comissaoValor: number
  custoFinanceiroPerc: number
  custoFinanceiroValor: number

  // Tributos destacados
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

  // DRE / Cascata de Preço
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

  // Auditoria
  alertas: string[]
  memoriaCalculo: string[]
}

/**
 * Tenta extrair a capacidade numérica da embalagem (ex: "4X5L" -> 20L, "Saco 20 kg" -> 20, "Bombona 20 L" -> 20)
 */
export function deduzirCapacidadeEmbalagem(textoEmbalagem?: string): number {
  if (!textoEmbalagem) return 1
  const t = textoEmbalagem.trim().toUpperCase()

  // Formato multix: 4X5L -> 20, 2X10L -> 20, 12X1L -> 12
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

/**
 * Executa o cálculo comercial completo com paridade do gabarito Excel
 */
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
  const enquadramento = input.enquadramentoCliente || 'produtor_rural'
  const modalidadeFrete = input.modalidadeFrete || 'CIF'

  // 1. Quantidade e Volume da Simulação
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

  // 2. Identificação de Produto Importado e Câmbio PTAX
  const origemStr = String(produto.origem || '').toUpperCase()
  const isImportado =
    origemStr.includes('IMP') ||
    desc.toUpperCase().includes('(IMP)') ||
    input.moeda === 'USD' ||
    produto.moeda === 'USD'

  const moedaOriginal: 'BRL' | 'USD' = input.moeda || (isImportado ? 'USD' : 'BRL')
  const precoUnitarioOriginal = Math.max(0, Number(input.precoUnitario) || 0)

  let ptaxAplicada = 1.0
  let valorUnitarioReais = precoUnitarioOriginal

  if (moedaOriginal === 'USD') {
    const ptax = Number(input.ptaxManual) || 0
    if (ptax <= 0) {
      alertas.push(
        'Produto importado cotado em dólar (USD): informe a cotação PTAX manual para conversão cambial exata.',
      )
    }
    ptaxAplicada = ptax > 0 ? ptax : 1.0
    valorUnitarioReais = precoUnitarioOriginal * ptaxAplicada
    memoriaCalculo.push(
      `Câmbio PTAX: US$ ${precoUnitarioOriginal.toFixed(2)} × R$ ${ptaxAplicada.toFixed(4)} = R$ ${valorUnitarioReais.toFixed(2)} / ${unid}`,
    )
  } else {
    memoriaCalculo.push(
      `Preço unitário em moeda nacional: R$ ${valorUnitarioReais.toFixed(2)} / ${unid}`,
    )
  }

  // 3. Mercadoria e Logística (CIF vs FOB)
  const valorMercadoriaOriginal = volumeTotal * precoUnitarioOriginal
  const valorMercadoriaReais = volumeTotal * valorUnitarioReais

  let freteReais = Math.max(0, Number(input.frete) || 0)
  if (input.usarFretePerc && input.fretePerc !== undefined && input.fretePerc > 0) {
    freteReais = valorMercadoriaReais * (input.fretePerc / 100)
  }

  const seguroReais = Math.max(0, Number(input.seguro) || 0)
  const outrasDespesasReais = Math.max(0, Number(input.outrasDespesas) || 0)
  const totalDespesasAcessorias = freteReais + seguroReais + outrasDespesasReais

  // Se CIF, o frete entra na base de cálculo do ICMS; se FOB, o frete corre por conta do cliente (sai da base do ICMS)
  const freteNaBaseIcms = modalidadeFrete === 'CIF' ? freteReais : 0
  const baseCalculoBrutaIcms =
    valorMercadoriaReais + freteNaBaseIcms + seguroReais + outrasDespesasReais
  const baseOperacaoComercial = valorMercadoriaReais + totalDespesasAcessorias

  memoriaCalculo.push(
    `Volume total: ${volumeTotal.toLocaleString('pt-BR')} ${unid} (${qtdEmbalagens.toLocaleString('pt-BR')} emb. de ${volumePorEmb} ${unid}) | Mercadoria: R$ ${valorMercadoriaReais.toFixed(2)}`,
  )
  memoriaCalculo.push(
    `Modalidade Frete: ${modalidadeFrete} | Frete: R$ ${freteReais.toFixed(2)} (${modalidadeFrete === 'CIF' ? 'incluso na base do ICMS' : 'FOB: fora da base do ICMS'})`,
  )

  // 4. ICMS Detalhado
  const ufOrigem = (input.ufOrigem || 'SP').trim().toUpperCase()
  const ufDestino = (input.ufDestino || 'MT').trim().toUpperCase()
  const operacao: 'Interna' | 'Interestadual' = ufOrigem === ufDestino ? 'Interna' : 'Interestadual'

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

  if (input.regraIcms) {
    const r = input.regraIcms
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
        `Sem regra específica para GrTrib "${grTrib}" em ${ufOrigem} → ${ufDestino}. Aplicada regra geral da UF.`,
      )
    } else if (grTrib && regraGrTrib && grTrib !== regraGrTrib) {
      statusRegraIcms = 'fallback_uf'
      temRegraIcms = true
      alertas.push(
        `Atenção: Produto é GrTrib "${grTrib}", mas a regra aplicada pertence a GrTrib "${regraGrTrib}" para ${ufOrigem} → ${ufDestino}.`,
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
      (operacao === 'Interna'
        ? `Operação Interna ${ufOrigem}`
        : `Convênio ICMS 100/97 e alterações (${ufOrigem} → ${ufDestino})`)
  } else {
    temRegraIcms = false
    statusRegraIcms = 'sem_regra'
    avisoIcms = `Sem regra de ICMS para origem ${ufOrigem} → destino ${ufDestino}${grTrib ? ` (GrTrib ${grTrib})` : ''}. Aplicada alíquota interestadual padrão estimada.`
    alertas.push(avisoIcms)

    const aliqPadrao =
      operacao === 'Interna'
        ? 18
        : ['SP', 'RJ', 'MG', 'PR', 'RS', 'SC'].includes(ufOrigem) &&
            !['SP', 'RJ', 'MG', 'PR', 'RS', 'SC'].includes(ufDestino)
          ? 7
          : 12
    aliqNominal = aliqPadrao
    aliqEfetiva = aliqPadrao
    fundamentacaoLegal =
      'Alíquota padrão interestadual estimada (sem regra cadastrada origem→destino)'
  }

  // Base efetiva de cálculo do ICMS
  const baseCalculoEfetivaIcms = baseCalculoBrutaIcms * (1 - redBasePerc / 100)
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
      valorDesonerado = baseCalculoBrutaIcms * (taxaDeson / 100)
    }
  }

  // Crédito de Entrada / Presumido
  let creditoEntradaPerc = 0
  let valorCreditoEntrada = 0
  if (regraCreditoEntrada.toLowerCase().includes('presumido')) {
    creditoEntradaPerc = aliqEfetiva * 0.5 // Exemplo de crédito presumido parcial quando previsto na regra
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
    baseCalculoBruta: baseCalculoBrutaIcms,
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

  memoriaCalculo.push(
    `ICMS (${ufOrigem} → ${ufDestino}): Base Bruta R$ ${baseCalculoBrutaIcms.toFixed(2)} | Redução ${redBasePerc}% → Base Efetiva R$ ${baseCalculoEfetivaIcms.toFixed(2)} | Débito R$ ${debitoIcms.toFixed(2)} | Diferimento R$ ${valorDiferimento.toFixed(2)} | A Recolher R$ ${icmsEfetivoRecolher.toFixed(2)}`,
  )

  // 5. PIS / COFINS (Tema 69 do STF - Exclusão do ICMS da base)
  const basePisCofinsComExclusaoStf = Math.max(0, baseOperacaoComercial - icmsEfetivoRecolher)

  const considerarReoneracao = input.considerarReoneracao2026 !== false
  const aliqPisPadrao =
    input.aliquotaPisManual !== undefined
      ? input.aliquotaPisManual
      : considerarReoneracao
        ? 0.165
        : 0.0

  const aliqCofinsPadrao =
    input.aliquotaCofinsManual !== undefined
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

  memoriaCalculo.push(
    `PIS/COFINS (Tema 69 STF): Base R$ ${basePisCofinsComExclusaoStf.toFixed(2)} (R$ ${baseOperacaoComercial.toFixed(2)} - ICMS R$ ${icmsEfetivoRecolher.toFixed(2)}) | PIS ${aliqPisPadrao.toFixed(3)}% (R$ ${valorPis.toFixed(2)}) + COFINS ${aliqCofinsPadrao.toFixed(3)}% (R$ ${valorCofins.toFixed(2)})`,
  )

  // 6. IBS / CBS (Reforma Tributária LC 214/2025 com redução de 60% para insumos agro)
  // Permite tanto simulação com alíquota plena da reforma (CBS 8,8% / IBS 17,7% -> efetivas 3,52% e 7,08%)
  // quanto alíquota de teste 2026 (CBS 0,9% / IBS 0,1% -> efetivas 0,36% e 0,04%)
  const usarPlena = !!input.usarAliquotaReformaPlena
  const aliqIbsNominal =
    input.aliquotaIbsManual !== undefined ? input.aliquotaIbsManual : usarPlena ? 17.7 : 0.1
  const aliqCbsNominal =
    input.aliquotaCbsManual !== undefined ? input.aliquotaCbsManual : usarPlena ? 8.8 : 0.9

  const reducaoReformaPerc = 60 // 60% de redução no Agro
  const aliqIbsEfetiva = aliqIbsNominal * (1 - reducaoReformaPerc / 100)
  const aliqCbsEfetiva = aliqCbsNominal * (1 - reducaoReformaPerc / 100)

  const baseCalculoIbsCbs = baseOperacaoComercial * (1 - reducaoReformaPerc / 100)
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

  const totalTributos = icmsEfetivoRecolher + valorPis + valorCofins + valorIbs + valorCbs
  const cargaTributariaEfetivaPerc =
    baseOperacaoComercial > 0 ? (totalTributos / baseOperacaoComercial) * 100 : 0

  // 7. Comissão e Custo Financeiro
  const comissaoPadraoPerc =
    produto.comissao_padrao !== undefined && produto.comissao_padrao !== null
      ? Number(produto.comissao_padrao) * (produto.comissao_padrao < 1 ? 100 : 1)
      : 2.5
  const comissaoPerc =
    input.comissaoPerc !== undefined ? Number(input.comissaoPerc) : comissaoPadraoPerc
  const custoFinanceiroPerc = Math.max(0, Number(input.custoFinanceiroPerc) || 0)

  // O faturamento bruto inicial de referência é a base da operação comercial
  const faturamentoBrutoBase = baseOperacaoComercial
  const comissaoValorBase = faturamentoBrutoBase * (comissaoPerc / 100)
  const custoFinanceiroValorBase = faturamentoBrutoBase * (custoFinanceiroPerc / 100)

  // 8. DRE / Cascata de Preço (Paridade linhas 43-53 da aba Simulador do Excel)
  // Receita Bruta = Faturamento Bruto da operação
  // Deduções Tributárias = ICMS Efetivo + PIS + COFINS + IBS + CBS
  // Receita Líquida = Receita Bruta - Deduções Tributárias
  // Custos e Despesas = Mercadoria (CMV) + Frete (se CIF) + Seguro/Outros + Comissão + Custo Financeiro
  // Margem de Contribuição = Receita Líquida - Custos e Despesas
  const deducoesTributarias = totalTributos
  const receitaLiquida = faturamentoBrutoBase - deducoesTributarias

  const custosOperacionaisDiretos =
    valorMercadoriaReais +
    (modalidadeFrete === 'CIF' ? freteReais : 0) +
    seguroReais +
    outrasDespesasReais +
    comissaoValorBase +
    custoFinanceiroValorBase

  const margemContribuicaoValor = receitaLiquida - custosOperacionaisDiretos
  const margemContribuicaoPercSobreFaturamento =
    faturamentoBrutoBase > 0 ? (margemContribuicaoValor / faturamentoBrutoBase) * 100 : 0
  const margemContribuicaoPercSobreReceitaLiquida =
    receitaLiquida > 0 ? (margemContribuicaoValor / receitaLiquida) * 100 : 0

  // 9. Formação de Preço Sugerido e Markup
  // Margem comercial desejada informada pelo usuário (ex: 15%)
  const margemAlvoPerc = Number(input.margemComercialPerc) || 0

  // Custo total acumulado da operação (CMV + Frete + Despesas + Tributos + Comissão + Custo Financeiro)
  const somaCargasPercentuais =
    (cargaTributariaEfetivaPerc + comissaoPerc + custoFinanceiroPerc) / 100

  // Preço mínimo (break-even para margem zero)
  const custoBaseFixo =
    valorMercadoriaReais +
    (modalidadeFrete === 'CIF' ? freteReais : 0) +
    seguroReais +
    outrasDespesasReais
  const divisorBreakEven = Math.max(0.01, 1 - somaCargasPercentuais)
  const precoMinimoBreakEven = custoBaseFixo / divisorBreakEven

  // Preço de venda sugerido para a margem-alvo digitada
  const divisorComMargem = Math.max(0.01, 1 - somaCargasPercentuais - margemAlvoPerc / 100)
  const precoVendaSugerido =
    margemAlvoPerc > 0 && divisorComMargem > 0
      ? custoBaseFixo / divisorComMargem
      : precoMinimoBreakEven * (1 + margemAlvoPerc / 100)

  const markupMultiplicador =
    valorMercadoriaReais > 0 ? precoVendaSugerido / valorMercadoriaReais : 1.0

  const precoVendaSugeridoUnitario = volumeTotal > 0 ? precoVendaSugerido / volumeTotal : 0

  // Montagem das Linhas da DRE (Unitário, Total e % sobre Faturamento)
  const dre: LinhaDRE[] = [
    {
      descricao: 'Faturamento Bruto',
      unitario: volumeTotal > 0 ? faturamentoBrutoBase / volumeTotal : 0,
      total: faturamentoBrutoBase,
      percSobreFaturamento: 100,
      natureza: 'receita',
    },
    {
      descricao: '(-) ICMS Efetivo a Recolher',
      unitario: volumeTotal > 0 ? icmsEfetivoRecolher / volumeTotal : 0,
      total: icmsEfetivoRecolher,
      percSobreFaturamento:
        faturamentoBrutoBase > 0 ? (icmsEfetivoRecolher / faturamentoBrutoBase) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(-) PIS Agro',
      unitario: volumeTotal > 0 ? valorPis / volumeTotal : 0,
      total: valorPis,
      percSobreFaturamento: faturamentoBrutoBase > 0 ? (valorPis / faturamentoBrutoBase) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(-) COFINS Agro',
      unitario: volumeTotal > 0 ? valorCofins / volumeTotal : 0,
      total: valorCofins,
      percSobreFaturamento:
        faturamentoBrutoBase > 0 ? (valorCofins / faturamentoBrutoBase) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(-) IBS (Reforma LC 214/2025)',
      unitario: volumeTotal > 0 ? valorIbs / volumeTotal : 0,
      total: valorIbs,
      percSobreFaturamento: faturamentoBrutoBase > 0 ? (valorIbs / faturamentoBrutoBase) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(-) CBS (Reforma LC 214/2025)',
      unitario: volumeTotal > 0 ? valorCbs / volumeTotal : 0,
      total: valorCbs,
      percSobreFaturamento: faturamentoBrutoBase > 0 ? (valorCbs / faturamentoBrutoBase) * 100 : 0,
      natureza: 'deducao',
    },
    {
      descricao: '(=) Receita Líquida',
      unitario: volumeTotal > 0 ? receitaLiquida / volumeTotal : 0,
      total: receitaLiquida,
      percSobreFaturamento:
        faturamentoBrutoBase > 0 ? (receitaLiquida / faturamentoBrutoBase) * 100 : 0,
      natureza: 'subtotal',
    },
    {
      descricao: '(-) CMV / Custo da Mercadoria',
      unitario: volumeTotal > 0 ? valorMercadoriaReais / volumeTotal : 0,
      total: valorMercadoriaReais,
      percSobreFaturamento:
        faturamentoBrutoBase > 0 ? (valorMercadoriaReais / faturamentoBrutoBase) * 100 : 0,
      natureza: 'custo',
    },
    {
      descricao: `(-) Frete (${modalidadeFrete})`,
      unitario: volumeTotal > 0 ? freteReais / volumeTotal : 0,
      total: freteReais,
      percSobreFaturamento:
        faturamentoBrutoBase > 0 ? (freteReais / faturamentoBrutoBase) * 100 : 0,
      natureza: 'despesa',
    },
    {
      descricao: '(-) Seguro & Outras Despesas',
      unitario: volumeTotal > 0 ? (seguroReais + outrasDespesasReais) / volumeTotal : 0,
      total: seguroReais + outrasDespesasReais,
      percSobreFaturamento:
        faturamentoBrutoBase > 0
          ? ((seguroReais + outrasDespesasReais) / faturamentoBrutoBase) * 100
          : 0,
      natureza: 'despesa',
    },
    {
      descricao: `(-) Comissão de Vendas (${comissaoPerc.toFixed(1)}%)`,
      unitario: volumeTotal > 0 ? comissaoValorBase / volumeTotal : 0,
      total: comissaoValorBase,
      percSobreFaturamento: comissaoPerc,
      natureza: 'despesa',
    },
    {
      descricao: `(-) Custo Financeiro / Prazo (${custoFinanceiroPerc.toFixed(1)}%)`,
      unitario: volumeTotal > 0 ? custoFinanceiroValorBase / volumeTotal : 0,
      total: custoFinanceiroValorBase,
      percSobreFaturamento: custoFinanceiroPerc,
      natureza: 'despesa',
    },
    {
      descricao: '(=) MARGEM DE CONTRIBUIÇÃO',
      unitario: volumeTotal > 0 ? margemContribuicaoValor / volumeTotal : 0,
      total: margemContribuicaoValor,
      percSobreFaturamento: margemContribuicaoPercSobreFaturamento,
      natureza: 'resultado',
    },
  ]

  memoriaCalculo.push(
    `DRE: Receita Líquida R$ ${receitaLiquida.toFixed(2)} - Custos/Despesas R$ ${custosOperacionaisDiretos.toFixed(2)} = Margem de Contribuição R$ ${margemContribuicaoValor.toFixed(2)} (${margemContribuicaoPercSobreFaturamento.toFixed(2)}% do faturamento)`,
  )
  memoriaCalculo.push(
    `Preço Mínimo Break-Even (margem zero): R$ ${precoMinimoBreakEven.toFixed(2)} | Preço Sugerido com margem de ${margemAlvoPerc}%: R$ ${precoVendaSugerido.toFixed(2)} (Markup ${markupMultiplicador.toFixed(3)}x)`,
  )

  return {
    produtoNome: desc,
    codigoProduto: cod,
    ncm,
    unidade: unid,
    embalagem: emb,
    origem: produto.origem || 'Nacional',
    grTrib: grTrib || 'Geral',
    ufOrigem,
    ufDestino,
    operacao,
    isImportado,
    enquadramentoCliente: enquadramento,
    quantidade: qtdInformada,
    qtdEmbalagens,
    volumePorEmbalagem: volumePorEmb,
    volumeTotal,
    moedaOriginal,
    ptaxAplicada,
    valorUnitarioOriginal: precoUnitarioOriginal,
    valorUnitarioReais,
    valorMercadoriaOriginal,
    valorMercadoriaReais,
    modalidadeFrete,
    frete: freteReais,
    seguro: seguroReais,
    outrasDespesas: outrasDespesasReais,
    totalDespesasAcessorias,
    baseOperacaoComercial,
    comissaoPerc,
    comissaoValor: comissaoValorBase,
    custoFinanceiroPerc,
    custoFinanceiroValor: custoFinanceiroValorBase,
    icms: icmsDetalhe,
    temRegraIcms,
    statusRegraIcms,
    avisoIcms,
    pis: pisDetalhe,
    cofins: cofinsDetalhe,
    ibs: ibsDetalhe,
    cbs: cbsDetalhe,
    totalTributos,
    cargaTributariaEfetivaPerc,
    dre,
    receitaBruta: faturamentoBrutoBase,
    deducoesTributarias,
    receitaLiquida,
    custosEDespesas: custosOperacionaisDiretos,
    margemContribuicaoValor,
    margemContribuicaoPercSobreFaturamento,
    margemContribuicaoPercSobreReceitaLiquida,
    markupMultiplicador,
    precoMinimoBreakEven,
    precoVendaSugerido,
    precoVendaSugeridoUnitario,
    alertas,
    memoriaCalculo,
  }
}
