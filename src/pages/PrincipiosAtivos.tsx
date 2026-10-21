import { useEffect, useState, useTransition } from 'react'
import {
  FlaskConical,
  Search,
  Loader2,
  Trash2,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Download,
  Plus,
  Edit,
  ShieldCheck,
  Scale,
  FileCheck2,
  AlertCircle,
  Package,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  listarPrincipiosAtivos,
  criarPrincipioAtivo,
  atualizarPrincipioAtivo,
  excluirPrincipioAtivo,
  sincronizarPrincipioAtivoEmCascata,
  contarProdutosVinculadosAoPrincipioAtivo,
} from '@/services/agroService'
import { ModalLimparBase } from '@/components/ModalLimparBase'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import type { DicionarioPrincipioAtivo } from '@/types/agro'

export function PrincipiosAtivos() {
  const { isAdmin } = useAuth()
  const { toast } = useToast()
  const [principios, setPrincipios] = useState<DicionarioPrincipioAtivo[]>([])
  const [contagensVinculados, setContagensVinculados] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [, startTransition] = useTransition()

  // Filtros rápidos
  const [nota2Filter, setNota2Filter] = useState<'todos' | 'SIM' | 'NÃO'>('todos')
  const [pisFilter, setPisFilter] = useState<'todos' | 'beneficiado' | 'condicional' | 'tributado'>(
    'todos',
  )

  // Linhas expandidas mostrando os 13 campos canônicos
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // Modal Limpeza Total
  const [modalLimparOpen, setModalLimparOpen] = useState(false)

  // Modal de Cadastro / Edição
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DicionarioPrincipioAtivo | null>(null)
  const [formData, setFormData] = useState({
    principio_ativo_chave: '',
    macro_grupo_subgrupo_padrao: '',
    nota_subpos_2: 'NÃO' as 'SIM' | 'NÃO',
    ncm_padrao_referencia: '',
    ncm_faixa1_ate_300g: '',
    ncm_faixa2_300g_a_7_5kg: '',
    ncm_faixa3_7_5kg_a_10kg: '',
    ncm_faixa4_acima_10kg: '',
    ncm_granel_tecnico: '',
    regra_tipi_embalagem: '',
    sistema_registro_mapa: '',
    enquadramento_pis_cofins: '',
    cst_recomendado: '',
  })
  const [savingForm, setSavingForm] = useState(false)

  // Estado de sincronização em cascata por linha
  const [sincronizandoId, setSincronizandoId] = useState<string | null>(null)

  // Paginação
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Formatar NCM 0000.00.00
  const formatarNcm = (val: string) => {
    const digitos = val.replace(/\D/g, '').slice(0, 8)
    if (digitos.length <= 4) return digitos
    if (digitos.length <= 6) return `${digitos.slice(0, 4)}.${digitos.slice(4)}`
    return `${digitos.slice(0, 4)}.${digitos.slice(4, 6)}.${digitos.slice(6, 8)}`
  }

  const carregarDados = async () => {
    setLoading(true)
    try {
      const filters: string[] = []
      if (search.trim()) {
        const clean = search.trim().replace(/'/g, "\\'")
        filters.push(
          `(principio_ativo_chave ~ '${clean}' || principio_ativo ~ '${clean}' || macro_grupo_subgrupo_padrao ~ '${clean}' || ncm_padrao_referencia ~ '${clean}')`,
        )
      }
      if (nota2Filter !== 'todos') {
        filters.push(`nota_subpos_2 = '${nota2Filter}'`)
      }
      if (pisFilter !== 'todos') {
        if (pisFilter === 'beneficiado') filters.push(`enquadramento_pis_cofins ~ 'Beneficiado'`)
        if (pisFilter === 'condicional') filters.push(`enquadramento_pis_cofins ~ 'Condicional'`)
        if (pisFilter === 'tributado') filters.push(`enquadramento_pis_cofins ~ 'Tributado'`)
      }

      const res = await listarPrincipiosAtivos({
        page,
        perPage: 25,
        filter: filters.join(' && ') || undefined,
        sort: 'principio_ativo_chave',
      })

      setPrincipios(res.items)
      setTotalPages(res.totalPages || 1)
      setTotalCount(res.totalItems)

      // Carregar contagem real de produtos vinculados para cada princípio ativo retornado
      const contagens: Record<string, number> = {}
      await Promise.all(
        res.items.map(async (pa) => {
          const total = await contarProdutosVinculadosAoPrincipioAtivo(pa.id)
          contagens[pa.id] = total
        }),
      )
      setContagensVinculados(contagens)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [page, search, nota2Filter, pisFilter])

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Sincronizar produtos vinculados em cascata (Rule Engine)
  const handleSincronizarCascata = async (pa: DicionarioPrincipioAtivo, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas administradores podem realizar esta ação.',
      })
      return
    }
    setSincronizandoId(pa.id)
    try {
      const res = await sincronizarPrincipioAtivoEmCascata(pa.id)
      toast({
        title: 'Propagação Concluída',
        description: `${res.atualizados} de ${res.total_vinculados} produto(s) atualizado(s) em cascata na Base Mestre.`,
      })
      // Atualiza contagem se necessário
      const novoTotal = await contarProdutosVinculadosAoPrincipioAtivo(pa.id)
      setContagensVinculados((prev) => ({ ...prev, [pa.id]: novoTotal }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao sincronizar em cascata.'
      toast({ variant: 'destructive', title: 'Erro de Sincronização', description: msg })
    } finally {
      setSincronizandoId(null)
    }
  }

  // Excluir com validação de integridade referencial (ON DELETE RESTRICT)
  const handleExcluir = async (pa: DicionarioPrincipioAtivo, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas administradores podem realizar esta ação.',
      })
      return
    }
    const vinculados = contagensVinculados[pa.id] || 0
    if (vinculados > 0) {
      toast({
        variant: 'destructive',
        title: 'Restrição de Integridade (ON DELETE RESTRICT)',
        description: `Não é permitido apagar "${pa.principio_ativo_chave || pa.principio_ativo}", pois existem ${vinculados} produto(s) vinculado(s) na Base Mestre.`,
      })
      return
    }

    if (
      !confirm(
        `Confirma a exclusão permanente do princípio ativo "${pa.principio_ativo_chave || pa.principio_ativo}"?`,
      )
    ) {
      return
    }

    try {
      await excluirPrincipioAtivo(pa.id)
      toast({
        title: 'Princípio Ativo Excluído',
        description: 'O registro foi removido com sucesso da Matriz.',
      })
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir princípio ativo.'
      toast({ variant: 'destructive', title: 'Erro de Integridade', description: msg })
    }
  }

  // Abrir Modal de Criação / Edição
  const handleOpenForm = (pa?: DicionarioPrincipioAtivo, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (pa) {
      setEditingItem(pa)
      setFormData({
        principio_ativo_chave: pa.principio_ativo_chave || pa.principio_ativo || '',
        macro_grupo_subgrupo_padrao:
          pa.macro_grupo_subgrupo_padrao || (pa.classe ? `Defensivos — ${pa.classe}` : ''),
        nota_subpos_2: pa.nota_subpos_2 === 'SIM' ? 'SIM' : 'NÃO',
        ncm_padrao_referencia: pa.ncm_padrao_referencia || '',
        ncm_faixa1_ate_300g: pa.ncm_faixa1_ate_300g || pa.ncm_padrao_referencia || '',
        ncm_faixa2_300g_a_7_5kg: pa.ncm_faixa2_300g_a_7_5kg || pa.ncm_padrao_referencia || '',
        ncm_faixa3_7_5kg_a_10kg: pa.ncm_faixa3_7_5kg_a_10kg || pa.ncm_padrao_referencia || '',
        ncm_faixa4_acima_10kg: pa.ncm_faixa4_acima_10kg || pa.ncm_padrao_referencia || '',
        ncm_granel_tecnico: pa.ncm_granel_tecnico || pa.ncm_padrao_referencia || '',
        regra_tipi_embalagem: pa.regra_tipi_embalagem || '',
        sistema_registro_mapa:
          pa.sistema_registro_mapa || 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
        enquadramento_pis_cofins:
          pa.enquadramento_pis_cofins ||
          'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real pós-Abr/26',
        cst_recomendado:
          pa.cst_recomendado || 'Saída: CST 06 (c/ Ajuste M220/M620) | Entrada: CST 73',
      })
    } else {
      setEditingItem(null)
      setFormData({
        principio_ativo_chave: '',
        macro_grupo_subgrupo_padrao: 'Defensivos — Herbicida',
        nota_subpos_2: 'NÃO',
        ncm_padrao_referencia: '3808.93.29',
        ncm_faixa1_ate_300g: '3808.93.29',
        ncm_faixa2_300g_a_7_5kg: '3808.93.29',
        ncm_faixa3_7_5kg_a_10kg: '3808.93.29',
        ncm_faixa4_acima_10kg: '3808.93.29',
        ncm_granel_tecnico: '3808.93.19',
        regra_tipi_embalagem: 'Posição 38.08 TIPI: Embalagem comercial agrícola',
        sistema_registro_mapa: 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
        enquadramento_pis_cofins:
          'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real pós-Abr/26',
        cst_recomendado: 'Saída: CST 06 (c/ Ajuste M220/M620) | Entrada: CST 73',
      })
    }
    setFormModalOpen(true)
  }

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas administradores podem realizar esta ação.',
      })
      return
    }
    if (!formData.principio_ativo_chave.trim()) {
      toast({
        variant: 'destructive',
        title: 'Campo Obrigatório',
        description: 'Informe o Princípio Ativo / Chave.',
      })
      return
    }

    setSavingForm(true)
    try {
      const payload: Partial<DicionarioPrincipioAtivo> = {
        principio_ativo_chave: formData.principio_ativo_chave.trim().toUpperCase(),
        macro_grupo_subgrupo_padrao: formData.macro_grupo_subgrupo_padrao.trim(),
        nota_subpos_2: formData.nota_subpos_2,
        ncm_padrao_referencia: formatarNcm(formData.ncm_padrao_referencia),
        ncm_faixa1_ate_300g: formatarNcm(formData.ncm_faixa1_ate_300g),
        ncm_faixa2_300g_a_7_5kg: formatarNcm(formData.ncm_faixa2_300g_a_7_5kg),
        ncm_faixa3_7_5kg_a_10kg: formatarNcm(formData.ncm_faixa3_7_5kg_a_10kg),
        ncm_faixa4_acima_10kg: formatarNcm(formData.ncm_faixa4_acima_10kg),
        ncm_granel_tecnico: formatarNcm(formData.ncm_granel_tecnico),
        regra_tipi_embalagem: formData.regra_tipi_embalagem.trim(),
        sistema_registro_mapa: formData.sistema_registro_mapa.trim(),
        enquadramento_pis_cofins: formData.enquadramento_pis_cofins.trim(),
        cst_recomendado: formData.cst_recomendado.trim(),
        // Legado
        principio_ativo: formData.principio_ativo_chave.trim().toUpperCase(),
        status: 'Ativo',
      }

      if (editingItem) {
        await atualizarPrincipioAtivo(editingItem.id, payload)
        toast({
          title: 'Matriz Atualizada',
          description:
            'Registro salvo com sucesso. As regras foram propagadas em cascata para os produtos vinculados.',
        })
      } else {
        await criarPrincipioAtivo(payload)
        toast({
          title: 'Princípio Ativo Criado',
          description: 'Novo registro de 13 campos canônicos cadastrado na Matriz.',
        })
      }

      setFormModalOpen(false)
      carregarDados()
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Falha ao salvar na Matriz de Princípios Ativos.'
      toast({ variant: 'destructive', title: 'Erro de Gravação', description: msg })
    } finally {
      setSavingForm(false)
    }
  }

  // Exportar 13 colunas canônicas em CSV
  const handleExportCSV = () => {
    if (principios.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum princípio ativo para exportar.' })
      return
    }

    const headers = [
      'principio_ativo_chave',
      'macro_grupo_subgrupo_padrao',
      'nota_subpos_2',
      'ncm_padrao_referencia',
      'ncm_faixa1_ate_300g',
      'ncm_faixa2_300g_a_7_5kg',
      'ncm_faixa3_7_5kg_a_10kg',
      'ncm_faixa4_acima_10kg',
      'ncm_granel_tecnico',
      'regra_tipi_embalagem',
      'sistema_registro_mapa',
      'enquadramento_pis_cofins',
      'cst_recomendado',
      'total_produtos_vinculados',
    ]

    const rows = principios.map((p) => {
      const count = contagensVinculados[p.id] || 0
      return [
        `"${(p.principio_ativo_chave || p.principio_ativo || '').replace(/"/g, '""')}"`,
        `"${(p.macro_grupo_subgrupo_padrao || p.classe || '').replace(/"/g, '""')}"`,
        `"${p.nota_subpos_2 || 'NÃO'}"`,
        `"${p.ncm_padrao_referencia || ''}"`,
        `"${p.ncm_faixa1_ate_300g || ''}"`,
        `"${p.ncm_faixa2_300g_a_7_5kg || ''}"`,
        `"${p.ncm_faixa3_7_5kg_a_10kg || ''}"`,
        `"${p.ncm_faixa4_acima_10kg || ''}"`,
        `"${p.ncm_granel_tecnico || ''}"`,
        `"${(p.regra_tipi_embalagem || '').replace(/"/g, '""')}"`,
        `"${(p.sistema_registro_mapa || '').replace(/"/g, '""')}"`,
        `"${(p.enquadramento_pis_cofins || '').replace(/"/g, '""')}"`,
        `"${(p.cst_recomendado || '').replace(/"/g, '""')}"`,
        count,
      ].join(';')
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `matriz_principios_ativos_13_campos_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Download Concluído',
      description: 'O CSV com os 13 campos canônicos da Matriz foi gerado.',
    })
  }

  // Helper de badge PIS/COFINS
  const renderBadgePis = (txt?: string) => {
    const s = String(txt || '').toLowerCase()
    if (s.includes('beneficiado')) {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] font-semibold">
          Beneficiado
        </Badge>
      )
    }
    if (s.includes('condicional')) {
      return (
        <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] font-semibold">
          Condicional
        </Badge>
      )
    }
    if (s.includes('tributado')) {
      return (
        <Badge className="bg-red-100 text-red-800 border-0 text-[10px] font-semibold">
          Tributado
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-[10px] text-gray-700">
        {txt || 'Geral'}
      </Badge>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-[#1B5E20]" />
            <span>Matriz Canônica de Princípios Ativos (13 Campos)</span>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Rule Engine Químico-Fiscal (v2.5.0): governa a classificação NCM por 4 faixas de
            embalagem, Nota 2 do Cap. 38, TIPI e regime PIS/COFINS com propagação em cascata (
            {totalCount} princípios ativos).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => handleOpenForm()}
              className="text-xs h-9 bg-[#1B5E20] hover:bg-[#2E7D32] text-white shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Novo Princípio Ativo
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs h-9 border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50 hover:text-[#1B5E20]"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV (13 Colunas)
          </Button>

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalLimparOpen(true)}
              className="text-xs h-9 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              title="Apaga a matriz respeitando a integridade referencial ON DELETE RESTRICT"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5 text-red-600" />
              Limpar Base
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros com Busca e Enums */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
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
              placeholder="Pesquisar por Princípio Ativo (chave), Macro/Sub-Grupo ou NCM Padrão..."
              className="pl-9 text-xs h-10 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Filtro Nota 2 */}
            <div className="flex items-center gap-1 bg-[#F5F7F1] p-1 rounded-xl border border-[#DCE5DC]">
              <span className="text-[11px] text-[#5A6D5A] px-2 font-medium">Nota 2:</span>
              <button
                onClick={() => {
                  setNota2Filter('todos')
                  setPage(1)
                }}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  nota2Filter === 'todos'
                    ? 'bg-white shadow-xs font-bold text-[#1B5E20]'
                    : 'text-[#5A6D5A]'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => {
                  setNota2Filter('SIM')
                  setPage(1)
                }}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  nota2Filter === 'SIM' ? 'bg-amber-100 text-amber-900 font-bold' : 'text-[#5A6D5A]'
                }`}
              >
                SIM
              </button>
              <button
                onClick={() => {
                  setNota2Filter('NÃO')
                  setPage(1)
                }}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  nota2Filter === 'NÃO'
                    ? 'bg-white shadow-xs font-bold text-[#1B5E20]'
                    : 'text-[#5A6D5A]'
                }`}
              >
                NÃO
              </button>
            </div>

            {/* Filtro PIS/COFINS */}
            <div className="flex items-center gap-1 bg-[#F5F7F1] p-1 rounded-xl border border-[#DCE5DC]">
              <span className="text-[11px] text-[#5A6D5A] px-2 font-medium">PIS/COFINS:</span>
              {(['todos', 'beneficiado', 'condicional', 'tributado'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setPisFilter(opt)
                    setPage(1)
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors ${
                    pisFilter === opt
                      ? 'bg-white shadow-xs font-bold text-[#1B5E20]'
                      : 'text-[#5A6D5A]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Tabela da Matriz Canônica */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-3 font-semibold">Princípio Ativo (Chave Canônica)</th>
                <th className="py-3 px-3 font-semibold">Macro / Sub-Grupo</th>
                <th className="py-3 px-3 font-semibold">Nota 2 Cap. 38</th>
                <th className="py-3 px-3 font-semibold">NCM Padrão Referência</th>
                <th className="py-3 px-3 font-semibold">Enquadramento PIS/COFINS</th>
                <th className="py-3 px-3 font-semibold text-center">Produtos Vinculados</th>
                <th className="py-3 px-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Consultando Matriz Canônica de Princípios Ativos...
                  </td>
                </tr>
              ) : principios.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhum princípio ativo encontrado com os filtros informados.
                  </td>
                </tr>
              ) : (
                principios.map((pa) => {
                  const isExpanded = !!expandedRows[pa.id]
                  const vinculados = contagensVinculados[pa.id] || 0
                  const chave = pa.principio_ativo_chave || pa.principio_ativo || '—'
                  const isNota2 = pa.nota_subpos_2 === 'SIM'

                  return (
                    <tr key={pa.id} className="group">
                      <td colSpan={8} className="p-0">
                        {/* Linha Principal */}
                        <div
                          onClick={() => toggleExpand(pa.id)}
                          className="flex items-center hover:bg-emerald-50/50 cursor-pointer transition-colors py-3 px-3 border-b border-[#F0F4F0]"
                        >
                          <div className="w-8 flex-shrink-0 text-[#5A6D5A]">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-[#1B5E20]" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </div>

                          {/* Princípio Ativo Chave */}
                          <div className="flex-1 min-w-[200px] pr-2">
                            <div className="font-bold text-[#1C2B1C] flex items-center gap-1.5">
                              <FlaskConical className="w-3.5 h-3.5 text-[#1B5E20] flex-shrink-0" />
                              <span className="font-mono tracking-tight">{chave}</span>
                            </div>
                            <span className="text-[10px] text-[#5A6D5A] block mt-0.5">
                              ID: {pa.id} • {pa.sistema_registro_mapa || 'AGROFIT'}
                            </span>
                          </div>

                          {/* Macro/Sub-grupo */}
                          <div className="w-[180px] text-[#1C2B1C] pr-2 truncate">
                            {pa.macro_grupo_subgrupo_padrao ||
                              pa.classe ||
                              'Defensivos — Herbicida'}
                          </div>

                          {/* Nota 2 Cap 38 */}
                          <div className="w-[100px] pr-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold border-0 ${
                                isNota2
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {isNota2 ? 'SIM (Nota 2)' : 'NÃO'}
                            </Badge>
                          </div>

                          {/* NCM Padrão */}
                          <div className="w-[130px] pr-2 font-mono font-semibold text-[#1B5E20]">
                            {pa.ncm_padrao_referencia || '—'}
                          </div>

                          {/* Enquadramento PIS/COFINS */}
                          <div className="w-[160px] pr-2">
                            {renderBadgePis(pa.enquadramento_pis_cofins)}
                          </div>

                          {/* Produtos Vinculados (Contagem Real via princípio_ativo_id) */}
                          <div className="w-[130px] text-center pr-2">
                            <a
                              href={`/base-mestre?paId=${encodeURIComponent(pa.id)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-semibold transition-colors"
                              title="Filtrar Base Mestre por este Princípio Ativo"
                            >
                              <Package className="w-3 h-3 text-[#1B5E20]" />
                              <span>
                                {vinculados} produto{vinculados !== 1 ? 's' : ''}
                              </span>
                              <ExternalLink className="w-2.5 h-2.5 text-emerald-600 ml-0.5" />
                            </a>
                          </div>

                          {/* Ações */}
                          <div className="w-[150px] flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Sincronizar regras deste Princípio Ativo para os produtos vinculados em cascata"
                              disabled={sincronizandoId === pa.id}
                              onClick={(e) => handleSincronizarCascata(pa, e)}
                              className="h-7 w-7 text-emerald-700 hover:bg-emerald-100"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${
                                  sincronizandoId === pa.id ? 'animate-spin text-[#1B5E20]' : ''
                                }`}
                              />
                            </Button>

                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar registro da Matriz"
                                onClick={(e) => handleOpenForm(pa, e)}
                                className="h-7 w-7 text-gray-700 hover:bg-gray-100"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title={
                                  vinculados > 0
                                    ? 'Exclusão bloqueada: existem produtos vinculados (ON DELETE RESTRICT)'
                                    : 'Excluir Princípio Ativo'
                                }
                                onClick={(e) => handleExcluir(pa, e)}
                                className={`h-7 w-7 ${
                                  vinculados > 0
                                    ? 'text-gray-300 hover:bg-transparent cursor-not-allowed'
                                    : 'text-red-600 hover:bg-red-50'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* PAINEL DE EXPANSÃO: OS 13 CAMPOS CANÔNICOS AGRUPADOS EM 3 BLOCOS */}
                        {isExpanded && (
                          <div className="p-4 bg-[#F9FAF8] border-b border-[#DCE5DC] space-y-4 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between border-b border-[#E3E8E3] pb-2">
                              <span className="text-[11px] font-bold text-[#1C2B1C] uppercase tracking-wider flex items-center gap-1.5">
                                <FlaskConical className="w-3.5 h-3.5 text-[#1B5E20]" />
                                Contrato Canônico de 13 Campos Químico-Fiscais (v2.5.0)
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => handleSincronizarCascata(pa, e)}
                                  disabled={sincronizandoId === pa.id}
                                  className="h-7 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                                >
                                  <RefreshCw
                                    className={`w-3 h-3 mr-1 ${
                                      sincronizandoId === pa.id ? 'animate-spin' : ''
                                    }`}
                                  />
                                  Sincronizar Produtos Vinculados
                                </Button>
                                <a
                                  href={`/base-mestre?paId=${encodeURIComponent(pa.id)}`}
                                  className="inline-flex items-center gap-1 text-xs text-[#1B5E20] font-semibold hover:underline"
                                >
                                  <span>Ver {vinculados} produtos na Base Mestre</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              {/* BLOCO (A): NCMs POR FAIXA DE EMBALAGEM + GRANEL + REGRA TIPI */}
                              <div className="p-3.5 bg-white rounded-xl border border-[#DCE5DC] shadow-xs space-y-2.5">
                                <div className="flex items-center gap-1.5 text-[#1B5E20] font-bold text-[11px] uppercase tracking-wide">
                                  <Scale className="w-3.5 h-3.5" />
                                  <span>Faixas NCM & Regra TIPI</span>
                                </div>

                                <div className="space-y-1.5 font-mono text-[11px]">
                                  <div className="flex justify-between py-1 border-b border-gray-100">
                                    <span className="text-[#5A6D5A] font-sans">
                                      Faixa 1 (≤ 300g/mL):
                                    </span>
                                    <strong className="text-[#1C2B1C]">
                                      {pa.ncm_faixa1_ate_300g || '—'}
                                    </strong>
                                  </div>
                                  <div className="flex justify-between py-1 border-b border-gray-100">
                                    <span className="text-[#5A6D5A] font-sans">
                                      Faixa 2 (300g a 7,5kg/L):
                                    </span>
                                    <strong className="text-[#1C2B1C]">
                                      {pa.ncm_faixa2_300g_a_7_5kg || '—'}
                                    </strong>
                                  </div>
                                  <div className="flex justify-between py-1 border-b border-gray-100">
                                    <span className="text-[#5A6D5A] font-sans">
                                      Faixa 3 (7,5kg a 10kg/L):
                                    </span>
                                    <strong className="text-[#1C2B1C]">
                                      {pa.ncm_faixa3_7_5kg_a_10kg || '—'}
                                    </strong>
                                  </div>
                                  <div className="flex justify-between py-1 border-b border-gray-100">
                                    <span className="text-[#5A6D5A] font-sans">
                                      Faixa 4 (&gt; 10kg/L):
                                    </span>
                                    <strong className="text-[#1C2B1C]">
                                      {pa.ncm_faixa4_acima_10kg || '—'}
                                    </strong>
                                  </div>
                                  <div className="flex justify-between py-1 border-b border-gray-100">
                                    <span className="text-[#5A6D5A] font-sans">
                                      Granel / Técnico:
                                    </span>
                                    <strong className="text-[#1C2B1C]">
                                      {pa.ncm_granel_tecnico || '—'}
                                    </strong>
                                  </div>
                                </div>

                                <div className="pt-2 text-[11px]">
                                  <span className="text-[#5A6D5A] block font-semibold mb-0.5">
                                    Fundamentação Legal TIPI:
                                  </span>
                                  <p className="text-[#1C2B1C] bg-[#F5F7F1] p-2 rounded-lg border border-[#E3E8E3] leading-relaxed">
                                    {pa.regra_tipi_embalagem || 'Não informada'}
                                  </p>
                                </div>
                              </div>

                              {/* BLOCO (B): ENQUADRAMENTO TRIBUTÁRIO */}
                              <div className="p-3.5 bg-white rounded-xl border border-[#DCE5DC] shadow-xs space-y-2.5">
                                <div className="flex items-center gap-1.5 text-[#1B5E20] font-bold text-[11px] uppercase tracking-wide">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Enquadramento Tributário</span>
                                </div>

                                <div>
                                  <span className="text-[#5A6D5A] text-[10px] block font-semibold">
                                    Status PIS/COFINS:
                                  </span>
                                  <div className="mt-1">
                                    {renderBadgePis(pa.enquadramento_pis_cofins)}
                                  </div>
                                  <p className="text-[11px] text-[#1C2B1C] mt-1.5 bg-[#F5F7F1] p-2 rounded-lg border border-[#E3E8E3]">
                                    {pa.enquadramento_pis_cofins || 'Regime Geral'}
                                  </p>
                                </div>

                                <div>
                                  <span className="text-[#5A6D5A] text-[10px] block font-semibold">
                                    CST Recomendado (Saída / Entrada):
                                  </span>
                                  <p className="text-[11px] font-mono text-[#1C2B1C] mt-1 bg-[#F5F7F1] p-2 rounded-lg border border-[#E3E8E3]">
                                    {pa.cst_recomendado || 'Saída: CST 06 | Entrada: CST 73'}
                                  </p>
                                </div>
                              </div>

                              {/* BLOCO (C): RASTREABILIDADE MAPA E METADADOS */}
                              <div className="p-3.5 bg-white rounded-xl border border-[#DCE5DC] shadow-xs space-y-2.5">
                                <div className="flex items-center gap-1.5 text-[#1B5E20] font-bold text-[11px] uppercase tracking-wide">
                                  <FileCheck2 className="w-3.5 h-3.5" />
                                  <span>Rastreabilidade MAPA & Regras</span>
                                </div>

                                <div>
                                  <span className="text-[#5A6D5A] text-[10px] block font-semibold">
                                    Sistema de Registro MAPA / Norma:
                                  </span>
                                  <p className="text-[11px] text-[#1C2B1C] mt-1 bg-[#F5F7F1] p-2 rounded-lg border border-[#E3E8E3]">
                                    {pa.sistema_registro_mapa || 'AGROFIT/MAPA — Produto Formulado'}
                                  </p>
                                </div>

                                <div>
                                  <span className="text-[#5A6D5A] text-[10px] block font-semibold">
                                    Papel Arquitetural (Rule Engine):
                                  </span>
                                  <p className="text-[11px] text-[#5A6D5A] mt-1 leading-relaxed">
                                    Este registro governa centralizadamente {vinculados} produto(s)
                                    comercial(is). Qualquer alteração tributária aqui é propagada
                                    automaticamente para toda a Base Mestre (Trigger ON UPDATE
                                    CASCADE).
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
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
              Página {page} de {totalPages} ({totalCount} princípios ativos)
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
      {/* MODAL DE CADASTRO / EDIÇÃO DOS 13 CAMPOS CANÔNICOS */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={formModalOpen} onOpenChange={setFormModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-[#1B5E20]" />
              <span>
                {editingItem
                  ? 'Editar Princípio Ativo (13 Campos)'
                  : 'Novo Princípio Ativo (13 Campos)'}
              </span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveForm} className="space-y-4 text-xs">
            {/* Campo 1: Chave Canônica */}
            <div>
              <label className="block text-[11px] font-semibold text-[#1C2B1C] mb-1">
                1. Princípio Ativo / Chave Canônica * (normalizado em maiúsculas)
              </label>
              <Input
                value={formData.principio_ativo_chave}
                onChange={(e) =>
                  setFormData({ ...formData, principio_ativo_chave: e.target.value.toUpperCase() })
                }
                placeholder="Ex: LAMBDA-CIALOTRINA 250 G/L CS"
                className="font-mono uppercase h-9 text-xs"
                required
              />
            </div>

            {/* Campo 2 e 3: Macro/Subgrupo e Nota 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#1C2B1C] mb-1">
                  2. Macro-Grupo e Sub-Grupo Padrão
                </label>
                <Input
                  value={formData.macro_grupo_subgrupo_padrao}
                  onChange={(e) =>
                    setFormData({ ...formData, macro_grupo_subgrupo_padrao: e.target.value })
                  }
                  placeholder="Ex: Defensivos — Inseticida / Acaricida"
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#1C2B1C] mb-1">
                  3. Nota Subposições 2 Cap. 38?
                </label>
                <select
                  value={formData.nota_subpos_2}
                  onChange={(e) =>
                    setFormData({ ...formData, nota_subpos_2: e.target.value as 'SIM' | 'NÃO' })
                  }
                  className="w-full h-9 px-3 rounded-md border border-[#DCE5DC] bg-white text-xs focus:ring-1 focus:ring-[#1B5E20]"
                >
                  <option value="NÃO">NÃO</option>
                  <option value="SIM">SIM (Lambda-Cialotrina, Bifentrina, etc.)</option>
                </select>
              </div>
            </div>

            {/* Campos 4, 5, 6, 7, 8, 9: NCMs com máscara 0000.00.00 */}
            <div className="p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC] space-y-3">
              <span className="font-bold text-[11px] text-[#1B5E20] block">
                Classificação NCM por Faixas de Embalagem (Máscara 0000.00.00)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono">
                <div>
                  <label className="block text-[10px] font-medium text-[#5A6D5A] mb-1">
                    4. NCM Padrão (&gt; 10kg/L)
                  </label>
                  <Input
                    value={formData.ncm_padrao_referencia}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ncm_padrao_referencia: formatarNcm(e.target.value),
                      })
                    }
                    placeholder="0000.00.00"
                    maxLength={10}
                    className="h-8 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-[#5A6D5A] mb-1">
                    5. Faixa 1 (≤ 300g/mL)
                  </label>
                  <Input
                    value={formData.ncm_faixa1_ate_300g}
                    onChange={(e) =>
                      setFormData({ ...formData, ncm_faixa1_ate_300g: formatarNcm(e.target.value) })
                    }
                    placeholder="0000.00.00"
                    maxLength={10}
                    className="h-8 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-[#5A6D5A] mb-1">
                    6. Faixa 2 (300g a 7,5kg/L)
                  </label>
                  <Input
                    value={formData.ncm_faixa2_300g_a_7_5kg}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ncm_faixa2_300g_a_7_5kg: formatarNcm(e.target.value),
                      })
                    }
                    placeholder="0000.00.00"
                    maxLength={10}
                    className="h-8 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-[#5A6D5A] mb-1">
                    7. Faixa 3 (7,5kg a 10kg/L)
                  </label>
                  <Input
                    value={formData.ncm_faixa3_7_5kg_a_10kg}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ncm_faixa3_7_5kg_a_10kg: formatarNcm(e.target.value),
                      })
                    }
                    placeholder="0000.00.00"
                    maxLength={10}
                    className="h-8 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-[#5A6D5A] mb-1">
                    8. Faixa 4 (&gt; 10kg/L)
                  </label>
                  <Input
                    value={formData.ncm_faixa4_acima_10kg}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ncm_faixa4_acima_10kg: formatarNcm(e.target.value),
                      })
                    }
                    placeholder="0000.00.00"
                    maxLength={10}
                    className="h-8 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-[#5A6D5A] mb-1">
                    9. NCM Granel / Técnico
                  </label>
                  <Input
                    value={formData.ncm_granel_tecnico}
                    onChange={(e) =>
                      setFormData({ ...formData, ncm_granel_tecnico: formatarNcm(e.target.value) })
                    }
                    placeholder="0000.00.00"
                    maxLength={10}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Campo 10: Regra TIPI */}
            <div>
              <label className="block text-[11px] font-semibold text-[#1C2B1C] mb-1">
                10. Regra de Embalagem TIPI (Fundamentação Legal)
              </label>
              <textarea
                value={formData.regra_tipi_embalagem}
                onChange={(e) => setFormData({ ...formData, regra_tipi_embalagem: e.target.value })}
                rows={2}
                placeholder="Ex: Nota Subpos. 2 Cap. 38 (SC COSIT 98.042/22)"
                className="w-full p-2.5 rounded-md border border-[#DCE5DC] bg-white text-xs focus:ring-1 focus:ring-[#1B5E20]"
              />
            </div>

            {/* Campos 11, 12, 13: MAPA, PIS/COFINS, CST */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#1C2B1C] mb-1">
                  11. Sistema Registro MAPA
                </label>
                <Input
                  value={formData.sistema_registro_mapa}
                  onChange={(e) =>
                    setFormData({ ...formData, sistema_registro_mapa: e.target.value })
                  }
                  placeholder="Ex: AGROFIT/MAPA"
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#1C2B1C] mb-1">
                  12. Enquadramento PIS/COFINS
                </label>
                <Input
                  value={formData.enquadramento_pis_cofins}
                  onChange={(e) =>
                    setFormData({ ...formData, enquadramento_pis_cofins: e.target.value })
                  }
                  placeholder="Ex: Beneficiado (Lei 10.925/04)"
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#1C2B1C] mb-1">
                  13. CST Recomendado
                </label>
                <Input
                  value={formData.cst_recomendado}
                  onChange={(e) => setFormData({ ...formData, cst_recomendado: e.target.value })}
                  placeholder="Ex: Saída: CST 06 | Entrada: CST 73"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormModalOpen(false)}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingForm}
                className="h-9 text-xs bg-[#1B5E20] hover:bg-[#2E7D32] text-white"
              >
                {savingForm ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Salvando e Propagando...
                  </>
                ) : (
                  <span>Salvar na Matriz</span>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL DE LIMPEZA COM PROTEÇÃO ON DELETE RESTRICT */}
      {/* ------------------------------------------------------------------ */}
      <ModalLimparBase
        open={modalLimparOpen}
        onOpenChange={setModalLimparOpen}
        alvo="dicionario_principios_ativos"
        tituloAlvo="Matriz de Princípios Ativos"
        onSucesso={() => {
          carregarDados()
        }}
      />
    </div>
  )
}
