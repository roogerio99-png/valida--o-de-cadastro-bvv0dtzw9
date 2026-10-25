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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const [regraIcmsAtual, setRegraIcmsAtual] = useState<SimRegraIcmsItem | null>(null)
  const [resultado, setResultado] = useState<SimuladorResultado | null>(null)

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
    } catch (err: any) {
      console.warn('Coleção sim_produtos_base vazia ou não preenchida ainda:', err?.message)
      if (!produtoSelecionado) {
        selecionarProduto(PRODUTOS_SEED_DEMO[0])
      }
    } finally {
      setCarregandoProdutos(false)
    }
  }

  useEffect(() => {
    carregarProdutos()
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
    } catch (err: any) {
      toast({
        title: 'Erro na Simulação',
        description: err.message || 'Falha ao processar simulação.',
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
  }, [produtoSelecionado, ufOrigem, ufDestino, considerarReoneracao2026])

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DCE5DC] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#1B5E20] text-white shadow-sm">
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
                Simulação de custos, tributos interestaduais (ICMS, PIS/COFINS, IBS/CBS) e formação
                de preço comercial.
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
            className="border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 text-[#1B5E20] ${carregandoProdutos ? 'animate-spin' : ''}`}
            />
            Atualizar Itens
          </Button>
          <Button
            onClick={handleSimular}
            disabled={calculando}
            className="bg-[#1B5E20] hover:bg-[#154a19] text-white shadow-sm font-semibold"
          >
            <Sparkles className="w-4 h-4 mr-2 text-amber-300" />
            {calculando ? 'Calculando...' : 'Recalcular'}
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
        {/* ABA 1: SIMULAÇÃO (Conteúdo Original) */}
        {/* =================================================================== */}
        <TabsContent value="simulacao" className="mt-0 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* =================================================================== */}
            {/* PAINEL ESQUERDO: ENTRADA FÁCIL (Formulário da Aba Entrada Fácil) */}
            {/* =================================================================== */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="border-[#DCE5DC] shadow-sm bg-white">
                <CardHeader className="bg-[#F8FAF6] border-b border-[#DCE5DC] pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-[#1B5E20]" />
                      <CardTitle className="text-base font-bold text-[#1C2B1C]">
                        Entrada Fácil: Produto & Operação
                      </CardTitle>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-xs font-mono bg-white text-[#1B5E20] border-emerald-300"
                    >
                      Aba Entrada Fácil
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-[#5A6D5A]">
                    Selecione o insumo da base e configure as variáveis comerciais.
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-4 space-y-4 text-xs">
                  {/* Seleção do Produto */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">
                      Produto Base (
                      {produtos.length > 0 ? `${produtos.length} importados` : 'Exemplos'})
                    </Label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input
                        placeholder="Filtrar por nome, NCM ou código..."
                        value={termoBuscaProduto}
                        onChange={(e) => setTermoBuscaProduto(e.target.value)}
                        className="pl-8 text-xs h-8 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-[#DCE5DC] rounded-lg divide-y divide-gray-100 bg-[#FCFDFB]">
                      {produtosDisponiveis.map((p, idx) => {
                        const isSelected = produtoSelecionado?.descricao === p.descricao
                        return (
                          <button
                            key={p.id || idx}
                            type="button"
                            onClick={() => selecionarProduto(p)}
                            className={`w-full text-left p-2 transition-colors flex items-start justify-between gap-2 text-xs ${
                              isSelected
                                ? 'bg-emerald-50 border-l-4 border-l-[#1B5E20] text-[#0D2811]'
                                : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="font-semibold truncate leading-tight">{p.descricao}</p>
                              <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                                <span className="font-mono bg-gray-100 px-1 rounded">
                                  NCM {p.ncm || 'S/NCM'}
                                </span>
                                <span>•</span>
                                <span>Origem: {p.origem || 'Nac'}</span>
                                {p.moeda && (
                                  <span className="font-bold text-emerald-800">({p.moeda})</span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-[#1B5E20] shrink-0 mt-0.5" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Informações Rápidas do Produto Selecionado */}
                  {produtoSelecionado && (
                    <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200/60 text-emerald-950 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs truncate">
                          {produtoSelecionado.descricao}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {produtoSelecionado.gr_trib && (
                            <Badge
                              className="text-[10px] h-4 bg-blue-700 text-white font-mono"
                              title="Grupo Tributário"
                            >
                              GrTrib {produtoSelecionado.gr_trib}
                            </Badge>
                          )}
                          <Badge className="text-[10px] h-4 bg-emerald-700 text-white font-mono">
                            {produtoSelecionado.ncm || '3808.93.29'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-emerald-800">
                        <span>
                          Embalagem: {produtoSelecionado.embalagem || 'Padrão'} (
                          {produtoSelecionado.unidade || 'L'})
                        </span>
                        <span>Fabricante: {produtoSelecionado.fabricante || 'Geral'}</span>
                      </div>
                    </div>
                  )}
                  {/* Rota da Operação: Origem -> Destino */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-[#1B5E20]" />
                        UF Origem
                      </Label>
                      <select
                        value={ufOrigem}
                        onChange={(e) => setUfOrigem(e.target.value)}
                        className="w-full h-8 text-xs rounded-md border border-[#DCE5DC] bg-white px-2 focus:ring-1 focus:ring-[#1B5E20]"
                      >
                        {UFS_BRASIL.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-[#1B5E20]" />
                        UF Destino
                      </Label>
                      <select
                        value={ufDestino}
                        onChange={(e) => setUfDestino(e.target.value)}
                        className="w-full h-8 text-xs rounded-md border border-[#DCE5DC] bg-white px-2 focus:ring-1 focus:ring-[#1B5E20]"
                      >
                        {UFS_BRASIL.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quantidade e Preço Unitário */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#1C2B1C]">
                        Quantidade ({produtoSelecionado?.unidade || 'Un'})
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={quantidade}
                        onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value)))}
                        className="text-xs h-8 border-[#DCE5DC]"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center justify-between">
                        <span>Preço Unitário</span>
                        <span className="font-bold text-emerald-700">{moeda}</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={precoUnitario}
                        onChange={(e) => setPrecoUnitario(Number(e.target.value))}
                        className="text-xs h-8 border-[#DCE5DC]"
                      />
                    </div>
                  </div>

                  {/* Bloco de Câmbio / PTAX Manual (Destaque quando for importado) */}
                  <div
                    className={`p-3 rounded-xl border transition-all ${
                      isProdutoImportado
                        ? 'bg-amber-50/80 border-amber-300 shadow-sm'
                        : 'bg-gray-50/60 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <DollarSign
                          className={`w-4 h-4 ${isProdutoImportado ? 'text-amber-700' : 'text-gray-500'}`}
                        />
                        <Label
                          className={`text-xs font-bold ${isProdutoImportado ? 'text-amber-900' : 'text-gray-700'}`}
                        >
                          Cotação PTAX Manual (Câmbio USD)
                        </Label>
                      </div>
                      {isProdutoImportado ? (
                        <Badge className="bg-amber-600 text-white text-[10px]">
                          Obrigatório p/ Importado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-gray-500">
                          Opcional
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500">US$ 1,00 = R$</span>
                      <Input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={ptaxManual}
                        onChange={(e) => setPtaxManual(Number(e.target.value))}
                        className="h-8 text-xs font-mono font-bold bg-white border-amber-300 focus-visible:ring-amber-500"
                        placeholder="Ex: 5.7500"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Digitação manual direta do usuário (sem integração automática de câmbio).
                    </p>
                  </div>

                  {/* Custos Acessórios */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-gray-600">Frete (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={frete}
                        onChange={(e) => setFrete(Number(e.target.value))}
                        className="text-xs h-7 border-[#DCE5DC]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-gray-600">Seguro (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={seguro}
                        onChange={(e) => setSeguro(Number(e.target.value))}
                        className="text-xs h-7 border-[#DCE5DC]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-gray-600">
                        Outras Desp. (R$)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={outrasDespesas}
                        onChange={(e) => setOutrasDespesas(Number(e.target.value))}
                        className="text-xs h-7 border-[#DCE5DC]"
                      />
                    </div>
                  </div>

                  {/* Margem Comercial e Parâmetros Tributários */}
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-[#1B5E20]" />
                        Margem Desejada (%)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={margemPerc}
                        onChange={(e) => setMargemPerc(Number(e.target.value))}
                        className="text-xs h-8 border-[#DCE5DC]"
                      />
                    </div>

                    <div className="flex-1 space-y-1">
                      <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5 text-blue-600" />
                        PIS/COFINS Agro
                      </Label>
                      <button
                        type="button"
                        onClick={() => setConsiderarReoneracao2026(!considerarReoneracao2026)}
                        className={`w-full h-8 px-2 rounded-md text-[11px] font-semibold border transition-all text-left flex items-center justify-between ${
                          considerarReoneracao2026
                            ? 'bg-blue-50 border-blue-300 text-blue-900'
                            : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        }`}
                      >
                        <span>
                          {considerarReoneracao2026
                            ? 'LC 224/25 (0,925%)'
                            : 'Alíquota Zero (Lei 10.925)'}
                        </span>
                        <span className="text-[10px] underline">Alternar</span>
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* =================================================================== */}
            {/* PAINEL DIREITO: RESULTADO DA SIMULAÇÃO (Aba Simulador da Planilha) */}
            {/* =================================================================== */}
            <div className="lg:col-span-7 space-y-6">
              {resultado ? (
                <div className="space-y-6">
                  {/* Alerta de Ausência de Regra de ICMS quando aplicável */}
                  {!resultado.temRegraIcms && (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3 shadow-sm animate-in slide-in-from-top-1">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <p className="font-bold">
                          Atenção: Sem regra de ICMS cadastrada para {resultado.ufOrigem} →{' '}
                          {resultado.ufDestino}
                        </p>
                        <p className="text-amber-800">
                          O cálculo utilizou a alíquota padrão estimada (
                          {resultado.icms.aliquotaNominal}%). Para máxima precisão fiscal, importe a
                          aba <strong>"Regra ICMS"</strong> da planilha na tela de importação.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Cards de Resumo Executivo Superior */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Card className="border-[#DCE5DC] bg-white shadow-sm">
                      <CardContent className="p-4">
                        <span className="text-[11px] font-medium text-[#5A6D5A] uppercase tracking-wider">
                          Base Comercial
                        </span>
                        <p className="text-xl font-bold text-[#1C2B1C] mt-1">
                          {resultado.valorTotalOperacao.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </p>
                        <span className="text-[10px] text-gray-500">Mercadoria + Frete/Seguro</span>
                      </CardContent>
                    </Card>

                    <Card className="border-[#DCE5DC] bg-white shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-[#5A6D5A] uppercase tracking-wider">
                            Tributos Totais
                          </span>
                          <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                            {resultado.cargaTributariaEfetivaPerc.toFixed(2)}%
                          </Badge>
                        </div>
                        <p className="text-xl font-bold text-red-700 mt-1">
                          {resultado.totalTributos.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </p>
                        <span className="text-[10px] text-gray-500">
                          ICMS + PIS/COFINS + IBS/CBS
                        </span>
                      </CardContent>
                    </Card>

                    <Card className="border-[#DCE5DC] bg-gradient-to-br from-[#0D2811] to-[#1B5E20] text-white shadow-md">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-emerald-200 uppercase tracking-wider">
                            Preço Sugerido
                          </span>
                          <Badge className="bg-emerald-400/20 text-emerald-200 text-[10px] border-emerald-400/30">
                            +{resultado.margemLucroPerc}% Margem
                          </Badge>
                        </div>
                        <p className="text-xl font-bold text-white mt-1">
                          {resultado.precoVendaSugerido.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </p>
                        <span className="text-[10px] text-emerald-300">
                          Custo total:{' '}
                          {resultado.custoTotalComTributos.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Tabela de Composição de Custos e Tributos Linha a Linha (Espelho da aba Simulador) */}
                  <Card className="border-[#DCE5DC] shadow-sm bg-white overflow-hidden">
                    <CardHeader className="bg-[#F8FAF6] border-b border-[#DCE5DC] py-3 px-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-[#1B5E20]" />
                          <CardTitle className="text-sm font-bold text-[#1C2B1C]">
                            Composição do Preço & Carga Tributária Linha a Linha
                          </CardTitle>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[11px] font-mono text-[#1B5E20] bg-white"
                        >
                          {resultado.ufOrigem} → {resultado.ufDestino} ({resultado.operacao})
                        </Badge>
                      </div>
                    </CardHeader>

                    <div className="divide-y divide-gray-100 text-xs">
                      {/* Linha 1: Produto e Câmbio */}
                      <div className="p-3.5 flex items-center justify-between hover:bg-gray-50/50">
                        <div>
                          <p className="font-semibold text-gray-900">
                            1. Mercadoria ({resultado.quantidade} {resultado.unidade})
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {resultado.moedaOriginal === 'USD'
                              ? `US$ ${resultado.valorUnitarioOriginal.toFixed(2)} × PTAX R$ ${resultado.ptaxAplicada.toFixed(4)} = R$ ${resultado.valorUnitarioReais.toFixed(2)} / ${resultado.unidade}`
                              : `Preço Unitário: R$ ${resultado.valorUnitarioReais.toFixed(2)} / ${resultado.unidade}`}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-gray-900 text-sm">
                          {resultado.valorMercadoriaReais.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>

                      {/* Linha 2: Despesas Acessórias */}
                      <div className="p-3.5 flex items-center justify-between hover:bg-gray-50/50 bg-[#FCFDFB]">
                        <div>
                          <p className="font-semibold text-gray-900">
                            2. Despesas Logísticas & Acessórias
                          </p>
                          <p className="text-[11px] text-gray-500">
                            Frete: R$ {resultado.frete.toFixed(2)} | Seguro: R${' '}
                            {resultado.seguro.toFixed(2)} | Outros: R${' '}
                            {resultado.outrasDespesas.toFixed(2)}
                          </p>
                        </div>
                        <span className="font-mono font-semibold text-gray-700">
                          +
                          {resultado.totalDespesasAcessorias.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>

                      {/* Linha 3: Subtotal Comercial */}
                      <div className="p-3.5 flex items-center justify-between bg-emerald-50/30 font-semibold">
                        <span className="text-emerald-950 font-bold">Subtotal Base Comercial</span>
                        <span className="font-mono text-emerald-950 font-bold">
                          {resultado.valorTotalOperacao.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>

                      {/* Linha 4: ICMS */}
                      <div className="p-3.5 flex items-start justify-between hover:bg-gray-50/50">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{resultado.icms.nome}</span>
                            <Badge className="text-[10px] bg-sky-100 text-sky-800 border-sky-200">
                              Alíq. Nominal: {resultado.icms.aliquotaNominal}%
                            </Badge>
                            {resultado.icms.reducaoBasePerc ? (
                              <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">
                                Redução Base: {resultado.icms.reducaoBasePerc}%
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-gray-500">
                            {resultado.icms.fundamentacao}
                          </p>
                          <p className="text-[11px] text-emerald-800">
                            Alíquota Efetiva:{' '}
                            <strong>{resultado.icms.aliquotaEfetiva.toFixed(2)}%</strong> sobre a
                            base
                          </p>
                        </div>
                        <span className="font-mono font-bold text-gray-900 text-sm">
                          {resultado.icms.valorImposto.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>

                      {/* Linha 5: PIS / COFINS */}
                      <div className="p-3.5 flex items-start justify-between hover:bg-gray-50/50 bg-[#FCFDFB]">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">PIS & COFINS (Agro)</span>
                            <Badge className="text-[10px] bg-blue-100 text-blue-800 border-blue-200">
                              PIS {resultado.pis.aliquotaNominal.toFixed(3)}% + COFINS{' '}
                              {resultado.cofins.aliquotaNominal.toFixed(3)}%
                            </Badge>
                          </div>
                          <p className="text-[11px] text-gray-500">{resultado.pis.fundamentacao}</p>
                          <p className="text-[11px] text-gray-600">
                            PIS: R$ {resultado.pis.valorImposto.toFixed(2)} | COFINS: R${' '}
                            {resultado.cofins.valorImposto.toFixed(2)}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-gray-900 text-sm">
                          {(
                            resultado.pis.valorImposto + resultado.cofins.valorImposto
                          ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>

                      {/* Linha 6: IBS & CBS (Transição Reforma) */}
                      <div className="p-3.5 flex items-start justify-between hover:bg-gray-50/50">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-purple-900">
                              IBS & CBS (Reforma Tributária)
                            </span>
                            <Badge className="text-[10px] bg-purple-100 text-purple-800 border-purple-200">
                              Redução 60% Insumos Agro
                            </Badge>
                          </div>
                          <p className="text-[11px] text-gray-500">{resultado.ibs.fundamentacao}</p>
                          <p className="text-[11px] text-gray-600">
                            IBS Efetivo: {resultado.ibs.aliquotaEfetiva.toFixed(3)}% (R${' '}
                            {resultado.ibs.valorImposto.toFixed(2)}) + CBS Efetivo:{' '}
                            {resultado.cbs.aliquotaEfetiva.toFixed(3)}% (R${' '}
                            {resultado.cbs.valorImposto.toFixed(2)})
                          </p>
                        </div>
                        <span className="font-mono font-semibold text-purple-950">
                          {(resultado.ibs.valorImposto + resultado.cbs.valorImposto).toLocaleString(
                            'pt-BR',
                            { style: 'currency', currency: 'BRL' },
                          )}
                        </span>
                      </div>

                      {/* Linha 7: Totalizador de Custo Final e Preço de Venda */}
                      <div className="p-4 bg-[#F8FAF6] space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                          <span>Custo Total com Tributos (R$)</span>
                          <span className="font-mono font-bold text-gray-900">
                            {resultado.custoTotalComTributos.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                          <span>Margem Comercial Aplicada (+{resultado.margemLucroPerc}%)</span>
                          <span className="font-mono font-bold">
                            +
                            {resultado.margemLucroValor.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-[#DCE5DC] flex items-center justify-between">
                          <span className="text-sm font-bold text-[#0D2811]">
                            Preço de Venda Sugerido Total
                          </span>
                          <span className="text-lg font-mono font-extrabold text-[#1B5E20]">
                            {resultado.precoVendaSugerido.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              ) : (
                <Card className="border-[#DCE5DC] bg-white text-center p-12">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-4 rounded-full bg-emerald-50 text-[#1B5E20]">
                      <Calculator className="w-8 h-8" />
                    </div>
                    <h3 className="text-base font-bold text-[#1C2B1C]">Pronto para simular</h3>
                    <p className="text-xs text-[#5A6D5A] max-w-sm">
                      Escolha os parâmetros na barra esquerda e clique em{' '}
                      <strong>"Recalcular"</strong> para processar os custos e a cadeia tributária
                      da operação.
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* =================================================================== */}
        {/* ABA 2: BASE DE PRODUTOS */}
        {/* =================================================================== */}
        <TabsContent value="produtos" className="mt-0">
          <AbaBaseProdutos ativa={abaAtiva === 'produtos'} />
        </TabsContent>

        {/* =================================================================== */}
        {/* ABA 3: REGRAS FISCAIS */}
        {/* =================================================================== */}
        <TabsContent value="regras" className="mt-0">
          <AbaRegrasFiscais ativa={abaAtiva === 'regras'} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
export default Simulador
