import React, { useState, useEffect, useCallback, useTransition } from 'react'
import {
  Search,
  RefreshCw,
  Package,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  Trash2,
  AlertTriangle,
  Building2,
  DollarSign,
  Tag,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ModalLimparBase } from '@/components/ModalLimparBase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import {
  listarProdutosBaseSimulador,
  atualizarProdutoBaseSimulador,
  excluirProdutoBaseSimulador,
  SimProdutoBaseItem,
} from '@/services/agroService'

interface AbaBaseProdutosProps {
  ativa: boolean
}

interface FormEdicaoProduto {
  id: string
  codigo: string
  descricao: string
  ncm: string
  embalagem: string
  unidade: string
  tipo_produto: string
  origem: string
  moeda: string
  preco_base_sugerido: string // manipulado como string para permitir vírgula pt-BR
  gr_trib: string
  grupo_codigo: string
  grupo_descricao: string
  descricao_grupo_tributario: string
  segmento: string
  comissao_padrao: string
  fabricante: string
  principio_ativo: string
}

export function AbaBaseProdutos({ ativa }: AbaBaseProdutosProps) {
  const { isAdmin } = useAuth()
  const { toast } = useToast()

  const [items, setItems] = useState<SimProdutoBaseItem[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [page, setPage] = useState<number>(1)
  const [perPage, setPerPage] = useState<number>(25)
  const [search, setSearch] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false)
  const [, startTransition] = useTransition()

  // Estados de Edição
  const [itemEditando, setItemEditando] = useState<FormEdicaoProduto | null>(null)
  const [modalEditarAberto, setModalEditarAberto] = useState<boolean>(false)
  const [salvandoEdicao, setSalvandoEdicao] = useState<boolean>(false)
  const [errosEdicao, setErrosEdicao] = useState<{
    descricao?: string
    ncm?: string
    preco?: string
  }>({})

  // Estados de Exclusão
  const [itemExcluindo, setItemExcluindo] = useState<SimProdutoBaseItem | null>(null)
  const [modalExcluirAberto, setModalExcluirAberto] = useState<boolean>(false)
  const [executandoExclusao, setExecutandoExclusao] = useState<boolean>(false)
  const [modalLimparOpen, setModalLimparOpen] = useState<boolean>(false)

  // Constrói filtro PocketBase seguro
  const buildFilter = useCallback(() => {
    const termo = search.trim()
    if (!termo) return undefined
    const clean = termo.replace(/'/g, "\\'")
    return `codigo ~ '${clean}' || descricao ~ '${clean}' || ncm ~ '${clean}' || descricao_grupo_tributario ~ '${clean}' || segmento ~ '${clean}'`
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

  // Abre modal de edição preenchendo o formulário
  const handleAbrirEdicao = (prod: SimProdutoBaseItem) => {
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Acesso restrito',
        description: 'Apenas administradores podem editar registros da base de produtos.',
      })
      return
    }

    const precoFormatado =
      prod.preco_base_sugerido !== undefined && prod.preco_base_sugerido !== null
        ? String(prod.preco_base_sugerido).replace('.', ',')
        : '0,00'

    const comissaoFormatada =
      prod.comissao_padrao !== undefined && prod.comissao_padrao !== null
        ? String(prod.comissao_padrao).replace('.', ',')
        : ''

    setItemEditando({
      id: prod.id,
      codigo: prod.codigo || '',
      descricao: prod.descricao || '',
      ncm: prod.ncm || '',
      embalagem: prod.embalagem || '',
      unidade: prod.unidade || 'L',
      tipo_produto: prod.tipo_produto || 'Produto Formulado Comercial',
      origem: prod.origem || 'Nacional',
      moeda: prod.moeda || 'BRL',
      preco_base_sugerido: precoFormatado,
      gr_trib: prod.gr_trib || '',
      grupo_codigo: prod.grupo_codigo || '',
      grupo_descricao: prod.grupo_descricao || '',
      descricao_grupo_tributario: prod.descricao_grupo_tributario || '',
      segmento: prod.segmento || '',
      comissao_padrao: comissaoFormatada,
      fabricante: prod.fabricante || '',
      principio_ativo: prod.principio_ativo || '',
    })
    setErrosEdicao({})
    setModalEditarAberto(true)
  }

  // Validação e submissão do formulário de edição
  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemEditando) return

    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Acesso restrito',
        description: 'Apenas administradores podem salvar alterações.',
      })
      return
    }

    const novosErros: { descricao?: string; ncm?: string; preco?: string } = {}

    // 1. Descrição obrigatória
    if (!itemEditando.descricao.trim()) {
      novosErros.descricao = 'A descrição do produto é obrigatória.'
    }

    // 2. Validação de NCM se preenchida: formato 0000.00.00 (8 dígitos)
    const ncmDigits = itemEditando.ncm.replace(/\D/g, '')
    let ncmFormatado = itemEditando.ncm.trim()
    if (itemEditando.ncm.trim()) {
      if (ncmDigits.length !== 8) {
        novosErros.ncm = 'O NCM deve conter 8 dígitos numéricos (formato 0000.00.00).'
      } else {
        ncmFormatado = `${ncmDigits.slice(0, 4)}.${ncmDigits.slice(4, 6)}.${ncmDigits.slice(6, 8)}`
      }
    }

    // 3. Validação do preço (aceitando vírgula pt-BR)
    const precoLimpo = itemEditando.preco_base_sugerido.trim().replace(/\./g, '').replace(',', '.')
    const precoNum = precoLimpo === '' ? 0 : parseFloat(precoLimpo)
    if (isNaN(precoNum) || precoNum < 0) {
      novosErros.preco = 'Informe um preço numérico válido maior ou igual a zero.'
    }

    // Validação da comissão padrão se preenchida
    const comissaoLimpa = itemEditando.comissao_padrao.trim().replace(/\./g, '').replace(',', '.')
    const comissaoNum = comissaoLimpa === '' ? 0 : parseFloat(comissaoLimpa)

    if (Object.keys(novosErros).length > 0) {
      setErrosEdicao(novosErros)
      return
    }

    try {
      setSalvandoEdicao(true)
      const atualizado = await atualizarProdutoBaseSimulador(itemEditando.id, {
        descricao: itemEditando.descricao,
        ncm: ncmFormatado,
        embalagem: itemEditando.embalagem,
        unidade: itemEditando.unidade,
        tipo_produto: itemEditando.tipo_produto,
        origem: itemEditando.origem,
        moeda: itemEditando.moeda,
        preco_base_sugerido: precoNum,
        gr_trib: itemEditando.gr_trib,
        grupo_codigo: itemEditando.grupo_codigo,
        grupo_descricao: itemEditando.grupo_descricao,
        descricao_grupo_tributario: itemEditando.descricao_grupo_tributario,
        segmento: itemEditando.segmento,
        comissao_padrao: comissaoNum,
        fabricante: itemEditando.fabricante,
        principio_ativo: itemEditando.principio_ativo,
      })

      // Atualiza a linha na tabela localmente com os dados salvos
      setItems((prev) =>
        prev.map((item) => (item.id === atualizado.id ? { ...item, ...atualizado } : item)),
      )

      toast({
        title: 'Produto atualizado com sucesso',
        description: `O produto "${itemEditando.descricao}" foi atualizado na base.`,
      })

      setModalEditarAberto(false)
      setItemEditando(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao atualizar o produto.'
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar produto',
        description: msg,
      })
    } finally {
      setSalvandoEdicao(false)
    }
  }

  // Abre diálogo de exclusão
  const handleAbrirExclusao = (prod: SimProdutoBaseItem) => {
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Acesso restrito',
        description: 'Apenas administradores podem excluir registros da base de produtos.',
      })
      return
    }
    setItemExcluindo(prod)
    setModalExcluirAberto(true)
  }

  // Executa exclusão no PocketBase
  const handleConfirmarExclusao = async () => {
    if (!itemExcluindo) return

    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Acesso restrito',
        description: 'Apenas administradores podem excluir registros.',
      })
      return
    }

    try {
      setExecutandoExclusao(true)
      await excluirProdutoBaseSimulador(itemExcluindo.id)

      // Remove da tabela e atualiza contagem
      setItems((prev) => prev.filter((item) => item.id !== itemExcluindo.id))
      setTotalCount((prev) => Math.max(0, prev - 1))

      toast({
        title: 'Produto excluído',
        description: `O produto [${itemExcluindo.codigo || itemExcluindo.id}] foi removido permanentemente da base.`,
      })

      setModalExcluirAberto(false)
      setItemExcluindo(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir o produto.'
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir produto',
        description: msg,
      })
    } finally {
      setExecutandoExclusao(false)
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
                  A base de produtos já está vazia.
                </TooltipContent>
              ) : null}
            </Tooltip>
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
                <th className="py-3 px-3 font-semibold w-24 whitespace-nowrap text-center">
                  GrTrib
                </th>
                <th className="py-3 px-3 font-semibold min-w-[150px] whitespace-nowrap">
                  Desc. Gr. Trib.
                </th>
                <th className="py-3 px-3 font-semibold w-28 whitespace-nowrap">Segmento</th>
                <th className="py-3 px-3 font-semibold w-24 text-right whitespace-nowrap">
                  Comissão
                </th>
                <th className="py-3 px-3 font-semibold w-28 whitespace-nowrap">NCM</th>
                <th className="py-3 px-3 font-semibold w-24 whitespace-nowrap">Embalagem</th>
                <th className="py-3 px-3 font-semibold w-24 whitespace-nowrap">Origem</th>
                <th className="py-3 px-3 font-semibold w-16 text-center whitespace-nowrap">
                  Moeda
                </th>
                <th className="py-3 px-3 font-semibold w-24 text-right whitespace-nowrap">
                  Preço Base
                </th>
                <th className="py-3 px-3 font-semibold w-16 text-center whitespace-nowrap">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando base de produtos...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-xs text-[#5A6D5A]">
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

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {prod.gr_trib ? (
                          <span className="font-mono text-[11px] font-bold bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                            {prod.gr_trib}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                        {prod.descricao_grupo_tributario ? (
                          <span className="text-[11px] font-medium bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                            {prod.descricao_grupo_tributario}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                        {prod.segmento ? (
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {prod.segmento}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-gray-800 whitespace-nowrap">
                        {prod.comissao_padrao !== undefined &&
                        prod.comissao_padrao !== null &&
                        prod.comissao_padrao > 0 ? (
                          <span className="font-semibold">
                            {(prod.comissao_padrao * 100).toFixed(1).replace('.', ',')}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
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

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAbrirEdicao(prod)}
                            disabled={!isAdmin}
                            className={`h-7 w-7 ${
                              isAdmin
                                ? 'text-[#5A6D5A] hover:text-[#1B5E20] hover:bg-emerald-50'
                                : 'text-gray-300 cursor-not-allowed'
                            }`}
                            title={isAdmin ? 'Editar produto' : 'Edição restrita a administradores'}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAbrirExclusao(prod)}
                            disabled={!isAdmin}
                            className={`h-7 w-7 ${
                              isAdmin
                                ? 'text-[#5A6D5A] hover:text-red-700 hover:bg-red-50'
                                : 'text-gray-300 cursor-not-allowed'
                            }`}
                            title={
                              isAdmin ? 'Excluir produto' : 'Exclusão restrita a administradores'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </ScrollableTable>

        {/* Modal de Edição (shadcn Dialog) */}
        <Dialog open={modalEditarAberto} onOpenChange={setModalEditarAberto}>
          <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#1B5E20]" />
                <span>Editar Produto da Base do Simulador</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-[#5A6D5A]">
                Atualize os atributos do produto. O código é a chave de identidade e não pode ser
                alterado.
              </DialogDescription>
            </DialogHeader>

            {itemEditando && (
              <form onSubmit={handleSalvarEdicao} className="space-y-4 py-2 text-xs">
                {/* Código (somente leitura) e Grupo Tributário */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">
                      Código (Chave Identificadora)
                    </Label>
                    <Input
                      disabled
                      value={itemEditando.codigo || '—'}
                      className="h-9 text-xs font-mono font-bold bg-gray-100 text-gray-700 border-[#DCE5DC]"
                    />
                    <p className="text-[10px] text-gray-400">Chave imutável do registro</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">NCM (0000.00.00)</Label>
                    <Input
                      value={itemEditando.ncm}
                      onChange={(e) => {
                        const val = e.target.value
                        setItemEditando({ ...itemEditando, ncm: val })
                        if (errosEdicao.ncm) {
                          setErrosEdicao({ ...errosEdicao, ncm: undefined })
                        }
                      }}
                      placeholder="Ex: 3808.92.99"
                      className={`h-9 text-xs font-mono font-bold border-[#DCE5DC] ${
                        errosEdicao.ncm ? 'border-red-500 focus-visible:ring-red-400' : ''
                      }`}
                    />
                    {errosEdicao.ncm && (
                      <p className="text-[10px] text-red-600 font-medium">{errosEdicao.ncm}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">
                      Grupo Tributário (GrTrib)
                    </Label>
                    <Input
                      value={itemEditando.gr_trib}
                      onChange={(e) =>
                        setItemEditando({ ...itemEditando, gr_trib: e.target.value })
                      }
                      placeholder="Ex: 001, 002, 004"
                      className="h-9 text-xs font-mono font-semibold border-[#DCE5DC]"
                    />
                  </div>
                </div>

                {/* Descrição */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#1C2B1C]">
                    Descrição do Produto (B1_DESC) *
                  </Label>
                  <Input
                    required
                    value={itemEditando.descricao}
                    onChange={(e) => {
                      setItemEditando({ ...itemEditando, descricao: e.target.value })
                      if (errosEdicao.descricao) {
                        setErrosEdicao({ ...errosEdicao, descricao: undefined })
                      }
                    }}
                    placeholder="Descrição completa do produto"
                    className={`h-9 text-xs border-[#DCE5DC] ${
                      errosEdicao.descricao ? 'border-red-500 focus-visible:ring-red-400' : ''
                    }`}
                  />
                  {errosEdicao.descricao && (
                    <p className="text-[10px] text-red-600 font-medium">{errosEdicao.descricao}</p>
                  )}
                </div>

                {/* Linha dos Novos Campos: Descrição Grupo Tributário, Segmento e Comissão Padrão */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-emerald-50/50 rounded-xl border border-emerald-200">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">
                      Descrição Grupo Tributário
                    </Label>
                    <Input
                      value={itemEditando.descricao_grupo_tributario}
                      onChange={(e) =>
                        setItemEditando({
                          ...itemEditando,
                          descricao_grupo_tributario: e.target.value,
                        })
                      }
                      placeholder="Ex: DEFENSIVOS, FERTILIZANTES"
                      className="h-9 text-xs border-[#DCE5DC] bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">Segmento</Label>
                    <Input
                      value={itemEditando.segmento}
                      onChange={(e) =>
                        setItemEditando({ ...itemEditando, segmento: e.target.value })
                      }
                      placeholder="Ex: CROP, ESSENTIALS"
                      className="h-9 text-xs border-[#DCE5DC] bg-white font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">
                      Comissão Padrão (Ex: 0,025 = 2,5%)
                    </Label>
                    <Input
                      value={itemEditando.comissao_padrao}
                      onChange={(e) =>
                        setItemEditando({ ...itemEditando, comissao_padrao: e.target.value })
                      }
                      placeholder="Ex: 0,025"
                      className="h-9 text-xs font-mono border-[#DCE5DC] bg-white font-semibold"
                    />
                  </div>
                </div>

                {/* Grupo ERP: B1_GRUPO e BM_DESC */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">
                      Código do Grupo ERP (B1_GRUPO)
                    </Label>
                    <Input
                      value={itemEditando.grupo_codigo}
                      onChange={(e) =>
                        setItemEditando({ ...itemEditando, grupo_codigo: e.target.value })
                      }
                      placeholder="Ex: 0102, 0213"
                      className="h-9 text-xs font-mono border-[#DCE5DC]"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">
                      Descrição do Grupo ERP (BM_DESC)
                    </Label>
                    <Input
                      value={itemEditando.grupo_descricao}
                      onChange={(e) =>
                        setItemEditando({ ...itemEditando, grupo_descricao: e.target.value })
                      }
                      placeholder="Ex: DEFENSIVOS - FUNGICIDAS"
                      className="h-9 text-xs border-[#DCE5DC]"
                    />
                  </div>
                </div>

                {/* Embalagem, Unidade e Tipo de Produto */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">Embalagem</Label>
                    <Input
                      value={itemEditando.embalagem}
                      onChange={(e) =>
                        setItemEditando({ ...itemEditando, embalagem: e.target.value })
                      }
                      placeholder="Ex: 1X20L, 20KG, 200L"
                      className="h-9 text-xs border-[#DCE5DC]"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">Unidade</Label>
                    <Select
                      value={itemEditando.unidade || 'L'}
                      onValueChange={(val) => setItemEditando({ ...itemEditando, unidade: val })}
                    >
                      <SelectTrigger className="h-9 text-xs border-[#DCE5DC] bg-white font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L">L (Litros)</SelectItem>
                        <SelectItem value="KG">KG (Quilos)</SelectItem>
                        <SelectItem value="SC">SC (Sacas)</SelectItem>
                        <SelectItem value="UN">UN (Unidade)</SelectItem>
                        <SelectItem value="DOSES">DOSES</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">Tipo de Produto</Label>
                    <Select
                      value={itemEditando.tipo_produto || 'Produto Formulado Comercial'}
                      onValueChange={(val) =>
                        setItemEditando({ ...itemEditando, tipo_produto: val })
                      }
                    >
                      <SelectTrigger className="h-9 text-xs border-[#DCE5DC] bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Produto Formulado Comercial">
                          Produto Formulado Comercial
                        </SelectItem>
                        <SelectItem value="Fertilizante Mineral / Organomineral">
                          Fertilizante Mineral / Organomineral
                        </SelectItem>
                        <SelectItem value="Adjuvante / Espalhante Adesivo">
                          Adjuvante / Espalhante Adesivo
                        </SelectItem>
                        <SelectItem value="Inoculante / Biológico">
                          Inoculante / Biológico
                        </SelectItem>
                        <SelectItem value="Corretivo / Condicionador de Solo">
                          Corretivo / Condicionador de Solo
                        </SelectItem>
                        <SelectItem value="Semente Certificada">Semente Certificada</SelectItem>
                        <SelectItem value="Produto Técnico Industrial">
                          Produto Técnico Industrial
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Origem, Moeda e Preço Base Sugerido */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#F5F7F1]/80 rounded-xl border border-[#DCE5DC]">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">Origem</Label>
                    <Select
                      value={itemEditando.origem || 'Nacional'}
                      onValueChange={(val) =>
                        setItemEditando({
                          ...itemEditando,
                          origem: val,
                          moeda: val === 'Importado' ? 'USD' : itemEditando.moeda,
                        })
                      }
                    >
                      <SelectTrigger className="h-9 text-xs border-[#DCE5DC] bg-white font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nacional">Nacional</SelectItem>
                        <SelectItem value="Importado">Importado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">Moeda</Label>
                    <Select
                      value={itemEditando.moeda || 'BRL'}
                      onValueChange={(val) => setItemEditando({ ...itemEditando, moeda: val })}
                    >
                      <SelectTrigger className="h-9 text-xs border-[#DCE5DC] bg-white font-mono font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BRL">BRL (R$)</SelectItem>
                        <SelectItem value="USD">USD (US$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-[#1B5E20]" />
                      <span>Preço Base Sugerido</span>
                    </Label>
                    <Input
                      value={itemEditando.preco_base_sugerido}
                      onChange={(e) => {
                        setItemEditando({
                          ...itemEditando,
                          preco_base_sugerido: e.target.value,
                        })
                        if (errosEdicao.preco) {
                          setErrosEdicao({ ...errosEdicao, preco: undefined })
                        }
                      }}
                      placeholder="0,00"
                      className={`h-9 text-xs font-mono font-bold border-[#DCE5DC] bg-white ${
                        errosEdicao.preco ? 'border-red-500 focus-visible:ring-red-400' : ''
                      }`}
                    />
                    {errosEdicao.preco && (
                      <p className="text-[10px] text-red-600 font-medium">{errosEdicao.preco}</p>
                    )}
                  </div>
                </div>

                {/* Fabricante e Princípio Ativo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C] flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-gray-500" />
                      <span>Fabricante</span>
                    </Label>
                    <Input
                      value={itemEditando.fabricante}
                      onChange={(e) =>
                        setItemEditando({ ...itemEditando, fabricante: e.target.value })
                      }
                      placeholder="Ex: MOSAIC, BAYER, SYNGENTA"
                      className="h-9 text-xs border-[#DCE5DC]"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#1C2B1C]">Princípio Ativo</Label>
                    <Input
                      value={itemEditando.principio_ativo}
                      onChange={(e) =>
                        setItemEditando({ ...itemEditando, principio_ativo: e.target.value })
                      }
                      placeholder="Ex: GLIFOSATO, ATRAZINA"
                      className="h-9 text-xs border-[#DCE5DC]"
                    />
                  </div>
                </div>

                <DialogFooter className="pt-3 border-t border-[#DCE5DC]">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setModalEditarAberto(false)
                      setItemEditando(null)
                    }}
                    disabled={salvandoEdicao}
                    className="text-xs h-9 border-[#DCE5DC]"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={salvandoEdicao}
                    className="text-xs h-9 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-semibold"
                  >
                    {salvandoEdicao ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Salvando alterações...
                      </>
                    ) : (
                      'Salvar Alterações'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Diálogo de Confirmação de Exclusão (shadcn AlertDialog) */}
        <AlertDialog open={modalExcluirAberto} onOpenChange={setModalExcluirAberto}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>Confirmar Exclusão de Produto</span>
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-xs text-[#5A6D5A]">
                <p>Você tem certeza que deseja excluir este produto da base do simulador?</p>
                {itemExcluindo && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-950 font-medium space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-700">Código:</span>
                      <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-red-200 text-xs">
                        {itemExcluindo.codigo || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-700">Descrição:</span>{' '}
                      <span>{itemExcluindo.descricao}</span>
                    </div>
                  </div>
                )}
                <p className="text-red-700 font-semibold pt-1">
                  Atenção: esta ação é definitiva e removerá o registro permanentemente do banco de
                  dados.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={executandoExclusao}
                onClick={() => {
                  setModalExcluirAberto(false)
                  setItemExcluindo(null)
                }}
              >
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={executandoExclusao}
                onClick={handleConfirmarExclusao}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                {executandoExclusao ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Excluindo...
                  </>
                ) : (
                  'Excluir Definitivamente'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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

      {/* Modal de Limpeza Total da Base de Produtos */}
      <ModalLimparBase
        open={modalLimparOpen}
        onOpenChange={setModalLimparOpen}
        alvo="sim_produtos_base"
        tituloAlvo="Base de Produtos (Simulador Comercial)"
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
export default AbaBaseProdutos
