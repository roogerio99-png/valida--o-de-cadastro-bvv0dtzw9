import React, { useState, useEffect, useCallback, useTransition } from 'react'
import {
  Search,
  RefreshCw,
  Package,
  Layers,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollableTable } from '@/components/ScrollableTable'
import { listarProdutosBaseSimulador, SimProdutoBaseItem } from '@/services/agroService'

interface AbaBaseProdutosProps {
  ativa: boolean
}

export function AbaBaseProdutos({ ativa }: AbaBaseProdutosProps) {
  const [items, setItems] = useState<SimProdutoBaseItem[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [page, setPage] = useState<number>(1)
  const [perPage, setPerPage] = useState<number>(25)
  const [search, setSearch] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false)
  const [, startTransition] = useTransition()

  // Constrói filtro PocketBase seguro
  const buildFilter = useCallback(() => {
    const termo = search.trim()
    if (!termo) return undefined
    const clean = termo.replace(/'/g, "\\'")
    return `codigo ~ '${clean}' || descricao ~ '${clean}' || ncm ~ '${clean}'`
  }, [search])

  const carregarDados = useCallback(
    async (targetPage = 1, targetPerPage = perPage) => {
      try {
        setLoading(true)
        const filter = buildFilter()
        const res = await listarProdutosBaseSimulador({
          page: targetPage,
          perPage: targetPerPage,
          filter,
          sort: 'codigo',
        })
        setItems(res.items || [])
        setTotalCount(res.totalItems || 0)
        setTotalPages(res.totalPages || 1)
        setPage(targetPage)
        setHasLoadedOnce(true)
      } catch (err) {
        console.error('Erro ao listar sim_produtos_base:', err)
        setItems([])
        setTotalCount(0)
        setTotalPages(1)
      } finally {
        setLoading(false)
      }
    },
    [buildFilter, perPage],
  )

  // Lazy loading: dispara a carga inicial somente quando a aba for ativada pela primeira vez
  useEffect(() => {
    if (ativa && !hasLoadedOnce) {
      carregarDados(1, perPage)
    }
  }, [ativa, hasLoadedOnce, carregarDados, perPage])

  // Recarrega ao trocar busca (retorna para página 1)
  useEffect(() => {
    if (!hasLoadedOnce) return
    const timer = setTimeout(() => {
      carregarDados(1, perPage)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, carregarDados, hasLoadedOnce, perPage])

  const formatarMoeda = (valor?: number, moeda = 'BRL') => {
    if (valor === undefined || valor === null || isNaN(valor)) return '—'
    try {
      return valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: moeda === 'USD' ? 'USD' : 'BRL',
      })
    } catch {
      return `R$ ${valor.toFixed(2).replace('.', ',')}`
    }
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Barra Superior: Busca, Contagem e Ações */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6D5A]" />
            <Input
              value={search}
              onChange={(e) => {
                const val = e.target.value
                startTransition(() => {
                  setSearch(val)
                })
              }}
              placeholder="Buscar por código, descrição ou NCM do produto..."
              className="pl-9 text-xs h-9 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
            />
          </div>

          <div className="flex items-center gap-2 justify-between sm:justify-end">
            <div className="flex items-center gap-1.5 text-xs text-[#5A6D5A] bg-[#F5F7F1] px-3 py-1.5 rounded-lg border border-[#DCE5DC]">
              <Package className="w-3.5 h-3.5 text-[#1B5E20]" />
              <span className="font-semibold text-[#1C2B1C]">{totalCount}</span>
              <span>{totalCount === 1 ? 'produto' : 'produtos'}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => carregarDados(page, perPage)}
              disabled={loading}
              className="text-xs h-9 border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50"
              title="Atualizar lista"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 text-[#1B5E20] ${loading ? 'animate-spin' : ''}`}
              />
              Atualizar
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabela de Produtos Base */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden flex flex-col">
        <ScrollableTable autoFitHeight={false} maxHeight="540px" minHeight="240px">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20 bg-[#F5F7F1] shadow-[0_1px_0_0_#DCE5DC]">
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-3 font-semibold w-24 whitespace-nowrap">Código</th>
                <th className="py-3 px-3 font-semibold min-w-[240px]">Descrição (B1_DESC)</th>
                <th className="py-3 px-3 font-semibold w-32 whitespace-nowrap">NCM</th>
                <th className="py-3 px-3 font-semibold w-32 whitespace-nowrap">Embalagem</th>
                <th className="py-3 px-3 font-semibold w-28 whitespace-nowrap">Origem</th>
                <th className="py-3 px-3 font-semibold w-24 text-center whitespace-nowrap">
                  Moeda
                </th>
                <th className="py-3 px-3 font-semibold w-32 text-right whitespace-nowrap">
                  Preço Base
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando base de produtos...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <div className="max-w-md mx-auto space-y-2">
                      <p className="font-semibold text-gray-800">Nenhum produto encontrado</p>
                      <p className="text-gray-500">
                        {search.trim()
                          ? `Nenhum registro para o termo "${search}". Tente outra busca.`
                          : 'Importe a aba Produtos Base na Central de Importação.'}
                      </p>
                      <Link to="/importar">
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 text-xs border-[#DCE5DC] text-[#1B5E20] hover:bg-emerald-50"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                          Ir para Central de Importação (/importar)
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((prod) => {
                  const isImportado =
                    prod.origem?.toLowerCase().includes('imp') ||
                    prod.descricao?.toUpperCase().includes('(IMP)') ||
                    prod.moeda === 'USD'

                  return (
                    <tr key={prod.id} className="hover:bg-[#F5F7F1]/60 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#1C2B1C] whitespace-nowrap">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] border border-gray-200">
                          {prod.codigo || '—'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-medium text-[#1C2B1C]">
                        <div className="font-semibold text-gray-900">{prod.descricao}</div>
                        {prod.tipo_produto && (
                          <div className="text-[10px] text-gray-500">{prod.tipo_produto}</div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[11px] text-gray-700 whitespace-nowrap">
                        {prod.ncm ? (
                          <span className="bg-emerald-50 text-emerald-900 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">
                            {prod.ncm}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                        {prod.embalagem ? (
                          <span className="text-xs">{prod.embalagem}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium py-0 px-2 ${
                            isImportado
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {prod.origem || (isImportado ? 'Importado' : 'Nacional')}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] font-bold py-0 px-1.5 text-gray-700 border-gray-300"
                        >
                          {prod.moeda || 'BRL'}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                        {formatarMoeda(prod.preco_base_sugerido, prod.moeda)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </ScrollableTable>

        {/* Rodapé com Paginação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 border-t border-[#DCE5DC] bg-[#FAFBF9] text-xs text-[#5A6D5A]">
          <div className="flex items-center gap-2">
            <span>
              Mostrando {items.length} de {totalCount} {totalCount === 1 ? 'produto' : 'produtos'}
            </span>
            <span className="text-[#8A9A86] hidden sm:inline">•</span>
            <span className="hidden sm:inline">
              Página {page} de {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-gray-500">Por página:</span>
              <Select
                value={String(perPage)}
                onValueChange={(val) => {
                  const novo = Number(val)
                  setPerPage(novo)
                  carregarDados(1, novo)
                }}
              >
                <SelectTrigger className="h-7 w-16 text-xs border-[#DCE5DC]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => carregarDados(Math.max(1, page - 1), perPage)}
                disabled={page <= 1 || loading}
                className="h-7 px-2 text-xs border-[#DCE5DC]"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Anterior
              </Button>
              <div className="px-2 font-mono font-semibold text-xs text-[#1C2B1C]">
                {page} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => carregarDados(Math.min(totalPages, page + 1), perPage)}
                disabled={page >= totalPages || loading}
                className="h-7 px-2 text-xs border-[#DCE5DC]"
              >
                Próxima
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
export default AbaBaseProdutos
