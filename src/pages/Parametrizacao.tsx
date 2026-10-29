import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Percent, Plus, Search, Save, Loader2, HelpCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { listarParametrizacaoFiscal, salvarParametrizacaoFiscal } from '@/services/agroService'
import type { ParametrizacaoFiscal } from '@/types/agro'

export function Parametrizacao() {
  const { isAdmin } = useAuth()
  const [parametros, setParametros] = useState<ParametrizacaoFiscal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  // Novo NCM inline
  const [novoNcm, setNovoNcm] = useState('')
  const [novoPis, setNovoPis] = useState<number>(1.65)
  const [novoCofins, setNovoCofins] = useState<number>(7.6)
  const [novoRegime, setNovoRegime] = useState<'cumulativo' | 'nao_cumulativo'>('nao_cumulativo')
  const [novoIbs, setNovoIbs] = useState<number>(0.1)
  const [novoCbs, setNovoCbs] = useState<number>(0.9)
  const [novoClassif, setNovoClassif] = useState('Bens e Serviços Agropecuários')
  const [novoTrib, setNovoTrib] = useState('Tributação Reduzida (60%)')
  const [addingNovo, setAddingNovo] = useState(false)

  // Rolagem infinita contínua
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageRef = useRef(1)
  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const buildFilter = useCallback(() => {
    if (!search.trim()) return undefined
    const clean = search.trim().replace(/'/g, "\\'")
    return `ncm ~ '${clean}' || classificacao ~ '${clean}'`
  }, [search])

  const carregarParametros = useCallback(async () => {
    setLoading(true)
    pageRef.current = 1
    hasMoreRef.current = true
    try {
      const filter = buildFilter()
      const res = await listarParametrizacaoFiscal({ page: 1, perPage: 50, filter, sort: 'ncm' })
      setParametros(res.items)
      setTotalCount(res.totalItems)
      const more = res.totalPages > 1
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [buildFilter])

  const carregarMaisParametros = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const nextPage = pageRef.current + 1

    try {
      const filter = buildFilter()
      const res = await listarParametrizacaoFiscal({
        page: nextPage,
        perPage: 50,
        filter,
        sort: 'ncm',
      })
      pageRef.current = nextPage
      setParametros((prev) => {
        const ids = new Set(prev.map((p) => p.id))
        const novos = res.items.filter((item) => !ids.has(item.id))
        return [...prev, ...novos]
      })
      setTotalCount(res.totalItems)
      const more = nextPage < (res.totalPages || 1)
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error('Erro ao carregar mais parametrizações fiscais:', err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [buildFilter])

  useEffect(() => {
    carregarParametros()
  }, [carregarParametros])

  // Sentinel de rolagem infinita
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          carregarMaisParametros()
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
  }, [carregarMaisParametros, parametros.length])

  const handleUpdateItemField = (id: string, field: keyof ParametrizacaoFiscal, value: any) => {
    setParametros((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  const handleSalvarLinha = async (item: ParametrizacaoFiscal) => {
    setSavingId(item.id)
    try {
      await salvarParametrizacaoFiscal({
        id: item.id,
        ncm: item.ncm,
        aliquota_pis: Number(item.aliquota_pis),
        aliquota_cofins: Number(item.aliquota_cofins),
        regime: item.regime,
        aliquota_ibs: Number(item.aliquota_ibs),
        aliquota_cbs: Number(item.aliquota_cbs),
        classificacao: item.classificacao,
        tributacao: item.tributacao,
      })
      toast({
        title: 'Parâmetros Salvos',
        description: `Tributação do NCM ${item.ncm} atualizada com sucesso.`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar parametrização.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setSavingId(null)
    }
  }

  const handleCadastrarNovo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoNcm.trim()) return
    setAddingNovo(true)

    try {
      await salvarParametrizacaoFiscal({
        ncm: novoNcm.replace(/\D/g, ''),
        aliquota_pis: novoPis,
        aliquota_cofins: novoCofins,
        regime: novoRegime,
        aliquota_ibs: novoIbs,
        aliquota_cbs: novoCbs,
        classificacao: novoClassif,
        tributacao: novoTrib,
      })
      toast({
        title: 'NCM Parametrizado',
        description: `Regras fiscais para NCM ${novoNcm} incluídas com sucesso.`,
      })
      setNovoNcm('')
      carregarParametros()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar parametrização.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setAddingNovo(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col space-y-4 min-h-0 animate-in fade-in-up duration-300">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
          <Percent className="w-6 h-6 text-[#1B5E20]" />
          <span>Parametrização Fiscal & Tributária (PIS/COFINS e IBS/CBS)</span>
        </h2>
        <p className="text-xs text-[#5A6D5A] mt-0.5">
          Configuração de alíquotas por código NCM para cálculo automático de carga tributária e
          enquadramento da Reforma Tributária ({totalCount} parametrizações cadastradas).
        </p>
      </div>

      {/* Card de Adicionar Novo NCM Tributário (Apenas Admin) */}
      {isAdmin && (
        <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-4 h-4 text-[#1B5E20]" />
            <h3 className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider">
              Cadastrar Parâmetros Tributários por NCM
            </h3>
          </div>
          <form onSubmit={handleCadastrarNovo} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">NCM (8 dígitos) *</Label>
                <Input
                  required
                  maxLength={10}
                  value={novoNcm}
                  onChange={(e) => setNovoNcm(e.target.value)}
                  placeholder="Ex.: 38089324"
                  className="h-9 text-xs font-mono font-bold text-[#1B5E20] border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Alíquota PIS (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={novoPis}
                  onChange={(e) => setNovoPis(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Alíquota COFINS (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={novoCofins}
                  onChange={(e) => setNovoCofins(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Regime PIS/COFINS</Label>
                <Select
                  value={novoRegime}
                  onValueChange={(val: 'cumulativo' | 'nao_cumulativo') => setNovoRegime(val)}
                >
                  <SelectTrigger className="h-9 text-xs border-[#DCE5DC]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_cumulativo">Não Cumulativo</SelectItem>
                    <SelectItem value="cumulativo">Cumulativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Alíquota IBS (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={novoIbs}
                  onChange={(e) => setNovoIbs(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Alíquota CBS (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={novoCbs}
                  onChange={(e) => setNovoCbs(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Classificação</Label>
                <Input
                  value={novoClassif}
                  onChange={(e) => setNovoClassif(e.target.value)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#1C2B1C]">Tributação</Label>
                <Input
                  value={novoTrib}
                  onChange={(e) => setNovoTrib(e.target.value)}
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                disabled={addingNovo}
                className="text-xs h-9 bg-[#1B5E20] hover:bg-[#2E7D32] text-white px-5"
              >
                {addingNovo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <Plus className="w-3.5 h-3.5 mr-1" />
                )}
                Adicionar Parâmetro NCM
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Busca e Tabela Editável Inline */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6D5A]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por código NCM..."
            className="pl-9 text-xs h-10 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
          />
        </div>
      </Card>

      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
        <ScrollableTable
          autoFitHeight={true}
          bottomOffset={52}
          containerRef={tableContainerRef}
          onNearBottom={carregarMaisParametros}
          bottomThreshold={250}
          className="flex-1 min-h-0"
        >
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20 bg-[#F5F7F1] shadow-[0_1px_0_0_#DCE5DC]">
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-3 font-semibold">NCM</th>
                <th className="py-3 px-3 font-semibold">PIS (%)</th>
                <th className="py-3 px-3 font-semibold">COFINS (%)</th>
                <th className="py-3 px-3 font-semibold">Regime</th>
                <th className="py-3 px-3 font-semibold">IBS (%)</th>
                <th className="py-3 px-3 font-semibold">CBS (%)</th>
                <th className="py-3 px-3 font-semibold">Classificação / Tributação</th>
                <th className="py-3 px-3 font-semibold text-right">Salvar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando tabela fiscal...
                  </td>
                </tr>
              ) : parametros.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhum parâmetro fiscal cadastrado ainda. Use o formulário acima para cadastrar.
                  </td>
                </tr>
              ) : (
                parametros.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F5F7F1]/50 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-[#1B5E20] whitespace-nowrap">
                      {item.ncm}
                    </td>
                    <td className="py-2 px-3 w-20">
                      <Input
                        type="number"
                        step="0.01"
                        disabled={!isAdmin}
                        value={item.aliquota_pis}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            'aliquota_pis',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-xs px-2 border-[#DCE5DC]"
                      />
                    </td>
                    <td className="py-2 px-3 w-20">
                      <Input
                        type="number"
                        step="0.01"
                        disabled={!isAdmin}
                        value={item.aliquota_cofins}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            'aliquota_cofins',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-xs px-2 border-[#DCE5DC]"
                      />
                    </td>
                    <td className="py-2 px-3 w-36">
                      <Select
                        disabled={!isAdmin}
                        value={item.regime}
                        onValueChange={(val: 'cumulativo' | 'nao_cumulativo') =>
                          handleUpdateItemField(item.id, 'regime', val)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs border-[#DCE5DC]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao_cumulativo">Não Cumulativo</SelectItem>
                          <SelectItem value="cumulativo">Cumulativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-3 w-20">
                      <Input
                        type="number"
                        step="0.01"
                        disabled={!isAdmin}
                        value={item.aliquota_ibs}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            'aliquota_ibs',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-xs px-2 border-[#DCE5DC]"
                      />
                    </td>
                    <td className="py-2 px-3 w-20">
                      <Input
                        type="number"
                        step="0.01"
                        disabled={!isAdmin}
                        value={item.aliquota_cbs}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            'aliquota_cbs',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="h-8 text-xs px-2 border-[#DCE5DC]"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-[#1C2B1C] block truncate max-w-[200px]">
                        {item.classificacao}
                      </span>
                      <span className="text-[10px] text-[#5A6D5A] block truncate max-w-[200px]">
                        {item.tributacao}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isAdmin ? (
                        <Button
                          size="sm"
                          onClick={() => handleSalvarLinha(item)}
                          disabled={savingId === item.id}
                          className="h-8 text-xs bg-[#1B5E20] hover:bg-[#2E7D32] text-white"
                        >
                          {savingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic px-2">Leitura</span>
                      )}
                    </td>
                  </tr>
                ))
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
              {parametros.length}{' '}
              {parametros.length === 1 ? 'parametrização exibida' : 'parametrizações exibidas'}
            </span>
            <span className="text-[#8A9A86]">•</span>
            <span>Ordem alfabética por NCM (padrão)</span>
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
            {!hasMore && parametros.length > 0 && !loading && (
              <span className="text-[11px] text-[#5A6D5A] bg-[#F5F7F1] px-2.5 py-1 rounded-md border border-[#DCE5DC]">
                Fim da lista — todas as {parametros.length} parametrizações carregadas
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

      {/* Explicação da Reforma Tributária Agro */}
      <Card className="rounded-2xl border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-[#1B5E20] flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[#1C2B1C] space-y-1">
            <h4 className="font-bold">Regime Especial do Agronegócio (IBS/CBS e PIS/COFINS)</h4>
            <p className="text-[#5A6D5A] leading-relaxed">
              Insumos agropecuários, fertilizantes, defensivos agrícolas e sementes contam com
              redução de 60% nas alíquotas de IBS e CBS ou isenção conforme lista regulamentar da
              Reforma Tributária (Emenda Constitucional 132). Ao parametrizar o NCM, as validações
              individuais calculam a carga efetiva correspondente.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
