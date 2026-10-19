import React, { useEffect, useState, useTransition } from 'react'
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
]

export default function Regras() {
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

  // Paginação simples
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const carregarRegras = async () => {
    setLoading(true)
    try {
      let filter = ''
      if (search.trim()) {
        const clean = search.trim().replace(/'/g, "\\'")
        filter = `ncm ~ '${clean}' || descricao ~ '${clean}'`
      }
      const res = await listarRegrasNcm({ page, perPage: 20, filter })
      setRegras(res.items)
      setTotalPages(res.totalPages || 1)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarRegras()
  }, [page, search])

  useRealtime('regras_ncm_embalagem', () => carregarRegras())

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
    let emb: string[] = []
    if (Array.isArray(regra.embalagens_permitidas)) {
      emb = regra.embalagens_permitidas
    } else if (typeof regra.embalagens_permitidas === 'string') {
      try {
        emb = JSON.parse(regra.embalagens_permitidas)
      } catch (_) {
        emb = []
      }
    }
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

    const payload = {
      ncm: formNcm.replace(/\D/g, ''),
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

    const headers = ['NCM', 'Descrição', 'Embalagens Permitidas', 'Regra Especial']
    const rows = regras.map((r) => [
      `"${r.ncm}"`,
      `"${(r.descricao || '').replace(/"/g, '""')}"`,
      `"${(Array.isArray(r.embalagens_permitidas) ? r.embalagens_permitidas.join('; ') : '').replace(/"/g, '""')}"`,
      `"${(r.regra_especial || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
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
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-[#1B5E20]" />
            <span>Matriz de Regras NCM × Embalagem</span>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Definição das embalagens autorizadas e restrições de embargo por classificação fiscal
            TIPI.
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
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="text-xs h-9 bg-[#1B5E20] hover:bg-[#2E7D32] text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            Nova Regra NCM
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
                setPage(1)
              })
            }}
            placeholder="Filtrar por código NCM ou descrição técnica..."
            className="pl-9 text-xs h-10 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
          />
        </div>
      </Card>

      {/* Tabela de Regras */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-4 font-semibold">NCM</th>
                <th className="py-3 px-4 font-semibold">Descrição Fiscal</th>
                <th className="py-3 px-4 font-semibold">Embalagens Permitidas</th>
                <th className="py-3 px-4 font-semibold">Regra Especial / Embargo</th>
                <th className="py-3 px-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando matriz de regras...
                  </td>
                </tr>
              ) : regras.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhuma regra cadastrada ou encontrada para o filtro.
                  </td>
                </tr>
              ) : (
                regras.map((r) => {
                  let embalagensArray: string[] = []
                  if (Array.isArray(r.embalagens_permitidas)) {
                    embalagensArray = r.embalagens_permitidas
                  } else if (typeof r.embalagens_permitidas === 'string') {
                    try {
                      embalagensArray = JSON.parse(r.embalagens_permitidas)
                    } catch {
                      /* intentionally ignored */
                    }
                  }

                  return (
                    <tr key={r.id} className="hover:bg-[#F5F7F1]/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#1B5E20] whitespace-nowrap">
                        {r.ncm}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#1C2B1C] max-w-[280px]">
                        {r.descricao || '—'}
                      </td>
                      <td className="py-3 px-4 max-w-[320px]">
                        <div className="flex flex-wrap gap-1">
                          {embalagensArray.length > 0 ? (
                            embalagensArray.map((emb) => (
                              <Badge
                                key={emb}
                                variant="outline"
                                className="bg-emerald-50 text-emerald-900 border-emerald-200 text-[10px] py-0 px-2 font-normal"
                              >
                                {emb}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[#5A6D5A] italic">Sem restrições</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#5A6D5A] max-w-[200px] truncate">
                        {r.regra_especial || '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(r)}
                          className="h-7 w-7 text-[#5A6D5A] hover:text-[#1B5E20] hover:bg-emerald-50 mr-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(r.id, r.ncm)}
                          className="h-7 w-7 text-[#5A6D5A] hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
              Página {page} de {totalPages}
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
