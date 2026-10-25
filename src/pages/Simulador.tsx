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
  Info,
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
  Building2,
  Users,
  Coins,
  ArrowRight,
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

// Produtos de exemplo/fallback para testes caso a coleção ainda não tenha sido importada
const PRODUTOS_SEED_DEMO: ProdutoBaseSimulador[] = [
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
    preco_base_sugerido: 48.5,
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
    preco_base_sugerido: 34.0,
    comissao_padrao: 0.025,
  },
  {
    codigo: 'IMP-0092',
    descricao: 'ATRAZINA 500 SC (IMP) - Tambor 200 L',
    ncm: '3808.93.29',
    unidade: 'L',
    tipo_produto: 'Herbicida Importado',
    origem: 'Importado',
    embalagem: 'Tambor 200 L',
    principio_ativo: 'Atrazina',
    fabricante: 'Agro Global Traders',
    moeda: 'USD',
    preco_base_sugerido: 6.8,
    comissao_padrao: 0.015,
  },
]

export function Simulador() {
  const { toast } = useToast()

  // Estados dos dados do banco
  const [produtos, setProdutos] = useState<SimProdutoBaseItem[]>([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(false)
  const [termoBuscaProduto, setTermoBuscaProduto] = useState('')

  // 1. Produto Selecionado
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoBaseSimulador | null>(null)

  // 2. Operação & Logística
  const [ufOrigem, setUfOrigem] = useState<string>('SP')
  const [ufDestino, setUfDestino] = useState<string>('MT')
  const [enquadramentoCliente, setEnquadramentoCliente] =
    useState<EnquadramentoCliente>('produtor_rural')

  // Quantidade, Embalagens e Volume
  const [quantidade, setQuantidade] = useState<number>(1000)
  const [qtdEmbalagens, setQtdEmbalagens] = useState<number>(50)
  const [volumePorEmbalagem, setVolumePorEmbalagem] = useState<number>(20)
  const [modoEdicaoQtd, setModoEdicaoQtd] = useState<'volume' | 'embalagens'>('volume')

  // Frete & Despesas
  const [modalidadeFrete, setModalidadeFrete] = useState<ModalidadeFrete>('CIF')
  const [tipoFrete, setTipoFrete] = useState<'valor' | 'perc'>('valor')
  const [freteValor, setFreteValor] = useState<number>(2500)
  const [fretePerc, setFretePerc] = useState<number>(3.5)
  const [seguro, setSeguro] = useState<number>(350)
  const [outrasDespesas, setOutrasDespesas] = useState<number>(150)

  // 3. Valores Comerciais, Moeda & Financeiro
  const [precoUnitario, setPrecoUnitario] = useState<number>(34.0)
  const [moeda, setMoeda] = useState<'BRL' | 'USD'>('BRL')
  const [ptaxManual, setPtaxManual] = useState<number>(5.75) // Cotação Dólar Manual
  const [comissaoPerc, setComissaoPerc] = useState<number>(2.5) // % Comissão
  const [custoFinanceiroPerc, setCustoFinanceiroPerc] = useState<number>(1.5) // % Juros / Prazo
  const [margemPerc, setMargemPerc] = useState<number>(15) // % Margem comercial desejada
  const [considerarReoneracao2026, setConsiderarReoneracao2026] = useState<boolean>(true)
  const [usarAliquotaReformaPlena, setUsarAliquotaReformaPlena] = useState<boolean>(false)

  // Aba ativa atual ('simulacao' | 'produtos' | 'regras')
  const [abaAtiva, setAbaAtiva] = useState<string>('simulacao')

  // Resultado do Cálculo
  const [calculando, setCalculando] = useState<boolean>(false)
  const [, setRegraIcmsAtual] = useState<SimRegraIcmsItem | null>(null)
  const [resultado, setResultado] = useState<SimuladorResultado | null>(null)

  // Controle visual da memória de cálculo (recolhível/expandível)
  const [mostrarMemoriaCalculo, setMostrarMemoriaCalculo] = useState<boolean>(false)

  // Sincronizar quantidade de embalagens quando o volume ou volumePorEmbalagem muda
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

  // Atualiza produto selecionado
  const selecionarProduto = (prod: ProdutoBaseSimulador) => {
    setProdutoSelecionado(prod)
    const isImp =
      prod.origem?.toLowerCase().includes('imp') ||
      prod.descricao.toUpperCase().includes('(IMP)') ||
      prod.moeda === 'USD'
    const novaMoeda = prod.moeda?.toUpperCase() === 'USD' || isImp ? 'USD' : 'BRL'
    setMoeda(novaMoeda)

    if (prod.preco_base_sugerido && prod.preco_base_sugerido > 0) {
      setPrecoUnitario(prod.preco_base_sugerido)
    }

    // Comissão padrão sugerida do produto do banco
    if (
      prod.comissao_padrao !== undefined &&
      prod.comissao_padrao !== null &&
      prod.comissao_padrao > 0
    ) {
      const comissaoCalc =
        prod.comissao_padrao < 1 ? prod.comissao_padrao * 100 : prod.comissao_padrao
      setComissaoPerc(comissaoCalc)
    }

    // Capacidade da embalagem
    const cap = deduzirCapacidadeEmbalagem(prod.embalagem)
    setVolumePorEmbalagem(cap)
    if (cap > 0 && quantidade > 0) {
      setQtdEmbalagens(Math.ceil(quantidade / cap))
    }
  }

  // Lista de produtos filtrada para a busca rápida
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
    moeda === 'USD' ||
    produtoSelecionado?.origem?.toLowerCase().includes('imp') ||
    produtoSelecionado?.descricao.toUpperCase().includes('(IMP)')

  // Executa Simulação
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
        ufOrigem,
        ufDestino,
        produtoSelecionado.gr_trib,
      )
      const regra = resRegra.regra
      setRegraIcmsAtual(regra)

      const freteCalculado =
        tipoFrete === 'perc'
          ? (quantidade * precoUnitario * (moeda === 'USD' ? ptaxManual : 1) * fretePerc) / 100
          : freteValor

      const res = executarCalculoSimulador({
        produto: produtoSelecionado,
        ufOrigem,
        ufDestino,
        quantidade,
        qtdEmbalagens,
        volumePorEmbalagem,
        unidade: produtoSelecionado.unidade,
        embalagem: produtoSelecionado.embalagem,
        enquadramentoCliente,
        precoUnitario,
        moeda,
        ptaxManual: isProdutoImportado ? ptaxManual : 1.0,
        modalidadeFrete,
        frete: freteCalculado,
        seguro,
        outrasDespesas,
        comissaoPerc,
        custoFinanceiroPerc,
        margemComercialPerc: margemPerc,
        regraIcms: regra,
        considerarReoneracao2026,
        usarAliquotaReformaPlena,
      })

      setResultado(res)

      if (!res.temRegraIcms) {
        toast({
          title: 'Aviso: Regra ICMS não encontrada',
          description: `Sem regra de ICMS para ${ufOrigem} → ${ufDestino}. Importe a aba "Regra ICMS" ou confira os estados.`,
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
    ufOrigem,
    ufDestino,
    modalidadeFrete,
    enquadramentoCliente,
    considerarReoneracao2026,
    usarAliquotaReformaPlena,
  ])

  // Resetar valores do formulário para valores padrão
  const handleResetarFormulario = () => {
    setQuantidade(1000)
    setQtdEmbalagens(50)
    setVolumePorEmbalagem(20)
    setModalidadeFrete('CIF')
    setTipoFrete('valor')
    setFreteValor(2500)
    setFretePerc(3.5)
    setSeguro(350)
    setOutrasDespesas(150)
    setComissaoPerc(2.5)
    setCustoFinanceiroPerc(1.5)
    setMargemPerc(15)
    setPtaxManual(5.75)
    setEnquadramentoCliente('produtor_rural')
    if (produtoSelecionado?.preco_base_sugerido) {
      setPrecoUnitario(produtoSelecionado.preco_base_sugerido)
    }
    toast({
      title: 'Valores redefinidos',
      description: 'Variáveis operacionais voltaram ao padrão.',
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
                    Simulador Comercial
                  </h1>
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold text-xs">
                    Paridade Excel Gabarito
                  </Badge>
                </div>
                <p className="text-sm text-[#5A6D5A]">
                  Simulação de custos, tributos interestaduais (ICMS débito/diferimento/crédito,
                  PIS/COFINS Tema 69 STF, IBS/CBS) e cascata de DRE comercial.
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

        {/* Navegação por Abas: Simulação, Base de Produtos e Regras Fiscais */}
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
          {/* ABA 1: SIMULAÇÃO COM PARIDADE COMPLETA DO GABARITO EXCEL           */}
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
                        Parâmetros da Operação Comercial & Logística
                      </CardTitle>
                      <CardDescription className="text-xs text-[#5A6D5A]">
                        Configure o insumo, embalagens, rota logística (CIF vs FOB), comissão e
                        custos de prazo para gerar a DRE e apuração fiscal.
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
                      title="Redefinir campos operacionais aos padrões"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Redefinir
                    </Button>
                    <Badge
                      variant="outline"
                      className="text-[11px] font-mono bg-white text-[#1B5E20] border-emerald-300"
                    >
                      Aba Simulador (Gabarito)
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* ----------------------------------------------------------- */}
                {/* SEÇÃO 1: PRODUTO BASE                                       */}
                {/* ----------------------------------------------------------- */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white text-xs font-bold flex items-center justify-center">
                        1
                      </div>
                      <h2 className="text-sm font-bold text-[#1C2B1C] uppercase tracking-wide">
                        Produto Base & Identificação
                      </h2>
                    </div>
                    <span className="text-[11px] text-[#5A6D5A]">
                      {produtos.length > 0
                        ? `${produtos.length} produtos disponíveis`
                        : 'Modo demonstração'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
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

                      <div className="max-h-48 overflow-y-auto border border-[#DCE5DC] rounded-lg divide-y divide-gray-100 bg-white shadow-inner">
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

                    <div className="lg:col-span-5">
                      {produtoSelecionado ? (
                        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/90 via-emerald-50/50 to-white border border-emerald-200/80 shadow-xs space-y-3">
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
                              {produtoSelecionado.unidade || 'UN'}
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
                                {produtoSelecionado.gr_trib || 'Geral (Padrão)'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 block text-[10px]">Embalagem:</span>
                              <span className="font-medium text-gray-800 truncate block">
                                {produtoSelecionado.embalagem || 'Padrão comercial'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 block text-[10px]">Fabricante:</span>
                              <span className="font-medium text-gray-800 truncate block">
                                {produtoSelecionado.fabricante || 'Geral'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                            <span className="text-gray-600">Origem & Moeda:</span>
                            <div className="flex items-center gap-1.5 font-semibold text-[#1C2B1C]">
                              <span>{produtoSelecionado.origem || 'Nacional'}</span>
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 h-4 font-mono font-bold text-emerald-700 border-emerald-300"
                              >
                                {moeda}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 border border-dashed border-[#DCE5DC] rounded-xl text-center text-xs text-gray-500">
                          Selecione um produto na lista ao lado.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#DCE5DC]" />

                {/* ----------------------------------------------------------- */}
                {/* SEÇÃO 2: OPERAÇÃO, EMBALAGEM & LOGÍSTICA (Gabarito)        */}
                {/* ----------------------------------------------------------- */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white text-xs font-bold flex items-center justify-center">
                      2
                    </div>
                    <h2 className="text-sm font-bold text-[#1C2B1C] uppercase tracking-wide">
                      Operação, Logística, Embalagens & Cliente
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {/* UF Origem */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Compass className="w-3.5 h-3.5 text-[#1B5E20]" />
                          UF Origem
                        </span>
                        <span className="text-[10px] text-gray-500 font-normal">Saída</span>
                      </Label>
                      <select
                        value={ufOrigem}
                        onChange={(e) => setUfOrigem(e.target.value)}
                        className="w-full h-9 text-xs rounded-md border border-[#DCE5DC] bg-white px-2.5 font-medium text-gray-800 focus:ring-1 focus:ring-[#1B5E20] focus:border-[#1B5E20]"
                      >
                        {UFS_BRASIL.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* UF Destino */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Compass className="w-3.5 h-3.5 text-[#1B5E20]" />
                          UF Destino
                        </span>
                        <span className="text-[10px] text-gray-500 font-normal">Entrega</span>
                      </Label>
                      <select
                        value={ufDestino}
                        onChange={(e) => setUfDestino(e.target.value)}
                        className="w-full h-9 text-xs rounded-md border border-[#DCE5DC] bg-white px-2.5 font-medium text-gray-800 focus:ring-1 focus:ring-[#1B5E20] focus:border-[#1B5E20]"
                      >
                        {UFS_BRASIL.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Enquadramento do Cliente */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-[#1B5E20]" />
                          Enquadramento Cliente
                        </span>
                        <span className="text-[10px] text-gray-500 font-normal">Destinatário</span>
                      </Label>
                      <select
                        value={enquadramentoCliente}
                        onChange={(e) =>
                          setEnquadramentoCliente(e.target.value as EnquadramentoCliente)
                        }
                        className="w-full h-9 text-xs rounded-md border border-[#DCE5DC] bg-white px-2.5 font-medium text-gray-800 focus:ring-1 focus:ring-[#1B5E20] focus:border-[#1B5E20]"
                      >
                        <option value="produtor_rural">
                          Produtor Rural (Pessoa Física/Jurídica)
                        </option>
                        <option value="revenda">Revenda / Distribuidor Comercial</option>
                        <option value="cooperativa">Cooperativa Agropecuária</option>
                        <option value="consumidor_final">
                          Consumidor Final (Não Contribuinte)
                        </option>
                      </select>
                    </div>

                    {/* Tipo de Operação */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5 text-[#1B5E20]" />
                        Tipo de Operação
                      </Label>
                      <div className="h-9 px-3 rounded-md bg-[#F5F7F1] border border-[#DCE5DC] flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-800">
                          {ufOrigem === ufDestino ? 'Operação Interna' : 'Interestadual'}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono ${
                            ufOrigem === ufDestino
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {ufOrigem} → {ufDestino}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Bloco de Embalagens e Volume Total */}
                  <div className="p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/40 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-emerald-950 flex items-center justify-between">
                        <span>Volume Total da Simulação</span>
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
                        Volume total acumulado (L / Kg)
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
                        <span>Qtd. de Embalagens Físicas</span>
                        <span className="text-[10px] font-bold text-emerald-700">caixas/sacos</span>
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

                  {/* Bloco de Frete CIF vs FOB */}
                  <div className="p-3.5 rounded-xl border border-[#DCE5DC] bg-white grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5 text-[#1B5E20]" />
                          Modalidade de Frete
                        </span>
                      </Label>
                      <select
                        value={modalidadeFrete}
                        onChange={(e) => setModalidadeFrete(e.target.value as ModalidadeFrete)}
                        className="w-full h-9 text-xs rounded-md border border-[#DCE5DC] bg-white px-2.5 font-bold text-gray-800 focus:ring-1 focus:ring-[#1B5E20]"
                      >
                        <option value="CIF">CIF (Por conta do Emitente / entra no ICMS)</option>
                        <option value="FOB">FOB (Por conta do Cliente / sai do ICMS)</option>
                      </select>
                    </div>

                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                        <span>Tipo de Frete</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setTipoFrete('valor')}
                            className={`px-1.5 py-0.5 text-[10px] rounded font-semibold ${
                              tipoFrete === 'valor'
                                ? 'bg-[#1B5E20] text-white'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            R$
                          </button>
                          <button
                            type="button"
                            onClick={() => setTipoFrete('perc')}
                            className={`px-1.5 py-0.5 text-[10px] rounded font-semibold ${
                              tipoFrete === 'perc'
                                ? 'bg-[#1B5E20] text-white'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            %
                          </button>
                        </div>
                      </Label>
                      {tipoFrete === 'valor' ? (
                        <Input
                          type="number"
                          min="0"
                          value={freteValor}
                          onChange={(e) => setFreteValor(Math.max(0, Number(e.target.value)))}
                          className="text-xs h-9 border-[#DCE5DC] font-semibold"
                          placeholder="Valor R$"
                        />
                      ) : (
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={fretePerc}
                          onChange={(e) => setFretePerc(Math.max(0, Number(e.target.value)))}
                          className="text-xs h-9 border-[#DCE5DC] font-semibold"
                          placeholder="% sobre mercadoria"
                        />
                      )}
                    </div>

                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-gray-500" />
                        Seguro (R$)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={seguro}
                        onChange={(e) => setSeguro(Math.max(0, Number(e.target.value)))}
                        className="text-xs h-9 border-[#DCE5DC]"
                      />
                    </div>

                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Outros (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={outrasDespesas}
                        onChange={(e) => setOutrasDespesas(Math.max(0, Number(e.target.value)))}
                        className="text-xs h-9 border-[#DCE5DC]"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#DCE5DC]" />

                {/* ----------------------------------------------------------- */}
                {/* SEÇÃO 3: VALORES COMERCIAIS, CÂMBIO & DESPESAS (Gabarito)  */}
                {/* ----------------------------------------------------------- */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white text-xs font-bold flex items-center justify-center">
                      3
                    </div>
                    <h2 className="text-sm font-bold text-[#1C2B1C] uppercase tracking-wide">
                      Valores Comerciais, Câmbio, Comissão & Custos Financeiros
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                    {/* Preço Unitário e Câmbio */}
                    <div className="md:col-span-6 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center justify-between">
                            <span>Preço Unitário</span>
                            <Badge
                              variant="outline"
                              className="font-bold text-emerald-800 border-emerald-300 bg-emerald-50 text-[10px]"
                            >
                              {moeda}
                            </Badge>
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={precoUnitario}
                            onChange={(e) => setPrecoUnitario(Number(e.target.value))}
                            className="text-xs h-9 border-[#DCE5DC] font-semibold text-gray-900"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5 text-[#1B5E20]" />
                              Margem Alvo Desejada (%)
                            </span>
                            <span className="text-[10px] text-gray-500 font-normal">Mark-up</span>
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={margemPerc}
                            onChange={(e) => setMargemPerc(Number(e.target.value))}
                            className="text-xs h-9 border-[#DCE5DC] font-semibold"
                          />
                        </div>
                      </div>

                      {/* Bloco de Câmbio / PTAX Manual */}
                      <div
                        className={`p-3.5 rounded-xl border transition-all ${
                          isProdutoImportado
                            ? 'bg-amber-50/90 border-amber-300 shadow-xs'
                            : 'bg-[#F9FAF8] border-[#DCE5DC]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <DollarSign
                              className={`w-4 h-4 ${isProdutoImportado ? 'text-amber-700' : 'text-gray-500'}`}
                            />
                            <Label
                              className={`text-xs font-bold ${
                                isProdutoImportado ? 'text-amber-950' : 'text-gray-700'
                              }`}
                            >
                              Cotação PTAX Manual (USD → BRL)
                            </Label>
                          </div>
                          {isProdutoImportado ? (
                            <Badge className="bg-amber-600 text-white text-[10px]">
                              Obrigatório p/ Importado
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-gray-500 border-gray-300"
                            >
                              Opcional (Moeda BRL)
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-600 shrink-0">
                            US$ 1,00 = R$
                          </span>
                          <Input
                            type="number"
                            step="0.0001"
                            min="0.0001"
                            value={ptaxManual}
                            onChange={(e) => setPtaxManual(Number(e.target.value))}
                            className="h-8 text-xs font-mono font-bold bg-white border-[#DCE5DC] focus-visible:ring-amber-500"
                            placeholder="5.7500"
                          />
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1.5">
                          Cotação informada manualmente pelo operador comercial (sem dependência de
                          API externa).
                        </p>
                      </div>
                    </div>

                    {/* Despesas Comerciais: Comissão, Custo Financeiro & Parâmetros Fiscais */}
                    <div className="md:col-span-6 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <BadgePercent className="w-3.5 h-3.5 text-emerald-700" />
                              Comissão Vendas (%)
                            </span>
                            <span className="text-[10px] text-gray-500">
                              Sugerida:{' '}
                              {produtoSelecionado?.comissao_padrao
                                ? produtoSelecionado.comissao_padrao < 1
                                  ? (produtoSelecionado.comissao_padrao * 100).toFixed(1)
                                  : produtoSelecionado.comissao_padrao
                                : '2.5'}
                              %
                            </span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={comissaoPerc}
                            onChange={(e) => setComissaoPerc(Math.max(0, Number(e.target.value)))}
                            className="text-xs h-9 border-[#DCE5DC] font-semibold"
                          />
                          <span className="text-[10px] text-gray-500 block">
                            Incide sobre o faturamento
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Landmark className="w-3.5 h-3.5 text-blue-700" />
                              Custo Financeiro (%)
                            </span>
                            <span className="text-[10px] text-gray-500">Prazo</span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={custoFinanceiroPerc}
                            onChange={(e) =>
                              setCustoFinanceiroPerc(Math.max(0, Number(e.target.value)))
                            }
                            className="text-xs h-9 border-[#DCE5DC] font-semibold"
                          />
                          <span className="text-[10px] text-gray-500 block">
                            Juros / custo de prazo embutidos
                          </span>
                        </div>
                      </div>

                      {/* Parâmetros Fiscais: PIS/COFINS e IBS/CBS */}
                      <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Percent className="w-4 h-4 text-blue-700" />
                            <Label className="text-xs font-bold text-blue-950">
                              PIS & COFINS Agro (Tema 69 STF)
                            </Label>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 text-blue-700 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              Base com exclusão do ICMS destacado (Tema 69 STF). Alterna entre Lei
                              10.925/2004 (Alíquota Zero até Mar/2026) e LC 224/2025 (Reoneração
                              linear de 0,925%).
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <div className="text-[11px] text-blue-900 leading-tight">
                            Regime:{' '}
                            <strong className="underline">
                              {considerarReoneracao2026
                                ? 'LC 224/2025 (Reoneração 0,925%)'
                                : 'Alíquota Zero (Lei 10.925)'}
                            </strong>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setConsiderarReoneracao2026(!considerarReoneracao2026)}
                            className="h-7 text-xs bg-white text-blue-900 border-blue-300 hover:bg-blue-100/60 shrink-0 font-semibold"
                          >
                            Alternar
                          </Button>
                        </div>
                      </div>

                      {/* Configuração IBS/CBS Reforma */}
                      <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/50 flex items-center justify-between">
                        <div className="text-[11px] text-purple-950">
                          <span className="font-bold block">Reforma Tributária (LC 214/2025):</span>
                          <span>
                            {usarAliquotaReformaPlena
                              ? 'Alíquotas Plenas (CBS 8,8% / IBS 17,7% c/ red. 60%)'
                              : 'Alíquotas de Teste 2026 (CBS 0,9% / IBS 0,1% c/ red. 60%)'}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setUsarAliquotaReformaPlena(!usarAliquotaReformaPlena)}
                          className="h-7 text-xs bg-white text-purple-900 border-purple-300 hover:bg-purple-100 shrink-0 font-semibold"
                        >
                          {usarAliquotaReformaPlena ? 'Usar Teste 2026' : 'Usar Plena'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* BOTÃO PRINCIPAL DE SIMULAÇÃO                                */}
                {/* ----------------------------------------------------------- */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#DCE5DC]">
                  <div className="text-xs text-[#5A6D5A]">
                    Pressione o botão para apurar tributos, DRE cascata completa e margem de
                    contribuição.
                  </div>

                  <Button
                    onClick={handleSimular}
                    disabled={calculando}
                    className="w-full sm:w-auto bg-[#1B5E20] hover:bg-[#154a19] text-white shadow-md font-bold h-10 px-8 text-sm transition-all"
                  >
                    <Sparkles className="w-4 h-4 mr-2 text-amber-300" />
                    {calculando ? 'Calculando Simulação...' : 'Simular Operação Comercial'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* =============================================================== */}
            {/* PAINEL DE RESULTADO (Paridade Total com o Gabarito Excel)      */}
            {/* =============================================================== */}
            {resultado ? (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Alerta de Ausência de Regra de ICMS quando aplicável */}
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
                        fiscal, cadastre ou confira a aba <strong>"Regras Fiscais"</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* ----------------------------------------------------------- */}
                {/* 6. CARTÕES EXECUTIVOS (Exigência do Gabarito)               */}
                {/* ----------------------------------------------------------- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Preço Unitário */}
                  <Card className="border-[#DCE5DC] bg-white shadow-xs hover:border-[#1B5E20]/40 transition-colors">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#5A6D5A] uppercase tracking-wider">
                          Preço Unitário
                        </span>
                        <Coins className="w-4 h-4 text-emerald-700" />
                      </div>
                      <p className="text-xl font-extrabold text-[#1C2B1C] tracking-tight">
                        {resultado.valorUnitarioReais.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                        <span className="text-xs font-normal text-gray-500">
                          {' '}
                          / {resultado.unidade}
                        </span>
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {resultado.moedaOriginal === 'USD'
                          ? `US$ ${resultado.valorUnitarioOriginal.toFixed(2)} (PTAX R$ ${resultado.ptaxAplicada.toFixed(4)})`
                          : 'Moeda nacional BRL'}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 2: Faturamento Total do Lote */}
                  <Card className="border-[#DCE5DC] bg-white shadow-xs hover:border-emerald-400 transition-colors">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#5A6D5A] uppercase tracking-wider">
                          Faturamento do Lote
                        </span>
                        <Package className="w-4 h-4 text-emerald-700" />
                      </div>
                      <p className="text-xl font-extrabold text-[#1B5E20] tracking-tight">
                        {resultado.receitaBruta.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {resultado.volumeTotal.toLocaleString('pt-BR')} {resultado.unidade} (
                        {resultado.qtdEmbalagens} emb.)
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 3: Carga Tributária Total % */}
                  <Card className="border-[#DCE5DC] bg-white shadow-xs hover:border-red-300 transition-colors">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#5A6D5A] uppercase tracking-wider">
                          Carga Tributária Total
                        </span>
                        <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] font-bold">
                          {resultado.cargaTributariaEfetivaPerc.toFixed(2)}% efetivo
                        </Badge>
                      </div>
                      <p className="text-xl font-extrabold text-red-700 tracking-tight">
                        {resultado.totalTributos.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                      <p className="text-[11px] text-gray-500">ICMS + PIS/COFINS + IBS/CBS</p>
                    </CardContent>
                  </Card>

                  {/* Card 4: Margem de Contribuição Líquida % */}
                  <Card className="border-emerald-800 bg-gradient-to-br from-[#0D2811] via-[#154a19] to-[#1B5E20] text-white shadow-md">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider">
                          Margem Contribuição
                        </span>
                        <Badge className="bg-emerald-400/20 text-emerald-200 text-[10px] border-emerald-400/30 font-bold">
                          {resultado.margemContribuicaoPercSobreReceitaLiquida.toFixed(1)}% s/ Rec.
                          Líq.
                        </Badge>
                      </div>
                      <p className="text-2xl font-extrabold text-white tracking-tight">
                        {resultado.margemContribuicaoValor.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                      <p className="text-[11px] text-emerald-200 truncate">
                        {resultado.margemContribuicaoPercSobreFaturamento.toFixed(1)}% sobre
                        faturamento bruto
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* 2. BLOCO DE RESULTADOS: ICMS DETALHADO DO GABARITO          */}
                {/* ----------------------------------------------------------- */}
                <Card className="border-[#DCE5DC] shadow-sm bg-white overflow-hidden">
                  <CardHeader className="bg-[#F8FAF6] border-b border-[#DCE5DC] py-3.5 px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-[#1B5E20]" />
                        <CardTitle className="text-sm font-bold text-[#1C2B1C]">
                          Detalhamento Tributário do ICMS ({resultado.ufOrigem} →{' '}
                          {resultado.ufDestino})
                        </CardTitle>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-xs font-mono text-[#1B5E20] bg-white border-emerald-300"
                      >
                        {resultado.icms.observacoes || 'Regra Aplicada'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block">
                          Base de Cálculo Bruta
                        </span>
                        <span className="text-sm font-mono font-bold text-gray-900 block mt-1">
                          {resultado.icms.baseCalculoBruta.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">
                          {resultado.modalidadeFrete === 'CIF'
                            ? 'Frete CIF incluso'
                            : 'Frete FOB fora'}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block">
                          Base Efetiva (Reduzida)
                        </span>
                        <span className="text-sm font-mono font-bold text-gray-900 block mt-1">
                          {resultado.icms.baseCalculoEfetiva.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                        <span className="text-[10px] text-amber-700 block mt-0.5 font-medium">
                          Redução: {resultado.icms.reducaoBasePerc}%
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block">
                          Alíquota Nominal / Efetiva
                        </span>
                        <span className="text-sm font-mono font-bold text-gray-900 block mt-1">
                          {resultado.icms.aliquotaNominal}% /{' '}
                          {resultado.icms.aliquotaEfetiva.toFixed(2)}%
                        </span>
                        <span className="text-[10px] text-gray-500 block mt-0.5">
                          Débito próprio:{' '}
                          {resultado.icms.debitoIcms.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block">
                          Diferimento
                        </span>
                        <span className="text-sm font-mono font-bold text-gray-900 block mt-1">
                          {resultado.icms.percentualDiferimento}%
                        </span>
                        <span className="text-[10px] text-gray-600 block mt-0.5">
                          Valor:{' '}
                          {resultado.icms.valorDiferimento.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block">
                          ICMS Desonerado
                        </span>
                        <span className="text-sm font-mono font-bold text-gray-900 block mt-1">
                          {resultado.icms.tipoDesonerado}
                        </span>
                        <span className="text-[10px] text-gray-600 block mt-0.5">
                          {resultado.icms.valorDesonerado > 0
                            ? resultado.icms.valorDesonerado.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })
                            : 'R$ 0,00'}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300">
                        <span className="text-[10px] uppercase font-bold text-emerald-900 block">
                          ICMS Efetivo a Recolher
                        </span>
                        <span className="text-base font-mono font-extrabold text-[#1B5E20] block mt-1">
                          {resultado.icms.icmsEfetivoRecolher.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                        <span className="text-[10px] text-emerald-800 block mt-0.5 font-medium">
                          Débito − Dif. − Créditos
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 text-[11px] text-gray-500 bg-gray-50 p-2.5 rounded-lg border border-gray-200 flex items-center justify-between">
                      <span>
                        <strong>Fundamentação Legal:</strong> {resultado.icms.fundamentacao}
                      </span>
                      {resultado.grTrib && (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          GrTrib: {resultado.grTrib}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* ----------------------------------------------------------- */}
                {/* 3 & 4. PIS / COFINS (Tema 69) & IBS / CBS                   */}
                {/* ----------------------------------------------------------- */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* PIS / COFINS */}
                  <Card className="border-[#DCE5DC] bg-white shadow-xs">
                    <CardHeader className="bg-blue-50/50 border-b border-blue-100 py-3 px-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Percent className="w-4 h-4 text-blue-700" />
                          <CardTitle className="text-xs font-bold text-blue-950">
                            PIS & COFINS Agro (Tema 69 STF)
                          </CardTitle>
                        </div>
                        <Badge className="bg-blue-100 text-blue-800 text-[10px]">
                          Base c/ exclusão ICMS
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">Base Faturamento Bruto:</span>
                        <span className="font-mono font-medium">
                          {resultado.receitaBruta.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 text-red-600">
                        <span>(-) Exclusão do ICMS Destacado:</span>
                        <span className="font-mono font-medium">
                          -{' '}
                          {resultado.icms.icmsEfetivoRecolher.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 font-bold bg-blue-50/40 px-1 rounded">
                        <span className="text-blue-950">(=) Base Efetiva PIS/COFINS:</span>
                        <span className="font-mono text-blue-950">
                          {resultado.pis.baseCalculo.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">
                          PIS ({resultado.pis.aliquotaNominal.toFixed(3)}%):
                        </span>
                        <span className="font-mono font-semibold">
                          {resultado.pis.valorImposto.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-gray-600">
                          COFINS ({resultado.cofins.aliquotaNominal.toFixed(3)}%):
                        </span>
                        <span className="font-mono font-semibold">
                          {resultado.cofins.valorImposto.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* IBS / CBS */}
                  <Card className="border-[#DCE5DC] bg-white shadow-xs">
                    <CardHeader className="bg-purple-50/50 border-b border-purple-100 py-3 px-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-purple-700" />
                          <CardTitle className="text-xs font-bold text-purple-950">
                            IBS & CBS (Reforma Tributária LC 214/2025)
                          </CardTitle>
                        </div>
                        <Badge className="bg-purple-100 text-purple-800 text-[10px]">
                          Redução de 60% Agro
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">Base Reduzida (40%):</span>
                        <span className="font-mono font-medium">
                          {resultado.ibs.baseCalculo.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">
                          IBS (Nominal {resultado.ibs.aliquotaNominal}% → Efetiva{' '}
                          {resultado.ibs.aliquotaEfetiva.toFixed(3)}%):
                        </span>
                        <span className="font-mono font-semibold text-purple-900">
                          {resultado.ibs.valorImposto.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">
                          CBS (Nominal {resultado.cbs.aliquotaNominal}% → Efetiva{' '}
                          {resultado.cbs.aliquotaEfetiva.toFixed(3)}%):
                        </span>
                        <span className="font-mono font-semibold text-purple-900">
                          {resultado.cbs.valorImposto.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 font-bold bg-purple-50/40 px-1 rounded">
                        <span className="text-purple-950">Total IBS + CBS:</span>
                        <span className="font-mono text-purple-950">
                          {(resultado.ibs.valorImposto + resultado.cbs.valorImposto).toLocaleString(
                            'pt-BR',
                            { style: 'currency', currency: 'BRL' },
                          )}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* 5. DRE / CASCATA DE PREÇO (Paridade Linhas 43-53 Gabarito)   */}
                {/* ----------------------------------------------------------- */}
                <Card className="border-[#DCE5DC] shadow-sm bg-white overflow-hidden">
                  <CardHeader className="bg-[#F8FAF6] border-b border-[#DCE5DC] py-3.5 px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-[#1B5E20]" />
                        <CardTitle className="text-sm font-bold text-[#1C2B1C]">
                          DRE / Cascata de Preço & Formação de Margem (3 Colunas)
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-xs font-mono text-[#1B5E20] bg-white border-emerald-300"
                        >
                          Lote: {resultado.volumeTotal.toLocaleString('pt-BR')} {resultado.unidade}{' '}
                          ({resultado.qtdEmbalagens} emb.)
                        </Badge>
                      </div>
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

                  {/* Formação de Preço Mínimo (Break-even) e Preço Sugerido */}
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
                        Fator multiplicador sobre o CMV
                      </span>
                    </div>

                    <div className="p-3 bg-gradient-to-br from-emerald-100/70 to-emerald-50 rounded-lg border border-emerald-300">
                      <span className="text-[10px] uppercase font-bold text-emerald-900 block">
                        Preço Sugerido (Margem {margemPerc}%)
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
                {/* 7. MEMÓRIA DE CÁLCULO RECOLHÍVEL (Acordeão)                 */}
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
                        Memória de Cálculo & Fundamentação Legal de Cada Linha da DRE
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
                          <li key={idx} className="p-2 rounded bg-white border border-[#DCE5DC]">
                            <span className="text-gray-900">{item}</span>
                          </li>
                        ))}
                      </ol>

                      {resultado.alertas.length > 0 && (
                        <div className="pt-2 border-t border-gray-200">
                          <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wide mb-1.5">
                            Alertas e Observações Fiscais Registrados:
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
