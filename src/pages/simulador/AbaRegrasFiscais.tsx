import React, { useState, useEffect, useCallback, useTransition } from 'react'
import {
  Search,
  RefreshCw,
  Scale,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  ArrowRight,
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
import { Trash2 } from 'lucide-react'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ModalLimparBase } from '@/components/ModalLimparBase'
import { useAuth } from '@/contexts/AuthContext'
import { listarRegrasIcmsSimulador, SimRegraIcmsItem } from '@/services/agroService'

interface AbaRegrasFiscaisProps {
  ativa: boolean
}

export function AbaRegrasFiscais({ ativa }: AbaRegrasFiscaisProps) {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<SimRegraIcmsItem[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [page, setPage] = useState<number>(1)
  const [perPage, setPerPage] = useState<number>(25)
  const [search, setSearch] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false)
  const [modalLimparOpen, setModalLimparOpen] = useState<boolean>(false)
  const [, startTransition] = useTransition()

  // Constrói filtro PocketBase seguro (busca por UF origem, UF destino e grupo tributário)
  const buildFilter = useCallback(() => {
    const termo = search.trim()
    if (!termo) return undefined
    const clean = termo.replace(/'/g, "\\'")
    return `uf_origem ~ '${clean}' || uf_destino ~ '${clean}' || grupo_tributario_codigo ~ '${clean}' || grupo_tributario_descricao ~ '${clean}' || chave_origem_destino ~ '${clean}'`
  }, [search])

  const carregarDados = useCallback(
    async (targetPage = 1, targetPerPage = perPage) => {
      try {
        setLoading(true)
        const filter = buildFilter()
        const res = await listarRegrasIcmsSimulador({
          page: targetPage,
          perPage: targetPerPage,
          filter,
          sort: 'uf_origem,uf_destino',
        })
        setItems(res.items || [])
        setTotalCount(res.totalItems || 0)
        setTotalPages(res.totalPages || 1)
        setPage(targetPage)
        setHasLoadedOnce(true)
      } catch (err) {
        console.error('Erro ao listar sim_regras_icms:', err)
        setItems([])
        setTotalCount(0)
        setTotalPages(1)
      } finally {
        setLoading(false)
      }
    },
    [buildFilter, perPage],
  )

  // Lazy loading: dispara a carga inicial somente quando a aba for ativada
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

  const formatarPercentual = (valor?: number) => {
    if (valor === undefined || valor === null || isNaN(valor)) return '0,0%'
    return `${valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })}%`
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
              placeholder="Buscar por UF Origem, UF Destino, GrTrib ou Descrição..."
              className="pl-9 text-xs h-9 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
            />
          </div>

          <div className="flex items-center gap-2 justify-between sm:justify-end">
            <div className="flex items-center gap-1.5 text-xs text-[#5A6D5A] bg-[#F5F7F1] px-3 py-1.5 rounded-lg border border-[#DCE5DC]">
              <Scale className="w-3.5 h-3.5 text-[#1B5E20]" />
              <span className="font-semibold text-[#1C2B1C]">{totalCount}</span>
              <span>{totalCount === 1 ? 'regra' : 'regras'}</span>
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
                  A base de regras fiscais já está vazia.
                </TooltipContent>
              ) : null}
            </Tooltip>
          </div>
        </div>
      </Card>

      {/* Tabela de Regras Fiscais */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden flex flex-col">
        <ScrollableTable autoFitHeight={false} maxHeight="540px" minHeight="240px">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20 bg-[#F5F7F1] shadow-[0_1px_0_0_#DCE5DC]">
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-3 font-semibold w-40 whitespace-nowrap">
                  UF Origem → Destino
                </th>
                <th className="py-3 px-3 font-semibold w-32 whitespace-nowrap">Operação</th>
                <th className="py-3 px-3 font-semibold w-24 whitespace-nowrap text-center">
                  GrTrib
                </th>
                <th className="py-3 px-3 font-semibold min-w-[220px]">
                  Descrição Grupo Tributário
                </th>
                <th className="py-3 px-3 font-semibold w-28 whitespace-nowrap text-center">
                  Prod. Importado
                </th>
                <th className="py-3 px-3 font-semibold w-28 text-right whitespace-nowrap">
                  Alíquota ICMS
                </th>
                <th className="py-3 px-3 font-semibold w-28 text-right whitespace-nowrap">
                  Alíquota Efetiva
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando regras fiscais de ICMS...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <div className="max-w-md mx-auto space-y-2">
                      <p className="font-semibold text-gray-800">Nenhuma regra encontrada</p>
                      <p className="text-gray-500">
                        {search.trim()
                          ? `Nenhum registro para o filtro "${search}". Tente outros termos.`
                          : 'Nenhuma regra encontrada — importe a aba Regra ICMS em /importar.'}
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
                items.map((regra) => {
                  const isInterna =
                    regra.tipo_operacao?.toLowerCase().includes('interna') ||
                    regra.uf_origem === regra.uf_destino
                  const isImportado =
                    regra.prod_importado?.toLowerCase() === 'sim' ||
                    regra.prod_importado?.toLowerCase() === 's'

                  return (
                    <tr key={regra.id} className="hover:bg-[#F5F7F1]/60 transition-colors">
                      {/* UF Origem → Destino */}
                      <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                          <span className="bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded font-bold border border-emerald-300">
                            {regra.uf_origem}
                          </span>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="bg-sky-100 text-sky-900 px-1.5 py-0.5 rounded font-bold border border-sky-300">
                            {regra.uf_destino}
                          </span>
                        </div>
                      </td>

                      {/* Operação */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium py-0 px-2 ${
                            isInterna
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-purple-50 text-purple-800 border-purple-200'
                          }`}
                        >
                          {regra.tipo_operacao || (isInterna ? 'Interna' : 'Interestadual')}
                        </Badge>
                      </td>

                      {/* GrTrib */}
                      <td className="py-2.5 px-3 text-center font-mono font-semibold text-gray-800 whitespace-nowrap">
                        {regra.grupo_tributario_codigo ? (
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] border border-gray-200">
                            {regra.grupo_tributario_codigo}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Descrição Grupo Tributário */}
                      <td className="py-2.5 px-3 text-gray-800">
                        <div className="font-medium">{regra.grupo_tributario_descricao || '—'}</div>
                        {regra.fundamentacao_legal && (
                          <div className="text-[10px] text-gray-500 truncate max-w-md">
                            {regra.fundamentacao_legal}
                          </div>
                        )}
                      </td>

                      {/* Prod. Importado */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium py-0 px-1.5 ${
                            isImportado
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}
                        >
                          {regra.prod_importado || (isImportado ? 'Sim' : 'Não')}
                        </Badge>
                      </td>

                      {/* Alíquota ICMS */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">
                        {formatarPercentual(regra.aliquota_icms)}
                      </td>

                      {/* Alíquota Efetiva */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-900 whitespace-nowrap">
                        <span className="bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {formatarPercentual(regra.aliquota_efetiva)}
                        </span>
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
              Mostrando {items.length} de {totalCount} {totalCount === 1 ? 'regra' : 'regras'}
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

      {/* Modal de Limpeza Total das Regras Fiscais */}
      <ModalLimparBase
        open={modalLimparOpen}
        onOpenChange={setModalLimparOpen}
        alvo="sim_regras_icms"
        tituloAlvo="Regras Fiscais ICMS (Simulador Comercial)"
        totalRegistros={totalCount}
        onSucesso={() => {
          setItems([])
          setTotalCount(0)
          setTotalPages(1)
          setPage(1)
        }}
      />
    </div>
  )
}
export default AbaRegrasFiscais
