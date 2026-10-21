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

      // Configura os cabeçalhos SSE antes de iniciar o stream
      e.response.header().set('Content-Type', 'text/event-stream')
      e.response.header().set('Cache-Control', 'no-cache, no-transform')
      e.response.header().set('Connection', 'keep-alive')
      e.response.header().set('X-Accel-Buffering', 'no')
      e.response.header().set('X-Conversation-Id', conv.id)

      let iter
      try {
        iter = $ai.agent(agentSlug).chat({
          user_id: userId,
          conversation_id: conv.id,
          message: message,
          stream: true,
        })
      } catch (chatCallErr) {
        console.error(
          `[tributacao_chat] Falha na chamada chat(stream:true): ${chatCallErr && chatCallErr.message ? chatCallErr.message : chatCallErr}. Tentando chat síncrono como fallback.`,
        )
        // Fallback síncrono caso chat({stream:true}) lance erro
        try {
          const syncResult = $ai.agent(agentSlug).chat({
            user_id: userId,
            conversation_id: conv.id,
            message: message,
          })

          function* fallbackIterator() {
            if (syncResult && syncResult.citations && syncResult.citations.length > 0) {
              yield { type: 'citations', items: syncResult.citations }
            }
            if (syncResult && syncResult.content) {
              yield { type: 'chunk', content: syncResult.content }
            }
            yield {
              type: 'done',
              conversation_id: (syncResult && syncResult.conversation_id) || conv.id,
              message_id: (syncResult && syncResult.message_id) || 'sync-' + Date.now(),
            }
          }

          $response.stream(e, fallbackIterator())
          return null
        } catch (syncErr) {
          throw syncErr
        }
      }

      // Gerador envelopado que insere logs detalhados de cada evento,
      // watchdog de segurança e garante término limpo com evento 'done'.
      function* safeIterator() {
        let sawDone = false
        let chunkCount = 0
        let toolCallCount = 0
        let firstChunkTime = null
        let accumulatedContent = ''

        try {
          for (const ev of iter) {
            if (!ev) continue
            const evType = ev.type || 'unknown'

            if (evType === 'chunk') {
              chunkCount++
              if (firstChunkTime === null) {
                firstChunkTime = Date.now() - startTime
              }
              if (ev.content) {
                accumulatedContent += ev.content
              }
            } else if (evType === 'tool_call_start' || evType === 'tool_call_done') {
              toolCallCount++
            } else if (evType === 'done') {
              sawDone = true
            }

            yield ev
          }

          // Se nenhum chunk foi emitido pelo stream nativo, executa recuperação ativa antes de concluir
          if (chunkCount === 0 && !accumulatedContent) {
            console.warn(
              `[tributacao_chat] Zero chunks recebidos pelo stream! Tentando recuperar resposta síncrona para não travar o cliente... conv=${conv.id}`,
            )
            let recoveredText = ''
            try {
              const recoveryResult = $ai.agent(agentSlug).chat({
                user_id: userId,
                conversation_id: conv.id,
                message: message,
              })
              if (
                recoveryResult &&
                recoveryResult.content &&
                String(recoveryResult.content).trim()
              ) {
                recoveredText = String(recoveryResult.content)
                console.log(
                  `[tributacao_chat] Recuperação síncrona bem-sucedida! chars=${recoveredText.length} conv=${conv.id}`,
                )
              } else {
                console.warn(
                  `[tributacao_chat] Recuperação síncrona retornou conteúdo vazio ou nulo. conv=${conv.id}`,
                )
              }
            } catch (recErr) {
              console.error(
                `[tributacao_chat] Falha na recuperação síncrona: ${recErr && recErr.message ? recErr.message : recErr} conv=${conv.id}`,
              )
            }

            // Se a recuperação síncrona trouxe texto, emite em blocos ou completo
            if (recoveredText) {
              chunkCount++
              accumulatedContent += recoveredText
              yield { type: 'chunk', content: recoveredText }
            } else {
              // Requisito: Se a recuperação síncrona falhar ou vier vazia,
              // NUNCA encerrar com 0 chars silenciosamente.
              // Emite mensagem amigável em português antes do done.
              const fallbackFriendlyMsg =
                '> ⚠️ **Aviso:** O especialista tributário está temporariamente ocupado ou a consulta excedeu o tempo de resposta. Por favor, tente novamente em instantes.'
              chunkCount++
              accumulatedContent += fallbackFriendlyMsg
              console.warn(
                `[tributacao_chat] Emitindo mensagem amigável de fallback após falha no stream e no sync. conv=${conv.id}`,
              )
              yield { type: 'chunk', content: fallbackFriendlyMsg }
            }
          }

          const totalElapsed = Date.now() - startTime
          console.log(
            `[tributacao_chat] Stream concluído. conv=${conv.id} chunks=${chunkCount} toolCalls=${toolCallCount} firstChunk=${firstChunkTime !== null ? firstChunkTime : 'N/A'}ms total=${totalElapsed}ms sawDone=${sawDone} chars=${accumulatedContent.length}`,
          )

          // Se o iterador nativo encerrou sem emitir 'done'
          if (!sawDone) {
            console.warn(
              `[tributacao_chat] Stream terminou sem evento 'done'. Emitindo done sintético. conv=${conv.id} chunks=${chunkCount} elapsed=${totalElapsed}ms chars=${accumulatedContent.length}`,
            )
            yield {
              type: 'done',
              conversation_id: conv.id,
              message_id: 'gen-' + Date.now(),
            }
          }
        } catch (iterErr) {
          const totalElapsed = Date.now() - startTime
          console.error(
            `[tributacao_chat] Erro durante a iteração do agente: ${iterErr && iterErr.message ? iterErr.message : iterErr}. conv=${conv.id} chunks=${chunkCount} elapsed=${totalElapsed}ms user=${resolvedUserId}`,
          )

          // Se nenhum conteúdo foi gerado e deu erro na iteração, tenta fallback síncrono
          if (chunkCount === 0) {
            try {
              console.warn(
                `[tributacao_chat] Tentando fallback síncrono após erro de iteração... conv=${conv.id}`,
              )
              const syncResult = $ai.agent(agentSlug).chat({
                user_id: userId,
                conversation_id: conv.id,
                message: message,
              })
              if (syncResult && syncResult.content && String(syncResult.content).trim()) {
                const recovered = String(syncResult.content)
                console.log(
                  `[tributacao_chat] Fallback síncrono após erro de iteração bem-sucedido! chars=${recovered.length} conv=${conv.id}`,
                )
                yield { type: 'chunk', content: recovered }
                yield {
                  type: 'done',
                  conversation_id: (syncResult && syncResult.conversation_id) || conv.id,
                  message_id: (syncResult && syncResult.message_id) || 'rec-' + Date.now(),
                }
                return
              }
            } catch (errSyncCatch) {
              console.error(
                `[tributacao_chat] Falha no fallback síncrono após erro de iteração: ${errSyncCatch && errSyncCatch.message ? errSyncCatch.message : errSyncCatch} conv=${conv.id}`,
              )
            }

            // Emite mensagem amigável antes do done/error para não ficar em branco
            yield {
              type: 'chunk',
              content:
                '> ⚠️ **Aviso:** O especialista tributário encontrou uma instabilidade temporária. Por favor, tente novamente em instantes.',
            }
            yield {
              type: 'done',
              conversation_id: conv.id,
              message_id: 'err-done-' + Date.now(),
            }
            return
          }

          // Se já havia emitido chunks e deu erro no meio, emite evento de erro no SSE
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

// 2. Chat síncrono (endpoint primário ultra-rápido e 100% confiável)
routerAdd(
  'POST',
  '/backend/v1/tributacao/chat',
  (e) => {
    const agentSlug = 'consultor-tributario-agro'
    const startTime = Date.now()
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

      const elapsed = Date.now() - startTime
      console.log(
        `[tributacao_chat] Chat síncrono concluído com sucesso. conv=${result.conversation_id || conv.id} chars=${(result.content || '').length} elapsed=${elapsed}ms`,
      )

      return e.json(200, {
        conversation_id: result.conversation_id || conv.id,
        content: result.content || '',
        citations: result.citations || [],
        message_id: result.message_id || 'sync-' + Date.now(),
      })
    } catch (err) {
      const elapsed = Date.now() - startTime
      console.error(
        `[tributacao_chat] Erro no chat síncrono após ${elapsed}ms: ${err && err.message ? err.message : err}`,
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
