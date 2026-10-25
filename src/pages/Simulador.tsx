import React, { useState, useEffect, useMemo } from 'react'
import {
  Calculator,
  Search,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Percent,
  FileSpreadsheet,
  Layers,
  Package,
  Compass,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Truck,
  ShieldCheck,
  Receipt,
  Scale,
  ListOrdered,
  RotateCcw,
  BadgePercent,
  Landmark,
  Coins,
  Calendar,
  Clock,
  ArrowRight,
  ShoppingCart,
  TrendingDown,
  PiggyBank,
  CircleDollarSign,
  Briefcase,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { AbaBaseProdutos } from '@/pages/simulador/AbaBaseProdutos'
import { AbaRegrasFiscais } from '@/pages/simulador/AbaRegrasFiscais'
import {
  listarProdutosBaseSimulador,
  obterRegraIcmsSimulador,
  SimProdutoBaseItem,
  SimRegraIcmsItem,
} from '@/services/agroService'
import {
  executarCalculoSimulador,
  SimuladorResultado,
  ProdutoBaseSimulador,
  EnquadramentoCliente,
  ModalidadeFrete,
  deduzirCapacidadeEmbalagem,
  formatarDataIso,
  calcularDataVencimento,
} from '@/lib/motorSimulador'

// Lista canônica de UFs do Brasil
const UFS_BRASIL = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]

// Produtos de exemplo/fallback para testes caso a coleção esteja vazia
const PRODUTOS_SEED_DEMO: ProdutoBaseSimulador[] = [
  {
    codigo: '007243',
    descricao: 'SYNPROLE 480 SC 1X20L (IMP) SS',
    ncm: '3808.92.99',
    unidade: 'L',
    tipo_produto: 'Produto Formulado Comercial',
    origem: 'Importado',
    embalagem: '1X20L',
    principio_ativo: 'Azoxistrobina + Flutriafol',
    fabricante: 'Syngenta',
    moeda: 'USD',
    preco_base_sugerido: 8.5,
    gr_trib: '001',
    comissao_padrao: 0.015,
  },
  {
    codigo: '002094',
    descricao: 'ROUNDUP WG - Saco 20 kg (Glifosato 720 g/kg)',
    ncm: '3808.93.24',
    unidade: 'KG',
    tipo_produto: 'Herbicida Granulado Dispersível',
    origem: 'Nacional',
    embalagem: 'Saco 20 kg',
    principio_ativo: 'Glifosato (Sal de Amônio)',
    fabricante: 'Bayer S.A.',
    moeda: 'BRL',
    preco_base_sugerido: 40.0,
    gr_trib: 'DEF_AGRO',
    comissao_padrao: 0.025,
  },
  {
    codigo: '01119',
    descricao: 'ROUNDUP ORIGINAL MAIS - Bombona 20 L (Glifosato 480 g/L)',
    ncm: '3808.93.29',
    unidade: 'L',
    tipo_produto: 'Herbicida Líquido Concentrado',
    origem: 'Nacional',
    embalagem: 'Bombona 20 L',
    principio_ativo: 'Glifosato (Sal Dipotássico)',
    fabricante: 'Bayer S.A.',
    moeda: 'BRL',
    preco_base_sugerido: 28.0,
    gr_trib: 'DEF_AGRO',
    comissao_padrao: 0.025,
  },
]

export function Simulador() {
  const { toast } = useToast()

  // Estados dos dados do banco
  const [produtos, setProdutos] = useState<SimProdutoBaseItem[]>([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(false)
  const [termoBuscaProduto, setTermoBuscaProduto] = useState('')

  // 1. PRODUTO & VOLUME GERAL DO LOTE
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoBaseSimulador | null>(null)
  const [quantidade, setQuantidade] = useState<number>(1000)
  const [qtdEmbalagens, setQtdEmbalagens] = useState<number>(50)
  const [volumePorEmbalagem, setVolumePorEmbalagem] = useState<number>(20)
  const [modoEdicaoQtd, setModoEdicaoQtd] = useState<'volume' | 'embalagens'>('volume')

  // Câmbio PTAX manual (para insumos importados / cotados em USD)
  const [ptaxManual, setPtaxManual] = useState<number>(5.75)

  // ---------------------------------------------------------------------------
  // 2. OPERAÇÃO DE COMPRA (AQUISIÇÃO)
  // ---------------------------------------------------------------------------
  const hoje = formatarDataIso()
  const [dataCompra, setDataCompra] = useState<string>(hoje)
  const [prazoCompraDias, setPrazoCompraDias] = useState<number>(30)
  const [precoUnitarioCompra, setPrecoUnitarioCompra] = useState<number>(28.0)
  const [moedaCompra, setMoedaCompra] = useState<'BRL' | 'USD'>('BRL')
  const [modalidadeFreteCompra, setModalidadeFreteCompra] = useState<ModalidadeFrete>('FOB')
  const [freteCompra, setFreteCompra] = useState<number>(1200)
  const [seguroCompra, setSeguroCompra] = useState<number>(200)
  const [outrasDespesasCompra, setOutrasDespesasCompra] = useState<number>(100)
  const [taxaJurosCompraMensal, setTaxaJurosCompraMensal] = useState<number>(1.2) // % a.m.
  const [creditarIcmsCompra, setCreditarIcmsCompra] = useState<boolean>(true)
  const [aliquotaIcmsCreditoCompra, setAliquotaIcmsCreditoCompra] = useState<number>(4.0)

  // ---------------------------------------------------------------------------
  // 3. OPERAÇÃO DE VENDA (REVENDA COMERCIAL)
  // ---------------------------------------------------------------------------
  const [dataVenda, setDataVenda] = useState<string>(hoje)
  const [prazoVendaDias, setPrazoVendaDias] = useState<number>(60)
  const [precoUnitarioVenda, setPrecoUnitarioVenda] = useState<number>(45.0)
  const [moedaVenda, setMoedaVenda] = useState<'BRL' | 'USD'>('BRL')
  const [ufOrigemVenda, setUfOrigemVenda] = useState<string>('SP')
  const [ufDestinoVenda, setUfDestinoVenda] = useState<string>('MT')
  const [enquadramentoCliente, setEnquadramentoCliente] =
    useState<EnquadramentoCliente>('produtor_rural')
  const [modalidadeFreteVenda, setModalidadeFreteVenda] = useState<ModalidadeFrete>('CIF')
  const [freteVenda, setFreteVenda] = useState<number>(2500)
  const [seguroVenda, setSeguroVenda] = useState<number>(350)
  const [outrasDespesasVenda, setOutrasDespesasVenda] = useState<number>(150)
  const [comissaoVendaPerc, setComissaoVendaPerc] = useState<number>(2.5)
  const [taxaJurosVendaMensal, setTaxaJurosVendaMensal] = useState<number>(1.8) // % a.m.
  const [margemAlvoPerc, setMargemAlvoPerc] = useState<number>(15)

  // Parâmetros fiscais de venda (Reforma / LC 224 / LC 214)
  const [considerarReoneracao2026, setConsiderarReoneracao2026] = useState<boolean>(true)
  const [usarAliquotaReformaPlena, setUsarAliquotaReformaPlena] = useState<boolean>(false)

  // Abas de navegação principal
  const [abaAtiva, setAbaAtiva] = useState<string>('simulacao')

  // Resultados
  const [calculando, setCalculando] = useState<boolean>(false)
  const [, setRegraIcmsAtual] = useState<SimRegraIcmsItem | null>(null)
  const [resultado, setResultado] = useState<SimuladorResultado | null>(null)
  const [mostrarMemoriaCalculo, setMostrarMemoriaCalculo] = useState<boolean>(false)

  // Vencimentos calculados dinamicamente para exibição no formulário
  const vencimentoCompraCalculado = useMemo(() => {
    return calcularDataVencimento(dataCompra, prazoCompraDias)
  }, [dataCompra, prazoCompraDias])

  const vencimentoVendaCalculado = useMemo(() => {
    return calcularDataVencimento(dataVenda, prazoVendaDias)
  }, [dataVenda, prazoVendaDias])

  // Juros efetivos proporcionais ao prazo (pró-rata 30 dias)
  const jurosCompraEfetivoPerc = useMemo(() => {
    return (taxaJurosCompraMensal / 30) * prazoCompraDias
  }, [taxaJurosCompraMensal, prazoCompraDias])

  const jurosVendaEfetivoPerc = useMemo(() => {
    return (taxaJurosVendaMensal / 30) * prazoVendaDias
  }, [taxaJurosVendaMensal, prazoVendaDias])

  // Sincronizar quantidade de embalagens quando o volume muda
  const handleAlterarVolume = (novoVolume: number) => {
    setQuantidade(novoVolume)
    setModoEdicaoQtd('volume')
    if (volumePorEmbalagem > 0) {
      setQtdEmbalagens(Math.ceil(novoVolume / volumePorEmbalagem))
    }
  }

  const handleAlterarQtdEmbalagens = (novasEmbalagens: number) => {
    setQtdEmbalagens(novasEmbalagens)
    setModoEdicaoQtd('embalagens')
    if (volumePorEmbalagem > 0) {
      setQuantidade(novasEmbalagens * volumePorEmbalagem)
    }
  }

  const handleAlterarVolumePorEmbalagem = (novoVolEmb: number) => {
    setVolumePorEmbalagem(novoVolEmb)
    if (novoVolEmb > 0) {
      if (modoEdicaoQtd === 'embalagens') {
        setQuantidade(qtdEmbalagens * novoVolEmb)
      } else {
        setQtdEmbalagens(Math.ceil(quantidade / novoVolEmb))
      }
    }
  }

  // Carrega lista de produtos de sim_produtos_base
  const carregarProdutos = async () => {
    try {
      setCarregandoProdutos(true)
      const res = await listarProdutosBaseSimulador({ perPage: 100, sort: 'descricao' })
      if (res.items && res.items.length > 0) {
        setProdutos(res.items)
        if (!produtoSelecionado) {
          selecionarProduto(res.items[0])
        }
      } else {
        if (!produtoSelecionado) {
          selecionarProduto(PRODUTOS_SEED_DEMO[0])
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('Coleção sim_produtos_base:', msg)
      if (!produtoSelecionado) {
        selecionarProduto(PRODUTOS_SEED_DEMO[0])
      }
    } finally {
      setCarregandoProdutos(false)
    }
  }

  useEffect(() => {
    carregarProdutos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Selecionar produto
  const selecionarProduto = (prod: ProdutoBaseSimulador) => {
    setProdutoSelecionado(prod)
    const isImp =
      prod.origem?.toLowerCase().includes('imp') ||
      prod.descricao.toUpperCase().includes('(IMP)') ||
      prod.moeda?.toUpperCase() === 'USD'

    const novaMoeda = isImp ? 'USD' : 'BRL'
    setMoedaCompra(novaMoeda)
    setMoedaVenda(novaMoeda)

    const precoBase =
      prod.preco_base_sugerido && prod.preco_base_sugerido > 0 ? prod.preco_base_sugerido : 30
    setPrecoUnitarioCompra(precoBase)
    setPrecoUnitarioVenda(Number((precoBase * 1.35).toFixed(2))) // Margem inicial sugerida 35%

    // Comissão padrão sugerida do produto do banco
    if (
      prod.comissao_padrao !== undefined &&
      prod.comissao_padrao !== null &&
      prod.comissao_padrao > 0
    ) {
      const comissaoCalc =
        prod.comissao_padrao < 1 ? prod.comissao_padrao * 100 : prod.comissao_padrao
      setComissaoVendaPerc(comissaoCalc)
    }

    // Capacidade da embalagem
    const cap = deduzirCapacidadeEmbalagem(prod.embalagem)
    setVolumePorEmbalagem(cap)
    if (cap > 0 && quantidade > 0) {
      setQtdEmbalagens(Math.ceil(quantidade / cap))
    }
  }

  // Lista de produtos filtrada para busca rápida
  const produtosDisponiveis = useMemo(() => {
    const lista = produtos.length > 0 ? produtos : PRODUTOS_SEED_DEMO
    if (!termoBuscaProduto.trim()) return lista.slice(0, 30)
    const t = termoBuscaProduto.toLowerCase()
    return lista.filter(
      (p) =>
        p.descricao.toLowerCase().includes(t) ||
        (p.ncm && p.ncm.includes(t)) ||
        (p.codigo && p.codigo.toLowerCase().includes(t)) ||
        (p.principio_ativo && p.principio_ativo.toLowerCase().includes(t)),
    )
  }, [produtos, termoBuscaProduto])

  const isProdutoImportado =
    moedaCompra === 'USD' ||
    moedaVenda === 'USD' ||
    produtoSelecionado?.origem?.toLowerCase().includes('imp') ||
    produtoSelecionado?.descricao.toUpperCase().includes('(IMP)')

  // Executa Simulação Comercial Segregada (Compra, Venda e Resultado)
  const handleSimular = async () => {
    if (!produtoSelecionado) {
      toast({
        title: 'Selecione um Produto',
        description: 'Escolha um item da base para realizar a simulação comercial.',
        variant: 'destructive',
      })
      return
    }

    if (isProdutoImportado && (!ptaxManual || ptaxManual <= 0)) {
      toast({
        title: 'PTAX Manual Obrigatória',
        description:
          'Para produtos importados cotados em dólar (USD), informe a cotação PTAX manual.',
        variant: 'destructive',
      })
      return
    }

    setCalculando(true)
    try {
      const resRegra = await obterRegraIcmsSimulador(
        ufOrigemVenda,
        ufDestinoVenda,
        produtoSelecionado.gr_trib,
      )
      const regra = resRegra.regra
      setRegraIcmsAtual(regra)

      const res = executarCalculoSimulador({
        produto: produtoSelecionado,
        quantidade,
        qtdEmbalagens,
        volumePorEmbalagem,
        unidade: produtoSelecionado.unidade,
        embalagem: produtoSelecionado.embalagem,
        ptaxManual: isProdutoImportado ? ptaxManual : 1.0,

        // Bloco Segregado de COMPRA
        compra: {
          dataOperacao: dataCompra,
          prazoDias: prazoCompraDias,
          precoUnitario: precoUnitarioCompra,
          moeda: moedaCompra,
          ptaxManual: isProdutoImportado ? ptaxManual : 1.0,
          modalidadeFrete: modalidadeFreteCompra,
          frete: freteCompra,
          seguro: seguroCompra,
          outrasDespesas: outrasDespesasCompra,
          taxaJurosMensalPerc: taxaJurosCompraMensal,
          creditarIcms: creditarIcmsCompra,
          aliquotaIcmsCreditoManual: aliquotaIcmsCreditoCompra,
        },

        // Bloco Segregado de VENDA
        venda: {
          dataOperacao: dataVenda,
          prazoDias: prazoVendaDias,
          precoUnitario: precoUnitarioVenda,
          moeda: moedaVenda,
          ptaxManual: isProdutoImportado ? ptaxManual : 1.0,
          ufOrigem: ufOrigemVenda,
          ufDestino: ufDestinoVenda,
          enquadramentoCliente,
          modalidadeFrete: modalidadeFreteVenda,
          frete: freteVenda,
          seguro: seguroVenda,
          outrasDespesas: outrasDespesasVenda,
          comissaoPerc: comissaoVendaPerc,
          taxaJurosMensalPerc: taxaJurosVendaMensal,
          margemAlvoPerc,
          regraIcms: regra,
          considerarReoneracao2026,
          usarAliquotaReformaPlena,
        },
      })

      setResultado(res)

      if (!res.temRegraIcms) {
        toast({
          title: 'Aviso: Regra ICMS não cadastrada',
          description: `Sem regra específica para ${ufOrigemVenda} → ${ufDestinoVenda}. Foi aplicada alíquota padrão estimada.`,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar simulação.'
      toast({
        title: 'Erro na Simulação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCalculando(false)
    }
  }

  // Executa simulação automática ao carregar ou alterar parâmetros centrais
  useEffect(() => {
    if (produtoSelecionado) {
      handleSimular()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    produtoSelecionado,
    ufOrigemVenda,
    ufDestinoVenda,
    modalidadeFreteVenda,
    modalidadeFreteCompra,
    enquadramentoCliente,
    considerarReoneracao2026,
    usarAliquotaReformaPlena,
  ])

  // Resetar valores do formulário para valores padrão
  const handleResetarFormulario = () => {
    setQuantidade(1000)
    setQtdEmbalagens(50)
    setVolumePorEmbalagem(20)
    setDataCompra(hoje)
    setPrazoCompraDias(30)
    setModalidadeFreteCompra('FOB')
    setFreteCompra(1200)
    setSeguroCompra(200)
    setOutrasDespesasCompra(100)
    setTaxaJurosCompraMensal(1.2)
    setDataVenda(hoje)
    setPrazoVendaDias(60)
    setModalidadeFreteVenda('CIF')
    setFreteVenda(2500)
    setSeguroVenda(350)
    setOutrasDespesasVenda(150)
    setComissaoVendaPerc(2.5)
    setTaxaJurosVendaMensal(1.8)
    setMargemAlvoPerc(15)
    setPtaxManual(5.75)
    setEnquadramentoCliente('produtor_rural')
    if (produtoSelecionado?.preco_base_sugerido) {
      setPrecoUnitarioCompra(produtoSelecionado.preco_base_sugerido)
      setPrecoUnitarioVenda(Number((produtoSelecionado.preco_base_sugerido * 1.35).toFixed(2)))
    }
    toast({
      title: 'Valores redefinidos',
      description: 'Variáveis das operações de compra e venda voltaram ao padrão.',
    })
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 pb-16 animate-in fade-in duration-200">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DCE5DC] pb-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#1B5E20] text-white shadow-sm ring-1 ring-emerald-900/10">
                <Calculator className="w-6 h-6 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[#1C2B1C]">
                    Simulador Comercial Agro
                  </h1>
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold text-xs">
                    Compra & Venda Segregadas
                  </Badge>
                </div>
                <p className="text-sm text-[#5A6D5A]">
                  Simulação segregada da operação de aquisição (compra) e revenda (venda), com
                  datas, vencimento, juros de prazo, tributos interestaduais e resultado da
                  operação.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={carregarProdutos}
              disabled={carregandoProdutos}
              className="border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50 h-9"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 text-[#1B5E20] ${carregandoProdutos ? 'animate-spin' : ''}`}
              />
              Atualizar Base
            </Button>
            <Button
              onClick={handleSimular}
              disabled={calculando}
              className="bg-[#1B5E20] hover:bg-[#154a19] text-white shadow-sm font-semibold h-9 px-4"
            >
              <Sparkles className="w-4 h-4 mr-2 text-amber-300" />
              {calculando ? 'Calculando...' : 'Simular Operação'}
            </Button>
          </div>
        </div>

        {/* Navegação por Abas */}
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="w-full space-y-6">
          <TabsList className="bg-[#F5F7F1] border border-[#DCE5DC] p-1 h-auto grid grid-cols-3 max-w-xl rounded-xl">
            <TabsTrigger
              value="simulacao"
              className="flex items-center gap-2 py-2 text-xs font-semibold data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-lg transition-all"
            >
              <Calculator className="w-4 h-4" />
              <span>Simulação</span>
            </TabsTrigger>

            <TabsTrigger
              value="produtos"
              className="flex items-center gap-2 py-2 text-xs font-semibold data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-lg transition-all"
            >
              <Package className="w-4 h-4" />
              <span>Base de Produtos</span>
            </TabsTrigger>

            <TabsTrigger
              value="regras"
              className="flex items-center gap-2 py-2 text-xs font-semibold data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-lg transition-all"
            >
              <Layers className="w-4 h-4" />
              <span>Regras Fiscais</span>
            </TabsTrigger>
          </TabsList>

          {/* =================================================================== */}
          {/* ABA 1: SIMULAÇÃO COM COMPRA E VENDA SEGREGADAS                     */}
          {/* =================================================================== */}
          <TabsContent value="simulacao" className="mt-0 space-y-6">
            <Card className="border-[#DCE5DC] shadow-sm bg-white overflow-hidden">
              <CardHeader className="bg-[#F8FAF6] border-b border-[#DCE5DC] py-4 px-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 text-[#1B5E20]">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-[#1C2B1C]">
                        Parâmetros da Operação Comercial Segregada
                      </CardTitle>
                      <CardDescription className="text-xs text-[#5A6D5A]">
                        Configure o insumo, volume do lote e os dois blocos distintos (Operação de
                        Compra e Operação de Venda) para apurar o resultado real.
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleResetarFormulario}
                      className="text-xs text-[#5A6D5A] hover:text-[#1C2B1C] hover:bg-[#F0F4EC] h-8 px-2.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Redefinir
                    </Button>
                    <Badge
                      variant="outline"
                      className="text-[11px] font-mono bg-white text-[#1B5E20] border-emerald-300"
                    >
                      53 Linhas Excel
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* ----------------------------------------------------------- */}
                {/* SEÇÃO 1: PRODUTO BASE & VOLUME DO LOTE                      */}
                {/* ----------------------------------------------------------- */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white text-xs font-bold flex items-center justify-center">
                        1
                      </div>
                      <h2 className="text-sm font-bold text-[#1C2B1C] uppercase tracking-wide">
                        Insumo Agropecuário & Volume do Lote
                      </h2>
                    </div>
                    <span className="text-[11px] text-[#5A6D5A]">
                      {produtos.length > 0 ? `${produtos.length} produtos na base` : 'Base local'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    {/* Busca de Produtos */}
                    <div className="lg:col-span-7 space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <Input
                          placeholder="Buscar por descrição, NCM, código Protheus ou princípio ativo..."
                          value={termoBuscaProduto}
                          onChange={(e) => setTermoBuscaProduto(e.target.value)}
                          className="pl-9 text-xs h-9 border-[#DCE5DC] focus-visible:ring-[#1B5E20] bg-[#FCFDFB]"
                        />
                        {termoBuscaProduto && (
                          <button
                            type="button"
                            onClick={() => setTermoBuscaProduto('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      <div className="max-h-44 overflow-y-auto border border-[#DCE5DC] rounded-lg divide-y divide-gray-100 bg-white shadow-inner">
                        {produtosDisponiveis.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-500">
                            Nenhum produto encontrado para "{termoBuscaProduto}".
                          </div>
                        ) : (
                          produtosDisponiveis.map((p, idx) => {
                            const isSelected =
                              produtoSelecionado?.codigo === p.codigo &&
                              produtoSelecionado?.descricao === p.descricao
                            return (
                              <button
                                key={p.id || p.codigo || idx}
                                type="button"
                                onClick={() => selecionarProduto(p)}
                                className={`w-full text-left p-2.5 transition-all flex items-start justify-between gap-3 text-xs ${
                                  isSelected
                                    ? 'bg-emerald-50 border-l-4 border-l-[#1B5E20] text-[#0D2811]'
                                    : 'hover:bg-gray-50 text-gray-700'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold truncate leading-tight text-gray-900">
                                    {p.descricao}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500 mt-1">
                                    {p.codigo && (
                                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-medium">
                                        Cód: {p.codigo}
                                      </span>
                                    )}
                                    <span className="font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded">
                                      NCM {p.ncm || 'S/NCM'}
                                    </span>
                                    <span>•</span>
                                    <span>Origem: {p.origem || 'Nac'}</span>
                                    {p.gr_trib && (
                                      <span className="bg-blue-50 text-blue-700 px-1 rounded font-mono">
                                        GrTrib {p.gr_trib}
                                      </span>
                                    )}
                                    {p.moeda && (
                                      <span className="font-bold text-emerald-700 font-mono">
                                        ({p.moeda})
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="flex items-center gap-1 text-[#1B5E20] shrink-0 font-medium text-[11px] mt-0.5">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span className="hidden sm:inline">Selecionado</span>
                                  </div>
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>

                    {/* Card do Produto Selecionado */}
                    <div className="lg:col-span-5">
                      {produtoSelecionado ? (
                        <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-50/90 via-emerald-50/50 to-white border border-emerald-200/80 shadow-xs space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                                Produto Selecionado
                              </span>
                              <h3 className="font-bold text-xs text-[#0D2811] line-clamp-2 mt-0.5">
                                {produtoSelecionado.descricao}
                              </h3>
                            </div>
                            <Badge className="bg-[#1B5E20] text-white text-[10px] shrink-0">
                              {produtoSelecionado.unidade || 'L'}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-emerald-200/50">
                            <div>
                              <span className="text-gray-500 block text-[10px]">NCM:</span>
                              <span className="font-mono font-semibold text-gray-800">
                                {produtoSelecionado.ncm || '3808.93.29'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 block text-[10px]">GrTrib:</span>
                              <span className="font-mono font-semibold text-gray-800">
                                {produtoSelecionado.gr_trib || '001'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 block text-[10px]">Embalagem:</span>
                              <span className="font-medium text-gray-800 truncate block">
                                {produtoSelecionado.embalagem || 'Padrão'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 block text-[10px]">Origem:</span>
                              <span className="font-medium text-gray-800 truncate block">
                                {produtoSelecionado.origem || 'Nacional'}
                              </span>
                            </div>
                          </div>

                          {/* Bloco PTAX Manual se for em moeda estrangeira ou importado */}
                          {isProdutoImportado && (
                            <div className="p-2 bg-amber-50 rounded-lg border border-amber-300 flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
                                <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                                <span>PTAX Manual (US$ 1,00 = R$):</span>
                              </div>
                              <Input
                                type="number"
                                step="0.0001"
                                min="0.0001"
                                value={ptaxManual}
                                onChange={(e) => setPtaxManual(Number(e.target.value))}
                                className="w-24 h-7 text-xs font-mono font-bold bg-white border-amber-300"
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-6 border border-dashed border-[#DCE5DC] rounded-xl text-center text-xs text-gray-500">
                          Selecione um produto na lista ao lado.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Volume e Embalagens do Lote */}
                  <div className="p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/40 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-emerald-950 flex items-center justify-between">
                        <span>Volume Total do Lote</span>
                        <span className="text-[10px] font-bold text-emerald-700">
                          {produtoSelecionado?.unidade || 'L'}
                        </span>
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={quantidade}
                        onChange={(e) => handleAlterarVolume(Math.max(1, Number(e.target.value)))}
                        className="text-xs h-9 bg-white border-emerald-200 font-bold text-gray-900"
                      />
                      <span className="text-[10px] text-gray-500 block">
                        Volume total negociado (L / Kg)
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-emerald-950 flex items-center justify-between">
                        <span>Capacidade por Embalagem</span>
                        <span className="text-[10px] text-gray-500 font-normal">
                          {produtoSelecionado?.unidade || 'L'}/emb.
                        </span>
                      </Label>
                      <Input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={volumePorEmbalagem}
                        onChange={(e) =>
                          handleAlterarVolumePorEmbalagem(Math.max(0.1, Number(e.target.value)))
                        }
                        className="text-xs h-9 bg-white border-emerald-200 font-semibold text-gray-900"
                      />
                      <span className="text-[10px] text-gray-500 block truncate">
                        Emb: {produtoSelecionado?.embalagem || 'Padrão'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-emerald-950 flex items-center justify-between">
                        <span>Qtd. Embalagens Físicas</span>
                        <span className="text-[10px] font-bold text-emerald-700">unidades</span>
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={qtdEmbalagens}
                        onChange={(e) =>
                          handleAlterarQtdEmbalagens(Math.max(1, Number(e.target.value)))
                        }
                        className="text-xs h-9 bg-white border-emerald-200 font-bold text-gray-900"
                      />
                      <span className="text-[10px] text-gray-500 block">
                        = {qtdEmbalagens} × {volumePorEmbalagem}{' '}
                        {produtoSelecionado?.unidade || 'L'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#DCE5DC]" />

                {/* ----------------------------------------------------------- */}
                {/* SEÇÃO 2: OPERAÇÃO DE COMPRA (AQUISIÇÃO)                     */}
                {/* ----------------------------------------------------------- */}
                <div className="p-4 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/40 via-white to-sky-50/20 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-200/80 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-sky-700 text-white text-xs font-bold flex items-center justify-center">
                        2
                      </div>
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-sky-700" />
                        <h2 className="text-sm font-bold text-sky-950 uppercase tracking-wide">
                          Operação de Compra (Aquisição do Produto)
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <Badge className="bg-sky-100 text-sky-900 border-sky-300 font-mono">
                        Vencimento: {vencimentoCompraCalculado} ({prazoCompraDias} dias)
                      </Badge>
                      <Badge className="bg-sky-50 text-sky-800 border-sky-200 font-mono">
                        Juros: {jurosCompraEfetivoPerc.toFixed(2)}% efetivo
                      </Badge>
                    </div>
                  </div>

                  {/* Campos da Compra */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {/* Data da Compra */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-sky-700" />
                        Data da Compra
                      </Label>
                      <Input
                        type="date"
                        value={dataCompra}
                        onChange={(e) => setDataCompra(e.target.value)}
                        className="h-8 text-xs border-sky-200 bg-white"
                      />
                    </div>

                    {/* Prazo de Pagamento (dias) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-sky-700" />
                          Prazo Compra (dias)
                        </span>
                        <span className="text-[10px] text-gray-500">Dias corridos</span>
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={prazoCompraDias}
                        onChange={(e) => setPrazoCompraDias(Math.max(0, Number(e.target.value)))}
                        className="h-8 text-xs font-semibold border-sky-200 bg-white"
                      />
                    </div>

                    {/* Preço Unitário de Compra */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center justify-between">
                        <span>Preço de Compra</span>
                        <Badge variant="outline" className="text-[10px] py-0 h-4 border-sky-300">
                          {moedaCompra}
                        </Badge>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={precoUnitarioCompra}
                        onChange={(e) => setPrecoUnitarioCompra(Number(e.target.value))}
                        className="h-8 text-xs font-bold border-sky-200 bg-white"
                      />
                    </div>

                    {/* Taxa de Juros de Compra (% a.m.) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Landmark className="w-3.5 h-3.5 text-sky-700" />
                          Juros Compra (% a.m.)
                        </span>
                        <span className="text-[10px] text-sky-700 font-bold">
                          {jurosCompraEfetivoPerc.toFixed(2)}% no prazo
                        </span>
                      </Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={taxaJurosCompraMensal}
                        onChange={(e) =>
                          setTaxaJurosCompraMensal(Math.max(0, Number(e.target.value)))
                        }
                        className="h-8 text-xs border-sky-200 bg-white"
                      />
                    </div>

                    {/* Modalidade Frete Compra */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-sky-700" />
                        Frete de Compra
                      </Label>
                      <select
                        value={modalidadeFreteCompra}
                        onChange={(e) =>
                          setModalidadeFreteCompra(e.target.value as ModalidadeFrete)
                        }
                        className="w-full h-8 text-xs rounded-md border border-sky-200 bg-white px-2 font-medium"
                      >
                        <option value="FOB">FOB (Adiciona no Custo da Compra)</option>
                        <option value="CIF">CIF (Já Incluso no Preço do Fornecedor)</option>
                      </select>
                    </div>

                    {/* Valor do Frete Compra */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800">
                        Valor do Frete (R$)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={freteCompra}
                        onChange={(e) => setFreteCompra(Math.max(0, Number(e.target.value)))}
                        className="h-8 text-xs border-sky-200 bg-white"
                      />
                    </div>

                    {/* Seguro & Outras Despesas Compra */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800">
                        Seguro & Outros (R$)
                      </Label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Input
                          type="number"
                          min="0"
                          value={seguroCompra}
                          onChange={(e) => setSeguroCompra(Math.max(0, Number(e.target.value)))}
                          placeholder="Seguro"
                          className="h-8 text-xs border-sky-200 bg-white"
                        />
                        <Input
                          type="number"
                          min="0"
                          value={outrasDespesasCompra}
                          onChange={(e) =>
                            setOutrasDespesasCompra(Math.max(0, Number(e.target.value)))
                          }
                          placeholder="Outros"
                          className="h-8 text-xs border-sky-200 bg-white"
                        />
                      </div>
                    </div>

                    {/* Crédito ICMS de Entrada */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center justify-between">
                        <span>Crédito ICMS Entrada (%)</span>
                        <span className="text-[10px] text-emerald-700 font-bold">
                          {creditarIcmsCompra ? 'Aproveita' : 'Não'}
                        </span>
                      </Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={aliquotaIcmsCreditoCompra}
                        onChange={(e) =>
                          setAliquotaIcmsCreditoCompra(Math.max(0, Number(e.target.value)))
                        }
                        className="h-8 text-xs border-sky-200 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* SEÇÃO 3: OPERAÇÃO DE VENDA (REVENDA)                        */}
                {/* ----------------------------------------------------------- */}
                <div className="p-4 rounded-xl border border-emerald-300 bg-gradient-to-br from-emerald-50/40 via-white to-emerald-50/20 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white text-xs font-bold flex items-center justify-center">
                        3
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#1B5E20]" />
                        <h2 className="text-sm font-bold text-emerald-950 uppercase tracking-wide">
                          Operação de Venda (Revenda Comercial ao Cliente)
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 font-mono">
                        Vencimento: {vencimentoVendaCalculado} ({prazoVendaDias} dias)
                      </Badge>
                      <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 font-mono">
                        Juros: {jurosVendaEfetivoPerc.toFixed(2)}% efetivo
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {/* Data da Venda */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#1B5E20]" />
                        Data da Venda
                      </Label>
                      <Input
                        type="date"
                        value={dataVenda}
                        onChange={(e) => setDataVenda(e.target.value)}
                        className="h-8 text-xs border-emerald-200 bg-white"
                      />
                    </div>

                    {/* Prazo de Pagamento Concedido ao Cliente (dias) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#1B5E20]" />
                          Prazo Venda (dias)
                        </span>
                        <span className="text-[10px] text-gray-500">Concedido</span>
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={prazoVendaDias}
                        onChange={(e) => setPrazoVendaDias(Math.max(0, Number(e.target.value)))}
                        className="h-8 text-xs font-semibold border-emerald-200 bg-white"
                      />
                    </div>

                    {/* Preço Unitário de Venda */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center justify-between">
                        <span>Preço de Venda</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 h-4 border-emerald-300"
                        >
                          {moedaVenda}
                        </Badge>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={precoUnitarioVenda}
                        onChange={(e) => setPrecoUnitarioVenda(Number(e.target.value))}
                        className="h-8 text-xs font-bold border-emerald-200 bg-white"
                      />
                    </div>

                    {/* Juros da Venda (% a.m.) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Landmark className="w-3.5 h-3.5 text-[#1B5E20]" />
                          Juros Venda (% a.m.)
                        </span>
                        <span className="text-[10px] text-[#1B5E20] font-bold">
                          {jurosVendaEfetivoPerc.toFixed(2)}% no prazo
                        </span>
                      </Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={taxaJurosVendaMensal}
                        onChange={(e) =>
                          setTaxaJurosVendaMensal(Math.max(0, Number(e.target.value)))
                        }
                        className="h-8 text-xs border-emerald-200 bg-white"
                      />
                    </div>

                    {/* Rota Fiscal: Origem e Destino */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-[#1B5E20]" />
                        UF Origem → Destino
                      </Label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          value={ufOrigemVenda}
                          onChange={(e) => setUfOrigemVenda(e.target.value)}
                          className="h-8 text-xs rounded-md border border-emerald-200 bg-white px-2 font-medium"
                        >
                          {UFS_BRASIL.map((uf) => (
                            <option key={uf} value={uf}>
                              {uf}
                            </option>
                          ))}
                        </select>
                        <select
                          value={ufDestinoVenda}
                          onChange={(e) => setUfDestinoVenda(e.target.value)}
                          className="h-8 text-xs rounded-md border border-emerald-200 bg-white px-2 font-medium"
                        >
                          {UFS_BRASIL.map((uf) => (
                            <option key={uf} value={uf}>
                              {uf}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Enquadramento do Cliente */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800">
                        Enquadramento Cliente
                      </Label>
                      <select
                        value={enquadramentoCliente}
                        onChange={(e) =>
                          setEnquadramentoCliente(e.target.value as EnquadramentoCliente)
                        }
                        className="w-full h-8 text-xs rounded-md border border-emerald-200 bg-white px-2 font-medium"
                      >
                        <option value="produtor_rural">Produtor Rural (PF/PJ)</option>
                        <option value="revenda">Revenda / Distribuidor</option>
                        <option value="cooperativa">Cooperativa Agropecuária</option>
                        <option value="consumidor_final">Consumidor Final</option>
                      </select>
                    </div>

                    {/* Modalidade Frete Venda */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-[#1B5E20]" />
                        Modalidade Frete Venda
                      </Label>
                      <select
                        value={modalidadeFreteVenda}
                        onChange={(e) => setModalidadeFreteVenda(e.target.value as ModalidadeFrete)}
                        className="w-full h-8 text-xs rounded-md border border-emerald-200 bg-white px-2 font-bold"
                      >
                        <option value="CIF">CIF (Emitente / entra na base ICMS)</option>
                        <option value="FOB">FOB (Cliente / fora da base ICMS)</option>
                      </select>
                    </div>

                    {/* Frete de Venda (R$) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800">
                        Frete de Venda (R$)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={freteVenda}
                        onChange={(e) => setFreteVenda(Math.max(0, Number(e.target.value)))}
                        className="h-8 text-xs border-emerald-200 bg-white font-semibold"
                      />
                    </div>

                    {/* Seguro & Outros Venda */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800">
                        Seguro & Outros Venda (R$)
                      </Label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Input
                          type="number"
                          min="0"
                          value={seguroVenda}
                          onChange={(e) => setSeguroVenda(Math.max(0, Number(e.target.value)))}
                          placeholder="Seguro"
                          className="h-8 text-xs border-emerald-200 bg-white"
                        />
                        <Input
                          type="number"
                          min="0"
                          value={outrasDespesasVenda}
                          onChange={(e) =>
                            setOutrasDespesasVenda(Math.max(0, Number(e.target.value)))
                          }
                          placeholder="Outros"
                          className="h-8 text-xs border-emerald-200 bg-white"
                        />
                      </div>
                    </div>

                    {/* Comissão de Vendas (%) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center justify-between">
                        <span>Comissão Vendas (%)</span>
                        <span className="text-[10px] text-gray-500">s/ faturamento</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={comissaoVendaPerc}
                        onChange={(e) => setComissaoVendaPerc(Math.max(0, Number(e.target.value)))}
                        className="h-8 text-xs border-emerald-200 bg-white"
                      />
                    </div>

                    {/* Margem Alvo Desejada (%) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800 flex items-center justify-between">
                        <span>Margem Alvo (%)</span>
                        <span className="text-[10px] text-gray-500">Markup sugerido</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={margemAlvoPerc}
                        onChange={(e) => setMargemAlvoPerc(Number(e.target.value))}
                        className="h-8 text-xs border-emerald-200 bg-white"
                      />
                    </div>

                    {/* Regime PIS/COFINS & Reforma */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-800">
                        Regime Tributário Saída
                      </Label>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setConsiderarReoneracao2026(!considerarReoneracao2026)}
                          className="h-8 text-[11px] flex-1 px-1 bg-white border-emerald-200"
                        >
                          {considerarReoneracao2026 ? 'LC 224 (0,92%)' : 'Lei 10.925 (Zero)'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setUsarAliquotaReformaPlena(!usarAliquotaReformaPlena)}
                          className="h-8 text-[11px] flex-1 px-1 bg-white border-purple-200 text-purple-900"
                        >
                          {usarAliquotaReformaPlena ? 'IBS Pleno' : 'IBS Teste 2026'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BOTÃO PRINCIPAL */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#DCE5DC]">
                  <div className="text-xs text-[#5A6D5A]">
                    Simule para apurar a segregação de compra/venda, custos financeiros e o
                    resultado da operação.
                  </div>

                  <Button
                    onClick={handleSimular}
                    disabled={calculando}
                    className="w-full sm:w-auto bg-[#1B5E20] hover:bg-[#154a19] text-white shadow-md font-bold h-10 px-8 text-sm transition-all"
                  >
                    <Sparkles className="w-4 h-4 mr-2 text-amber-300" />
                    {calculando ? 'Calculando...' : 'Simular Operação Completa'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* =============================================================== */}
            {/* PAINEL DE RESULTADOS SEGREGADOS                                */}
            {/* =============================================================== */}
            {resultado ? (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Alerta caso sem regra de ICMS */}
                {!resultado.temRegraIcms && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3 shadow-xs">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p className="font-bold">
                        Atenção: Sem regra de ICMS cadastrada para {resultado.ufOrigem} →{' '}
                        {resultado.ufDestino}
                      </p>
                      <p className="text-amber-800 leading-relaxed">
                        O cálculo utilizou a alíquota padrão estimada interestadual de{' '}
                        <strong>{resultado.icms.aliquotaNominal}%</strong>. Para máxima precisão
                        fiscal, confira a aba <strong>"Regras Fiscais"</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* ----------------------------------------------------------- */}
                {/* 1. CARTÕES EXECUTIVOS: COMPRA, VENDA E RESULTADO DA OPERAÇÃO*/}
                {/* ----------------------------------------------------------- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Custo Total de Aquisição (COMPRA) */}
                  <Card className="border-sky-200 bg-gradient-to-br from-sky-50/60 to-white shadow-xs">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-sky-900 uppercase tracking-wider flex items-center gap-1">
                          <ShoppingCart className="w-3.5 h-3.5 text-sky-700" />
                          1. Custo da Compra
                        </span>
                        <Badge className="bg-sky-100 text-sky-800 border-sky-300 text-[10px]">
                          Venc. {resultado.compra.dataVencimento}
                        </Badge>
                      </div>
                      <p className="text-xl font-extrabold text-sky-950 tracking-tight">
                        {resultado.compra.custoTotalComJuros.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                      <div className="text-[11px] text-sky-800 flex items-center justify-between pt-0.5">
                        <span>Mercadoria + Despesas:</span>
                        <span className="font-mono font-semibold">
                          {resultado.compra.custoAquisicaoMercadoria.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="text-[11px] text-sky-700 flex items-center justify-between">
                        <span>Juros ({resultado.compra.prazoDias}d):</span>
                        <span className="font-mono font-semibold">
                          +{' '}
                          {resultado.compra.jurosValor.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: Faturamento Bruto (VENDA) */}
                  <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white shadow-xs">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                          2. Receita da Venda
                        </span>
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                          Venc. {resultado.venda.dataVencimento}
                        </Badge>
                      </div>
                      <p className="text-xl font-extrabold text-[#1B5E20] tracking-tight">
                        {resultado.venda.faturamentoBrutoTotal.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                      <div className="text-[11px] text-emerald-800 flex items-center justify-between pt-0.5">
                        <span>Receita Líquida:</span>
                        <span className="font-mono font-semibold">
                          {resultado.venda.receitaLiquida.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-700 flex items-center justify-between">
                        <span>Juros Financiados ({resultado.venda.prazoDias}d):</span>
                        <span className="font-mono font-semibold">
                          +{' '}
                          {resultado.venda.jurosValor.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 3: Carga Tributária da Venda */}
                  <Card className="border-[#DCE5DC] bg-white shadow-xs">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#5A6D5A] uppercase tracking-wider">
                          Tributos da Venda
                        </span>
                        <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] font-bold">
                          {resultado.venda.cargaTributariaEfetivaPerc.toFixed(2)}% efetivo
                        </Badge>
                      </div>
                      <p className="text-xl font-extrabold text-red-700 tracking-tight">
                        {resultado.venda.totalTributos.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        ICMS R$ {resultado.icms.icmsEfetivoRecolher.toFixed(2)} + PIS/COFINS +
                        IBS/CBS
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 4: RESULTADO DA OPERAÇÃO (Destaque Principal) */}
                  <Card className="border-emerald-800 bg-gradient-to-br from-[#0D2811] via-[#154a19] to-[#1B5E20] text-white shadow-md">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                          <CircleDollarSign className="w-3.5 h-3.5" />
                          Resultado da Operação
                        </span>
                        <Badge className="bg-amber-400/20 text-amber-200 text-[10px] border-amber-400/30 font-bold">
                          {resultado.resultadoOperacao.margemSobreReceitaBrutaPerc.toFixed(1)}%
                          Margem
                        </Badge>
                      </div>
                      <p className="text-2xl font-extrabold text-white tracking-tight">
                        {resultado.resultadoOperacao.resultadoFinalOperacao.toLocaleString(
                          'pt-BR',
                          {
                            style: 'currency',
                            currency: 'BRL',
                          },
                        )}
                      </p>
                      <div className="text-[11px] text-emerald-200 flex items-center justify-between pt-0.5">
                        <span>ROI s/ Compra:</span>
                        <span className="font-mono font-bold text-amber-300">
                          {resultado.resultadoOperacao.margemSobreCustoInvestidoPerc.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-300 flex items-center justify-between">
                        <span>Unitário:</span>
                        <span className="font-mono font-semibold">
                          {resultado.resultadoOperacao.resultadoFinalUnitario.toLocaleString(
                            'pt-BR',
                            { style: 'currency', currency: 'BRL' },
                          )}{' '}
                          / {resultado.unidade}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* 2. QUADRO SEGREGADO LADO A LADO: COMPRA vs VENDA            */}
                {/* ----------------------------------------------------------- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Bloco 1: Detalhes da Compra */}
                  <Card className="border-sky-200 bg-white shadow-xs">
                    <CardHeader className="bg-sky-50/60 border-b border-sky-100 py-3 px-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-sky-800" />
                          <CardTitle className="text-xs font-bold text-sky-950 uppercase">
                            Detalhamento da Operação de Compra
                          </CardTitle>
                        </div>
                        <Badge className="bg-sky-100 text-sky-900 border-sky-300 text-[10px] font-mono">
                          {resultado.compra.prazoDias} dias
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">Data da Compra:</span>
                        <span className="font-mono font-medium">
                          {resultado.compra.dataOperacao}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 font-semibold text-sky-950">
                        <span>Data de Vencimento (Prazo):</span>
                        <span className="font-mono">{resultado.compra.dataVencimento}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">Preço de Aquisição Unitário:</span>
                        <span className="font-mono font-semibold">
                          {resultado.compra.precoUnitarioReais.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}{' '}
                          / {resultado.unidade}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">Valor Mercadoria Total:</span>
                        <span className="font-mono font-semibold">
                          {resultado.compra.valorMercadoriaReais.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">
                          Despesas Logísticas (Frete {resultado.compra.modalidadeFrete} + Seg.):
                        </span>
                        <span className="font-mono">
                          {resultado.compra.totalDespesasAcessorias.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 bg-sky-50/40 px-1 rounded font-bold text-sky-950">
                        <span>(=) Custo de Aquisição Mercadoria:</span>
                        <span className="font-mono">
                          {resultado.compra.custoAquisicaoMercadoria.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 text-sky-800">
                        <span>
                          (+) Custo Financeiro / Juros (
                          {resultado.compra.taxaJurosEfetivaPerc.toFixed(2)}% em{' '}
                          {resultado.compra.prazoDias}d):
                        </span>
                        <span className="font-mono font-semibold">
                          +{' '}
                          {resultado.compra.jurosValor.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 font-bold bg-sky-100 text-sky-950 px-2 rounded">
                        <span>CUSTO TOTAL DE AQUISIÇÃO (C/ JUROS):</span>
                        <span className="font-mono">
                          {resultado.compra.custoTotalComJuros.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Bloco 2: Detalhes da Venda */}
                  <Card className="border-emerald-300 bg-white shadow-xs">
                    <CardHeader className="bg-emerald-50/60 border-b border-emerald-100 py-3 px-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-[#1B5E20]" />
                          <CardTitle className="text-xs font-bold text-emerald-950 uppercase">
                            Detalhamento da Operação de Venda
                          </CardTitle>
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 text-[10px] font-mono">
                          {resultado.venda.prazoDias} dias
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">Data da Venda:</span>
                        <span className="font-mono font-medium">
                          {resultado.venda.dataOperacao}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 font-semibold text-emerald-950">
                        <span>Data de Vencimento Concedido:</span>
                        <span className="font-mono">{resultado.venda.dataVencimento}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">Preço de Venda Unitário:</span>
                        <span className="font-mono font-semibold">
                          {resultado.venda.precoUnitarioReais.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}{' '}
                          / {resultado.unidade}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 font-semibold text-emerald-950">
                        <span>Faturamento Bruto Total:</span>
                        <span className="font-mono">
                          {resultado.venda.faturamentoBrutoTotal.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 text-red-600">
                        <span>(-) Total Tributos da Venda:</span>
                        <span className="font-mono">
                          -{' '}
                          {resultado.venda.totalTributos.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 bg-emerald-50/40 px-1 rounded font-bold text-emerald-950">
                        <span>(=) Receita Líquida da Venda:</span>
                        <span className="font-mono">
                          {resultado.venda.receitaLiquida.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 text-[#1B5E20]">
                        <span>
                          (+) Juros Financiamento Cliente (
                          {resultado.venda.taxaJurosEfetivaPerc.toFixed(2)}% em{' '}
                          {resultado.venda.prazoDias}d):
                        </span>
                        <span className="font-mono font-semibold">
                          +{' '}
                          {resultado.venda.jurosValor.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 font-bold bg-emerald-100 text-emerald-950 px-2 rounded">
                        <span>RECEITA LÍQUIDA + JUROS DE VENDA:</span>
                        <span className="font-mono">
                          {(
                            resultado.venda.receitaLiquida + resultado.venda.jurosValor
                          ).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* 3. QUADRO RESUMO: RESULTADO FINANCEIRO & RESULTADO OPERAÇÃO */}
                {/* ----------------------------------------------------------- */}
                <Card className="border-emerald-700 bg-white shadow-sm overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-emerald-900 via-[#1B5E20] to-[#154a19] text-white py-3 px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-emerald-200" />
                        <CardTitle className="text-sm font-bold text-white uppercase">
                          3. Consolidação do Resultado da Operação (Venda − Compra)
                        </CardTitle>
                      </div>
                      <Badge className="bg-amber-400 text-amber-950 font-bold text-xs">
                        Resultado Líquido:{' '}
                        {resultado.resultadoOperacao.resultadoFinalOperacao.toLocaleString(
                          'pt-BR',
                          {
                            style: 'currency',
                            currency: 'BRL',
                          },
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Bloco Operacional */}
                      <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70 space-y-1.5 text-xs">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block">
                          Resultado Operacional Bruto
                        </span>
                        <div className="flex justify-between py-1 border-b border-gray-200">
                          <span className="text-gray-600">Receita Líquida:</span>
                          <span className="font-mono font-medium">
                            {resultado.venda.receitaLiquida.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-gray-200 text-red-600">
                          <span>(-) Custo da Mercadoria:</span>
                          <span className="font-mono">
                            -{' '}
                            {resultado.compra.custoAquisicaoMercadoria.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-gray-200 text-red-600">
                          <span>(-) Despesas Venda (Frete/Com.):</span>
                          <span className="font-mono">
                            -{' '}
                            {resultado.resultadoOperacao.despesasOperacionaisVenda.toLocaleString(
                              'pt-BR',
                              { style: 'currency', currency: 'BRL' },
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 font-bold text-gray-900">
                          <span>(=) Margem Operacional:</span>
                          <span className="font-mono">
                            {resultado.resultadoOperacao.resultadoOperacionalLiquido.toLocaleString(
                              'pt-BR',
                              { style: 'currency', currency: 'BRL' },
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Bloco Financeiro Segregado */}
                      <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 space-y-1.5 text-xs">
                        <span className="text-[10px] uppercase font-bold text-blue-900 block">
                          Resultado Financeiro (Juros Segregados)
                        </span>
                        <div className="flex justify-between py-1 border-b border-blue-100 text-[#1B5E20]">
                          <span>(+) Juros Recebidos (Venda):</span>
                          <span className="font-mono font-semibold">
                            +{' '}
                            {resultado.venda.jurosValor.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-blue-100 text-red-600">
                          <span>(-) Juros Pagos (Compra):</span>
                          <span className="font-mono font-semibold">
                            -{' '}
                            {resultado.compra.jurosValor.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 font-bold text-blue-950">
                          <span>(=) Resultado Financeiro Líquido:</span>
                          <span className="font-mono">
                            {resultado.resultadoOperacao.resultadoFinanceiroLiquido.toLocaleString(
                              'pt-BR',
                              { style: 'currency', currency: 'BRL' },
                            )}
                          </span>
                        </div>
                        <span className="text-[10px] text-blue-800 block pt-1">
                          Diferencial de prazo:{' '}
                          {resultado.venda.prazoDias - resultado.compra.prazoDias} dias
                        </span>
                      </div>

                      {/* Bloco Final */}
                      <div className="p-3.5 rounded-xl border border-emerald-300 bg-gradient-to-br from-emerald-100/70 to-emerald-50 space-y-1.5 text-xs">
                        <span className="text-[10px] uppercase font-bold text-emerald-950 block">
                          Resultado Final da Operação
                        </span>
                        <div className="flex justify-between py-1 border-b border-emerald-200">
                          <span className="text-emerald-900">Resultado Líquido R$:</span>
                          <span className="font-mono font-extrabold text-base text-[#1B5E20]">
                            {resultado.resultadoOperacao.resultadoFinalOperacao.toLocaleString(
                              'pt-BR',
                              { style: 'currency', currency: 'BRL' },
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-emerald-200">
                          <span className="text-emerald-900">Margem s/ Faturamento:</span>
                          <span className="font-mono font-bold text-emerald-950">
                            {resultado.resultadoOperacao.margemSobreReceitaBrutaPerc.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between pt-1">
                          <span className="text-emerald-900">ROI s/ Custo Compra:</span>
                          <span className="font-mono font-bold text-emerald-950">
                            {resultado.resultadoOperacao.margemSobreCustoInvestidoPerc.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ----------------------------------------------------------- */}
                {/* 4. DRE / CASCATA DE RESULTADOS COMPLETA (3 COLUNAS)         */}
                {/* ----------------------------------------------------------- */}
                <Card className="border-[#DCE5DC] shadow-sm bg-white overflow-hidden">
                  <CardHeader className="bg-[#F8FAF6] border-b border-[#DCE5DC] py-3.5 px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-[#1B5E20]" />
                        <CardTitle className="text-sm font-bold text-[#1C2B1C]">
                          DRE / Cascata Comercial Completa (3 Colunas)
                        </CardTitle>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-xs font-mono text-[#1B5E20] bg-white border-emerald-300"
                      >
                        Lote: {resultado.volumeTotal.toLocaleString('pt-BR')} {resultado.unidade} (
                        {resultado.qtdEmbalagens} emb.)
                      </Badge>
                    </div>
                  </CardHeader>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-[#1C2B1C] font-semibold">
                          <th className="py-2.5 px-4 text-left">Estrutura de Resultados (DRE)</th>
                          <th className="py-2.5 px-4 text-right">Unitário (R$)</th>
                          <th className="py-2.5 px-4 text-right">Total do Lote (R$)</th>
                          <th className="py-2.5 px-4 text-right">% s/ Faturamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {resultado.dre.map((linha, idx) => {
                          const isSubtotal = linha.natureza === 'subtotal'
                          const isResultado = linha.natureza === 'resultado'
                          const isReceita = linha.natureza === 'receita'

                          let rowClass = 'hover:bg-gray-50/70 transition-colors'
                          if (idx % 2 === 1 && !isSubtotal && !isResultado) {
                            rowClass = 'bg-[#FCFDFB] hover:bg-gray-50/70'
                          }
                          if (isSubtotal) {
                            rowClass =
                              'bg-emerald-50/40 border-y border-emerald-100 font-bold text-emerald-950'
                          }
                          if (isResultado) {
                            rowClass = 'bg-[#1B5E20] text-white font-extrabold'
                          }

                          return (
                            <tr key={idx} className={rowClass}>
                              <td
                                className={`py-2.5 px-4 ${isResultado || isSubtotal || isReceita ? 'font-bold' : ''}`}
                              >
                                {linha.descricao}
                              </td>
                              <td
                                className={`py-2.5 px-4 text-right font-mono ${
                                  isResultado ? 'text-amber-300 font-bold' : ''
                                }`}
                              >
                                {linha.unitario.toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </td>
                              <td
                                className={`py-2.5 px-4 text-right font-mono font-bold ${
                                  isResultado ? 'text-amber-300 text-sm' : ''
                                }`}
                              >
                                {linha.total.toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </td>
                              <td
                                className={`py-2.5 px-4 text-right font-mono font-semibold ${
                                  isResultado ? 'text-white' : 'text-gray-600'
                                }`}
                              >
                                {linha.percSobreFaturamento.toFixed(2)}%
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Preço Mínimo e Preço Sugerido */}
                  <div className="p-4 bg-[#F8FAF6] border-t border-[#DCE5DC] grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-3 bg-white rounded-lg border border-[#DCE5DC]">
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">
                        Preço Mínimo (Break-Even)
                      </span>
                      <span className="text-base font-mono font-bold text-gray-900 block mt-1">
                        {resultado.precoMinimoBreakEven.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                      <span className="text-[10px] text-gray-500 block mt-0.5">
                        Ponto de equilíbrio (Margem Zero)
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-[#DCE5DC]">
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">
                        Markup Multiplicador
                      </span>
                      <span className="text-base font-mono font-bold text-[#1B5E20] block mt-1">
                        {resultado.markupMultiplicador.toFixed(3)}x
                      </span>
                      <span className="text-[10px] text-gray-500 block mt-0.5">
                        Fator multiplicador sobre o custo
                      </span>
                    </div>

                    <div className="p-3 bg-gradient-to-br from-emerald-100/70 to-emerald-50 rounded-lg border border-emerald-300">
                      <span className="text-[10px] uppercase font-bold text-emerald-950 block">
                        Preço Sugerido (Margem {margemAlvoPerc}%)
                      </span>
                      <span className="text-base font-mono font-extrabold text-[#1B5E20] block mt-1">
                        {resultado.precoVendaSugerido.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                      <span className="text-[10px] text-emerald-800 block mt-0.5 font-medium">
                        Unitário:{' '}
                        {resultado.precoVendaSugeridoUnitario.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}{' '}
                        / {resultado.unidade}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* ----------------------------------------------------------- */}
                {/* 5. MEMÓRIA DE CÁLCULO SEPARADA (COMPRA, VENDA E RESULTADO)  */}
                {/* ----------------------------------------------------------- */}
                <Card className="border-[#DCE5DC] bg-white shadow-xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMostrarMemoriaCalculo(!mostrarMemoriaCalculo)}
                    className="w-full bg-[#F8FAF6] border-b border-[#DCE5DC] py-3 px-5 flex items-center justify-between text-left hover:bg-[#F2F5EF] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ListOrdered className="w-4 h-4 text-[#1B5E20]" />
                      <span className="text-xs font-bold text-[#1C2B1C]">
                        Memória de Cálculo & Fundamentação Separada de Compra, Venda e Resultado
                      </span>
                      <Badge variant="outline" className="text-[10px] text-gray-500 bg-white">
                        {resultado.memoriaCalculo.length} passos
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-[#5A6D5A] font-semibold">
                      <span>
                        {mostrarMemoriaCalculo ? 'Recolher detalhes' : 'Expandir memória completa'}
                      </span>
                      {mostrarMemoriaCalculo ? (
                        <ChevronUp className="w-4 h-4 text-[#1B5E20]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#1B5E20]" />
                      )}
                    </div>
                  </button>

                  {mostrarMemoriaCalculo && (
                    <CardContent className="p-4 bg-[#FCFDFB] space-y-3">
                      <ol className="list-decimal list-inside space-y-2 text-xs font-mono text-gray-700">
                        {resultado.memoriaCalculo.map((item, idx) => (
                          <li
                            key={idx}
                            className={`p-2.5 rounded border ${
                              item.includes('--- 1. OPERAÇÃO DE COMPRA')
                                ? 'bg-sky-50 border-sky-300 font-bold text-sky-950'
                                : item.includes('--- 2. OPERAÇÃO DE VENDA')
                                  ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-950'
                                  : item.includes('--- 3. RESULTADO CONSOLIDADO')
                                    ? 'bg-amber-50 border-amber-300 font-bold text-amber-950'
                                    : 'bg-white border-[#DCE5DC]'
                            }`}
                          >
                            <span>{item}</span>
                          </li>
                        ))}
                      </ol>

                      {resultado.alertas.length > 0 && (
                        <div className="pt-2 border-t border-gray-200">
                          <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wide mb-1.5">
                            Alertas e Observações Fiscais:
                          </p>
                          <ul className="list-disc list-inside space-y-1 text-xs text-amber-800">
                            {resultado.alertas.map((alerta, idx) => (
                              <li key={idx}>{alerta}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              </div>
            ) : null}
          </TabsContent>

          {/* ABA 2: BASE DE PRODUTOS */}
          <TabsContent value="produtos" className="mt-0">
            <AbaBaseProdutos ativa={abaAtiva === 'produtos'} />
          </TabsContent>

          {/* ABA 3: REGRAS FISCAIS */}
          <TabsContent value="regras" className="mt-0">
            <AbaRegrasFiscais ativa={abaAtiva === 'regras'} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

export default Simulador
