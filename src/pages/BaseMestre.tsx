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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
import { PainelEnquadramentoTributario } from '@/components/PainelEnquadramentoTributario'
import { determinarEnquadramentoTributario } from '@/lib/enquadramentoTributario'
import {
  formatarRotuloLegivelDuplicada,
  encontrarDuplicadoNaLista,
  type PayloadItemBaseMestre,
} from '@/lib/baseMestreDedupe'
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
  const [acondicionamentoFilter, setAcondicionamentoFilter] = useState<string>('todos')
  const [macroGrupoFilter, setMacroGrupoFilter] = useState<string>('todos')
  const [tipoProdutoFilter, setTipoProdutoFilter] = useState<string>('todos')
  const [nota2Filter, setNota2Filter] = useState<string>('todos')
  const [statusPisFilter, setStatusPisFilter] = useState<string>('todos')
  const [enquadramentoFilter, setEnquadramentoFilter] = useState<string>('todos')
  const [modalEnquadramentoItem, setModalEnquadramentoItem] = useState<BaseMestreProduto | null>(
    null,
  )
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
  const [duplicidadeEdicaoAviso, setDuplicidadeEdicaoAviso] = useState<{
    rotulo: string
    idExistente: string
  } | null>(null)

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
        `(nome_completo ~ '${clean}' || marca_padronizada ~ '${clean}' || registro_mapa ~ '${clean}' || ncm_especifica ~ '${clean}' || ncm_padrao ~ '${clean}' || titular_fabricante ~ '${clean}' || principio_ativo ~ '${clean}' || forma_acondicionamento ~ '${clean}' || embalagem_original ~ '${clean}')`,
      )
    }
    if (acondicionamentoFilter !== 'todos') {
      filters.push(`forma_acondicionamento = '${acondicionamentoFilter.replace(/'/g, "\\'")}'`)
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
  }, [
    paIdFilter,
    search,
    acondicionamentoFilter,
    macroGrupoFilter,
    tipoProdutoFilter,
    nota2Filter,
    statusPisFilter,
  ])

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
      // O endpoint do servidor agrupa canonicamente pela regra dos 4 campos
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
      'produto',
      'marca_padronizada',
      'registro_mapa',
      'principio_ativo',
      'fabricante',
      'tipo_formulacao',
      'quantidade_embalagem_principal',
      'unidade_medida_principal',
      'forma_acondicionamento',
      'embalagem_original',
      'ncm_especifica',
      'ncm_padrao',
      'nota_subpos_2',
      'status_pis_cofins',
      'aliquota_ate_mar2026',
      'aliquota_pos_abr2026_real',
      'aliquota_pos_abr2026_presumido',
      'cst_saida',
      'cst_entrada',
      'ibs_cbs_2027',
      'enquadramento_icms_regime',
      'enquadramento_icms_norma',
      'enquadramento_icms_artigo',
      'enquadramento_pis_lei',
      'enquadramento_pis_artigo',
      'enquadramento_pis_inciso',
      'enquadramento_cofins_artigo',
      'enquadramento_ibs_cbs_regra',
      'macro_grupo',
      'sub_grupo',
      'origem_base',
      'url_oficial',
    ]

    const rows = listToExport.map((p) => {
      const qtdEmb = p.quantidade_embalagem_principal ?? ''
      const unEmb = p.unidade_medida_principal || p.unidade || 'L'
      const acond = p.forma_acondicionamento || ''
      const ncmEsp = formatarNcmMascara(p.ncm_especifica || p.ncm_padrao || p.ncm)
      const enq = determinarEnquadramentoTributario({
        ncm: p.ncm_especifica || p.ncm_padrao || p.ncm,
        tipo_produto: p.tipo_produto,
        principio_ativo: p.principio_ativo,
        macro_grupo: p.macro_grupo,
        sub_grupo: p.sub_grupo,
        registro_mapa: p.registro_mapa,
        titular_fabricante: p.titular_fabricante || p.fabricante,
      })

      return [
        `"${p.id}"`,
        `"${(p.nome_completo || p.nome_produto || '').replace(/"/g, '""')}"`,
        `"${(p.marca_padronizada || p.nome_produto || '').replace(/"/g, '""')}"`,
        `"${sanitizarRegistroMapa(p.registro_mapa)}"`,
        `"${(p.principio_ativo || '').replace(/"/g, '""')}"`,
        `"${(p.titular_fabricante || p.fabricante || '').replace(/"/g, '""')}"`,
        `"${(p.tipo_produto || 'Produto Formulado Comercial').replace(/"/g, '""')}"`,
        `"${qtdEmb}"`,
        `"${unEmb}"`,
        `"${acond.replace(/"/g, '""')}"`,
        `"${(p.embalagem_original || p.embalagem || '').replace(/"/g, '""')}"`,
        `"${ncmEsp}"`,
        `"${formatarNcmMascara(p.ncm_padrao || p.ncm)}"`,
        `"${p.nota_subpos_2 || 'NÃO'}"`,
        `"${(p.status_pis_cofins || '').replace(/"/g, '""')}"`,
        `"${(p.aliquota_ate_mar2026 || '').replace(/"/g, '""')}"`,
        `"${(p.aliquota_pos_abr2026_real || '').replace(/"/g, '""')}"`,
        `"${(p.aliquota_pos_abr2026_presumido || '').replace(/"/g, '""')}"`,
        `"${(p.cst_saida || 'CST 06').replace(/"/g, '""')}"`,
        `"${(p.cst_entrada || 'CST 73').replace(/"/g, '""')}"`,
        `"${(p.ibs_cbs_2027 || '').replace(/"/g, '""')}"`,
        `"${enq.icms.regime.replace(/"/g, '""')}"`,
        `"${enq.icms.citacao.norma.replace(/"/g, '""')}"`,
        `"${(enq.icms.citacao.artigo + (enq.icms.citacao.inciso ? ', ' + enq.icms.citacao.inciso : '')).replace(/"/g, '""')}"`,
        `"${enq.pis.citacao.norma.replace(/"/g, '""')}"`,
        `"${enq.pis.citacao.artigo.replace(/"/g, '""')}"`,
        `"${(enq.pis.citacao.inciso || '').replace(/"/g, '""')}"`,
        `"${enq.cofins.citacao.artigo.replace(/"/g, '""')}"`,
        `"${enq.ibs.resumoClaro.replace(/"/g, '""')}"`,
        `"${(p.macro_grupo || 'Defensivos').replace(/"/g, '""')}"`,
        `"${(p.sub_grupo || '').replace(/"/g, '""')}"`,
        `"${(p.origem_base || '').replace(/"/g, '""')}"`,
        `"${(p.url_oficial || '').replace(/"/g, '""')}"`,
      ].join(';')
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `base_mestre_tributaria_canonica_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Download Concluído',
      description:
        'O CSV com os campos canônicos oficiais e os 5 tributos (ICMS, PIS, COFINS, IBS e CBS) foi gerado com sucesso.',
    })
  }

  // Abrir Modal de Edição
  const handleOpenEdit = (p: BaseMestreProduto) => {
    setEditingItem({ ...p })
    setDuplicidadeEdicaoAviso(null)
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

    // Validação de duplicidade pela regra dos 4 campos canônicos
    // (Nome Comercial + Princípio Ativo + Quantidade Embalagem + Registro MAPA)
    const payloadNovo: PayloadItemBaseMestre = {
      nome_comercial:
        editingItem.marca_padronizada ||
        editingItem.nome_produto ||
        editingItem.nome_completo ||
        '',
      marca_padronizada: editingItem.marca_padronizada,
      nome_produto: editingItem.nome_produto,
      nome_completo: editingItem.nome_completo,
      principio_ativo: editingItem.principio_ativo,
      quantidade_embalagem_principal: editingItem.quantidade_embalagem_principal,
      embalagem: editingItem.embalagem_original || editingItem.embalagem,
      registro_mapa: editingItem.registro_mapa,
    }

    const duplicadoLocal = encontrarDuplicadoNaLista(payloadNovo, produtos, editingItem.id)
    if (duplicadoLocal && !duplicidadeEdicaoAviso) {
      const rotulo = formatarRotuloLegivelDuplicada(payloadNovo)
      setDuplicidadeEdicaoAviso({
        rotulo,
        idExistente: duplicadoLocal.id,
      })
      return
    }

    setSavingEdit(true)
    try {
      // Re-executa motor canônico se necessário para manter integridade dos campos
      const ncmEspFmt = formatarNcmMascara(
        editingItem.ncm_especifica || editingItem.ncm_padrao || editingItem.ncm,
      )
      const ncmEspLimpo = ncmEspFmt.replace(/\D/g, '')

      const reprocessado = executarMotorCanonicoFrontend({
        nome_completo: editingItem.nome_completo || editingItem.nome_produto,
        marca_padronizada: editingItem.marca_padronizada,
        tipo_produto: editingItem.tipo_produto,
        embalagem:
          editingItem.embalagem ||
          `${editingItem.quantidade_embalagem_principal || ''} ${editingItem.unidade_medida_principal || editingItem.unidade || 'L'} (${editingItem.forma_acondicionamento || ''})`.trim(),
        unidade:
          (editingItem.unidade_medida_principal as UnidadeFisicaCanonica) ||
          editingItem.unidade ||
          'L',
        principio_ativo: editingItem.principio_ativo,
        macro_grupo: editingItem.macro_grupo,
        sub_grupo: editingItem.sub_grupo,
        registro_mapa: editingItem.registro_mapa,
        titular_fabricante: editingItem.titular_fabricante || editingItem.fabricante,
        ncm_padrao: ncmEspFmt,
        origem_base: editingItem.origem_base,
        url_oficial: editingItem.url_oficial,
      })

      await atualizarProdutoBaseMestre(editingItem.id, {
        ...editingItem,
        ...reprocessado,
        quantidade_embalagem_principal: editingItem.quantidade_embalagem_principal,
        unidade_medida_principal:
          editingItem.unidade_medida_principal || editingItem.unidade || 'L',
        forma_acondicionamento: editingItem.forma_acondicionamento,
        embalagem_original: editingItem.embalagem_original || editingItem.embalagem,
        ncm_especifica: ncmEspFmt,
        ncm_padrao: ncmEspFmt,
        ncm: ncmEspLimpo,
      })
      toast({
        title: 'Produto Atualizado',
        description: 'Alterações gravadas na Base Tributária por Embalagem Final.',
      })
      setDuplicidadeEdicaoAviso(null)
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
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
              <Database className="w-6 h-6 text-[#1B5E20]" />
              <span>Base Tributária por Embalagem Final</span>
            </h2>
            <Badge className="bg-emerald-100 text-emerald-900 border border-emerald-300 font-medium text-[11px] py-0.5 px-2">
              1 Cadastro por Embalagem Comercial
            </Badge>
          </div>
          <p className="text-xs text-[#5A6D5A] mt-1">
            Cadastro mestre tributário detalhado por embalagem final comercializada: quantidade,
            unidade, forma de acondicionamento, NCM específica da embalagem, princípio ativo,
            fabricante, perfil PIS/COFINS (LC 224/2025), CST saída/entrada e reforma IBS/CBS (
            {totalCount} embalagens cadastradas).
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
              ? `Exportar Base (${selectedIds.length})`
              : 'Exportar CSV (5 Tributos)'}
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModalLimparOpen(true)}
                  disabled={!isAdmin || totalCount === 0}
                  className="text-xs h-9 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5 text-red-600" />
                  Excluir toda a base
                </Button>
              </span>
            </TooltipTrigger>
            {!isAdmin ? (
              <TooltipContent side="bottom" className="text-xs max-w-xs">
                Exclusão total restrita a administradores.
              </TooltipContent>
            ) : totalCount === 0 ? (
              <TooltipContent side="bottom" className="text-xs">
                A base mestre já está vazia.
              </TooltipContent>
            ) : null}
          </Tooltip>
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
                  Regra Canônica dos 4 Campos: apenas produtos com mesmo{' '}
                  <strong>Nome Comercial</strong>, <strong>Princípio Ativo</strong>,{' '}
                  <strong>Quantidade de Embalagem</strong> e <strong>Registro MAPA</strong> são
                  classificados como duplicados. Mesma marca com embalagens distintas não configura
                  duplicidade.
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

          {/* Badge Informativa da Regra Canônica dos 4 Campos */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="font-semibold text-[#1C2B1C] text-[11px]">
              Critério Canônico Ativo:
            </span>
            <Badge className="bg-amber-700 text-white text-[11px] py-0.5 px-2.5">
              4 Campos Canônicos (Nome Comercial + Princípio Ativo + Quantidade + MAPA)
            </Badge>
          </div>

          {/* Conteúdo do Relatório */}
          {loadingDuplicidades ? (
            <div className="p-8 text-center text-xs text-[#5A6D5A]">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-700 mb-2" />
              Executando diagnóstico de duplicidades pela regra dos 4 campos no servidor...
            </div>
          ) : !relatorioDuplicidades || relatorioDuplicidades.grupos.length === 0 ? (
            <div className="p-6 text-center text-xs text-emerald-800 bg-emerald-50 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
              <p className="font-bold text-sm text-emerald-900">
                Nenhuma duplicidade encontrada na Base Mestre!
              </p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Todos os produtos possuem combinações únicas dos 4 campos (Nome Comercial, Princípio
                Ativo, Quantidade da Embalagem e Código MAPA).
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {relatorioDuplicidades.grupos.map((grupo) => {
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
                          <span className="font-bold text-xs text-[#1C2B1C]">
                            {grupo.registros[0]
                              ? formatarRotuloLegivelDuplicada({
                                  nome_comercial:
                                    grupo.registros[0].marca_padronizada ||
                                    grupo.registros[0].nome_produto ||
                                    grupo.registros[0].nome_completo,
                                  principio_ativo: grupo.registros[0].principio_ativo,
                                  quantidade_embalagem_principal:
                                    grupo.registros[0].quantidade_embalagem_principal,
                                  embalagem:
                                    grupo.registros[0].embalagem_original ||
                                    grupo.registros[0].embalagem,
                                  registro_mapa: grupo.registros[0].registro_mapa,
                                })
                              : grupo.chave}
                          </span>
                          <span className="text-[11px] text-[#5A6D5A] ml-2">
                            ({grupo.total_ocorrencias} ocorrências)
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
                                {item.marca_padronizada || item.nome_completo || item.nome_produto}
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

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full md:w-auto">
            {/* Filtro por Forma de Acondicionamento */}
            <Select
              value={acondicionamentoFilter}
              onValueChange={(val) => {
                setAcondicionamentoFilter(val)
              }}
            >
              <SelectTrigger className="h-10 text-xs border-[#DCE5DC]">
                <SelectValue placeholder="Acondicionamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Acondicionamentos</SelectItem>
                <SelectItem value="Bombona">Bombona</SelectItem>
                <SelectItem value="Saco">Saco</SelectItem>
                <SelectItem value="Tambor">Tambor</SelectItem>
                <SelectItem value="Big Bag">Big Bag</SelectItem>
                <SelectItem value="Frasco">Frasco</SelectItem>
                <SelectItem value="Balde">Balde</SelectItem>
                <SelectItem value="Galão">Galão</SelectItem>
                <SelectItem value="Container / IBC">Container / IBC</SelectItem>
                <SelectItem value="Caixa">Caixa</SelectItem>
                <SelectItem value="Sache">Sache</SelectItem>
              </SelectContent>
            </Select>

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

            {/* Enquadramento Tributário / Categoria */}
            <Select
              value={enquadramentoFilter}
              onValueChange={(val) => {
                setEnquadramentoFilter(val)
              }}
            >
              <SelectTrigger className="h-10 text-xs border-[#DCE5DC]">
                <SelectValue placeholder="Enquadramento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Enquadramentos</SelectItem>
                <SelectItem value="agro">Insumos Beneficiados (Conv. 100/97 e IBS/CBS)</SelectItem>
                <SelectItem value="defensivos">Defensivos (NCM 3808 - 60% ICMS)</SelectItem>
                <SelectItem value="fertilizantes">
                  Fertilizantes (Cap. 31 - Carga 4% ICMS)
                </SelectItem>
                <SelectItem value="corretivos">Corretivos de Solo (Cap. 25)</SelectItem>
                <SelectItem value="sementes">Sementes / Mudas (Cláusula 1ª, V)</SelectItem>
                <SelectItem value="geral">Regime Padrão / Geral</SelectItem>
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
                <th className="py-3 px-3 font-semibold">Produto</th>
                <th className="py-3 px-3 font-semibold">Registro MAPA</th>
                <th className="py-3 px-3 font-semibold">Princípio Ativo</th>
                <th className="py-3 px-3 font-semibold">Fabricante</th>
                <th className="py-3 px-3 font-semibold">Formulação</th>
                <th className="py-3 px-3 font-semibold">Quantidade</th>
                <th className="py-3 px-3 font-semibold">Acondicionamento</th>
                <th className="py-3 px-3 font-semibold">NCM Específica</th>
                <th className="py-3 px-3 font-semibold">Status PIS/COFINS</th>
                <th className="py-3 px-3 font-semibold">IBS / CBS (LC 214/25)</th>
                <th className="py-3 px-3 font-semibold">Enquadramento Legal</th>
                <th className="py-3 px-3 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando produtos da Base Tributária por Embalagem Final...
                  </td>
                </tr>
              ) : produtos.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhuma embalagem cadastrada na Base Tributária com os critérios atuais.
                  </td>
                </tr>
              ) : (
                produtos.map((p) => {
                  const isSelected = selectedIds.includes(p.id)
                  const isExpanded = Boolean(expandedRowIds[p.id])

                  const isTributadoIntegral =
                    p.status_pis_cofins?.includes('Tributado Integralmente') ||
                    p.status_pis_cofins?.includes('SC COSIT')
                  const isCondicional =
                    p.status_pis_cofins?.includes('Condicional') ||
                    p.status_pis_cofins?.includes('5.630')

                  // Quantidade e unidade da embalagem
                  const qtdExibida =
                    p.quantidade_embalagem_principal != null &&
                    p.quantidade_embalagem_principal !== 0
                      ? p.quantidade_embalagem_principal
                      : p.embalagem || '—'
                  const unExibida = p.unidade_medida_principal || p.unidade || 'L'

                  // Forma de acondicionamento
                  const acondExibido = p.forma_acondicionamento || 'Geral'

                  // NCM específica com badge destacada
                  const ncmEspecificaExibida = formatarNcmMascara(
                    p.ncm_especifica || p.ncm_padrao || p.ncm,
                  )

                  // Enquadramento derivado do produto
                  const enquadramento = determinarEnquadramentoTributario({
                    ncm: p.ncm_especifica || p.ncm_padrao || p.ncm,
                    tipo_produto: p.tipo_produto,
                    principio_ativo: p.principio_ativo,
                    macro_grupo: p.macro_grupo,
                    sub_grupo: p.sub_grupo,
                    registro_mapa: p.registro_mapa,
                    titular_fabricante: p.titular_fabricante || p.fabricante,
                  })

                  // Filtro local adicional de Enquadramento
                  if (enquadramentoFilter !== 'todos') {
                    if (enquadramentoFilter === 'agro' && !enquadramento.qualificadoAgro)
                      return null
                    if (
                      enquadramentoFilter === 'defensivos' &&
                      !enquadramento.categoriaProduto.includes('Defensivo')
                    )
                      return null
                    if (
                      enquadramentoFilter === 'fertilizantes' &&
                      !enquadramento.categoriaProduto.includes('Adubo')
                    )
                      return null
                    if (
                      enquadramentoFilter === 'corretivos' &&
                      !enquadramento.categoriaProduto.includes('Corretivo')
                    )
                      return null
                    if (
                      enquadramentoFilter === 'sementes' &&
                      !enquadramento.categoriaProduto.includes('Semente')
                    )
                      return null
                    if (enquadramentoFilter === 'geral' && enquadramento.qualificadoAgro)
                      return null
                  }

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

                        {/* 1. Produto (Nome Comercial / Marca) */}
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
                                isExpanded ? 'Recolher detalhes' : 'Expandir detalhes da embalagem'
                              }
                              aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                              )}
                            </button>
                            <div className="truncate">
                              <span
                                title={p.marca_padronizada || p.nome_produto || p.nome_completo}
                                className="font-bold text-[#1C2B1C] block"
                              >
                                {p.marca_padronizada || p.nome_produto || p.nome_completo}
                              </span>
                              {p.nome_completo && p.nome_completo !== p.marca_padronizada && (
                                <span className="text-[10px] text-[#5A6D5A] font-normal truncate block">
                                  {p.nome_completo}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 2. Registro MAPA */}
                        <td className="py-3 px-3 font-mono text-[#1C2B1C] font-semibold whitespace-nowrap">
                          {sanitizarRegistroMapa(p.registro_mapa)}
                        </td>

                        {/* 3. Princípio Ativo */}
                        <td
                          className="py-3 px-3 text-[#1C2B1C] max-w-[170px] truncate font-medium"
                          title={p.principio_ativo}
                        >
                          {p.principio_ativo || '—'}
                        </td>

                        {/* 4. Fabricante */}
                        <td
                          className="py-3 px-3 text-[#5A6D5A] max-w-[160px] truncate"
                          title={p.titular_fabricante || p.fabricante}
                        >
                          {p.titular_fabricante || p.fabricante || 'Não Informado'}
                        </td>

                        {/* 5. Formulação */}
                        <td className="py-3 px-3 text-[#1C2B1C] whitespace-nowrap">
                          <span className="text-[11px] text-[#5A6D5A] bg-[#F5F7F1] px-2 py-0.5 rounded-md">
                            {p.tipo_produto || 'Produto Formulado'}
                          </span>
                        </td>

                        {/* 6. Quantidade (número + unidade) */}
                        <td className="py-3 px-3 font-bold text-[#1C2B1C] whitespace-nowrap">
                          {typeof qtdExibida === 'number' ? (
                            <span>
                              {qtdExibida}{' '}
                              <span className="text-xs font-semibold text-[#5A6D5A]">
                                {unExibida}
                              </span>
                            </span>
                          ) : (
                            <span>{qtdExibida}</span>
                          )}
                        </td>

                        {/* 7. Acondicionamento (badge) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Badge className="bg-sky-50 text-sky-900 border border-sky-300 font-semibold text-[11px] py-0.5 px-2">
                            {acondExibido}
                          </Badge>
                        </td>

                        {/* 8. NCM Específica (badge destacada) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Badge className="bg-emerald-700 text-white border-0 shadow-sm font-mono font-bold text-[11px] py-0.5 px-2.5 tracking-wide">
                            {ncmEspecificaExibida}
                          </Badge>
                        </td>

                        {/* 9. Status PIS/COFINS */}
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
                              {enquadramento.pis.regime.includes('Alíquota Zero')
                                ? 'Alíquota Zero (Lei 10.925)'
                                : 'Beneficiado 0%'}
                            </Badge>
                          )}
                          <span className="block text-[10px] text-[#5A6D5A] font-mono mt-0.5">
                            {p.cst_saida || 'CST 06'} / {p.cst_entrada || 'CST 73'}
                          </span>
                        </td>

                        {/* 10. IBS / CBS (LC 214/2025) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {enquadramento.qualificadoAgro ? (
                            <div>
                              <Badge className="bg-blue-50 text-blue-900 border border-blue-200 text-[10px] py-0 px-1.5 font-medium">
                                Redução 60% + Diferido
                              </Badge>
                              <span className="block text-[10px] text-[#5A6D5A] font-mono mt-0.5">
                                Art. 138 LC 214/25
                              </span>
                            </div>
                          ) : (
                            <div>
                              <Badge className="bg-gray-100 text-gray-800 border border-gray-300 text-[10px] py-0 px-1.5 font-medium">
                                Alíquota Padrão
                              </Badge>
                              <span className="block text-[10px] text-[#5A6D5A] font-mono mt-0.5">
                                Arts. 4º e 50 LC 214/25
                              </span>
                            </div>
                          )}
                        </td>

                        {/* 11. Enquadramento Legal Específico & Acesso Rápido */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setModalEnquadramentoItem(p)
                            }}
                            className="h-7 text-[11px] font-semibold bg-purple-50/70 hover:bg-purple-100 text-purple-900 border-purple-200 px-2 py-0"
                            title="Ver enquadramento tributário completo nos 5 impostos (ICMS, PIS, COFINS, IBS e CBS)"
                          >
                            <Scale className="w-3 h-3 mr-1 text-purple-700" />
                            <span>Ver Impostos</span>
                          </Button>
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
                              title="Editar quantidade, unidade, acondicionamento e NCM da embalagem"
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
                                  <Scale className="w-4 h-4 text-[#1B5E20]" />
                                  Espelho Tributário Detalhado da Embalagem Comercial
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
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setModalEnquadramentoItem(p)}
                                    className="h-7 text-xs bg-white text-[#1B5E20] border-emerald-300 hover:bg-emerald-50"
                                  >
                                    <Scale className="w-3.5 h-3.5 mr-1" />
                                    Abrir em Modal
                                  </Button>
                                </div>
                              </div>

                              {/* PAINEL COMPLETO DE ENQUADRAMENTO TRIBUTÁRIO (PIS, COFINS, IBS, CBS) */}
                              <div className="pt-1">
                                <PainelEnquadramentoTributario produto={p} />
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {/* Grupo 1: Embalagem Comercial e NCM Específica */}
                                <div className="p-3 rounded-xl bg-white border border-[#DCE5DC] shadow-xs space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-[#1B5E20] border-b border-emerald-100 pb-1">
                                    <Scale className="w-3.5 h-3.5" />
                                    <span>Embalagem Comercial & NCM</span>
                                  </div>
                                  <div className="space-y-1 text-[11px]">
                                    <div className="flex justify-between">
                                      <span className="text-[#5A6D5A]">Qtd Principal:</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {p.quantidade_embalagem_principal ?? '—'}{' '}
                                        {p.unidade_medida_principal || p.unidade || 'L'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-[#5A6D5A]">Acondicionamento:</span>
                                      <span className="font-bold text-sky-900">
                                        {p.forma_acondicionamento || '—'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-[#5A6D5A]">NCM Específica:</span>
                                      <span className="font-mono font-bold text-[#1B5E20]">
                                        {formatarNcmMascara(
                                          p.ncm_especifica || p.ncm_padrao || p.ncm,
                                        )}
                                      </span>
                                    </div>
                                    <div className="pt-1 border-t border-emerald-50">
                                      <span className="text-[#5A6D5A] block text-[10px]">
                                        Texto Original da Embalagem:
                                      </span>
                                      <span className="text-[#1C2B1C] italic text-[11px] block break-words">
                                        {p.embalagem_original || p.embalagem || '—'}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-[#5A6D5A] pt-1 border-t border-emerald-50 italic">
                                    {p.regra_tipi ||
                                      'Classificação aduaneira por embalagem conforme normas da Receita Federal / TIPI.'}
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
        tituloAlvo="Base Mestre"
        totalRegistros={totalCount}
        onSucesso={() => {
          setSelectedIds([])
          carregarProdutos()
          if (duplicidadesOpen) {
            carregarDuplicidades()
          }
        }}
      />

      {/* ------------------------------------------------------------------ */}
      {/* MODAL DE DETALHAMENTO DO ENQUADRAMENTO TRIBUTÁRIO COMPLETO */}
      {/* ------------------------------------------------------------------ */}
      {modalEnquadramentoItem && (
        <Dialog
          open={Boolean(modalEnquadramentoItem)}
          onOpenChange={(open) => {
            if (!open) setModalEnquadramentoItem(null)
          }}
        >
          <DialogContent className="max-w-4xl rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
                <Scale className="w-5 h-5 text-[#1B5E20]" />
                <span>
                  Ver Impostos — Enquadramento Tributário:{' '}
                  {modalEnquadramentoItem.marca_padronizada ||
                    modalEnquadramentoItem.nome_produto ||
                    modalEnquadramentoItem.nome_completo}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-[#5A6D5A]">
                Citação jurídica e fundamentação legal exata por tributo: ICMS (Convênio ICMS
                100/97), PIS, COFINS, IBS e CBS para a embalagem e NCM cadastrados.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <PainelEnquadramentoTributario produto={modalEnquadramentoItem} />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalEnquadramentoItem(null)}
                className="text-xs"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL DE EDIÇÃO DE PRODUTO CANÔNICO */}
      {/* ------------------------------------------------------------------ */}
      {editingItem && (
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
                <Database className="w-5 h-5 text-[#1B5E20]" />
                <span>Editar Embalagem na Base Tributária</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-[#5A6D5A]">
                Ajuste os parâmetros da embalagem comercial: quantidade, unidade, forma de
                acondicionamento e NCM específica.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEdit} className="space-y-4 py-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">
                  Nome do Produto / Marca *
                </Label>
                <Input
                  required
                  value={
                    editingItem.marca_padronizada ||
                    editingItem.nome_produto ||
                    editingItem.nome_completo ||
                    ''
                  }
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      marca_padronizada: e.target.value,
                      nome_produto: e.target.value,
                    })
                  }
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              {/* Alerta de Duplicidade nos 4 Campos Canônicos */}
              {duplicidadeEdicaoAviso && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2 animate-in fade-in">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-950">
                      <p className="font-bold text-amber-900">
                        Atenção: Combinação de 4 campos já existente na Base Mestre
                      </p>
                      <p className="text-[11px] text-amber-800 mt-0.5 font-medium">
                        {duplicidadeEdicaoAviso.rotulo}
                      </p>
                      <p className="text-[10px] text-amber-700 mt-1">
                        Já existe outro cadastro ativo com o mesmo Nome Comercial, Princípio Ativo,
                        Quantidade de Embalagem e Registro MAPA (ID:{' '}
                        {duplicidadeEdicaoAviso.idExistente}).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDuplicidadeEdicaoAviso(null)}
                      className="h-7 text-xs text-[#5A6D5A] hover:text-black"
                    >
                      Ajustar Campos
                    </Button>
                    <Button
                      type="submit"
                      disabled={savingEdit}
                      size="sm"
                      className="h-7 text-xs bg-amber-700 hover:bg-amber-800 text-white font-medium"
                    >
                      Prosseguir e Salvar Mesmo Assim
                    </Button>
                  </div>
                </div>
              )}

              {/* Parâmetros da Embalagem: Quantidade, Unidade, Forma de Acondicionamento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#F5F7F1]/80 rounded-xl border border-[#DCE5DC]">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    Quantidade Principal *
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    required
                    value={editingItem.quantidade_embalagem_principal ?? ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      setEditingItem({
                        ...editingItem,
                        quantidade_embalagem_principal: isNaN(val) ? 0 : val,
                      })
                    }}
                    placeholder="Ex: 5, 20, 1000"
                    className="h-9 text-xs border-[#DCE5DC] bg-white font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    Unidade Principal *
                  </Label>
                  <Select
                    value={editingItem.unidade_medida_principal || editingItem.unidade || 'L'}
                    onValueChange={(val: string) =>
                      setEditingItem({
                        ...editingItem,
                        unidade_medida_principal: val,
                        unidade: (val as UnidadeFisicaCanonica) || 'L',
                      })
                    }
                  >
                    <SelectTrigger className="h-9 text-xs border-[#DCE5DC] bg-white font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L">L (Litros)</SelectItem>
                      <SelectItem value="KG">KG (Quilos)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    Forma Acondicionamento *
                  </Label>
                  <Select
                    value={editingItem.forma_acondicionamento || 'Bombona'}
                    onValueChange={(val: string) =>
                      setEditingItem({ ...editingItem, forma_acondicionamento: val })
                    }
                  >
                    <SelectTrigger className="h-9 text-xs border-[#DCE5DC] bg-white font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bombona">Bombona</SelectItem>
                      <SelectItem value="Saco">Saco</SelectItem>
                      <SelectItem value="Tambor">Tambor</SelectItem>
                      <SelectItem value="Big Bag">Big Bag</SelectItem>
                      <SelectItem value="Frasco">Frasco</SelectItem>
                      <SelectItem value="Balde">Balde</SelectItem>
                      <SelectItem value="Galão">Galão</SelectItem>
                      <SelectItem value="Container / IBC">Container / IBC</SelectItem>
                      <SelectItem value="Caixa">Caixa</SelectItem>
                      <SelectItem value="Sache">Sache</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* NCM Específica da Embalagem e Registro MAPA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    NCM Específica da Embalagem (0000.00.00) *
                  </Label>
                  <Input
                    required
                    value={
                      editingItem.ncm_especifica || editingItem.ncm_padrao || editingItem.ncm || ''
                    }
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        ncm_especifica: e.target.value,
                        ncm_padrao: e.target.value,
                        ncm: e.target.value.replace(/\D/g, ''),
                      })
                    }
                    placeholder="Ex: 3808.93.24"
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

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">
                  Texto Original da Embalagem (Bula / Rótulo)
                </Label>
                <Input
                  value={editingItem.embalagem_original || editingItem.embalagem || ''}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      embalagem_original: e.target.value,
                      embalagem: e.target.value,
                    })
                  }
                  placeholder="Ex: 4x5 L bombona plástica homologada"
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">Princípio Ativo *</Label>
                  <Input
                    required
                    value={editingItem.principio_ativo || ''}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, principio_ativo: e.target.value })
                    }
                    className="h-9 text-xs border-[#DCE5DC]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    Fabricante / Titular
                  </Label>
                  <Input
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
                  Salvar Alterações
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
