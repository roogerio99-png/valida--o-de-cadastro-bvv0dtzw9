import React, { useEffect, useState, useTransition } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Database,
  Search,
  Download,
  Trash2,
  Edit2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { useRealtime } from '@/hooks/use-realtime'
import type {
  BaseMestreProduto,
  StatusValidacao,
  GrupoDuplicidade,
  RelatorioDuplicidades,
} from '@/types/agro'

export default function BaseMestre() {
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''

  const [produtos, setProdutos] = useState<BaseMestreProduto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialQuery)
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [, startTransition] = useTransition()

  // Seleção múltipla para exportação / exclusão em lote
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Modal de edição
  const [editingItem, setEditingItem] = useState<BaseMestreProduto | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  // Paginação
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Painel de Duplicidades
  const [duplicidadesOpen, setDuplicidadesOpen] = useState(false)
  const [loadingDuplicidades, setLoadingDuplicidades] = useState(false)
  const [relatorioDuplicidades, setRelatorioDuplicidades] = useState<RelatorioDuplicidades | null>(
    null,
  )
  const [filtroCriterio, setFiltroCriterio] = useState<string>('todos')
  const [resolvendoId, setResolvendoId] = useState<string | null>(null)

  const carregarProdutos = async () => {
    setLoading(true)
    try {
      const filters: string[] = []
      if (search.trim()) {
        const clean = search.trim().replace(/'/g, "\\'")
        filters.push(`(nome_produto ~ '${clean}' || ncm ~ '${clean}' || fabricante ~ '${clean}')`)
      }
      if (statusFilter !== 'todos') {
        filters.push(`status_validacao = '${statusFilter}'`)
      }

      const filterStr = filters.join(' && ')
      const res = await listarBaseMestre({
        page,
        perPage: 25,
        filter: filterStr,
        sort: '-created',
      })
      setProdutos(res.items)
      setTotalPages(res.totalPages || 1)
      setTotalCount(res.totalItems)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

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

  // Resolver duplicidade: Manter um registro e excluir os demais do grupo
  const handleManterUmExcluirOutros = async (grupo: GrupoDuplicidade, mantidoId: string) => {
    const mantido = grupo.registros.find((r) => r.id === mantidoId)
    const outros = grupo.registros.filter((r) => r.id !== mantidoId)

    if (
      !confirm(
        `Confirma MANTER o produto "${mantido?.nome_produto || mantidoId}" e EXCLUIR os outros ${
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

  // Marcar todos os registros do grupo como pendentes para auditoria manual
  const handleMarcarGrupoPendente = async (grupo: GrupoDuplicidade) => {
    setResolvendoId(grupo.id)
    try {
      for (const r of grupo.registros) {
        await atualizarProdutoBaseMestre(r.id, { status_validacao: 'pendente' })
      }
      toast({
        title: 'Status Atualizado',
        description: `Todos os ${grupo.registros.length} registros foram marcados como "Pendente" para revisão.`,
      })
      await carregarDuplicidades()
      await carregarProdutos()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao atualizar status.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setResolvendoId(null)
    }
  }

  // Exportar relatório de duplicidades em CSV
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
      'Nome_Produto',
      'NCM',
      'Embalagem',
      'Principio_Ativo',
      'Fabricante',
      'Registro_MAPA',
      'Status_Validacao',
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
            `"${r.nome_produto.replace(/"/g, '""')}"`,
            `"${r.ncm}"`,
            `"${r.embalagem}"`,
            `"${r.principio_ativo.replace(/"/g, '""')}"`,
            `"${r.fabricante.replace(/"/g, '""')}"`,
            `"${r.registro_mapa}"`,
            `"${r.status_validacao}"`,
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

    toast({
      title: 'Download Concluído',
      description: 'O CSV com o relatório de duplicidades foi gerado.',
    })
  }

  useEffect(() => {
    carregarProdutos()
  }, [page, search, statusFilter])

  useRealtime('base_mestre', () => carregarProdutos())

  // Selecionar todos os visíveis
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(produtos.map((p) => p.id))
    } else {
      setSelectedIds([])
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  // Exclusão em Lote
  const handleBulkDelete = async () => {
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

  // Exportar selecionados ou todos os visíveis para CSV
  const handleExportCSV = () => {
    const listToExport =
      selectedIds.length > 0 ? produtos.filter((p) => selectedIds.includes(p.id)) : produtos

    if (listToExport.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum produto para exportar.' })
      return
    }

    const headers = [
      'Nome Produto',
      'NCM',
      'Embalagem',
      'Princípio Ativo',
      'Fabricante',
      'Registro MAPA',
      'Concentração',
      'Unidade',
      'Status Validação',
    ]

    const rows = listToExport.map((p) => [
      `"${p.nome_produto.replace(/"/g, '""')}"`,
      `"${p.ncm}"`,
      `"${p.embalagem}"`,
      `"${p.principio_ativo.replace(/"/g, '""')}"`,
      `"${p.fabricante.replace(/"/g, '""')}"`,
      `"${p.registro_mapa}"`,
      `"${p.concentracao}"`,
      `"${p.unidade_concentracao || ''}"`,
      `"${p.status_validacao}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `base_mestre_produtos_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Abrir Modal de Edição
  const handleOpenEdit = (p: BaseMestreProduto) => {
    setEditingItem({ ...p })
    setIsEditModalOpen(true)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem) return
    setSavingEdit(true)
    try {
      await atualizarProdutoBaseMestre(editingItem.id, {
        nome_produto: editingItem.nome_produto,
        ncm: editingItem.ncm,
        embalagem: editingItem.embalagem,
        principio_ativo: editingItem.principio_ativo,
        fabricante: editingItem.fabricante,
        registro_mapa: editingItem.registro_mapa,
        concentracao: Number(editingItem.concentracao),
        unidade_concentracao: editingItem.unidade_concentracao,
        status_validacao: editingItem.status_validacao,
      })
      toast({ title: 'Produto Atualizado', description: 'Alterações gravadas com sucesso.' })
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
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <Database className="w-6 h-6 text-[#1B5E20]" />
            <span>Base Mestre de Produtos</span>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Repositório central de insumos agropecuários homologados ({totalCount} cadastros).
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
              ? `Exportar Selecionados (${selectedIds.length})`
              : 'Exportar CSV'}
          </Button>
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
                  Análise multicritério: (a) NCM + Princípio Ativo; (b) Registro MAPA idêntico; (c)
                  Nome Comercial + NCM.
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
              Nome + NCM
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
                Princípio Ativo únicos.
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

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isResolving}
                            onClick={() => handleMarcarGrupoPendente(grupo)}
                            className="text-[11px] h-7 text-amber-800 border-amber-200 hover:bg-amber-50"
                          >
                            Marcar Todos p/ Revisão
                          </Button>
                        </div>
                      </div>

                      {/* Lista dos Produtos no Grupo */}
                      <div className="space-y-1.5">
                        {grupo.registros.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-[#F5F7F1]/80 hover:bg-[#F5F7F1] text-xs transition-colors"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1">
                              <div>
                                <span className="block font-bold text-[#1C2B1C]">
                                  {item.nome_produto}
                                </span>
                                <span className="text-[10px] font-mono text-[#1B5E20]">
                                  NCM: {item.ncm || '—'}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[11px] text-[#1C2B1C]">
                                  P.A.: {item.principio_ativo || '—'}
                                </span>
                                <span className="text-[10px] text-[#5A6D5A]">
                                  Emb: {item.embalagem || '—'}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[11px] text-[#1C2B1C]">
                                  Fab: {item.fabricante || 'Não Informado'}
                                </span>
                                <span className="text-[10px] font-mono text-[#5A6D5A]">
                                  MAPA: {item.registro_mapa || '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  className={`text-[9px] py-0 px-1.5 ${
                                    item.status_validacao === 'aprovado'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : item.status_validacao === 'reprovado'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {item.status_validacao}
                                </Badge>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              disabled={isResolving}
                              onClick={() => handleManterUmExcluirOutros(grupo, item.id)}
                              className="text-[10px] h-7 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-medium px-2.5 rounded-lg whitespace-nowrap"
                            >
                              Manter Este e Excluir Outros
                            </Button>
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

      {/* Filtros e Busca */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6D5A]" />
            <Input
              value={search}
              onChange={(e) => {
                const val = e.target.value
                startTransition(() => {
                  setSearch(val)
                  setPage(1)
                })
              }}
              placeholder="Buscar por nome do produto, NCM ou fabricante..."
              className="pl-9 text-xs h-10 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
            />
          </div>

          <div className="w-full md:w-56">
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-10 text-xs border-[#DCE5DC]">
                <SelectValue placeholder="Status de Validação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="aprovado">Apenas Aprovados</SelectItem>
                <SelectItem value="reprovado">Apenas Reprovados</SelectItem>
                <SelectItem value="pendente">Apenas Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Tabela da Base Mestre */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-3 w-8">
                  <input
                    type="checkbox"
                    className="rounded border-[#DCE5DC] text-[#1B5E20] focus:ring-0 cursor-pointer"
                    checked={selectedIds.length > 0 && selectedIds.length === produtos.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="py-3 px-3 font-semibold">Produto</th>
                <th className="py-3 px-3 font-semibold">NCM</th>
                <th className="py-3 px-3 font-semibold">Embalagem</th>
                <th className="py-3 px-3 font-semibold">Princípio Ativo</th>
                <th className="py-3 px-3 font-semibold">Fabricante</th>
                <th className="py-3 px-3 font-semibold">Reg. MAPA</th>
                <th className="py-3 px-3 font-semibold">Concentração</th>
                <th className="py-3 px-3 font-semibold">Situação</th>
                <th className="py-3 px-3 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando produtos da Base Mestre...
                  </td>
                </tr>
              ) : produtos.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhum produto cadastrado na Base Mestre com os critérios atuais.
                  </td>
                </tr>
              ) : (
                produtos.map((p) => {
                  const isSelected = selectedIds.includes(p.id)
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-[#F5F7F1]/50 transition-colors ${
                        isSelected ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          className="rounded border-[#DCE5DC] text-[#1B5E20] focus:ring-0 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(p.id)}
                        />
                      </td>
                      <td className="py-3 px-3 font-bold text-[#1C2B1C] max-w-[200px] truncate">
                        {p.nome_produto}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-[#1B5E20] whitespace-nowrap">
                        {p.ncm || '—'}
                      </td>
                      <td className="py-3 px-3 text-[#1C2B1C] whitespace-nowrap">
                        {p.embalagem || '—'}
                      </td>
                      <td className="py-3 px-3 text-[#1C2B1C] max-w-[160px] truncate">
                        {p.principio_ativo || '—'}
                      </td>
                      <td className="py-3 px-3 text-[#5A6D5A] max-w-[160px] truncate">
                        {p.fabricante || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#5A6D5A] whitespace-nowrap">
                        {p.registro_mapa || '—'}
                      </td>
                      <td className="py-3 px-3 text-[#1C2B1C] whitespace-nowrap">
                        {p.concentracao ? `${p.concentracao} ${p.unidade_concentracao || ''}` : '—'}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {p.status_validacao === 'aprovado' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 flex items-center gap-1 w-fit text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            Aprovado
                          </Badge>
                        ) : p.status_validacao === 'reprovado' ? (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-0 flex items-center gap-1 w-fit text-[10px]">
                            <XCircle className="w-3 h-3 text-red-700" />
                            Reprovado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-0 flex items-center gap-1 w-fit text-[10px]">
                            <Clock className="w-3 h-3 text-amber-700" />
                            Pendente
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(p)}
                          className="h-7 w-7 text-[#5A6D5A] hover:text-[#1B5E20] hover:bg-emerald-50"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-[#DCE5DC] text-xs text-[#5A6D5A]">
            <span>
              Página {page} de {totalPages} ({totalCount} registros)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-8 text-xs"
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 text-xs"
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL DE EDIÇÃO DE PRODUTO */}
      {/* ------------------------------------------------------------------ */}
      {editingItem && (
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#1C2B1C]">
                Editar Produto na Base Mestre
              </DialogTitle>
              <DialogDescription className="text-xs text-[#5A6D5A]">
                Atualize as especificações técnicas e o status de conformidade
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 py-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Nome Comercial *</Label>
                <Input
                  required
                  value={editingItem.nome_produto}
                  onChange={(e) => setEditingItem({ ...editingItem, nome_produto: e.target.value })}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">NCM *</Label>
                  <Input
                    required
                    value={editingItem.ncm}
                    onChange={(e) => setEditingItem({ ...editingItem, ncm: e.target.value })}
                    className="h-9 text-xs font-mono font-bold text-[#1B5E20] border-[#DCE5DC]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">Embalagem *</Label>
                  <Input
                    required
                    value={editingItem.embalagem}
                    onChange={(e) => setEditingItem({ ...editingItem, embalagem: e.target.value })}
                    className="h-9 text-xs border-[#DCE5DC]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Princípio Ativo *</Label>
                <Input
                  required
                  value={editingItem.principio_ativo}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, principio_ativo: e.target.value })
                  }
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Fabricante *</Label>
                <Input
                  required
                  value={editingItem.fabricante}
                  onChange={(e) => setEditingItem({ ...editingItem, fabricante: e.target.value })}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">Registro MAPA</Label>
                  <Input
                    value={editingItem.registro_mapa}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, registro_mapa: e.target.value })
                    }
                    className="h-9 text-xs border-[#DCE5DC]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">Status Validação</Label>
                  <Select
                    value={editingItem.status_validacao}
                    onValueChange={(val: StatusValidacao) =>
                      setEditingItem({ ...editingItem, status_validacao: val })
                    }
                  >
                    <SelectTrigger className="h-9 text-xs border-[#DCE5DC]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="reprovado">Reprovado</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
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
