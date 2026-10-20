import React, { useState, useEffect, useRef } from 'react'
import {
  Send,
  PlusCircle,
  MessageSquare,
  Bot,
  User as UserIcon,
  Sparkles,
  BookOpen,
  Scale,
  RefreshCw,
  AlertCircle,
  Clock,
  ChevronRight,
  ShieldCheck,
  Check,
  Copy,
  Info,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import {
  enviarMensagemStream,
  enviarMensagemSync,
  listarConversas,
  carregarMensagensConversa,
  type ConversaItem,
} from '@/services/tributacaoService'
import { type DisplayMessage, type AgentCitation } from '@/lib/skipAi'

const SUGGESTED_QUESTIONS = [
  {
    title: 'Importação de Defensivos em 2026',
    question: 'Qual a alíquota de PIS/COFINS na importação de defensivos agrícolas em 2026?',
    tag: 'Importação',
  },
  {
    title: 'Crédito de Frete de Insumos',
    question:
      'Posso aproveitar crédito de PIS/COFINS sobre o frete na compra de insumos agrícolas com alíquota zero?',
    tag: 'Súmula 188 / COSIT 90',
  },
  {
    title: 'Reoneração LC 224/2025',
    question:
      'O que muda com a LC 224/2025 a partir de abril de 2026 para fertilizantes e defensivos?',
    tag: 'Reoneração 10%',
  },
  {
    title: 'CST 06 e EFD-Contribuições',
    question:
      'Como fica o CST 06 na emissão da NF-e e a escrituração dos registros M220/M620 na EFD-Contribuições?',
    tag: 'Sped Fiscal',
  },
  {
    title: 'Transição IBS e CBS (Reforma)',
    question:
      'Como funciona o diferimento e a redução de 60% do IBS e da CBS para insumos agrícolas na LC 214/2025?',
    tag: 'Reforma Tributária',
  },
  {
    title: 'Revendas vs Insumos da Fase Agrícola',
    question:
      'Distribuidoras e revendas de insumos agrícolas podem tomar créditos com base na Súmula CARF nº 189?',
    tag: 'CARF 189 × 234',
  },
]

export default function Tributacao() {
  const [conversations, setConversations] = useState<ConversaItem[]>([])
  const [currentConvId, setCurrentConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Carregar lista de conversas ao montar
  useEffect(() => {
    carregarListaConversas()
  }, [])

  // Auto scroll para o final
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    scrollToBottom(isLoading ? 'auto' : 'smooth')
  }, [messages, isLoading])

  const carregarListaConversas = async () => {
    try {
      const list = await listarConversas()
      const normalizedList = Array.isArray(list)
        ? list
        : Array.isArray((list as any)?.items)
          ? (list as any).items
          : Array.isArray((list as any)?.conversations)
            ? (list as any).conversations
            : []
      setConversations(normalizedList)
    } catch (err) {
      console.error('Falha ao listar conversas:', err)
      setConversations([])
    }
  }

  const handleSelectConversation = async (convId: string) => {
    if (isLoading) return
    setCurrentConvId(convId)
    setErrorMessage(null)
    setLoadingHistory(true)
    try {
      const msgs = await carregarMensagensConversa(convId)
      const normalizedMsgs = Array.isArray(msgs)
        ? msgs
        : Array.isArray((msgs as any)?.items)
          ? (msgs as any).items
          : Array.isArray((msgs as any)?.messages)
            ? (msgs as any).messages
            : []
      setMessages(normalizedMsgs)
    } catch (err) {
      console.error('Erro ao abrir conversa:', err)
      setErrorMessage('Não foi possível carregar o histórico desta conversa.')
      setMessages([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleNewConversation = () => {
    if (isLoading) {
      abortControllerRef.current?.abort()
    }
    setCurrentConvId(null)
    setMessages([])
    setErrorMessage(null)
    setInputMessage('')
  }

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputMessage
    const message = rawText.trim()
    if (!message || isLoading) return

    setInputMessage('')
    setErrorMessage(null)

    // Adicionar mensagem do usuário imediatamente
    const userMsgId = `user-${Date.now()}`
    const newMsgList: DisplayMessage[] = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        content: message,
        created: new Date().toISOString(),
      },
    ]

    setMessages(newMsgList)
    setIsLoading(true)

    // Placeholder temporário do assistente para streaming
    const botMsgId = `bot-${Date.now()}`
    const botPlaceholder: DisplayMessage = {
      id: botMsgId,
      role: 'assistant',
      content: '',
      created: new Date().toISOString(),
    }
    setMessages([...newMsgList, botPlaceholder])

    const abortCtrl = new AbortController()
    abortControllerRef.current = abortCtrl

    let accumulatedContent = ''
    let latestCitations: AgentCitation[] | undefined

    try {
      const result = await enviarMensagemStream(message, currentConvId, {
        signal: abortCtrl.signal,
        onChunk: (_delta, full) => {
          accumulatedContent = full
          setMessages((prev) => prev.map((m) => (m.id === botMsgId ? { ...m, content: full } : m)))
        },
        onCitations: (cits) => {
          latestCitations = cits
          setMessages((prev) =>
            prev.map((m) => (m.id === botMsgId ? { ...m, citations: cits } : m)),
          )
        },
      })

      // Fixar resposta completa
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? {
                ...m,
                content: result.content || accumulatedContent,
                citations: result.citations || latestCitations,
              }
            : m,
        ),
      )

      if (result.conversationId) {
        setCurrentConvId(result.conversationId)
      }

      // Atualizar lista lateral de conversas
      carregarListaConversas()
    } catch (streamErr: any) {
      console.warn('Falha no streaming, tentando fallback síncrono:', streamErr)
      // Se não foi cancelamento voluntário do usuário, tenta sync como fallback
      if (streamErr?.name !== 'AbortError' && !abortCtrl.signal.aborted) {
        try {
          const syncResult = await enviarMensagemSync(message, currentConvId)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? {
                    ...m,
                    content: syncResult.content,
                    citations: syncResult.citations,
                  }
                : m,
            ),
          )
          if (syncResult.conversationId) {
            setCurrentConvId(syncResult.conversationId)
          }
          carregarListaConversas()
          setIsLoading(false)
          return
        } catch (syncErr: any) {
          console.error('Falha também no sync:', syncErr)
        }
      }

      // Se falhou tudo ou erro amigável
      const friendlyErr = 'Não foi possível consultar o especialista agora — tente novamente.'
      setErrorMessage(friendlyErr)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? {
                ...m,
                content:
                  '⚠️ **Atenção**: Ocorreu uma instabilidade na comunicação com o assistente tributário. Por favor, tente enviar sua pergunta novamente em instantes.',
              }
            : m,
        ),
      )
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4 overflow-hidden -mt-2">
      {/* ------------------------------------------------------------------ */}
      {/* PAINEL LATERAL: HISTÓRICO DE CONVERSAS */}
      {/* ------------------------------------------------------------------ */}
      <div className="hidden md:flex flex-col w-72 bg-white rounded-2xl border border-[#DCE5DC] shadow-sm overflow-hidden flex-shrink-0">
        <div className="p-3.5 border-b border-[#DCE5DC] flex items-center justify-between bg-emerald-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1B5E20] flex items-center justify-center text-white shadow-xs">
              <Scale className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#1C2B1C] leading-none">
                Consultas Tributárias
              </h3>
              <p className="text-[10px] text-[#5A6D5A] mt-0.5">Histórico salvo</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewConversation}
                className="h-8 px-2.5 text-xs gap-1 border-emerald-300 hover:bg-emerald-100/60 text-[#1B5E20] font-semibold"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Nova</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Iniciar nova conversa</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="flex-1 p-2">
          {!Array.isArray(conversations) || conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#5A6D5A]">
              <MessageSquare className="w-7 h-7 mx-auto mb-2 text-emerald-300/60" />
              <p className="font-medium text-[#1C2B1C]">Nenhuma conversa anterior</p>
              <p className="text-[11px] mt-1 text-[#5A6D5A]">
                Suas consultas tributárias com o consultor serão salvas aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => {
                const isActive = currentConvId === conv.id
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    disabled={isLoading}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start gap-2.5 group ${
                      isActive
                        ? 'bg-emerald-100/80 text-[#0D2811] font-semibold shadow-xs border border-emerald-200'
                        : 'text-[#1C2B1C] hover:bg-[#F5F7F1]'
                    }`}
                  >
                    <MessageSquare
                      className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        isActive
                          ? 'text-[#1B5E20]'
                          : 'text-emerald-700/60 group-hover:text-emerald-700'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs">
                        {conv.title || 'Consulta sobre Tributação Agro'}
                      </p>
                      <span className="text-[10px] text-[#5A6D5A] flex items-center gap-1 mt-0.5 font-normal">
                        <Clock className="w-2.5 h-2.5" />
                        {conv.created
                          ? new Date(conv.created).toLocaleDateString('pt-BR')
                          : 'Recente'}
                      </span>
                    </div>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 text-[#1B5E20] mt-1" />}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Rodapé do painel lateral com badges de normas */}
        <div className="p-3 border-t border-[#DCE5DC] bg-[#F5F7F1]/80 text-[11px] text-[#5A6D5A] space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1C2B1C]">
            <BookOpen className="w-3.5 h-3.5 text-[#1B5E20]" />
            <span>Base Atualizada:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge
              variant="outline"
              className="text-[9px] py-0 px-1.5 bg-white border-emerald-200 text-emerald-800"
            >
              LC 224/2025
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] py-0 px-1.5 bg-white border-emerald-200 text-emerald-800"
            >
              LC 214/2025
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] py-0 px-1.5 bg-white border-emerald-200 text-emerald-800"
            >
              Súmulas CARF
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] py-0 px-1.5 bg-white border-emerald-200 text-emerald-800"
            >
              COSIT 90/2025
            </Badge>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ÁREA PRINCIPAL DO CHAT */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-[#DCE5DC] shadow-sm overflow-hidden">
        {/* Header do Chat */}
        <div className="px-5 py-3.5 border-b border-[#DCE5DC] bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0D2811] via-[#1B5E20] to-[#2E7D32] flex items-center justify-center text-white shadow-md">
              <Scale className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#1C2B1C]">Consultor Tributário Agro</h2>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] py-0 font-medium hover:bg-emerald-100">
                  PIS / COFINS & Reforma
                </Badge>
              </div>
              <p className="text-xs text-[#5A6D5A]">
                Especialista em alíquota zero, reoneração 2026, CARF e IBS/CBS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewConversation}
              className="md:hidden h-8 px-2.5 text-xs gap-1 border-emerald-300 text-[#1B5E20]"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nova</span>
            </Button>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Conhecimento Vinculante e Normativo</span>
            </div>
          </div>
        </div>

        {/* Mensagens / Tela Vazia */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#FBFDFB]">
          {loadingHistory ? (
            <div className="h-full flex flex-col items-center justify-center text-[#5A6D5A] py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
              <p className="text-xs">Carregando histórico de mensagens...</p>
            </div>
          ) : !Array.isArray(messages) || messages.length === 0 ? (
            /* Tela Vazia: Apresentação + Cards com Perguntas Sugeridas */
            <div className="max-w-3xl mx-auto py-4 space-y-6 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 text-[#1B5E20] shadow-inner mb-1">
                  <Bot className="w-7 h-7 text-[#1B5E20]" />
                </div>
                <h3 className="text-lg font-bold text-[#1C2B1C]">
                  Bem-vindo ao Consultor Tributário Agro
                </h3>
                <p className="text-xs text-[#5A6D5A] max-w-xl mx-auto leading-relaxed">
                  Tire dúvidas técnicas instantâneas sobre PIS/Pasep e COFINS no agronegócio,
                  alíquota zero de insumos (Lei 10.925/2004), a nova alíquota residual da LC nº
                  224/2025, crédito sobre fretes (Súmula CARF 188), fase agrícola (Súmula CARF 189)
                  e transição IBS/CBS da LC nº 214/2025.
                </p>
              </div>

              {/* Informação sobre os limites temporais */}
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-950">
                <Info className="w-4 h-4 text-[#F57F17] flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-900">
                    Aviso Importante sobre Vigência e Fundamentação:
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    • <strong>Até 31/03/2026</strong>: vigência histórica da alíquota zero plena
                    (art. 1º da Lei 10.925/2004).
                    <br />• <strong>A partir de 01/04/2026</strong>: reoneração residual de 10% da
                    LC nº 224/2025 (0,925% no não cumulativo, 0,365% no cumulativo e 1,175% na
                    importação).
                    <br />• <strong>A partir de 01/01/2027</strong>: vigência plena do IVA Dual (IBS
                    e CBS pela LC nº 214/2025) com extinção de PIS/COFINS.
                  </p>
                </div>
              </div>

              {/* Grid de Perguntas Sugeridas */}
              <div>
                <p className="text-xs font-semibold text-[#1C2B1C] mb-3 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#F57F17]" />
                  <span>Perguntas frequentes e tópicos críticos para consultar:</span>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {SUGGESTED_QUESTIONS.map((item, idx) => (
                    <Card
                      key={idx}
                      onClick={() => handleSendMessage(item.question)}
                      className="cursor-pointer border-emerald-200/80 hover:border-[#1B5E20] hover:shadow-md transition-all group bg-white"
                    >
                      <CardContent className="p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-950 group-hover:text-[#1B5E20] transition-colors">
                            {item.title}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border border-emerald-100"
                          >
                            {item.tag}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-[#5A6D5A] line-clamp-2 leading-relaxed">
                          "{item.question}"
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Lista de Mensagens */
            <div className="max-w-3xl mx-auto space-y-5">
              {Array.isArray(messages) &&
                messages.map((msg) => {
                  const isUser = msg.role === 'user'
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#0D2811] to-[#1B5E20] flex items-center justify-center text-white flex-shrink-0 shadow-xs mt-1">
                          <Scale className="w-4 h-4 text-emerald-300" />
                        </div>
                      )}

                      <div
                        className={`relative max-w-[85%] rounded-2xl px-4 py-3 shadow-xs ${
                          isUser
                            ? 'bg-[#1B5E20] text-white rounded-tr-xs'
                            : 'bg-white border border-[#DCE5DC] text-[#1C2B1C] rounded-tl-xs'
                        }`}
                      >
                        {/* Conteúdo da Mensagem */}
                        {isUser ? (
                          <p className="text-xs whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                          </p>
                        ) : msg.content ? (
                          <div className="space-y-3">
                            <MarkdownRenderer content={msg.content} />

                            {/* Fontes e Citações quando disponíveis */}
                            {msg.citations && msg.citations.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-emerald-100 text-[11px] text-[#5A6D5A] space-y-1">
                                <p className="font-semibold text-emerald-900 flex items-center gap-1 text-[11px]">
                                  <Layers className="w-3 h-3 text-[#1B5E20]" />
                                  <span>Fontes de Legislação e Jurisprudência citadas:</span>
                                </p>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {msg.citations.map((c, cIdx) => (
                                    <Badge
                                      key={cIdx}
                                      variant="outline"
                                      className="text-[10px] bg-emerald-50/70 border-emerald-200 text-emerald-800 py-0.5 px-2 font-normal"
                                    >
                                      [{c.n || cIdx + 1}] {c.excerpt?.slice(0, 60)}...
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Botão de Copiar */}
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={() => handleCopyText(msg.id, msg.content)}
                                className="text-[10px] text-[#5A6D5A] hover:text-[#1B5E20] flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-emerald-50"
                                title="Copiar resposta"
                              >
                                {copiedId === msg.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span className="text-emerald-600">Copiado</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Indicador de Digitação (Typing) */
                          <div className="flex items-center gap-2 py-1 px-1 text-xs text-[#5A6D5A]">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1B5E20]" />
                            <span className="font-medium animate-pulse">
                              Consultando jurisprudência do CARF, leis e soluções de consulta...
                            </span>
                          </div>
                        )}

                        {/* Timestamp */}
                        <span
                          className={`block text-[9px] mt-1.5 ${
                            isUser ? 'text-emerald-200/80 text-right' : 'text-[#5A6D5A]'
                          }`}
                        >
                          {msg.created
                            ? new Date(msg.created).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>

                      {isUser && (
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-[#1B5E20] flex-shrink-0 shadow-xs mt-1">
                          <UserIcon className="w-4 h-4 text-[#1B5E20]" />
                        </div>
                      )}
                    </div>
                  )
                })}

              {/* Mensagem de Erro Inline se houver */}
              {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2.5 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span className="flex-1">{errorMessage}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
                      if (lastUser) handleSendMessage(lastUser.content)
                    }}
                    className="h-7 text-xs text-red-700 hover:text-red-900 hover:bg-red-100 px-2"
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Campo de Entrada de Mensagem */}
        <div className="p-3.5 sm:p-4 border-t border-[#DCE5DC] bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSendMessage()
            }}
            className="max-w-3xl mx-auto space-y-2"
          >
            <div className="relative flex items-end gap-2 bg-[#F5F7F1] border border-[#DCE5DC] rounded-2xl p-2 focus-within:ring-2 focus-within:ring-[#1B5E20]/20 focus-within:border-[#1B5E20] transition-all">
              <Textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre PIS/COFINS, alíquota zero, LC 224/2025, fretes, Súmulas CARF ou IBS/CBS..."
                rows={1}
                disabled={isLoading}
                className="resize-none border-0 shadow-none bg-transparent text-xs sm:text-sm focus-visible:ring-0 min-h-[40px] max-h-[140px] py-2 px-2 text-[#1C2B1C] placeholder:text-[#5A6D5A]"
              />

              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !inputMessage.trim()}
                className="h-9 w-9 rounded-xl bg-[#1B5E20] hover:bg-[#144818] text-white flex-shrink-0 shadow-sm disabled:opacity-40"
                title="Enviar pergunta (Enter)"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#5A6D5A] px-1">
              <span>
                Pressione{' '}
                <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">
                  Enter
                </kbd>{' '}
                para enviar •{' '}
                <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">
                  Shift+Enter
                </kbd>{' '}
                para nova linha
              </span>
              <span className="hidden sm:inline text-emerald-800 font-medium">
                Respostas fundamentadas em leis, normas e precedentes do CARF/STJ
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
