/**
 * Endpoints do Consultor Tributário Agro (Skip Cloud Agent: consultor-tributario-agro)
 * Assistente de IA especialista em tributação agrícola brasileira.
 *
 * Recursos:
 * - Streaming SSE com watchdog de segurança e garantia de evento terminal (done/error)
 * - Chat síncrono
 * - Listagem de conversas do usuário autenticado
 * - Listagem de mensagens de uma conversa
 *
 * NOTA CRÍTICA DE ARQUITETURA POCKETBASE JSVM:
 * Todas as funções auxiliares e variáveis devem ser declaradas INLINE dentro do corpo
 * do callback de cada routerAdd para respeitar o isolamento da VM pool do PocketBase.
 */

// 1. Streaming de resposta com SSE blindado
routerAdd(
  'POST',
  '/backend/v1/tributacao/chat-stream',
  (e) => {
    const agentSlug = 'consultor-tributario-agro'
    const startTime = Date.now()
    let resolvedUserId = null
    let questionPreview = ''

    try {
      let userId = e.auth && e.auth.id ? e.auth.id : null
      if (!userId) {
        try {
          const defaultUser = $app.findAuthRecordByEmail('_pb_users_auth_', 'roogerio99@gmail.com')
          if (defaultUser && defaultUser.id) {
            userId = defaultUser.id
          }
        } catch (_) {}
      }

      if (!userId) {
        return e.unauthorizedError(
          'Autenticação necessária para consultar o especialista tributário.',
        )
      }
      resolvedUserId = userId

      const body = e.requestInfo().body || {}
      const message = String(body.message || '').trim()
      if (!message) {
        return e.badRequestError('A mensagem não pode estar vazia.')
      }
      questionPreview = message.slice(0, 60)

      const convId = body.conversation_id ? String(body.conversation_id).trim() : null
      const convTitle = body.title ? String(body.title).slice(0, 80) : message.slice(0, 60)

      const conv = $ai.agent(agentSlug).getOrCreateConversation({
        user_id: userId,
        id: convId || null,
        title: convTitle,
      })

      const iter = $ai.agent(agentSlug).chat({
        user_id: userId,
        conversation_id: conv.id,
        message: message,
        stream: true,
      })

      // Gerador envelopado que insere logs, watchdog de segurança e garante término limpo
      function* safeIterator() {
        let sawDone = false
        let chunkCount = 0

        try {
          for (const ev of iter) {
            if (ev && ev.type === 'done') {
              sawDone = true
            }
            if (ev && ev.type === 'chunk') {
              chunkCount++
            }
            yield ev
          }

          // Se o iterador nativo encerrou sem emitir 'done' nem lançar erro
          if (!sawDone) {
            console.warn(
              `[tributacao_chat] Stream terminou sem evento 'done'. Emitindo done sintético. conv=${conv.id} chunks=${chunkCount} elapsed=${Date.now() - startTime}ms`,
            )
            yield {
              type: 'done',
              conversation_id: conv.id,
              message_id: 'gen-' + Date.now(),
            }
          }
        } catch (iterErr) {
          console.error(
            `[tributacao_chat] Erro durante a iteração do agente: ${iterErr && iterErr.message ? iterErr.message : iterErr}. conv=${conv.id} chunks=${chunkCount} user=${resolvedUserId}`,
          )
          // Emite evento de erro no SSE para o cliente receber o diagnóstico sem travar
          yield {
            type: 'error',
            message:
              'Falha no processamento da resposta: ' +
              (iterErr && iterErr.message
                ? iterErr.message
                : 'tempo limite ou erro interno do agente'),
          }
        }
      }

      e.response.header().set('Content-Type', 'text/event-stream')
      e.response.header().set('Cache-Control', 'no-cache, no-transform')
      e.response.header().set('Connection', 'keep-alive')
      e.response.header().set('X-Accel-Buffering', 'no')
      e.response.header().set('X-Conversation-Id', conv.id)

      $response.stream(e, safeIterator())
      return null
    } catch (err) {
      console.error(
        `[tributacao_chat] Exceção antes do início do stream: ${err && err.message ? err.message : err}. user=${resolvedUserId} q="${questionPreview}"`,
      )
      if (err instanceof SkipAiConfigError) {
        return e.json(503, {
          error: 'Serviço de IA temporariamente indisponível. Tente novamente em instantes.',
        })
      }
      if (err instanceof SkipAiAgentsError) {
        const status = err.status || 500
        return e.json(status, {
          error:
            status >= 500
              ? 'Não foi possível consultar o especialista agora — tente novamente.'
              : err.message,
        })
      }
      if (err instanceof SkipAiError) {
        const status = err.status || 502
        return e.json(status, {
          error:
            status >= 500
              ? 'Não foi possível consultar o especialista agora — tente novamente.'
              : err.message,
        })
      }
      return e.json(500, {
        error:
          'Não foi possível consultar o especialista agora — tente novamente. (' +
          (err && err.message ? err.message : 'Erro desconhecido') +
          ')',
      })
    }
  },
  $apis.requireAuth(),
)

// 2. Chat síncrono
routerAdd(
  'POST',
  '/backend/v1/tributacao/chat',
  (e) => {
    const agentSlug = 'consultor-tributario-agro'
    try {
      let userId = e.auth && e.auth.id ? e.auth.id : null
      if (!userId) {
        try {
          const defaultUser = $app.findAuthRecordByEmail('_pb_users_auth_', 'roogerio99@gmail.com')
          if (defaultUser && defaultUser.id) {
            userId = defaultUser.id
          }
        } catch (_) {}
      }

      if (!userId) {
        return e.unauthorizedError(
          'Autenticação necessária para consultar o especialista tributário.',
        )
      }

      const body = e.requestInfo().body || {}
      const message = String(body.message || '').trim()
      if (!message) {
        return e.badRequestError('A mensagem não pode estar vazia.')
      }

      const convId = body.conversation_id ? String(body.conversation_id).trim() : null
      const convTitle = body.title ? String(body.title).slice(0, 80) : message.slice(0, 60)

      const conv = $ai.agent(agentSlug).getOrCreateConversation({
        user_id: userId,
        id: convId || null,
        title: convTitle,
      })

      const result = $ai.agent(agentSlug).chat({
        user_id: userId,
        conversation_id: conv.id,
        message: message,
      })

      return e.json(200, {
        conversation_id: result.conversation_id,
        content: result.content,
        citations: result.citations || [],
        message_id: result.message_id,
      })
    } catch (err) {
      if (err instanceof SkipAiConfigError) {
        return e.json(503, {
          error: 'Serviço de IA temporariamente indisponível. Tente novamente em instantes.',
        })
      }
      if (err instanceof SkipAiAgentsError) {
        const status = err.status || 500
        return e.json(status, {
          error:
            status >= 500
              ? 'Não foi possível consultar o especialista agora — tente novamente.'
              : err.message,
        })
      }
      if (err instanceof SkipAiError) {
        const status = err.status || 502
        return e.json(status, {
          error:
            status >= 500
              ? 'Não foi possível consultar o especialista agora — tente novamente.'
              : err.message,
        })
      }
      return e.json(500, {
        error:
          'Não foi possível consultar o especialista agora — tente novamente. (' +
          (err && err.message ? err.message : 'Erro desconhecido') +
          ')',
      })
    }
  },
  $apis.requireAuth(),
)

// 3. Listar conversas anteriores do usuário
routerAdd(
  'GET',
  '/backend/v1/tributacao/conversas',
  (e) => {
    const agentSlug = 'consultor-tributario-agro'
    try {
      let userId = e.auth && e.auth.id ? e.auth.id : null
      if (!userId) {
        try {
          const defaultUser = $app.findAuthRecordByEmail('_pb_users_auth_', 'roogerio99@gmail.com')
          if (defaultUser && defaultUser.id) {
            userId = defaultUser.id
          }
        } catch (_) {}
      }

      if (!userId) {
        return e.unauthorizedError('Autenticação necessária.')
      }

      const limit = parseInt(e.requestInfo().query?.limit || '30', 10) || 30
      const list = $ai.agent(agentSlug).listConversations({
        user_id: userId,
        limit: limit,
      })

      return e.json(200, {
        conversations: list || [],
      })
    } catch (err) {
      if (err instanceof SkipAiAgentsError) {
        const status = err.status || 500
        return e.json(status, { error: err.message })
      }
      return e.json(500, { error: 'Erro ao buscar histórico de conversas: ' + err.message })
    }
  },
  $apis.requireAuth(),
)

// 4. Listar mensagens de uma conversa específica
routerAdd(
  'GET',
  '/backend/v1/tributacao/conversas/{conversationId}/mensagens',
  (e) => {
    const agentSlug = 'consultor-tributario-agro'
    try {
      let userId = e.auth && e.auth.id ? e.auth.id : null
      if (!userId) {
        try {
          const defaultUser = $app.findAuthRecordByEmail('_pb_users_auth_', 'roogerio99@gmail.com')
          if (defaultUser && defaultUser.id) {
            userId = defaultUser.id
          }
        } catch (_) {}
      }

      if (!userId) {
        return e.unauthorizedError('Autenticação necessária.')
      }

      const convId = e.request.pathValue('conversationId')
      if (!convId) {
        return e.badRequestError('ID da conversa é obrigatório.')
      }

      const messages = $ai.agent(agentSlug).listMessages({
        conversation_id: convId,
        user_id: userId,
        limit: 100,
      })

      return e.json(200, {
        messages: messages || [],
      })
    } catch (err) {
      if (err instanceof SkipAiAgentsError) {
        const status = err.status || 500
        return e.json(status, { error: status >= 500 ? 'Conversa não localizada.' : err.message })
      }
      return e.json(500, { error: 'Erro ao carregar mensagens da conversa: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
