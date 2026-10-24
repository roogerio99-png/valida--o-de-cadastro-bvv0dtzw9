import React, { useEffect, useState, useTransition, useRef, useCallback } from 'react'
import { FileSpreadsheet, Search, Download, Edit2, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { listarBaseMestre, atualizarProdutoBaseMestre } from '@/services/agroService'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/hooks/use-realtime'
import type { BaseMestreProduto } from '@/types/agro'

function formatNcm(ncm?: string | null): string {
  if (!ncm) return '—'
  const digits = String(ncm).replace(/\D/g, '')
  if (digits.length === 8) {
    // 3808.93.24
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }
  return ncm
}

export function Regras() {
  const { isAdmin } = useAuth()
  const [itens, setItens] = useState<BaseMestreProduto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [, startTransition] = useTransition()

  // Modal de Edição de NCM Específica da Embalagem
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<BaseMestreProduto | null>(null)
  const [formNcm, setFormNcm] = useState('')
  const [formQuantidade, setFormQuantidade] = useState<number | string>(20)
  const [formUnidade, setFormUnidade] = useState('L')
  const [formAcondicionamento, setFormAcondicionamento] = useState('Bombona')
  const [saving, setSaving] = useState(false)

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
    return `nome_completo ~ '${clean}' || marca_padronizada ~ '${clean}' || registro_mapa ~ '${clean}' || ncm_especifica ~ '${clean}' || ncm_padrao ~ '${clean}' || ncm ~ '${clean}' || titular_fabricante ~ '${clean}' || forma_acondicionamento ~ '${clean}'`
  }, [search])

  const carregarItens = useCallback(async () => {
    setLoading(true)
    pageRef.current = 1
    hasMoreRef.current = true
    try {
      const filter = buildFilter()
      const res = await listarBaseMestre({
        page: 1,
        perPage: 50,
        filter,
        sort: 'nome_completo,registro_mapa',
      })
      setItens(res.items)
      setTotalCount(res.totalItems)
      const more = res.totalPages > 1
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error('Erro ao carregar itens da Base Mestre:', err)
    } finally {
      setLoading(false)
    }
  }, [buildFilter])

  const carregarMaisItens = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const nextPage = pageRef.current + 1

    try {
      const filter = buildFilter()
      const res = await listarBaseMestre({
        page: nextPage,
        perPage: 50,
        filter,
        sort: 'nome_completo,registro_mapa',
      })
      pageRef.current = nextPage
      setItens((prev) => {
        const ids = new Set(prev.map((r) => r.id))
        const novos = res.items.filter((item) => !ids.has(item.id))
        return [...prev, ...novos]
      })
      setTotalCount(res.totalItems)
      const more = nextPage < (res.totalPages || 1)
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error('Erro ao carregar mais registros da Base Mestre:', err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [buildFilter])

  useEffect(() => {
    carregarItens()
  }, [carregarItens])

  useRealtime('base_mestre', () => carregarItens())

  // Sentinel de rolagem infinita
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          carregarMaisItens()
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
  }, [carregarMaisItens, itens.length])

  const handleOpenEdit = (item: BaseMestreProduto) => {
    setEditingItem(item)
    const ncmVal = item.ncm_especifica || item.ncm_padrao || item.ncm || ''
    setFormNcm(ncmVal)
    setFormQuantidade(item.quantidade_embalagem_principal ?? 20)
    setFormUnidade(item.unidade_medida_principal || 'L')
    setFormAcondicionamento(item.forma_acondicionamento || 'Bombona')
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem) return
    if (!formNcm.trim()) return
    setSaving(true)

    const ncmClean = formNcm.replace(/\D/g, '')
    if (ncmClean.length !== 8) {
      toast({
        variant: 'destructive',
        title: 'NCM Inválido',
        description: 'O código NCM deve possuir exatamente 8 dígitos numéricos conforme a TIPI.',
      })
      setSaving(false)
      return
    }

    const ncmFormatado = formatNcm(ncmClean)

    const payload: Partial<BaseMestreProduto> = {
      ncm_especifica: ncmFormatado,
      quantidade_embalagem_principal: Number(formQuantidade) || 0,
      unidade_medida_principal: formUnidade.trim().toUpperCase(),
      forma_acondicionamento: formAcondicionamento.trim(),
    }

    try {
      await atualizarProdutoBaseMestre(editingItem.id, payload)
      toast({
        title: 'NCM Específica Atualizada',
        description: `Embalagem ${formQuantidade} ${formUnidade} (${formAcondicionamento}) atualizada para ${ncmFormatado}.`,
      })
      setIsModalOpen(false)
      carregarItens()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao persistir NCM na Base Mestre.'
      toast({ variant: 'destructive', title: 'Falha ao Salvar', description: msg })
    } finally {
      setSaving(false)
    }
  }

  // Exportar Tabela para CSV
  const handleExportCSV = () => {
    if (itens.length === 0) {
      toast({ title: 'Aviso', description: 'Não há registros para exportar.' })
      return
    }

    const headers = [
      'Registro MAPA',
      'Nome Comercial / Produto',
      'Quantidade Embalagem',
      'Unidade',
      'Acondicionamento',
      'NCM Específica',
      'Embalagem Original',
      'Titular / Fabricante',
    ]
    const rows = itens.map((r) => {
      const ncmEsp = r.ncm_especifica || r.ncm_padrao || r.ncm || ''
      return [
        `"${r.registro_mapa || ''}"`,
        `"${(r.nome_completo || r.marca_padronizada || r.nome_produto || '').replace(/"/g, '""')}"`,
        `"${r.quantidade_embalagem_principal ?? ''}"`,
        `"${r.unidade_medida_principal || r.unidade || ''}"`,
        `"${r.forma_acondicionamento || ''}"`,
        `"${formatNcm(ncmEsp)}"`,
        `"${(r.embalagem_original || r.embalagem || '').replace(/"/g, '""')}"`,
        `"${(r.titular_fabricante || r.fabricante || '').replace(/"/g, '""')}"`,
      ]
    })

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `regras_ncm_base_mestre_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="flex-1 flex flex-col space-y-4 min-h-0 animate-in fade-in-up duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-[#1B5E20]" />
            <span>Matriz de Regras NCM × Embalagem (Base Mestre)</span>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Classificação tributária oficial (NCM específica) vinculada a cada embalagem final na
            Base Mestre ({totalCount} cadastros).
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs h-9 border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-[#1B5E20]" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Barra de Filtro */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6D5A]" />
          <Input
            value={search}
            onChange={(e) => {
              const val = e.target.value
              startTransition(() => {
                setSearch(val)
              })
            }}
            placeholder="Filtrar por nome comercial, registro MAPA, NCM específica ou acondicionamento..."
            className="pl-9 text-xs h-10 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
          />
        </div>
      </Card>

      {/* Tabela de Regras */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
        <ScrollableTable
          autoFitHeight={true}
          bottomOffset={52}
          containerRef={tableContainerRef}
          onNearBottom={carregarMaisItens}
          bottomThreshold={250}
          className="flex-1 min-h-0"
        >
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20 bg-[#F5F7F1] shadow-[0_1px_0_0_#DCE5DC]">
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-4 font-semibold w-28 whitespace-nowrap">Registro MAPA</th>
                <th className="py-3 px-4 font-semibold min-w-[220px]">Produto / Marca</th>
                <th className="py-3 px-4 font-semibold text-center w-28 whitespace-nowrap">
                  Qtd Embalagem
                </th>
                <th className="py-3 px-4 font-semibold text-center w-24 whitespace-nowrap">
                  Unidade
                </th>
                <th className="py-3 px-4 font-semibold min-w-[170px]">Acondicionamento</th>
                <th className="py-3 px-4 font-semibold w-36 whitespace-nowrap">NCM Específica</th>
                <th className="py-3 px-4 font-semibold min-w-[180px]">Embalagem Original</th>
                <th className="py-3 px-4 font-semibold text-right w-16">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando classificação de embalagens da Base Mestre...
                  </td>
                </tr>
              ) : itens.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhum cadastro de embalagem encontrado para o filtro.
                  </td>
                </tr>
              ) : (
                itens.map((r) => {
                  const ncmEsp = r.ncm_especifica || r.ncm_padrao || r.ncm || ''
                  const ncmClean = ncmEsp.replace(/\D/g, '')
                  const ncmValido = ncmClean.length === 8
                  const ncmCanonico = formatNcm(ncmEsp)
                  const qtd = r.quantidade_embalagem_principal ?? '—'
                  const un = r.unidade_medida_principal || r.unidade || '—'
                  const acond = r.forma_acondicionamento || '—'
                  const nome = r.nome_completo || r.marca_padronizada || r.nome_produto || '—'

                  return (
                    <tr key={r.id} className="hover:bg-[#F5F7F1]/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono font-semibold text-[#1C2B1C] bg-[#F5F7F1] border border-[#DCE5DC] px-2 py-0.5 rounded text-[11px]">
                          {r.registro_mapa || 'ISENTO'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-[#1C2B1C] line-clamp-1">{nome}</div>
                        {r.titular_fabricante && (
                          <div className="text-[10px] text-[#5A6D5A] line-clamp-1">
                            {r.titular_fabricante}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="font-mono font-bold text-[#1C2B1C] text-xs">{qtd}</span>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className="bg-slate-50 text-slate-800 border-slate-300 text-[10px] py-0 px-2 font-mono"
                        >
                          {un}
                        </Badge>
                      </td>

                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-900 border-emerald-200 text-[11px] py-0.5 px-2 font-medium"
                        >
                          {acond}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {ncmValido ? (
                          <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 font-mono font-bold text-xs py-0.5 px-2.5 hover:bg-emerald-100 shadow-xs">
                            {ncmCanonico}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-mono text-[11px] py-0.5 px-2 hover:bg-amber-100">
                            {ncmEsp || 'Pendente'}
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[#5A6D5A]">
                        <span
                          className="line-clamp-1 text-[11px]"
                          title={r.embalagem_original || r.embalagem || ''}
                        >
                          {r.embalagem_original || r.embalagem || '—'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isAdmin ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(r)}
                            className="h-7 w-7 text-[#5A6D5A] hover:text-[#1B5E20] hover:bg-emerald-50"
                            title="Ajustar NCM Específica e Embalagem"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic px-2">Leitura</span>
                        )}
                      </td>
                    </tr>
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
              {itens.length} {itens.length === 1 ? 'embalagem exibida' : 'embalagens exibidas'}
            </span>
            <span className="text-[#8A9A86]">•</span>
            <span>Portadora única da classificação tributária (Base Mestre)</span>
            <span className="text-[#8A9A86]">•</span>
            <span>Total com critérios atuais: {totalCount}</span>
          </div>

          <div className="flex items-center gap-2">
            {loadingMore && (
              <div className="inline-flex items-center gap-1.5 text-xs text-[#1B5E20] font-medium bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 animate-in fade-in">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Carregando próximo lote...</span>
              </div>
            )}
            {!hasMore && itens.length > 0 && !loading && (
              <span className="text-[11px] text-[#5A6D5A] bg-[#F5F7F1] px-2.5 py-1 rounded-md border border-[#DCE5DC]">
                Fim da lista — todos os {itens.length} cadastros carregados
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
      {/* MODAL EDITAR NCM ESPECÍFICA DA EMBALAGEM */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#1C2B1C]">
              Classificação Fiscal da Embalagem
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5A6D5A]">
              Ajuste a NCM específica e a forma de acondicionamento para esta embalagem na Base
              Mestre.
            </DialogDescription>
          </DialogHeader>

          {editingItem && (
            <form onSubmit={handleSave} className="space-y-4 py-2">
              <div className="p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC] text-xs space-y-1">
                <div className="font-bold text-[#1C2B1C]">
                  {editingItem.nome_completo || editingItem.marca_padronizada}
                </div>
                <div className="text-[11px] text-[#5A6D5A]">
                  Registro MAPA:{' '}
                  <span className="font-mono font-semibold text-[#1C2B1C]">
                    {editingItem.registro_mapa || 'ISENTO'}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="formNcm" className="text-xs font-semibold text-[#1C2B1C]">
                  NCM Específica (8 dígitos canônicos) *
                </Label>
                <Input
                  id="formNcm"
                  required
                  maxLength={10}
                  value={formNcm}
                  onChange={(e) => setFormNcm(e.target.value)}
                  placeholder="Ex.: 3808.93.24"
                  className="h-9 text-xs font-mono font-bold text-[#1B5E20] border-[#DCE5DC]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="formQtd" className="text-xs font-semibold text-[#1C2B1C]">
                    Quantidade Principal *
                  </Label>
                  <Input
                    id="formQtd"
                    type="number"
                    step="any"
                    required
                    value={formQuantidade}
                    onChange={(e) => setFormQuantidade(e.target.value)}
                    placeholder="Ex.: 20"
                    className="h-9 text-xs border-[#DCE5DC]"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="formUn" className="text-xs font-semibold text-[#1C2B1C]">
                    Unidade (kg / L) *
                  </Label>
                  <Input
                    id="formUn"
                    required
                    value={formUnidade}
                    onChange={(e) => setFormUnidade(e.target.value.toUpperCase())}
                    placeholder="L ou KG"
                    className="h-9 text-xs uppercase font-mono border-[#DCE5DC]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="formAcond" className="text-xs font-semibold text-[#1C2B1C]">
                  Forma de Acondicionamento *
                </Label>
                <Input
                  id="formAcond"
                  required
                  value={formAcondicionamento}
                  onChange={(e) => setFormAcondicionamento(e.target.value)}
                  placeholder="Ex.: Bombona, Saco, Frasco, Tambor, Big Bag"
                  className="h-9 text-xs border-[#DCE5DC]"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  size="sm"
                  className="text-xs bg-[#1B5E20] hover:bg-[#2E7D32] text-white"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Salvar Classificação
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
