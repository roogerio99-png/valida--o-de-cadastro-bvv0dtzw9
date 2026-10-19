import { useEffect, useState, useTransition } from 'react'
import { FlaskConical, Search, ChevronRight, Loader2, X, Sliders, CheckCircle2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { listarPrincipiosAtivos } from '@/services/agroService'
import type { DicionarioPrincipioAtivo } from '@/types/agro'

export default function PrincipiosAtivos() {
  const [principios, setPrincipios] = useState<DicionarioPrincipioAtivo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [, startTransition] = useTransition()

  // Drawer lateral de detalhes
  const [selectedItem, setSelectedItem] = useState<DicionarioPrincipioAtivo | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Paginação
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const carregarDados = async () => {
    setLoading(true)
    try {
      let filter = ''
      if (search.trim()) {
        const clean = search.trim().replace(/'/g, "\\'")
        filter = `principio_ativo ~ '${clean}' || classe ~ '${clean}' || grupo_quimico ~ '${clean}'`
      }
      const res = await listarPrincipiosAtivos({ page, perPage: 25, filter })
      setPrincipios(res.items)
      setTotalPages(res.totalPages || 1)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [page, search])

  const handleOpenDetail = (item: DicionarioPrincipioAtivo) => {
    setSelectedItem(item)
    setDrawerOpen(true)
  }

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-[#F57F17]" />
            <span>Dicionário de Princípios Ativos</span>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Base toxicológica e regulatória de ingredientes ativos, faixas de concentração e
            classificação agronômica.
          </p>
        </div>
      </div>

      {/* Barra de Filtro com Busca em Tempo Real */}
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
            placeholder="Pesquisa ao vivo por Princípio Ativo, Classe ou Grupo Químico..."
            className="pl-9 text-xs h-10 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
          />
        </div>
      </Card>

      {/* Tabela de Princípios Ativos */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-4 font-semibold">Princípio Ativo</th>
                <th className="py-3 px-4 font-semibold">Classe Agronômica</th>
                <th className="py-3 px-4 font-semibold">Grupo Químico</th>
                <th className="py-3 px-4 font-semibold">Faixa Regulamentar</th>
                <th className="py-3 px-4 font-semibold">Status MAPA</th>
                <th className="py-3 px-4 font-semibold text-right">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Consultando dicionário regulatório...
                  </td>
                </tr>
              ) : principios.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhum princípio ativo cadastrado no sistema.
                  </td>
                </tr>
              ) : (
                principios.map((pa) => (
                  <tr
                    key={pa.id}
                    onClick={() => handleOpenDetail(pa)}
                    className="hover:bg-emerald-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-[#1C2B1C] flex items-center gap-2">
                      <FlaskConical className="w-3.5 h-3.5 text-[#F57F17]" />
                      <span>{pa.principio_ativo}</span>
                    </td>
                    <td className="py-3 px-4 text-[#1C2B1C]">{pa.classe || '—'}</td>
                    <td className="py-3 px-4 text-[#5A6D5A]">{pa.grupo_quimico || '—'}</td>
                    <td className="py-3 px-4 font-mono font-medium text-[#1B5E20]">
                      {pa.concentracao_min || 0} a {pa.concentracao_max || 0} {pa.unidade || '%'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold border-0 ${
                          pa.status?.toLowerCase().includes('cancel') ||
                          pa.status?.toLowerCase().includes('suspen')
                            ? 'bg-red-100 text-red-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {pa.status || 'Ativo'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-[#5A6D5A]">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
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
      {/* DRAWER LATERAL DE DETALHES */}
      {/* ------------------------------------------------------------------ */}
      {drawerOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-250">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#DCE5DC]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#F57F17] flex items-center justify-center">
                  <FlaskConical className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1C2B1C]">Ficha Toxicológica</h3>
                  <p className="text-[11px] text-[#5A6D5A]">Dicionário Regulatório MAPA</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-[#5A6D5A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#5A6D5A]">
                  Princípio Ativo
                </span>
                <h4 className="text-lg font-bold text-[#1C2B1C] mt-0.5">
                  {selectedItem.principio_ativo}
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
                  <span className="text-[10px] text-[#5A6D5A] block">Classe Agronômica</span>
                  <strong className="text-xs text-[#1C2B1C] font-semibold">
                    {selectedItem.classe || 'Não especificada'}
                  </strong>
                </div>
                <div className="p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC]">
                  <span className="text-[10px] text-[#5A6D5A] block">Grupo Químico</span>
                  <strong className="text-xs text-[#1C2B1C] font-semibold">
                    {selectedItem.grupo_quimico || 'Não especificado'}
                  </strong>
                </div>
              </div>

              {/* Faixa de Concentração */}
              <Card className="rounded-xl border-[#DCE5DC] p-4 bg-emerald-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <Sliders className="w-4 h-4 text-[#1B5E20]" />
                  <span className="font-bold text-xs text-[#1C2B1C]">
                    Faixa de Concentração Permitida (Trava 5)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs py-2 border-y border-emerald-200/60 my-2">
                  <div>
                    <span className="text-[#5A6D5A] block text-[10px]">Mínimo</span>
                    <strong className="text-sm font-bold text-[#1B5E20]">
                      {selectedItem.concentracao_min} {selectedItem.unidade}
                    </strong>
                  </div>
                  <div className="h-6 w-[1px] bg-emerald-200" />
                  <div>
                    <span className="text-[#5A6D5A] block text-[10px]">Máximo</span>
                    <strong className="text-sm font-bold text-[#1B5E20]">
                      {selectedItem.concentracao_max} {selectedItem.unidade}
                    </strong>
                  </div>
                </div>
                <p className="text-[11px] text-[#5A6D5A] leading-relaxed">
                  Cadastros com concentrações fora desta faixa são automaticamente reprovados pela
                  Trava 5 do motor de auditoria.
                </p>
              </Card>

              {/* Situação Cadastral */}
              <div className="p-3 bg-[#F5F7F1] rounded-xl border border-[#DCE5DC] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#5A6D5A] block">Status Regulatório</span>
                  <strong className="text-xs text-[#1C2B1C]">
                    {selectedItem.status || 'Ativo'}
                  </strong>
                </div>
                <Badge className="bg-emerald-100 text-emerald-800 border-0 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Homologado
                </Badge>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-[#DCE5DC]">
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={() => setDrawerOpen(false)}
              >
                Fechar Detalhes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
