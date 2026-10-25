import React, { useEffect, useState, useRef, useCallback, useTransition } from 'react'
import {
  MessageSquare,
  Send,
  Sparkles,
  Bot,
  User,
  Scale,
  Search,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Layers,
  Calendar,
  CheckCircle2,
  History,
  Plus,
  StopCircle,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollableTable } from '@/components/ScrollableTable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import {
  displayableMessages,
  type AgentMessage,
  type DisplayMessage,
  type AgentCitation,
} from '@/lib/skipAi'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { listarBaseMestre } from '@/services/agroService'
import { formatarNcmMascara, sanitizarRegistroMapa } from '@/lib/motorCanonico'
import type { BaseMestreProduto } from '@/types/agro'

// 5 sugestões de perguntas pré-configuradas requeridas
const SUGESTOES_PERGUNTAS = [
  'Qual o enquadramento PIS/COFINS do ROUNDUP WG?',
  'O que muda com a reoneração da LC 224/2025 em Abril/2026?',
  'Como fica o IBS/CBS para defensivos agrícolas na LC 214/2025?',
  'Qual NCM para herbicida formulado comercial em bombona de 20L?',
  'Inoculante solubilizador de fósforo tem alíquota zero?',
]

interface ConversaItem {
  id: string
  title: string
  created?: string
  updated?: string
}

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
  const [activeTab, setActiveTab] = useState<'chat' | 'tabela'>('chat')

  // --- ESTADO DO CHAT IA ---
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(() => {
    return localStorage.getItem('agro_tax_active_conv') || null
  })
  const [conversasAnteriores, setConversasAnteriores] = useState<ConversaItem[]>([])
  const [loadingConversas, setLoadingConversas] = useState(false)
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false)
  const [secondsElapsed, setSecondsElapsed] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // --- ESTADO DA TABELA PANORAMA ---
  const [produtos, setProdutos] = useState<BaseMestreProduto[]>([])
  const [loadingTabela, setLoadingTabela] = useState(false)
  const [searchTabela, setSearchTabela] = useState('')
  const [filtroEnquadramento, setFiltroEnquadramento] = useState<string>('todos')
  const [filtroMacro, setFiltroMacro] = useState<string>('todos')
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({})
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageRef = useRef(1)
  const hasMoreRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const loadingInitialRef = useRef(false)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [, startTransition] = useTransition()

  // Cleanup no unmount: abortar requisição pendente
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Cronômetro do estado de "consultando..."
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    if (isSending) {
      setSecondsElapsed(0)
      timer = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1)
      }, 1000)
    } else {
      setSecondsElapsed(0)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isSending])

  // Rolar suavemente para a última mensagem
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  useEffect(() => {
    scrollToBottom('smooth')
  }, [messages, isSending, scrollToBottom])

  // Carregar lista de conversas anteriores do usuário
  const carregarConversas = useCallback(async () => {
    try {
      setLoadingConversas(true)
      const res = await fetch(
        `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/tributacao/conversas?limit=25`,
        {
          headers: {
            Authorization: pb.authStore.token,
          },
        },
      )
      if (!res.ok) return
      const data = await res.json()
      if (data && Array.isArray(data.conversations)) {
        setConversasAnteriores(data.conversations)
      }
    } catch (err) {
      console.warn('Erro ao carregar conversas anteriores:', err)
    } finally {
      setLoadingConversas(false)
    }
  }, [])

  // Carregar mensagens da conversa ativa
  const carregarMensagensConversa = useCallback(async (convId: string) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/tributacao/conversas/${encodeURIComponent(convId)}/mensagens`,
        {
          headers: {
            Authorization: pb.authStore.token,
          },
        },
      )
      if (!res.ok) return
      const data = await res.json()
      if (data && Array.isArray(data.messages)) {
        const disp = displayableMessages(data.messages as AgentMessage[])
        setMessages(disp)
      }
    } catch (err) {
      console.warn('Erro ao carregar mensagens da conversa:', err)
    }
  }, [])

  // Mount inicial: carregar lista de conversas e mensagens da conversa ativa se houver
  useEffect(() => {
    carregarConversas()
    if (conversationId) {
      carregarMensagensConversa(conversationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ação de Nova Conversa
  const handleNovaConversa = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setConversationId(null)
    localStorage.removeItem('agro_tax_active_conv')
    setMessages([])
    setIsSending(false)
    textareaRef.current?.focus()
  }

  // Ação de Interromper Consulta
  const handlePararGeracao = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsSending(false)
    const partialMsg: DisplayMessage = {
      id: `assistant-cancelled-${Date.now()}`,
      role: 'assistant',
      content: '> ⏹️ *Consulta interrompida pelo usuário.*',
      created: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, partialMsg])
    textareaRef.current?.focus()
  }

  // Selecionar conversa do histórico
  const handleSelecionarConversa = (convId: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setConversationId(convId)
    localStorage.setItem('agro_tax_active_conv', convId)
    setIsSending(false)
    setShowHistoryDrawer(false)
    carregarMensagensConversa(convId)
  }

  // Enviar Mensagem para o Chatbot IA (Resposta Síncrona Ultra-Rápida e 100% Confiável)
  const handleSendMessage = async (msgToSend?: string) => {
    const text = (msgToSend ?? inputMessage).trim()
    if (!text || isSending) return

    setInputMessage('')
    setIsSending(true)

    const tempUserMsgId = `user-${Date.now()}`
    const userMsg: DisplayMessage = {
      id: tempUserMsgId,
      role: 'user',
      content: text,
      created: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // Timeout de 75s para dar tempo ao modelo sem travar o cliente indefinidamente
    const timeoutId = setTimeout(() => {
      if (abortControllerRef.current) {
        abortController.abort(
          new Error('Tempo limite de espera excedido (75s). O assistente demorou para responder.'),
        )
      }
    }, 75000)

    try {
      const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/tributacao/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: pb.authStore.token,
        },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          title: text.slice(0, 50),
        }),
        signal: abortController.signal,
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        const serverError =
          data?.error ||
          data?.message ||
          `Erro no servidor de chat (${res.status} ${res.statusText})`
        throw new Error(serverError)
      }

      if (!data || !data.content) {
        throw new Error('O especialista tributário retornou uma resposta sem conteúdo.')
      }

      const newConvId = data.conversation_id
      if (newConvId && newConvId !== conversationId) {
        setConversationId(newConvId)
        localStorage.setItem('agro_tax_active_conv', newConvId)
        carregarConversas()
      }

      const assistantMsg: DisplayMessage = {
        id: data.message_id || `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.content,
        citations: data.citations || [],
        created: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (err: unknown) {
      const userVoluntaryAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('The operation was aborted')) &&
        !abortController.signal.reason

      if (userVoluntaryAbort) {
        return
      }

      const reasonMsg =
        abortController.signal.reason instanceof Error
          ? abortController.signal.reason.message
          : typeof abortController.signal.reason === 'string'
            ? abortController.signal.reason
            : ''

      const isTimeout =
        (err instanceof Error && err.message.includes('Tempo limite')) ||
        reasonMsg.includes('Tempo limite')

      console.error('Erro na resposta do agente tributário:', err)

      const errorMessage = isTimeout
        ? 'O servidor demorou para responder (tempo limite de 75s excedido). Tente novamente em instantes.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível consultar o especialista tributário no momento.'

      const errorMsg: DisplayMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `> ⚠️ **Não foi possível concluir a consulta tributária agora.**\n\n${errorMessage}`,
        created: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMsg])

      toast({
        variant: 'destructive',
        title: isTimeout ? 'Tempo limite excedido' : 'Falha na resposta do assistente',
        description: errorMessage,
      })
    } finally {
      clearTimeout(timeoutId)
      setIsSending(false)
      abortControllerRef.current = null
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // --- TABELA PANORAMA: FILTROS E PAGINAÇÃO ---
  const buildFilterString = useCallback(() => {
    const filters: string[] = []
    if (searchTabela.trim()) {
      const clean = searchTabela.trim().replace(/'/g, "\\'")
      filters.push(
        `(nome_completo ~ '${clean}' || marca_padronizada ~ '${clean}' || ncm_padrao ~ '${clean}' || principio_ativo ~ '${clean}' || registro_mapa ~ '${clean}' || titular_fabricante ~ '${clean}')`,
      )
    }
    if (filtroMacro !== 'todos') {
      filters.push(`macro_grupo = '${filtroMacro.replace(/'/g, "\\'")}'`)
    }
    if (filtroEnquadramento !== 'todos') {
      if (filtroEnquadramento === 'beneficiado') {
        filters.push(`(status_pis_cofins ~ 'Beneficiado' || status_pis_cofins = '')`)
      } else if (filtroEnquadramento === 'condicional') {
        filters.push(`(status_pis_cofins ~ 'Condicional' || status_pis_cofins ~ '5.630')`)
      } else if (filtroEnquadramento === 'tributado') {
        filters.push(`(status_pis_cofins ~ 'Tributado' || status_pis_cofins ~ 'COSIT')`)
      }
    }
    return filters.join(' && ')
  }, [searchTabela, filtroMacro, filtroEnquadramento])

  const carregarProdutos = useCallback(async () => {
    loadingInitialRef.current = true
    setLoadingTabela(true)
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
    } finally {
      loadingInitialRef.current = false
      setLoadingTabela(false)
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
    if (activeTab === 'tabela' && produtos.length === 0) {
      carregarProdutos()
    }
  }, [activeTab, produtos.length, carregarProdutos])

  const toggleRowExpanded = (id: string) => {
    setExpandedRowIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Exportação CSV com 13 cabeçalhos, BOM UTF-8 e delimitador ";"
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
      'Enquadramento_PIS_COFINS',
      'CST_Saida',
      'Aliquota_Hoje',
      'Aliquota_Pos_Abr2026_Real',
      'Aliquota_Pos_Abr2026_Presumido',
      'IBS_CBS_2027',
      'Titular_Fabricante',
    ]

    const rows = produtos.map((p) => {
      const enq = deduzirEnquadramentoFiscal(p)
      const ncmPadrao = p.ncm_padrao || p.ncm || ''
      return [
        `"${(p.nome_completo || p.marca_padronizada || p.nome_produto || '').replace(/"/g, '""')}"`,
        `"${(p.marca_padronizada || p.nome_produto || '').replace(/"/g, '""')}"`,
        `"${sanitizarRegistroMapa(p.registro_mapa)}"`,
        `"${(p.principio_ativo || '').replace(/"/g, '""')}"`,
        `"${(p.macro_grupo || 'Defensivos').replace(/"/g, '""')}"`,
        `"${formatarNcmMascara(ncmPadrao)}"`,
        `"${enq.categoria}"`,
        `"${enq.cstSugerido}"`,
        `"${enq.aliquotaHoje}"`,
        `"${enq.aliquotaPosAbr2026Real}"`,
        `"${enq.aliquotaPosAbr2026Presumido}"`,
        `"${(p.ibs_cbs_2027 || 'Redução de 60% + Diferimento').replace(/"/g, '""')}"`,
        `"${(p.titular_fabricante || p.fabricante || '').replace(/"/g, '""')}"`,
      ].join(';')
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tributacao_agro_panorama_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Relatório Exportado',
      description: `CSV gerado com sucesso contendo ${produtos.length} produtos.`,
    })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-3 animate-in fade-in duration-200">
      {/* ------------------------------------------------------------------ */}
      {/* CABEÇALHO DA TELA COM BOT E TABS                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#DCE5DC] pb-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#1B5E20] to-[#2E7D32] flex items-center justify-center text-white shadow-xs">
              <Bot className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1C2B1C] flex items-center gap-2">
                <span>Chat Especialista</span>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-semibold py-0">
                  Agente Nativo Skip Cloud
                </Badge>
              </h2>
              <p className="text-xs text-[#5A6D5A]">
                Converse sobre qualquer dúvida de tributação agrícola, PIS/COFINS, LC 224/2025,
                IBS/CBS, TIPI ou consulte dados da Base Mestre.
              </p>
            </div>
          </div>
        </div>

        {/* Alternância de Abas: Chat com IA e Tabela Panorama */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'chat' | 'tabela')}
            className="w-auto"
          >
            <TabsList className="bg-white border border-[#DCE5DC] p-0.5 h-9">
              <TabsTrigger
                value="chat"
                className="text-xs data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white data-[state=active]:font-semibold px-3 flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat com IA</span>
              </TabsTrigger>
              <TabsTrigger
                value="tabela"
                className="text-xs data-[state=active]:bg-[#1B5E20] data-[state=active]:text-white data-[state=active]:font-semibold px-3 flex items-center gap-1.5"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Tabela Panorama</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === 'chat' && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
                className="h-9 px-2.5 text-xs border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50"
                title="Histórico de conversas"
              >
                <History className="w-3.5 h-3.5 mr-1 text-[#1B5E20]" />
                <span className="hidden md:inline">Histórico</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNovaConversa}
                className="h-9 px-2.5 text-xs border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50"
                title="Iniciar nova conversa"
              >
                <Plus className="w-3.5 h-3.5 mr-1 text-[#1B5E20]" />
                <span className="hidden md:inline">Nova Conversa</span>
              </Button>
            </div>
          )}

          {activeTab === 'tabela' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-9 text-xs border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50 hover:text-[#1B5E20]"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-[#1B5E20]" />
              <span>Exportar CSV</span>
            </Button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ABA 1: CHAT COM IA                                                 */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex min-h-0 gap-3 relative">
          {/* Drawer lateral de histórico */}
          {showHistoryDrawer && (
            <div className="w-64 border border-[#DCE5DC] bg-white rounded-2xl p-3 flex flex-col flex-shrink-0 shadow-sm animate-in slide-in-from-left duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-[#DCE5DC] mb-2">
                <span className="text-xs font-bold text-[#1C2B1C] flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#1B5E20]" />
                  Conversas Anteriores
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNovaConversa}
                  className="h-7 px-2 text-[11px] text-[#1B5E20] hover:bg-emerald-50"
                >
                  <Plus className="w-3 h-3 mr-0.5" /> Nova
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar text-xs">
                {loadingConversas ? (
                  <div className="py-6 text-center text-[#5A6D5A]">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#1B5E20] mb-1" />
                    Carregando histórico...
                  </div>
                ) : conversasAnteriores.length === 0 ? (
                  <div className="py-6 text-center text-[#5A6D5A] text-[11px]">
                    Nenhuma conversa anterior registrada.
                  </div>
                ) : (
                  conversasAnteriores.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelecionarConversa(c.id)}
                      className={`w-full text-left p-2 rounded-xl transition-colors truncate block ${
                        conversationId === c.id
                          ? 'bg-emerald-50 text-[#1B5E20] font-semibold border border-emerald-200'
                          : 'text-[#1C2B1C] hover:bg-[#F5F7F1]'
                      }`}
                    >
                      <div className="truncate font-medium">{c.title || 'Conversa sem título'}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Card Principal da Conversa */}
          <Card className="flex-1 flex flex-col min-h-0 bg-white border-[#DCE5DC] rounded-2xl shadow-xs overflow-hidden">
            {/* Mensagens */}
            <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 custom-scrollbar">
              {messages.length === 0 && !isSending && (
                <div className="max-w-2xl mx-auto py-8 text-center space-y-6">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto text-[#1B5E20] shadow-sm">
                    <Sparkles className="w-8 h-8 text-[#1B5E20]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#1C2B1C]">
                      Como posso ajudar com a tributação do agro hoje?
                    </h3>
                    <p className="text-xs text-[#5A6D5A] mt-1.5 max-w-md mx-auto leading-relaxed">
                      Sou especialista em PIS/COFINS agrícola, alíquota zero (Lei 10.925/04),
                      reoneração da LC 224/2025, transição para o IBS/CBS (LC 214/2025),
                      classificação TIPI (posição 38.08) e cadastro da Base Mestre.
                    </p>
                  </div>

                  {/* Sugestões de perguntas pré-configuradas */}
                  <div className="space-y-2 pt-2">
                    <span className="text-[11px] font-semibold text-[#5A6D5A] uppercase tracking-wider">
                      Sugestões de perguntas para iniciar
                    </span>
                    <div className="flex flex-wrap gap-2 justify-center max-w-xl mx-auto">
                      {SUGESTOES_PERGUNTAS.map((sugestao, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSendMessage(sugestao)}
                          className="text-xs text-left px-3.5 py-2 rounded-xl border border-[#DCE5DC] bg-[#F5F7F1]/80 hover:bg-emerald-50 hover:border-emerald-300 hover:text-[#1B5E20] transition-all duration-150 shadow-2xs font-medium"
                        >
                          {sugestao}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Bolhas de Mensagens */}
              {messages.map((m) => {
                const isUser = m.role === 'user'
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#1B5E20] to-[#2E7D32] flex items-center justify-center text-white flex-shrink-0 shadow-xs mt-0.5">
                        <Bot className="w-4 h-4 text-emerald-200" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] sm:max-w-[82%] rounded-2xl p-4 text-xs leading-relaxed shadow-2xs ${
                        isUser
                          ? 'bg-[#1B5E20] text-white rounded-tr-xs'
                          : 'bg-[#F9FAF8] text-[#1C2B1C] border border-[#DCE5DC] rounded-tl-xs'
                      }`}
                    >
                      {isUser ? (
                        <div className="whitespace-pre-wrap font-sans break-words selection:bg-emerald-200 selection:text-emerald-950">
                          {m.content}
                        </div>
                      ) : (
                        <MarkdownRenderer content={m.content} />
                      )}

                      {/* Badges de Citações / Fontes Legais */}
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-[#DCE5DC]/60 text-[10px] text-[#5A6D5A] space-y-1">
                          <span className="font-semibold block text-[#1B5E20]">
                            Fontes Legais Consultadas:
                          </span>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {m.citations.map((c, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-[10px] bg-white border-[#DCE5DC] text-[#1C2B1C]"
                              >
                                {c.excerpt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-[#1B5E20] flex-shrink-0 mt-0.5">
                        <User className="w-4 h-4 text-[#1B5E20]" />
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Estado de Carregamento com Spinner e Cronômetro */}
              {isSending && (
                <div className="flex items-start gap-3 justify-start animate-in fade-in duration-200">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#1B5E20] to-[#2E7D32] flex items-center justify-center text-white flex-shrink-0 shadow-xs mt-0.5">
                    <Bot className="w-4 h-4 text-emerald-200" />
                  </div>
                  <div className="max-w-[85%] sm:max-w-[82%] rounded-2xl rounded-tl-xs p-4 text-xs leading-relaxed bg-[#F9FAF8] text-[#1C2B1C] border border-[#DCE5DC] shadow-2xs space-y-2">
                    <div className="flex items-center justify-between gap-3 border-b border-[#DCE5DC]/60 pb-2">
                      <div className="flex items-center gap-2 text-[#1B5E20] font-semibold text-xs">
                        <Loader2 className="w-4 h-4 animate-spin text-[#1B5E20]" />
                        <span>Consultando especialista tributário...</span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono text-[#5A6D5A] bg-white border-[#DCE5DC]"
                      >
                        {secondsElapsed}s
                      </Badge>
                    </div>
                    <p className="text-[11px] text-[#5A6D5A] leading-relaxed">
                      Analisando a legislação agropecuária (Lei nº 10.925/04, LC nº 224/2025, LC nº
                      214/2025 e Tabela TIPI). A resposta completa e formatada será exibida em
                      instantes.
                    </p>
                    <div className="pt-1 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handlePararGeracao}
                        className="h-6 px-2 text-[10px] text-rose-700 hover:text-rose-800 hover:bg-rose-50"
                      >
                        <StopCircle className="w-3 h-3 mr-1" />
                        Cancelar consulta
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Sugestões rápidas acima do input */}
            {messages.length > 0 && (
              <div className="px-4 py-1.5 bg-[#FAFBF9] border-t border-[#DCE5DC]/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[10px] text-[#5A6D5A] font-semibold flex-shrink-0">
                  Perguntas rápidas:
                </span>
                {SUGESTOES_PERGUNTAS.slice(0, 3).map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendMessage(sug)}
                    disabled={isSending}
                    className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-full bg-white border border-[#DCE5DC] hover:border-emerald-300 hover:text-[#1B5E20] transition-colors"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}

            {/* Input e Controles de Envio */}
            <div className="p-3 md:p-4 border-t border-[#DCE5DC] bg-white">
              <div className="relative flex items-end gap-2 bg-[#F5F7F1] border border-[#DCE5DC] rounded-2xl p-2 focus-within:border-[#1B5E20] focus-within:ring-1 focus-within:ring-[#1B5E20] transition-all">
                <Textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pergunte qualquer dúvida sobre tributação no agro (ex: NCM de defensivo, reoneração em 2026, alíquota de produto)..."
                  className="min-h-[44px] max-h-36 resize-none border-0 bg-transparent text-xs text-[#1C2B1C] placeholder:text-[#5A6D5A] focus-visible:ring-0 p-1.5"
                  rows={1}
                  disabled={isSending}
                />

                {isSending ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={handlePararGeracao}
                    className="h-9 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex-shrink-0 text-xs font-medium"
                    title="Interromper consulta"
                  >
                    <StopCircle className="w-3.5 h-3.5 mr-1" />
                    <span>Interromper</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSendMessage()}
                    disabled={!inputMessage.trim() || isSending}
                    className="h-9 px-3.5 rounded-xl bg-[#1B5E20] hover:bg-[#2E7D32] text-white flex-shrink-0 font-medium"
                  >
                    <Send className="w-3.5 h-3.5 mr-1" />
                    <span>Enviar</span>
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-[#5A6D5A]">
                <span>
                  Pressione <kbd className="font-mono bg-gray-100 px-1 rounded">Enter</kbd> para
                  enviar ou <kbd className="font-mono bg-gray-100 px-1 rounded">Shift + Enter</kbd>{' '}
                  para nova linha
                </span>
                <span>O agente possui memória persistente da conversa</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ABA 2: TABELA PANORAMA TRIBUTÁRIO DA BASE MESTRE                    */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'tabela' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          {/* Cards Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="rounded-2xl border-[#DCE5DC] bg-white p-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-[#1B5E20] flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-[#1B5E20]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1C2B1C]">Regra Vigente HOJE</span>
                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px] py-0">
                      Até 31/Mar/26
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[#5A6D5A] mt-0.5 leading-snug">
                    Alíquota 0,00% de PIS/COFINS para insumos e defensivos agrícolas (Lei nº
                    10.925/2004).
                  </p>
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl border-amber-200 bg-amber-50/40 p-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800 flex-shrink-0">
                  <Calendar className="w-4 h-4 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1C2B1C]">Reoneração Residual</span>
                    <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] py-0">
                      Pós-01/Abr/26
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[#5A6D5A] mt-0.5 leading-snug">
                    0,925% no Lucro Real e 0,365% no Presumido pela LC nº 224/2025.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl border-blue-200 bg-blue-50/40 p-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-800 flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-blue-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1C2B1C]">Reforma IBS / CBS</span>
                    <Badge className="bg-blue-100 text-blue-900 border-blue-300 text-[10px] py-0">
                      LC 214/2025
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[#5A6D5A] mt-0.5 leading-snug">
                    Redução de 60% da alíquota (carga ~10,60%) + Diferimento com produtor rural.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Filtros e Busca */}
          <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-xs p-3 space-y-2">
            <div className="flex flex-col md:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6D5A]" />
                <Input
                  value={searchTabela}
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => {
                      setSearchTabela(val)
                    })
                  }}
                  placeholder="Buscar por nome comercial, princípio ativo, NCM ou registro MAPA..."
                  className="pl-9 text-xs h-9 border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full md:w-auto">
                <Select
                  value={filtroEnquadramento}
                  onValueChange={(val) => setFiltroEnquadramento(val)}
                >
                  <SelectTrigger className="h-9 text-xs border-[#DCE5DC] sm:w-52">
                    <SelectValue placeholder="Enquadramento PIS/COFINS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Enquadramentos</SelectItem>
                    <SelectItem value="beneficiado">Beneficiado (Lei 10.925/04)</SelectItem>
                    <SelectItem value="condicional">Condicional (Dec. 5.630/05)</SelectItem>
                    <SelectItem value="tributado">Tributado Integralmente</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filtroMacro} onValueChange={(val) => setFiltroMacro(val)}>
                  <SelectTrigger className="h-9 text-xs border-[#DCE5DC] sm:w-48">
                    <SelectValue placeholder="Macro-Grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Macro-Grupos</SelectItem>
                    <SelectItem value="Defensivos">Defensivos</SelectItem>
                    <SelectItem value="Fertilizantes">Fertilizantes</SelectItem>
                    <SelectItem value="Inoculantes e Biológicos">
                      Inoculantes / Biológicos
                    </SelectItem>
                    <SelectItem value="Corretivos de Solo">Corretivos de Solo</SelectItem>
                    <SelectItem value="Produtos Técnicos">Produtos Técnicos</SelectItem>
                    <SelectItem value="Adjuvantes">Adjuvantes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Tabela com ScrollableTable */}
          <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-xs overflow-hidden flex-1 flex flex-col min-h-0">
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
                    <th className="py-2.5 px-3 w-8 text-center" />
                    <th className="py-2.5 px-3 font-semibold">Produto / Marca</th>
                    <th className="py-2.5 px-3 font-semibold">NCM</th>
                    <th className="py-2.5 px-3 font-semibold">Princípio Ativo</th>
                    <th className="py-2.5 px-3 font-semibold">Reg. MAPA</th>
                    <th className="py-2.5 px-3 font-semibold">PIS/COFINS Hoje</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Pós-Abr/2026 (Real)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      Pós-Abr/2026 (Presumido)
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F0]">
                  {loadingTabela ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-xs text-[#5A6D5A]">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#1B5E20] mb-2" />
                        Carregando panorama tributário dos produtos...
                      </td>
                    </tr>
                  ) : produtos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-xs text-[#5A6D5A]">
                        <Scale className="w-8 h-8 text-[#5A6D5A]/40 mx-auto mb-2" />
                        <p className="font-semibold text-sm text-[#1C2B1C]">
                          Nenhum produto localizado
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
                            <td className="py-2.5 px-2 text-center text-[#5A6D5A]">
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
                            <td className="py-2.5 px-3 font-bold text-[#1C2B1C] max-w-[200px] truncate">
                              <span className="truncate block">
                                {p.marca_padronizada || p.nome_completo || p.nome_produto}
                              </span>
                              <span className="text-[10px] text-[#5A6D5A] font-normal block truncate">
                                {p.macro_grupo}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[#1B5E20] whitespace-nowrap">
                              {formatarNcmMascara(ncmPadrao)}
                            </td>
                            <td
                              className="py-2.5 px-3 text-[#1C2B1C] max-w-[180px] truncate"
                              title={p.principio_ativo}
                            >
                              <span className="font-medium truncate block">
                                {p.principio_ativo || '—'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[#1C2B1C] font-semibold whitespace-nowrap">
                              {sanitizarRegistroMapa(p.registro_mapa)}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <Badge
                                className={
                                  enq.badgeVariant === 'beneficiado'
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300 text-[10px] py-0 px-2'
                                    : enq.badgeVariant === 'condicional'
                                      ? 'bg-amber-100 text-amber-900 border-amber-300 text-[10px] py-0 px-2'
                                      : 'bg-rose-100 text-rose-900 border-rose-300 text-[10px] py-0 px-2'
                                }
                              >
                                {enq.rotuloCurto} (
                                {enq.aliquotaHoje.includes('0,00%') ? '0,00%' : enq.aliquotaHoje})
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap font-medium text-[#1C2B1C]">
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-mono text-[11px] font-bold border border-amber-200">
                                {enq.aliquotaPosAbr2026Real}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap font-medium text-[#1C2B1C]">
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-50/70 text-amber-900 font-mono text-[11px] font-bold border border-amber-200/70">
                                {enq.aliquotaPosAbr2026Presumido}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-[#1B5E20] hover:bg-emerald-100/70 font-semibold"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleRowExpanded(p.id)
                                }}
                              >
                                {isExpanded ? 'Fechar' : 'Detalhe'}
                              </Button>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-gradient-to-r from-emerald-50/30 via-white to-amber-50/20">
                              <td colSpan={9} className="py-3 px-6 border-y border-[#DCE5DC]">
                                <div className="space-y-3 text-xs">
                                  <div className="flex items-center justify-between border-b border-[#DCE5DC] pb-2">
                                    <div className="flex items-center gap-2">
                                      <Layers className="w-4 h-4 text-[#1B5E20]" />
                                      <span className="font-bold text-sm text-[#1C2B1C]">
                                        {p.nome_completo || p.marca_padronizada}
                                      </span>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setActiveTab('chat')
                                        handleSendMessage(
                                          `Qual é a situação tributária completa do produto ${p.marca_padronizada || p.nome_completo} (Registro MAPA: ${p.registro_mapa})?`,
                                        )
                                      }}
                                      className="h-7 text-xs border-emerald-300 text-[#1B5E20] hover:bg-emerald-50 font-semibold"
                                    >
                                      <Bot className="w-3.5 h-3.5 mr-1" />
                                      Perguntar à IA sobre este produto
                                    </Button>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <div className="p-3 rounded-xl bg-white border border-[#DCE5DC]">
                                      <span className="font-bold text-[#1B5E20] block mb-1">
                                        Fabricante / Titular
                                      </span>
                                      <p className="text-[11px] text-[#5A6D5A]">
                                        {p.titular_fabricante || p.fabricante || 'Não informado'}
                                      </p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white border border-[#DCE5DC]">
                                      <span className="font-bold text-amber-900 block mb-1">
                                        Descrição Enquadramento
                                      </span>
                                      <p className="text-[11px] text-[#5A6D5A]">{enq.descricao}</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white border border-[#DCE5DC]">
                                      <span className="font-bold text-emerald-800 block mb-1">
                                        CST Sugerido
                                      </span>
                                      <p className="text-[11px] font-mono font-bold text-[#1B5E20]">
                                        {p.cst_saida || enq.cstSugerido}
                                      </p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white border border-[#DCE5DC]">
                                      <span className="font-bold text-blue-900 block mb-1">
                                        IBS/CBS 2027
                                      </span>
                                      <p className="text-[11px] text-[#5A6D5A]">
                                        {p.ibs_cbs_2027 ||
                                          'Redução de 60% e diferimento entre contribuintes regulares.'}
                                      </p>
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

            <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />

            <div className="flex items-center justify-between p-3 border-t border-[#DCE5DC] bg-[#FAFBF9] text-xs text-[#5A6D5A]">
              <span>
                {produtos.length} de {totalCount} produtos exibidos
              </span>
              {hasMore && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={carregarMaisProdutos}
                  disabled={loadingMore}
                  className="h-7 text-xs border-[#DCE5DC] text-[#1B5E20] hover:bg-emerald-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Carregando...
                    </>
                  ) : (
                    `Carregar mais produtos (${produtos.length} de ${totalCount})`
                  )}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
