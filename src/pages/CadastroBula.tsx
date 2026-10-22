import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  ExternalLink,
  Info,
  ShieldCheck,
  Building2,
  Box,
  Sprout,
  Target,
  Sparkles,
  FlaskConical,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  listarBulasProdutos,
  excluirBulaProduto,
  listarBulaComposicao,
  listarBulaEmpresas,
  listarBulaEmbalagens,
  listarBulaCulturas,
  listarBulaAlvos,
  listarBulaAplicacao,
  limparCadastroBula,
} from '@/services/agroService'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'
import type {
  BulaProdutoItem,
  BulaComposicaoItem,
  BulaEmpresaItem,
  BulaEmbalagemItem,
  BulaCulturaItem,
  BulaAlvoItem,
  BulaAplicacaoItem,
} from '@/types/agro'

export function CadastroBula() {
  const { isAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''

  const [produtos, setProdutos] = useState<BulaProdutoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialQuery)
  const [classeFilter, setClasseFilter] = useState<string>('todos')
  const [statusFilter, setStatusFilter] = useState<string>('todos')

  // Linhas expandidas na tabela principal
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({})

  // Modal para detalhe amplo da Bula com blocos acessórios
  const [selectedBula, setSelectedBula] = useState<BulaProdutoItem | null>(null)
  const [modalBulaOpen, setModalBulaOpen] = useState(false)

  // Modal Limpar Base
  const [modalLimparOpen, setModalLimparOpen] = useState(false)
  const [confirmacaoTexto, setConfirmacaoTexto] = useState('')
  const [executandoLimpeza, setExecutandoLimpeza] = useState(false)

  // Rolagem e paginação
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageRef = useRef(1)
  const hasMoreRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const loadingInitialRef = useRef(false)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const buildFilterString = useCallback(() => {
    const filters: string[] = []
    if (search.trim()) {
      const clean = search.trim().replace(/'/g, "\\'")
      filters.push(
        `(nome_comercial ~ '${clean}' || registro_mapa ~ '${clean}' || marca_padronizada ~ '${clean}' || titular_registro ~ '${clean}' || principio_ativo ~ '${clean}' || classe_agronomica ~ '${clean}')`,
      )
    }
    if (classeFilter !== 'todos') {
      filters.push(`classe_agronomica ~ '${classeFilter.replace(/'/g, "\\'")}'`)
    }
    if (statusFilter !== 'todos') {
      filters.push(`status_registro = '${statusFilter.replace(/'/g, "\\'")}'`)
    }
    return filters.join(' && ')
  }, [search, classeFilter, statusFilter])

  const carregarProdutos = useCallback(async () => {
    loadingInitialRef.current = true
    setLoading(true)
    pageRef.current = 1
    try {
      const filterStr = buildFilterString()
      const res = await listarBulasProdutos({
        page: 1,
        perPage: 50,
        filter: filterStr || undefined,
        sort: 'nome_comercial',
      })
      setProdutos(res.items)
      setTotalCount(res.totalItems)
      const more = (res.totalPages || 1) > 1
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error('Erro ao carregar Cadastro de Bula:', err)
    } finally {
      loadingInitialRef.current = false
      setLoading(false)
    }
  }, [buildFilterString])

  const carregarMaisProdutos = useCallback(async () => {
    if (loadingMoreRef.current || loadingInitialRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const nextPage = pageRef.current + 1
    try {
      const filterStr = buildFilterString()
      const res = await listarBulasProdutos({
        page: nextPage,
        perPage: 50,
        filter: filterStr || undefined,
        sort: 'nome_comercial',
      })
      pageRef.current = nextPage
      setProdutos((prev) => {
        const ids = new Set(prev.map((p) => p.id))
        const novos = res.items.filter((item) => !ids.has(item.id))
        return [...prev, ...novos]
      })
      setTotalCount(res.totalItems)
      const more = nextPage < (res.totalPages || 1)
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error('Erro ao carregar mais registros de Bula:', err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [buildFilterString])

  useEffect(() => {
    carregarProdutos()
  }, [carregarProdutos])

  // Infinite Scroll Sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          carregarMaisProdutos()
        }
      },
      {
        root: tableContainerRef.current,
        rootMargin: '250px',
        threshold: 0,
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [carregarMaisProdutos, produtos.length])

  const toggleRowExpanded = (id: string) => {
    setExpandedRowIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const handleExcluir = async (id: string, nome: string) => {
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas administradores podem excluir cadastros de bula.',
      })
      return
    }

    if (!confirm(`Confirma a exclusão definitiva da bula do produto "${nome}"?`)) return

    try {
      await excluirBulaProduto(id)
      toast({
        title: 'Bula Excluída',
        description: `O produto "${nome}" foi removido do Cadastro de Bula.`,
      })
      setProdutos((prev) => prev.filter((p) => p.id !== id))
      setTotalCount((prev) => Math.max(0, prev - 1))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir produto.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    }
  }

  const handleExportarCSV = () => {
    if (produtos.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum registro para exportar.' })
      return
    }

    const headers = [
      'Registro_MAPA',
      'Nome_Comercial',
      'Marca_Padronizada',
      'Titular_Registro',
      'Fabricante_Formulador',
      'Principio_Ativo',
      'Classe_Agronomica',
      'Grupo_Quimico',
      'Classificacao_Toxicologica',
      'Classificacao_Ambiental',
      'Tipo_Formulacao',
      'NCM_Padrao',
    ]

    const rows = produtos.map((p) =>
      [
        `"${p.registro_mapa || ''}"`,
        `"${(p.nome_comercial || '').replace(/"/g, '""')}"`,
        `"${(p.marca_padronizada || '').replace(/"/g, '""')}"`,
        `"${(p.titular_registro || '').replace(/"/g, '""')}"`,
        `"${(p.fabricante_formulador || '').replace(/"/g, '""')}"`,
        `"${(p.principio_ativo || '').replace(/"/g, '""')}"`,
        `"${(p.classe_agronomica || '').replace(/"/g, '""')}"`,
        `"${(p.grupo_quimico || '').replace(/"/g, '""')}"`,
        `"${(p.classificacao_toxicologica || '').replace(/"/g, '""')}"`,
        `"${(p.classificacao_ambiental || '').replace(/"/g, '""')}"`,
        `"${(p.tipo_formulacao || '').replace(/"/g, '""')}"`,
        `"${p.ncm_padrao || ''}"`,
      ].join(';'),
    )

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `cadastro_bula_produtos_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleLimparBase = async () => {
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas administradores podem executar a limpeza do Cadastro de Bula.',
      })
      return
    }
    if (confirmacaoTexto.trim() !== 'LIMPAR') return
    setExecutandoLimpeza(true)
    try {
      const res = await limparCadastroBula({ confirmar: 'LIMPAR' })
      const total = res?.apagados?.total ?? 0
      const detalhes = res?.apagados
        ? `Removidos: ${res.apagados.bula_produtos} produtos mestre, ${res.apagados.bula_composicao} composições, ${res.apagados.bula_empresas} empresas, ${res.apagados.bula_embalagens} embalagens, ${res.apagados.bula_culturas} culturas, ${res.apagados.bula_alvos} alvos, ${res.apagados.bula_aplicacao} aplicações.`
        : ''
      toast({
        title: 'Cadastro de Bula limpo com sucesso',
        description: `Total de ${total} registros removidos de todas as 7 coleções de bula. ${detalhes}`,
      })
      setModalLimparOpen(false)
      setConfirmacaoTexto('')
      setProdutos([])
      setTotalCount(0)
      setHasMore(false)
      hasMoreRef.current = false
      setExpandedRowIds({})
      await carregarProdutos()
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Falha ao executar a limpeza da base de bula.'
      toast({
        variant: 'destructive',
        title: 'Erro na limpeza da base',
        description: msg,
      })
    } finally {
      setExecutandoLimpeza(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-3">
      {/* ------------------------------------------------------------------ */}
      {/* HEADER SUPERIOR COM TÍTULO E AÇÕES */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#1B5E20]" />
            <span>Cadastro de Bula</span>
          </h1>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Estrutura unificada de bulas agropecuárias: Cadastro Principal (1:1) com 6 Blocos
            Acessórios vinculados por Registro MAPA.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarProdutos}
            disabled={loading}
            className="text-xs h-9 rounded-xl border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50 hover:text-[#1B5E20] hover:border-emerald-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportarCSV}
            disabled={produtos.length === 0}
            className="text-xs h-9 rounded-xl border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50 hover:text-[#1B5E20] hover:border-emerald-300"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            <span>Exportar CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmacaoTexto('')
              setModalLimparOpen(true)
            }}
            className="text-xs h-9 rounded-xl border-red-200 text-red-700 bg-red-50/50 hover:bg-red-100/70 hover:text-red-800 hover:border-red-300 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar Base</span>
          </Button>

          <Link to="/importar">
            <Button
              size="sm"
              className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white text-xs h-9 rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <UploadCloud className="w-4 h-4 text-[#F57F17]" />
              <span>Importar Planilhas</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* BARRA DE FILTROS E BUSCA */}
      {/* ------------------------------------------------------------------ */}
      <Card className="p-3 rounded-2xl border-[#DCE5DC] bg-white shadow-sm flex-shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6D5A]" />
            <Input
              type="text"
              placeholder="Buscar por produto, registro MAPA, ingrediente ativo, titular..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 h-9 text-xs rounded-xl bg-[#F5F7F1] border-[#DCE5DC] focus-visible:ring-1 focus-visible:ring-[#1B5E20]"
            />
          </div>

          <div>
            <select
              value={classeFilter}
              onChange={(e) => setClasseFilter(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-xl bg-[#F5F7F1] border border-[#DCE5DC] text-[#1C2B1C] focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
            >
              <option value="todos">Todas as Classes Agronômicas</option>
              <option value="Herbicida">Herbicida</option>
              <option value="Fungicida">Fungicida</option>
              <option value="Inseticida">Inseticida</option>
              <option value="Acaricida">Acaricida</option>
              <option value="Nematicida">Nematicida</option>
              <option value="Regulador">Regulador de Crescimento</option>
              <option value="Biológico">Biológico</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-xl bg-[#F5F7F1] border border-[#DCE5DC] text-[#1C2B1C] focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
            >
              <option value="todos">Todos os Status</option>
              <option value="Ativo">Ativo / Deferido</option>
              <option value="Cancelado">Cancelado</option>
              <option value="Em Análise">Em Análise</option>
            </select>
          </div>
        </div>

        {/* Resumo de Contadores */}
        <div className="mt-2.5 pt-2 border-t border-[#F0F4F0] flex items-center justify-between text-xs text-[#5A6D5A]">
          <div className="flex items-center gap-3">
            <span>
              Total cadastrado:{' '}
              <strong className="text-[#1C2B1C] font-semibold">{totalCount}</strong> produtos
            </span>
            <span>•</span>
            <span>
              Exibindo nesta lista:{' '}
              <strong className="text-[#1C2B1C] font-semibold">{produtos.length}</strong>
            </span>
          </div>

          {totalCount === 0 && !loading && (
            <span className="text-[#F57F17] font-medium text-[11px] flex items-center gap-1">
              <Info className="w-3.5 h-3.5" />
              Nenhuma bula cadastrada ainda — use o botão Importar Planilhas acima para subir o
              XLSX.
            </span>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* TABELA MESTRE DE PRODUTOS */}
      {/* ------------------------------------------------------------------ */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
        <ScrollableTable
          autoFitHeight={true}
          bottomOffset={52}
          containerRef={tableContainerRef}
          onNearBottom={carregarMaisProdutos}
          bottomThreshold={250}
          className="flex-1 min-h-0"
        >
          <table className="w-full text-left border-collapse text-xs min-w-[1150px]">
            <thead className="sticky top-0 z-20 bg-[#F5F7F1] text-[#5A6D5A] border-b border-[#DCE5DC] shadow-[0_1px_0_0_#DCE5DC]">
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-3 font-semibold min-w-[220px]">Produto Comercial</th>
                <th className="py-3 px-3 font-semibold min-w-[130px]">Registro MAPA</th>
                <th className="py-3 px-3 font-semibold min-w-[180px]">Titular do Registro</th>
                <th className="py-3 px-3 font-semibold min-w-[200px]">Princípio Ativo</th>
                <th className="py-3 px-3 font-semibold min-w-[140px]">Classe Agronômica</th>
                <th className="py-3 px-3 font-semibold min-w-[110px]">NCM</th>
                <th className="py-3 px-3 font-semibold min-w-[130px]">Toxicologia</th>
                <th className="py-3 px-3 font-semibold text-center w-28 whitespace-nowrap">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0] bg-white">
              {loading && produtos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#5A6D5A]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[#1B5E20]" />
                      <span className="text-xs">Carregando Cadastro de Bula...</span>
                    </div>
                  </td>
                </tr>
              ) : produtos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#5A6D5A]">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <FileText className="w-10 h-10 text-emerald-300 stroke-[1.5]" />
                      <p className="font-bold text-sm text-[#1C2B1C]">
                        Nenhum produto encontrado no Cadastro de Bula
                      </p>
                      <p className="text-xs text-[#5A6D5A] leading-relaxed">
                        Para começar, faça o upload da planilha oficial com as 7 abas na tela de
                        importação.
                      </p>
                      <Link to="/importar">
                        <Button size="sm" className="mt-2 bg-[#1B5E20] hover:bg-[#2E7D32] text-xs">
                          <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                          Ir para Importar Planilhas
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                produtos.map((p, idx) => {
                  const isExpanded = !!expandedRowIds[p.id]
                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        onClick={() => toggleRowExpanded(p.id)}
                        className={`hover:bg-[#F5F7F1]/70 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-emerald-50/40 font-medium' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center text-[#5A6D5A] font-mono text-[11px]">
                          {idx + 1}
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#1C2B1C] text-xs flex items-center gap-1.5">
                            <span>{p.nome_comercial}</span>
                            {p.tipo_formulacao && (
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 font-normal border-emerald-300 bg-emerald-50 text-emerald-800"
                              >
                                {p.tipo_formulacao}
                              </Badge>
                            )}
                          </div>
                          {p.marca_padronizada && p.marca_padronizada !== p.nome_comercial && (
                            <p className="text-[11px] text-[#5A6D5A] truncate">
                              {p.marca_padronizada}
                            </p>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className="font-mono text-xs font-semibold bg-emerald-50 text-emerald-900 border-emerald-200"
                          >
                            {p.registro_mapa}
                          </Badge>
                        </td>

                        <td
                          className="py-2.5 px-3 text-[#1C2B1C] truncate max-w-[220px]"
                          title={p.titular_registro || ''}
                        >
                          {p.titular_registro || (
                            <span className="text-[#5A6D5A] italic">Não informado</span>
                          )}
                        </td>

                        <td
                          className="py-2.5 px-3 text-[#1C2B1C] truncate max-w-[240px]"
                          title={p.principio_ativo || ''}
                        >
                          {p.principio_ativo || (
                            <span className="text-[#5A6D5A] italic">Não informado</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {p.classe_agronomica ? (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-[#F5F7F1] text-[#1C2B1C] border-[#DCE5DC]"
                            >
                              {p.classe_agronomica}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </td>

                        <td className="py-2.5 px-3 font-mono text-xs text-[#1C2B1C] whitespace-nowrap">
                          {p.ncm_padrao || '—'}
                        </td>

                        <td className="py-2.5 px-3 text-xs text-[#5A6D5A] truncate max-w-[140px]">
                          {p.classificacao_toxicologica || '—'}
                        </td>

                        <td
                          className="py-2.5 px-3 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedBula(p)
                                setModalBulaOpen(true)
                              }}
                              title="Ver Cadastro Completo e Blocos"
                              className="h-7 px-2 text-xs text-[#1B5E20] hover:bg-emerald-100/60 rounded-lg"
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1" />
                              <span>Bula</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleRowExpanded(p.id)}
                              title={isExpanded ? 'Recolher detalhes' : 'Expandir blocos'}
                              className="h-7 w-7 text-[#5A6D5A] hover:text-[#1C2B1C] rounded-lg"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </Button>

                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleExcluir(p.id, p.nome_comercial)}
                                title="Excluir Bula"
                                className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* BLOCO EXPANDIDO: VISÃO INTEGRADA COM ABAS DOS BLOCOS ACESSÓRIOS */}
                      {isExpanded && (
                        <tr className="bg-[#FAFBF9]">
                          <td colSpan={9} className="p-4 border-b border-[#DCE5DC]">
                            <PainelBlocosAcessoriosBula bula={p} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </ScrollableTable>

        {/* Sentinel e Indicadores de Rolagem Infinita */}
        <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />

        {/* Rodapé informativo de rolagem infinita igual ao da Base Mestre */}
        <div className="flex items-center justify-between p-3.5 border-t border-[#DCE5DC] bg-[#FAFBF9] text-xs text-[#5A6D5A]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#1C2B1C]">
              {produtos.length} {produtos.length === 1 ? 'produto exibido' : 'produtos exibidos'}
            </span>
            <span className="text-[#8A9A86]">•</span>
            <span>Ordem alfabética por produto comercial</span>
            <span className="text-[#8A9A86]">•</span>
            <span>Total na base com critérios atuais: {totalCount}</span>
          </div>

          <div className="flex items-center gap-2">
            {loadingMore && (
              <div className="inline-flex items-center gap-1.5 text-xs text-[#1B5E20] font-medium bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 animate-in fade-in">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Carregando próximo lote...</span>
              </div>
            )}
            {!hasMore && produtos.length > 0 && !loading && (
              <span className="text-[11px] text-[#5A6D5A] bg-[#F5F7F1] px-2.5 py-1 rounded-md border border-[#DCE5DC]">
                Fim da lista — todos os {produtos.length} produtos carregados
              </span>
            )}
            {hasMore && !loadingMore && !loading && (
              <span className="text-[11px] text-[#8A9A86] hidden sm:inline">
                Role para baixo para carregar mais automaticamente
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL LIMPAR BASE DE BULA */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        open={modalLimparOpen}
        onOpenChange={(open) => {
          if (!executandoLimpeza) {
            setModalLimparOpen(open)
            if (!open) setConfirmacaoTexto('')
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border-red-200">
          <DialogHeader className="space-y-2">
            <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto sm:mx-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-base font-bold text-red-950">
              Limpar Base de Cadastro de Bula
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5A6D5A] leading-relaxed">
              Esta ação é <strong className="text-red-700">irreversível</strong>. TODOS os registros
              das <strong className="text-[#1C2B1C]">7 coleções do Cadastro de Bula</strong>{' '}
              (produtos comerciais e os 6 blocos acessórios) serão apagados permanentemente do banco
              de dados para recomeçar do zero.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            {!isAdmin ? (
              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                <div>
                  <strong>Acesso Restrito a Administradores</strong>
                  <p className="mt-0.5">
                    Seu perfil é de <strong>Analista</strong>. A limpeza do Cadastro de Bula é uma
                    operação crítica reservada exclusivamente para administradores.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Caixa de detalhes do que será apagado */}
                <div className="p-3 bg-red-50/70 rounded-xl border border-red-200 text-red-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-[11px] text-red-950">
                    <Trash2 className="w-4 h-4 text-red-600" />
                    <span>Coleções que serão totalmente esvaziadas (7 blocos):</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-red-800 space-y-0.5 pl-1">
                    <li>Bula Produtos (Cadastro Mestre 1:1)</li>
                    <li>Composição em Linhas (Ingredientes ativos e garantias)</li>
                    <li>Cadeia de Empresas (Titular, Formulador, Manipulador, Importador)</li>
                    <li>Embalagens × NCM (Capacidades, lavabilidade e TIPI)</li>
                    <li>Culturas e Carência (Intervalos de segurança e reentrada)</li>
                    <li>Alvos e Doses (Pragas, doenças e doses PC)</li>
                    <li>Aplicação e EPI (Recomendações técnicas e proteção)</li>
                  </ul>
                </div>

                {/* Caixa de garantia de preservação */}
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-[11px] text-emerald-950">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>O que permanece 100% intacto e protegido:</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-emerald-800 space-y-0.5 pl-1">
                    <li>Base Mestre de Produtos e Dicionário de Princípios Ativos</li>
                    <li>Regras Fiscais NCM × Embalagem e Parametrização Tributária</li>
                    <li>Histórico de Validações e Relatórios de Sincronização</li>
                    <li>Usuários, perfis e credenciais do sistema</li>
                  </ul>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    Digite <span className="font-mono font-bold text-red-700">LIMPAR</span> para
                    confirmar:
                  </Label>
                  <Input
                    value={confirmacaoTexto}
                    onChange={(e) => setConfirmacaoTexto(e.target.value)}
                    placeholder="Digite LIMPAR"
                    disabled={executandoLimpeza}
                    className="h-9 text-xs font-mono font-bold tracking-wider uppercase border-red-300 focus-visible:ring-red-500"
                    autoFocus
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setModalLimparOpen(false)
                setConfirmacaoTexto('')
              }}
              disabled={executandoLimpeza}
              className="text-xs h-9"
            >
              Cancelar
            </Button>
            {isAdmin && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleLimparBase}
                disabled={confirmacaoTexto.trim() !== 'LIMPAR' || executandoLimpeza}
                className="text-xs h-9 bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
              >
                {executandoLimpeza ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Apagando registros...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirmar Limpeza Total
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL DETALHE COMPLETO DA BULA */}
      {/* ------------------------------------------------------------------ */}
      {selectedBula && (
        <Dialog open={modalBulaOpen} onOpenChange={setModalBulaOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#1B5E20] flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-[#1C2B1C]">
                      {selectedBula.nome_comercial}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-[#5A6D5A]">
                      Registro MAPA: <strong>{selectedBula.registro_mapa}</strong> • Titular:{' '}
                      {selectedBula.titular_registro || 'Não informado'}
                    </DialogDescription>
                  </div>
                </div>

                <Badge className="bg-[#1B5E20] text-white text-xs px-2.5 py-1">
                  {selectedBula.classe_agronomica || 'Defensivo'}
                </Badge>
              </div>
            </DialogHeader>

            <div className="mt-4">
              <PainelBlocosAcessoriosBula bula={selectedBula} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// SUB-COMPONENTE: PAINEL DE BLOCOS ACESSÓRIOS DA BULA (LAZY LOADING)
// -----------------------------------------------------------------------------
interface PainelBlocosProps {
  bula: BulaProdutoItem
}

function PainelBlocosAcessoriosBula({ bula }: PainelBlocosProps) {
  const [activeTab, setActiveTab] = useState<string>('principal')

  // Estados dos blocos carregados sob demanda (lazy)
  const [composicao, setComposicao] = useState<BulaComposicaoItem[] | null>(null)
  const [empresas, setEmpresas] = useState<BulaEmpresaItem[] | null>(null)
  const [embalagens, setEmbalagens] = useState<BulaEmbalagemItem[] | null>(null)
  const [culturas, setCulturas] = useState<BulaCulturaItem[] | null>(null)
  const [alvos, setAlvos] = useState<BulaAlvoItem[] | null>(null)
  const [aplicacao, setAplicacao] = useState<BulaAplicacaoItem[] | null>(null)

  const [loadingBloco, setLoadingBloco] = useState<boolean>(false)

  const carregarBloco = useCallback(
    async (tab: string) => {
      if (!bula.registro_mapa) return
      setLoadingBloco(true)
      try {
        if (tab === 'composicao' && composicao === null) {
          const res = await listarBulaComposicao(bula.registro_mapa)
          setComposicao(res)
        } else if (tab === 'empresas' && empresas === null) {
          const res = await listarBulaEmpresas(bula.registro_mapa)
          setEmpresas(res)
        } else if (tab === 'embalagens' && embalagens === null) {
          const res = await listarBulaEmbalagens(bula.registro_mapa)
          setEmbalagens(res)
        } else if (tab === 'culturas' && culturas === null) {
          const res = await listarBulaCulturas(bula.registro_mapa)
          setCulturas(res)
        } else if (tab === 'alvos' && alvos === null) {
          const res = await listarBulaAlvos(bula.registro_mapa)
          setAlvos(res)
        } else if (tab === 'aplicacao' && aplicacao === null) {
          const res = await listarBulaAplicacao(bula.registro_mapa)
          setAplicacao(res)
        }
      } catch (err) {
        console.error(`Erro ao carregar bloco ${tab}:`, err)
      } finally {
        setLoadingBloco(false)
      }
    },
    [bula.registro_mapa, composicao, empresas, embalagens, culturas, alvos, aplicacao],
  )

  const handleTabChange = (val: string) => {
    setActiveTab(val)
    if (val !== 'principal') {
      carregarBloco(val)
    }
  }

  return (
    <div className="space-y-3 bg-white p-4 rounded-xl border border-[#DCE5DC] shadow-sm">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 h-auto p-1 bg-[#F5F7F1] rounded-xl gap-1">
          <TabsTrigger
            value="principal"
            className="text-xs py-1.5 rounded-lg data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white font-medium flex items-center justify-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Principal</span>
          </TabsTrigger>

          <TabsTrigger
            value="composicao"
            className="text-xs py-1.5 rounded-lg data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white font-medium flex items-center justify-center gap-1.5"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Composição</span>
          </TabsTrigger>

          <TabsTrigger
            value="empresas"
            className="text-xs py-1.5 rounded-lg data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white font-medium flex items-center justify-center gap-1.5"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Empresas</span>
          </TabsTrigger>

          <TabsTrigger
            value="embalagens"
            className="text-xs py-1.5 rounded-lg data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white font-medium flex items-center justify-center gap-1.5"
          >
            <Box className="w-3.5 h-3.5" />
            <span>Embalagens</span>
          </TabsTrigger>

          <TabsTrigger
            value="culturas"
            className="text-xs py-1.5 rounded-lg data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white font-medium flex items-center justify-center gap-1.5"
          >
            <Sprout className="w-3.5 h-3.5" />
            <span>Culturas</span>
          </TabsTrigger>

          <TabsTrigger
            value="alvos"
            className="text-xs py-1.5 rounded-lg data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white font-medium flex items-center justify-center gap-1.5"
          >
            <Target className="w-3.5 h-3.5" />
            <span>Alvos/Doses</span>
          </TabsTrigger>

          <TabsTrigger
            value="aplicacao"
            className="text-xs py-1.5 rounded-lg data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white font-medium flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Aplicação/EPI</span>
          </TabsTrigger>
        </TabsList>
        {/* ---------------------------------------------------------------- */}
        {/* ABA 1: CADASTRO PRINCIPAL 1:1 */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="principal" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
              <div className="flex items-center justify-between">
                <span className="text-[#5A6D5A] block text-[11px]">Nome Comercial</span>
                {bula.codigo && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-white border-[#DCE5DC] font-mono"
                  >
                    Cód: {bula.codigo}
                  </Badge>
                )}
              </div>
              <strong className="text-sm text-[#1C2B1C]">{bula.nome_comercial}</strong>
              <div className="mt-2 text-[11px] text-[#5A6D5A]">
                Marca padronizada:{' '}
                <span className="font-semibold text-[#1C2B1C]">
                  {bula.marca_padronizada || bula.nome_comercial}
                </span>
              </div>
            </div>

            <div className="p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
              <span className="text-[#5A6D5A] block text-[11px]">Registro MAPA</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <strong className="text-sm font-mono text-[#1B5E20]">{bula.registro_mapa}</strong>
                {bula.mapa_oficial_limpo && bula.mapa_oficial_limpo !== bula.registro_mapa && (
                  <span className="text-[10px] text-[#5A6D5A] font-mono bg-white px-1.5 py-0.5 rounded border border-[#DCE5DC]">
                    Limpo: {bula.mapa_oficial_limpo}
                  </span>
                )}
              </div>
              <div className="mt-2 text-[11px] text-[#5A6D5A]">
                Tipo:{' '}
                <span className="font-semibold text-[#1C2B1C]">
                  {bula.tipo_produto || 'Produto Formulado Comercial'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
              <span className="text-[#5A6D5A] block text-[11px]">Classificação TIPI / NCM</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <strong className="text-sm font-mono text-[#1C2B1C]">
                  {bula.ncm_oficial_exata || bula.ncm_padrao || '3808.93.24'}
                </strong>
                {bula.ncm_oficial_exata &&
                  bula.ncm_padrao &&
                  bula.ncm_oficial_exata !== bula.ncm_padrao && (
                    <span className="text-[10px] text-[#5A6D5A] font-mono bg-white px-1.5 py-0.5 rounded border border-[#DCE5DC]">
                      Padrão: {bula.ncm_padrao}
                    </span>
                  )}
              </div>
              <div className="mt-2 text-[11px] text-[#5A6D5A] flex items-center justify-between">
                <span>
                  Status:{' '}
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300 py-0"
                  >
                    {bula.status_registro || 'Ativo'}
                  </Badge>
                </span>
                {bula.nota_subpos_2 && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 ${
                      bula.nota_subpos_2 === 'SIM'
                        ? 'bg-amber-50 text-amber-900 border-amber-300 font-semibold'
                        : 'bg-white text-[#5A6D5A] border-[#DCE5DC]'
                    }`}
                  >
                    Nota Subpos 2: {bula.nota_subpos_2}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Titular do Registro</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">{bula.titular_registro || '—'}</p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Fabricante / Formulador</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">
                {bula.fabricante_formulador || '—'}
              </p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Princípio Ativo</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">{bula.principio_ativo || '—'}</p>
              {bula.pa_oficial_correto && bula.pa_oficial_correto !== bula.principio_ativo && (
                <p className="text-[10px] text-emerald-800 mt-1 bg-emerald-50/70 p-1 rounded border border-emerald-200">
                  <span className="font-semibold">PA Oficial:</span> {bula.pa_oficial_correto}
                </p>
              )}
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Classe Agronômica</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">{bula.classe_agronomica || '—'}</p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Grupo Químico</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">{bula.grupo_quimico || '—'}</p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Formulação</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">{bula.tipo_formulacao || '—'}</p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Classe Toxicológica</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">
                {bula.classificacao_toxicologica || '—'}
              </p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Classe Ambiental</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">
                {bula.classificacao_ambiental || '—'}
              </p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Macro Grupo</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">{bula.macro_grupo || '—'}</p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Sub-Grupo</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">{bula.sub_grupo || '—'}</p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Embalagem (Oficial)</span>
              <p className="font-medium text-[#1C2B1C] mt-0.5">{bula.embalagem || '—'}</p>
            </div>

            <div className="border border-[#E2EBE2] p-2.5 rounded-lg">
              <span className="text-[#5A6D5A] text-[11px] block">Link Oficial / Agrofit</span>
              {bula.url_oficial ? (
                <a
                  href={bula.url_oficial}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#1B5E20] hover:text-[#2E7D32] hover:underline mt-0.5 inline-flex items-center gap-1 max-w-full truncate"
                  title={bula.url_oficial}
                >
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">Acessar registro oficial</span>
                </a>
              ) : (
                <p className="font-medium text-[#5A6D5A] mt-0.5">—</p>
              )}
            </div>
          </div>

          {/* Regra TIPI quando preenchida */}
          {bula.regra_tipi && (
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-xs text-[#1C2B1C]">
              <strong className="text-amber-950 block mb-1">
                Regra TIPI (Tabela de Incidência do IPI / NCM Embalagem):
              </strong>
              <p className="text-amber-900 leading-relaxed font-mono text-[11px]">
                {bula.regra_tipi}
              </p>
            </div>
          )}

          {bula.modo_acao && (
            <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 text-xs text-[#1C2B1C]">
              <strong className="text-emerald-900 block mb-1">Modo de Ação Agronômico:</strong>
              <p className="text-[#3E523E] leading-relaxed">{bula.modo_acao}</p>
            </div>
          )}
        </TabsContent>
        {/* ---------------------------------------------------------------- */}
        {/* ABA 2: COMPOSIÇÃO EM LINHAS */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="composicao" className="mt-3">
          {loadingBloco && composicao === null ? (
            <LoadingBloco />
          ) : !composicao || composicao.length === 0 ? (
            <EmptyBloco
              titulo="Nenhuma composição importada para este produto"
              descricao="Use a tela Importar Planilhas para carregar a aba 'Sheet 2. Composicao_Em_Linhas'."
            />
          ) : (
            <div className="border border-[#DCE5DC] rounded-xl overflow-hidden bg-white shadow-xs">
              <ScrollableTable autoFitHeight={false} maxHeight="360px" minHeight="180px">
                <table className="w-full text-xs text-left min-w-[900px]">
                  <thead className="sticky top-0 z-20 bg-[#F5F7F1] text-[#5A6D5A] border-b border-[#DCE5DC] shadow-[0_1px_0_0_#DCE5DC]">
                    <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                      <th className="py-2.5 px-3 font-semibold w-12 whitespace-nowrap">Cód</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[180px]">Ingrediente Ativo</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[200px]">Nome Químico</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[110px] whitespace-nowrap">
                        Nº CAS
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[120px] whitespace-nowrap">
                        Concentração
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[90px] whitespace-nowrap">
                        % Peso
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[90px] whitespace-nowrap">
                        % Volume
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[140px] whitespace-nowrap">
                        Função
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F4F0] bg-white">
                    {composicao.map((item) => (
                      <tr key={item.id} className="hover:bg-[#F5F7F1]/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6D5A] whitespace-nowrap">
                          {item.codigo || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#1C2B1C] whitespace-nowrap">
                          {item.ingrediente_ativo}
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A]">{item.nome_quimico || '—'}</td>
                        <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap">
                          {item.numero_cas || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#1B5E20] whitespace-nowrap">
                          {item.concentracao
                            ? `${item.concentracao} ${item.unidade_medida || ''}`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-[#1C2B1C] whitespace-nowrap">
                          {item.percentual_peso ? `${item.percentual_peso}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-[#1C2B1C] whitespace-nowrap">
                          {item.percentual_volume ? `${item.percentual_volume}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {item.funcao_ingrediente || 'Ingrediente Ativo'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          )}
        </TabsContent>
        {/* ---------------------------------------------------------------- */}
        {/* ABA 3: CADEIA DE EMPRESAS EM LINHAS */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="empresas" className="mt-3">
          {loadingBloco && empresas === null ? (
            <LoadingBloco />
          ) : !empresas || empresas.length === 0 ? (
            <EmptyBloco
              titulo="Nenhuma empresa vinculada para este produto"
              descricao="Use a tela Importar Planilhas para carregar a aba 'Sheet 3. Cadeia_Empresas_Linhas'."
            />
          ) : (
            <div className="border border-[#DCE5DC] rounded-xl overflow-hidden bg-white shadow-xs">
              <ScrollableTable autoFitHeight={false} maxHeight="360px" minHeight="180px">
                <table className="w-full text-xs text-left min-w-[1000px]">
                  <thead className="sticky top-0 z-20 bg-[#F5F7F1] text-[#5A6D5A] border-b border-[#DCE5DC] shadow-[0_1px_0_0_#DCE5DC]">
                    <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                      <th className="py-2.5 px-3 font-semibold w-12 whitespace-nowrap">Cód</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[130px] whitespace-nowrap">
                        Papel / Relação
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[220px]">Razão Social</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[130px] whitespace-nowrap">
                        CNPJ
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[130px] whitespace-nowrap">
                        Inscrição Estadual
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[180px]">Bairro / CEP</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[150px] whitespace-nowrap">
                        Município / UF
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[100px] whitespace-nowrap">
                        País
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F4F0] bg-white">
                    {empresas.map((item) => (
                      <tr key={item.id} className="hover:bg-[#F5F7F1]/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6D5A] whitespace-nowrap">
                          {item.codigo || '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]"
                          >
                            {item.tipo_relacao || 'Formulador'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#1C2B1C]">
                          {item.razao_social}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                          {item.cnpj || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6D5A] whitespace-nowrap">
                          {item.inscricao_estadual || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A]">
                          {[item.bairro, item.cep ? `CEP: ${item.cep}` : null]
                            .filter(Boolean)
                            .join(' • ') || '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {[item.municipio, item.uf].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A] whitespace-nowrap">
                          {item.pais || 'Brasil'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          )}
        </TabsContent>
        {/* ---------------------------------------------------------------- */}
        {/* ABA 4: EMBALAGENS × NCM EM LINHAS */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="embalagens" className="mt-3">
          {loadingBloco && embalagens === null ? (
            <LoadingBloco />
          ) : !embalagens || embalagens.length === 0 ? (
            <EmptyBloco
              titulo="Nenhuma embalagem importada para este produto"
              descricao="Use a tela Importar Planilhas para carregar a aba 'Sheet 4. Embalagens_NCM_Linhas'."
            />
          ) : (
            <div className="border border-[#DCE5DC] rounded-xl overflow-hidden bg-white shadow-xs">
              <ScrollableTable autoFitHeight={false} maxHeight="360px" minHeight="180px">
                <table className="w-full text-xs text-left min-w-[1050px]">
                  <thead className="sticky top-0 z-20 bg-[#F5F7F1] text-[#5A6D5A] border-b border-[#DCE5DC] shadow-[0_1px_0_0_#DCE5DC]">
                    <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                      <th className="py-2.5 px-3 font-semibold w-12 whitespace-nowrap">Cód</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[150px] whitespace-nowrap">
                        Tipo Embalagem
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[220px]">
                        Descrição Detalhada
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[120px] whitespace-nowrap">
                        Material
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[120px] whitespace-nowrap">
                        Capacidade
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[100px] whitespace-nowrap">
                        NCM
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[120px] whitespace-nowrap">
                        Faixa NCM
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[160px] whitespace-nowrap">
                        Destinação Final
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F4F0] bg-white">
                    {embalagens.map((item) => (
                      <tr key={item.id} className="hover:bg-[#F5F7F1]/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6D5A] whitespace-nowrap">
                          {item.codigo || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#1C2B1C] whitespace-nowrap">
                          {item.tipo_embalagem}
                        </td>
                        <td
                          className="py-2.5 px-3 text-[#5A6D5A] max-w-[240px] truncate"
                          title={item.descricao_embalagem || ''}
                        >
                          {item.descricao_embalagem || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A] whitespace-nowrap">
                          {item.material || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#1B5E20] whitespace-nowrap">
                          {item.capacidade
                            ? `${item.capacidade} ${item.unidade_medida || ''}`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap">
                          {item.ncm || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#1C2B1C] whitespace-nowrap">
                          {item.ncm_faixa || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A] whitespace-nowrap">
                          {item.destinacao_final || 'Logística Reversa / InpEV'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          )}
        </TabsContent>
        {/* ---------------------------------------------------------------- */}
        {/* ABA 5: CULTURAS E CARÊNCIA EM LINHAS */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="culturas" className="mt-3">
          {loadingBloco && culturas === null ? (
            <LoadingBloco />
          ) : !culturas || culturas.length === 0 ? (
            <EmptyBloco
              titulo="Nenhuma cultura/carência importada para este produto"
              descricao="Use a tela Importar Planilhas para carregar a aba 'Sheet 5. Culturas_Carencia_Linhas'."
            />
          ) : (
            <div className="border border-[#DCE5DC] rounded-xl overflow-hidden bg-white shadow-xs">
              <ScrollableTable autoFitHeight={false} maxHeight="360px" minHeight="180px">
                <table className="w-full text-xs text-left min-w-[1050px]">
                  <thead className="sticky top-0 z-20 bg-[#F5F7F1] text-[#5A6D5A] border-b border-[#DCE5DC] shadow-[0_1px_0_0_#DCE5DC]">
                    <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                      <th className="py-2.5 px-3 font-semibold w-12 whitespace-nowrap">Cód</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[180px]">
                        Cultura Autorizada
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[130px] whitespace-nowrap">
                        Tipo de Cultura
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[150px] whitespace-nowrap">
                        Carência (Segurança)
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[140px] whitespace-nowrap">
                        Época da Carência
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[140px] whitespace-nowrap">
                        Intervalo Reentrada
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[140px] whitespace-nowrap">
                        Modalidade de Emprego
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[100px] whitespace-nowrap">
                        LMR
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F4F0] bg-white">
                    {culturas.map((item) => (
                      <tr key={item.id} className="hover:bg-[#F5F7F1]/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6D5A] whitespace-nowrap">
                          {item.codigo || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#1C2B1C] flex items-center gap-1.5 whitespace-nowrap">
                          <Sprout className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <span>{item.cultura}</span>
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A] whitespace-nowrap">
                          {item.tipo_cultura || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#1B5E20] whitespace-nowrap">
                          {item.intervalo_seguranca_dias
                            ? `${item.intervalo_seguranca_dias} dias`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A] whitespace-nowrap">
                          {item.epoca_carencia || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A] whitespace-nowrap">
                          {item.intervalo_reentrada_horas
                            ? `${item.intervalo_reentrada_horas} horas`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {item.modalidade_emprego || 'Foliar'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                          {item.limite_maximo_residuos_lmr || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          )}
        </TabsContent>
        {/* ---------------------------------------------------------------- */}
        {/* ABA 6: ALVOS E DOSES EM LINHAS */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="alvos" className="mt-3">
          {loadingBloco && alvos === null ? (
            <LoadingBloco />
          ) : !alvos || alvos.length === 0 ? (
            <EmptyBloco
              titulo="Nenhum alvo/dose importado para este produto"
              descricao="Use a tela Importar Planilhas para carregar a aba 'Sheet 6. Alvos_e_Doses_Linhas'."
            />
          ) : (
            <div className="border border-[#DCE5DC] rounded-xl overflow-hidden bg-white shadow-xs">
              <ScrollableTable autoFitHeight={false} maxHeight="360px" minHeight="180px">
                <table className="w-full text-xs text-left min-w-[1100px]">
                  <thead className="sticky top-0 z-20 bg-[#F5F7F1] text-[#5A6D5A] border-b border-[#DCE5DC] shadow-[0_1px_0_0_#DCE5DC]">
                    <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                      <th className="py-2.5 px-3 font-semibold w-12 whitespace-nowrap">Cód</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[140px] whitespace-nowrap">
                        Cultura
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[220px]">
                        Alvo Biológico (Praga/Doença)
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[130px] whitespace-nowrap">
                        Tipo do Alvo
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[150px] whitespace-nowrap">
                        Dose Recomendada
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[130px] whitespace-nowrap">
                        Volume Calda
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[120px] text-center whitespace-nowrap">
                        Intervalo (Dias)
                      </th>
                      <th className="py-2.5 px-3 font-semibold min-w-[110px] text-center whitespace-nowrap">
                        Máx Aplicações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F4F0] bg-white">
                    {alvos.map((item) => (
                      <tr key={item.id} className="hover:bg-[#F5F7F1]/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6D5A] whitespace-nowrap">
                          {item.codigo || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[#1C2B1C] whitespace-nowrap">
                          {item.cultura || 'Todas'}
                        </td>
                        <td className="py-2.5 px-3">
                          <strong className="text-[#1C2B1C] block">{item.alvo_biologico}</strong>
                          {item.nome_cientifico && (
                            <span className="text-[10px] text-[#5A6D5A] italic block">
                              {item.nome_cientifico}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A] whitespace-nowrap">
                          {item.tipo_alvo || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#1B5E20] whitespace-nowrap">
                          {[item.dose_minima, item.dose_maxima].filter(Boolean).join(' a ')}{' '}
                          {item.unidade_dose || ''}
                        </td>
                        <td className="py-2.5 px-3 text-[#5A6D5A] whitespace-nowrap">
                          {item.volume_calda || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-[11px] whitespace-nowrap">
                          {item.intervalo_aplicacao_dias
                            ? `${item.intervalo_aplicacao_dias} d`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {item.numero_maximo_aplicacoes || '1'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          )}
        </TabsContent>
        {/* ---------------------------------------------------------------- */}
        {/* ABA 7: APLICAÇÃO E EPI EM LINHAS */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="aplicacao" className="mt-3">
          {loadingBloco && aplicacao === null ? (
            <LoadingBloco />
          ) : !aplicacao || aplicacao.length === 0 ? (
            <EmptyBloco
              titulo="Nenhuma instrução de aplicação/EPI importada"
              descricao="Use a tela Importar Planilhas para carregar a aba 'Sheet 7. Aplicacao_e_EPI_Linhas'."
            />
          ) : (
            <div className="space-y-3">
              {aplicacao.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC] space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {item.codigo && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-white border-[#DCE5DC] font-mono"
                        >
                          Cód: {item.codigo}
                        </Badge>
                      )}
                      <span className="font-bold text-xs text-[#1C2B1C]">
                        Modo de Aplicação: {item.tipo_aplicacao || 'Terrestre / Pulverização'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.volume_calda_aplicacao && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-white border-emerald-300 text-emerald-900 font-medium"
                        >
                          Volume Calda: {item.volume_calda_aplicacao}
                        </Badge>
                      )}
                      {item.classe_toxicologica_aplicacao && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-white border-amber-300 text-amber-900 font-medium"
                        >
                          Toxicológica: {item.classe_toxicologica_aplicacao}
                        </Badge>
                      )}
                      {item.equipamento_recomendado && (
                        <Badge variant="outline" className="text-[10px] bg-white border-[#DCE5DC]">
                          Equipamento: {item.equipamento_recomendado}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {item.condicoes_meteorologicas && (
                    <div className="text-xs">
                      <span className="text-[#5A6D5A] font-semibold">
                        Condições Meteorológicas:{' '}
                      </span>
                      <span className="text-[#1C2B1C]">{item.condicoes_meteorologicas}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
                    <div className="bg-white p-2.5 rounded-lg border border-[#E2EBE2]">
                      <span className="font-semibold text-emerald-800 block mb-0.5">
                        EPI — Preparo da Calda:
                      </span>
                      <p className="text-[#3E523E]">
                        {item.epi_preparo_calda || 'Luvas, máscara, viseira e avental.'}
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-[#E2EBE2]">
                      <span className="font-semibold text-emerald-800 block mb-0.5">
                        EPI — Aplicação:
                      </span>
                      <p className="text-[#3E523E]">
                        {item.epi_aplicacao || 'Macacão hidro-repelente, botas e respirador.'}
                      </p>
                    </div>
                  </div>

                  {item.orientacoes_gerais && (
                    <div className="p-2.5 bg-white rounded-lg border border-[#E2EBE2] text-xs text-[#1C2B1C]">
                      <strong className="text-emerald-900 block mb-0.5">
                        Orientações Gerais de Aplicação:
                      </strong>
                      <p className="text-[#3E523E] leading-relaxed whitespace-pre-line">
                        {item.orientacoes_gerais}
                      </p>
                    </div>
                  )}

                  {item.medidas_primeiros_socorros && (
                    <div className="text-[11px] text-[#5A6D5A] pt-1">
                      <strong>Primeiros Socorros: </strong>
                      {item.medidas_primeiros_socorros}
                    </div>
                  )}

                  {item.descarte_embalagens && (
                    <div className="text-[11px] text-[#5A6D5A] pt-0.5">
                      <strong>Descarte de Embalagens: </strong>
                      {item.descarte_embalagens}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>{' '}
      </Tabs>
    </div>
  )
}

function LoadingBloco() {
  return (
    <div className="py-8 flex flex-col items-center justify-center gap-2 text-[#5A6D5A] text-xs">
      <Loader2 className="w-5 h-5 animate-spin text-[#1B5E20]" />
      <span>Carregando informações deste bloco...</span>
    </div>
  )
}

function EmptyBloco({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="py-8 px-4 text-center border-2 border-dashed border-[#DCE5DC] rounded-xl bg-[#F5F7F1]/40 flex flex-col items-center justify-center gap-1.5">
      <Info className="w-6 h-6 text-[#F57F17]" />
      <p className="font-bold text-xs text-[#1C2B1C]">{titulo}</p>
      <p className="text-[11px] text-[#5A6D5A] max-w-md">{descricao}</p>
      <Link to="/importar">
        <Button variant="outline" size="sm" className="mt-2 text-xs h-7 border-[#DCE5DC]">
          <UploadCloud className="w-3.5 h-3.5 mr-1 text-[#1B5E20]" />
          Importar Planilhas
        </Button>
      </Link>
    </div>
  )
}
