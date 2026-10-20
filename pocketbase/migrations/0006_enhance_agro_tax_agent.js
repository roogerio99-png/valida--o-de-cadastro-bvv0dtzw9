/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Seed básico em parametrizacao_fiscal para produtos estratégicos (Gesso Agrícola e insumos principais)
    const paramFiscalCol = app.findCollectionByNameOrId('parametrizacao_fiscal')

    const seedFiscal = [
      {
        ncm: '25202090',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Gesso agrícola mineral / Outros gessos - Corretivo de solo',
        tributacao:
          'Lei 10.925/2004, art. 1º, IV (alíquota zero PIS/COFINS histórica até 31/03/2026). Reoneração linear de 10% pela LC 224/2025 desde 01/04/2026 (carga 0,925% no não cumulativo, 0,365% no cumulativo e 1,175% na importação). Redução de 60% no IBS/CBS e diferimento na LC 214/2025 (Art. 138, § 2º e Anexo IX, item 3).',
      },
      {
        ncm: '25201020',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Gipsita e Anidrita para uso como corretivo de solo',
        tributacao:
          'Capítulo 25 TIPI. Benefício de corretivo de solo (art. 1º, IV da Lei 10.925/2004 c/c LC 224/2025 e LC 214/2025 Anexo IX).',
      },
      {
        ncm: '25210000',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Calcário calcítico e dolomítico - Corretivo de solo',
        tributacao:
          'Art. 1º, IV da Lei 10.925/2004 c/c LC 224/2025. Redução de 60% de IBS/CBS pelo Anexo IX da LC 214/2025 com diferimento.',
      },
      {
        ncm: '38089324',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Defensivo agrícola à base de Glifosato',
        tributacao:
          'Art. 1º, II da Lei 10.925/2004 c/c LC 224/2025 (carga residual 0,925% no Lucro Real e 1,175% na importação). LC 214/2025 art. 138 e Anexo IX.',
      },
      {
        ncm: '31052000',
        aliquota_pis: 0.165,
        aliquota_cofins: 0.76,
        regime: 'nao_cumulativo',
        aliquota_ibs: 0.1,
        aliquota_cbs: 0.9,
        classificacao: 'Adubos e fertilizantes minerais contendo NPK',
        tributacao:
          'Cap. 31 TIPI. Art. 1º, I da Lei 10.925/2004 c/c Dec. 5.630/2005 e LC 224/2025. Isento do adicional de 1% de COFINS-Importação (§ 21 art. 8º Lei 10.865). LC 214/2025 art. 138 e Anexo IX.',
      },
    ]

    for (const item of seedFiscal) {
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

    // 2. Atualizar a definição do agente nativo "Consultor Tributário Agro"
    $ai.agents.define(app, {
      slug: 'consultor-tributario-agro',
      name: 'Consultor Tributário Agro',
      description:
        'Especialista em tributação de PIS/Pasep e COFINS no agronegócio, insumos agrícolas, reoneração de 2026 e transição IBS/CBS.',
      systemPrompt: `Você é o Consultor Tributário Agro, especialista de alto nível em legislação tributária brasileira aplicada ao agronegócio, com foco aprofundado em PIS/Pasep e COFINS (regimes cumulativo, não cumulativo e importação), alíquota zero e desoneração de insumos agrícolas, a reoneração residual linear de 2026 (LC nº 224/2025), contencioso administrativo (CARF/CSRF) e judicial (STJ/STF), e a transição para a Reforma Tributária do Consumo (IBS e CBS pela LC nº 214/2025).

REGRA DE OURO - FLUXO OBRIGATÓRIO DE PERGUNTA DE RETORNO DO NCM:
1. Quando o usuário fizer uma pergunta sobre se um PRODUTO tem benefício fiscal (alíquota zero, isenção, redução de base, diferimento, tributação monofásica etc.) e NÃO TIVER INFORMADO O NCM EXATO (8 dígitos ou código NCM específico):
   - VOCÊ NÃO DEVE RESPONDER DE FORMA DEFINITIVA OU NO ESCURO!
   - VOCÊ DEVE PERGUNTAR DE VOLTA AO USUÁRIO: "Para que eu possa verificar com precisão técnica perante a legislação e as fontes oficiais se há benefício fiscal ou se o produto é tributado, por favor informe: Qual é a NCM do produto? E trata-se de insumo nacional ou importado?"
   - Dê exemplos amigáveis das NCMs usuais para aquele produto (por exemplo, no caso de gesso agrícola: NCM 2520.20.90 para gesso mineral ou 2520.10.20 para gipsita/anidrita; para calcário: 2521.00.00; para fertilizantes: Capítulo 31; para defensivos: posição 3808).
   - Explique brevemente que, no direito tributário aduaneiro e interno brasileiro, o benefício fiscal (como o rol do art. 1º da Lei nº 10.925/2004 e do Anexo IX da LC nº 214/2025) é estritamente vinculado à NCM/SH (TIPI) combinada com a destinação e conformidade do produto.
   - NÃO conclua alíquotas definitivas antes de ter o NCM.

2. COM O NCM INFORMADO (ou se o usuário já forneceu o NCM na mensagem):
   - Realize a consulta completa:
     a) Consulte a base interna (tabelas parametrizacao_fiscal, regras_ncm_embalagem, dicionario_principios_ativos, base_mestre) e as informações fiscais fornecidas no contexto.
     b) Analise perante a legislação federal e portais oficiais da Receita Federal e do Planalto:
        * Lei nº 10.925/2004 (art. 1º, incisos I a X): verificar se a NCM se enquadra no rol taxativo de alíquota zero histórica. Ex.: Corretivo de solo de origem mineral do Capítulo 25 (inciso IV - abrange calcário 2521 e gesso mineral 2520).
        * Decreto nº 5.630/2005 e Soluções de Consulta COSIT/RFB aplicáveis.
        * Lei Complementar nº 224/2025 (vigência a partir de 01/04/2026): reoneração residual linear de 10% sobre o benefício de alíquota zero.
        * Reforma Tributária (Lei Complementar nº 214/2025): redução de 60% das alíquotas do IBS e da CBS (art. 138 e Anexo IX) e regras de diferimento concomitante (§§ 2º e 3º).
     c) ESTRUTURA OBRIGATÓRIA DA RESPOSTA FINAL:
        1. **NCM Analisado e Classificação**: Código NCM de 8 dígitos, descrição da TIPI/NCM e enquadramento como insumo agropecuário (ex.: corretivo de solo, fertilizante, defensivo, semente).
        2. **Classificação Tributária**: Conclusão clara se é "Alíquota Zero / Desonerado", "Reonerado Residualmente (LC 224/2025)", "Tributado Integralmente" ou "Diferido / Redução 60%".
        3. **Quadro de Alíquotas por Regime**:
           - Lucro Presumido (Regime Cumulativo - Lei 9.718/1998): alíquotas de PIS e COFINS aplicáveis.
           - Lucro Real (Regime Não Cumulativo - Leis 10.637/2002 e 10.833/2003): alíquotas de PIS e COFINS e crédito.
           - Importação (Lei 10.865/2004 c/c LC 224/2025): alíquotas de PIS-Importação e COFINS-Importação e eventual adicional de 1%.
           - Reforma Tributária (IBS e CBS pela LC 214/2025): percentual de redução (60% no Anexo IX) e aplicação de diferimento.
        4. **Fundamento Legal e Dispositivos Citados**: Artigos, incisos e parágrafos específicos das Leis, Decretos, Instruções Normativas e Acórdãos do CARF/STJ.
        5. **Fontes Oficiais**: SEMPRE forneça a URL e o nome do portal oficial de referência consultado (ex.: Portal da Legislação da Presidência da República / Planalto: https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.925.htm, Portal Planalto LC 224/2025: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp224.htm, Portal Planalto LC 214/2025: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm, Sistema Classif da Receita Federal: https://portalunico.siscomex.gov.br/classif/).
        6. **Impactos Operacionais / Obrigações Acessórias**: CST sugerido na NF-e (ex.: CST 06), mensagem de infAdFisco e registros na EFD-Contribuições (M220/M620).
        7. **Ressalva Técnica**: Lembrete cordial de que a orientação é de caráter técnico e normativo, recomendando confirmação contábil/jurídica para a operação específica da empresa.

DIRETRIZES DE ESTILO:
- Idioma: Português do Brasil (pt-BR).
- Tom: Altamente especializado, seguro, analítico e fundamentado.
- Nunca faça afirmações fiscais sem apontar a base legal e a fonte oficial.`,
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
            text: `Compêndio de Tributação de Insumos Agropecuários por NCM e Legislação Oficial:
1. Gesso Agrícola (NCM 2520.20.90 / 2520.10.20):
- Classificação: Corretivo de solo de origem mineral (sulfato de cálcio) classificado no Capítulo 25 da TIPI.
- PIS/COFINS (Lei 10.925/2004, art. 1º, IV): Alíquota zero plena até 31/03/2026 nas vendas no mercado interno e na importação quando destinado ao emprego como corretivo de solo.
- Reoneração linear de 10% (LC 224/2025 e IN RFB 2.305/2025 - a partir de 01/04/2026):
  * Não Cumulativo (Lucro Real): PIS 0,165% + COFINS 0,760% = Carga 0,925% (CST 06 na NF-e com mensagem obrigatória em infAdFisco: 'Operação sujeita ao disposto na Lei Complementar nº 224/2025'). Escrituração em M220/M620 código 11.
  * Cumulativo (Lucro Presumido): PIS 0,065% + COFINS 0,300% = Carga 0,365%.
  * Importação: PIS-Importação 0,210% + COFINS-Importação 0,965% = Carga 1,175%.
- Reforma Tributária (LC 214/2025, Art. 138 e Anexo IX, item 3):
  * Corretivos de solo do Capítulo 25 têm redução de 60% das alíquotas do IBS e da CBS.
  * Diferimento nas operações entre contribuintes do regime regular e na importação (art. 138, §§ 2º e 3º).
- Fontes Oficiais:
  * Lei 10.925/2004: https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.925.htm
  * LC 224/2025: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp224.htm
  * LC 214/2025: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
  * Tabela NCM Receita Federal: https://portalunico.siscomex.gov.br/classif/`,
          },
        },
        {
          type: 'text',
          payload: {
            text: `Regras de NCM e Benefícios Fiscais Federais (PIS/COFINS e IBS/CBS):
- Calcário Calcítico/Dolomítico (NCM 2521.00.00): Corretivo de solo, Art. 1º, IV Lei 10.925/2004, LC 224/2025 e LC 214/2025 Anexo IX.
- Fertilizantes e Adubos (Capítulo 31 TIPI - ex: 3105.20.00, 3102.10.00): Art. 1º, I Lei 10.925/2004 c/c Dec. 5.630/2005. Isentos do adicional de 1% de COFINS-Importação (Lei 10.865 art. 8º § 21). LC 224/2025 e LC 214/2025 Anexo IX.
- Defensivos Agrícolas (Posição 38.08 - ex: 3808.93.24 Glifosato, 3808.93.22 2,4-D): Art. 1º, II Lei 10.925/2004 c/c LC 224/2025. LC 214/2025 Anexo IX.
- Sementes e Mudas Certificadas (NCMs Caps. 06, 07, 10, 12): Art. 1º, III Lei 10.925/2004. Exige conformidade à Lei 10.711/2003 (RENASEM e RNC).
- Inoculantes Agrícolas (NCM 3002.49 / 3002.90): Art. 1º, VI Lei 10.925/2004 e LC 214/2025 Anexo IX.`,
          },
        },
        {
          type: 'text',
          payload: {
            text: `Jurisprudência Relevante no Agronegócio:
- Súmula CARF 188 / COSIT 90/2025: Direito a crédito de 9,25% sobre frete e seguro na aquisição de insumos com alíquota zero quando contratado de transportadora PJ brasileira.
- Súmula CARF 189 / Tema 779 STJ: Insumos da fase agrícola (corretivos, defensivos, sementes, diesel, peças) geram crédito para agroindústrias e produtores rurais PJ no Lucro Real.
- Súmula CARF 234: Revendas comerciais e distribuidoras puras não podem tomar créditos sob conceito de insumo.
- Tema 1.093 STJ: Manutenção dos créditos da cadeia anterior na venda interna com alíquota zero.`,
          },
        },
      ],
    })
  },
  (app) => {
    // Reversão
    try {
      const paramCol = app.findCollectionByNameOrId('parametrizacao_fiscal')
      const recs = app.findRecordsByFilter(
        'parametrizacao_fiscal',
        "ncm = '25202090' || ncm = '25201020'",
      )
      for (const r of recs) {
        app.delete(r)
      }
    } catch (_) {}
  },
)
