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
  ArrowRight,
  Info,
  Package,
  Compass,
  FileDown,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Truck,
  ShieldCheck,
  Receipt,
  Scale,
  ListOrdered,
  RotateCcw,
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
  },
]

export function Simulador() {
  const { toast } = useToast()

  // Estados dos dados do banco
  const [produtos, setProdutos] = useState<SimProdutoBaseItem[]>([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(false)
  const [termoBuscaProduto, setTermoBuscaProduto] = useState('')

  // Parâmetros do Formulário ("Entrada Fácil")
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoBaseSimulador | null>(null)
  const [ufOrigem, setUfOrigem] = useState<string>('SP')
  const [ufDestino, setUfDestino] = useState<string>('MT')
  const [quantidade, setQuantidade] = useState<number>(1000)
  const [precoUnitario, setPrecoUnitario] = useState<number>(34.0)
  const [moeda, setMoeda] = useState<'BRL' | 'USD'>('BRL')
  const [ptaxManual, setPtaxManual] = useState<number>(5.75) // Cotação Dólar Manual
  const [frete, setFrete] = useState<number>(2500)
  const [seguro, setSeguro] = useState<number>(350)
  const [outrasDespesas, setOutrasDespesas] = useState<number>(150)
  const [margemPerc, setMargemPerc] = useState<number>(15) // % Mark-up comercial
  const [considerarReoneracao2026, setConsiderarReoneracao2026] = useState<boolean>(true)

  // Aba ativa atual ('simulacao' | 'produtos' | 'regras')
  const [abaAtiva, setAbaAtiva] = useState<string>('simulacao')

  // Resultado do Cálculo
  const [calculando, setCalculando] = useState<boolean>(false)
  const [, setRegraIcmsAtual] = useState<SimRegraIcmsItem | null>(null)
  const [resultado, setResultado] = useState<SimuladorResultado | null>(null)

  // Controle visual da memória de cálculo (recolhível/expandível)
  const [mostrarMemoriaCalculo, setMostrarMemoriaCalculo] = useState<boolean>(false)

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
        // Fallback para demonstração inicial se banco estiver vazio antes da importação da planilha
        if (!produtoSelecionado) {
          selecionarProduto(PRODUTOS_SEED_DEMO[0])
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('Coleção sim_produtos_base vazia ou não preenchida ainda:', msg)
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

  // Identificação se o item atual exige PTAX
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
      // 1. Busca regra de ICMS para o par no banco com preferência para gr_trib
      const resRegra = await obterRegraIcmsSimulador(
        ufOrigem,
        ufDestino,
        produtoSelecionado.gr_trib,
      )
      const regra = resRegra.regra
      setRegraIcmsAtual(regra)

      // 2. Executa cálculo canônico
      const res = executarCalculoSimulador({
        produto: produtoSelecionado,
        ufOrigem,
        ufDestino,
        quantidade,
        unidade: produtoSelecionado.unidade,
        embalagem: produtoSelecionado.embalagem,
        precoUnitario,
        moeda,
        ptaxManual: isProdutoImportado ? ptaxManual : 1.0,
        frete,
        seguro,
        outrasDespesas,
        margemComercialPerc: margemPerc,
        regraIcms: regra,
        considerarReoneracao2026,
      })

      setResultado(res)

      if (!res.temRegraIcms) {
        toast({
          title: 'Aviso: Regra ICMS não encontrada',
          description: `Sem regra de ICMS para ${ufOrigem} → ${ufDestino}. Importe a aba "Regra ICMS" ou confira os estados.`,
        })
      } else {
        toast({
          title: 'Simulação Concluída',
          description: `Cálculo realizado com sucesso para ${ufOrigem} → ${ufDestino}.`,
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

  // Executa simulação automática ao carregar ou alterar os parâmetros centrais
  useEffect(() => {
    if (produtoSelecionado) {
      handleSimular()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoSelecionado, ufOrigem, ufDestino, considerarReoneracao2026])

  // Resetar valores do formulário para valores padrão
  const handleResetarFormulario = () => {
    setQuantidade(1000)
    setFrete(2500)
    setSeguro(350)
    setOutrasDespesas(150)
    setMargemPerc(15)
    setPtaxManual(5.75)
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
      <div className="space-y-6 pb-12 animate-in fade-in duration-200">
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
                    Fase 1 — MVP
                  </Badge>
                </div>
                <p className="text-sm text-[#5A6D5A]">
                  Simulação de custos, tributos interestaduais (ICMS, PIS/COFINS, IBS/CBS) e
                  formação de preço comercial no Agro.
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
          {/* ABA 1: SIMULAÇÃO (Layout Revisto: Limpo, Escaneável e Responsivo)   */}
          {/* =================================================================== */}
          <TabsContent value="simulacao" className="mt-0 space-y-6">
            {/* PAINEL DE ENTRADA: Card Único, Estruturado e Escaneável */}
            <Card className="border-[#DCE5DC] shadow-sm bg-white overflow-hidden">
              <CardHeader className="bg-[#F8FAF6] border-b border-[#DCE5DC] py-4 px-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 text-[#1B5E20]">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-[#1C2B1C]">
                        Parâmetros da Operação Comercial
                      </CardTitle>
                      <CardDescription className="text-xs text-[#5A6D5A]">
                        Configure o insumo, rota logística e parâmetros tributários para apurar a
                        carga fiscal e preço sugerido.
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
                      Entrada Fácil
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* ----------------------------------------------------------- */}
                {/* SEÇÃO 1: PRODUTO BASE (Busca em Destaque + Resumo Ativo)   */}
                {/* ----------------------------------------------------------- */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white text-xs font-bold flex items-center justify-center">
                        1
                      </div>
                      <h2 className="text-sm font-bold text-[#1C2B1C] uppercase tracking-wide">
                        Produto Base
                      </h2>
                    </div>
                    <span className="text-[11px] text-[#5A6D5A]">
                      {produtos.length > 0
                        ? `${produtos.length} produtos disponíveis`
                        : 'Modo demonstração'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    {/* Campo de Busca e Dropdown de Seleção */}
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

                      {/* Lista de Seleção Rápida */}
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

                    {/* Resumo do Produto Selecionado */}
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
                {/* SEÇÃO 2: OPERAÇÃO & ROTA LOGÍSTICA                         */}
                {/* ----------------------------------------------------------- */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white text-xs font-bold flex items-center justify-center">
                      2
                    </div>
                    <h2 className="text-sm font-bold text-[#1C2B1C] uppercase tracking-wide">
                      Operação & Logística
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

                    {/* Quantidade */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center justify-between">
                        <span>Quantidade</span>
                        <span className="text-[10px] font-bold text-emerald-700">
                          {produtoSelecionado?.unidade || 'UN'}
                        </span>
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={quantidade}
                        onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value)))}
                        className="text-xs h-9 border-[#DCE5DC] font-medium"
                      />
                    </div>

                    {/* Tipo de Operação (Feedback visual imediato) */}
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
                </div>

                <div className="border-t border-[#DCE5DC]" />

                {/* ----------------------------------------------------------- */}
                {/* SEÇÃO 3: VALORES COMERCIAIS & CÂMBIO                       */}
                {/* ----------------------------------------------------------- */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white text-xs font-bold flex items-center justify-center">
                      3
                    </div>
                    <h2 className="text-sm font-bold text-[#1C2B1C] uppercase tracking-wide">
                      Valores Comerciais, Câmbio & Custos Acessórios
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
                              Margem Desejada (%)
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

                    {/* Despesas Acessórias e PIS/COFINS Agro */}
                    <div className="md:col-span-6 space-y-3">
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5 text-gray-500" />
                            Frete (R$)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            value={frete}
                            onChange={(e) => setFrete(Number(e.target.value))}
                            className="text-xs h-9 border-[#DCE5DC]"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-gray-500" />
                            Seguro (R$)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            value={seguro}
                            onChange={(e) => setSeguro(Number(e.target.value))}
                            className="text-xs h-9 border-[#DCE5DC]"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-gray-700">Outros (R$)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={outrasDespesas}
                            onChange={(e) => setOutrasDespesas(Number(e.target.value))}
                            className="text-xs h-9 border-[#DCE5DC]"
                          />
                        </div>
                      </div>

                      {/* Parâmetro Fiscal: PIS/COFINS Agro */}
                      <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Percent className="w-4 h-4 text-blue-700" />
                            <Label className="text-xs font-bold text-blue-950">
                              PIS & COFINS Agro (Regime Temporal)
                            </Label>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 text-blue-700 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              A LC 224/2025 prevê reoneração linear de 10% a partir de Abril/2026
                              (0,165% PIS + 0,760% COFINS no Lucro Real). Até lá, vigora a Alíquota
                              Zero da Lei 10.925/2004.
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <div className="text-[11px] text-blue-900 leading-tight">
                            Status atual:{' '}
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
                            Alternar Regime
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* BOTÃO PRINCIPAL DE SIMULAÇÃO                                */}
                {/* ----------------------------------------------------------- */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#DCE5DC]">
                  <div className="text-xs text-[#5A6D5A]">
                    Pressione o botão para apurar alíquotas interestaduais, reduções de base e
                    mark-up comercial.
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
            {/* PAINEL DE RESULTADO: Aparece após simular (sem poluir a tela)  */}
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
                        fiscal, acerte a aba <strong>"Regras Fiscais"</strong> ou importe a aba{' '}
                        <strong>"Regra ICMS"</strong> da planilha na tela de importação.
                      </p>
                    </div>
                  </div>
                )}

                {/* ----------------------------------------------------------- */}
                {/* CARDS EXECUTIVOS RESUMIDOS NO TOPO DO RESULTADO             */}
                {/* ----------------------------------------------------------- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Base Comercial */}
                  <Card className="border-[#DCE5DC] bg-white shadow-xs hover:border-[#1B5E20]/40 transition-colors">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#5A6D5A] uppercase tracking-wider">
                          Base Comercial
                        </span>
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                      <p className="text-xl font-extrabold text-[#1C2B1C] tracking-tight">
                        {resultado.valorTotalOperacao.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        Mercadoria + Frete, Seguro e Despesas
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 2: Tributos Totais */}
                  <Card className="border-[#DCE5DC] bg-white shadow-xs hover:border-red-300 transition-colors">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#5A6D5A] uppercase tracking-wider">
                          Tributos Totais
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

                  {/* Card 3: Custo Final com Tributos */}
                  <Card className="border-[#DCE5DC] bg-white shadow-xs hover:border-amber-300 transition-colors">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#5A6D5A] uppercase tracking-wider">
                          Custo Total
                        </span>
                        <Receipt className="w-4 h-4 text-gray-400" />
                      </div>
                      <p className="text-xl font-extrabold text-[#1C2B1C] tracking-tight">
                        {resultado.custoTotalComTributos.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Base da operação + carga tributária
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 4: Preço Sugerido (Destaque Principal) */}
                  <Card className="border-emerald-800 bg-gradient-to-br from-[#0D2811] via-[#154a19] to-[#1B5E20] text-white shadow-md">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider">
                          Preço Sugerido
                        </span>
                        <Badge className="bg-emerald-400/20 text-emerald-200 text-[10px] border-emerald-400/30 font-bold">
                          +{resultado.margemLucroPerc}% Mark-up
                        </Badge>
                      </div>
                      <p className="text-2xl font-extrabold text-white tracking-tight">
                        {resultado.precoVendaSugerido.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                      <p className="text-[11px] text-emerald-200 truncate">
                        Margem: +
                        {resultado.margemLucroValor.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* COMPOSIÇÃO DETALHADA DO PREÇO LINHA A LINHA (Tabela Zebra)  */}
                {/* ----------------------------------------------------------- */}
                <Card className="border-[#DCE5DC] shadow-sm bg-white overflow-hidden">
                  <CardHeader className="bg-[#F8FAF6] border-b border-[#DCE5DC] py-3.5 px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-[#1B5E20]" />
                        <CardTitle className="text-sm font-bold text-[#1C2B1C]">
                          Composição do Preço & Carga Tributária Linha a Linha
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-xs font-mono text-[#1B5E20] bg-white border-emerald-300"
                        >
                          {resultado.ufOrigem} → {resultado.ufDestino} ({resultado.operacao})
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-[#1C2B1C] font-semibold">
                          <th className="py-2.5 px-4 text-left">Item da Composição</th>
                          <th className="py-2.5 px-4 text-left hidden sm:table-cell">
                            Detalhamento / Alíquota
                          </th>
                          <th className="py-2.5 px-4 text-left hidden md:table-cell">
                            Fundamentação Legal
                          </th>
                          <th className="py-2.5 px-4 text-right">Valor Apurado (R$)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {/* Linha 1: Mercadoria */}
                        <tr className="hover:bg-gray-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-gray-900">
                              1. Mercadoria ({resultado.quantidade} {resultado.unidade})
                            </div>
                            <div className="text-[11px] text-gray-500 sm:hidden">
                              {resultado.moedaOriginal === 'USD'
                                ? `US$ ${resultado.valorUnitarioOriginal.toFixed(2)} × PTAX R$ ${resultado.ptaxAplicada.toFixed(4)}`
                                : `R$ ${resultado.valorUnitarioReais.toFixed(2)} / ${resultado.unidade}`}
                            </div>
                          </td>
                          <td className="py-3 px-4 hidden sm:table-cell text-gray-600">
                            {resultado.moedaOriginal === 'USD' ? (
                              <span>
                                US$ {resultado.valorUnitarioOriginal.toFixed(2)} × PTAX R${' '}
                                {resultado.ptaxAplicada.toFixed(4)} = R${' '}
                                {resultado.valorUnitarioReais.toFixed(2)} / {resultado.unidade}
                              </span>
                            ) : (
                              <span>
                                R$ {resultado.valorUnitarioReais.toFixed(2)} / {resultado.unidade}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 hidden md:table-cell text-[11px] text-gray-500">
                            Valor FOB/CIF Comercial
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 text-sm">
                            {resultado.valorMercadoriaReais.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                        </tr>

                        {/* Linha 2: Despesas Logísticas */}
                        <tr className="bg-[#FCFDFB] hover:bg-gray-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-gray-900">
                              2. Despesas Acessórias (Frete / Seguro / Outros)
                            </div>
                            <div className="text-[11px] text-gray-500 sm:hidden">
                              Frete R$ {resultado.frete.toFixed(2)} | Seguro R${' '}
                              {resultado.seguro.toFixed(2)}
                            </div>
                          </td>
                          <td className="py-3 px-4 hidden sm:table-cell text-gray-600">
                            Frete: R$ {resultado.frete.toFixed(2)} | Seguro: R${' '}
                            {resultado.seguro.toFixed(2)} | Outros: R${' '}
                            {resultado.outrasDespesas.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 hidden md:table-cell text-[11px] text-gray-500">
                            Soma na Base de Cálculo do ICMS
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-gray-700">
                            +
                            {resultado.totalDespesasAcessorias.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                        </tr>

                        {/* Linha 3: Subtotal Comercial */}
                        <tr className="bg-emerald-50/40 border-y border-emerald-100 font-bold text-emerald-950">
                          <td className="py-2.5 px-4 font-bold" colSpan={3}>
                            Subtotal Base Comercial da Operação
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-sm text-[#1B5E20]">
                            {resultado.valorTotalOperacao.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                        </tr>

                        {/* Linha 4: ICMS */}
                        <tr className="hover:bg-gray-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-gray-900 flex items-center gap-1.5">
                              <span>3. {resultado.icms.nome}</span>
                              {resultado.icms.reducaoBasePerc ? (
                                <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">
                                  Redução {resultado.icms.reducaoBasePerc}%
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-[11px] text-gray-500 md:hidden mt-0.5">
                              {resultado.icms.fundamentacao}
                            </div>
                          </td>
                          <td className="py-3 px-4 hidden sm:table-cell">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className="text-[10px] bg-sky-100 text-sky-800 border-sky-200">
                                Nominal: {resultado.icms.aliquotaNominal}%
                              </Badge>
                              <span className="text-[11px] text-emerald-800 font-semibold">
                                Efetiva: {resultado.icms.aliquotaEfetiva.toFixed(2)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 hidden md:table-cell text-[11px] text-gray-600">
                            {resultado.icms.fundamentacao}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 text-sm">
                            {resultado.icms.valorImposto.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                        </tr>

                        {/* Linha 5: PIS / COFINS */}
                        <tr className="bg-[#FCFDFB] hover:bg-gray-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-gray-900">4. PIS & COFINS Agro</div>
                            <div className="text-[11px] text-gray-500 md:hidden mt-0.5">
                              {resultado.pis.fundamentacao}
                            </div>
                          </td>
                          <td className="py-3 px-4 hidden sm:table-cell">
                            <Badge className="text-[10px] bg-blue-100 text-blue-800 border-blue-200">
                              PIS {resultado.pis.aliquotaNominal.toFixed(3)}% + COFINS{' '}
                              {resultado.cofins.aliquotaNominal.toFixed(3)}%
                            </Badge>
                            <span className="text-[11px] text-gray-500 block mt-0.5">
                              PIS: R$ {resultado.pis.valorImposto.toFixed(2)} | COFINS: R${' '}
                              {resultado.cofins.valorImposto.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3 px-4 hidden md:table-cell text-[11px] text-gray-600">
                            {resultado.pis.fundamentacao}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 text-sm">
                            {(
                              resultado.pis.valorImposto + resultado.cofins.valorImposto
                            ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>

                        {/* Linha 6: IBS & CBS (Reforma LC 214/2025) */}
                        <tr className="hover:bg-gray-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-purple-950 flex items-center gap-1.5">
                              <span>5. IBS & CBS (Reforma Tributária)</span>
                              <Badge className="text-[10px] bg-purple-100 text-purple-800 border-purple-200">
                                Redução 60% Agro
                              </Badge>
                            </div>
                            <div className="text-[11px] text-gray-500 md:hidden mt-0.5">
                              {resultado.ibs.fundamentacao}
                            </div>
                          </td>
                          <td className="py-3 px-4 hidden sm:table-cell text-gray-600">
                            <span className="text-[11px]">
                              IBS: {resultado.ibs.aliquotaEfetiva.toFixed(3)}% (R${' '}
                              {resultado.ibs.valorImposto.toFixed(2)}) + CBS:{' '}
                              {resultado.cbs.aliquotaEfetiva.toFixed(3)}% (R${' '}
                              {resultado.cbs.valorImposto.toFixed(2)})
                            </span>
                          </td>
                          <td className="py-3 px-4 hidden md:table-cell text-[11px] text-purple-800">
                            {resultado.ibs.fundamentacao}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-purple-950 text-sm">
                            {(
                              resultado.ibs.valorImposto + resultado.cbs.valorImposto
                            ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>

                        {/* Linha 7: Totalizador de Carga Tributária */}
                        <tr className="bg-red-50/30 border-y border-red-100 font-semibold text-red-950">
                          <td className="py-2.5 px-4 font-bold" colSpan={3}>
                            Total Carga Tributária (
                            {resultado.cargaTributariaEfetivaPerc.toFixed(2)}% efetiva)
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-sm text-red-700">
                            {resultado.totalTributos.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                        </tr>

                        {/* Linha 8: Custo Total */}
                        <tr className="hover:bg-gray-50/70 transition-colors font-semibold">
                          <td className="py-3 px-4 text-gray-900" colSpan={3}>
                            6. Custo Total com Tributos
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 text-sm">
                            {resultado.custoTotalComTributos.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                        </tr>

                        {/* Linha 9: Margem Comercial */}
                        <tr className="hover:bg-gray-50/70 transition-colors font-semibold text-emerald-800">
                          <td className="py-3 px-4" colSpan={3}>
                            7. Margem Comercial Aplicada (+{resultado.margemLucroPerc}% Mark-up)
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-sm text-emerald-800">
                            +
                            {resultado.margemLucroValor.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                        </tr>

                        {/* Linha 10: Preço Sugerido Total */}
                        <tr className="bg-[#1B5E20] text-white font-bold text-sm">
                          <td
                            className="py-4 px-4 font-extrabold uppercase tracking-wide"
                            colSpan={3}
                          >
                            Preço de Venda Sugerido Total da Operação
                          </td>
                          <td className="py-4 px-4 text-right font-mono font-extrabold text-base text-amber-300">
                            {resultado.precoVendaSugerido.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* ----------------------------------------------------------- */}
                {/* MEMÓRIA DE CÁLCULO RECOLHÍVEL (Estrutura Limpa)             */}
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
                        Memória de Cálculo & Trilha de Auditoria Fiscal
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

          {/* =================================================================== */}
          {/* ABA 2: BASE DE PRODUTOS                                             */}
          {/* =================================================================== */}
          <TabsContent value="produtos" className="mt-0">
            <AbaBaseProdutos ativa={abaAtiva === 'produtos'} />
          </TabsContent>

          {/* =================================================================== */}
          {/* ABA 3: REGRAS FISCAIS                                               */}
          {/* =================================================================== */}
          <TabsContent value="regras" className="mt-0">
            <AbaRegrasFiscais ativa={abaAtiva === 'regras'} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}
export default Simulador
