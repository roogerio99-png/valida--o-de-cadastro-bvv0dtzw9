import React, { useEffect, useState, useTransition, useRef, useCallback } from 'react'
import {
  FileSpreadsheet,
  Plus,
  Search,
  Download,
  Edit2,
  Trash2,
  Loader2,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import {
  listarRegrasNcm,
  criarRegraNcm,
  atualizarRegraNcm,
  excluirRegraNcm,
} from '@/services/agroService'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/hooks/use-realtime'
import type { RegraNcmEmbalagem } from '@/types/agro'

const OPCOES_EMBALAGEM = [
  'Saco',
  'Sacaria',
  'Tambor',
  'Bombona',
  'Frasco',
  'Bisnaga',
  'Pote',
  'Balde',
  'Granel',
  'Container',
  'Big Bag',
  '1X20L',
  '4X5L',
  '1X10KG',
  '4X5KG',
  '1X25KG',
  '10X2KG',
  '5X1KG',
  '8X3KG',
]

function formatNcm(ncm: string): string {
  if (!ncm) return '—'
  const digits = ncm.replace(/\D/g, '')
  if (digits.length === 8) {
    // 3808.93.22
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }
  return ncm
}

function parseEmbalagens(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {
      return raw
        .split(/[,;/|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return []
}

export function Regras() {
  const { isAdmin } = useAuth()
  const [regras, setRegras] = useState<RegraNcmEmbalagem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [, startTransition] = useTransition()

  // Modal de Criar / Editar
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formNcm, setFormNcm] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formEmbalagens, setFormEmbalagens] = useState<string[]>([])
  const [formRegraEspecial, setFormRegraEspecial] = useState('')
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
    return `ncm ~ '${clean}' || descricao ~ '${clean}'`
  }, [search])

  const carregarRegras = useCallback(async () => {
    setLoading(true)
    pageRef.current = 1
    hasMoreRef.current = true
    try {
      const filter = buildFilter()
      const res = await listarRegrasNcm({ page: 1, perPage: 50, filter, sort: 'ncm' })
      setRegras(res.items)
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

  const carregarMaisRegras = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const nextPage = pageRef.current + 1

    try {
      const filter = buildFilter()
      const res = await listarRegrasNcm({ page: nextPage, perPage: 50, filter, sort: 'ncm' })
      pageRef.current = nextPage
      setRegras((prev) => {
        const ids = new Set(prev.map((r) => r.id))
        const novos = res.items.filter((item) => !ids.has(item.id))
        return [...prev, ...novos]
      })
      setTotalCount(res.totalItems)
      const more = nextPage < (res.totalPages || 1)
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error('Erro ao carregar mais regras NCM:', err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [buildFilter])

  useEffect(() => {
    carregarRegras()
  }, [carregarRegras])

  useRealtime('regras_ncm_embalagem', () => carregarRegras())

  // Sentinel de rolagem infinita
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          carregarMaisRegras()
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
  }, [carregarMaisRegras, regras.length])

  const handleOpenCreate = () => {
    setEditingId(null)
    setFormNcm('')
    setFormDescricao('')
    setFormEmbalagens([])
    setFormRegraEspecial('')
    setIsModalOpen(true)
  }

  const handleOpenEdit = (regra: RegraNcmEmbalagem) => {
    setEditingId(regra.id)
    setFormNcm(regra.ncm)
    setFormDescricao(regra.descricao || '')
    const emb = parseEmbalagens(regra.embalagens_permitidas)
    setFormEmbalagens(emb)
    setFormRegraEspecial(regra.regra_especial || '')
    setIsModalOpen(true)
  }

  const toggleEmbalagem = (emb: string) => {
    setFormEmbalagens((prev) =>
      prev.includes(emb) ? prev.filter((item) => item !== emb) : [...prev, emb],
    )
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
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

    const payload = {
      ncm: ncmClean,
      descricao: formDescricao,
      embalagens_permitidas: formEmbalagens,
      regra_especial: formRegraEspecial,
    }

    try {
      if (editingId) {
        await atualizarRegraNcm(editingId, payload)
        toast({ title: 'Regra Atualizada', description: `NCM ${formNcm} salvo com sucesso.` })
      } else {
        await criarRegraNcm(payload)
        toast({ title: 'Regra Criada', description: `NCM ${formNcm} inserido na matriz.` })
      }
      setIsModalOpen(false)
      carregarRegras()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao persistir regra.'
      toast({ variant: 'destructive', title: 'Falha ao Salvar', description: msg })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, ncm: string) => {
    if (!confirm(`Deseja realmente remover a regra para o NCM ${ncm}?`)) return
    try {
      await excluirRegraNcm(id)
      toast({ title: 'Regra Excluída', description: `NCM ${ncm} removido.` })
      carregarRegras()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir.'
      toast({ variant: 'destructive', title: 'Falha ao Excluir', description: msg })
    }
  }

  // Exportar Tabela para CSV
  const handleExportCSV = () => {
    if (regras.length === 0) {
      toast({ title: 'Aviso', description: 'Não há registros para exportar.' })
      return
    }

    const headers = ['NCM', 'Descrição', 'Embalagens Permitidas', 'Regra Especial', 'Status']
    const rows = regras.map((r) => {
      const embalagens = parseEmbalagens(r.embalagens_permitidas).join('; ')
      const status = r.ncm && r.ncm.replace(/\D/g, '').length === 8 ? 'Ativa' : 'Incompleta'
      return [
        `"${r.ncm}"`,
        `"${(r.descricao || '').replace(/"/g, '""')}"`,
        `"${embalagens.replace(/"/g, '""')}"`,
        `"${(r.regra_especial || '').replace(/"/g, '""')}"`,
        `"${status}"`,
      ]
    })

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `regras_ncm_embalagem_${new Date().toISOString().slice(0, 10)}.csv`,
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
            <span>Matriz de Regras NCM × Embalagem</span>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Definição das embalagens autorizadas e restrições de embargo por classificação fiscal
            TIPI ({totalCount} regras cadastradas).
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
          {isAdmin && (
            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="text-xs h-9 bg-[#1B5E20] hover:bg-[#2E7D32] text-white"
            >
              <Plus className="w-4 h-4 mr-1" />
              Nova Regra NCM
            </Button>
          )}
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
            placeholder="Filtrar por código NCM ou descrição técnica..."
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
          onNearBottom={carregarMaisRegras}
          bottomThreshold={250}
          className="flex-1 min-h-0"
        >
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20 bg-[#F5F7F1] shadow-[0_1px_0_0_#DCE5DC]">
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-4 font-semibold w-36">NCM (TIPI)</th>
                <th className="py-3 px-4 font-semibold min-w-[220px]">Descrição Fiscal</th>
                <th className="py-3 px-4 font-semibold min-w-[260px]">Embalagens Autorizadas</th>
                <th className="py-3 px-4 font-semibold min-w-[220px]">
                  Dispositivo Legal / Embargo
                </th>
                <th className="py-3 px-4 font-semibold text-center w-24">Status</th>
                <th className="py-3 px-4 font-semibold text-right w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando matriz de regras regulamentares...
                  </td>
                </tr>
              ) : regras.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhuma regra cadastrada ou encontrada para o filtro.
                  </td>
                </tr>
              ) : (
                regras.map((r) => {
                  const embalagensArray = parseEmbalagens(r.embalagens_permitidas)
                  const ncmValido = r.ncm && r.ncm.replace(/\D/g, '').length === 8

                  return (
                    <tr key={r.id} className="hover:bg-[#F5F7F1]/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-[#1B5E20] text-xs">
                          {formatNcm(r.ncm)}
                        </div>
                        {r.ncm && r.ncm.length === 8 && (
                          <div className="text-[10px] text-[#5A6D5A] font-mono">
                            Código: {r.ncm}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C2B1C] line-clamp-2">
                          {r.descricao || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5 max-w-[380px]">
                          {embalagensArray.length > 0 ? (
                            embalagensArray.map((emb, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="bg-emerald-50 text-emerald-900 border-emerald-200 text-[11px] py-0.5 px-2 font-medium"
                              >
                                {emb}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 text-[10px]">
                              Sem restrição cadastrada
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#5A6D5A]">
                        {r.regra_especial ? (
                          <span
                            className="line-clamp-2 text-[11px] leading-relaxed"
                            title={r.regra_especial}
                          >
                            {r.regra_especial}
                          </span>
                        ) : (
                          <span className="text-[#5A6D5A] italic text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {ncmValido ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] py-0 px-2 hover:bg-emerald-100">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] py-0 px-2 hover:bg-amber-100">
                            Incompleta
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isAdmin ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(r)}
                              className="h-7 w-7 text-[#5A6D5A] hover:text-[#1B5E20] hover:bg-emerald-50 mr-1"
                              title="Editar regra"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(r.id, r.ncm)}
                              className="h-7 w-7 text-[#5A6D5A] hover:text-red-600 hover:bg-red-50"
                              title="Excluir regra"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
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
              {regras.length} {regras.length === 1 ? 'regra exibida' : 'regras exibidas'}
            </span>
            <span className="text-[#8A9A86]">•</span>
            <span>Ordem alfabética por código NCM (padrão)</span>
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
            {!hasMore && regras.length > 0 && !loading && (
              <span className="text-[11px] text-[#5A6D5A] bg-[#F5F7F1] px-2.5 py-1 rounded-md border border-[#DCE5DC]">
                Fim da lista — todas as {regras.length} regras carregadas
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
      {/* MODAL CRIAR / EDITAR REGRA */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#1C2B1C]">
              {editingId ? 'Editar Regra NCM' : 'Nova Regra NCM × Embalagem'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5A6D5A]">
              Especifique as embalagens autorizadas e exigências legais para o código TIPI.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="formNcm" className="text-xs font-semibold text-[#1C2B1C]">
                Código NCM (8 dígitos) *
              </Label>
              <Input
                id="formNcm"
                required
                maxLength={10}
                value={formNcm}
                onChange={(e) => setFormNcm(e.target.value)}
                placeholder="Ex.: 38089324"
                className="h-9 text-xs font-mono font-bold text-[#1B5E20] border-[#DCE5DC]"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="formDesc" className="text-xs font-semibold text-[#1C2B1C]">
                Descrição Fiscal TIPI *
              </Label>
              <Input
                id="formDesc"
                required
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
                placeholder="Ex.: Herbicidas à base de glifosato ou seus sais"
                className="h-9 text-xs border-[#DCE5DC]"
              />
            </div>

            {/* Multi-Select de Embalagens */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#1C2B1C]">
                Embalagens Permitidas (Selecione as opções autorizadas):
              </Label>
              <div className="grid grid-cols-3 gap-2 p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC] max-h-48 overflow-y-auto">
                {OPCOES_EMBALAGEM.map((emb) => {
                  const isChecked = formEmbalagens.includes(emb)
                  return (
                    <button
                      key={emb}
                      type="button"
                      onClick={() => toggleEmbalagem(emb)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left ${
                        isChecked
                          ? 'bg-[#1B5E20] text-white shadow-sm'
                          : 'bg-white text-[#1C2B1C] hover:bg-emerald-50 border border-[#DCE5DC]'
                      }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                          isChecked ? 'border-white bg-[#1B5E20]' : 'border-gray-400 bg-white'
                        }`}
                      >
                        {isChecked && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                      </div>
                      <span className="truncate">{emb}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="formRegra" className="text-xs font-semibold text-[#1C2B1C]">
                Regra Especial ou Observação de Embargo (Opcional)
              </Label>
              <Input
                id="formRegra"
                value={formRegraEspecial}
                onChange={(e) => setFormRegraEspecial(e.target.value)}
                placeholder="Ex.: Exige laudo de retenção ou lacre com selo MAPA"
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
                Salvar Regra
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
