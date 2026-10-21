import React, { useEffect, useState, useTransition, useRef, useCallback } from 'react'
import {
  Scale,
  Search,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Layers,
  Sparkles,
  Calendar,
  Percent,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Package,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { listarBaseMestre } from '@/services/agroService'
import { formatarNcmMascara, sanitizarRegistroMapa } from '@/lib/motorCanonico'
import type { BaseMestreProduto } from '@/types/agro'

interface EnquadramentoInfo {
  categoria: 'Beneficiado' | 'Condicional' | 'Tributado'
  rotuloCurto: string
  descricao: string
  aliquotaHoje: string
  aliquotaPosAbr2026Real: string
  aliquotaPosAbr2026Presumido: string
  cstSugerido: string
  badgeVariant: 'beneficiado' | 'condicional' | 'tributado'
}

function deduzirEnquadramentoFiscal(p: BaseMestreProduto): EnquadramentoInfo {
  const statusStr = (p.status_pis_cofins || '').toLowerCase()
  const macro = (p.macro_grupo || '').toLowerCase()
  const sub = (p.sub_grupo || '').toLowerCase()

  // 1. Condicional à destinação agrícola (Dec. 5.630/2005)
  if (
    statusStr.includes('condicional') ||
    statusStr.includes('5.630') ||
    macro.includes('corretivo') ||
    sub.includes('corretivo') ||
    p.ncm_padrao?.startsWith('25')
  ) {
    return {
      categoria: 'Condicional',
      rotuloCurto: 'Condicional',
      descricao:
        p.status_pis_cofins ||
        'Benefício condicional à destinação exclusivamente agrícola ou venda a fabricante de fertilizantes (Dec. nº 5.630/2005).',
      aliquotaHoje: p.aliquota_ate_mar2026 || '0,00% (Dec. 5.630/05)',
      aliquotaPosAbr2026Real: p.aliquota_pos_abr2026_real || '0,925% (LC 224/25)',
      aliquotaPosAbr2026Presumido: p.aliquota_pos_abr2026_presumido || '0,365% (LC 224/25)',
      cstSugerido: p.cst_saida || 'CST 06',
      badgeVariant: 'condicional',
    }
  }

  // 2. Tributado Integralmente (fora do rol da Lei 10.925/04 ou SC COSIT)
  if (
    statusStr.includes('tributado') ||
    statusStr.includes('cosit') ||
    macro.includes('adjuvante') ||
    macro.includes('químicos e reagentes')
  ) {
    return {
      categoria: 'Tributado',
      rotuloCurto: 'Tributado',
      descricao:
        p.status_pis_cofins ||
        'Tributado integralmente à alíquota padrão. Produto não enquadrado no rol de alíquota zero da Lei nº 10.925/2004.',
      aliquotaHoje: p.aliquota_ate_mar2026 || '9,25% (1,65% + 7,60%)',
      aliquotaPosAbr2026Real: p.aliquota_pos_abr2026_real || '9,25% (Real)',
      aliquotaPosAbr2026Presumido: p.aliquota_pos_abr2026_presumido || '3,65% (Presumido)',
      cstSugerido: p.cst_saida || 'CST 01',
      badgeVariant: 'tributado',
    }
  }

  // 3. Beneficiado Alíquota Zero (Lei 10.925/2004) com reoneração residual LC 224/2025
  return {
    categoria: 'Beneficiado',
    rotuloCurto: 'Beneficiado',
    descricao:
      p.status_pis_cofins ||
      'Alíquota zero de PIS/COFINS (Lei nº 10.925/2004, art. 1º) até 31/03/2026; reoneração residual a partir de 01/04/2026 pela LC nº 224/2025.',
    aliquotaHoje: p.aliquota_ate_mar2026 || '0,00% (Lei 10.925/04)',
    aliquotaPosAbr2026Real: p.aliquota_pos_abr2026_real || '0,925% (LC 224/25)',
    aliquotaPosAbr2026Presumido: p.aliquota_pos_abr2026_presumido || '0,365% (LC 224/25)',
    cstSugerido: p.cst_saida || 'CST 06',
    badgeVariant: 'beneficiado',
  }
}

export function Tributacao() {
  const [produtos, setProdutos] = useState<BaseMestreProduto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroEnquadramento, setFiltroEnquadramento] = useState<string>('todos')
  const [filtroMacro, setFiltroMacro] = useState<string>('todos')
  const [, startTransition] = useTransition()

  // Expansão de linha para detalhe tributário
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({})

  // Rolagem infinita contínua
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageRef = useRef(1)
  const hasMoreRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const loadingInitialRef = useRef(false)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const toggleRowExpanded = (id: string) => {
    setExpandedRowIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const buildFilterString = useCallback(() => {
    const filters: string[] = []
    if (search.trim()) {
      const clean = search.trim().replace(/'/g, "\\'")
      filters.push(
        `(nome_completo ~ '${clean}' || marca_padronizada ~ '${clean}' || ncm_padrao ~ '${clean}' || principio_ativo ~ '${clean}' || registro_mapa ~ '${clean}' || titular_fabricante ~ '${clean}')`,
      )
    }
    if (filtroMacro !== 'todos') {
      filters.push(`macro_grupo = '${filtroMacro.replace(/'/g, "\\'")}'`)
    }
    if (filtroEnquadramento !== 'todos') {
      if (filtroEnquadramento === 'beneficiado') {
        filters.push(`status_pis_cofins ~ 'Beneficiado' || status_pis_cofins = ''`)
      } else if (filtroEnquadramento === 'condicional') {
        filters.push(`status_pis_cofins ~ 'Condicional' || status_pis_cofins ~ '5.630'`)
      } else if (filtroEnquadramento === 'tributado') {
        filters.push(`status_pis_cofins ~ 'Tributado' || status_pis_cofins ~ 'COSIT'`)
      }
    }
    return filters.join(' && ')
  }, [search, filtroMacro, filtroEnquadramento])

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
      console.error('Erro ao carregar produtos na Tributação Agro:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar a base de tributação dos produtos.',
      })
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
      console.error('Erro ao carregar mais produtos:', err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [buildFilterString])

  useEffect(() => {
    carregarProdutos()
  }, [carregarProdutos])

  // Sentinel com IntersectionObserver para rolagem infinita contínua
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

  // Exportação CSV segura (somente leitura)
  const handleExportCSV = () => {
    if (produtos.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum produto exibido para exportar.' })
      return
    }

    const headers = [
      'Nome_Comercial',
      'Marca_Padronizada',
      'Registro_MAPA',
      'Principio_Ativo',
      'Macro_Grupo',
      'NCM_Padrao',
      'NCM_Faixa1_Ate_300g',
      'NCM_Faixa2_300g_a_7_5kg',
      'NCM_Faixa3_7_5kg_a_10kg',
      'NCM_Faixa4_Acima_10kg',
      'NCM_Granel_Tecnico',
      'Regra_TIPI',
      'Enquadramento_PIS_COFINS',
      'CST_Recomendado_Saida',
      'CST_Entrada_Revenda',
      'Aliquota_Vigente_Hoje_PIS_COFINS',
      'Aliquota_Pos_Abr2026_Real',
      'Aliquota_Pos_Abr2026_Presumido',
      'Transicao_IBS_CBS_LC214_2025',
      'Titular_Fabricante',
    ]

    const rows = produtos.map((p) => {
      const enq = deduzirEnquadramentoFiscal(p)
      const ncmPadrao = p.ncm_padrao || p.ncm || ''
      return [
        `"${(p.nome_completo || p.nome_produto || '').replace(/"/g, '""')}"`,
        `"${(p.marca_padronizada || p.nome_produto || '').replace(/"/g, '""')}"`,
        `"${sanitizarRegistroMapa(p.registro_mapa)}"`,
        `"${(p.principio_ativo || '').replace(/"/g, '""')}"`,
        `"${(p.macro_grupo || 'Defensivos').replace(/"/g, '""')}"`,
        `"${formatarNcmMascara(ncmPadrao)}"`,
        `"${formatarNcmMascara(p.ncm_faixa1_ate_300g || ncmPadrao)}"`,
        `"${formatarNcmMascara(p.ncm_faixa2_300g_a_7_5kg || ncmPadrao)}"`,
        `"${formatarNcmMascara(p.ncm_faixa3_7_5kg_a_10kg || ncmPadrao)}"`,
        `"${formatarNcmMascara(p.ncm_faixa4_acima_10kg || ncmPadrao)}"`,
        `"${formatarNcmMascara(p.ncm_faixa4_acima_10kg || ncmPadrao)}"`,
        `"${(p.regra_tipi || '').replace(/"/g, '""')}"`,
        `"${enq.categoria}"`,
        `"${enq.cstSugerido}"`,
        `"${p.cst_entrada || 'CST 73'}"`,
        `"${enq.aliquotaHoje}"`,
        `"${enq.aliquotaPosAbr2026Real}"`,
        `"${enq.aliquotaPosAbr2026Presumido}"`,
        `"${(p.ibs_cbs_2027 || 'Redução de 60% + Diferimento (LC 214/2025)').replace(/"/g, '""')}"`,
        `"${(p.titular_fabricante || p.fabricante || '').replace(/"/g, '""')}"`,
      ].join(';')
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tributacao_agro_produtos_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Relatório Exportado',
      description: `CSV de panorama tributário com ${produtos.length} produtos gerado com sucesso.`,
    })
  }

  return (
    <div className="flex-1 flex flex-col space-y-4 min-h-0 animate-in fade-in duration-200">
      {/* ------------------------------------------------------------------ */}
      {/* CABEÇALHO DA TELA DE CONSULTA TRIBUTÁRIA AGRO */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <Scale className="w-6 h-6 text-[#1B5E20]" />
            <span>Tributação Agro • Panorama Fiscal por Produto</span>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Consulta consolidada de enquadramento tributário dos produtos agropecuários da Base
            Mestre: matriz TIPI por embalagem, PIS/COFINS temporal (Decreto nº 5.630/05 e LC nº
            224/2025) e transição da Reforma Tributária IBS/CBS (LC nº 214/2025).
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs h-9 border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50 hover:text-[#1B5E20]"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-[#1B5E20]" />
            <span>Exportar Panorama CSV</span>
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CARDS RESUMO DO MOTOR TRIBUTÁRIO TEMPORAL */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="rounded-2xl border-[#DCE5DC] bg-white p-3.5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-[#1B5E20] flex-shrink-0">
              <CheckCircle2 className="w-4 h-4 text-[#1B5E20]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1C2B1C]">Regra Vigente HOJE</span>
                <Badge className="bg-emerald-100 text-emerald-800 text-[10px] py-0">
                  Até 31/Mar/26
                </Badge>
              </div>
              <p className="text-[11px] text-[#5A6D5A] mt-1 leading-snug">
                <strong>Alíquota 0,00%</strong> de PIS/COFINS para insumos e defensivos agrícolas
                (Lei nº 10.925/2004) ou condicionado à destinação (Dec. 5.630/05).
              </p>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-amber-200 bg-amber-50/40 p-3.5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 flex-shrink-0">
              <Calendar className="w-4 h-4 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1C2B1C]">Reoneração Residual</span>
                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] py-0">
                  Pós-01/Abr/26
                </Badge>
              </div>
              <p className="text-[11px] text-[#5A6D5A] mt-1 leading-snug">
                <strong>0,925%</strong> no Lucro Real e <strong>0,365%</strong> no Presumido pela LC
                nº 224/2025 (fim da alíquota zero plena para insumos formulados).
              </p>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-blue-200 bg-blue-50/40 p-3.5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-800 flex-shrink-0">
              <Sparkles className="w-4 h-4 text-blue-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1C2B1C]">Reforma IBS / CBS</span>
                <Badge className="bg-blue-100 text-blue-900 border-blue-300 text-[10px] py-0">
                  LC 214/2025
                </Badge>
              </div>
              <p className="text-[11px] text-[#5A6D5A] mt-1 leading-snug">
                <strong>Redução de 60%</strong> da alíquota de referência (26,5%) + Diferimento
                integral nas operações com produtor rural (Art. 138 e Anexo IX).
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* FILTROS E BUSCA */}
      {/* ------------------------------------------------------------------ */}
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
              placeholder="Buscar por nome comercial, princípio ativo, NCM (ex: 3808.93.24) ou registro MAPA..."
              className="pl-9 text-xs h-10 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full md:w-auto">
            {/* Filtro por Enquadramento */}
            <Select
              value={filtroEnquadramento}
              onValueChange={(val) => {
                setFiltroEnquadramento(val)
              }}
            >
              <SelectTrigger className="h-10 text-xs border-[#DCE5DC] sm:w-56">
                <SelectValue placeholder="Enquadramento PIS/COFINS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Enquadramentos</SelectItem>
                <SelectItem value="beneficiado">Beneficiado (Lei 10.925/04)</SelectItem>
                <SelectItem value="condicional">Condicional (Dec. 5.630/05)</SelectItem>
                <SelectItem value="tributado">Tributado Integralmente</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro por Macro-Grupo */}
            <Select
              value={filtroMacro}
              onValueChange={(val) => {
                setFiltroMacro(val)
              }}
            >
              <SelectTrigger className="h-10 text-xs border-[#DCE5DC] sm:w-52">
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
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* TABELA DE CONSULTA TRIBUTÁRIA COM ROLAGEM INFINITA */}
      {/* ------------------------------------------------------------------ */}
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
                <th className="py-3 px-3 w-8 text-center" />
                <th className="py-3 px-3 font-semibold">Nome Comercial</th>
                <th className="py-3 px-3 font-semibold">Registro MAPA</th>
                <th className="py-3 px-3 font-semibold">Princípio Ativo</th>
                <th className="py-3 px-3 font-semibold">NCM</th>
                <th className="py-3 px-3 font-semibold">Enquadramento PIS/COFINS</th>
                <th className="py-3 px-3 font-semibold text-center">Vigente HOJE</th>
                <th className="py-3 px-3 font-semibold text-center">Pós-Abr/2026 (Real)</th>
                <th className="py-3 px-3 font-semibold">Status IBS / CBS</th>
                <th className="py-3 px-3 font-semibold text-right">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando panorama tributário dos produtos agropecuários...
                  </td>
                </tr>
              ) : produtos.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Scale className="w-8 h-8 text-[#5A6D5A]/40 mx-auto mb-2" />
                    <p className="font-semibold text-sm text-[#1C2B1C]">
                      Nenhum produto localizado
                    </p>
                    <p className="text-[11px] text-[#5A6D5A] mt-0.5">
                      Tente alterar os termos de busca ou selecionar outro enquadramento tributário.
                    </p>
                  </td>
                </tr>
              ) : (
                produtos.map((p) => {
                  const isExpanded = Boolean(expandedRowIds[p.id])
                  const enq = deduzirEnquadramentoFiscal(p)
                  const ncmPadrao = p.ncm_padrao || p.ncm || ''

                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`hover:bg-[#F5F7F1]/60 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-emerald-50/40 font-medium' : ''
                        }`}
                        onClick={() => toggleRowExpanded(p.id)}
                      >
                        {/* Ícone de Expansão */}
                        <td className="py-3 px-2 text-center text-[#5A6D5A]">
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-emerald-100/60 text-[#1B5E20]"
                            aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>

                        {/* Nome Comercial */}
                        <td className="py-3 px-3 font-bold text-[#1C2B1C] max-w-[220px] truncate">
                          <span
                            title={p.nome_completo || p.marca_padronizada || p.nome_produto}
                            className="truncate block"
                          >
                            {p.marca_padronizada || p.nome_completo || p.nome_produto}
                          </span>
                          <span className="text-[10px] text-[#5A6D5A] font-normal block truncate">
                            {p.embalagem ? `${p.embalagem} (${p.unidade || 'L'})` : p.macro_grupo}
                          </span>
                        </td>

                        {/* Registro MAPA */}
                        <td className="py-3 px-3 font-mono text-[#1C2B1C] font-semibold whitespace-nowrap">
                          {sanitizarRegistroMapa(p.registro_mapa)}
                        </td>

                        {/* Princípio Ativo */}
                        <td
                          className="py-3 px-3 text-[#1C2B1C] max-w-[190px] truncate"
                          title={p.principio_ativo}
                        >
                          <span className="font-medium truncate block">
                            {p.principio_ativo || '—'}
                          </span>
                          <span className="text-[10px] text-[#5A6D5A] block truncate">
                            {p.titular_fabricante || p.fabricante || 'Fabricante não informado'}
                          </span>
                        </td>

                        {/* NCM Padrão Formatado */}
                        <td className="py-3 px-3 font-mono font-bold text-[#1B5E20] whitespace-nowrap">
                          {formatarNcmMascara(ncmPadrao)}
                        </td>

                        {/* Badge de Enquadramento */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {enq.badgeVariant === 'beneficiado' ? (
                            <Badge className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] py-0 px-2 font-semibold">
                              Beneficiado
                            </Badge>
                          ) : enq.badgeVariant === 'condicional' ? (
                            <Badge className="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] py-0 px-2 font-semibold">
                              Condicional
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] py-0 px-2 font-semibold">
                              Tributado
                            </Badge>
                          )}
                        </td>

                        {/* Alíquota Vigente HOJE */}
                        <td className="py-3 px-3 text-center whitespace-nowrap font-medium text-[#1C2B1C]">
                          <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 font-mono text-[11px] font-bold">
                            {enq.aliquotaHoje.includes('0,00%') ? '0,00%' : enq.aliquotaHoje}
                          </span>
                        </td>

                        {/* Alíquota Pós-Abr/2026 (Real) */}
                        <td className="py-3 px-3 text-center whitespace-nowrap font-medium text-[#1C2B1C]">
                          <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-mono text-[11px] font-bold border border-amber-200">
                            {enq.aliquotaPosAbr2026Real}
                          </span>
                        </td>

                        {/* Transição IBS / CBS */}
                        <td className="py-3 px-3 max-w-[210px] truncate whitespace-nowrap text-[#1C2B1C]">
                          <span
                            className="text-[11px] text-blue-950 font-medium truncate block"
                            title={
                              p.ibs_cbs_2027 ||
                              'Redução de 60% da alíquota de referência (26,5%) + Diferimento'
                            }
                          >
                            {p.ibs_cbs_2027
                              ? p.ibs_cbs_2027.split('+')[0].trim()
                              : 'Redução 60% + Diferimento'}
                          </span>
                          <span className="text-[10px] text-[#5A6D5A] block">
                            LC nº 214/2025 • Art. 138
                          </span>
                        </td>

                        {/* Ação / Ver Detalhes */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-[#1B5E20] hover:bg-emerald-100/70 font-semibold"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleRowExpanded(p.id)
                            }}
                          >
                            {isExpanded ? 'Fechar' : 'Ver Detalhe'}
                          </Button>
                        </td>
                      </tr>

                      {/* ------------------------------------------------------------------ */}
                      {/* PAINEL EXPANDIDO: DETALHAMENTO TRIBUTÁRIO COMPLETO */}
                      {/* ------------------------------------------------------------------ */}
                      {isExpanded && (
                        <tr className="bg-gradient-to-r from-emerald-50/30 via-white to-amber-50/20">
                          <td colSpan={10} className="py-4 px-6 border-y border-[#DCE5DC]">
                            <div className="space-y-4 text-xs">
                              {/* Cabeçalho do Detalhe */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE5DC] pb-2.5">
                                <div className="flex items-center gap-2">
                                  <Layers className="w-4 h-4 text-[#1B5E20]" />
                                  <span className="font-bold text-sm text-[#1C2B1C]">
                                    Prontuário Tributário • {p.nome_completo || p.marca_padronizada}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-white border-emerald-300 text-emerald-900"
                                  >
                                    MAPA: {sanitizarRegistroMapa(p.registro_mapa)}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-[#5A6D5A]">
                                  {p.url_oficial && (
                                    <a
                                      href={p.url_oficial}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 font-semibold text-[#1B5E20] hover:underline"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Bula / Consulta Oficial
                                    </a>
                                  )}
                                  <span className="font-mono text-[10px]">ID: {p.id}</span>
                                </div>
                              </div>

                              {/* Grid com os 4 Blocos Tributários */}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                                {/* Bloco 1: Matriz NCM por Faixa de Embalagem TIPI */}
                                <div className="p-3.5 rounded-xl bg-white border border-[#DCE5DC] shadow-xs space-y-2.5">
                                  <div className="flex items-center gap-1.5 font-bold text-[#1B5E20] border-b border-emerald-100 pb-1.5">
                                    <Package className="w-3.5 h-3.5" />
                                    <span>NCM por Faixa de Embalagem (TIPI)</span>
                                  </div>
                                  <div className="space-y-1.5 font-mono text-[11px]">
                                    <div className="flex items-center justify-between p-1 rounded bg-[#F5F7F1]">
                                      <span className="text-[#5A6D5A]">Faixa 1 (≤ 300g/mL):</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {formatarNcmMascara(p.ncm_faixa1_ate_300g || ncmPadrao)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between p-1 rounded bg-[#F5F7F1]">
                                      <span className="text-[#5A6D5A]">
                                        Faixa 2 (300g a 7,5kg):
                                      </span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {formatarNcmMascara(p.ncm_faixa2_300g_a_7_5kg || ncmPadrao)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between p-1 rounded bg-[#F5F7F1]">
                                      <span className="text-[#5A6D5A]">
                                        Faixa 3 (7,5kg a 10kg):
                                      </span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {formatarNcmMascara(p.ncm_faixa3_7_5kg_a_10kg || ncmPadrao)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between p-1 rounded bg-[#F5F7F1]">
                                      <span className="text-[#5A6D5A]">Faixa 4 (&gt; 10kg):</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {formatarNcmMascara(p.ncm_faixa4_acima_10kg || ncmPadrao)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between p-1 rounded bg-emerald-50/60 border border-emerald-200">
                                      <span className="text-[#1B5E20] font-sans text-[10px] font-semibold">
                                        Granel / Técnico:
                                      </span>
                                      <span className="font-bold text-[#1B5E20]">
                                        {formatarNcmMascara(p.ncm_faixa4_acima_10kg || ncmPadrao)}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Bloco 2: Regra TIPI da Embalagem */}
                                <div className="p-3.5 rounded-xl bg-white border border-[#DCE5DC] shadow-xs space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-[#1C2B1C] border-b border-[#DCE5DC] pb-1.5">
                                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#1B5E20]" />
                                    <span>Regra TIPI da Embalagem</span>
                                  </div>
                                  <div className="space-y-1.5 text-[11px] leading-relaxed">
                                    <div className="p-2 rounded-lg bg-[#FAFBF9] border border-[#DCE5DC]/60">
                                      <p className="text-[#1C2B1C] italic">
                                        {p.regra_tipi ||
                                          p.regra_tipi_embalagem ||
                                          'Classificação aduaneira escalonada conforme Tabela TIPI da Receita Federal. O enquadramento na subposição correta depende do peso líquido/bruto comercializado.'}
                                      </p>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-[#5A6D5A] pt-1">
                                      <span>Nota Subposições 2 (TIPI):</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {p.nota_subpos_2 === 'SIM'
                                          ? 'SIM (Rol Taxativo)'
                                          : 'NÃO (Geral)'}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-[#5A6D5A]">
                                      <span>Embalagem Comercial Base:</span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        {p.embalagem || 'Padrão Bula'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Bloco 3: Enquadramento PIS/COFINS & CST */}
                                <div className="p-3.5 rounded-xl bg-white border border-[#DCE5DC] shadow-xs space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-amber-900 border-b border-amber-100 pb-1.5">
                                    <Percent className="w-3.5 h-3.5 text-amber-700" />
                                    <span>PIS/COFINS & Regime Tributário</span>
                                  </div>
                                  <div className="space-y-1 text-[11px]">
                                    <div>
                                      <span className="text-[#5A6D5A] block text-[10px]">
                                        Fundamentação Legal do Benefício:
                                      </span>
                                      <span className="font-medium text-[#1C2B1C] leading-tight block mt-0.5">
                                        {enq.descricao}
                                      </span>
                                    </div>
                                    <div className="pt-2 border-t border-amber-50 space-y-1">
                                      <div className="flex justify-between font-mono">
                                        <span className="text-[#5A6D5A]">
                                          CST Saída Recomendado:
                                        </span>
                                        <span className="font-bold text-[#1B5E20]">
                                          {p.cst_saida || enq.cstSugerido}
                                        </span>
                                      </div>
                                      <div className="flex justify-between font-mono">
                                        <span className="text-[#5A6D5A]">
                                          CST Entrada (Revenda):
                                        </span>
                                        <span className="font-bold text-[#1C2B1C]">
                                          {p.cst_entrada || 'CST 73'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between font-mono">
                                        <span className="text-[#5A6D5A]">
                                          Ajuste EFD-Contribuições:
                                        </span>
                                        <span className="font-semibold text-[#1C2B1C] text-[10px]">
                                          Registros M220 / M620
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Bloco 4: Projeção Reforma Tributária IBS / CBS */}
                                <div className="p-3.5 rounded-xl bg-white border border-blue-200 shadow-xs space-y-2 bg-blue-50/20">
                                  <div className="flex items-center gap-1.5 font-bold text-blue-900 border-b border-blue-100 pb-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-blue-700" />
                                    <span>Projeção IBS / CBS (LC 214/2025)</span>
                                  </div>
                                  <div className="space-y-1.5 text-[11px]">
                                    <div>
                                      <span className="text-[#5A6D5A] block text-[10px]">
                                        Alíquota Referência da Reforma:
                                      </span>
                                      <span className="font-bold text-[#1C2B1C]">
                                        26,50% (Projetada)
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[#5A6D5A] block text-[10px]">
                                        Carga Efetiva com Redução de 60%:
                                      </span>
                                      <span className="font-bold text-blue-900">
                                        10,60% (IBS + CBS)
                                      </span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-white border border-blue-100 text-[10px] text-blue-950 mt-1">
                                      <p className="font-semibold">
                                        Regime de Diferimento Aplicável:
                                      </p>
                                      <p className="text-[#5A6D5A] mt-0.5 leading-snug">
                                        {p.ibs_cbs_2027 ||
                                          'Diferimento integral do IBS e da CBS na venda a produtor rural contribuinte ou agroindústria (Art. 138 e Anexo IX da LC nº 214/2025).'}
                                      </p>
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

        {/* Sentinel para rolagem infinita */}
        <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />

        {/* ------------------------------------------------------------------ */}
        {/* RODAPÉ FIXO INFORMATIVO DE ROLAGEM E CONTAGEM */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex items-center justify-between p-3.5 border-t border-[#DCE5DC] bg-[#FAFBF9] text-xs text-[#5A6D5A]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#1C2B1C]">
              {produtos.length} {produtos.length === 1 ? 'produto exibido' : 'produtos exibidos'}
            </span>
            <span className="text-[#8A9A86]">•</span>
            <span>Ordenação alfabética por nome comercial</span>
            <span className="text-[#8A9A86]">•</span>
            <span>Total na base com filtros: {totalCount}</span>
          </div>

          <div className="flex items-center gap-2">
            {loadingMore && (
              <div className="inline-flex items-center gap-1.5 text-xs text-[#1B5E20] font-medium bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Carregando próximo lote...</span>
              </div>
            )}
            {!hasMore && produtos.length > 0 && !loading && (
              <span className="text-[11px] text-[#5A6D5A] bg-[#F5F7F1] px-2.5 py-1 rounded-md border border-[#DCE5DC]">
                Fim dos registros — todos os {produtos.length} produtos carregados
              </span>
            )}
            {hasMore && !loadingMore && !loading && (
              <span className="text-[11px] text-[#8A9A86] hidden sm:inline">
                Role verticalmente para carregar mais produtos automaticamente
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
