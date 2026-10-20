/**
 * POST /backend/v1/sincronizar-produtos
 * Motor de sincronização de produtos agrícolas e fertilizantes via dados abertos oficiais do MAPA.
 *
 * Fontes oficiais:
 * 1. AGROFIT Formulados (CSV do MAPA)
 * 2. AGROFIT Técnicos (CSV do MAPA)
 * 3. SIPEAGRO Fertilizantes (CSV do MAPA)
 *
 * Motor de classificação determinístico:
 * - Dicionário de Princípios Ativos local como matriz de referência
 * - Nota de Subposições 2 do Cap. 38 TIPI (SC COSIT 98.042/2022)
 * - Fallbacks específicos para AGROFIT Formulados, Técnicos e SIPEAGRO
 * - Enquadramento tributário (PIS/COFINS, CST e Reforma Tributária IBS/CBS LC 214/2025)
 * - Trava 4 (duplicidade) obrigatória antes de auto-inclusão na base_mestre e dicionario_principios_ativos
 * - Persistência do histórico na collection sincronizacao_historico
 */

routerAdd('POST', '/backend/v1/sincronizar-produtos', (e) => {
  const startTime = Date.now()
  const info = e.requestInfo()
  const body = info.body || {}

  // Fontes selecionadas (default: todas)
  const fontesPermitidas =
    Array.isArray(body.fontes) && body.fontes.length > 0
      ? body.fontes
      : ['AGROFIT_FORMULADO', 'AGROFIT_TECNICO', 'SIPEAGRO']

  const autoCadastrar = body.auto_inclusao !== false
  const maxItensPorFonte = Math.min(Math.max(Number(body.limite_por_fonte) || 120, 10), 500)

  // 1. Definição das fontes
  const configFontes = {
    AGROFIT_FORMULADO: {
      id: 'AGROFIT_FORMULADO',
      nome: 'AGROFIT Formulados',
      descricao: 'Defensivos comerciais, biodefensivos e reguladores (MAPA)',
      url: 'https://dados.agricultura.gov.br/dataset/6c913699-e82e-4da3-a0a1-fb6c431e367f/resource/d30b30d7-e256-484e-9ab8-cd40974e1238/download/agrofitprodutosformulados.csv',
      portalUrl:
        'https://dados.agricultura.gov.br/dataset/sistema-de-agrotoxicos-fitossanitarios-agrofit',
    },
    AGROFIT_TECNICO: {
      id: 'AGROFIT_TECNICO',
      nome: 'AGROFIT Técnicos',
      descricao: 'Princípios ativos técnicos e pré-misturas (MAPA)',
      url: 'https://dados.agricultura.gov.br/dataset/6c913699-e82e-4da3-a0a1-fb6c431e367f/resource/a200c70b-e025-4a9a-be1b-ec7275d7921f/download/agrofitprodutostecnicos.csv',
      portalUrl:
        'https://dados.agricultura.gov.br/dataset/sistema-de-agrotoxicos-fitossanitarios-agrofit',
    },
    SIPEAGRO: {
      id: 'SIPEAGRO',
      nome: 'SIPEAGRO Fertilizantes',
      descricao: 'Fertilizantes IN 39/18, corretivos IN 35/06 e inoculantes (MAPA)',
      url: 'https://dados.agricultura.gov.br/dataset/52a01565-72d6-410e-b21b-64035831a7be/resource/e0bbc9d5-f161-448b-a6d4-c7beb312ec33/download/sipeagrofertilizante.csv',
      portalUrl: 'https://dados.agricultura.gov.br/dataset/sipeagro',
    },
  }

  // Moléculas da Nota de Subposições 2 do Cap. 38 TIPI (SC COSIT 98.042/2022)
  const MOLECULAS_NOTA_SUBPOS_2 = [
    'BIFENTRINA',
    'LAMBDA-CIALOTRINA',
    'LAMBDA CIALOTRINA',
    'CLORFENAPIR',
    'CHLORFENAPYR',
    'MALATIONA',
    'FENITROTIONA',
    'BETA-CIFLUTRINA',
    'BETA CIFLUTRINA',
    'CIFLUTRINA',
    'ALFA-CIPERMETRINA',
    'ALFA CIPERMETRINA',
    'ALPHA-CYPERMETHRIN',
    'DELTAMETRINA',
    'PERMETRINA',
    'PROPOXUR',
    'BENDIOCARBE',
    'BENDIOCARB',
  ]

  // Helpers de normalização de texto
  function normTxt(s) {
    if (!s) return ''
    return String(s)
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
  }

  function cleanString(s) {
    if (!s) return ''
    return String(s)
      .trim()
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
  }

  function cleanNcm(ncm) {
    if (!ncm) return ''
    const clean = String(ncm).replace(/\D/g, '')
    return clean.slice(0, 8)
  }

  // Checagem de Nota de Subposições 2
  function checkNotaSubpos2(pa) {
    if (!pa) return false
    const paUpper = String(pa).toUpperCase()
    return MOLECULAS_NOTA_SUBPOS_2.some((mol) => paUpper.includes(mol))
  }

  // Carregar matriz local existente de princípios ativos do banco
  let matrizLocalPa = []
  try {
    const records =
      $app.findRecordsByFilter('dicionario_principios_ativos', 'id != ""', '-created', 500, 0) || []
    matrizLocalPa = records
      .map((r) => ({
        id: r.id,
        principio_ativo: r.getString('principio_ativo'),
        classe: r.getString('classe'),
        grupo_quimico: r.getString('grupo_quimico'),
        norm: normTxt(r.getString('principio_ativo')),
      }))
      .filter((item) => item.norm.length >= 3)
  } catch (err) {
    console.log('Aviso ao carregar matriz local:', err.message)
  }

  // Carregar produtos existentes na base_mestre para trava de duplicidade
  let produtosExistentes = []
  try {
    const records = $app.findRecordsByFilter('base_mestre', 'id != ""', '-created', 2000, 0) || []
    produtosExistentes = records.map((r) => ({
      id: r.id,
      nome_produto: r.getString('nome_produto'),
      nomeNorm: normTxt(r.getString('nome_produto')),
      ncm: cleanNcm(r.getString('ncm')),
      registro_mapa: String(r.getString('registro_mapa') || '').trim(),
      mapaDigits: String(r.getString('registro_mapa') || '').replace(/\D/g, ''),
      principio_ativo: r.getString('principio_ativo'),
      paNorm: normTxt(r.getString('principio_ativo')),
      fabricante: r.getString('fabricante'),
    }))
  } catch (err) {
    console.log('Aviso ao carregar base_mestre existente:', err.message)
  }

  // Helper de download tolerante a falhas (timeout 45s, headers e detecção de delimitador)
  function downloadCsv(url) {
    try {
      const res = $http.send({
        url: url,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ValidadorAgro/1.0 (+https://dados.agricultura.gov.br)',
          Accept: 'text/csv,text/plain,*/*',
          'Accept-Charset': 'utf-8, iso-8859-1;q=0.8, windows-1252;q=0.8',
        },
        timeout: 45,
      })

      if (res.statusCode !== 200) {
        return {
          sucesso: false,
          erro: `HTTP ${res.statusCode}: servidor do MAPA retornou código inesperado`,
        }
      }

      let text = res.raw || ''
      if (!text || text.length < 50) {
        return {
          sucesso: false,
          erro: 'Conteúdo retornado pelo MAPA está vazio ou incompleto',
        }
      }

      // Remover BOM se presente
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1)
      }

      return {
        sucesso: true,
        conteudo: text,
      }
    } catch (err) {
      return {
        sucesso: false,
        erro: `Falha na requisição ao MAPA: ${err.message || 'Timeout excedido (45s)'}`,
      }
    }
  }

  // Parser de CSV com detecção de delimitador (; vs , vs \t)
  function parseCsvLinhas(rawText, maxLinhas) {
    if (!rawText) return []

    // Detecção das primeiras 5 linhas
    const linhas = rawText.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0)
    if (linhas.length < 2) return []

    const cabecalhoLinha = linhas[0]
    let delim = ';'
    const countPontoEVirgula = (cabecalhoLinha.match(/;/g) || []).length
    const countVirgula = (cabecalhoLinha.match(/,/g) || []).length
    const countTab = (cabecalhoLinha.match(/\t/g) || []).length

    if (countPontoEVirgula >= countVirgula && countPontoEVirgula >= countTab) {
      delim = ';'
    } else if (countVirgula > countPontoEVirgula && countVirgula >= countTab) {
      delim = ','
    } else if (countTab > countPontoEVirgula) {
      delim = '\t'
    }

    // Dividir linha respeitando aspas simples/duplas
    function splitLine(line, delimiter) {
      const result = []
      let cur = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes
        } else if (char === delimiter && !inQuotes) {
          result.push(cur.trim().replace(/^["']|["']$/g, ''))
          cur = ''
        } else {
          cur += char
        }
      }
      result.push(cur.trim().replace(/^["']|["']$/g, ''))
      return result
    }

    const headers = splitLine(cabecalhoLinha, delim).map((h) => normTxt(h))
    const itens = []
    const limite = Math.min(linhas.length, maxLinhas + 1)

    for (let i = 1; i < limite; i++) {
      const colunas = splitLine(linhas[i], delim)
      if (colunas.length < 2) continue

      const rowObj = {}
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c] || `col_${c}`
        rowObj[key] = colunas[c] || ''
      }
      rowObj.__rawColunas = colunas
      itens.push(rowObj)
    }

    return itens
  }

  // Motor de Classificação Determinístico
  function classificarProduto(origem, itemRaw) {
    const cols = itemRaw.__rawColunas || []
    let nomeProduto = ''
    let registroMapa = ''
    let titular = ''
    let principioAtivo = ''
    let classeUso = ''

    if (origem === 'AGROFIT_FORMULADO') {
      nomeProduto = cleanString(
        itemRaw.marcaproduto ||
          itemRaw.nomecomercial ||
          itemRaw.nomedoproduto ||
          itemRaw.marcacomercal ||
          cols[0] ||
          '',
      )
      registroMapa = cleanString(
        itemRaw.numregistro ||
          itemRaw.numerodoregistro ||
          itemRaw.nregistro ||
          itemRaw.registro ||
          cols[1] ||
          '',
      )
      titular = cleanString(
        itemRaw.titularregistro || itemRaw.empresa || itemRaw.titular || cols[2] || 'Não informado',
      )
      principioAtivo = cleanString(
        itemRaw.ingredienteativo || itemRaw.principioativo || itemRaw.composicao || cols[3] || '',
      )
      classeUso = cleanString(
        itemRaw.classe || itemRaw.classeagronomica || itemRaw.classedouso || cols[4] || '',
      )
    } else if (origem === 'AGROFIT_TECNICO') {
      nomeProduto = cleanString(
        itemRaw.marcaproduto ||
          itemRaw.nomedoprodutotecnico ||
          itemRaw.nomedoproduto ||
          cols[0] ||
          '',
      )
      registroMapa = cleanString(
        itemRaw.numregistro || itemRaw.numerodoregistro || itemRaw.nregistro || cols[1] || '',
      )
      titular = cleanString(
        itemRaw.titularregistro || itemRaw.empresa || itemRaw.titular || cols[2] || 'Não informado',
      )
      principioAtivo = cleanString(
        itemRaw.ingredienteativo || itemRaw.principioativo || cols[3] || nomeProduto || '',
      )
      classeUso = 'Produto Técnico'
    } else if (origem === 'SIPEAGRO') {
      nomeProduto = cleanString(
        itemRaw.denominacaoproduto ||
          itemRaw.nomecomercial ||
          itemRaw.nomedoproduto ||
          cols[0] ||
          '',
      )
      registroMapa = cleanString(
        itemRaw.numeroregistroproduto || itemRaw.registro || itemRaw.nregistro || cols[1] || '',
      )
      titular = cleanString(itemRaw.razaosocial || itemRaw.empresa || cols[2] || 'Não informado')
      principioAtivo = cleanString(
        itemRaw.materiaprima ||
          itemRaw.garantias ||
          itemRaw.classificacao ||
          cols[3] ||
          nomeProduto ||
          '',
      )
      classeUso = cleanString(itemRaw.classificacao || 'Fertilizante')
    }

    if (!nomeProduto && cols[0]) {
      nomeProduto = cleanString(cols[0])
    }
    if (!principioAtivo && nomeProduto) {
      principioAtivo = nomeProduto
    }

    const paUpper = principioAtivo.toUpperCase()
    const nomeUpper = nomeProduto.toUpperCase()
    const classeUpper = classeUso.toUpperCase()

    // 1. Matriz local de Princípios Ativos (busca exata ou prefixo >= 5 chars)
    let matchLocal = null
    const paNorm = normTxt(principioAtivo)
    if (paNorm.length >= 3) {
      matchLocal = matrizLocalPa.find((m) => {
        if (m.norm === paNorm) return true
        if (m.norm.length >= 5 && (paNorm.includes(m.norm) || m.norm.includes(paNorm))) {
          return true
        }
        return false
      })
    }

    // 2. Nota de Subposições 2 do Cap. 38 TIPI
    const pertenceNotaSubpos2 = checkNotaSubpos2(principioAtivo) || checkNotaSubpos2(nomeProduto)

    // 3. Fallbacks determinísticos por origem
    let ncmPadrao = ''
    let ncmFaixa1 = '' // <= 300g/mL
    let ncmFaixa2 = '' // 300g a 7,5kg/L
    let ncmFaixa3 = '' // 7,5kg a 10kg/L
    let ncmFaixa4 = '' // > 10kg/L
    let regraTipiEmbalagem = ''
    let macroGrupoSubgrupo = ''
    let regimeTipo = 'beneficiado' // 'tributado_integral' ou 'beneficiado' ou 'condicional'

    if (origem === 'AGROFIT_TECNICO') {
      macroGrupoSubgrupo = 'AGROFIT — Produto Técnico (Lei nº 14.785/2023)'
      regraTipiEmbalagem =
        'Nota 2 Seção VI TIPI: Produto Técnico isolado (Cap. 29) ou preparação intermediária (38.08)'
      regimeTipo = 'condicional'

      if (pertenceNotaSubpos2) {
        ncmPadrao = '3808.69.90'
      } else if (classeUpper.includes('HERBICIDA') || paUpper.includes('HERBICIDA')) {
        ncmPadrao = '3808.93.19'
      } else if (classeUpper.includes('FUNGICIDA') || paUpper.includes('FUNGICIDA')) {
        ncmPadrao = '3808.92.20'
      } else {
        ncmPadrao = '3808.91.20'
      }
      ncmFaixa1 = ncmPadrao
      ncmFaixa2 = ncmPadrao
      ncmFaixa3 = ncmPadrao
      ncmFaixa4 = ncmPadrao
    } else if (origem === 'SIPEAGRO') {
      regimeTipo = 'condicional'
      // (a) Inoculantes fixadores de N
      if (
        paUpper.includes('INOCULANTE') ||
        paUpper.includes('BRADYRHIZOBIUM') ||
        paUpper.includes('AZOSPIRILLUM') ||
        paUpper.includes('RHIZOBIUM') ||
        nomeUpper.includes('INOCULANTE') ||
        nomeUpper.includes('BRADYRHIZOBIUM') ||
        nomeUpper.includes('AZOSPIRILLUM')
      ) {
        macroGrupoSubgrupo = 'Inoculantes e Biológicos — Inoculante Fixador de Nitrogênio'
        ncmPadrao = '3002.49.99'
        ncmFaixa1 = '3002.49.99'
        ncmFaixa2 = '3002.49.99'
        ncmFaixa3 = '3002.49.99'
        ncmFaixa4 = '3002.49.99'
        regraTipiEmbalagem = 'Culturas de microrganismos para fixação biológica de N2'
        regimeTipo = 'beneficiado'
        // (b) Solubilizadores
      } else if (
        paUpper.includes('MEGATERIUM') ||
        paUpper.includes('SOLUBILIZADOR') ||
        paUpper.includes('PRIESTIA') ||
        paUpper.includes('PSEUDOMONAS') ||
        nomeUpper.includes('SOLUBILIZADOR')
      ) {
        macroGrupoSubgrupo = 'Inoculantes e Biológicos — Solubilizador de Fósforo/Nutrientes'
        ncmPadrao = '3002.49.99'
        ncmFaixa1 = '3002.49.99'
        ncmFaixa2 = '3002.49.99'
        ncmFaixa3 = '3002.49.99'
        ncmFaixa4 = '3002.49.99'
        regraTipiEmbalagem = 'Biológicos promotores de crescimento e solubilização'
        regimeTipo = 'tributado_integral'
        // (c) Corretivos
      } else if (
        paUpper.includes('CORRETIVO') ||
        paUpper.includes('CALCARIO') ||
        paUpper.includes('GESSO') ||
        paUpper.includes('FOSFOGESSO') ||
        paUpper.includes('CONDICIONADOR') ||
        nomeUpper.includes('CORRETIVO') ||
        nomeUpper.includes('CALCARIO') ||
        nomeUpper.includes('GESSO')
      ) {
        macroGrupoSubgrupo = 'Corretivos e Condicionadores de Solo (IN 35/2006)'
        regraTipiEmbalagem = 'Condicionadores e corretivos de solo a granel ou ensacados'
        if (paUpper.includes('GESSO') || nomeUpper.includes('GESSO')) {
          ncmPadrao = '2520.10.19'
        } else if (paUpper.includes('CALCARIO') || nomeUpper.includes('CALCARIO')) {
          ncmPadrao = '2521.00.00'
        } else {
          ncmPadrao = '2503.00.90'
        }
        ncmFaixa1 = ncmPadrao
        ncmFaixa2 = ncmPadrao
        ncmFaixa3 = ncmPadrao
        ncmFaixa4 = ncmPadrao
        regimeTipo = 'condicional'
        // (d) Padrão Fertilizante
      } else {
        macroGrupoSubgrupo = 'Fertilizantes Minerais e Orgânicos (IN 39/2018)'
        regraTipiEmbalagem =
          'Nota 1 Cap. 31 TIPI: Embalagens <= 10kg classificam-se na posição 3105.10.00'
        if (paUpper.includes('ORGANO') || nomeUpper.includes('ORGANO')) {
          ncmPadrao = '3101.00.00'
          ncmFaixa1 = '3105.10.00'
          ncmFaixa2 = '3105.10.00'
          ncmFaixa3 = '3105.10.00'
          ncmFaixa4 = '3101.00.00'
        } else {
          ncmPadrao = '3105.90.90'
          ncmFaixa1 = '3105.10.00'
          ncmFaixa2 = '3105.10.00'
          ncmFaixa3 = '3105.10.00'
          ncmFaixa4 = '3105.90.90'
        }
        regimeTipo = 'beneficiado'
      }
    } else {
      // AGROFIT_FORMULADO (Posição 38.08 TIPI)
      macroGrupoSubgrupo = 'Defensivos Agrícolas Formulados (Capítulo 38 TIPI)'
      regraTipiEmbalagem =
        'Nota 1 e 2 Cap. 38 TIPI: Escalonamento por faixa unitária de acondicionamento'
      regimeTipo = 'beneficiado'

      if (pertenceNotaSubpos2) {
        macroGrupoSubgrupo =
          'Defensivos — Moléculas da Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022)'
        ncmPadrao = '3808.62.90'
        ncmFaixa1 = '3808.61.00' // <= 300g/mL
        ncmFaixa2 = '3808.62.90' // 300g a 7,5kg/L
        ncmFaixa3 = '3808.69.90' // > 7,5kg/L
        ncmFaixa4 = '3808.69.90'
      } else if (classeUpper.includes('HERBICIDA') || paUpper.includes('HERBICIDA')) {
        if (paUpper.includes('2,4-D') || paUpper.includes('2-4 D') || paUpper.includes('MCPA')) {
          ncmPadrao = '3808.93.22'
        } else if (paUpper.includes('ATRAZINA') || paUpper.includes('DIURON')) {
          ncmPadrao = '3808.93.23'
        } else if (paUpper.includes('GLIFOSATO') || paUpper.includes('GLYPHOSATE')) {
          ncmPadrao = '3808.93.24'
        } else if (
          paUpper.includes('IMAZETAPIR') ||
          paUpper.includes('CLORIMURON') ||
          paUpper.includes('METSULFURON') ||
          paUpper.includes('NICOSULFUROM') ||
          paUpper.includes('NICOSULFURON')
        ) {
          ncmPadrao = '3808.93.27'
        } else if (
          paUpper.includes('AMETRINA') ||
          paUpper.includes('HEXAZINONA') ||
          paUpper.includes('METRIBUZIM') ||
          paUpper.includes('METRIBUZIN')
        ) {
          ncmPadrao = '3808.93.28'
        } else {
          ncmPadrao = '3808.93.29'
        }
        ncmFaixa1 = ncmPadrao
        ncmFaixa2 = ncmPadrao
        ncmFaixa3 = ncmPadrao
        ncmFaixa4 = ncmPadrao
      } else if (classeUpper.includes('REGULADOR') || paUpper.includes('REGULADOR')) {
        ncmPadrao = '3808.93.59'
        ncmFaixa1 = ncmPadrao
        ncmFaixa2 = ncmPadrao
        ncmFaixa3 = ncmPadrao
        ncmFaixa4 = ncmPadrao
      } else if (classeUpper.includes('FUNGICIDA') || paUpper.includes('FUNGICIDA')) {
        if (paUpper.includes('MANCOZEBE') || paUpper.includes('MANCOZEB')) {
          ncmPadrao = '3808.92.93'
        } else {
          ncmPadrao = '3808.92.99'
        }
        ncmFaixa1 = ncmPadrao
        ncmFaixa2 = ncmPadrao
        ncmFaixa3 = ncmPadrao
        ncmFaixa4 = ncmPadrao
      } else if (classeUpper.includes('NEMATICIDA') || paUpper.includes('NEMATICIDA')) {
        ncmPadrao = '3808.99.95'
        ncmFaixa1 = ncmPadrao
        ncmFaixa2 = ncmPadrao
        ncmFaixa3 = ncmPadrao
        ncmFaixa4 = ncmPadrao
      } else {
        // Demais (Inseticidas, Acaricidas, etc.)
        if (paUpper.includes('ACEFATO') || paUpper.includes('THURINGIENSIS')) {
          ncmPadrao = '3808.91.91'
        } else if (paUpper.includes('CIPERMETRINA') || paUpper.includes('CYPERMETHRIN')) {
          ncmPadrao = '3808.91.92'
        } else {
          ncmPadrao = '3808.91.99'
        }
        ncmFaixa1 = ncmPadrao
        ncmFaixa2 = ncmPadrao
        ncmFaixa3 = ncmPadrao
        ncmFaixa4 = ncmPadrao
      }
    }

    // 4. Regime Tributário (Strings Literais Conforme Especificação Oficial)
    let enquadramentoPisCofins = ''
    let cstRecomendado = ''
    let ibsCbs2027 = ''

    if (regimeTipo === 'tributado_integral') {
      enquadramentoPisCofins =
        '9,25% Real | 3,65% Presumido até Mar/2026; 9,250% Real / 3,650% Presumido pós-Abr/2026'
      cstRecomendado = 'Saída: CST 01 (9,25% Real / 3,65% Pres.) | Entrada Revenda Real: CST 50'
      ibsCbs2027 = 'Alíquota Padrão Integral'
    } else if (regimeTipo === 'condicional') {
      enquadramentoPisCofins =
        'Benefício Condicional à Destinação Agrícola: 0,00% até Mar/2026 (Dec. 5.630/05) | 0,925% Real / 0,365% Presumido pós-Abr/2026'
      cstRecomendado = 'Saída: CST 06 (c/ Ajuste M220/M620 pós-Abr/26) | Entrada Revenda: CST 73'
      ibsCbs2027 = 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)'
    } else {
      // Beneficiado
      enquadramentoPisCofins =
        '0,00% (Lei nº 10.925/2004) até Mar/2026; 0,925% (LC nº 224/2025) Real / 0,365% (LC nº 224/2025) Presumido pós-Abr/2026'
      cstRecomendado = 'Saída: CST 06 (c/ Ajuste M220/M620 pós-Abr/26) | Entrada Revenda: CST 73'
      ibsCbs2027 = 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)'
    }

    return {
      origem_base: origem,
      numero_registro_mapa: registroMapa,
      marcas_comerciais: nomeProduto,
      titular_registro: titular,
      principio_ativo_garantias: principioAtivo,
      classe_uso: classeUso,
      macro_grupo_subgrupo: macroGrupoSubgrupo,
      pertence_nota_subpos_2: pertenceNotaSubpos2 ? 'SIM' : 'NÃO',
      ncm_padrao: ncmPadrao,
      ncm_faixa1_ate_300g: ncmFaixa1 || ncmPadrao,
      ncm_faixa2_300g_a_7_5kg: ncmFaixa2 || ncmPadrao,
      ncm_faixa3_7_5kg_a_10kg: ncmFaixa3 || ncmPadrao,
      ncm_faixa4_acima_10kg: ncmFaixa4 || ncmPadrao,
      regra_tipi_embalagem: regraTipiEmbalagem,
      enquadramento_pis_cofins: enquadramentoPisCofins,
      cst_recomendado: cstRecomendado,
      ibs_cbs_2027: ibsCbs2027,
      match_matriz_local: Boolean(matchLocal),
    }
  }

  // Trava 4: Checar duplicidade contra base_mestre
  function verificarDuplicidade(p) {
    const nomeNorm = normTxt(p.marcas_comerciais)
    const ncmClean = cleanNcm(p.ncm_padrao)
    const mapaDigits = String(p.numero_registro_mapa || '').replace(/\D/g, '')

    // 1. Registro MAPA
    if (mapaDigits && mapaDigits.length >= 4) {
      const matchMapa = produtosExistentes.find(
        (ex) => ex.mapaDigits && ex.mapaDigits === mapaDigits,
      )
      if (matchMapa) {
        return {
          duplicado: true,
          motivo: `Registro MAPA ${matchMapa.registro_mapa} já cadastrado no produto "${matchMapa.nome_produto}".`,
          registroExistente: matchMapa,
        }
      }
    }

    // 2. Nome normalizado + NCM
    if (nomeNorm && ncmClean) {
      const matchNomeNcm = produtosExistentes.find(
        (ex) => ex.nomeNorm === nomeNorm && ex.ncm === ncmClean,
      )
      if (matchNomeNcm) {
        return {
          duplicado: true,
          motivo: `Nome de produto e NCM idênticos ao produto "${matchNomeNcm.nome_produto}".`,
          registroExistente: matchNomeNcm,
        }
      }
    }

    return { duplicado: false }
  }

  // -------------------------------------------------------------------------
  // EXECUÇÃO DA SINCRONIZAÇÃO POR FONTE
  // -------------------------------------------------------------------------
  const detalhesFontes = []
  let totalBaixadoGeral = 0
  let novosCadastradosGeral = 0
  let atualizadosGeral = 0
  let ignoradosDuplicidadeGeral = 0
  const produtosAmostraProcessados = []

  const colBaseMestre = $app.findCollectionByNameOrId('base_mestre')
  const colDicionarioPa = $app.findCollectionByNameOrId('dicionario_principios_ativos')

  for (let f = 0; f < fontesPermitidas.length; f++) {
    const fonteKey = fontesPermitidas[f]
    const cfg = configFontes[fonteKey]
    if (!cfg) continue

    const detalhe = {
      fonte: fonteKey,
      nome: cfg.nome,
      url: cfg.url,
      portalUrl: cfg.portalUrl,
      status: 'pendente', // 'sucesso' | 'indisponivel' | 'processado'
      mensagem: '',
      total_baixado: 0,
      novos_cadastrados: 0,
      atualizados: 0,
      ignorados_duplicidade: 0,
      itens_amostra: [],
    }

    // Download resiliente
    const resDl = downloadCsv(cfg.url)
    if (!resDl.sucesso) {
      detalhe.status = 'indisponivel'
      detalhe.mensagem = `Fonte oficial temporariamente inacessível: ${resDl.erro}`
      detalhesFontes.push(detalhe)
      continue
    }

    // Parse do CSV
    const rows = parseCsvLinhas(resDl.conteudo, maxItensPorFonte)
    detalhe.total_baixado = rows.length
    totalBaixadoGeral += rows.length

    if (rows.length === 0) {
      detalhe.status = 'concluido'
      detalhe.mensagem = 'Download efetuado, porém nenhum registro legível foi extraído.'
      detalhesFontes.push(detalhe)
      continue
    }

    detalhe.status = 'concluido'
    detalhe.mensagem = `${rows.length} produtos baixados do portal oficial do MAPA.`

    // Classificação e Inclusão
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const classif = classificarProduto(fonteKey, row)
      if (!classif.marcas_comerciais) continue

      if (detalhe.itens_amostra.length < 5) {
        detalhe.itens_amostra.push({
          nome: classif.marcas_comerciais,
          registro_mapa: classif.numero_registro_mapa,
          ncm_padrao: classif.ncm_padrao,
          principio_ativo: classif.principio_ativo_garantias,
          pertence_nota_subpos_2: classif.pertence_nota_subpos_2,
          cst_recomendado: classif.cst_recomendado,
        })
      }

      if (produtosAmostraProcessados.length < 15) {
        produtosAmostraProcessados.push(classif)
      }

      // Trava 4 de Duplicidade
      const dup = verificarDuplicidade(classif)
      if (dup.duplicado) {
        detalhe.ignorados_duplicidade++
        ignoradosDuplicidadeGeral++
        continue
      }

      // Auto-inclusão na base_mestre e dicionário se habilitado
      if (autoCadastrar) {
        try {
          // 1. Inserir na base_mestre
          const recBase = new Record(colBaseMestre)
          recBase.set('nome_produto', classif.marcas_comerciais)
          recBase.set('ncm', cleanNcm(classif.ncm_padrao))
          recBase.set('embalagem', 'Padrão Oficial MAPA')
          recBase.set('principio_ativo', classif.principio_ativo_garantias)
          recBase.set('fabricante', classif.titular_registro)
          recBase.set('registro_mapa', classif.numero_registro_mapa)
          recBase.set('concentracao', 0)
          recBase.set('unidade_concentracao', '%')
          recBase.set('status_validacao', 'aprovado')
          recBase.set('origem_base', classif.origem_base)
          recBase.set('macro_grupo_subgrupo', classif.macro_grupo_subgrupo)
          recBase.set('regra_tipi_embalagem', classif.regra_tipi_embalagem)
          recBase.set('cst_recomendado', classif.cst_recomendado)
          recBase.set('ibs_cbs_2027', classif.ibs_cbs_2027)
          recBase.set('dados_classificacao', JSON.stringify(classif))
          $app.save(recBase)

          detalhe.novos_cadastrados++
          novosCadastradosGeral++

          // Atualizar lista em memória para evitar duplicatas dentro do mesmo lote
          produtosExistentes.push({
            id: recBase.id,
            nome_produto: classif.marcas_comerciais,
            nomeNorm: normTxt(classif.marcas_comerciais),
            ncm: cleanNcm(classif.ncm_padrao),
            registro_mapa: classif.numero_registro_mapa,
            mapaDigits: String(classif.numero_registro_mapa || '').replace(/\D/g, ''),
            principio_ativo: classif.principio_ativo_garantias,
            paNorm: normTxt(classif.principio_ativo_garantias),
            fabricante: classif.titular_registro,
          })

          // 2. Auto-enriquecimento do Dicionário de Princípios Ativos se inédito
          if (classif.principio_ativo_garantias && !classif.match_matriz_local) {
            const paLimpo = classif.principio_ativo_garantias.trim()
            const paNorm = normTxt(paLimpo)
            const jaNoDicionario = matrizLocalPa.some((m) => m.norm === paNorm)
            if (!jaNoDicionario && paLimpo.length >= 3 && paLimpo.length <= 150) {
              try {
                const recPa = new Record(colDicionarioPa)
                recPa.set('principio_ativo', paLimpo)
                recPa.set('classe', classif.classe_uso || classif.macro_grupo_subgrupo)
                recPa.set('grupo_quimico', `Classificação MAPA / ${fonteKey}`)
                recPa.set('concentracao_min', 0)
                recPa.set('concentracao_max', 0)
                recPa.set('unidade', '%')
                recPa.set('status', 'Ativo')
                $app.save(recPa)
                matrizLocalPa.push({
                  id: recPa.id,
                  principio_ativo: paLimpo,
                  classe: classif.classe_uso,
                  grupo_quimico: `Classificação MAPA / ${fonteKey}`,
                  norm: paNorm,
                })
              } catch (_) {}
            }
          }
        } catch (saveErr) {
          console.log('Erro ao auto-incluir produto sincronizado:', saveErr.message)
        }
      } else {
        // Se auto-cadastro desligado, contabiliza apenas como analisado
        detalhe.novos_cadastrados++
        novosCadastradosGeral++
      }
    }

    detalhesFontes.push(detalhe)
  }

  const duracaoMs = Date.now() - startTime

  // -------------------------------------------------------------------------
  // Persistir Histórico na collection sincronizacao_historico
  // -------------------------------------------------------------------------
  let historicoId = null
  try {
    const colHist = $app.findCollectionByNameOrId('sincronizacao_historico')
    const recHist = new Record(colHist)
    recHist.set('fontes_executadas', JSON.stringify(fontesPermitidas))
    recHist.set('auto_inclusao', autoCadastrar)
    recHist.set('total_baixado', totalBaixadoGeral)
    recHist.set('novos_cadastrados', novosCadastradosGeral)
    recHist.set('atualizados', atualizadosGeral)
    recHist.set('ignorados_duplicidade', ignoradosDuplicidadeGeral)
    recHist.set('detalhes_fontes', JSON.stringify(detalhesFontes))
    recHist.set('duracao_ms', duracaoMs)
    const algumSucesso = detalhesFontes.some((d) => d.status === 'concluido')
    const todasFalharam = detalhesFontes.every((d) => d.status === 'indisponivel')
    recHist.set(
      'status_geral',
      todasFalharam ? 'falha_total' : algumSucesso ? 'concluido' : 'parcial',
    )
    $app.save(recHist)
    historicoId = recHist.id
  } catch (histErr) {
    console.log('Aviso ao persistir sincronizacao_historico:', histErr.message)
  }

  return e.json(200, {
    sucesso: true,
    historico_id: historicoId,
    duracao_ms: duracaoMs,
    auto_inclusao: autoCadastrar,
    resumo: {
      total_baixado: totalBaixadoGeral,
      novos_cadastrados: novosCadastradosGeral,
      atualizados: atualizadosGeral,
      ignorados_duplicidade: ignoradosDuplicidadeGeral,
    },
    fontes: detalhesFontes,
    amostra_produtos: produtosAmostraProcessados,
  })
})
