import React, { useEffect, useState, useTransition, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Database,
  Search,
  Download,
  Trash2,
  Edit2,
  Loader2,
  CheckCircle2,
  Clock,
  Copy,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Layers,
  Scale,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import {
  listarBaseMestre,
  atualizarProdutoBaseMestre,
  excluirProdutoBaseMestre,
  obterRelatorioDuplicidades,
} from '@/services/agroService'
import { ModalLimparBase } from '@/components/ModalLimparBase'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/contexts/AuthContext'
import {
  executarMotorCanonicoFrontend,
  formatarNcmMascara,
  sanitizarRegistroMapa,
} from '@/lib/motorCanonico'
import type {
  BaseMestreProduto,
  GrupoDuplicidade,
  RelatorioDuplicidades,
  TipoProdutoCanonico,
  UnidadeFisicaCanonica,
} from '@/types/agro'

export function BaseMestre() {
  const { isAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''

  const [produtos, setProdutos] = useState<BaseMestreProduto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialQuery)
  const [macroGrupoFilter, setMacroGrupoFilter] = useState<string>('todos')
  const [tipoProdutoFilter, setTipoProdutoFilter] = useState<string>('todos')
  const [nota2Filter, setNota2Filter] = useState<string>('todos')
  const [statusPisFilter, setStatusPisFilter] = useState<string>('todos')
  const [paIdFilter, setPaIdFilter] = useState<string>('')
  const [, startTransition] = useTransition()

  // Seleção múltipla para exportação / exclusão em lote
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Linhas expandidas para detalhamento dos 28 campos
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({})

  // Modal de edição / visualização completa dos 28 campos
  const [editingItem, setEditingItem] = useState<BaseMestreProduto | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  // Rolagem Infinita & Totais
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageRef = useRef(1)
  const hasMoreRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const loadingInitialRef = useRef(false)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Modal Limpeza Total da Base
  const [modalLimparOpen, setModalLimparOpen] = useState(false)

  // Painel de Duplicidades
  const [duplicidadesOpen, setDuplicidadesOpen] = useState(false)
  const [loadingDuplicidades, setLoadingDuplicidades] = useState(false)
  const [relatorioDuplicidades, setRelatorioDuplicidades] = useState<RelatorioDuplicidades | null>(
    null,
  )
  const [filtroCriterio, setFiltroCriterio] = useState<string>('todos')
  const [resolvendoId, setResolvendoId] = useState<string | null>(null)

  const toggleRowExpanded = (id: string) => {
    setExpandedRowIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Capturar filtro de principio_ativo_id via URL query string (?paId=... ou ?principio_ativo_id=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlPaId = params.get('paId') || params.get('principio_ativo_id')
    if (urlPaId) {
      setPaIdFilter(urlPaId)
    }
  }, [])

  const buildFilterString = useCallback(() => {
    const filters: string[] = []
    if (paIdFilter) {
      filters.push(`principio_ativo_id = '${paIdFilter.replace(/'/g, "\\'")}'`)
    }
    if (search.trim()) {
      const clean = search.trim().replace(/'/g, "\\'")
      filters.push(
        `(nome_completo ~ '${clean}' || marca_padronizada ~ '${clean}' || registro_mapa ~ '${clean}' || ncm_padrao ~ '${clean}' || titular_fabricante ~ '${clean}' || principio_ativo ~ '${clean}')`,
      )
    }
    if (macroGrupoFilter !== 'todos') {
      filters.push(`macro_grupo = '${macroGrupoFilter.replace(/'/g, "\\'")}'`)
    }
    if (tipoProdutoFilter !== 'todos') {
      filters.push(`tipo_produto = '${tipoProdutoFilter.replace(/'/g, "\\'")}'`)
    }
    if (nota2Filter !== 'todos') {
      filters.push(`nota_subpos_2 = '${nota2Filter}'`)
    }
    if (statusPisFilter !== 'todos') {
      if (statusPisFilter === 'beneficiado') {
        filters.push(`status_pis_cofins ~ 'Beneficiado'`)
      } else if (statusPisFilter === 'condicional') {
        filters.push(`status_pis_cofins ~ 'Condicional'`)
      } else if (statusPisFilter === 'tributado') {
        filters.push(`status_pis_cofins ~ 'Tributado'`)
      }
    }
    return filters.join(' && ')
  }, [paIdFilter, search, macroGrupoFilter, tipoProdutoFilter, nota2Filter, statusPisFilter])

  // Carrega o primeiro lote (reset da lista ao mudar filtros ou busca)
  const carregarProdutos = useCallback(async () => {
    loadingInitialRef.current = true
    setLoading(true)
    pageRef.current = 1
    try {
      const filterStr = buildFilterString()
      const res = await listarBaseMestre({
        page: 1,
        perPage: 100,
        filter: filterStr || undefined,
        sort: 'marca_padronizada',
      })
      setProdutos(res.items)
      setTotalCount(res.totalItems)
      const more = (res.totalPages || 1) > 1
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error('Erro ao carregar lote inicial da Base Mestre:', err)
    } finally {
      loadingInitialRef.current = false
      setLoading(false)
    }
  }, [buildFilterString])

  // Carrega o próximo lote (rolagem infinita)
  const carregarMaisProdutos = useCallback(async () => {
    if (loadingMoreRef.current || loadingInitialRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const nextPage = pageRef.current + 1
    try {
      const filterStr = buildFilterString()
      const res = await listarBaseMestre({
        page: nextPage,
        perPage: 100,
        filter: filterStr || undefined,
        sort: 'marca_padronizada',
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
      console.error('Erro ao carregar mais produtos na rolagem infinita:', err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [buildFilterString])

  const carregarDuplicidades = async () => {
    setLoadingDuplicidades(true)
    try {
      const res = await obterRelatorioDuplicidades()
      setRelatorioDuplicidades(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao buscar duplicidades.'
      toast({ variant: 'destructive', title: 'Erro de Análise', description: msg })
    } finally {
      setLoadingDuplicidades(false)
    }
  }

  const handleToggleDuplicidades = () => {
    const nextState = !duplicidadesOpen
    setDuplicidadesOpen(nextState)
    if (nextState && !relatorioDuplicidades) {
      carregarDuplicidades()
    }
  }

  const handleManterUmExcluirOutros = async (grupo: GrupoDuplicidade, mantidoId: string) => {
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas administradores podem realizar esta ação.',
      })
      return
    }

    const mantido = grupo.registros.find((r) => r.id === mantidoId)
    const outros = grupo.registros.filter((r) => r.id !== mantidoId)

    if (
      !confirm(
        `Confirma MANTER o produto "${mantido?.marca_padronizada || mantido?.nome_completo || mantidoId}" e EXCLUIR os outros ${
          outros.length
        } registros duplicados deste grupo?`,
      )
    ) {
      return
    }

    setResolvendoId(grupo.id)
    try {
      for (const o of outros) {
        await excluirProdutoBaseMestre(o.id)
      }
      toast({
        title: 'Duplicidade Resolvida',
        description: `${outros.length} registros duplicados foram excluídos com sucesso.`,
      })
      await carregarDuplicidades()
      await carregarProdutos()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao resolver duplicidade.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setResolvendoId(null)
    }
  }

  const handleExportarDuplicidadesCSV = () => {
    if (!relatorioDuplicidades || relatorioDuplicidades.grupos.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhuma duplicidade para exportar.' })
      return
    }

    const headers = [
      'Grupo_ID',
      'Criterio_Duplicidade',
      'Chave_Grupo',
      'ID_Produto',
      'Marca_Padronizada',
      'Nome_Completo',
      'NCM_Padrao',
      'Registro_MAPA',
      'Principio_Ativo',
      'Titular_Fabricante',
    ]

    const rows: string[] = []
    relatorioDuplicidades.grupos.forEach((g) => {
      g.registros.forEach((r) => {
        rows.push(
          [
            `"${g.id}"`,
            `"${g.criterio}"`,
            `"${g.chave.replace(/"/g, '""')}"`,
            `"${r.id}"`,
            `"${(r.marca_padronizada || r.nome_produto || '').replace(/"/g, '""')}"`,
            `"${(r.nome_completo || r.nome_produto || '').replace(/"/g, '""')}"`,
            `"${r.ncm_padrao || r.ncm || ''}"`,
            `"${r.registro_mapa || ''}"`,
            `"${(r.principio_ativo || '').replace(/"/g, '""')}"`,
            `"${(r.titular_fabricante || r.fabricante || '').replace(/"/g, '""')}"`,
          ].join(';'),
        )
      })
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `relatorio_duplicidades_base_mestre_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    carregarProdutos()
  }, [carregarProdutos])

  useRealtime('base_mestre', () => carregarProdutos())

  // Sentinel com IntersectionObserver para detectar proximidade do fim
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

  // Seleção sobre todos os registros exibidos/carregados até o momento
  const loadedProductIds = produtos.map((p) => p.id)
  const isAllLoadedSelected =
    loadedProductIds.length > 0 && loadedProductIds.every((id) => selectedIds.includes(id))
  const isSomeLoadedSelected =
    loadedProductIds.some((id) => selectedIds.includes(id)) && !isAllLoadedSelected

  const handleSelectAllLoaded = (checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        loadedProductIds.forEach((id) => next.add(id))
        return Array.from(next)
      })
    } else {
      setSelectedIds((prev) => prev.filter((id) => !loadedProductIds.includes(id)))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const handleClearSelection = () => {
    setSelectedIds([])
  }

  const handleBulkDelete = async () => {
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas administradores podem realizar esta ação.',
      })
      return
    }

    if (selectedIds.length === 0) return
    if (!confirm(`Deseja excluir permanentemente os ${selectedIds.length} produtos selecionados?`))
      return

    try {
      for (const id of selectedIds) {
        await excluirProdutoBaseMestre(id)
      }
      toast({
        title: 'Exclusão Concluída',
        description: `${selectedIds.length} produtos foram removidos da Base Mestre.`,
      })
      setSelectedIds([])
      carregarProdutos()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir produtos.'
      toast({ variant: 'destructive', title: 'Falha na Exclusão', description: msg })
    }
  }

  // Exportar TODOS os 28 campos canônicos em CSV
  const handleExportCSV = () => {
    const listToExport =
      selectedIds.length > 0 ? produtos.filter((p) => selectedIds.includes(p.id)) : produtos

    if (listToExport.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum produto para exportar.' })
      return
    }

    const headers = [
      'id',
      'nome_completo',
      'marca_padronizada',
      'tipo_produto',
      'embalagem',
      'unidade',
      'principio_ativo',
      'macro_grupo',
      'sub_grupo',
      'nota_subpos_2',
      'ncm_padrao',
      'ncm_faixa1_ate_300g',
      'ncm_faixa2_300g_a_7_5kg',
      'ncm_faixa3_7_5kg_a_10kg',
      'ncm_faixa4_acima_10kg',
      'regra_tipi',
      'registro_mapa',
      'sistema_norma_mapa',
      'titular_fabricante',
      'origem_base',
      'status_pis_cofins',
      'aliquota_ate_mar2026',
      'aliquota_pos_abr2026_real',
      'aliquota_pos_abr2026_presumido',
      'cst_saida',
      'cst_entrada',
      'ibs_cbs_2027',
      'url_oficial',
    ]

    const rows = listToExport.map((p) => {
      return [
        `"${p.id}"`,
        `"${(p.nome_completo || p.nome_produto || '').replace(/"/g, '""')}"`,
        `"${(p.marca_padronizada || p.nome_produto || '').replace(/"/g, '""')}"`,
        `"${(p.tipo_produto || 'Produto Formulado Comercial').replace(/"/g, '""')}"`,
        `"${(p.embalagem || '').replace(/"/g, '""')}"`,
        `"${p.unidade || 'L'}"`,
        `"${(p.principio_ativo || '').replace(/"/g, '""')}"`,
        `"${(p.macro_grupo || 'Defensivos').replace(/"/g, '""')}"`,
        `"${(p.sub_grupo || '').replace(/"/g, '""')}"`,
        `"${p.nota_subpos_2 || 'NÃO'}"`,
        `"${formatarNcmMascara(p.ncm_padrao || p.ncm)}"`,
        `"${formatarNcmMascara(p.ncm_faixa1_ate_300g || p.ncm_padrao || p.ncm)}"`,
        `"${formatarNcmMascara(p.ncm_faixa2_300g_a_7_5kg || p.ncm_padrao || p.ncm)}"`,
        `"${formatarNcmMascara(p.ncm_faixa3_7_5kg_a_10kg || p.ncm_padrao || p.ncm)}"`,
        `"${formatarNcmMascara(p.ncm_faixa4_acima_10kg || p.ncm_padrao || p.ncm)}"`,
        `"${(p.regra_tipi || '').replace(/"/g, '""')}"`,
        `"${sanitizarRegistroMapa(p.registro_mapa)}"`,
        `"${(p.sistema_norma_mapa || '').replace(/"/g, '""')}"`,
        `"${(p.titular_fabricante || p.fabricante || '').replace(/"/g, '""')}"`,
        `"${(p.origem_base || '').replace(/"/g, '""')}"`,
        `"${(p.status_pis_cofins || '').replace(/"/g, '""')}"`,
        `"${(p.aliquota_ate_mar2026 || '').replace(/"/g, '""')}"`,
        `"${(p.aliquota_pos_abr2026_real || '').replace(/"/g, '""')}"`,
        `"${(p.aliquota_pos_abr2026_presumido || '').replace(/"/g, '""')}"`,
        `"${(p.cst_saida || 'CST 06').replace(/"/g, '""')}"`,
        `"${(p.cst_entrada || 'CST 73').replace(/"/g, '""')}"`,
        `"${(p.ibs_cbs_2027 || '').replace(/"/g, '""')}"`,
        `"${(p.url_oficial || '').replace(/"/g, '""')}"`,
      ].join(';')
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `base_mestre_28_campos_canonica_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Download Concluído',
      description: 'O CSV com os 28 campos canônicos oficiais foi gerado com sucesso.',
    })
  }

  // Abrir Modal de Edição
  const handleOpenEdit = (p: BaseMestreProduto) => {
    setEditingItem({ ...p })
    setIsEditModalOpen(true)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas administradores podem realizar esta ação.',
      })
      return
    }
    if (!editingItem) return
    setSavingEdit(true)
    try {
      // Re-executa motor canônico se necessário para manter integridade dos 28 campos
      const reprocessado = executarMotorCanonicoFrontend({
        nome_completo: editingItem.nome_completo || editingItem.nome_produto,
        marca_padronizada: editingItem.marca_padronizada,
        tipo_produto: editingItem.tipo_produto,
        embalagem: editingItem.embalagem,
        unidade: editingItem.unidade,
        principio_ativo: editingItem.principio_ativo,
        macro_grupo: editingItem.macro_grupo,
        sub_grupo: editingItem.sub_grupo,
        registro_mapa: editingItem.registro_mapa,
        titular_fabricante: editingItem.titular_fabricante || editingItem.fabricante,
        ncm_padrao: editingItem.ncm_padrao || editingItem.ncm,
        origem_base: editingItem.origem_base,
        url_oficial: editingItem.url_oficial,
      })

      await atualizarProdutoBaseMestre(editingItem.id, {
        ...editingItem,
        ...reprocessado,
      })
      toast({ title: 'Produto Atualizado', description: 'Alterações gravadas no padrão canônico.' })
      setIsEditModalOpen(false)
      carregarProdutos()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar produto.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col space-y-4 min-h-0 animate-in fade-in-up duration-300">
      {paIdFilter && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Filtrando por Princípio Ativo ID:</span>
            <code className="bg-white px-2 py-0.5 rounded border border-emerald-300 font-mono text-[11px]">
              {paIdFilter}
            </code>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-emerald-300 hover:bg-emerald-100"
            onClick={() => {
              setPaIdFilter('')
              window.history.replaceState({}, '', '/base-mestre')
            }}
          >
            Limpar Filtro de Princípio Ativo
          </Button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <Database className="w-6 h-6 text-[#1B5E20]" />
            <span>Base Mestre Canônica de Produtos (28 Campos)</span>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Base consolidada oficial de insumos agropecuários homologada no Contrato Canônico v2.4.0
            ({totalCount} produtos cadastrados).
          </p>
        </div>

        {/* Ações do Topo */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={duplicidadesOpen ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleDuplicidades}
            className={`text-xs h-9 font-semibold ${
              duplicidadesOpen
                ? 'bg-[#F57F17] hover:bg-[#F9A825] text-white border-0'
                : 'border-amber-300 bg-amber-50/70 text-amber-900 hover:bg-amber-100'
            }`}
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            <span>Verificar Duplicidade</span>
            {relatorioDuplicidades && (
              <Badge className="ml-1.5 bg-amber-600 text-white text-[10px] py-0 px-1.5">
                {relatorioDuplicidades.total_grupos}
              </Badge>
            )}
            {duplicidadesOpen ? (
              <ChevronUp className="w-3.5 h-3.5 ml-1" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            )}
          </Button>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-950 px-2.5 py-1 rounded-lg text-xs font-medium">
              <span>
                <strong className="font-bold text-[#1B5E20]">{selectedIds.length}</strong> de{' '}
                {produtos.length}{' '}
                {selectedIds.length === 1 ? 'exibido selecionado' : 'exibidos selecionados'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                className="h-6 px-1.5 text-[11px] text-[#5A6D5A] hover:text-red-700 hover:bg-white"
                title="Desmarcar todos"
              >
                Limpar seleção
              </Button>
            </div>
          )}

          {selectedIds.length > 0 && isAdmin && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              className="text-xs h-9"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Excluir ({selectedIds.length})
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs h-9 border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-[#1B5E20]" />
            {selectedIds.length > 0
              ? `Exportar 28 Campos (${selectedIds.length})`
              : 'Exportar CSV (28 Campos)'}
          </Button>

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalLimparOpen(true)}
              className="text-xs h-9 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              title="Apaga permanentemente todos os registros da Base Mestre para recomeçar do zero"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5 text-red-600" />
              Limpar Base
            </Button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* PAINEL DE AUDITORIA DE DUPLICIDADES (EXPANSÍVEL) */}
      {/* ------------------------------------------------------------------ */}
      {duplicidadesOpen && (
        <Card className="rounded-2xl border-amber-300 bg-amber-50/20 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-amber-200/70 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center">
                <Copy className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#1C2B1C] flex items-center gap-2">
                  <span>Diagnóstico de Produtos em Duplicidade</span>
                  {relatorioDuplicidades && (
                    <Badge className="bg-amber-600 text-white text-[10px]">
                      {relatorioDuplicidades.total_grupos} grupos •{' '}
                      {relatorioDuplicidades.total_produtos_duplicados} itens envolvidos
                    </Badge>
                  )}
                </h3>
                <p className="text-xs text-[#5A6D5A]">
                  Análise multicritério da Trava 4: (a) NCM + Princípio Ativo; (b) Registro MAPA
                  idêntico; (c) Marca Comercial / Nome + NCM.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={carregarDuplicidades}
                disabled={loadingDuplicidades}
                className="text-xs h-8 bg-white border-[#DCE5DC] text-[#1C2B1C] hover:bg-amber-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 mr-1.5 text-amber-700 ${
                    loadingDuplicidades ? 'animate-spin' : ''
                  }`}
                />
                Atualizar Análise
              </Button>
              {relatorioDuplicidades && relatorioDuplicidades.grupos.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportarDuplicidadesCSV}
                  className="text-xs h-8 bg-white border-[#DCE5DC] text-[#1C2B1C] hover:bg-amber-50"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
                  Exportar CSV
                </Button>
              )}
            </div>
          </div>

          {/* Filtros por Critério */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="font-semibold text-[#1C2B1C] text-[11px]">Filtrar critério:</span>
            <Button
              size="sm"
              variant={filtroCriterio === 'todos' ? 'default' : 'outline'}
              onClick={() => setFiltroCriterio('todos')}
              className={`h-7 text-xs rounded-lg ${
                filtroCriterio === 'todos'
                  ? 'bg-amber-700 text-white'
                  : 'bg-white border-[#DCE5DC] text-[#1C2B1C]'
              }`}
            >
              Todos os Critérios
            </Button>
            <Button
              size="sm"
              variant={filtroCriterio === 'nome_ncm' ? 'default' : 'outline'}
              onClick={() => setFiltroCriterio('nome_ncm')}
              className={`h-7 text-xs rounded-lg ${
                filtroCriterio === 'nome_ncm'
                  ? 'bg-amber-700 text-white'
                  : 'bg-white border-[#DCE5DC] text-[#1C2B1C]'
              }`}
            >
              Marca + NCM
            </Button>
            <Button
              size="sm"
              variant={filtroCriterio === 'registro_mapa' ? 'default' : 'outline'}
              onClick={() => setFiltroCriterio('registro_mapa')}
              className={`h-7 text-xs rounded-lg ${
                filtroCriterio === 'registro_mapa'
                  ? 'bg-amber-700 text-white'
                  : 'bg-white border-[#DCE5DC] text-[#1C2B1C]'
              }`}
            >
              Registro MAPA
            </Button>
            <Button
              size="sm"
              variant={filtroCriterio === 'ncm_pa' ? 'default' : 'outline'}
              onClick={() => setFiltroCriterio('ncm_pa')}
              className={`h-7 text-xs rounded-lg ${
                filtroCriterio === 'ncm_pa'
                  ? 'bg-amber-700 text-white'
                  : 'bg-white border-[#DCE5DC] text-[#1C2B1C]'
              }`}
            >
              NCM + Princípio Ativo
            </Button>
          </div>

          {/* Conteúdo do Relatório */}
          {loadingDuplicidades ? (
            <div className="p-8 text-center text-xs text-[#5A6D5A]">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-700 mb-2" />
              Executando cruzamento multicritério de duplicidades no servidor...
            </div>
          ) : !relatorioDuplicidades || relatorioDuplicidades.grupos.length === 0 ? (
            <div className="p-6 text-center text-xs text-emerald-800 bg-emerald-50 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
              <p className="font-bold text-sm text-emerald-900">
                Nenhuma duplicidade encontrada na Base Mestre!
              </p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Todos os produtos estão com identificadores, registros MAPA e combinações NCM +
                Marca Padronizada únicos.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {relatorioDuplicidades.grupos
                .filter((g) => filtroCriterio === 'todos' || g.criterio_tipo === filtroCriterio)
                .map((grupo) => {
                  const isResolving = resolvendoId === grupo.id
                  return (
                    <div
                      key={grupo.id}
                      className="p-4 rounded-xl bg-white border border-amber-200 shadow-sm space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                          <div>
                            <span className="font-bold text-xs text-[#1C2B1C]">{grupo.chave}</span>
                            <span className="text-[11px] text-[#5A6D5A] ml-2">
                              Critério: <strong>{grupo.criterio}</strong> ({grupo.total_ocorrencias}{' '}
                              ocorrências)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {grupo.registros.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-[#F5F7F1]/80 hover:bg-[#F5F7F1] text-xs transition-colors"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1">
                              <div>
                                <span className="block font-bold text-[#1C2B1C]">
                                  {item.marca_padronizada ||
                                    item.nome_completo ||
                                    item.nome_produto}
                                </span>
                                <span className="text-[10px] font-mono text-[#1B5E20]">
                                  NCM: {formatarNcmMascara(item.ncm_padrao || item.ncm)}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[11px] text-[#1C2B1C]">
                                  P.A.: {item.principio_ativo || '—'}
                                </span>
                                <span className="text-[10px] text-[#5A6D5A]">
                                  Emb: {item.embalagem || '—'} ({item.unidade || 'L'})
                                </span>
                              </div>
                              <div>
                                <span className="block text-[11px] text-[#1C2B1C]">
                                  Titular:{' '}
                                  {item.titular_fabricante || item.fabricante || 'Não Informado'}
                                </span>
                                <span className="text-[10px] font-mono text-[#5A6D5A]">
                                  MAPA: {item.registro_mapa || '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Badge className="text-[9px] py-0 px-1.5 bg-emerald-100 text-emerald-800">
                                  {item.status_pis_cofins?.slice(0, 24) || 'Beneficiado'}...
                                </Badge>
                              </div>
                            </div>

                            {isAdmin ? (
                              <Button
                                size="sm"
                                disabled={isResolving}
                                onClick={() => handleManterUmExcluirOutros(grupo, item.id)}
                                className="text-[10px] h-7 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-medium px-2.5 rounded-lg whitespace-nowrap"
                              >
                                Manter Este e Excluir Outros
                              </Button>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-slate-500 bg-slate-50 border-slate-200"
                              >
                                Leitura
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </Card>
      )}

      {/* Filtros e Busca Canônica */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6D5A]" />
            <Input
              value={search}
              onChange={(e) => {
                const val = e.target.value
                startTransition(() => {
                  setSearch(val)
                })
              }}
              placeholder="Buscar por nome completo, marca comercial, NCM (0000.00.00), registro MAPA ou titular..."
              className="pl-9 text-xs h-10 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
            {/* Macro Grupo */}
            <Select
              value={macroGrupoFilter}
              onValueChange={(val) => {
                setMacroGrupoFilter(val)
              }}
            >
              <SelectTrigger className="h-10 text-xs border-[#DCE5DC]">
                <SelectValue placeholder="Macro-Grupo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Macro-Grupos</SelectItem>
                <SelectItem value="Defensivos">Defensivos</SelectItem>
                <SelectItem value="Fertilizantes">Fertilizantes</SelectItem>
                <SelectItem value="Inoculantes e Biológicos">Inoculantes / Biológicos</SelectItem>
                <SelectItem value="Corretivos de Solo">Corretivos de Solo</SelectItem>
                <SelectItem value="Produtos Técnicos">Produtos Técnicos</SelectItem>
                <SelectItem value="Adjuvantes">Adjuvantes</SelectItem>
              </SelectContent>
            </Select>

            {/* Tipo de Produto */}
            <Select
              value={tipoProdutoFilter}
              onValueChange={(val) => {
                setTipoProdutoFilter(val)
              }}
            >
              <SelectTrigger className="h-10 text-xs border-[#DCE5DC]">
                <SelectValue placeholder="Tipo de Produto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="Produto Formulado Comercial">Formulado Comercial</SelectItem>
                <SelectItem value="Produto Técnico Industrial">Técnico Industrial</SelectItem>
                <SelectItem value="Fertilizante Mineral / Organomineral">Fertilizante</SelectItem>
                <SelectItem value="Inoculante / Biológico">Inoculante / Biológico</SelectItem>
                <SelectItem value="Corretivo / Condicionador de Solo">Corretivo / Solo</SelectItem>
                <SelectItem value="Adjuvante / Espalhante Adesivo">Adjuvante</SelectItem>
              </SelectContent>
            </Select>

            {/* Nota de Subposições 2 */}
            <Select
              value={nota2Filter}
              onValueChange={(val) => {
                setNota2Filter(val)
              }}
            >
              <SelectTrigger className="h-10 text-xs border-[#DCE5DC]">
                <SelectValue placeholder="Nota Subpos. 2" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Nota Subpos. 2 (Todas)</SelectItem>
                <SelectItem value="SIM">SIM (Rol Taxativo)</SelectItem>
                <SelectItem value="NÃO">NÃO (Geral)</SelectItem>
              </SelectContent>
            </Select>

            {/* Status PIS/COFINS */}
            <Select
              value={statusPisFilter}
              onValueChange={(val) => {
                setStatusPisFilter(val)
              }}
            >
              <SelectTrigger className="h-10 text-xs border-[#DCE5DC]">
                <SelectValue placeholder="Status PIS/COFINS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos PIS/COFINS</SelectItem>
                <SelectItem value="beneficiado">Beneficiado (Lei 10.925)</SelectItem>
                <SelectItem value="condicional">Benefício Condicional (Dec 5.630)</SelectItem>
                <SelectItem value="tributado">Tributado Integralmente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Tabela da Base Mestre com Colunas Canônicas Visíveis e Expansão para os 28 Campos */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
        <ScrollableTable
          autoFitHeight={true}
          bottomOffset={52}
          containerRef={tableContainerRef}
          onNearBottom={carregarMaisProdutos}
          bottomThreshold={250}
          className="flex-1 min-h-0"
        >
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20 bg-[#F5F7F1] shadow-[0_1px_0_0_#DCE5DC]">
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-3 w-10 text-center">
                  <div className="flex items-center justify-center">
                    <Checkbox
                      checked={
                        isAllLoadedSelected ? true : isSomeLoadedSelected ? 'indeterminate' : false
                      }
                      onCheckedChange={(checked) => handleSelectAllLoaded(checked === true)}
                      aria-label="Selecionar todos os produtos exibidos"
                      title="Selecionar todos os produtos exibidos até o momento"
                      disabled={produtos.length === 0}
                      className="data-[state=checked]:bg-[#1B5E20] data-[state=checked]:border-[#1B5E20]"
                    />
                  </div>
                </th>
                <th className="py-3 px-3 font-semibold">Nome Comercial Completo</th>
                <th className="py-3 px-3 font-semibold">Marca Padronizada</th>
                <th className="py-3 px-3 font-semibold">Tipo Produto</th>
                <th className="py-3 px-3 font-semibold">Embalagem</th>
                <th className="py-3 px-3 font-semibold">Princípio Ativo</th>
                <th className="py-3 px-3 font-semibold">Macro / Sub-Grupo</th>
                <th className="py-3 px-3 font-semibold text-center">Nota 2</th>
                <th className="py-3 px-3 font-semibold">NCM Padrão</th>
                <th className="py-3 px-3 font-semibold">Registro MAPA</th>
                <th className="py-3 px-3 font-semibold">Titular / Fabricante</th>
                <th className="py-3 px-3 font-semibold">Status PIS/COFINS</th>
                <th className="py-3 px-3 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando produtos da Base Mestre Canônica...
                  </td>
                </tr>
              ) : produtos.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhum produto cadastrado na Base Mestre com os critérios atuais.
                  </td>
                </tr>
              ) : (
                produtos.map((p) => {
                  const isSelected = selectedIds.includes(p.id)
                  const isExpanded = Boolean(expandedRowIds[p.id])
                  const isNota2 = p.nota_subpos_2 === 'SIM'

                  const isTributadoIntegral =
                    p.status_pis_cofins?.includes('Tributado Integralmente') ||
                    p.status_pis_cofins?.includes('SC COSIT')
                  const isCondicional =
                    p.status_pis_cofins?.includes('Condicional') ||
                    p.status_pis_cofins?.includes('5.630')

                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`hover:bg-[#F5F7F1]/50 transition-colors cursor-pointer ${
                          isSelected ? 'bg-emerald-50/60' : ''
                        }`}
                        onClick={() => toggleRowExpanded(p.id)}
                      >
                        <td
                          className="py-3 px-3 text-center cursor-default"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectOne(p.id)}
                              aria-label={`Selecionar produto ${p.marca_padronizada || p.nome_produto || p.id}`}
                              className="data-[state=checked]:bg-[#1B5E20] data-[state=checked]:border-[#1B5E20]"
                            />
                          </div>
                        </td>

                        {/* Nome Comercial Completo */}
                        <td className="py-3 px-3 font-bold text-[#1C2B1C] max-w-[220px] truncate">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleRowExpanded(p.id)
                              }}
                              className="p-0.5 -ml-1 text-[#5A6D5A] hover:text-[#1B5E20] rounded hover:bg-emerald-50"
                              title={
                                isExpanded ? 'Recolher detalhes' : 'Expandir detalhes dos 28 campos'
                              }
                              aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                              )}
                            </button>
                            <span title={p.nome_completo || p.nome_produto} className="truncate">
                              {p.nome_completo || p.nome_produto}
                            </span>
                          </div>
                        </td>

                        {/* Marca Comercial Padronizada */}
                        <td className="py-3 px-3 font-semibold text-emerald-950 whitespace-nowrap">
                          {p.marca_padronizada || p.nome_produto || '—'}
                        </td>

                        {/* Tipo de Produto */}
                        <td className="py-3 px-3 text-[#1C2B1C] whitespace-nowrap">
                          <span className="text-[11px] text-[#5A6D5A] bg-[#F5F7F1] px-2 py-0.5 rounded-md">
                            {p.tipo_produto || 'Produto Formulado'}
                          </span>
                        </td>

                        {/* Embalagem + Unidade */}
                        <td className="py-3 px-3 text-[#1C2B1C] whitespace-nowrap">
                          {p.embalagem || '—'}{' '}
                          <span className="text-[10px] text-[#5A6D5A]">({p.unidade || 'L'})</span>
                        </td>

                        {/* Princípio Ativo */}
                        <td
                          className="py-3 px-3 text-[#1C2B1C] max-w-[180px] truncate font-medium"
                          title={p.principio_ativo}
                        >
                          {p.principio_ativo || '—'}
                        </td>

                        {/* Macro-Grupo / Sub-Grupo */}
                        <td className="py-3 px-3 text-[#5A6D5A] whitespace-nowrap">
                          <span className="font-semibold text-[#1C2B1C]">
                            {p.macro_grupo || 'Defensivos'}
                          </span>
                          {p.sub_grupo && (
                            <span className="text-[10px] block text-[#5A6D5A]">{p.sub_grupo}</span>
                          )}
                        </td>

                        {/* Nota Subpos. 2? */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {isNota2 ? (
                            <Badge className="bg-purple-100 text-purple-900 border border-purple-300 font-bold text-[10px] py-0 px-2">
                              SIM (TIPI)
                            </Badge>
                          ) : (
                            <span className="text-[#8A9A86] text-[11px]">NÃO</span>
                          )}
                        </td>

                        {/* NCM Padrão Formatado 0000.00.00 */}
                        <td className="py-3 px-3 font-mono font-bold text-[#1B5E20] whitespace-nowrap">
                          {formatarNcmMascara(p.ncm_padrao || p.ncm)}
                        </td>

                        {/* Registro MAPA Formatado */}
                        <td className="py-3 px-3 font-mono text-[#1C2B1C] font-semibold whitespace-nowrap">
                          {sanitizarRegistroMapa(p.registro_mapa)}
                        </td>

                        {/* Titular / Fabricante */}
                        <td
                          className="py-3 px-3 text-[#5A6D5A] max-w-[170px] truncate"
                          title={p.titular_fabricante || p.fabricante}
                        >
                          {p.titular_fabricante || p.fabricante || 'Não Informado'}
                        </td>

                        {/* Status PIS/COFINS */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {isTributadoIntegral ? (
                            <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] py-0 px-1.5 font-medium">
                              Tributado Integral
                            </Badge>
                          ) : isCondicional ? (
                            <Badge className="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] py-0 px-1.5 font-medium">
                              Condicional (Dec 5.630)
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] py-0 px-1.5 font-medium">
                              Beneficiado 0%
                            </Badge>
                          )}
                        </td>

                        {/* Ações */}
                        <td
                          className="py-3 px-3 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isAdmin ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(p)}
                              className="h-7 w-7 text-[#5A6D5A] hover:text-[#1B5E20] hover:bg-emerald-50"
                              title="Editar especificações do produto"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic px-2">
                              Visualizar
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* ------------------------------------------------------------- */}
                      {/* PAINEL EXPANDIDO: DETALHAMENTO COMPLETO DOS 28 CAMPOS CANÔNICOS */}
                      {/* ------------------------------------------------------------- */}
                      {isExpanded && (
                        <tr className="bg-gradient-to-r from-emerald-50/40 via-white to-amber-50/30">
                          <td colSpan={13} className="py-4 px-6 border-y border-[#DCE5DC]/80">
                            <div className="space-y-4 text-xs">
                              <div className="flex items-center justify-between border-b border-[#DCE5DC] pb-2">
                                <span className="font-bold text-sm text-[#1C2B1C] flex items-center gap-2">
                                  <Layers className="w-4 h-4 text-[#1B5E20]" />
                                  Detalhamento Completo do Contrato Canônico de 28 Campos (v2.4.0)
                                </span>
                                <div className="flex items-center gap-2">
                                  {p.url_oficial && (
                                    <a
                                      href={p.url_oficial}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B5E20] hover:underline"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Fonte Oficial Auditada
                                    </a>
                                  )}
                                  <span className="text-[10px] text-[#5A6D5A] font-mono">
                                    ID: {p.id}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {/* Grupo 1: Classificação Aduaneira das 4 Faixas de Embalagem */}
                                <div className="p-3 rounded-xl bg-white border border-[#DCE5DC] shadow-xs space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-[#1B5E20] border-b border-emerald-100 pb-1">
                                    <Scale className="w-3.5 h-3.5" />
                                    <span>Matriz das 4 Faixas de NCM (TIPI)</span>
                                  </div>
                                  <div className="space-y-1 font-mono text-[11px]">
                                    <div className="flex justify-between">
                                      <span className="text-[#5A6D5A]">Faixa 1 (≤300g/mL):</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {formatarNcmMascara(
                                          p.ncm_faixa1_ate_300g || p.ncm_padrao || p.ncm,
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-[#5A6D5A]">
                                        Faixa 2 (300g a 7,5kg):
                                      </span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {formatarNcmMascara(
                                          p.ncm_faixa2_300g_a_7_5kg || p.ncm_padrao || p.ncm,
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-[#5A6D5A]">Faixa 3 (7,5 a 10kg):</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {formatarNcmMascara(
                                          p.ncm_faixa3_7_5kg_a_10kg || p.ncm_padrao || p.ncm,
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-[#5A6D5A]">
                                        Faixa 4 (&gt;10kg/Granel):
                                      </span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {formatarNcmMascara(
                                          p.ncm_faixa4_acima_10kg || p.ncm_padrao || p.ncm,
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-[#5A6D5A] pt-1 border-t border-emerald-50 italic">
                                    {p.regra_tipi ||
                                      'Classificação aduaneira escalonada conforme normas da Receita Federal / TIPI.'}
                                  </p>
                                </div>

                                {/* Grupo 2: Motor Tributário PIS/COFINS (Transição LC 224/2025) */}
                                <div className="p-3 rounded-xl bg-white border border-[#DCE5DC] shadow-xs space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-amber-900 border-b border-amber-100 pb-1">
                                    <Info className="w-3.5 h-3.5 text-amber-700" />
                                    <span>PIS/COFINS Temporal (LC 224/25)</span>
                                  </div>
                                  <div className="space-y-1 text-[11px]">
                                    <div>
                                      <span className="text-[#5A6D5A] block">Até 31/03/2026:</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {p.aliquota_ate_mar2026 || '0,00% (Lei nº 10.925/2004)'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[#5A6D5A] block">
                                        Pós-01/04/2026 (Lucro Real):
                                      </span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {p.aliquota_pos_abr2026_real || '0,925% (LC nº 224/2025)'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[#5A6D5A] block">
                                        Pós-01/04/2026 (Lucro Presumido):
                                      </span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {p.aliquota_pos_abr2026_presumido ||
                                          '0,365% (LC nº 224/2025)'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Grupo 3: CSTs e Reforma Tributária IBS/CBS */}
                                <div className="p-3 rounded-xl bg-white border border-[#DCE5DC] shadow-xs space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-blue-900 border-b border-blue-100 pb-1">
                                    <Database className="w-3.5 h-3.5 text-blue-700" />
                                    <span>CSTs e Reforma IBS/CBS 2027</span>
                                  </div>
                                  <div className="space-y-1 text-[11px]">
                                    <div className="flex justify-between font-mono">
                                      <span className="text-[#5A6D5A]">CST Saída (Venda):</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {p.cst_saida || 'CST 06'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between font-mono">
                                      <span className="text-[#5A6D5A]">CST Entrada (Revenda):</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {p.cst_entrada || 'CST 73'}
                                      </span>
                                    </div>
                                    <div className="pt-1 border-t border-blue-50">
                                      <span className="text-[#5A6D5A] block text-[10px]">
                                        IBS / CBS 2027 (LC nº 214/2025):
                                      </span>
                                      <span className="font-semibold text-[#1C2B1C] text-[11px]">
                                        {p.ibs_cbs_2027 ||
                                          'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Grupo 4: Regulatório e Auditoria Governamental */}
                                <div className="p-3 rounded-xl bg-white border border-[#DCE5DC] shadow-xs space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-gray-800 border-b border-gray-100 pb-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                    <span>Rastreabilidade Governamental</span>
                                  </div>
                                  <div className="space-y-1 text-[11px]">
                                    <div>
                                      <span className="text-[#5A6D5A] block text-[10px]">
                                        Sistema / Norma MAPA:
                                      </span>
                                      <span className="font-medium text-[#1C2B1C]">
                                        {p.sistema_norma_mapa ||
                                          'AGROFIT/MAPA (Lei nº 14.785/2023)'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[#5A6D5A] block text-[10px]">
                                        Origem na Base Oficial:
                                      </span>
                                      <span className="font-mono text-[#1C2B1C] font-semibold text-[10px]">
                                        {p.origem_base || 'BASE_LOCAL_MAPA'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[#5A6D5A] block text-[10px]">
                                        Titular Legal:
                                      </span>
                                      <span className="text-[#1C2B1C]">
                                        {p.titular_fabricante || p.fabricante || 'Não Informado'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
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

        {/* Rodapé informativo de rolagem infinita */}
        <div className="flex items-center justify-between p-3.5 border-t border-[#DCE5DC] bg-[#FAFBF9] text-xs text-[#5A6D5A]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#1C2B1C]">
              {produtos.length} {produtos.length === 1 ? 'produto exibido' : 'produtos exibidos'}
            </span>
            <span className="text-[#8A9A86]">•</span>
            <span>Ordem alfabética por nome comercial (padrão)</span>
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
      {/* MODAL DE LIMPEZA DA BASE MESTRE */}
      {/* ------------------------------------------------------------------ */}
      <ModalLimparBase
        open={modalLimparOpen}
        onOpenChange={setModalLimparOpen}
        alvo="base_mestre"
        tituloAlvo="Base Mestre de Produtos"
        onSucesso={() => {
          setSelectedIds([])
          carregarProdutos()
          if (duplicidadesOpen) {
            carregarDuplicidades()
          }
        }}
      />

      {/* ------------------------------------------------------------------ */}
      {/* MODAL DE EDIÇÃO DE PRODUTO CANÔNICO */}
      {/* ------------------------------------------------------------------ */}
      {editingItem && (
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
                <Database className="w-5 h-5 text-[#1B5E20]" />
                <span>Editar Produto no Padrão Canônico (28 Campos)</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-[#5A6D5A]">
                Atualize as especificações e o motor reclassificará deterministicamente as 4 faixas
                de NCM e o regime tributário.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEdit} className="space-y-4 py-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">
                  Nome Comercial Completo (com embalagem) *
                </Label>
                <Input
                  required
                  value={editingItem.nome_completo || editingItem.nome_produto || ''}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      nome_completo: e.target.value,
                      nome_produto: e.target.value,
                    })
                  }
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    Marca Padronizada (sem sufixos) *
                  </Label>
                  <Input
                    required
                    value={editingItem.marca_padronizada || ''}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, marca_padronizada: e.target.value })
                    }
                    className="h-9 text-xs border-[#DCE5DC]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">Tipo de Produto *</Label>
                  <Select
                    value={editingItem.tipo_produto || 'Produto Formulado Comercial'}
                    onValueChange={(val: TipoProdutoCanonico) =>
                      setEditingItem({ ...editingItem, tipo_produto: val })
                    }
                  >
                    <SelectTrigger className="h-9 text-xs border-[#DCE5DC]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Produto Formulado Comercial">
                        Produto Formulado Comercial
                      </SelectItem>
                      <SelectItem value="Produto Técnico Industrial">
                        Produto Técnico Industrial
                      </SelectItem>
                      <SelectItem value="Pré-Mistura Industrial">Pré-Mistura Industrial</SelectItem>
                      <SelectItem value="Fertilizante Mineral / Organomineral">
                        Fertilizante Mineral / Organomineral
                      </SelectItem>
                      <SelectItem value="Inoculante / Biológico">Inoculante / Biológico</SelectItem>
                      <SelectItem value="Corretivo / Condicionador de Solo">
                        Corretivo / Condicionador de Solo
                      </SelectItem>
                      <SelectItem value="Semente Certificada">Semente Certificada</SelectItem>
                      <SelectItem value="Adjuvante / Espalhante Adesivo">
                        Adjuvante / Espalhante Adesivo
                      </SelectItem>
                      <SelectItem value="Outros Insumos Químicos e Reagentes">
                        Outros Insumos Químicos e Reagentes
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">Embalagem *</Label>
                  <Input
                    required
                    value={editingItem.embalagem || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, embalagem: e.target.value })}
                    className="h-9 text-xs border-[#DCE5DC]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">Unidade *</Label>
                  <Select
                    value={editingItem.unidade || 'L'}
                    onValueChange={(val: UnidadeFisicaCanonica) =>
                      setEditingItem({ ...editingItem, unidade: val })
                    }
                  >
                    <SelectTrigger className="h-9 text-xs border-[#DCE5DC]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L">L (Litros)</SelectItem>
                      <SelectItem value="KG">KG (Quilos)</SelectItem>
                      <SelectItem value="SC">SC (Sacos)</SelectItem>
                      <SelectItem value="UN">UN (Unidade)</SelectItem>
                      <SelectItem value="DOSES">DOSES</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">
                  Princípio Ativo / Garantias *
                </Label>
                <Input
                  required
                  value={editingItem.principio_ativo || ''}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, principio_ativo: e.target.value })
                  }
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    NCM Padrão (0000.00.00) *
                  </Label>
                  <Input
                    required
                    value={editingItem.ncm_padrao || editingItem.ncm || ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        ncm_padrao: e.target.value,
                        ncm: e.target.value.replace(/\D/g, ''),
                      })
                    }
                    className="h-9 text-xs font-mono font-bold text-[#1B5E20] border-[#DCE5DC]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    Registro MAPA Oficial *
                  </Label>
                  <Input
                    required
                    value={editingItem.registro_mapa || ''}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, registro_mapa: e.target.value })
                    }
                    placeholder="Nº 0315, TC... ou ISENTO"
                    className="h-9 text-xs font-mono border-[#DCE5DC]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    Titular / Fabricante *
                  </Label>
                  <Input
                    required
                    value={editingItem.titular_fabricante || editingItem.fabricante || ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        titular_fabricante: e.target.value,
                        fabricante: e.target.value,
                      })
                    }
                    className="h-9 text-xs border-[#DCE5DC]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">Origem na Base</Label>
                  <Input
                    value={editingItem.origem_base || 'PRE_CADASTRO_PORTAL'}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, origem_base: e.target.value })
                    }
                    className="h-9 text-xs font-mono border-[#DCE5DC]"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingEdit}
                  size="sm"
                  className="text-xs bg-[#1B5E20] hover:bg-[#2E7D32] text-white"
                >
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Salvar e Recalcular Motor
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
