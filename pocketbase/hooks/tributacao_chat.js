/**
 * Endpoints do Consultor Tributário Agro (Skip Cloud Agent: consultor-tributario-agro)
 * Em conformidade estrita com o PROTOCOLO OFICIAL DE CONSULTA TRIBUTÁRIA AGRO (3 Fases):
 *
 * Fase A: Triagem e Questionário Dinâmico (Entrada) - P1 obrigatória + P2 a P7 condicionais por gatilhos e diagnóstico cruzado
 * Fase B: Análise nos 4 Pilares Independentes (Motor) - Regulatório MAPA, Agronômico Embrapa, Fiscal TIPI/Embalagem, Tributário PIS/COFINS e IBS/CBS
 * Fase C: Parecer Padronizado em 3 Blocos + Trava ERP (Saída)
 *
 * NOTA CRÍTICA DE ARQUITETURA POCKETBASE JSVM:
 * Todas as funções auxiliares e variáveis devem ser declaradas INLINE dentro do corpo do callback de cada routerAdd
 * para respeitar o isolamento da VM pool do PocketBase (evitando Hook scoping error).
 */

// 1. Streaming de resposta com SSE
routerAdd(
  'POST',
  '/backend/v1/tributacao/chat-stream',
  (e) => {
    // Funções inline para conformidade total com o pool de VM do PocketBase
    function normTxt(txt) {
      if (!txt) return ''
      return String(txt)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    function extractNcm(str) {
      if (!str) return null
      const m = str.match(/\b\d{4}[.\s]?\d{2}[.\s]?\d{2}\b/) || str.match(/\b\d{8}\b/)
      if (m) {
        return m[0].replace(/\D/g, '')
      }
      return null
    }

    function runProtocolAnalysis(currentMessage, histMessages) {
      const fullText = [...(histMessages || []).map((m) => m.content || ''), currentMessage].join(
        '\n',
      )

      const norm = normTxt(fullText)
      const ncm = extractNcm(fullText)

      const termosHibridos = [
        'GESSO',
        'ENXOFRE',
        'BORO',
        'ULEXITA',
        'MAGNESIO',
        'CALCIO',
        'FOSFATO',
        'SULFATO',
        'NITRATO',
        'ACIDO',
      ]
      const temTermosHibridos = termosHibridos.some((t) => norm.includes(t))

      const termosBioAdj = [
        'INOCULANTE',
        'BACILLUS',
        'AZOSPIRILLUM',
        'BRADYRHIZOBIUM',
        'TRICHODERMA',
        'PSEUDOMONAS',
        'ADJUVANTE',
        'OLEO',
        'ESPALHANTE',
        'SILWET',
      ]
      const temTermosBioAdj = termosBioAdj.some((t) => norm.includes(t))

      const moleculasN2 = [
        'BIFENTRINA',
        'LAMBDA',
        'CIALOTRINA',
        'CLORFENAPIR',
        'MALATIONA',
        'FENITROTIONA',
        'CIFLUTRINA',
      ]
      const temMoleculasN2 = moleculasN2.some((m) => norm.includes(m))

      let conflitoDetectado = null

      if (norm.includes('GESSO') && ncm === '31059090') {
        conflitoDetectado = {
          tipo: 'CONFLITO_GESSO_3105',
          diagnostico:
            'CONFLITO DETECTADO: A NCM 3105.90.90 exige fertilizante mineral misto (com N, P ou K). O gesso agrícola puro (sulfato de cálcio di-hidratado CaSO4.2H2O) não possui N, P ou K e classifica-se em 2520.10.19 (mineral bruto moído) ou 3824.99.89 (fosfogesso industrial).',
          perguntasObrigatorias: ['P2_GRAU_ELABORACAO', 'P4_REGISTRO_MAPA'],
        }
      } else if (norm.includes('ENXOFRE') && ncm === '25030090') {
        conflitoDetectado = {
          tipo: 'CONVERGENCIA_ENXOFRE_2503',
          diagnostico:
            'CONVERGÊNCIA C/ ALERTA CONDICIONAL: A NCM 2503.00.90 é correta para enxofre elementar moído ou pastilhado com bentonita, mas está fora do Capítulo 31. O benefício do art. 1º, IV da Lei 10.925/2004 exige comprovação de registro no SIPEAGRO e destinação exclusiva como corretivo/condicionador agrícola (CARF Proc. nº 10875.910251/2011-20).',
          perguntasObrigatorias: ['P4_REGISTRO_MAPA', 'P6_DESTINACAO'],
        }
      } else if (
        (norm.includes('INOCULANTE') || norm.includes('BACILLUS')) &&
        (ncm === '30024999' || ncm === '35079049')
      ) {
        conflitoDetectado = {
          tipo: 'RISCO_INOCULANTE_BACILLUS',
          diagnostico:
            'RISCO TRIBUTÁRIO ALTO: Se classificado em 3507.90.49 (enzimas), a NCM está incorreta para cultura bacteriana. Na NCM 3002.49.99, a tributação depende estritamente da função agronômica: Fixador de Nitrogênio tem alíquota zero/reoneração linear (0%/0,925%), enquanto Solubilizador de Fósforo (Bacillus megaterium/subtilis) é TRIBUTADO INTEGRALMENTE a 9,25% no Lucro Real / 3,65% no Presumido conforme a Solução de Consulta COSIT nº 261/2023.',
          perguntasObrigatorias: ['P3_FUNCAO_AGRONOMICA'],
        }
      } else if (
        (norm.includes('OLEO') || norm.includes('ADJUVANTE') || norm.includes('ESPALHANTE')) &&
        (ncm === '31059090' || ncm === '38089999' || ncm === '38089199')
      ) {
        conflitoDetectado = {
          tipo: 'CONFLITO_ADJUVANTE_OLEO',
          diagnostico:
            'CONFLITO CRÍTICO (SC COSIT nº 4/2024): Adjuvantes e óleos sem registro numérico de agrotóxico no MAPA não pertencem ao Capítulo 31 nem usufruem do benefício de defensivos da posição 38.08. Se dispensados pelo Ato SDA nº 104/2017, são tributados integralmente a 9,25% (Lucro Real) / 3,65% (Presumido) nas NCMs 3402.90.29 ou 2710.19.31.',
          perguntasObrigatorias: ['P3_FUNCAO_AGRONOMICA', 'P4_REGISTRO_MAPA'],
        }
      } else if (
        temMoleculasN2 &&
        (ncm === '38089199' || ncm === '38086990' || !ncm || ncm.startsWith('3808'))
      ) {
        conflitoDetectado = {
          tipo: 'DEPENDENCIA_EMBALAGEM_3808',
          diagnostico:
            'DEPENDÊNCIA DE EMBALAGEM (NOTA DE SUBPOSIÇÕES 2 DO CAP. 38): As moléculas Bifentrina, Lambda-Cialotrina, Clorfenapir e afins têm sua NCM exata definida estritamente pelo peso/volume do recipiente unitário: <= 300 g/mL (3808.61.00), de 300 g/mL a 7,5 kg/L (3808.62.90) ou acima de 7,5 kg/L (3808.69.90).',
          perguntasObrigatorias: ['P5_EMBALAGEM_UNITARIA'],
        }
      } else if (ncm === '31051000' || (norm.includes('FOLIAR') && norm.includes('3105'))) {
        conflitoDetectado = {
          tipo: 'DEPENDENCIA_EMBALAGEM_3105',
          diagnostico:
            'DEPENDÊNCIA DE PESO BRUTO (NOTA 5 DO CAP. 31): A NCM 3105.10.00 só é admitida para tabletes ou embalagens individuais de peso bruto total <= 10 kg. Se comercializado em bombonas ou sacas > 10 kg, a classificação migra para 3105.90.90 ou subposição específica.',
          perguntasObrigatorias: ['P5_EMBALAGEM_UNITARIA'],
        }
      }

      const jaRespondeuP2 =
        /mineral|gipsita|bruto|mo[ií]do|puro|fosfogesso|qu[ií]mico isolado|subproduto|mistura|formulad|granulad/i.test(
          fullText,
        )
      const jaRespondeuP3 =
        /defensivo|biodefensivo|fixador|azospirillum|bradyrhizobium|solubilizador|megaterium|subtilis|adjuvante|espalhante|condicionador/i.test(
          fullText,
        )
      const jaRespondeuP4 =
        /registro|agrofit|sipeagro|in 35|in 39|dispensa|dispensado|ato 104|sem registro/i.test(
          fullText,
        )
      const jaRespondeuP5 =
        /\b(\d+[.,]?\d*)\s*(kg|g|l|ml|litro|quilo|grama|big bag|granel|saca|bombona)\b/i.test(
          fullText,
        ) || /300\s*ml|300\s*g|7,5|10\s*kg/i.test(fullText)
      const jaRespondeuP6 =
        /produtor rural|cooperativa|revenda|lavoura|ind[uú]stria|mat[eé]ria-prima|veterin[aá]ri|constru[cç][aã]o/i.test(
          fullText,
        )

      const perguntasNecessarias = []

      // P1 se não há NCM nem declaração explícita de busca automática
      if (!ncm && !norm.includes('NAO SEI A NCM') && !norm.includes('DESCOBRIR AUTOMATICAMENTE')) {
        perguntasNecessarias.push({
          id: 'P1_NCM',
          titulo: 'Código NCM do Produto (8 dígitos)',
          pergunta:
            '1. Qual é a Descrição Comercial Completa do produto (com concentração e embalagem, se houver) e qual é o Código NCM (8 dígitos) constante na Nota Fiscal ou pretendido?',
          opcoes: [
            'Informar código NCM de 8 dígitos (XXXX.XX.XX)',
            'Não sei a NCM — descobrir automaticamente pela descrição comercial',
          ],
          motivo:
            'Permite ao motor cruzar imediatamente Descrição x NCM, detectando conflitos de capítulo/subposição ou indicando a NCM exata.',
        })
      }

      // P2
      if (
        !jaRespondeuP2 &&
        (temTermosHibridos ||
          (ncm && ['25', '28', '29', '31'].includes(ncm.slice(0, 2))) ||
          conflitoDetectado?.perguntasObrigatorias?.includes('P2_GRAU_ELABORACAO'))
      ) {
        perguntasNecessarias.push({
          id: 'P2_GRAU_ELABORACAO',
          titulo: 'Natureza Química e Estado de Formulação',
          pergunta: '2. Qual é o grau de elaboração física/química deste produto?',
          opcoes: [
            'A) Mineral natural bruto/moído sem reação industrial (ex.: gipsita moída 2520.10, ulexita 2528.00, enxofre bentonita 2503.00)',
            'B) Composto químico isolado ou subproduto industrial puro (ex.: fosfogesso 3824.99, sulfato de magnésio 2833.21, P.A. técnico Cap. 29)',
            'C) Mistura comercial formulada/granulada com macronutrientes N, P, K ou múltiplos nutrientes (Cap. 31 — NCM 3105.90.90)',
          ],
          motivo:
            'Define se o produto permanece nos Capítulos 25/28/29/3824 (benefício condicional) ou se ingressa no Capítulo 31 (Nota 1 do Cap. 31).',
        })
      }

      // P3
      if (
        !jaRespondeuP3 &&
        (temTermosBioAdj ||
          (ncm && ['3002', '3507', '3402', '3808'].includes(ncm.slice(0, 4))) ||
          conflitoDetectado?.perguntasObrigatorias?.includes('P3_FUNCAO_AGRONOMICA'))
      ) {
        perguntasNecessarias.push({
          id: 'P3_FUNCAO_AGRONOMICA',
          titulo: 'Finalidade Agronômica e Mecanismo de Ação',
          pergunta:
            '3. Qual é a finalidade agronômica principal declarada no rótulo ou bula do produto?',
          opcoes: [
            'A) Defensivo fitossanitário / Biodefensivo registrado no AGROFIT (controle de pragas, doenças, plantas daninhas ou nematóides — Posição 38.08)',
            'B) Inoculante Fixador de Nitrogênio (Bradyrhizobium / Azospirillum — Beneficiado pelo art. 1º, IV, da Lei 10.925/2004)',
            'C) Inoculante Solubilizador de Fósforo / Promotor de Crescimento (Bacillus megaterium/subtilis — Tributado 9,25% conforme SC COSIT 261/2023)',
            'D) Adjuvante / Espalhante / Óleo auxiliar de pulverização sem registro de defensivo (Tributado 9,25% conforme SC COSIT 4/2024)',
            'E) Corretivo de Acidez/Sodicidade, Condicionador físico de solo ou Fertilizante fornecedor de nutrientes',
          ],
          motivo:
            'Muda radicalmente o PIS/COFINS: Fixadores e defensivos têm benefício (0% até mar/26 e 0,925% pós-abr/26), enquanto Solubilizadores e Adjuvantes são tributados integralmente a 9,25% / 3,65%.',
        })
      }

      // P4
      if (
        !jaRespondeuP4 &&
        (temTermosHibridos ||
          temTermosBioAdj ||
          conflitoDetectado?.perguntasObrigatorias?.includes('P4_REGISTRO_MAPA'))
      ) {
        perguntasNecessarias.push({
          id: 'P4_REGISTRO_MAPA',
          titulo: 'Vínculo Regulatório no MAPA (AGROFIT / SIPEAGRO / Dispensa)',
          pergunta:
            '4. Qual é a situação do registro deste produto junto ao Ministério da Agricultura (MAPA)?',
          opcoes: [
            'A) Possui Registro Numérico no AGROFIT (Agrotóxico/Afim — defensivo químico, biológico ou regulador)',
            'B) Possui Registro no SIPEAGRO como Corretivo/Condicionador (IN SDA/MAPA nº 35/2006 — formato UF-XXXXX-XXXXX.X)',
            'C) Possui Registro no SIPEAGRO como Fertilizante Mineral/Organomineral ou Inoculante (IN MAPA nº 39/2018)',
            'D) Dispensado de registro pelo Ato SDA/MAPA nº 104/2017 (Adjuvante ou produto técnico)',
            'E) Não possui registro no MAPA (uso industrial, construção civil ou laboratorial)',
          ],
          motivo:
            'Comprova a qualidade de insumo agropecuário exigida pelo Decreto nº 5.630/2005 e jurisprudência do CARF para gozar de benefício fiscal.',
        })
      }

      // P5
      if (
        !jaRespondeuP5 &&
        (temMoleculasN2 ||
          (ncm && (ncm.startsWith('38086') || ncm === '31051000' || ncm.startsWith('3808'))) ||
          conflitoDetectado?.perguntasObrigatorias?.includes('P5_EMBALAGEM_UNITARIA'))
      ) {
        perguntasNecessarias.push({
          id: 'P5_EMBALAGEM_UNITARIA',
          titulo: 'Peso ou Volume Líquido da Embalagem Individual',
          pergunta:
            '5. Qual é o peso ou volume líquido do recipiente individual (desconsiderando a caixa coletiva/fardo)?',
          opcoes: [
            'A) Até 300 g ou 300 mL (<= 0,30 kg/L -> NCM 3808.61.00 ou 3105.10.00)',
            'B) Acima de 300 g/mL até 7,5 kg/L (ex.: galão de 1L ou 5L em fardo 4X5L -> NCM 3808.62.90 ou 3105.10.00)',
            'C) Acima de 7,5 kg/L até 10 kg/L (ex.: galão 10L / saco 10kg -> NCM 3808.69.90 ou 3105.10.00)',
            'D) Acima de 10 kg/L ou Granel / Big Bag (ex.: bombona 20L, saca 25kg, Big Bag 1.000kg -> NCM 3808.69.90 ou posição normal do Cap. 31)',
          ],
          motivo:
            'Determina a subposição exata na Nota de Subposições 2 do Cap. 38 (SC COSIT 98.042/2022) e na Nota 5 do Cap. 31 (3105.10.00).',
        })
      }

      // P6
      if (
        !jaRespondeuP6 &&
        (temTermosHibridos ||
          (ncm && ['25', '28', '29', '31'].includes(ncm.slice(0, 2))) ||
          conflitoDetectado?.perguntasObrigatorias?.includes('P6_DESTINACAO'))
      ) {
        perguntasNecessarias.push({
          id: 'P6_DESTINACAO',
          titulo: 'Destinação da Mercadoria na Operação',
          pergunta: '6. Qual é a destinação da mercadoria e o perfil do adquirente na operação?',
          opcoes: [
            'A) Produtor Rural, Cooperativa ou Revenda para uso exclusivo agrícola (lavoura/solo)',
            'B) Estabelecimento Industrial para utilização como matéria-prima na fabricação de fertilizantes (Cap. 31) ou defensivos (38.08)',
            'C) Uso veterinário / alimentação animal, construção civil ou indústria química não agrícola',
          ],
          motivo:
            'Verifica a condição resolutória de destinação agrícola do art. 1º, I e II da Lei nº 10.925/2004 e do Decreto nº 5.630/2005.',
        })
      }

      return {
        ncm: ncm,
        conflitoDetectado: conflitoDetectado,
        perguntasNecessarias: perguntasNecessarias,
      }
    }

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

      const conv = $ai.agent(agentSlug).getOrCreateConversation({
        user_id: userId,
        id: convId || null,
        title: convTitle,
      })

      // Carregar histórico da conversa para manter estado das variáveis respondidas
      let historyMessages = []
      try {
        const hist = $ai.agent(agentSlug).listMessages({
          conversation_id: conv.id,
          user_id: userId,
          limit: 30,
        })
        if (hist && Array.isArray(hist)) {
          historyMessages = hist
        }
      } catch (_) {}

      // Executar Motor do Protocolo
      const avaliacao = runProtocolAnalysis(message, historyMessages)

      // Montar Enriquecimento Estruturado
      let enrichedMessage = message
      let structuredContext =
        '\n\n=== CONTEXTO DO PROTOCOLO OFICIAL DE CONSULTA TRIBUTÁRIA AGRO ===\n'

      if (avaliacao.conflitoDetectado) {
        structuredContext += `[DIAGNÓSTICO CRUZADO INSTANTÂNEO DETECTADO]:\n${avaliacao.conflitoDetectado.diagnostico}\n`
      }

      if (avaliacao.ncm) {
        structuredContext += `[NCM INFORMADA]: ${avaliacao.ncm}\n`
        try {
          const paramRecs = $app.findRecordsByFilter(
            'parametrizacao_fiscal',
            `ncm ~ '${avaliacao.ncm.slice(0, 4)}'`,
            '-created',
            5,
            0,
          )
          if (paramRecs && paramRecs.length > 0) {
            structuredContext += '[BASE INTERNA - PARAMETRIZAÇÃO FISCAL]:\n'
            for (let i = 0; i < paramRecs.length; i++) {
              const r = paramRecs[i]
              structuredContext += `- NCM ${r.getString('ncm')}: PIS ${r.getFloat('aliquota_pis')}%, COFINS ${r.getFloat('aliquota_cofins')}%, IBS ${r.getFloat('aliquota_ibs')}%, CBS ${r.getFloat('aliquota_cbs')}%. Classif: ${r.getString('classificacao')}. Regra: ${r.getString('tributacao')}\n`
            }
          }
        } catch (_) {}

        try {
          const regrasRecs = $app.findRecordsByFilter(
            'regras_ncm_embalagem',
            `ncm ~ '${avaliacao.ncm.slice(0, 4)}'`,
            '-created',
            3,
            0,
          )
          if (regrasRecs && regrasRecs.length > 0) {
            structuredContext += '[BASE INTERNA - REGRAS TIPI/EMBALAGEM]:\n'
            for (let i = 0; i < regrasRecs.length; i++) {
              const r = regrasRecs[i]
              structuredContext += `- NCM ${r.getString('ncm')}: Descrição "${r.getString('descricao')}". Regra Especial: "${r.getString('regra_especial')}"\n`
            }
          }
        } catch (_) {}
      }

      structuredContext += `
[FONTES OFICIAIS PLANALTO E RECEITA FEDERAL (INCLUIR COMO LINKS CLICÁVEIS NO BLOCO 2)]:
- Lei nº 10.925/2004: https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.925.htm
- LC nº 224/2025: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp224.htm
- LC nº 214/2025: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
- Classif RFB: https://portalunico.siscomex.gov.br/classif/
`

      if (avaliacao.perguntasNecessarias && avaliacao.perguntasNecessarias.length > 0) {
        structuredContext += `
[DIRETRIZ DA FASE A — QUESTIONÁRIO DINÂMICO]:
Ainda restam variáveis pendentes para fixar 100% da resposta sem suposições.
Se a mensagem atual ainda não for suficiente para emitir o veredito definitivo, apresente com clareza as seguintes perguntas do protocolo:
`
        for (let i = 0; i < avaliacao.perguntasNecessarias.length; i++) {
          const p = avaliacao.perguntasNecessarias[i]
          structuredContext += `\n${p.pergunta}\nOpções:\n${p.opcoes.join('\n')}\n(Motivo: ${p.motivo})\n`
        }
        structuredContext += `\nSe o usuário já estiver respondendo à desambiguação ou tiver fornecido os dados essenciais, emita o PARECER DEFINITIVO NO PADRÃO DE 3 BLOCOS (Bloco 1 Síntese, Bloco 2 Tabela 4 Pilares, Bloco 3 Guia ERP).\n`
      } else {
        structuredContext += `
[DIRETRIZ DA FASE B e C — EMISSÃO DO PARECER FINAL]:
Todos os dados necessários foram informados. Emita IMEDIATAMENTE o parecer completo e estruturado nos 3 BLOCOS OBRIGATÓRIOS:
- Bloco 1 — Síntese Executiva Direta (1 parágrafo: único ou híbrido, MAPA, agronômico e diagnóstico da NCM informada)
- Bloco 2 — Tabela Comparativa dos 4 Pilares (tabela Markdown com 4 linhas: Regulatório MAPA, Agronômico Embrapa, Fiscal NCM/TIPI + Embalagem, Tributário PIS/COFINS e IBS/CBS com links oficiais clicáveis)
- Bloco 3 — Guia Prático de Cadastro no ERP e Trava Fiscal de Segurança (Macro-Grupo, Sub-Grupo, NCM Exata, Unidade, Código MAPA/SIPEAGRO, CST Entrada/Saída e texto exato infAdFisco para a NF-e).
`
      }

      enrichedMessage = `${message}\n${structuredContext}`

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

// 2. Chat síncrono
routerAdd(
  'POST',
  '/backend/v1/tributacao/chat',
  (e) => {
    function normTxtSync(txt) {
      if (!txt) return ''
      return String(txt)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    function extractNcmSync(str) {
      if (!str) return null
      const m = str.match(/\b\d{4}[.\s]?\d{2}[.\s]?\d{2}\b/) || str.match(/\b\d{8}\b/)
      if (m) {
        return m[0].replace(/\D/g, '')
      }
      return null
    }

    function runProtocolAnalysisSync(currentMessage, histMessages) {
      const fullText = [...(histMessages || []).map((m) => m.content || ''), currentMessage].join(
        '\n',
      )

      const norm = normTxtSync(fullText)
      const ncm = extractNcmSync(fullText)

      const termosHibridos = [
        'GESSO',
        'ENXOFRE',
        'BORO',
        'ULEXITA',
        'MAGNESIO',
        'CALCIO',
        'FOSFATO',
        'SULFATO',
        'NITRATO',
        'ACIDO',
      ]
      const temTermosHibridos = termosHibridos.some((t) => norm.includes(t))

      const termosBioAdj = [
        'INOCULANTE',
        'BACILLUS',
        'AZOSPIRILLUM',
        'BRADYRHIZOBIUM',
        'TRICHODERMA',
        'PSEUDOMONAS',
        'ADJUVANTE',
        'OLEO',
        'ESPALHANTE',
        'SILWET',
      ]
      const temTermosBioAdj = termosBioAdj.some((t) => norm.includes(t))

      const moleculasN2 = [
        'BIFENTRINA',
        'LAMBDA',
        'CIALOTRINA',
        'CLORFENAPIR',
        'MALATIONA',
        'FENITROTIONA',
        'CIFLUTRINA',
      ]
      const temMoleculasN2 = moleculasN2.some((m) => norm.includes(m))

      let conflitoDetectado = null

      if (norm.includes('GESSO') && ncm === '31059090') {
        conflitoDetectado = {
          tipo: 'CONFLITO_GESSO_3105',
          diagnostico:
            'CONFLITO DETECTADO: A NCM 3105.90.90 exige fertilizante mineral misto (com N, P ou K). O gesso agrícola puro (sulfato de cálcio di-hidratado CaSO4.2H2O) não possui N, P ou K e classifica-se em 2520.10.19 (mineral bruto moído) ou 3824.99.89 (fosfogesso industrial).',
          perguntasObrigatorias: ['P2_GRAU_ELABORACAO', 'P4_REGISTRO_MAPA'],
        }
      }

      const perguntasNecessarias = []

      if (!ncm && !norm.includes('NAO SEI A NCM') && !norm.includes('DESCOBRIR AUTOMATICAMENTE')) {
        perguntasNecessarias.push({
          id: 'P1_NCM',
          titulo: 'Código NCM do Produto (8 dígitos)',
          pergunta:
            '1. Qual é a Descrição Comercial Completa do produto (com concentração e embalagem, se houver) e qual é o Código NCM (8 dígitos) constante na Nota Fiscal ou pretendido?',
          opcoes: [
            'Informar código NCM de 8 dígitos (XXXX.XX.XX)',
            'Não sei a NCM — descobrir automaticamente pela descrição comercial',
          ],
        })
      }

      return {
        ncm: ncm,
        conflitoDetectado: conflitoDetectado,
        perguntasNecessarias: perguntasNecessarias,
      }
    }

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

      const conv = $ai.agent(agentSlug).getOrCreateConversation({
        user_id: userId,
        id: convId || null,
        title: convTitle,
      })

      let historyMessages = []
      try {
        const hist = $ai.agent(agentSlug).listMessages({
          conversation_id: conv.id,
          user_id: userId,
          limit: 30,
        })
        if (hist && Array.isArray(hist)) {
          historyMessages = hist
        }
      } catch (_) {}

      const avaliacao = runProtocolAnalysisSync(message, historyMessages)

      let enrichedMessage = message
      let structuredContext =
        '\n\n=== CONTEXTO DO PROTOCOLO OFICIAL DE CONSULTA TRIBUTÁRIA AGRO ===\n'

      if (avaliacao.conflitoDetectado) {
        structuredContext += `[DIAGNÓSTICO CRUZADO INSTANTÂNEO DETECTADO]:\n${avaliacao.conflitoDetectado.diagnostico}\n`
      }

      if (avaliacao.ncm) {
        structuredContext += `[NCM INFORMADA]: ${avaliacao.ncm}\n`
      }

      if (avaliacao.perguntasNecessarias && avaliacao.perguntasNecessarias.length > 0) {
        structuredContext += `\n[DIRETRIZ DA FASE A — QUESTIONÁRIO DINÂMICO]:\n`
        for (let i = 0; i < avaliacao.perguntasNecessarias.length; i++) {
          const p = avaliacao.perguntasNecessarias[i]
          structuredContext += `\n${p.pergunta}\nOpções:\n${p.opcoes.join('\n')}\n`
        }
      } else {
        structuredContext += `\n[DIRETRIZ]: Emita o parecer completo no padrão de 3 blocos (Síntese, Tabela 4 Pilares, Guia ERP).\n`
      }

      enrichedMessage = `${message}\n${structuredContext}`

      const result = $ai.agent(agentSlug).chat({
        user_id: userId,
        conversation_id: conv.id,
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
