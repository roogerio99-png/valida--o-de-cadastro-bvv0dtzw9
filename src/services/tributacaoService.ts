import pb from '@/lib/pocketbase/client'
import {
  streamAgentChat,
  displayableMessages,
  type AgentCitation,
  type AgentMessage,
  type DisplayMessage,
} from '@/lib/skipAi'

export interface ConversaItem {
  id: string
  title?: string
  created?: string
  updated?: string
  last_message_at?: string
}

export interface ChatServiceResponse {
  conversationId: string
  messageId: string
  content: string
  citations?: AgentCitation[]
}

const BASE_URL = import.meta.env.VITE_POCKETBASE_URL

/**
 * Envia mensagem para o Consultor Tributário Agro usando streaming (SSE).
 */
export async function enviarMensagemStream(
  message: string,
  conversationId: string | null,
  handlers: {
    onChunk?: (delta: string, accumulated: string) => void
    onCitations?: (citations: AgentCitation[]) => void
    signal?: AbortSignal
  } = {},
): Promise<ChatServiceResponse> {
  const token = pb.authStore.token
  const response = await fetch(`${BASE_URL}/backend/v1/tributacao/chat-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId || undefined,
    }),
    signal: handlers.signal,
  })

  const result = await streamAgentChat(response, {
    onChunk: handlers.onChunk,
    onCitations: handlers.onCitations,
    signal: handlers.signal,
  })

  const resolvedConvId =
    response.headers.get('X-Conversation-Id') || result.conversation_id || conversationId || ''

  return {
    conversationId: resolvedConvId,
    messageId: result.message_id,
    content: result.content,
    citations: result.citations,
  }
}

/**
 * Envia mensagem síncrona (fallback caso streaming encontre restrições de rede).
 */
export async function enviarMensagemSync(
  message: string,
  conversationId: string | null,
): Promise<ChatServiceResponse> {
  const token = pb.authStore.token
  const response = await fetch(`${BASE_URL}/backend/v1/tributacao/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId || undefined,
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(
      data?.error || 'Não foi possível consultar o especialista agora — tente novamente.',
    )
  }

  return {
    conversationId: data.conversation_id,
    messageId: data.message_id,
    content: data.content,
    citations: data.citations || [],
  }
}

/**
 * Lista as conversas anteriores do usuário com o Consultor Tributário Agro.
 */
export async function listarConversas(limit = 40): Promise<ConversaItem[]> {
  try {
    const token = pb.authStore.token
    const response = await fetch(`${BASE_URL}/backend/v1/tributacao/conversas?limit=${limit}`, {
      headers: {
        ...(token ? { Authorization: token } : {}),
      },
    })
    if (!response.ok) {
      return []
    }
    const data = await response.json()
    const rawList = Array.isArray(data)
      ? data
      : Array.isArray(data?.conversations)
        ? data.conversations
        : Array.isArray(data?.items)
          ? data.items
          : []
    return rawList
  } catch (err) {
    console.error('Erro ao listar conversas tributárias:', err)
    return []
  }
}

/**
 * Carrega o histórico de mensagens de uma conversa.
 */
export async function carregarMensagensConversa(conversationId: string): Promise<DisplayMessage[]> {
  const token = pb.authStore.token
  const response = await fetch(
    `${BASE_URL}/backend/v1/tributacao/conversas/${encodeURIComponent(conversationId)}/mensagens`,
    {
      headers: {
        ...(token ? { Authorization: token } : {}),
      },
    },
  )

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error || 'Falha ao carregar mensagens da conversa.')
  }

  const rawMessages: AgentMessage[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.messages)
      ? data.messages
      : Array.isArray(data?.items)
        ? data.items
        : []
  return displayableMessages(rawMessages)
}
