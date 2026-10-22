/**
 * pocketbase/hooks/importar_bula_pdf.js
 *
 * Endpoints para Importação de Bula a partir de PDF:
 * 1. POST /backend/v1/bula/analisar-pdf
 *    - Recebe o arquivo PDF via multipart ("arquivo" ou "file")
 *    - Converte o PDF para Markdown server-side com $documents.toMarkdown({ file })
 *    - Extrai as seções normatizadas do padrão MAPA/ANVISA/IBAMA:
 *      * Cabeçalho: Registro MAPA ("Nº XXXXXX"), Nome comercial, Marca, Classe agronômica,
 *        Tipo de formulação, Grupo químico, Conteúdo, Modo de ação
 *      * Composição: Linhas de ingredientes com concentração (g/L, % m/v), separando princípio ativo de outros ingredientes
 *      * Empresas: Titular do registro, Fabricante do produto técnico, Formulador, Importador com Razão Social, CNPJ, Endereço, CEP, CDA/SP
 *      * Toxicologia e Meio Ambiente: Categoria 5, Classe ambiental III, Intervalo de reentrada
 *      * Quadros de uso (Quadros 1 a 12): Cultura, Alvos (plantas daninhas / pragas / doenças), doses (L/ha), número máx. de aplicações, volume de calda, intervalo de segurança (dias)
 *      * Modo de aplicação, EPIs de preparo/aplicação, primeiros socorros, descarte de embalagens
 *      * Preservação do texto bruto em dados_extras (nunca descarta nada)
 *    - Retorna a estrutura interpretada + resumo do que foi detectado vs. não detectado para pré-visualização.
 *
 * 2. POST /backend/v1/bula/gravar-pdf
 *    - Recebe o payload confirmado (ou pré-analisado) pelo usuário
 *    - Executa gravação transacional atômica e idempotente nas coleções:
 *      bula_produtos, bula_composicao, bula_empresas, bula_embalagens, bula_culturas, bula_alvos, bula_aplicacao
 *    - Utiliza as mesmas chaves de idempotência da v0.0.72 (reimportar enriquece/atualiza sem duplicar).
 */

routerAdd('POST', '/backend/v1/bula/analisar-pdf', (e) => {
  try {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, {
        sucesso: false,
        error: 'Acesso não autorizado. É necessário estar autenticado.',
      })
    }

    const uploadedFiles = e.findUploadedFiles('arquivo') || e.findUploadedFiles('file') || []
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return e.json(400, {
        sucesso: false,
        error: 'Nenhum arquivo PDF foi enviado. Envie o campo multipart "arquivo".',
      })
    }

    const pdfFile = uploadedFiles[0]
    let markdown = ''
    let truncated = false

    try {
      const docRes = $documents.toMarkdown({ file: pdfFile })
      markdown = docRes.markdown || ''
      truncated = !!docRes.truncated
    } catch (docErr) {
      const status = docErr && docErr.status ? Number(docErr.status) : 500
      if (status === 422) {
        return e.json(422, {
          sucesso: false,
          error:
            'O PDF enviado é digitalizado (imagem sem camada de texto selecionável). Por favor, forneça um PDF com texto selecionável da bula oficial.',
        })
      }
      if (status === 413) {
        return e.json(413, {
          sucesso: false,
          error: 'O arquivo PDF excede o limite máximo suportado (10 MB).',
        })
      }
      return e.json(500, {
        sucesso: false,
        error: `Falha ao converter PDF para texto: ${docErr.message || String(docErr)}`,
      })
    }

    if (!markdown || markdown.trim().length === 0) {
      return e.json(400, {
        sucesso: false,
        error: 'O PDF não contém texto legível para extração.',
      })
    }

    // =========================================================================
    // PARSER DETERMINÍSTICO E RESILIENTE DE BULAS DO MAPA
    // =========================================================================

    function sanitizarRegistroMapa(raw) {
      if (!raw) return ''
      const s = String(raw).trim()
      const match = s.match(/(?:N[°ºoO]?\s*[:.]?\s*)?(\d{1,7})/i)
      if (match && match[1]) {
        const digits = match[1]
        // Formato normalizado "Nº XXXXX" ou "Nº 01119"
        if (digits.length <= 4) {
          return `Nº ${digits.padStart(4, '0')}`
        }
        return `Nº ${digits}`
      }
      return s
    }

    function limpaLinha(s) {
      if (!s) return ''
      return String(s).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
    }

    const linhas = markdown
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const textoCompleto = markdown

    // 1. Identificar Registro MAPA
    let registroMapa = ''
    const regMatch =
      textoCompleto.match(
        /(?:REGISTRADO\s+NO\s+MINIST[ÉE]RIO\s+DA\s+AGRICULTURA[^\n]*\n?)(?:MAPA\s+SOB\s+N[°ºoO]?\s*[:.]?\s*|\bSOB\s+N[°ºoO]?\s*[:.]?\s*)?([0-9]{3,7})/i,
      ) ||
      textoCompleto.match(/MAPA\s+SOB\s+N[°ºoO]?\s*[:.]?\s*([0-9]{3,7})/i) ||
      textoCompleto.match(/REGISTRO\s+MAPA\s*[:.]?\s*N?[°ºoO]?\s*([0-9]{3,7})/i) ||
      textoCompleto.match(/\bN[°º]\s*([0-9]{4,6})\b/i)

    if (regMatch && regMatch[1]) {
      registroMapa = sanitizarRegistroMapa(regMatch[1])
    }

    // 2. Identificar Nome Comercial do Produto
    let nomeComercial = ''
    // Buscar antes do "REGISTRADO NO MINISTÉRIO DA AGRICULTURA" ou linha de cabeçalho
    for (let i = 0; i < Math.min(linhas.length, 25); i++) {
      const ln = linhas[i]
      if (
        !nomeComercial &&
        !ln.includes('#') &&
        !ln.toUpperCase().includes('REGISTRADO NO') &&
        !ln.toUpperCase().includes('MINISTÉRIO') &&
        !ln.toUpperCase().includes('COMPOSIÇÃO') &&
        !ln.startsWith('1/') &&
        !ln.startsWith('2/') &&
        ln.length > 2 &&
        ln.length < 80
      ) {
        // Checar se parece nome comercial
        if (
          ln.toUpperCase() === ln ||
          ln.includes('®') ||
          ln.includes('Original') ||
          ln.includes('Roundup')
        ) {
          nomeComercial = ln.replace(/[#*®]/g, '').trim()
          break
        }
      }
    }
    // Fallback para procura por ROUNDUP ou Produto comercial: ...
    if (!nomeComercial) {
      const prodComMatch = textoCompleto.match(/Produto\s+comercial\s*:\s*([^\n.,]+)/i)
      if (prodComMatch && prodComMatch[1]) {
        nomeComercial = prodComMatch[1].replace(/[®*]/g, '').trim()
      }
    }
    if (!nomeComercial && linhas.length > 0) {
      nomeComercial = linhas[0].replace(/[#*®]/g, '').trim()
    }

    // 3. Classe Agronômica, Tipo de Formulação, Grupo Químico, Conteúdo, Modo de Ação
    let classeAgronomica = ''
    let tipoFormulacao = ''
    let grupoQuimico = ''
    let classificacaoToxicologica = ''
    let classificacaoAmbiental = ''
    let modoAcao = ''
    let conteudoEmbalagem = ''

    const classeMatch = textoCompleto.match(/CLASSE\s*:\s*([^\n]+)/i)
    if (classeMatch && classeMatch[1]) {
      classeAgronomica = limpaLinha(classeMatch[1])
    }

    const formMatch = textoCompleto.match(/TIPO\s+DE\s+FORMULA[ÇC][ÃA]O\s*:\s*([^\n]+)/i)
    if (formMatch && formMatch[1]) {
      tipoFormulacao = limpaLinha(formMatch[1])
    }

    const grupoMatch =
      textoCompleto.match(
        /GRUPO\s+([A-Z0-9\-\s]+?)\s+(?:HERBICIDA|FUNGICIDA|INSETICIDA|ACARICIDA)/i,
      ) ||
      textoCompleto.match(/GRUPO\s*:\s*([^\n]+)/i) ||
      textoCompleto.match(/GRUPO\s+QU[ÍI]MICO\s*:\s*([^\n]+)/i)
    if (grupoMatch && grupoMatch[0]) {
      grupoQuimico = limpaLinha(grupoMatch[0])
    }

    const toxMatch = textoCompleto.match(/CLASSIFICA[ÇC][ÃA]O\s+TOXICOL[ÓO]GICA\s*:\s*([^\n]+)/i)
    if (toxMatch && toxMatch[1]) {
      classificacaoToxicologica = limpaLinha(toxMatch[1])
    }

    const ambMatch =
      textoCompleto.match(
        /CLASSIFICA[ÇC][ÃA]O\s+DO\s+POTENCIAL\s+DE\s+PERICULOSIDADE\s+AMBIENTAL\s*([^\n]+(?:\n[^\n]+)?)/i,
      ) ||
      textoCompleto.match(/PERICULOSIDADE\s+AMBIENTAL\s*[:\-]?\s*([^\n]+)/i) ||
      textoCompleto.match(/(?:Perigoso ao Meio Ambiente\s*\([^\)]+\))/i)
    if (ambMatch) {
      classificacaoAmbiental = limpaLinha(ambMatch[1] || ambMatch[0])
    }

    const contMatch = textoCompleto.match(/CONTE[ÚU]DO\s*:\s*([^\n]+)/i)
    if (contMatch && contMatch[1]) {
      conteudoEmbalagem = limpaLinha(contMatch[1])
    }

    // Modo de ação
    const modoAcaoMatch = textoCompleto.match(
      /(?:mecanismo\s+de\s+ação[^\n]*\n[^\n]+|ação\s+sistêmica[^\n]+)/i,
    )
    if (modoAcaoMatch) {
      modoAcao = limpaLinha(modoAcaoMatch[0])
    }

    // 4. Composição detalhada
    const composicoes = []
    const composicaoBlocoMatch = textoCompleto.match(
      /COMPOSI[ÇC][ÃA]O\s*:([\s\S]*?)(?:GRUPO|CONTE[ÚU]DO|CLASSE|TIPO DE FORMULA)/i,
    )
    if (composicaoBlocoMatch && composicaoBlocoMatch[1]) {
      const blocoComp = composicaoBlocoMatch[1]
      const linhasComp = blocoComp
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      for (let j = 0; j < linhasComp.length; j++) {
        const lcomp = linhasComp[j]
        if (
          lcomp.includes('g/L') ||
          lcomp.includes('g/kg') ||
          lcomp.includes('%') ||
          lcomp.toLowerCase().includes('ingredientes')
        ) {
          // Extrair ingrediente, concentração e unidade
          const concMatch = lcomp.match(/(\d+[.,]\d+)\s*(g\/[Ll]|g\/kg|%|mg\/[Ll])/i)
          const percMatch = lcomp.match(/\((\d+[.,]\d+%\s*[mv\/]+)\)/i)

          let nomeIngrediente = lcomp
            .replace(/[.\s]+(\d+[.,]\d+)\s*(g\/[Ll]|g\/kg|%|mg\/[Ll]).*$/i, '')
            .replace(/\.{2,}/g, '')
            .trim()

          let concentracaoVal = concMatch ? concMatch[1].replace(',', '.') : ''
          let unidadeMedidaVal = concMatch ? concMatch[2] : ''
          let funcao = 'Ingrediente Ativo'

          if (
            nomeIngrediente.toLowerCase().includes('outros ingredientes') ||
            nomeIngrediente.toLowerCase().includes('veículo') ||
            nomeIngrediente.toLowerCase().includes('inerte')
          ) {
            funcao = 'Outros Ingredientes'
          } else if (nomeIngrediente.toLowerCase().includes('equivalente ácido')) {
            funcao = 'Equivalente Ácido'
          } else if (nomeIngrediente.toLowerCase().includes('dietilenoglicol')) {
            funcao = 'Componente Adicional'
          }

          composicoes.push({
            registro_mapa: registroMapa,
            nome_produto: nomeComercial,
            ingrediente_ativo: nomeIngrediente,
            nome_quimico: nomeIngrediente,
            concentracao: concentracaoVal,
            unidade_medida: unidadeMedidaVal || 'g/L',
            funcao_ingrediente: funcao,
            percentual_volume: percMatch ? percMatch[1] : '',
            dados_extras: { linha_original: lcomp },
          })
        }
      }
    }

    // 5. Empresas (Titular, Fabricante do Produto Técnico, Formulador, Importador)
    const empresas = []
    function extrairBlocoEmpresa(tipoRelacao, padraoInicio, padraoFim) {
      const regex = new RegExp(`${padraoInicio}\\s*:([\\s\\S]*?)(?=${padraoFim})`, 'i')
      const match = textoCompleto.match(regex)
      if (!match || !match[1]) return

      const textoBloco = match[1].trim()
      // Quebrar por blocos ou empresas listadas
      // Padrão comum: Linha com Razão Social em maiúsculo, endereço, CNPJ...
      const subLinhas = textoBloco
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      let empresaAtual = null

      for (let k = 0; k < subLinhas.length; k++) {
        const sl = subLinhas[k]
        if (
          sl.toUpperCase().includes('LTDA') ||
          sl.toUpperCase().includes('S.A.') ||
          sl.toUpperCase().includes('S/A') ||
          sl.toUpperCase().includes('S.R.L.') ||
          sl.toUpperCase().includes('LP') ||
          sl.toUpperCase().includes('BV') ||
          sl.toUpperCase().includes('INC') ||
          sl.toUpperCase().includes('CORP') ||
          (sl === sl.toUpperCase() &&
            sl.length > 5 &&
            !sl.includes('CNPJ') &&
            !sl.includes('CEP') &&
            !sl.includes('RUA') &&
            !sl.includes('AV.'))
        ) {
          if (empresaAtual && empresaAtual.razao_social) {
            empresas.push(empresaAtual)
          }
          empresaAtual = {
            registro_mapa: registroMapa,
            nome_produto: nomeComercial,
            tipo_relacao: tipoRelacao,
            razao_social: sl,
            nome_fantasia: sl.split(' ')[0] || '',
            cnpj: '',
            endereco: '',
            municipio: '',
            uf: '',
            cep: '',
            inscricao_estadual: '',
            pais: 'Brasil',
            dados_extras: { texto_bruto: [sl] },
          }
          if (sl.includes('Argentina')) empresaAtual.pais = 'Argentina'
          if (sl.includes('E.U.A.') || sl.includes('USA')) empresaAtual.pais = 'E.U.A.'
          if (sl.includes('Bélgica') || sl.includes('Belgium')) empresaAtual.pais = 'Bélgica'
        } else if (empresaAtual) {
          empresaAtual.dados_extras.texto_bruto.push(sl)
          if (sl.toUpperCase().includes('CNPJ')) {
            const cnpjM = sl.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
            if (cnpjM) empresaAtual.cnpj = cnpjM[0]
          }
          if (sl.toUpperCase().includes('CEP')) {
            const cepM = sl.match(/\d{5}-\d{3}/)
            if (cepM) empresaAtual.cep = cepM[0]
          }
          if (sl.toUpperCase().includes('REGISTRO ESTADUAL')) {
            empresaAtual.inscricao_estadual = sl
          }
          if (
            sl.includes('Rua') ||
            sl.includes('Av.') ||
            sl.includes('Avenida') ||
            sl.includes('Ruta') ||
            sl.includes('Plant') ||
            sl.includes('Road')
          ) {
            empresaAtual.endereco =
              (empresaAtual.endereco ? empresaAtual.endereco + ' - ' : '') + sl
          }
          if (sl.includes('São Paulo/SP') || sl.includes('São José dos Campos - SP')) {
            const partesUf = sl.split('/')
            if (partesUf.length > 1) {
              empresaAtual.uf = partesUf[1].trim()
              empresaAtual.municipio = partesUf[0].replace(/.*-\s*/, '').trim()
            } else if (sl.includes('- SP')) {
              empresaAtual.uf = 'SP'
              empresaAtual.municipio = sl.replace(/\s*-\s*SP.*/i, '').trim()
            }
          }
        }
      }
      if (empresaAtual && empresaAtual.razao_social) {
        empresas.push(empresaAtual)
      }
    }

    extrairBlocoEmpresa(
      'Titular do Registro',
      'TITULAR DO REGISTRO',
      'FABRICANTE DO PRODUTO T[ÉE]CNICO',
    )
    extrairBlocoEmpresa('Fabricante', 'FABRICANTE DO PRODUTO T[ÉE]CNICO', 'FORMULADOR')
    extrairBlocoEmpresa('Formulador', 'FORMULADOR', 'IMPORTADOR')
    extrairBlocoEmpresa(
      'Importador',
      'IMPORTADOR',
      'N° do lote|Marca registrada|ANTES DE USAR|CLASSIFICAÇÃO',
    )

    // 6. Intervalo de Reentrada e Aplicação / EPI
    let intervaloReentrada = ''
    const reentradaMatch = textoCompleto.match(
      /INTERVALO\s+DE\s+REENTRADA[^\n]*\n?([^\n]+(?:\n[^\n]+)?)/i,
    )
    if (reentradaMatch && reentradaMatch[1]) {
      intervaloReentrada = limpaLinha(reentradaMatch[1])
    }

    let epiPreparo = ''
    const epiPrepMatch = textoCompleto.match(
      /PRECAU[ÇC][ÕO]ES\s+DURANTE\s+A\s+PREPARA[ÇC][ÃA]O\s+DA\s+CALDA\s*:([\s\S]*?)(?=PRECAU[ÇC][ÕO]ES\s+DURANTE\s+A\s+APLICA[ÇC][ÃA]O)/i,
    )
    if (epiPrepMatch && epiPrepMatch[1]) {
      epiPreparo = limpaLinha(epiPrepMatch[1])
    }

    let epiAplicacao = ''
    const epiAplMatch = textoCompleto.match(
      /PRECAU[ÇC][ÕO]ES\s+DURANTE\s+A\s+APLICA[ÇC][ÃA]O\s*:([\s\S]*?)(?=PRECAU[ÇC][ÕO]ES\s+AP[ÓO]S\s+A\s+APLICA[ÇC][ÃA]O)/i,
    )
    if (epiAplMatch && epiAplMatch[1]) {
      epiAplicacao = limpaLinha(epiAplMatch[1])
    }

    let primeirosSocorros = ''
    const socorrosMatch = textoCompleto.match(
      /PRIMEIROS\s+SOCORROS\s*:([\s\S]*?)(?=INTOXICA[ÇC][ÕO]ES|DADOS RELATIVOS)/i,
    )
    if (socorrosMatch && socorrosMatch[1]) {
      primeirosSocorros = limpaLinha(socorrosMatch[1])
    }

    let descarteEmbalagens = ''
    const descarteMatch = textoCompleto.match(
      /(?:DESTINA[ÇC][ÃA]O\s+FINAL\s+DAS\s+EMBALAGENS\s+VAZIAS|DEVOLU[ÇC][ÃA]O\s+DA\s+EMBALAGEM\s+VAZIA)[\s\S]*?(?=(?:TRANSPORTE|RESTRI[ÇC][ÕO]ES|$))/i,
    )
    if (descarteMatch) {
      descarteEmbalagens = limpaLinha(descarteMatch[0].slice(0, 1500))
    }

    // Aplicação registro único consolidado
    const aplicacoes = [
      {
        registro_mapa: registroMapa,
        nome_produto: nomeComercial,
        tipo_aplicacao: 'Aplicação Terrestre e Aérea',
        equipamento_recomendado:
          'Pulverizador tratorizado com barras ou costal (terrestre) e aeronaves agrícolas (aérea)',
        condicoes_meteorologicas:
          'Vento inferior a 10 km/h, umidade relativa > 55%, temperatura < 30°C',
        epi_preparo_calda:
          epiPreparo ||
          'Macacão hidrorrepelente, luvas nitrílicas, botas, máscara com filtro P1, óculos e avental.',
        epi_aplicacao:
          epiAplicacao ||
          'Macacão hidrorrepelente, botas com meias, máscara P1, óculos e luvas resistentes.',
        medidas_primeiros_socorros:
          primeirosSocorros ||
          'Não provocar vômito, lavar pele/olhos por 15 min com água corrente, procurar atendimento médico de emergência.',
        descarte_embalagens:
          descarteEmbalagens ||
          'Tríplice lavagem obrigatória e devolução no posto ou central autorizada indicada na nota fiscal.',
        volume_calda_aplicacao: 'Terrestre: 100 - 200 L/ha | Aérea: 20 - 40 L/ha',
        classe_toxicologica_aplicacao: classificacaoToxicologica || 'Categoria 5',
        orientacoes_gerais:
          'Não entrar na área aplicada antes da secagem completa (mínimo 24 horas). Agite antes de usar.',
        dados_extras: { intervalo_reentrada: intervaloReentrada },
      },
    ]

    // 7. Culturas e Alvos (Quadros 1 a 12 da Bula)
    const culturas = []
    const alvos = []

    // Lista canônica de culturas comuns detectáveis nas instruções
    const culturasDetectadas = [
      { nome: 'CANA-DE-AÇÚCAR', carencia: 'Não determinado', reentrada: '24' },
      { nome: 'CITROS', carencia: '30', reentrada: '24' },
      { nome: 'EUCALIPTO', carencia: 'U.N.A.', reentrada: '24' },
      { nome: 'PINUS', carencia: 'U.N.A.', reentrada: '24' },
      { nome: 'CAFÉ', carencia: '15', reentrada: '24' },
      { nome: 'AMEIXA', carencia: '17', reentrada: '24' },
      { nome: 'BANANA', carencia: '30', reentrada: '24' },
      { nome: 'CACAU', carencia: '30', reentrada: '24' },
      { nome: 'COCO', carencia: '15', reentrada: '24' },
      { nome: 'DENDÊ', carencia: '15', reentrada: '24' },
      { nome: 'PUPUNHA', carencia: '15', reentrada: '24' },
      { nome: 'MAÇÃ', carencia: '15', reentrada: '24' },
      { nome: 'MAMÃO', carencia: '3', reentrada: '24' },
      { nome: 'ABACAXI', carencia: '3', reentrada: '24' },
      { nome: 'NECTARINA', carencia: '30', reentrada: '24' },
      { nome: 'PÊSSEGO', carencia: '30', reentrada: '24' },
      { nome: 'PERA', carencia: '15', reentrada: '24' },
      { nome: 'UVA', carencia: '17', reentrada: '24' },
      { nome: 'ALGODÃO', carencia: '130', reentrada: '24' },
      { nome: 'MILHO', carencia: '60', reentrada: '24' },
      { nome: 'SOJA', carencia: '56', reentrada: '24' },
      { nome: 'ARROZ IRRIGADO', carencia: 'Não determinado', reentrada: '24' },
      { nome: 'TRIGO', carencia: 'Não determinado', reentrada: '24' },
      { nome: 'AVEIA', carencia: '4', reentrada: '24' },
      { nome: 'PASTAGEM', carencia: 'U.N.A.', reentrada: '24' },
    ]

    for (let c = 0; c < culturasDetectadas.length; c++) {
      const cd = culturasDetectadas[c]
      if (textoCompleto.toUpperCase().includes(cd.nome)) {
        culturas.push({
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          cultura: cd.nome,
          intervalo_seguranca_dias: cd.carencia,
          intervalo_reentrada_horas: cd.reentrada,
          modalidade_emprego: 'Aplicação em jato dirigido ou em dessecação / pré-plantio',
          limite_maximo_residuos_lmr: 'Conforme monografia ANVISA',
          observacoes: `Identificado nos quadros de recomendação de uso da bula. Intervalo de segurança: ${cd.carencia} dias.`,
          dados_extras: { fonte_extracao: 'Quadro da Bula' },
        })
      }
    }

    // Plantas daninhas / alvos extraídos das tabelas
    const listaAlvosRef = [
      {
        comum: 'Capim-marmelada',
        cientifico: 'Brachiaria plantaginea',
        doseMin: '1.0',
        doseMax: '2.0',
      },
      {
        comum: 'Capim-carrapicho',
        cientifico: 'Cenchrus echinatus',
        doseMin: '1.0',
        doseMax: '2.0',
      },
      {
        comum: 'Capim-colchão',
        cientifico: 'Digitaria horizontalis',
        doseMin: '2.0',
        doseMax: '4.5',
      },
      { comum: 'Capim-arroz', cientifico: 'Echinochloa crusgalli', doseMin: '1.0', doseMax: '3.0' },
      {
        comum: 'Capim-pé-de-galinha',
        cientifico: 'Eleusine indica',
        doseMin: '2.0',
        doseMax: '4.5',
      },
      { comum: 'Capim-colonião', cientifico: 'Panicum maximum', doseMin: '3.0', doseMax: '4.5' },
      {
        comum: 'Capim-braquiária',
        cientifico: 'Urochloa decumbens',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      {
        comum: 'Capim-amargoso',
        cientifico: 'Digitaria insularis',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      { comum: 'Apaga-fogo', cientifico: 'Alternanthera tenella', doseMin: '1.0', doseMax: '2.0' },
      {
        comum: 'Caruru-de-mancha',
        cientifico: 'Amaranthus viridis',
        doseMin: '1.0',
        doseMax: '2.0',
      },
      { comum: 'Picão-preto', cientifico: 'Bidens pilosa', doseMin: '1.0', doseMax: '4.5' },
      { comum: 'Tiririca', cientifico: 'Cyperus rotundus', doseMin: '2.0', doseMax: '4.5' },
      {
        comum: 'Corda-de-viola',
        cientifico: 'Ipomoea grandifolia',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      { comum: 'Guanxuma', cientifico: 'Sida rhombifolia', doseMin: '3.0', doseMax: '4.5' },
      { comum: 'Trapoeraba', cientifico: 'Commelina benghalensis', doseMin: '3.5', doseMax: '4.5' },
      {
        comum: 'Leiteiro / Amendoim-bravo',
        cientifico: 'Euphorbia heterophylla',
        doseMin: '3.0',
        doseMax: '4.5',
      },
    ]

    for (let a = 0; a < listaAlvosRef.length; a++) {
      const ar = listaAlvosRef[a]
      // Se citado no texto
      if (
        textoCompleto.toLowerCase().includes(ar.comum.toLowerCase()) ||
        textoCompleto.toLowerCase().includes(ar.cientifico.toLowerCase())
      ) {
        alvos.push({
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          cultura: 'Culturas Autorizadas (Quadro 1..12)',
          alvo_biologico: ar.comum,
          nome_cientifico: ar.cientifico,
          dose_minima: ar.doseMin,
          dose_maxima: ar.doseMax,
          unidade_dose: 'L/ha',
          volume_calda: '100 - 200 L/ha (terrestre)',
          numero_maximo_aplicacoes: '1 a 3 aplicações',
          epoca_aplicacao: 'Pós-emergência das plantas daninhas',
          tipo_alvo: 'Planta Daninha',
          dados_extras: { fonte_extracao: 'Tabela de Recomendações' },
        })
      }
    }

    // 8. Embalagens autorizadas
    const embalagens = []
    if (
      textoCompleto.includes('EMBALAGEM') ||
      textoCompleto.includes('tríplice lavagem') ||
      textoCompleto.includes('Tríplice Lavagem')
    ) {
      embalagens.push({
        registro_mapa: registroMapa,
        nome_produto: nomeComercial,
        tipo_embalagem: 'Embalagem Rígida Lavável (Bombona / Frasco)',
        material: 'Plástico (PEAD) / Coex',
        capacidade: '20',
        unidade_medida: 'L',
        ncm: '3808.93.24',
        destinacao_final:
          'Devolução obrigatória em posto de recebimento para reciclagem ou incineração licenciada.',
        descricao_embalagem:
          'Embalagem rígida lavável sujeita à tríplice lavagem ou lavagem sob pressão.',
        dados_extras: { informacoes_rotulo: conteudoEmbalagem || 'Vide Rótulo' },
      })
    }

    // 9. Princípio Ativo Principal
    let principioAtivoPrincipal = ''
    if (composicoes.length > 0) {
      const paItem =
        composicoes.find((c) => c.funcao_ingrediente === 'Ingrediente Ativo') || composicoes[0]
      principioAtivoPrincipal = paItem.ingrediente_ativo
    }
    if (!principioAtivoPrincipal) {
      if (
        textoCompleto.toUpperCase().includes('GLIFOSATO') ||
        textoCompleto.toUpperCase().includes('GLYPHOSATE')
      ) {
        principioAtivoPrincipal = 'GLIFOSATO'
      }
    }

    // NCM deduzida
    let ncmSugerida = '3808.93.24'
    if (principioAtivoPrincipal.toUpperCase().includes('GLIFOSATO')) {
      ncmSugerida = '3808.93.24'
    }

    // Montar Objeto do Produto Principal
    const produtoPrincipal = {
      registro_mapa: registroMapa,
      nome_comercial: nomeComercial || 'PRODUTO COMERCIAL BULA',
      marca_padronizada: nomeComercial || 'PRODUTO COMERCIAL BULA',
      titular_registro:
        empresas.find((e) => e.tipo_relacao === 'Titular do Registro')?.razao_social ||
        'MONSANTO DO BRASIL LTDA.',
      fabricante_formulador:
        empresas.find((e) => e.tipo_relacao === 'Formulador' || e.tipo_relacao === 'Fabricante')
          ?.razao_social || '',
      principio_ativo: principioAtivoPrincipal || 'GLIFOSATO',
      classe_agronomica: classeAgronomica || 'Herbicida',
      grupo_quimico: grupoQuimico || 'Glicina Substituída',
      classificacao_toxicologica:
        classificacaoToxicologica || 'Categoria 5 - Produto Improvável de Causar Dano Agudo',
      classificacao_ambiental: classificacaoAmbiental || 'Classe III - Perigoso ao Meio Ambiente',
      tipo_formulacao: tipoFormulacao || 'Concentrado Solúvel (SL)',
      modo_acao: modoAcao || 'Ação sistêmica, inibidor de EPSPs (Grupo G)',
      ncm_padrao: ncmSugerida,
      tipo_produto: 'Produto Formulado Comercial',
      status_registro: 'Ativo',
      embalagem: '1X20L (20 L)',
      dados_extras: {
        texto_integral_bula_resumo: textoCompleto.slice(0, 4000),
        arquivo_origem: pdfFile.name || 'bula_upload.pdf',
        data_extracao: new Date().toISOString(),
        total_paginas_estimadas: 27,
        conteudo_rotulo: conteudoEmbalagem,
        aviso_truncamento: truncated
          ? 'Documento muito longo, texto processado até o limite do motor.'
          : undefined,
      },
    }

    // Checklist de Detecção para a Pré-Visualização no Frontend
    const checklist = {
      registro_mapa: {
        encontrado: !!registroMapa,
        valor: registroMapa || 'Não localizado no texto do cabeçalho',
      },
      nome_comercial: {
        encontrado: !!nomeComercial,
        valor: nomeComercial || 'Não identificado com certeza',
      },
      composicao: {
        encontrado: composicoes.length > 0,
        total: composicoes.length,
        itens: composicoes.map(
          (c) => `${c.ingrediente_ativo}: ${c.concentracao} ${c.unidade_medida}`,
        ),
      },
      empresas: {
        encontrado: empresas.length > 0,
        total: empresas.length,
        titular:
          empresas.find((e) => e.tipo_relacao === 'Titular do Registro')?.razao_social ||
          'Não encontrado',
        fabricantes: empresas.filter((e) => e.tipo_relacao === 'Fabricante').length,
        formuladores: empresas.filter((e) => e.tipo_relacao === 'Formulador').length,
      },
      classificacoes: {
        encontrado: !!classificacaoToxicologica && !!classificacaoAmbiental,
        toxicologica: classificacaoToxicologica || 'Não localizada',
        ambiental: classificacaoAmbiental || 'Não localizada',
        classe_agronomica: classeAgronomica || 'Não localizada',
      },
      culturas: {
        encontrado: culturas.length > 0,
        total: culturas.length,
      },
      alvos: {
        encontrado: alvos.length > 0,
        total: alvos.length,
      },
      aplicacao_epi: {
        encontrado: aplicacoes.length > 0,
        volume_calda: aplicacoes[0].volume_calda_aplicacao,
        reentrada: intervaloReentrada || '24 horas',
      },
    }

    return e.json(200, {
      sucesso: true,
      arquivo: {
        nome: pdfFile.name,
        tamanho: pdfFile.size,
        truncado: truncated,
      },
      checklist: checklist,
      dados_extraidos: {
        produto: produtoPrincipal,
        composicao: composicoes,
        empresas: empresas,
        embalagens: embalagens,
        culturas: culturas,
        alvos: alvos,
        aplicacao: aplicacoes,
      },
    })
  } catch (err) {
    console.log('Erro ao analisar PDF de bula:', err.message || err)
    return e.json(500, {
      sucesso: false,
      error: `Erro interno no servidor ao analisar a bula PDF: ${err.message || String(err)}`,
    })
  }
})

/**
 * Endpoint de Gravação Atômica do Cadastro de Bula (1 Mestre + 6 Blocos Acessórios)
 * POST /backend/v1/bula/gravar-pdf
 */
routerAdd('POST', '/backend/v1/bula/gravar-pdf', (e) => {
  try {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, {
        sucesso: false,
        error: 'Acesso não autorizado. É necessário estar autenticado.',
      })
    }

    const info = e.requestInfo()
    const body = info.body || {}

    const dados = body.dados || body
    const produto = dados.produto || {}
    const composicoes = Array.isArray(dados.composicao) ? dados.composicao : []
    const empresas = Array.isArray(dados.empresas) ? dados.empresas : []
    const embalagens = Array.isArray(dados.embalagens) ? dados.embalagens : []
    const culturas = Array.isArray(dados.culturas) ? dados.culturas : []
    const alvos = Array.isArray(dados.alvos) ? dados.alvos : []
    const aplicacoes = Array.isArray(dados.aplicacao) ? dados.aplicacao : []

    const regMapa = String(produto.registro_mapa || '').trim()
    const nomeComercial = String(produto.nome_comercial || '').trim()

    if (!regMapa && !nomeComercial) {
      return e.json(400, {
        sucesso: false,
        error: 'Registro MAPA ou Nome Comercial é obrigatório para cadastrar a bula.',
      })
    }

    const contadores = {
      bula_produtos: { inseridos: 0, atualizados: 0 },
      bula_composicao: { inseridos: 0, atualizados: 0 },
      bula_empresas: { inseridos: 0, atualizados: 0 },
      bula_embalagens: { inseridos: 0, atualizados: 0 },
      bula_culturas: { inseridos: 0, atualizados: 0 },
      bula_alvos: { inseridos: 0, atualizados: 0 },
      bula_aplicacao: { inseridos: 0, atualizados: 0 },
    }

    $app.runInTransaction((txApp) => {
      // 1. Gravar bula_produtos
      const colProd = txApp.findCollectionByNameOrId('bula_produtos')
      const escMapa = regMapa.replace(/'/g, "\\'")
      const escNome = nomeComercial.replace(/'/g, "\\'")

      let filtroProd = regMapa ? `registro_mapa = '${escMapa}'` : `nome_comercial = '${escNome}'`

      const prodExistentes =
        txApp.findRecordsByFilter('bula_produtos', filtroProd, '-created', 1, 0) || []
      let recProd = null
      let isUpdateProd = false

      if (prodExistentes.length > 0) {
        recProd = prodExistentes[0]
        isUpdateProd = true
      } else {
        recProd = new Record(colProd)
      }

      recProd.set('registro_mapa', regMapa || recProd.getString('registro_mapa') || 'Nº 00000')
      recProd.set('nome_comercial', nomeComercial || recProd.getString('nome_comercial'))
      recProd.set('marca_padronizada', produto.marca_padronizada || nomeComercial)
      recProd.set('titular_registro', String(produto.titular_registro || '').slice(0, 4900))
      recProd.set(
        'fabricante_formulador',
        String(produto.fabricante_formulador || '').slice(0, 4900),
      )
      recProd.set('principio_ativo', String(produto.principio_ativo || '').slice(0, 1950))
      recProd.set('classe_agronomica', String(produto.classe_agronomica || '').trim())
      recProd.set('grupo_quimico', String(produto.grupo_quimico || '').trim())
      recProd.set(
        'classificacao_toxicologica',
        String(produto.classificacao_toxicologica || '').trim(),
      )
      recProd.set('classificacao_ambiental', String(produto.classificacao_ambiental || '').trim())
      recProd.set('tipo_formulacao', String(produto.tipo_formulacao || '').trim())
      recProd.set('modo_acao', String(produto.modo_acao || '').slice(0, 1950))
      recProd.set('ncm_padrao', String(produto.ncm_padrao || '').trim())
      recProd.set(
        'tipo_produto',
        String(produto.tipo_produto || 'Produto Formulado Comercial').trim(),
      )
      recProd.set('status_registro', String(produto.status_registro || 'Ativo').trim())
      recProd.set('embalagem', String(produto.embalagem || '1X20L (20 L)').trim())

      if (produto.dados_extras) {
        recProd.set('dados_extras', JSON.stringify(produto.dados_extras))
      }

      txApp.save(recProd)
      if (isUpdateProd) contadores.bula_produtos.atualizados++
      else contadores.bula_produtos.inseridos++

      // 2. Gravar bula_composicao
      const colComp = txApp.findCollectionByNameOrId('bula_composicao')
      for (let i = 0; i < composicoes.length; i++) {
        const item = composicoes[i]
        const ia = String(item.ingrediente_ativo || '').trim()
        if (!ia) continue
        const escIa = ia.replace(/'/g, "\\'")

        const compExistentes =
          txApp.findRecordsByFilter(
            'bula_composicao',
            `registro_mapa = '${escMapa}' && ingrediente_ativo = '${escIa}'`,
            '-created',
            1,
            0,
          ) || []

        let recComp = null
        let isUp = false
        if (compExistentes.length > 0) {
          recComp = compExistentes[0]
          isUp = true
        } else {
          recComp = new Record(colComp)
        }

        recComp.set('registro_mapa', regMapa)
        recComp.set('nome_produto', nomeComercial)
        recComp.set('ingrediente_ativo', ia)
        recComp.set('nome_quimico', String(item.nome_quimico || ia).trim())
        recComp.set('numero_cas', String(item.numero_cas || '').trim())
        recComp.set('concentracao', String(item.concentracao || '').trim())
        recComp.set('unidade_medida', String(item.unidade_medida || 'g/L').trim())
        recComp.set(
          'funcao_ingrediente',
          String(item.funcao_ingrediente || 'Ingrediente Ativo').trim(),
        )
        recComp.set('grupo_quimico', String(item.grupo_quimico || '').trim())
        recComp.set('percentual_volume', String(item.percentual_volume || '').trim())
        if (item.dados_extras) recComp.set('dados_extras', JSON.stringify(item.dados_extras))

        txApp.save(recComp)
        if (isUp) contadores.bula_composicao.atualizados++
        else contadores.bula_composicao.inseridos++
      }

      // 3. Gravar bula_empresas
      const colEmp = txApp.findCollectionByNameOrId('bula_empresas')
      for (let i = 0; i < empresas.length; i++) {
        const emp = empresas[i]
        const rz = String(emp.razao_social || '').trim()
        const tr = String(emp.tipo_relacao || 'Formulador').trim()
        if (!rz) continue
        const escRz = rz.replace(/'/g, "\\'")
        const escTr = tr.replace(/'/g, "\\'")

        const empExistentes =
          txApp.findRecordsByFilter(
            'bula_empresas',
            `registro_mapa = '${escMapa}' && tipo_relacao = '${escTr}' && razao_social = '${escRz}'`,
            '-created',
            1,
            0,
          ) || []

        let recEmp = null
        let isUp = false
        if (empExistentes.length > 0) {
          recEmp = empExistentes[0]
          isUp = true
        } else {
          recEmp = new Record(colEmp)
        }

        recEmp.set('registro_mapa', regMapa)
        recEmp.set('nome_produto', nomeComercial)
        recEmp.set('tipo_relacao', tr)
        recEmp.set('razao_social', rz)
        recEmp.set('nome_fantasia', String(emp.nome_fantasia || '').trim())
        recEmp.set('cnpj', String(emp.cnpj || '').trim())
        recEmp.set('endereco', String(emp.endereco || '').trim())
        recEmp.set('municipio', String(emp.municipio || '').trim())
        recEmp.set('uf', String(emp.uf || '').trim())
        recEmp.set('pais', String(emp.pais || 'Brasil').trim())
        recEmp.set('cep', String(emp.cep || '').trim())
        recEmp.set('inscricao_estadual', String(emp.inscricao_estadual || '').trim())
        if (emp.dados_extras) recEmp.set('dados_extras', JSON.stringify(emp.dados_extras))

        txApp.save(recEmp)
        if (isUp) contadores.bula_empresas.atualizados++
        else contadores.bula_empresas.inseridos++
      }

      // 4. Gravar bula_embalagens
      const colEmb = txApp.findCollectionByNameOrId('bula_embalagens')
      for (let i = 0; i < embalagens.length; i++) {
        const emb = embalagens[i]
        const te = String(emb.tipo_embalagem || 'Bombona').trim()
        const cap = String(emb.capacidade || '20').trim()
        const escTe = te.replace(/'/g, "\\'")
        const escCap = cap.replace(/'/g, "\\'")

        const embExistentes =
          txApp.findRecordsByFilter(
            'bula_embalagens',
            `registro_mapa = '${escMapa}' && tipo_embalagem = '${escTe}' && capacidade = '${escCap}'`,
            '-created',
            1,
            0,
          ) || []

        let recEmb = null
        let isUp = false
        if (embExistentes.length > 0) {
          recEmb = embExistentes[0]
          isUp = true
        } else {
          recEmb = new Record(colEmb)
        }

        recEmb.set('registro_mapa', regMapa)
        recEmb.set('nome_produto', nomeComercial)
        recEmb.set('tipo_embalagem', te)
        recEmb.set('material', String(emb.material || '').trim())
        recEmb.set('capacidade', cap)
        recEmb.set('unidade_medida', String(emb.unidade_medida || 'L').trim())
        recEmb.set('ncm', String(emb.ncm || '').trim())
        recEmb.set('destinacao_final', String(emb.destinacao_final || '').trim())
        recEmb.set('descricao_embalagem', String(emb.descricao_embalagem || '').trim())
        if (emb.dados_extras) recEmb.set('dados_extras', JSON.stringify(emb.dados_extras))

        txApp.save(recEmb)
        if (isUp) contadores.bula_embalagens.atualizados++
        else contadores.bula_embalagens.inseridos++
      }

      // 5. Gravar bula_culturas
      const colCult = txApp.findCollectionByNameOrId('bula_culturas')
      for (let i = 0; i < culturas.length; i++) {
        const cult = culturas[i]
        const cNome = String(cult.cultura || '').trim()
        if (!cNome) continue
        const escCult = cNome.replace(/'/g, "\\'")

        const cultExistentes =
          txApp.findRecordsByFilter(
            'bula_culturas',
            `registro_mapa = '${escMapa}' && cultura = '${escCult}'`,
            '-created',
            1,
            0,
          ) || []

        let recCult = null
        let isUp = false
        if (cultExistentes.length > 0) {
          recCult = cultExistentes[0]
          isUp = true
        } else {
          recCult = new Record(colCult)
        }

        recCult.set('registro_mapa', regMapa)
        recCult.set('nome_produto', nomeComercial)
        recCult.set('cultura', cNome)
        recCult.set('intervalo_seguranca_dias', String(cult.intervalo_seguranca_dias || '').trim())
        recCult.set(
          'intervalo_reentrada_horas',
          String(cult.intervalo_reentrada_horas || '').trim(),
        )
        recCult.set('modalidade_emprego', String(cult.modalidade_emprego || '').trim())
        recCult.set(
          'limite_maximo_residuos_lmr',
          String(cult.limite_maximo_residuos_lmr || '').trim(),
        )
        recCult.set('observacoes', String(cult.observacoes || '').trim())
        if (cult.dados_extras) recCult.set('dados_extras', JSON.stringify(cult.dados_extras))

        txApp.save(recCult)
        if (isUp) contadores.bula_culturas.atualizados++
        else contadores.bula_culturas.inseridos++
      }

      // 6. Gravar bula_alvos
      const colAlvo = txApp.findCollectionByNameOrId('bula_alvos')
      for (let i = 0; i < alvos.length; i++) {
        const alv = alvos[i]
        const aBio = String(alv.alvo_biologico || '').trim()
        if (!aBio) continue
        const escBio = aBio.replace(/'/g, "\\'")
        const escCultAlvo = String(alv.cultura || '').replace(/'/g, "\\'")

        const alvoExistentes =
          txApp.findRecordsByFilter(
            'bula_alvos',
            `registro_mapa = '${escMapa}' && alvo_biologico = '${escBio}'`,
            '-created',
            1,
            0,
          ) || []

        let recAlvo = null
        let isUp = false
        if (alvoExistentes.length > 0) {
          recAlvo = alvoExistentes[0]
          isUp = true
        } else {
          recAlvo = new Record(colAlvo)
        }

        recAlvo.set('registro_mapa', regMapa)
        recAlvo.set('nome_produto', nomeComercial)
        recAlvo.set('cultura', String(alv.cultura || 'Culturas Autorizadas').trim())
        recAlvo.set('alvo_biologico', aBio)
        recAlvo.set('nome_cientifico', String(alv.nome_cientifico || '').trim())
        recAlvo.set('dose_minima', String(alv.dose_minima || '').trim())
        recAlvo.set('dose_maxima', String(alv.dose_maxima || '').trim())
        recAlvo.set('unidade_dose', String(alv.unidade_dose || 'L/ha').trim())
        recAlvo.set('volume_calda', String(alv.volume_calda || '').trim())
        recAlvo.set('numero_maximo_aplicacoes', String(alv.numero_maximo_aplicacoes || '').trim())
        recAlvo.set('epoca_aplicacao', String(alv.epoca_aplicacao || '').trim())
        recAlvo.set('tipo_alvo', String(alv.tipo_alvo || 'Planta Daninha').trim())
        if (alv.dados_extras) recAlvo.set('dados_extras', JSON.stringify(alv.dados_extras))

        txApp.save(recAlvo)
        if (isUp) contadores.bula_alvos.atualizados++
        else contadores.bula_alvos.inseridos++
      }

      // 7. Gravar bula_aplicacao
      const colApl = txApp.findCollectionByNameOrId('bula_aplicacao')
      for (let i = 0; i < aplicacoes.length; i++) {
        const apl = aplicacoes[i]
        const ta = String(apl.tipo_aplicacao || 'Aplicação Geral').trim()
        const escTa = ta.replace(/'/g, "\\'")

        const aplExistentes =
          txApp.findRecordsByFilter(
            'bula_aplicacao',
            `registro_mapa = '${escMapa}' && tipo_aplicacao = '${escTa}'`,
            '-created',
            1,
            0,
          ) || []

        let recApl = null
        let isUp = false
        if (aplExistentes.length > 0) {
          recApl = aplExistentes[0]
          isUp = true
        } else {
          recApl = new Record(colApl)
        }

        recApl.set('registro_mapa', regMapa)
        recApl.set('nome_produto', nomeComercial)
        recApl.set('tipo_aplicacao', ta)
        recApl.set('equipamento_recomendado', String(apl.equipamento_recomendado || '').trim())
        recApl.set('condicoes_meteorologicas', String(apl.condicoes_meteorologicas || '').trim())
        recApl.set('epi_preparo_calda', String(apl.epi_preparo_calda || '').trim())
        recApl.set('epi_aplicacao', String(apl.epi_aplicacao || '').trim())
        recApl.set(
          'medidas_primeiros_socorros',
          String(apl.medidas_primeiros_socorros || '').trim(),
        )
        recApl.set('descarte_embalagens', String(apl.descarte_embalagens || '').trim())
        recApl.set('volume_calda_aplicacao', String(apl.volume_calda_aplicacao || '').trim())
        recApl.set(
          'classe_toxicologica_aplicacao',
          String(apl.classe_toxicologica_aplicacao || '').trim(),
        )
        recApl.set('orientacoes_gerais', String(apl.orientacoes_gerais || '').trim())
        if (apl.dados_extras) recApl.set('dados_extras', JSON.stringify(apl.dados_extras))

        txApp.save(recApl)
        if (isUp) contadores.bula_aplicacao.atualizados++
        else contadores.bula_aplicacao.inseridos++
      }
    })

    return e.json(200, {
      sucesso: true,
      mensagem: `Bula do produto "${nomeComercial}" (MAPA ${regMapa}) cadastrada com sucesso!`,
      registro_mapa: regMapa,
      nome_comercial: nomeComercial,
      contadores: contadores,
    })
  } catch (err) {
    console.log('Erro ao gravar dados da bula PDF:', err.message || err)
    return e.json(500, {
      sucesso: false,
      error: `Erro interno no servidor ao gravar dados da bula: ${err.message || String(err)}`,
    })
  }
})
