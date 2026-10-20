/**
 * Endpoints do Consultor Tributário Agro (Skip Cloud Agent: consultor-tributario-agro)
 *
 * 1. POST /backend/v1/tributacao/chat-stream - Streaming de chat com SSE e enriquecimento fiscal
 * 2. POST /backend/v1/tributacao/chat - Chat síncrono com enriquecimento fiscal
 * 3. GET  /backend/v1/tributacao/conversas - Lista de conversas anteriores do usuário
 * 4. GET  /backend/v1/tributacao/conversas/{conversationId}/mensagens - Mensagens de uma conversa
 *
 * Todas as variáveis e funções auxiliares ficam inlines dentro de cada callback para conformidade com a JSVM do PocketBase.
 */

// 1. Streaming de resposta do agente com SSE
routerAdd(
  'POST',
  '/backend/v1/tributacao/chat-stream',
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
        return e.unauthorizedError('Autenticação necessária para consultar o especialista.')
      }

      const body = e.requestInfo().body || {}
      const message = String(body.message || '').trim()
      if (!message) {
        return e.badRequestError('A mensagem não pode estar vazia.')
      }

      const convId = body.conversation_id ? String(body.conversation_id).trim() : null
      const convTitle = body.title ? String(body.title).slice(0, 80) : message.slice(0, 60)

      // Obter ou criar a conversa vinculada ao usuário
      const conv = $ai.agent(agentSlug).getOrCreateConversation({
        user_id: userId,
        id: convId || null,
        title: convTitle,
      })

      // Enriquecimento contextual inteligente:
      // Se a mensagem contiver menção a NCM (ex: 2520.20.00 ou 8 dígitos) ou produto + consulta fiscal,
      // pesquisar nas collections internas (parametrizacao_fiscal, regras_ncm_embalagem, etc.)
      // e anexar fontes oficiais de consulta pública.
      let enrichedMessage = message

      const ncmMatch =
        message.match(/\b\d{4}[.\s]?\d{2}[.\s]?\d{2}\b/) || message.match(/\b\d{8}\b/)
      let foundNcm = null
      if (ncmMatch) {
        foundNcm = ncmMatch[0].replace(/\D/g, '')
      }

      // Detecção de produtos agrícolas comuns se NCM não estiver explícito
      const isProductMention =
        /gesso|calc[aá]rio|adubo|fertilizante|defensivo|glifosato|herbicida|fungicida|inseticida|semente|mudas|inoculante/i.test(
          message,
        )
      const isTaxQuestion =
        /al[ií]quota|benef[ií]cio|zero|redu[cç][aã]o|tributad|pis|cofins|ibs|cbs|imposto|isento|isen[cç][aã]o/i.test(
          message,
        )

      if (foundNcm) {
        let internalContext = ''
        try {
          // Busca em parametrizacao_fiscal
          const paramRecs = $app.findRecordsByFilter(
            'parametrizacao_fiscal',
            `ncm ~ '${foundNcm.slice(0, 4)}'`,
            '-created',
            5,
            0,
          )
          if (paramRecs && paramRecs.length > 0) {
            internalContext += `\n[Base Interna - Parametrização Fiscal para NCM ${foundNcm} ou família]:\n`
            for (let i = 0; i < paramRecs.length; i++) {
              const r = paramRecs[i]
              internalContext += `- NCM ${r.getString('ncm')}: PIS ${r.getFloat('aliquota_pis')}%, COFINS ${r.getFloat('aliquota_cofins')}%, IBS ${r.getFloat('aliquota_ibs')}%, CBS ${r.getFloat('aliquota_cbs')}%. Classificação: ${r.getString('classificacao')}. Regra: ${r.getString('tributacao')}\n`
            }
          }
        } catch (_) {}

        try {
          // Busca em regras_ncm_embalagem
          const regrasRecs = $app.findRecordsByFilter(
            'regras_ncm_embalagem',
            `ncm ~ '${foundNcm.slice(0, 4)}'`,
            '-created',
            3,
            0,
          )
          if (regrasRecs && regrasRecs.length > 0) {
            internalContext += `\n[Base Interna - Regras TIPI/Embalagem NCM ${foundNcm}]:\n`
            for (let i = 0; i < regrasRecs.length; i++) {
              const r = regrasRecs[i]
              internalContext += `- NCM ${r.getString('ncm')}: Descrição "${r.getString('descricao')}". Regra Especial: "${r.getString('regra_especial')}"\n`
            }
          }
        } catch (_) {}

        const officialSourcesContext = `
[FONTES OFICIAIS DE LEGISLAÇÃO E PORTAIS PÚBLICOS VINCULADOS AO NCM ${foundNcm}]:
1. Presidência da República / Casa Civil - Lei nº 10.925/2004 (Alíquota zero de PIS/Pasep e COFINS na importação e venda de insumos agropecuários):
   URL: https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.925.htm
2. Presidência da República / Casa Civil - Lei Complementar nº 224/2025 (Reoneração linear de 10% dos incentivos e alíquota residual):
   URL: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp224.htm
3. Presidência da República / Casa Civil - Lei Complementar nº 214/2025 (Reforma Tributária - Art. 138 e Anexo IX para insumos agropecuários no IBS/CBS):
   URL: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
4. Secretaria Especial da Receita Federal do Brasil - Sistema Classif / Nomenclatura Comum do Mercosul (NCM e TIPI):
   URL: https://portalunico.siscomex.gov.br/classif/
5. Instrução Normativa RFB nº 2.305/2025 e Decreto nº 5.630/2005 (Regulamentação de PIS/COFINS Agropecuário):
   URL: https://www.gov.br/receitafederal/pt-br
`

        enrichedMessage = `${message}\n\n[CONTEXTO DE DADOS ENRIQUECIDO PELO SISTEMA PARA NCM ${foundNcm}]:${internalContext}\n${officialSourcesContext}\n\nInstrução: utilize estes dados e fontes para fundamentar sua resposta com citação explícita dos dispositivos e links.`
      } else if (isProductMention && isTaxQuestion) {
        // Quando o usuário perguntou sobre o produto mas NÃO informou o NCM:
        // Reforçar o direcionamento para o agente cumprir a Regra de Ouro (perguntar o NCM de volta)
        enrichedMessage = `${message}\n\n[DIRETRIZ DO SISTEMA]: O usuário está perguntando sobre tributação/benefício fiscal de produto agropecuário mas não especificou a NCM exata. Lembre-se da REGRA DE OURO: não responda de forma genérica ou fechada; PERGUNTE DE VOLTA qual é o código NCM do produto (e se é nacional ou importado), explicando que o benefício na legislação brasileira (como Lei 10.925/2004 e LC 214/2025) depende estritamente do NCM e destinação. Dê sugestões de NCMs habituais para este produto.`
      }

      const iter = $ai.agent(agentSlug).chat({
        user_id: userId,
        conversation_id: conv.id,
        message: enrichedMessage,
        stream: true,
      })

      e.response.header().set('Content-Type', 'text/event-stream')
      e.response.header().set('Cache-Control', 'no-cache')
      e.response.header().set('Connection', 'keep-alive')
      e.response.header().set('X-Conversation-Id', conv.id)

      $response.stream(e, iter)
      return null
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
          (err.message || 'Erro desconhecido') +
          ')',
      })
    }
  },
  $apis.requireAuth(),
)

// 2. Chat síncrono (fallback ou requisições diretas)
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
        return e.unauthorizedError('Autenticação necessária para consultar o especialista.')
      }

      const body = e.requestInfo().body || {}
      const message = String(body.message || '').trim()
      if (!message) {
        return e.badRequestError('A mensagem não pode estar vazia.')
      }

      const convId = body.conversation_id ? String(body.conversation_id).trim() : null

      // Enriquecimento contextual no modo síncrono
      let enrichedMessage = message
      const ncmMatch =
        message.match(/\b\d{4}[.\s]?\d{2}[.\s]?\d{2}\b/) || message.match(/\b\d{8}\b/)
      let foundNcm = null
      if (ncmMatch) {
        foundNcm = ncmMatch[0].replace(/\D/g, '')
      }

      const isProductMention =
        /gesso|calc[aá]rio|adubo|fertilizante|defensivo|glifosato|herbicida|fungicida|inseticida|semente|mudas|inoculante/i.test(
          message,
        )
      const isTaxQuestion =
        /al[ií]quota|benef[ií]cio|zero|redu[cç][aã]o|tributad|pis|cofins|ibs|cbs|imposto|isento|isen[cç][aã]o/i.test(
          message,
        )

      if (foundNcm) {
        let internalContext = ''
        try {
          const paramRecs = $app.findRecordsByFilter(
            'parametrizacao_fiscal',
            `ncm ~ '${foundNcm.slice(0, 4)}'`,
            '-created',
            5,
            0,
          )
          if (paramRecs && paramRecs.length > 0) {
            internalContext += `\n[Base Interna - Parametrização Fiscal para NCM ${foundNcm}]:\n`
            for (let i = 0; i < paramRecs.length; i++) {
              const r = paramRecs[i]
              internalContext += `- NCM ${r.getString('ncm')}: PIS ${r.getFloat('aliquota_pis')}%, COFINS ${r.getFloat('aliquota_cofins')}%, IBS ${r.getFloat('aliquota_ibs')}%, CBS ${r.getFloat('aliquota_cbs')}%. Classificação: ${r.getString('classificacao')}. Regra: ${r.getString('tributacao')}\n`
            }
          }
        } catch (_) {}

        try {
          const regrasRecs = $app.findRecordsByFilter(
            'regras_ncm_embalagem',
            `ncm ~ '${foundNcm.slice(0, 4)}'`,
            '-created',
            3,
            0,
          )
          if (regrasRecs && regrasRecs.length > 0) {
            internalContext += `\n[Base Interna - Regras TIPI/Embalagem NCM ${foundNcm}]:\n`
            for (let i = 0; i < regrasRecs.length; i++) {
              const r = regrasRecs[i]
              internalContext += `- NCM ${r.getString('ncm')}: Descrição "${r.getString('descricao')}". Regra Especial: "${r.getString('regra_especial')}"\n`
            }
          }
        } catch (_) {}

        const officialSourcesContext = `
[FONTES OFICIAIS DE LEGISLAÇÃO E PORTAIS PÚBLICOS VINCULADOS AO NCM ${foundNcm}]:
1. Presidência da República / Casa Civil - Lei nº 10.925/2004 (Alíquota zero de PIS/Pasep e COFINS na importação e venda de insumos agropecuários):
   URL: https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.925.htm
2. Presidência da República / Casa Civil - Lei Complementar nº 224/2025 (Reoneração linear de 10% dos incentivos e alíquota residual):
   URL: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp224.htm
3. Presidência da República / Casa Civil - Lei Complementar nº 214/2025 (Reforma Tributária - Art. 138 e Anexo IX para insumos agropecuários no IBS/CBS):
   URL: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
4. Secretaria Especial da Receita Federal do Brasil - Sistema Classif / Nomenclatura Comum do Mercosul (NCM e TIPI):
   URL: https://portalunico.siscomex.gov.br/classif/
5. Instrução Normativa RFB nº 2.305/2025 e Decreto nº 5.630/2005 (Regulamentação de PIS/COFINS Agropecuário):
   URL: https://www.gov.br/receitafederal/pt-br
`
        enrichedMessage = `${message}\n\n[CONTEXTO DE DADOS ENRIQUECIDO PELO SISTEMA PARA NCM ${foundNcm}]:${internalContext}\n${officialSourcesContext}\n\nInstrução: utilize estes dados e fontes para fundamentar sua resposta com citação explícita dos dispositivos e links.`
      } else if (isProductMention && isTaxQuestion) {
        enrichedMessage = `${message}\n\n[DIRETRIZ DO SISTEMA]: O usuário está perguntando sobre tributação/benefício fiscal de produto agropecuário mas não especificou a NCM exata. Lembre-se da REGRA DE OURO: não responda de forma genérica ou fechada; PERGUNTE DE VOLTA qual é o código NCM do produto (e se é nacional ou importado), explicando que o benefício na legislação brasileira (como Lei 10.925/2004 e LC 214/2025) depende estritamente do NCM e destinação. Dê sugestões de NCMs habituais para este produto.`
      }

      const result = $ai.agent(agentSlug).chat({
        user_id: userId,
        conversation_id: convId || null,
        message: enrichedMessage,
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
          (err.message || 'Erro desconhecido') +
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
