/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Atualizar e enriquecer registros em parametrizacao_fiscal com as NCMs críticas do protocolo
    const paramFiscalCol = app.findCollectionByNameOrId('parametrizacao_fiscal')

    const seedFiscalItems = [
      {
        ncm: '25201011',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Gipsita em pedras ou em pedaços / gesso mineral bruto - Corretivo de solo',
        tributacao:
          'Lei 10.925/2004, art. 1º, IV (alíquota zero até 31/03/2026). LC 224/2025 residual 10% (0,925% Real / 0,365% Presumido / 1,175% Importação) desde 01/04/2026. LC 214/2025 Anexo IX redução 60% com diferimento.',
      },
      {
        ncm: '25201019',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao:
          'Gesso agrícola mineral moído / outras gipsitas moídas (CaSO4.2H2O) - Condicionador de solo',
        tributacao:
          'Corretivo de sodicidade / Condicionador de solo (IN MAPA 35/2006). Lei 10.925/2004, art. 1º, IV. LC 224/2025 residual de 10% (0,925% no Lucro Real, 0,365% no Presumido). LC 214/2025 Anexo IX redução 60% e diferimento.',
      },
      {
        ncm: '38249989',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao:
          'Fosfogesso industrial subproduto de ácido fosfórico - Condicionador de solo',
        tributacao:
          'IN SDA/MAPA 35/2006. SC COSIT 98.042/2022. Lei 10.925/2004 art. 1º, IV se destinado a uso agrícola com registro SIPEAGRO. LC 224/2025 residual 10%. LC 214/2025 redução 60%.',
      },
      {
        ncm: '25030090',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Enxofre elementar agropecuário / pastilhado com bentonita',
        tributacao:
          'Capítulo 25 TIPI (fora do Cap. 31). Benefício condicional do art. 1º, IV da Lei 10.925/2004 exige registro SIPEAGRO (IN 35/2006) e destinação exclusiva como corretivo/condicionador agrícola (CARF Proc. 10875.910251/2011-20). Se for matéria-prima sem destinação agrícola, tributa 9,25%/3,65%.',
      },
      {
        ncm: '30024999',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Culturas bacterianas / Inoculantes agrícolas',
        tributacao:
          'Se Inoculante Fixador de Nitrogênio (Bradyrhizobium/Azospirillum): art. 1º, VI da Lei 10.925/2004 (alíquota zero até 31/03/2026, 0,925% pós-abr/2026). Se Inoculante Solubilizador de Fósforo (Bacillus megaterium/subtilis): TRIBUTADO INTEGRAL a 9,25% no Lucro Real / 3,65% no Presumido (SC COSIT 261/2023). Se biodefensivo: migra para 3808.92.99.',
      },
      {
        ncm: '34029029',
        aliquota_pis: 1.65,
        aliquota_cofins: 7.6,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Adjuvantes de pulverização / Espalhantes adesivos sem registro defensivo',
        tributacao:
          'TRIBUTADO INTEGRALMENTE a 9,25% (PIS 1,65% / COFINS 7,60%) no Lucro Real e 3,65% no Lucro Presumido (CST 01). SC COSIT 4/2024: produtos dispensados de registro pelo Ato SDA/MAPA 104/2017 não se equiparam a defensivos (38.08) nem a fertilizantes (31.05), sendo vedada a alíquota zero.',
      },
      {
        ncm: '38086100',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao:
          'Inseticidas com moléculas específicas em recipientes unitários <= 300 g ou 300 mL',
        tributacao:
          'Nota de Subposições 2 do Cap. 38 (Bifentrina, Lambda-Cialotrina, Clorfenapir, Malationa, etc.). Conteúdo líquido unitário <= 300 g/mL. Art. 1º, II Lei 10.925/2004 c/c LC 224/2025 (residual 0,925% Real / 0,365% Presumido). LC 214/2025 Anexo IX.',
      },
      {
        ncm: '38086290',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao:
          'Inseticidas com moléculas específicas em recipientes unitários de 300 g/mL até 7,5 kg/L',
        tributacao:
          'Nota de Subposições 2 do Cap. 38. Embalagens de 300 g/mL a 7,5 kg/L (ex.: frascos e galões de 1L ou 5L). Art. 1º, II Lei 10.925/2004 c/c LC 224/2025. LC 214/2025 Anexo IX.',
      },
      {
        ncm: '38086990',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao:
          'Inseticidas com moléculas específicas em recipientes unitários > 7,5 kg/L ou granel',
        tributacao:
          'Nota de Subposições 2 do Cap. 38. Embalagens > 7,5 kg/L (ex.: bombonas de 20L, tambores, Big Bag). Art. 1º, II Lei 10.925/2004 c/c LC 224/2025. LC 214/2025 Anexo IX.',
      },
      {
        ncm: '31051000',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Adubos ou fertilizantes em tabletes ou embalagens com peso bruto <= 10 kg',
        tributacao:
          'Nota 5 do Cap. 31 TIPI: restrita a recipientes individuais com peso bruto total <= 10 kg. Se > 10 kg migra para 3105.20, 3105.90.90 etc. Benefício do art. 1º, I da Lei 10.925/2004 c/c LC 224/2025.',
      },
      {
        ncm: '31059090',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Outros adubos ou fertilizantes minerais compostos/mistos (com N, P ou K)',
        tributacao:
          'Cap. 31 TIPI. Exige conter como ingrediente essencial ao menos um dos elementos fertilizantes Nitrogênio (N), Fósforo (P) ou Potássio (K). Não aceita gesso agrícola puro (que é 2520.10.19 ou 3824.99.89). Art. 1º, I Lei 10.925/2004 c/c Dec. 5.630/2005 e LC 224/2025.',
      },
    ]

    for (const item of seedFiscalItems) {
      try {
        const exist = app.findFirstRecordByFilter('parametrizacao_fiscal', `ncm = '${item.ncm}'`)
        if (exist) {
          exist.set('aliquota_pis', item.aliquota_pis)
          exist.set('aliquota_cofins', item.aliquota_cofins)
          exist.set('regime', item.regime)
          exist.set('aliquota_ibs', item.aliquota_ibs)
          exist.set('aliquota_cbs', item.aliquota_cbs)
          exist.set('classificacao', item.classificacao)
          exist.set('tributacao', item.tributacao)
          app.save(exist)
        }
      } catch (_) {
        const rec = new Record(paramFiscalCol)
        rec.set('ncm', item.ncm)
        rec.set('aliquota_pis', item.aliquota_pis)
        rec.set('aliquota_cofins', item.aliquota_cofins)
        rec.set('regime', item.regime)
        rec.set('aliquota_ibs', item.aliquota_ibs)
        rec.set('aliquota_cbs', item.aliquota_cbs)
        rec.set('classificacao', item.classificacao)
        rec.set('tributacao', item.tributacao)
        app.save(rec)
      }
    }

    // 2. Atualizar o agente consultor-tributario-agro com o System Prompt exato do Protocolo Oficial
    $ai.agents.define(app, {
      slug: 'consultor-tributario-agro',
      name: 'Consultor Tributário Agro',
      description:
        'Motor Especialista de Classificação Fiscal (NCM/TIPI), Regulatória (MAPA) e Tributária (PIS/COFINS e IBS/CBS) do Agronegócio Brasileiro.',
      systemPrompt: `Você é o Motor Especialista de Classificação Fiscal (NCM/TIPI), Regulatória (MAPA) e Tributária (PIS/COFINS e IBS/CBS) do Agronegócio Brasileiro.

REGRA 1 — QUESTIONÁRIO PRÉVIO DE DESAMBIGUAÇÃO:
Sempre que o usuário pesquisar um produto informando apenas o nome genérico (sem a NCM ou sem especificar se é puro/misturado, qual a embalagem unitária, qual o registro MAPA e qual a destinação), apresente primeiro o Questionário Contextual objetivamente:
1) Pergunte qual é a Descrição Comercial Completa e qual a NCM (8 dígitos) informada na NF-e (ou se deseja descobrir a NCM).
2) Se o produto tiver enquadramento híbrido (ex.: Gesso Agrícola, Enxofre, Boro, Sais do Cap. 28, Inoculantes, Biológicos, Adjuvantes ou Inseticidas da Nota de Subposições 2 do Cap. 38), pergunte os pontos relevantes (Grau de Elaboração Puro vs. Misturado, Função Fixador de N vs. Solubilizador de P, Tipo de Registro AGROFIT/SIPEAGRO/Ato 104, Peso/Volume da Embalagem Unitária e Destinação Agrícola).

REGRA 2 — PADRÃO OBRIGATÓRIO DE RESPOSTA NOS 4 PILARES + GUIA ERP:
Ao emitir a resposta definitiva, estruture SEMPRE em 3 blocos:

### Bloco 1 — Síntese Executiva Direta
Responda em 1 parágrafo direto à dúvida central do usuário: enquadramento único ou híbrido, posição oficial perante o MAPA, função agronômica real e se a NCM informada pelo usuário está correta ou precisa ser substituída.

### Bloco 2 — Tabela Comparativa dos 4 Pilares
Construa uma tabela Markdown contendo obrigatoriamente as 4 linhas com colunas:
| Critério de Classificação | Enquadramento Oficial do Produto | Regra Técnica, Diagnóstico da NCM Informada e Base Legal |
1. Critério Regulatório (MAPA / SIPEAGRO / AGROFIT): IN 35/2006 para Corretivos e Condicionadores; IN 39/2018 para Fertilizantes Minerais; AGROFIT (Lei 14.785/2023) para Defensivos; Ato SDA 104/2017 para Adjuvantes; garantias mínimas e formato do registro.
2. Critério Agronômico (Embrapa / Fitotecnia): mecanismo físico-químico/biológico real no solo ou na planta e distinção frente a classes semelhantes (ex.: corretivo de acidez que eleva pH vs. condicionador de solo sal neutro).
3. Critério Fiscal Aduaneiro (NCM / TIPI e Embalagem): capítulo, subitem específico da molécula, veredito sobre a NCM informada e validação da faixa de peso/volume da embalagem unitária (3808.61.00 <=300g/mL, 3808.62.90 300g a 7,5kg/L, 3808.69.90 >7,5kg/L; 3105.10.00 <=10kg bruto pela Nota 5 Cap. 31; fosfogesso 3824.99.89 vs gipsita 2520.10.19 vs NPK 3105.90.90).
4. Critério Tributário (PIS/COFINS e IBS/CBS): perfil (Beneficiado Direto, Condicional ou Tributado Integral).
- Alíquota zero histórica até 31/03/2026 (Lei 10.925/2004, art. 1º, incisos I a X; Dec. 5.630/2005).
- Reoneração linear residual de 10% da LC 224/2025 a partir de 01/04/2026: 0,925% Lucro Real (Não Cumulativo - 0,165% PIS + 0,760% COFINS), 0,365% Lucro Presumido (Cumulativo - 0,065% PIS + 0,300% COFINS) e 1,175% na Importação (0,210% PIS + 0,965% COFINS).
- Insumos tributados integralmente: SC COSIT 4/2024 (adjuvantes isentos Ato 104/2017 tributam 9,25% / 3,65%) e SC COSIT 261/2023 (solubilizadores de fósforo e promotores de crescimento tributam 9,25% / 3,65%).
- Reforma Tributária LC 214/2025: redução de 60% nas alíquotas de CBS e IBS (Art. 138 e Anexo IX) + diferimento concomitante em 2027 entre contribuintes regulares e na importação (Art. 138, §§ 2º, 3º e 9º).
- Sempre inclua links oficiais clicáveis para Planalto e Receita Federal:
  * Lei 10.925/2004: [Lei 10.925/2004 (Planalto)](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.925.htm)
  * LC 224/2025: [LC 224/2025 (Planalto)](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp224.htm)
  * LC 214/2025: [LC 214/2025 (Planalto)](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm)
  * Sistema Classif: [Classif RFB / NCM](https://portalunico.siscomex.gov.br/classif/)

### Bloco 3 — Guia Prático de Cadastro no ERP e Trava Fiscal de Segurança
Forneça o bloco operacional pronto para parametrização do sistema:
- **Macro-Grupo**: [ex.: Corretivos e Condicionadores de Solo / Fertilizantes / Defensivos / Biológicos / Insumos Operacionais]
- **Sub-Grupo**: [ex.: Condicionador de Solo Mineral / Inoculante Fixador de Nitrogênio / Adjuvante de Pulverização]
- **NCM Exata (8 dígitos)**: [XXXX.XX.XX]
- **Unidade de Medida Comercial**: [ex.: KG, TON, L]
- **Código MAPA / SIPEAGRO**: [ex.: Registro sob IN SDA 35/2006 formato UF-XXXXX-XXXXX.X ou AGROFIT ou Dispensado Ato 104/2017]
- **CST de Entrada / Saída**:
  * Entrada: CST 70 ou 73 (aquisição com desoneração/alíquota zero)
  * Saída: CST 06 (Operação tributável a alíquota zero com reoneração linear residual) ou CST 01 (Operação tributável integral)
- **Trava de Segurança Fiscal e Observação Obrigatória na NF-e**:
  Texto literal para o campo infAdFisco:
  "Operação sujeita ao disposto na Lei Complementar nº 224/2025. Produto registrado no MAPA/SIPEAGRO sob nº [UF-XXXXX-XXXXX.X] conforme IN SDA/MAPA nº 35/2006. Emprego exclusivo na agricultura." (adaptar com exatidão conforme o produto)`,
      tier: 'fast',
      tools: [
        { collection: 'parametrizacao_fiscal', perms: { read: true, list: true } },
        { collection: 'regras_ncm_embalagem', perms: { read: true, list: true } },
        { collection: 'dicionario_principios_ativos', perms: { read: true, list: true } },
        { collection: 'base_mestre', perms: { read: true, list: true } },
      ],
      memory: [
        {
          type: 'text',
          payload: {
            text: `MATRIZ DE DIAGNÓSTICO CRUZADO DESCRIÇÃO x NCM DO PROTOCOLO AGRO:
1. Gesso Agrícola + NCM 3105.90.90: CONFLITO DETECTADO. A NCM 3105.90.90 exige fertilizante mineral misto com macronutrientes (N, P ou K). Gesso agrícola puro (sulfato de cálcio di-hidratado CaSO4.2H2O) não tem N, P ou K e é classificado em 2520.10.19 (gipsita mineral moída) ou 3824.99.89 (fosfogesso industrial). Disparar Pergunta 2 (grau de elaboração) e Pergunta 4 (registro SIPEAGRO IN 35/2006).
2. Enxofre Agrícola 90% + 2503.00.90: CONVERGÊNCIA C/ ALERTA CONDICIONAL. NCM correta para enxofre elementar com bentonita (pastilhado), mas fora do Capítulo 31. Benefício do art. 1º, IV da Lei 10.925/2004 exige registro no SIPEAGRO e destinação exclusiva como corretivo/condicionador agrícola (CARF Proc. 10875.910251/2011-20). Disparar Pergunta 4 e Pergunta 6.
3. Inoculante Bacillus + 3002.49.99 ou 3507.90.49: RISCO TRIBUTÁRIO ALTO. Se estiver em 3507.90.49 (enzimas), NCM incorreta para cultura bacteriana. Na 3002.49.99 a tributação depende da função: Fixador de Nitrogênio tem alíquota zero/reoneração 0,925% (art. 1º, VI Lei 10.925/2004); Solubilizador de Fósforo ou Promotor de Crescimento (Bacillus megaterium/subtilis) é TRIBUTADO INTEGRALMENTE a 9,25% / 3,65% (SC COSIT 261/2023); Biodefensivo registrado no AGROFIT vai para 3808.92.99. Disparar Pergunta 3.
4. Óleo Mineral / Adjuvante + 3105.90.90 ou 3808.99.99: CONFLITO CRÍTICO (SC COSIT 4/2024). Adjuvantes sem registro de agrotóxico no MAPA não pertencem ao Cap. 31 nem usufruem do art. 1º, II da Lei 10.925/2004. Dispensados pelo Ato SDA 104/2017 são tributados integralmente a 9,25%/3,65% em 3402.90.29 ou 2710.19.31. Disparar Pergunta 3 e 4.
5. Inseticida Bifentrina / Lambda-Cialotrina + 3808.91.99 ou 3808.69.90: DEPENDÊNCIA DE EMBALAGEM (Nota de Subposições 2 do Cap. 38). <=300g/mL vai para 3808.61.00; de 300g/mL a 7,5kg/L vai para 3808.62.90; acima de 7,5kg/L vai para 3808.69.90. Disparar Pergunta 5.
6. Fertilizante Foliar / Fosfito + 3105.10.00: DEPENDÊNCIA DE PESO BRUTO (Nota 5 do Cap. 31). Só é válida para peso bruto <= 10 kg. Acima de 10 kg migra para 3105.90.90. Disparar Pergunta 5.`,
          },
        },
        {
          type: 'text',
          payload: {
            text: `REGRAS DOS 4 PILARES DE ANÁLISE TRIBUTÁRIA AGRO:
Pilar 1: Regulatório (MAPA/SIPEAGRO/AGROFIT):
- IN SDA/MAPA nº 35/2006: Corretivos e Condicionadores de Solo (gesso, calcário, enxofre). Exige garantias mínimas (gesso: mín 16% Ca e 13% S).
- IN MAPA nº 39/2018: Fertilizantes Minerais.
- Lei nº 14.785/2023 e AGROFIT: Defensivos e Biodefensivos registrados.
- Ato SDA nº 104/2017: Adjuvantes de pulverização dispensados de registro (atenção: não são defensivos, sem alíquota zero conforme SC COSIT 4/2024).
Pilar 2: Agronômico (Embrapa):
- Distinção agronômica essencial: Corretivo de acidez (calcário) neutraliza H+ e eleva o pH; Condicionador de subsuperfície (gesso CaSO4.2H2O) é sal neutro, não eleva o pH, reduz Al3+ tóxico em profundidade e fornece Ca e S solúveis.
Pilar 3: Fiscal NCM/TIPI e Embalagem:
- Cap. 25: minerais brutos/moídos sem reação química.
- Cap. 31: fertilizantes com N, P ou K.
- Nota de Subposições 2 Cap. 38 e Nota 5 Cap. 31 vinculam a NCM exata ao volume/peso unitário.
Pilar 4: Tributário PIS/COFINS e IBS/CBS:
- Lei 10.925/2004 art. 1º, incisos I a X: alíquota zero histórica até 31/03/2026.
- LC 224/2025: corte linear de 10% nos incentivos fiscais desde 01/04/2026 gerando alíquotas residuais (0,925% Real, 0,365% Presumido, 1,175% Importação) mantendo CST 06 na NF-e e infAdFisco obrigatório.
- LC 214/2025: Anexo IX e Art. 138 garantem redução de 60% no IBS/CBS com diferimento concomitante em 2027.`,
          },
        },
        {
          type: 'faq',
          payload: {
            qa: [
              {
                question: 'Gesso agrícola é fertilizante mineral ou corretivo de solo?',
                answer:
                  'Regulatoriamente perante o MAPA (IN SDA 35/2006), o gesso agrícola puro (CaSO4.2H2O) é classificado como Condicionador de Solo / Corretivo de Sodicidade (mínimo 16% Ca e 13% S), e NÃO como fertilizante mineral. Agronomicamente (Embrapa), é um sal neutro que atua na redução do Al3+ tóxico em subsuperfície. Fiscalmente classifica-se na NCM 2520.10.19 (gipsita mineral moída) ou 3824.99.89 (fosfogesso). Não pode ser classificado na NCM 3105.90.90 (que exige N, P ou K). Usufrui do benefício do art. 1º, IV da Lei 10.925/2004 e LC 224/2025.',
              },
              {
                question:
                  'Adjuvante de pulverização dispensado pelo Ato 104/2017 tem alíquota zero de PIS/COFINS?',
                answer:
                  'Não! Conforme pacificado pela Solução de Consulta COSIT nº 4/2024 da Receita Federal, adjuvantes dispensados de registro pelo Ato SDA nº 104/2017 não se equiparam a defensivos agrícolas (posição 38.08) nem a fertilizantes (Capítulo 31). Classificam-se normalmente na NCM 3402.90.29 ou 2710.19.31 e são TRIBUTADOS INTEGRALMENTE a 9,25% no Lucro Real e 3,65% no Lucro Presumido (CST 01).',
              },
              {
                question:
                  'Inoculante solubilizador de fósforo (Bacillus megaterium) tem alíquota zero?',
                answer:
                  'Não! A Solução de Consulta COSIT nº 261/2023 pacificou que o benefício do art. 1º, VI da Lei nº 10.925/2004 é restrito taxativamente a "inoculantes fixadores de nitrogênio" (como Bradyrhizobium e Azospirillum). Inoculantes solubilizadores de fósforo ou promotores de crescimento (Bacillus megaterium/subtilis) na NCM 3002.49.99 são TRIBUTADOS INTEGRALMENTE a 9,25% no Lucro Real e 3,65% no Lucro Presumido.',
              },
            ],
          },
        },
      ],
    })
  },
  (app) => {
    // Reversão básica
    try {
      const paramCol = app.findCollectionByNameOrId('parametrizacao_fiscal')
      const recs = app.findRecordsByFilter(
        'parametrizacao_fiscal',
        "ncm = '25201011' || ncm = '25201019' || ncm = '38249989' || ncm = '25030090' || ncm = '30024999' || ncm = '34029029' || ncm = '38086100' || ncm = '38086290' || ncm = '38086990' || ncm = '31051000'",
      )
      for (const r of recs) {
        app.delete(r)
      }
    } catch (_) {}
  },
)
