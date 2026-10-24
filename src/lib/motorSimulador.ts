/**
 * src/lib/motorSimulador.ts
 *
 * Motor de Cálculo Comercial Canônico do AgroSimulador (Fase 1 - MVP).
 *
 * Responsável por:
 * 1. Conversão cambial quando produto for importado via PTAX digitada manualmente (sem automações externas).
 * 2. Composição da base de cálculo comercial (quantidade, volume, embalagem, preço unitário, frete, seguro, outras despesas).
 * 3. Enquadramento e cálculo do ICMS interestadual/interno com base na regra encontrada (alíquota nominal, redução de base, alíquota efetiva, diferimento).
 *    - Se não houver regra de ICMS para o par origem -> destino, emite aviso explícito e alerta no relatório de cálculo.
 * 4. PIS / COFINS coerentes com a parametrização fiscal e temporal do agronegócio:
 *    - Até Mar/2026: Benefício Lei 10.925/2004 (Alíquota Zero 0,00%).
 *    - Pós Abr/2026: Reoneração linear de 10% pela LC 224/2025 (Carga residual de 0,925% no Lucro Real / Não-Cumulativo: PIS 0,165% + COFINS 0,760%).
 *    - Importação de insumos: adicional de 1% / alíquota aduaneira residual de 1,175% quando aplicável.
 * 5. IBS / CBS (Transição Reforma Tributária LC 214/2025):
 *    - Teste 2026 (0,1% IBS + 0,9% CBS) com Redução de 60% e regime de diferimento para insumos agropecuários.
 * 6. Totalização completa em R$ e formação de Preço de Venda / Custo Final / Margem Líquida.
 */

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
  dados_extras?: Record<string, unknown>
}

export interface RegraIcmsSimulador {
  id?: string
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
}

export interface SimuladorInput {
  // Produto
  produto: ProdutoBaseSimulador
  // Par interestadual
  ufOrigem: string
  ufDestino: string
  // Quantidade e Embalagem
  quantidade: number
  embalagem?: string
  unidade?: string
  // Comercial
  precoUnitario: number // Na moeda do produto (BRL ou USD)
  moeda?: 'BRL' | 'USD'
  ptaxManual?: number // Cotação do Dólar informada manualmente pelo usuário
  frete?: number // R$
  seguro?: number // R$
  outrasDespesas?: number // R$
  margemComercialPerc?: number // % de margem desejada sobre o custo
  // Parâmetros Fiscais Opcionais
  regraIcms?: RegraIcmsSimulador | null
  aliquotaPisManual?: number
  aliquotaCofinsManual?: number
  aliquotaIbsManual?: number
  aliquotaCbsManual?: number
  regimeTributario?: 'nao_cumulativo' | 'cumulativo'
  considerarReoneracao2026?: boolean
}

export interface DetalhamentoTributo {
  nome: string
  baseCalculo: number
  aliquotaNominal: number
  aliquotaEfetiva: number
  reducaoBasePerc?: number
  diferimentoPerc?: number
  valorImposto: number
  fundamentacao: string
  observacoes?: string
}

export interface SimuladorResultado {
  // Identificação
  produtoNome: string
  codigoProduto: string
  ncm: string
  ufOrigem: string
  ufDestino: string
  operacao: 'Interna' | 'Interestadual'
  isImportado: boolean

  // Câmbio
  moedaOriginal: 'BRL' | 'USD'
  ptaxAplicada: number
  valorUnitarioOriginal: number
  valorUnitarioReais: number

  // Volume / Faturamento
  quantidade: number
  unidade: string
  valorMercadoriaOriginal: number
  valorMercadoriaReais: number

  // Custos Acessórios (em R$)
  frete: number
  seguro: number
  outrasDespesas: number
  totalDespesasAcessorias: number

  // Base de Cálculo Comercial
  valorTotalOperacao: number // Mercadoria + Acessórias

  // Tributos destacados
  icms: DetalhamentoTributo
  temRegraIcms: boolean
  avisoIcms?: string

  pis: DetalhamentoTributo
  cofins: DetalhamentoTributo
  ibs: DetalhamentoTributo
  cbs: DetalhamentoTributo

  totalTributos: number
  cargaTributariaEfetivaPerc: number

  // Formação de Preço e Custo
  custoTotalComTributos: number
  precoVendaSugerido: number
  margemLucroValor: number
  margemLucroPerc: number

  // Alertas e Mensagens de Auditoria
  alertas: string[]
  memoriaCalculo: string[]
}

/**
 * Executa o cálculo comercial completo
 */
export function executarCalculoSimulador(input: SimuladorInput): SimuladorResultado {
  const alertas: string[] = []
  const memoriaCalculo: string[] = []

  const produto = input.produto
  const desc = produto.descricao || 'Produto Base'
  const cod = produto.codigo || 'S/C'
  const ncm = produto.ncm || '3808.93.29'
  const unid = input.unidade || produto.unidade || 'L'
  const qtd = Math.max(0, Number(input.quantidade) || 0)

  // 1. Identificar se é produto importado e conversão cambial
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
        'Produto importado cotado em dólar (USD): informe a cotação PTAX manual para o cálculo em reais.',
      )
    }
    ptaxAplicada = ptax > 0 ? ptax : 1.0
    valorUnitarioReais = precoUnitarioOriginal * ptaxAplicada
    memoriaCalculo.push(
      `Câmbio PTAX manual: US$ ${precoUnitarioOriginal.toFixed(2)} × R$ ${ptaxAplicada.toFixed(4)} = R$ ${valorUnitarioReais.toFixed(2)} / ${unid}`,
    )
  } else {
    memoriaCalculo.push(
      `Preço unitário em moeda nacional: R$ ${valorUnitarioReais.toFixed(2)} / ${unid}`,
    )
  }

  // 2. Composição da mercadoria e despesas
  const valorMercadoriaOriginal = qtd * precoUnitarioOriginal
  const valorMercadoriaReais = qtd * valorUnitarioReais

  const frete = Math.max(0, Number(input.frete) || 0)
  const seguro = Math.max(0, Number(input.seguro) || 0)
  const outrasDespesas = Math.max(0, Number(input.outrasDespesas) || 0)
  const totalDespesasAcessorias = frete + seguro + outrasDespesas

  // Base comercial em R$
  const valorTotalOperacao = valorMercadoriaReais + totalDespesasAcessorias
  memoriaCalculo.push(
    `Mercadoria: R$ ${valorMercadoriaReais.toFixed(2)} + Despesas (Frete/Seguro/Outros): R$ ${totalDespesasAcessorias.toFixed(2)} = Base Comercial R$ ${valorTotalOperacao.toFixed(2)}`,
  )

  // 3. Regra de ICMS Origem -> Destino
  const ufOrigem = (input.ufOrigem || 'SP').trim().toUpperCase()
  const ufDestino = (input.ufDestino || 'MT').trim().toUpperCase()
  const operacao: 'Interna' | 'Interestadual' = ufOrigem === ufDestino ? 'Interna' : 'Interestadual'

  let icmsDetalhe: DetalhamentoTributo
  let temRegraIcms = false
  let avisoIcms: string | undefined

  if (input.regraIcms) {
    temRegraIcms = true
    const r = input.regraIcms
    const aliqNominal = Number(r.aliquota_icms) || 0
    const redBasePerc = Number(r.reducao_base) || 0
    const diferimento = !!r.diferimento
    const difPerc = Number(r.percentual_diferimento) || (diferimento ? 100 : 0)

    // Base de cálculo com redução
    const baseCalculoIcms = valorTotalOperacao * (1 - redBasePerc / 100)
    let aliqEfetiva =
      r.aliquota_efetiva !== undefined && r.aliquota_efetiva !== null
        ? Number(r.aliquota_efetiva)
        : aliqNominal * (1 - redBasePerc / 100)

    let valorIcms = baseCalculoIcms * (aliqNominal / 100)

    // Aplicação de diferimento se houver
    if (diferimento || difPerc > 0) {
      const valorDiferido = valorIcms * (difPerc / 100)
      valorIcms = Math.max(0, valorIcms - valorDiferido)
      aliqEfetiva = aliqEfetiva * (1 - difPerc / 100)
    }

    icmsDetalhe = {
      nome: 'ICMS',
      baseCalculo: baseCalculoIcms,
      aliquotaNominal: aliqNominal,
      aliquotaEfetiva: aliqEfetiva,
      reducaoBasePerc: redBasePerc,
      diferimentoPerc: difPerc,
      valorImposto: valorIcms,
      fundamentacao:
        r.fundamentacao_legal ||
        (operacao === 'Interna'
          ? `Operação Interna ${ufOrigem}`
          : `Convênio ICMS 100/97 e alterações (${ufOrigem} → ${ufDestino})`),
      observacoes: diferimento
        ? `Diferimento de ${difPerc}% aplicado`
        : redBasePerc > 0
          ? `Redução de base de ${redBasePerc}%`
          : 'Tributação normal',
    }

    memoriaCalculo.push(
      `ICMS (${ufOrigem} → ${ufDestino}): Alíquota nominal ${aliqNominal.toFixed(2)}%, Redução de base ${redBasePerc}%, Efetiva ${aliqEfetiva.toFixed(2)}% → R$ ${valorIcms.toFixed(2)}`,
    )
  } else {
    temRegraIcms = false
    avisoIcms = `Sem regra de ICMS para origem ${ufOrigem} → destino ${ufDestino}. Importe a aba 'Regra ICMS' na central de importação ou cadastre a regra correspondente.`
    alertas.push(avisoIcms)

    // Fallback conservador padrão interestadual
    const aliqPadrao =
      operacao === 'Interna'
        ? 18
        : ['SP', 'RJ', 'MG', 'PR', 'RS', 'SC'].includes(ufOrigem) &&
            !['SP', 'RJ', 'MG', 'PR', 'RS', 'SC'].includes(ufDestino)
          ? 7
          : 12
    icmsDetalhe = {
      nome: 'ICMS (Estimativa sem regra)',
      baseCalculo: valorTotalOperacao,
      aliquotaNominal: aliqPadrao,
      aliquotaEfetiva: aliqPadrao,
      reducaoBasePerc: 0,
      diferimentoPerc: 0,
      valorImposto: valorTotalOperacao * (aliqPadrao / 100),
      fundamentacao:
        'Alíquota padrão interestadual estimada (regra origem→destino não cadastrada no banco)',
      observacoes: 'Atenção: valor estimado — cadastre a regra específica para precisão fiscal.',
    }
    memoriaCalculo.push(
      `Aviso: Regra de ICMS não encontrada para ${ufOrigem} → ${ufDestino}. Aplicada alíquota estimada de ${aliqPadrao}%.`,
    )
  }

  // 4. PIS e COFINS (temporalidade agro)
  // Lei 10.925/2004 vs LC 224/2025 (reoneração linear de 10% a partir de 01/04/2026)
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

  const valorPis = valorTotalOperacao * (aliqPisPadrao / 100)
  const valorCofins = valorTotalOperacao * (aliqCofinsPadrao / 100)

  const pisDetalhe: DetalhamentoTributo = {
    nome: 'PIS',
    baseCalculo: valorTotalOperacao,
    aliquotaNominal: aliqPisPadrao,
    aliquotaEfetiva: aliqPisPadrao,
    valorImposto: valorPis,
    fundamentacao: considerarReoneracao
      ? 'LC 224/2025: reoneração linear de 10% do PIS (0,165% no Lucro Real pós-Abr/2026)'
      : 'Lei 10.925/2004: alíquota zero até Mar/2026',
  }

  const cofinsDetalhe: DetalhamentoTributo = {
    nome: 'COFINS',
    baseCalculo: valorTotalOperacao,
    aliquotaNominal: aliqCofinsPadrao,
    aliquotaEfetiva: aliqCofinsPadrao,
    valorImposto: valorCofins,
    fundamentacao: considerarReoneracao
      ? 'LC 224/2025: reoneração linear de 10% da COFINS (0,760% no Lucro Real pós-Abr/2026)'
      : 'Lei 10.925/2004: alíquota zero até Mar/2026',
  }

  memoriaCalculo.push(
    `PIS/COFINS: PIS ${aliqPisPadrao.toFixed(3)}% (R$ ${valorPis.toFixed(2)}) + COFINS ${aliqCofinsPadrao.toFixed(3)}% (R$ ${valorCofins.toFixed(2)}) [Carga total 0,925%]`,
  )

  // 5. IBS e CBS (Transição Reforma Tributária LC 214/2025 - Período de teste)
  // Alíquotas de teste 2026: 0,1% IBS + 0,9% CBS com redução de 60% para insumos agropecuários (Art. 138 e Anexo IX)
  const aliqIbsNominal = input.aliquotaIbsManual !== undefined ? input.aliquotaIbsManual : 0.1
  const aliqCbsNominal = input.aliquotaCbsManual !== undefined ? input.aliquotaCbsManual : 0.9
  const reducaoReformaPerc = 60 // 60% de redução no Agro
  const aliqIbsEfetiva = aliqIbsNominal * (1 - reducaoReformaPerc / 100)
  const aliqCbsEfetiva = aliqCbsNominal * (1 - reducaoReformaPerc / 100)

  const valorIbs = valorTotalOperacao * (aliqIbsEfetiva / 100)
  const valorCbs = valorTotalOperacao * (aliqCbsEfetiva / 100)

  const ibsDetalhe: DetalhamentoTributo = {
    nome: 'IBS (Reforma)',
    baseCalculo: valorTotalOperacao * (1 - reducaoReformaPerc / 100),
    aliquotaNominal: aliqIbsNominal,
    aliquotaEfetiva: aliqIbsEfetiva,
    reducaoBasePerc: reducaoReformaPerc,
    valorImposto: valorIbs,
    fundamentacao: 'LC 214/2025 Art. 138 e Anexo IX (Redução de 60% para insumos agropecuários)',
  }

  const cbsDetalhe: DetalhamentoTributo = {
    nome: 'CBS (Reforma)',
    baseCalculo: valorTotalOperacao * (1 - reducaoReformaPerc / 100),
    aliquotaNominal: aliqCbsNominal,
    aliquotaEfetiva: aliqCbsEfetiva,
    reducaoBasePerc: reducaoReformaPerc,
    valorImposto: valorCbs,
    fundamentacao: 'LC 214/2025 Art. 138 e Anexo IX (Redução de 60% para insumos agropecuários)',
  }

  // Total de tributos da operação
  const totalTributos = icmsDetalhe.valorImposto + valorPis + valorCofins + valorIbs + valorCbs
  const cargaTributariaEfetivaPerc =
    valorTotalOperacao > 0 ? (totalTributos / valorTotalOperacao) * 100 : 0

  // 6. Formação do Custo Total e Preço Sugerido com Margem
  const custoTotalComTributos = valorTotalOperacao + totalTributos
  const margemPerc = Number(input.margemComercialPerc) || 0
  const precoVendaSugerido =
    margemPerc > 0 && margemPerc < 100
      ? custoTotalComTributos / (1 - margemPerc / 100) // Margem por dentro (mark-up comercial padrão)
      : custoTotalComTributos * (1 + margemPerc / 100)

  const margemLucroValor = precoVendaSugerido - custoTotalComTributos

  memoriaCalculo.push(
    `Total Tributos: R$ ${totalTributos.toFixed(2)} (${cargaTributariaEfetivaPerc.toFixed(2)}% da operação)`,
  )
  memoriaCalculo.push(
    `Custo Final: R$ ${custoTotalComTributos.toFixed(2)} | Preço Sugerido: R$ ${precoVendaSugerido.toFixed(2)} (Margem ${margemPerc.toFixed(1)}%)`,
  )

  return {
    produtoNome: desc,
    codigoProduto: cod,
    ncm,
    ufOrigem,
    ufDestino,
    operacao,
    isImportado,
    moedaOriginal,
    ptaxAplicada,
    valorUnitarioOriginal: precoUnitarioOriginal,
    valorUnitarioReais,
    quantidade: qtd,
    unidade: unid,
    valorMercadoriaOriginal,
    valorMercadoriaReais,
    frete,
    seguro,
    outrasDespesas,
    totalDespesasAcessorias,
    valorTotalOperacao,
    icms: icmsDetalhe,
    temRegraIcms,
    avisoIcms,
    pis: pisDetalhe,
    cofins: cofinsDetalhe,
    ibs: ibsDetalhe,
    cbs: cbsDetalhe,
    totalTributos,
    cargaTributariaEfetivaPerc,
    custoTotalComTributos,
    precoVendaSugerido,
    margemLucroValor,
    margemLucroPerc: margemPerc,
    alertas,
    memoriaCalculo,
  }
}
