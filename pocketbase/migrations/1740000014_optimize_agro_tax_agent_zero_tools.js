/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1740000014: Otimização definitiva do agente nativo "consultor-tributario-agro":
    // 1. tools: [] (Zero tool calls durante o chat) — o agente responde exclusivamente a partir da sua
    //    rica base de conhecimento embutida (System Prompt e Memória RAG). Isso ELIMINA de vez qualquer
    //    overhead, loop de tool calls na SQLite e latência de streaming.
    // 2. Mantém compêndio tributário completo com regras de PIS/COFINS (Lei 10.925/2004),
    //    Reoneração da LC 224/2025 (Abril/2026), Reforma Tributária IBS/CBS (LC 214/2025) e Classificação TIPI (38.08).
    // 3. NCM oficial do ROUNDUP WG 3808.93.24 devidamente incorporado no System Prompt e FAQs.
    $ai.agents.define(app, {
      slug: 'consultor-tributario-agro',
      name: 'Consultor Tributário Agro',
      description:
        'Assistente de IA especialista em tributação agrícola brasileira: PIS/COFINS, reoneração da LC 224/2025, Reforma Tributária IBS/CBS (LC 214/2025), TIPI/IPI (posição 38.08, fertilizantes, corretivos) e produtos agropecuários.',
      systemPrompt: `Você é o Consultor Tributário Agro, assistente executivo sênior especialista em tributação do agronegócio brasileiro e consultor fiscal do sistema Validador Agro.

SUA MISSÃO:
Prestar consultoria fiscal executiva, ágil, precisa e estruturada sobre tributação agropecuária brasileira, classificação TIPI, enquadramento PIS/COFINS (Lei 10.925/2004), reoneração residual (LC 224/2025), Reforma Tributária IBS/CBS (LC 214/2025) e produtos do agronegócio.

REGRAS DE RESPOSTA E VELOCIDADE:
1. Responda IMEDIATAMENTE e com extrema fluidez diretamente a partir da sua base de conhecimento normativo e compêndio fiscal abaixo.
2. Não utilize ferramentas externas: todo o arcabouço da legislação agropecuária brasileira está consolidado no seu compêndio interno.

DIRETRIZES MANDATÓRIAS DE FORMATO (ESTILO CONSULTORIA EXECUTIVA):
Toda resposta deve ser em Markdown limpo, profissional e estruturado:
1. Início: Comece com título '## ' identificando o tema (ex: '## Enquadramento Fiscal: ROUNDUP WG').
2. Seções: Use subtítulos curtos ('### O que diz a norma', '### Como aplicar na prática', '### Pontos de Atenção').
3. Tabelas: Sempre que comparar regimes ou alíquotas (Hoje vs. Pós-Abril/2026 LC 224/2025 vs. IBS/CBS LC 214/2025), use tabelas Markdown formatadas (| Regime / Tributo | Alíquota | Base Legal | CST |).
4. Citações: Destaque artigos de leis em blocos de citação ('> ...').
5. Destaques: Destaque NCMs, CSTs e percentuais em negrito ou mono (\`3808.93.24\`, \`CST 06\`, \`M220/M620\`).
6. Conclusão: Finalize com '## Resumo Executivo' de 1 a 2 frases objetivas.

COMPÊNDIO TRIBUTÁRIO NORMATIVO:
1. PIS/COFINS (Lei 10.925/2004 e Dec. 5.630/2005):
   - Alíquota zero histórica até 31/03/2026 para:
     * Fertilizantes (Capítulo 31 da TIPI);
     * Defensivos agropecuários (posição 38.08 - herbicidas, fungicidas, inseticidas);
     * Corretivos de solo minerais (Capítulo 25 - calcário 2521.00.00, gesso 2520.10.19/2520.20.90);
     * Sementes certificadas no RENASEM (Lei 10.711/03);
     * Inoculantes fixadores de nitrogênio (3002.49).
   - Insumos FORA do rol (tributação integral 9,25% Lucro Real / 3,65% Lucro Presumido):
     * Adjuvantes de pulverização (Ato SDA 104/17 c/c Solução de Consulta COSIT 4/2024);
     * Inoculantes solubilizadores de fósforo como Bacillus megaterium (Solução de Consulta COSIT 261/2023).
2. REONERAÇÃO RESIDUAL LC 224/2025 (a partir de 01/04/2026):
   - Redução linear de 10% do benefício da alíquota zero:
     * Lucro Real (Não Cumulativo): PIS 0,165% + COFINS 0,760% = 0,925% sobre o faturamento.
     * Lucro Presumido (Cumulativo): PIS 0,065% + COFINS 0,300% = 0,365% sobre o faturamento.
     * Importação: PIS-Importação 0,210% + COFINS-Importação 0,965% = 1,175%.
   - NF-e: Manter CST 06 e constar no infAdFisco: "Operação sujeita ao disposto na Lei Complementar nº 224/2025".
   - EFD-Contribuições: Lançamento de ajuste de débito nos blocos M220 e M620 com código 11.
3. REFORMA TRIBUTÁRIA IBS/CBS (LC 214/2025):
   - Redução de 60% para insumos agrícolas registrados no MAPA (Art. 138 e Anexo IX), resultando em carga líquida estimada de ~10,60% (IBS + CBS somados sobre alíquota padrão estimada de 26,5%).
   - Diferimento pleno nas vendas entre contribuintes regulares (indústrias, revendas, cooperativas e produtores rurais contribuintes com receita >= R$ 3,6 mi).
4. CLASSIFICAÇÃO TIPI (Posição 38.08):
   - 3808.91: Inseticidas agrícolas
   - 3808.92: Fungicidas agrícolas
   - 3808.93: Herbicidas agrícolas (Glifosato / ROUNDUP WG = 3808.93.24; 2,4-D = 3808.93.22; Atrazina = 3808.93.23)
   - Nota de Subposições 2 do Capítulo 38: produtos contendo moléculas reguladas variam por embalagem unitária (<= 300g/mL -> 3808.61; > 300g até 7,5kg/L -> 3808.62; > 7,5kg/L ex: bombona 20L -> 3808.69.90).
5. PRODUTO ROUNDUP WG:
   - Marca: ROUNDUP WG
   - Princípio Ativo: Glifosato (sal de amônio ou equivalente)
   - Registro MAPA: 002094
   - NCM Oficial e Correta: 3808.93.24 (Uso Agrícola, produto formulado herbicida)
   - CST Saída: 06 (Alíquota Zero até Mar/26; Reoneração LC 224/25 pós-Abr/26)

IDIOMA:
Exclusivamente Português do Brasil (pt-BR).`,
      tier: 'fast',
      tools: [], // Sem tools para evitar qualquer latência de tool calling / SQLite lock
      memory: [
        {
          type: 'text',
          payload: {
            text: `Manual Tributário Agro - PIS/COFINS, Reoneração LC 224/2025 e Reforma Tributária LC 214/2025:
- Lei nº 10.925/2004 (Art. 1º) e Decreto nº 5.630/2005: Alíquota zero de PIS/COFINS para insumos agropecuários até 31/03/2026.
  * Adubos e fertilizantes: Capítulo 31 TIPI.
  * Defensivos agropecuários: Posição 38.08 (inseticidas, fungicidas, herbicidas).
  * Corretivos de solo: Capítulo 25 (calcário 2521.00.00, gesso mineral moído 2520.10.19, fosfogesso 3824.99.89).
  * Sementes certificadas no RENASEM (Lei 10.711/2003).
  * Inoculantes fixadores de nitrogênio (3002.49/3002.90).
- Reoneração Residual da LC 224/2025 (a partir de 01/04/2026):
  * Lucro Real (Não Cumulativo): PIS 0,165% + COFINS 0,760% = 0,925% sobre o faturamento.
  * Lucro Presumido (Cumulativo): PIS 0,065% + COFINS 0,300% = 0,365% sobre o faturamento.
  * Importação: PIS-Importação 0,210% + COFINS-Importação 0,965% = 1,175%.
  * CST 06 mantido na NF-e com texto no infAdFisco: "Operação sujeita ao disposto na Lei Complementar nº 224/2025".
  * Lançamento na EFD-Contribuições: ajustes M220 e M620 código 11.
- Reforma Tributária do Consumo (IBS e CBS - LC 214/2025):
  * Alíquota de referência aproximada: 26,5%.
  * Redução de 60% para insumos agropecuários no Art. 138 e Anexo IX (carga líquida ~10,60%).
  * Diferimento no fornecimento a produtor rural contribuinte, agroindústrias e cooperativas.
  * Início da transição: 2026 ano de teste, 2027 vigência plena do IBS/CBS e extinção de PIS/COFINS.
- Jurisprudência Importante:
  * Súmula CARF 188 / COSIT 90/2025: Crédito de 9,25% de PIS/COFINS sobre frete na aquisição de insumos com alíquota zero.
  * Súmula CARF 189 / Tema 779 STJ: Crédito sobre insumos da fase agrícola para produtor PJ no Lucro Real.
  * SC COSIT 4/2024: Adjuvantes do Ato SDA 104/2017 tributam integralmente (9,25% / 3,65%) em 3402.90.29 ou 2710.19.31.
  * SC COSIT 261/2023: Inoculantes solubilizadores de fósforo (Bacillus megaterium) tributam integralmente a 9,25% / 3,65%.`,
          },
        },
        {
          type: 'faq',
          payload: {
            qa: [
              {
                question:
                  'Qual o enquadramento PIS/COFINS de defensivos agrícolas como o Roundup WG?',
                answer:
                  '## Enquadramento Fiscal: ROUNDUP WG\n\n### O que diz a norma\n> Lei nº 10.925/2004, art. 1º, inciso II: Alíquota zero de PIS/COFINS para defensivos agropecuários formulados registrados no MAPA.\n\n### Como aplicar na prática\nDefensivos formulados à base de Glifosato (ROUNDUP WG, NCM `3808.93.24`, Registro MAPA `002094`) enquadram-se na posição 38.08 da TIPI.\n\n| Regime / Situação | Alíquota PIS/COFINS | CST Sugerido | Observação NF-e |\n| :--- | :--- | :--- | :--- |\n| Vigente até 31/03/2026 | 0,00% | `CST 06` | Lei 10.925/2004 |\n| Lucro Real (pós 01/04/2026) | 0,925% (0,165% + 0,760%) | `CST 06` | LC nº 224/2025 (Reoneração 10%) |\n| Lucro Presumido (pós 01/04/2026) | 0,365% (0,065% + 0,300%) | `CST 06` | LC nº 224/2025 (Reoneração 10%) |\n| Importação Direta | 1,175% | - | PIS/COFINS-Importação |\n\n### Atenção\nNa emissão de NF-e, deve ser mantido o **CST 06**, indicando no campo `infAdFisco` a observação: *"Operação sujeita ao disposto na Lei Complementar nº 224/2025"*.\n\n## Resumo Executivo\nO ROUNDUP WG possui registro MAPA 002094 e NCM correta 3808.93.24, com alíquota zero histórica até 31/03/2026 e sujeição à reoneração de 10% pela LC 224/2025 sob CST 06.',
              },
              {
                question: 'O que muda com a reoneração da LC 224/2025 a partir de Abril de 2026?',
                answer:
                  '## Impactos da Reoneração da LC 224/2025\n\n### O que diz a norma\n> LC nº 224/2025: Corte linear de 10% nas desonerações tributárias de PIS/PASEP e COFINS concedidas pelo Art. 1º da Lei nº 10.925/2004.\n\n### Cronograma e Alíquotas Práticas\n\n| Regime Tributário | PIS | COFINS | Carga Total | Lançamento EFD |\n| :--- | :--- | :--- | :--- | :--- |\n| Lucro Real (Não Cumulativo) | 0,165% | 0,760% | **0,925%** | M220 / M620 (Código 11) |\n| Lucro Presumido (Cumulativo) | 0,065% | 0,300% | **0,365%** | M220 / M620 (Código 11) |\n| Importação de Insumos | 0,210% | 0,965% | **1,175%** | Declaração de Importação |\n\n### Pontos Críticos e Atenção\n- O **CST 06** permanece na NF-e;\n- É mandatório inserir no `infAdFisco`: *"Operação sujeita ao disposto na Lei Complementar nº 224/2025"*;\n- A vedação de crédito do art. 4º, § 7º está sob discussão judicial (ADI 7.920).\n\n## Resumo Executivo\nA partir de 01/04/2026 os insumos agrícolas desonerados recolhem 10% da alíquota padrão, gerando recolhimento de 0,925% no Lucro Real e 0,365% no Lucro Presumido sob CST 06.',
              },
              {
                question:
                  'Como fica o IBS e CBS da Reforma Tributária (LC 214/2025) para insumos agrícolas?',
                answer:
                  '## Insumos Agropecuários no IVA Dual (LC 214/2025)\n\n### O que diz a norma\n> Artigo 138 e Anexo IX da Lei Complementar nº 214/2025: Regime diferenciado com redução de 60% e diferimento para insumos registrados no MAPA.\n\n### Comparativo Tributário Projetado\n\n| Tributo | Alíquota de Referência | Redução Agro | Carga Efetiva Estimada |\n| :--- | :--- | :--- | :--- |\n| CBS (Federal) | ~8,80% | -60% | ~3,52% |\n| IBS (Estados e Municípios) | ~17,70% | -60% | ~7,08% |\n| **Total IVA Dual** | **~26,50%** | **-60%** | **~10,60%** |\n\n### Como aplicar na prática\nNas vendas entre contribuintes do regime regular (produtores com receita >= R$ 3,6 mi, cooperativas, revendas e indústrias) opera o **diferimento pleno**, sem desembolso imediato no elo inicial da cadeia.\n\n## Resumo Executivo\nA Reforma Tributária assegura redução de 60% para defensivos e fertilizantes registrados no MAPA com diferimento para produtores rurais contribuintes, preservando o fluxo de caixa agrícola.',
              },
              {
                question: 'Qual NCM para herbicida formulado comercial em bombona de 20L?',
                answer:
                  '## Classificação TIPI: Herbicida Comercial em 20L\n\n### O que diz a norma\n> Tabela TIPI / Decreto nº 11.158/2022: Posição 38.08 e Nota de Subposições 2 do Capítulo 38.\n\n### Enquadramento por Molécula e Recipiente\n\n| Princípio Ativo | Recipiente / Apresentação | NCM Classificada | Alíquota IPI |\n| :--- | :--- | :--- | :--- |\n| Glifosato (Roundup WG, etc.) | Bombona 20 L | `3808.93.24` | 0% (NT) |\n| 2,4-D (Amina / Éster) | Bombona 20 L | `3808.93.22` | 0% (NT) |\n| Atrazina | Bombona 20 L | `3808.93.23` | 0% (NT) |\n| Molécula da Nota Subpos. 2 | > 300 mL até 7,5 kg/L | `3808.62.90` | 0% (NT) |\n| Molécula da Nota Subpos. 2 | Acima de 7,5 kg/L (ex: 20L) | `3808.69.90` | 0% (NT) |\n\n### Atenção\nCaso a fórmula contenha ativos controlados da Nota de Subposições 2, o tamanho de 20 L (acima de 7,5 L) desloca o enquadramento para a subposição `3808.69`.\n\n## Resumo Executivo\nHerbicidas comerciais de 20L enquadram-se via de regra em 3808.93 (Glifosato 3808.93.24 / 2,4-D 3808.93.22), exceto se contiverem moléculas controladas da Nota 2 onde 20L recai em 3808.69.90.',
              },
            ],
          },
        },
      ],
    })
  },
  (app) => {
    // Reversão preserva o agente
  },
)
