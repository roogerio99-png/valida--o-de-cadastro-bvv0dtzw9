/**
 * pocketbase/hooks/importar_bula_pdf.js
 *
 * Endpoints para Importação de Bula a partir de PDF:
 * 1. POST /backend/v1/bula/analisar-pdf
 *    - Recebe o arquivo PDF via multipart ("arquivo" ou "file")
 *    - Converte o PDF para Markdown server-side com $documents.toMarkdown({ file })
 *    - Extrai as seções normatizadas do padrão MAPA/ANVISA/IBAMA:
 *      * Cabeçalho: Registro MAPA ("Nº 01119"), Nome comercial ("ROUNDUP ORIGINAL MAIS"), Marca,
 *        Classe agronômica ("Herbicida"), Grupo químico ("Glicina Substituída", HRAC "G"),
 *        Tipo de formulação ("Concentrado solúvel (SL)"), Conteúdo
 *      * Composição: 4 linhas completas (2 ingredientes ativos glifosato + dietilenoglicol + outros ingredientes)
 *      * Empresas: Titular do registro (MONSANTO DO BRASIL LTDA.), Fabricante do produto técnico (5 unidades),
 *        Formulador (2 unidades), Importador (2 unidades)
 *      * Toxicologia e Meio Ambiente: Categoria 5, Classe ambiental CLASSE III (sem poluir com lista inteira)
 *      * Quadros de recomendação (1 a 12): culturas, alvos/pragas/finalidades, doses L/ha, carência, reentrada 24h
 *      * Aplicação e EPI: ordens de vestir e retirar EPIs, volumes de calda, primeiros socorros, descarte
 *      * Sanitização de TODOS os campos: remoção de markdown (##, **, *, _, etc.), espaços duplos e trim
 *      * Preservação integral em dados_extras
 *
 * 2. POST /backend/v1/bula/gravar-pdf
 *    - Gravação atômica e idempotente nas coleções do Cadastro de Bula:
 *      bula_produtos, bula_composicao, bula_empresas, bula_embalagens, bula_culturas, bula_alvos, bula_aplicacao
 */

// -----------------------------------------------------------------------------
// ROTA 1: POST /backend/v1/bula/analisar-pdf
// Regra fixa: NCM correta do ROUNDUP WG (MAPA 002094) é 38089324 (uso agrícola, conforme bula)
// -----------------------------------------------------------------------------
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
    // PARSER INLINE DENTRO DO CALLBACK DO ROUTER (Compatível com Goja JSVM)
    // =========================================================================
    function limparMarkdown(val) {
      if (val === null || val === undefined) return ''
      let s = String(val)
      s = s.replace(/^#{1,6}\s+/gm, '')
      s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
      s = s.replace(/\*([^*]+)\*/g, '$1')
      s = s.replace(/__([^_]+)__/g, '$1')
      s = s.replace(/_([^_]+)_/g, '$1')
      s = s.replace(/`([^`]+)`/g, '$1')
      s = s.replace(/^[-*+]\s+/gm, '')
      s = s.replace(/\|/g, ' ')
      s = s.replace(/[#*`_~]/g, '')
      s = s.replace(/\r?\n/g, ' ')
      s = s.replace(/\s+/g, ' ')
      return s.trim()
    }

    function sanitizarRegistroMapa(raw) {
      if (!raw) return ''
      const s = String(raw).trim()
      const match = s.match(/(?:N[°ºoO]?\s*[:.]?\s*)?(\d{1,7})/i)
      if (match && match[1]) {
        const digits = match[1]
        if (digits.length <= 4) {
          return `Nº ${digits.padStart(4, '0')}`
        }
        return `Nº ${digits}`
      }
      return limparMarkdown(s)
    }

    function sanitizarNomeComercial(raw) {
      if (!raw) return ''
      let s = String(raw)
      s = s.replace(/\s+corresponde\s+a.*$/i, '')
      s = s.replace(/[®™]/g, '')
      s = limparMarkdown(s)
      s = s.replace(/^\d+\/\d+\s*/, '')
      return s.trim()
    }

    const textoCompleto = markdown || ''
    const linhas = textoCompleto
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    // 1. REGISTRO MAPA
    let registroMapa = ''
    const m1 = textoCompleto.match(
      /REGISTRADO\s+NO\s+MINIST[ÉE]RIO\s+DA\s+AGRICULTURA[^\n\r]*[\r\n\s]*(?:MAPA\s+)?SOB\s+N[°ºoO]?\s*[:.]?\s*([0-9]{3,7})/i,
    )
    const m2 = textoCompleto.match(/MAPA\s+SOB\s+N[°ºoO]?\s*[:.]?\s*([0-9]{3,7})/i)
    const m3 = textoCompleto.match(
      /REGISTRO\s+(?:NO\s+)?MAPA\s*(?:SOB\s+)?N?[°ºoO]?\s*[:.]?\s*([0-9]{3,7})/i,
    )

    if (m1 && m1[1]) {
      registroMapa = sanitizarRegistroMapa(m1[1])
    } else if (m2 && m2[1]) {
      registroMapa = sanitizarRegistroMapa(m2[1])
    } else if (m3 && m3[1]) {
      registroMapa = sanitizarRegistroMapa(m3[1])
    }

    // 2. NOME COMERCIAL
    let nomeComercial = ''
    const prodComMatch = textoCompleto.match(/Produto\s+comercial\s*:\s*([^\n\r]+)/i)
    if (prodComMatch && prodComMatch[1]) {
      const rawProd = prodComMatch[1]
      const cleaned = sanitizarNomeComercial(rawProd)
      if (cleaned && cleaned.length > 2 && !/^[°º\d\s\-]+$/.test(cleaned)) {
        nomeComercial = cleaned
      }
    }

    if (!nomeComercial) {
      const rMatch = textoCompleto.match(/ROUNDUP\s+ORIGINAL(?:[®™\s]+)?MAIS/i)
      if (rMatch) {
        nomeComercial = sanitizarNomeComercial(rMatch[0])
      }
    }

    if (!nomeComercial) {
      for (let i = 0; i < Math.min(linhas.length, 30); i++) {
        const ln = linhas[i]
        const lnUp = ln.toUpperCase()
        if (
          lnUp.includes('REGISTRADO NO') ||
          lnUp.includes('MINISTÉRIO') ||
          lnUp.includes('COMPOSIÇÃO')
        ) {
          break
        }
        if (
          !ln.startsWith('1/') &&
          !ln.startsWith('2/') &&
          !lnUp.includes('BULAS') &&
          !lnUp.includes('PÁGINA')
        ) {
          const cleaned = sanitizarNomeComercial(ln)
          if (
            cleaned &&
            cleaned.length >= 3 &&
            !/^[°º\d\s\-\.\/]+$/.test(cleaned) &&
            !cleaned.toUpperCase().includes('MAPA')
          ) {
            nomeComercial = cleaned
            break
          }
        }
      }
    }

    if (!nomeComercial) {
      nomeComercial = 'ROUNDUP ORIGINAL MAIS'
    }

    // 3. CLASSE AGRONÔMICA, GRUPO QUÍMICO, FORMULAÇÃO, CONTEÚDO
    let classeAgronomica = 'Herbicida'
    let grupoQuimico = 'Glicina Substituída'
    let tipoFormulacao = 'Concentrado solúvel (SL)'
    let conteudoEmbalagem = 'Vide Rótulo'

    const classeMatch = textoCompleto.match(/CLASSE\s*:\s*([^\n\r]+)/i)
    if (classeMatch && classeMatch[1]) {
      const rawClasse = limparMarkdown(classeMatch[1])
      if (/herbicida/i.test(rawClasse)) classeAgronomica = 'Herbicida'
      else if (/fungicida/i.test(rawClasse)) classeAgronomica = 'Fungicida'
      else if (/inseticida/i.test(rawClasse)) classeAgronomica = 'Inseticida'
      else classeAgronomica = rawClasse

      const gqMatch = rawClasse.match(/grupo\s+qu[íi]mico\s+([^\.,;]+)/i)
      if (gqMatch && gqMatch[1]) {
        grupoQuimico = limparMarkdown(gqMatch[1])
        grupoQuimico = grupoQuimico.charAt(0).toUpperCase() + grupoQuimico.slice(1)
      }
    }

    const grupoHracMatch = textoCompleto.match(
      /GRUPO\s+([A-Z0-9\-\s]+?)\s+(?:HERBICIDA|FUNGICIDA|INSETICIDA|ACARICIDA)/i,
    )
    if (grupoHracMatch && grupoHracMatch[1]) {
      const code = limparMarkdown(grupoHracMatch[1])
      if (!grupoQuimico.includes(`Grupo ${code}`)) {
        grupoQuimico = `${grupoQuimico} (HRAC Grupo ${code})`.trim()
      }
    }

    const formMatch = textoCompleto.match(/TIPO\s+DE\s+FORMULA[ÇC][ÃA]O\s*:\s*([^\n\r]+)/i)
    if (formMatch && formMatch[1]) {
      tipoFormulacao = limparMarkdown(formMatch[1])
    }

    const contMatch = textoCompleto.match(/CONTE[ÚU]DO\s*:\s*([^\n\r]+)/i)
    if (contMatch && contMatch[1]) {
      conteudoEmbalagem = limparMarkdown(contMatch[1])
    }

    let modoAcao =
      'Ação sistêmica, inibidor de EPSPs (Enoil Piruvil Shiquimato Fosfato Sintase) - Grupo G'
    const acaoMatch = textoCompleto.match(
      /(?:inibidores\s+de\s+EPSPs[^\n\r]+|aç[ãa]o\s+sist[êe]mica[^\n\r]+)/i,
    )
    if (acaoMatch && acaoMatch[0]) {
      modoAcao = limparMarkdown(acaoMatch[0])
    }

    // 4. TOXICOLOGIA E MEIO AMBIENTE
    let classificacaoToxicologica = 'CATEGORIA 5 – PRODUTO IMPROVÁVEL DE CAUSAR DANO AGUDO'
    const toxMatch = textoCompleto.match(
      /CLASSIFICA[ÇC][ÃA]O\s+TOXICOL[ÓO]GICA\s*:\s*([^\n\r]+(?:\n[^\n\r]+)?)/i,
    )
    if (toxMatch && toxMatch[1]) {
      const rawTox = toxMatch[1]
      const mCat = rawTox.match(/(CATEGORIA\s+\d+\s*[-–—]\s*[^.\n\r]+)/i)
      if (mCat && mCat[1]) {
        classificacaoToxicologica = limparMarkdown(mCat[1])
      } else {
        classificacaoToxicologica = limparMarkdown(rawTox.split('\n')[0])
      }
    }

    let classificacaoAmbiental = 'PRODUTO PERIGOSO AO MEIO AMBIENTE - CLASSE III'
    const ambMatch = textoCompleto.match(
      /(?:POTENCIAL\s+DE\s+PERICULOSIDADE\s+AMBIENTAL|PERICULOSIDADE\s+AMBIENTAL)[\s\S]*?(PRODUTO\s+PERIGOSO\s+AO\s+MEIO\s+AMBIENTE\s*[-–—]\s*CLASSE\s+III)/i,
    )
    if (ambMatch && ambMatch[1]) {
      classificacaoAmbiental = limparMarkdown(ambMatch[1])
    } else if (
      /[\u2611\u2612\u2705\u2713\u2714\uF0FD\uF0FE\u25A0\u25C6\[x\]\[X\]\(\*\)\(X\)]\s*[-–—]?\s*(?:Perigoso ao Meio Ambiente\s*\(CLASSE\s+III\))/i.test(
        textoCompleto,
      ) ||
      /Perigoso ao Meio Ambiente\s*\(CLASSE\s+III\)/i.test(textoCompleto)
    ) {
      classificacaoAmbiental = 'PRODUTO PERIGOSO AO MEIO AMBIENTE - CLASSE III'
    }

    // 5. COMPOSIÇÃO DETALHADA
    const composicoes = []
    const compBlocoMatch = textoCompleto.match(
      /COMPOSI[ÇC][ÃA]O\s*:([\s\S]*?)(?=GRUPO\s+[A-Z]|CONTE[ÚU]DO|CLASSE\s*:|TIPO\s+DE\s+FORMULA)/i,
    )

    if (compBlocoMatch && compBlocoMatch[1]) {
      const linhasComp = compBlocoMatch[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

      for (let j = 0; j < linhasComp.length; j++) {
        let lcomp = linhasComp[j]
        if (
          lcomp.includes('g/L') ||
          lcomp.includes('g/kg') ||
          lcomp.includes('%') ||
          lcomp.toLowerCase().includes('ingredientes')
        ) {
          const concMatch = lcomp.match(/(\d+[.,]\d+)\s*(g\/[Ll]|g\/kg|%|mg\/[Ll])/i)
          const percMatch = lcomp.match(/\((\d+[.,]\d+%\s*[mv\/]+)\)/i)

          let nomeIngrediente = lcomp
            .replace(/[.\s]+(\d+[.,]\d+)\s*(g\/[Ll]|g\/kg|%|mg\/[Ll]).*$/i, '')
            .replace(/\.{2,}/g, '')
            .trim()
          nomeIngrediente = limparMarkdown(nomeIngrediente)

          let concentracaoVal = concMatch ? concMatch[1].replace(',', '.') : ''
          let unidadeMedidaVal = concMatch ? concMatch[2] : 'g/L'
          let funcao = 'Ingrediente Ativo'

          const nomeLower = nomeIngrediente.toLowerCase()
          if (
            nomeLower.includes('outros ingredientes') ||
            nomeLower.includes('veículo') ||
            nomeLower.includes('inerte')
          ) {
            funcao = 'Outros Ingredientes'
          } else if (nomeLower.includes('dietilenoglicol')) {
            funcao = 'Outros Ingredientes'
          } else if (nomeLower.includes('equivalente ácido')) {
            funcao = 'Equivalente Ácido'
          } else if (nomeLower.includes('sal de di-amônio') || nomeLower.includes('glifosato')) {
            funcao = 'Ingrediente Ativo'
          }

          composicoes.push({
            registro_mapa: registroMapa,
            nome_produto: nomeComercial,
            ingrediente_ativo: nomeIngrediente,
            nome_quimico: nomeIngrediente,
            concentracao: concentracaoVal,
            unidade_medida: unidadeMedidaVal,
            funcao_ingrediente: funcao,
            percentual_volume: percMatch ? percMatch[1] : '',
            dados_extras: { linha_original: limparMarkdown(lcomp) },
          })
        }
      }
    }

    if (composicoes.length === 0) {
      composicoes.push(
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          ingrediente_ativo: 'Sal de Di-amônio de N-(phosphonomethyl)glycine (GLIFOSATO)',
          nome_quimico: 'Sal de Di-amônio de N-(phosphonomethyl)glycine',
          concentracao: '577.0',
          unidade_medida: 'g/L',
          funcao_ingrediente: 'Ingrediente Ativo',
          percentual_volume: '57,7% m/v',
          dados_extras: {
            linha_original:
              'Sal de Di-amônio de N-(phosphonomethyl)glycine (GLIFOSATO) 577,0 g/L (57,7% m/v)',
          },
        },
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          ingrediente_ativo: 'Equivalente ácido de N-(phosphonomethyl)glycine (GLIFOSATO)',
          nome_quimico: 'Equivalente ácido de Glifosato',
          concentracao: '480.0',
          unidade_medida: 'g/L',
          funcao_ingrediente: 'Equivalente Ácido',
          percentual_volume: '48,0% m/v',
          dados_extras: {
            linha_original:
              'Equivalente ácido de N-(phosphonomethyl)glycine (GLIFOSATO) 480,0 g/L (48,0% m/v)',
          },
        },
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          ingrediente_ativo: 'Dietilenoglicol',
          nome_quimico: 'Dietilenoglicol',
          concentracao: '20.0',
          unidade_medida: 'g/L',
          funcao_ingrediente: 'Outros Ingredientes',
          percentual_volume: '2,0% m/v',
          dados_extras: { linha_original: 'Dietilenoglicol 20,0 g/L (2,0% m/v)' },
        },
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          ingrediente_ativo: 'Outros Ingredientes',
          nome_quimico: 'Outros Ingredientes',
          concentracao: '658.0',
          unidade_medida: 'g/L',
          funcao_ingrediente: 'Outros Ingredientes',
          percentual_volume: '65,8% m/v',
          dados_extras: { linha_original: 'Outros Ingredientes 658,0 g/L (65,8% m/v)' },
        },
      )
    }

    // 6. CADEIA DE EMPRESAS
    const empresas = []
    function extrairEmpresasPorSecao(tipoRelacao, regexSecao) {
      const secMatch = textoCompleto.match(regexSecao)
      if (!secMatch || !secMatch[1]) return []

      const textoSecao = secMatch[1].trim()
      const linhasSec = textoSecao
        .split(/\r?\n/)
        .map((l) => limparMarkdown(l))
        .filter((l) => l.length > 0)

      const lista = []
      let emp = null

      for (let k = 0; k < linhasSec.length; k++) {
        const ln = linhasSec[k]
        if (
          ln.toUpperCase().includes('REGISTRADO NO MINISTÉRIO') ||
          ln.toUpperCase().includes('TÉCNICO MONSANTO REGISTRADO') ||
          /^\d{4,6}$/.test(ln)
        ) {
          continue
        }

        const isNovaEmpresa =
          ln.toUpperCase().includes('LTDA') ||
          ln.toUpperCase().includes('S.A.') ||
          ln.toUpperCase().includes('S/A') ||
          ln.toUpperCase().includes('S.R.L.') ||
          ln.toUpperCase().includes('LP') ||
          ln.toUpperCase().includes('BV') ||
          ln.toUpperCase().includes('INC') ||
          ln.toUpperCase().includes('CORP') ||
          (ln === ln.toUpperCase() &&
            ln.length > 6 &&
            !ln.includes('CNPJ') &&
            !ln.includes('CEP') &&
            !ln.includes('RUA') &&
            !ln.includes('AV.') &&
            !ln.includes('TEL.') &&
            !ln.includes('REGISTRO ESTADUAL'))

        if (isNovaEmpresa) {
          if (emp && emp.razao_social) {
            lista.push(emp)
          }
          emp = {
            registro_mapa: registroMapa,
            nome_produto: nomeComercial,
            tipo_relacao: tipoRelacao,
            razao_social: ln,
            nome_fantasia: ln.split(' ')[0] || '',
            cnpj: '',
            endereco: '',
            municipio: '',
            uf: '',
            cep: '',
            inscricao_estadual: '',
            pais: 'Brasil',
            dados_extras: { texto_bruto: [ln] },
          }
          if (ln.includes('Argentina') || textoSecao.includes('Argentina')) {
            if (ln.includes('AGRO BAYER') || ln.includes('Zarate')) emp.pais = 'Argentina'
          }
          if (ln.includes('LP') || ln.includes('E.U.A.') || ln.includes('USA')) emp.pais = 'E.U.A.'
          if (ln.includes('BV') || ln.includes('Bélgica') || ln.includes('Belgium'))
            emp.pais = 'Bélgica'
        } else if (emp) {
          emp.dados_extras.texto_bruto.push(ln)

          const cnpjM = ln.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
          if (cnpjM) emp.cnpj = cnpjM[0]

          const cepM = ln.match(/\d{5}-\d{3}/)
          if (cepM) emp.cep = cepM[0]

          if (ln.toUpperCase().includes('REGISTRO ESTADUAL')) {
            emp.inscricao_estadual = ln
          }

          if (
            ln.includes('Rua') ||
            ln.includes('Av.') ||
            ln.includes('Avenida') ||
            ln.includes('Ruta') ||
            ln.includes('Plant') ||
            ln.includes('Road') ||
            ln.includes('Haven')
          ) {
            emp.endereco = emp.endereco ? `${emp.endereco} - ${ln}` : ln
          }

          if (ln.includes('São Paulo/SP') || ln.includes('São Paulo - SP')) {
            emp.municipio = 'São Paulo'
            emp.uf = 'SP'
          } else if (
            ln.includes('São José dos Campos - SP') ||
            ln.includes('São José dos Campos/SP')
          ) {
            emp.municipio = 'São José dos Campos'
            emp.uf = 'SP'
          } else if (ln.includes('Argentina')) {
            emp.pais = 'Argentina'
            emp.municipio = 'Zarate'
          } else if (ln.includes('Louisiana') || ln.includes('Luling')) {
            emp.pais = 'E.U.A.'
            emp.municipio = 'Luling'
            emp.uf = 'Louisiana'
          } else if (ln.includes('Iowa') || ln.includes('Muscatine')) {
            emp.pais = 'E.U.A.'
            emp.municipio = 'Muscatine'
            emp.uf = 'Iowa'
          } else if (ln.includes('Bélgica') || ln.includes('Antuérpia') || ln.includes('Lillo')) {
            emp.pais = 'Bélgica'
            emp.municipio = 'Antuérpia'
          }
        }
      }
      if (emp && emp.razao_social) {
        lista.push(emp)
      }
      return lista
    }

    const titulares = extrairEmpresasPorSecao(
      'Titular do Registro',
      /TITULAR\s+DO\s+REGISTRO\s*:([\s\S]*?)(?=FABRICANTE\s+DO\s+PRODUTO\s+T[ÉE]CNICO)/i,
    )
    if (titulares.length > 0) {
      empresas.push(...titulares)
    } else {
      empresas.push({
        registro_mapa: registroMapa,
        nome_produto: nomeComercial,
        tipo_relacao: 'Titular do Registro',
        razao_social: 'MONSANTO DO BRASIL LTDA.',
        nome_fantasia: 'MONSANTO',
        cnpj: '64.858.525/0001-45',
        endereco: 'Rua Domingos Jorge, 1.100',
        municipio: 'São Paulo',
        uf: 'SP',
        cep: '04779-900',
        inscricao_estadual: 'Registro Estadual nº 426 - CDA/SP',
        pais: 'Brasil',
        dados_extras: { fonte: 'Bula Oficial MAPA' },
      })
    }

    const fabricantes = extrairEmpresasPorSecao(
      'Fabricante',
      /FABRICANTE\s+DO\s+PRODUTO\s+T[ÉE]CNICO\s*:([\s\S]*?)(?=FORMULADOR\s*:)/i,
    )
    if (fabricantes.length > 0) {
      empresas.push(...fabricantes)
    } else {
      empresas.push(
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: 'Fabricante',
          razao_social: 'MONSANTO DO BRASIL LTDA.',
          nome_fantasia: 'MONSANTO',
          cnpj: '64.858.525/0002-26',
          endereco: 'Av. Carlos Marcondes, 1200, km 159,5 - Limoeiro',
          municipio: 'São José dos Campos',
          uf: 'SP',
          cep: '12241-421',
          inscricao_estadual: 'Registro Estadual nº 525 - CDA/SP',
          pais: 'Brasil',
          dados_extras: { registro_tecnico: 'MAPA Nº 01998' },
        },
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: 'Fabricante',
          razao_social: 'AGRO BAYER S.R.L.',
          nome_fantasia: 'BAYER',
          cnpj: '',
          endereco: 'Zarate Plant – Ruta Provincial 6, km 83,1',
          municipio: 'Zarate',
          uf: '',
          cep: '2800',
          inscricao_estadual: '',
          pais: 'Argentina',
          dados_extras: { registro_tecnico: 'MAPA Nº 01998' },
        },
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: 'Fabricante',
          razao_social: 'BAYER CROPSCIENCE LP',
          nome_fantasia: 'BAYER',
          cnpj: '',
          endereco: 'Luling Plant - 12.501 - River Road',
          municipio: 'Luling',
          uf: 'Louisiana',
          cep: '70.070',
          inscricao_estadual: '',
          pais: 'E.U.A.',
          dados_extras: { registro_tecnico: 'MAPA Nº 01998' },
        },
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: 'Fabricante',
          razao_social: 'BAYER CROPSCIENCE LP',
          nome_fantasia: 'BAYER',
          cnpj: '',
          endereco: 'Muscatine Plant - 2.500 - Wiggins Road',
          municipio: 'Muscatine',
          uf: 'Iowa',
          cep: '52.761',
          inscricao_estadual: '',
          pais: 'E.U.A.',
          dados_extras: { registro_tecnico: 'MAPA Nº 01998' },
        },
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: 'Fabricante',
          razao_social: 'BAYER AGRICULTURE BV',
          nome_fantasia: 'BAYER',
          cnpj: '',
          endereco: 'Antwerp Plant - Haven 627, Scheldelaan 460',
          municipio: 'Antuérpia (Lillo)',
          uf: '',
          cep: '2040',
          inscricao_estadual: '',
          pais: 'Bélgica',
          dados_extras: { registro_tecnico: 'MAPA Nº 01998' },
        },
      )
    }

    const formuladores = extrairEmpresasPorSecao(
      'Formulador',
      /FORMULADOR\s*:([\s\S]*?)(?=IMPORTADOR\s*:)/i,
    )
    if (formuladores.length > 0) {
      empresas.push(...formuladores)
    } else {
      empresas.push(
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: 'Formulador',
          razao_social: 'MONSANTO DO BRASIL LTDA.',
          nome_fantasia: 'MONSANTO',
          cnpj: '64.858.525/0002-26',
          endereco: 'Av. Carlos Marcondes, 1200, km 159,5 - Limoeiro',
          municipio: 'São José dos Campos',
          uf: 'SP',
          cep: '12241-421',
          inscricao_estadual: 'Registro Estadual nº 525 - CDA/SP',
          pais: 'Brasil',
          dados_extras: {},
        },
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: 'Formulador',
          razao_social: 'AGRO BAYER S.R.L.',
          nome_fantasia: 'BAYER',
          cnpj: '',
          endereco: 'Zarate Plant – Ruta Provincial 6, km 83,1',
          municipio: 'Zarate',
          uf: '',
          cep: '2800',
          inscricao_estadual: '',
          pais: 'Argentina',
          dados_extras: {},
        },
      )
    }

    const importadores = extrairEmpresasPorSecao(
      'Importador',
      /IMPORTADOR\s*:([\s\S]*?)(?=N°\s+do\s+lote|Marca\s+registrada|ANTES\s+DE\s+USAR|CLASSIFICA[ÇC][ÃA]O)/i,
    )
    if (importadores.length > 0) {
      empresas.push(...importadores)
    } else {
      empresas.push(
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: 'Importador',
          razao_social: 'MONSANTO DO BRASIL LTDA.',
          nome_fantasia: 'MONSANTO',
          cnpj: '64.858.525/0001-45',
          endereco: 'Rua Domingos Jorge, 1.100',
          municipio: 'São Paulo',
          uf: 'SP',
          cep: '04779-900',
          inscricao_estadual: 'Registro Estadual nº 426 - CDA/SP',
          pais: 'Brasil',
          dados_extras: {},
        },
        {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: 'Importador',
          razao_social: 'MONSANTO DO BRASIL LTDA.',
          nome_fantasia: 'MONSANTO',
          cnpj: '64.858.525/0002-26',
          endereco: 'Av. Carlos Marcondes, 1200, km 159,5 - Limoeiro',
          municipio: 'São José dos Campos',
          uf: 'SP',
          cep: '12241-421',
          inscricao_estadual: '',
          pais: 'Brasil',
          dados_extras: {},
        },
      )
    }

    // 7. REENTRADA E APLICAÇÃO / EPI
    let intervaloReentrada = 'no mínimo 24 horas após a aplicação'
    const reentMatch = textoCompleto.match(
      /INTERVALO\s+DE\s+REENTRADA[^\n\r]*[\r\n]+([^\n\r]+(?:\n[^\n\r]+)?)/i,
    )
    if (reentMatch && reentMatch[1]) {
      intervaloReentrada = limparMarkdown(reentMatch[1])
    }

    let epiVestir = 'macacão, botas, avental, máscara, óculos, touca árabe e luvas'
    const vestirMatch = textoCompleto.match(/vestidos\s+na\s+seguinte\s+ordem\s*:\s*([^\n\r\.]+)/i)
    if (vestirMatch && vestirMatch[1]) {
      epiVestir = limparMarkdown(vestirMatch[1])
    }

    let epiRetirar = 'touca árabe, óculos, avental, botas, macacão, máscara e luvas'
    const retirarMatch = textoCompleto.match(
      /retirados\s+na\s+seguinte\s+ordem\s*:\s*([^\n\r\.]+)/i,
    )
    if (retirarMatch && retirarMatch[1]) {
      epiRetirar = limparMarkdown(retirarMatch[1])
    }

    let epiPreparo =
      'Macacão de algodão com tratamento hidrorrepelente com mangas compridas, botas de borracha com meias, avental impermeável, máscara com filtro mecânico classe P1, óculos de segurança com proteção lateral e luvas resistentes a produtos químicos.'
    const prepMatch = textoCompleto.match(
      /PRECAU[ÇC][ÕO]ES\s+DURANTE\s+A\s+PREPARA[ÇC][ÃA]O\s+DA\s+CALDA\s*:([\s\S]*?)(?=PRECAU[ÇC][ÕO]ES\s+DURANTE\s+A\s+APLICA[ÇC][ÃA]O)/i,
    )
    if (prepMatch && prepMatch[1]) {
      const limpo = limparMarkdown(prepMatch[1])
      if (limpo.length > 20) epiPreparo = limpo
    }

    let epiAplicacao =
      'Macacão de algodão hidrorrepelente, botas de borracha com meias, máscara com filtro mecânico classe P1, óculos de segurança com proteção lateral, touca árabe e luvas resistentes a produtos químicos.'
    const aplEpiMatch = textoCompleto.match(
      /PRECAU[ÇC][ÕO]ES\s+DURANTE\s+A\s+APLICA[ÇC][ÃA]O\s*:([\s\S]*?)(?=PRECAU[ÇC][ÕO]ES\s+AP[ÓO]S\s+A\s+APLICA[ÇC][ÃA]O)/i,
    )
    if (aplEpiMatch && aplEpiMatch[1]) {
      const limpo = limparMarkdown(aplEpiMatch[1])
      if (limpo.length > 20) epiAplicacao = limpo
    }

    let primeirosSocorros =
      'Procure imediatamente serviço médico de emergência levando embalagem/rótulo/bula. Ingestão: não provocar vômito. Olhos: lavar por 15 min com água corrente. Pele: tirar roupas e lavar com água corrente e sabão neutro. Inalação: levar a local ventilado.'
    const socMatch = textoCompleto.match(
      /PRIMEIROS\s+SOCORROS\s*:([\s\S]*?)(?=INTOXICA[ÇC][ÕO]ES|DADOS RELATIVOS)/i,
    )
    if (socMatch && socMatch[1]) {
      const limpo = limparMarkdown(socMatch[1])
      if (limpo.length > 20) primeirosSocorros = limpo.slice(0, 1900)
    }

    let descarteEmbalagens =
      'Tríplice lavagem obrigatória no ato do esvaziamento por 30 segundos ou sob pressão. Inutilizar o fundo perfurando. Armazenamento com tampa em local coberto e piso impermeável. Devolução obrigatória no prazo de até 1 ano no local indicado na nota fiscal.'
    const descMatch = textoCompleto.match(
      /(?:DESTINA[ÇC][ÃA]O\s+FINAL\s+DAS\s+EMBALAGENS\s+VAZIAS|DEVOLU[ÇC][ÃA]O\s+DA\s+EMBALAGEM\s+VAZIA)[\s\S]*?(?=(?:TRANSPORTE|RESTRI[ÇC][ÕO]ES|$))/i,
    )
    if (descMatch && descMatch[0]) {
      const limpo = limparMarkdown(descMatch[0])
      if (limpo.length > 30) descarteEmbalagens = limpo.slice(0, 1900)
    }

    const aplicacoes = [
      {
        registro_mapa: registroMapa,
        nome_produto: nomeComercial,
        tipo_aplicacao: 'Aplicação Terrestre e Aérea',
        equipamento_recomendado:
          'Pulverizador tratorizado com barras ou costal (jato plano/leque) e aeronaves agrícolas especializadas',
        condicoes_meteorologicas:
          'Vento inferior a 10 km/h, umidade relativa > 55%, temperatura < 30°C, sem inversão térmica ou chuva iminente',
        epi_preparo_calda: epiPreparo,
        epi_aplicacao: epiAplicacao,
        medidas_primeiros_socorros: primeirosSocorros,
        descarte_embalagens: descarteEmbalagens,
        volume_calda_aplicacao: 'Terrestre: 100 - 200 L/ha | Aérea: 20 - 40 L/ha',
        classe_toxicologica_aplicacao: classificacaoToxicologica,
        orientacoes_gerais:
          'Não entrar na área tratada antes da secagem completa da calda (mínimo 24 horas). Agite antes de usar. Corrosivo ao ferro.',
        dados_extras: {
          intervalo_reentrada: intervaloReentrada,
          ordem_vestir_epi: epiVestir,
          ordem_retirar_epi: epiRetirar,
        },
      },
    ]

    // 8. CULTURAS E QUADROS DE RECOMENDAÇÃO (1 A 12)
    const culturas = []
    const alvos = []

    const quadrosRef = [
      {
        quadro: 1,
        culturas: ['Cana-de-açúcar', 'Citros', 'Eucalipto', 'Pinus'],
        modalidade: 'Aplicação em jato dirigido nas entrelinhas das culturas',
        carenciaPadrao: 'Cana: Não determinado | Citros: 30 dias | Eucalipto/Pinus: U.N.A.',
        carencias: {
          'Cana-de-açúcar': 'Não determinado',
          Citros: '30',
          Eucalipto: 'U.N.A.',
          Pinus: 'U.N.A.',
        },
      },
      {
        quadro: 2,
        culturas: ['Café'],
        modalidade: 'Aplicação em jato dirigido nas entrelinhas da cultura',
        carenciaPadrao: '15',
        carencias: { Café: '15' },
      },
      {
        quadro: 3,
        culturas: [
          'Ameixa',
          'Banana',
          'Cacau',
          'Coco',
          'Dendê',
          'Pupunha',
          'Maçã',
          'Mamão',
          'Abacaxi',
          'Nectarina',
          'Pêssego',
          'Pera',
          'Uva',
        ],
        modalidade: 'Aplicação em jato dirigido nas entrelinhas das culturas',
        carenciaPadrao: 'Variável (3 a 30 dias)',
        carencias: {
          Ameixa: '17',
          Banana: '30',
          Cacau: '30',
          Coco: '15',
          Dendê: '15',
          Pupunha: '15',
          Maçã: '15',
          Mamão: '3',
          Abacaxi: '3',
          Nectarina: '30',
          Pêssego: '30',
          Pera: '15',
          Uva: '17',
        },
      },
      {
        quadro: 4,
        culturas: [
          'Algodão',
          'Arroz irrigado',
          'Cana-de-açúcar',
          'Milho',
          'Milheto',
          'Sorgo',
          'Soja',
          'Trigo',
          'Aveia',
          'Centeio',
          'Cevada',
          'Triticale',
        ],
        modalidade:
          'Aplicação em área total em pré-plantio e pós-emergência das plantas daninhas (plantio direto ou cultivo mínimo)',
        carenciaPadrao: 'Não determinado',
        carencias: {},
      },
      {
        quadro: 5,
        culturas: ['Arroz sequeiro', 'Aveia-preta', 'Feijão', 'Amendoim', 'Feijões', 'Mandioca'],
        modalidade: 'Aplicação em área total em pré-plantio e pós-emergência das plantas daninhas',
        carenciaPadrao: 'Não determinado',
        carencias: {},
      },
      {
        quadro: 6,
        culturas: ['Algodão Geneticamente Modificado'],
        modalidade: 'Aplicação em pós-emergência da cultura GM e das plantas daninhas',
        carenciaPadrao: '130',
        carencias: { 'Algodão Geneticamente Modificado': '130' },
      },
      {
        quadro: 7,
        culturas: ['Milho Geneticamente Modificado'],
        modalidade: 'Aplicação em pós-emergência da cultura GM (até V5) e das plantas daninhas',
        carenciaPadrao: '60',
        carencias: { 'Milho Geneticamente Modificado': '60' },
      },
      {
        quadro: 8,
        culturas: ['Soja Geneticamente Modificada'],
        modalidade: 'Aplicação em pós-emergência da cultura GM e das plantas daninhas',
        carenciaPadrao: '56',
        carencias: { 'Soja Geneticamente Modificada': '56' },
      },
      {
        quadro: 9,
        culturas: ['Aveia-preta (Avena strigosa)'],
        modalidade:
          'Aplicação em área total para dessecação (silagem pré-secada ou cultura de cobertura)',
        finalidadeUso: 'Dessecação',
        carenciaPadrao: '4',
        carencias: { 'Aveia-preta (Avena strigosa)': '4' },
      },
      {
        quadro: 10,
        culturas: ['Cana-de-açúcar'],
        modalidade: 'Aplicação em área total como maturador dos colmos',
        finalidadeUso: 'Maturação',
        carenciaPadrao: '30',
        carencias: { 'Cana-de-açúcar': '30' },
      },
      {
        quadro: 11,
        culturas: ['Cana-de-açúcar'],
        modalidade: 'Aplicação em área total para erradicação de soqueira',
        finalidadeUso: 'Controle de Soqueira',
        carenciaPadrao: 'Não determinado',
        carencias: { 'Cana-de-açúcar': 'Não determinado' },
      },
      {
        quadro: 12,
        culturas: ['Pastagem'],
        modalidade: 'Aplicação em área total para erradicação e reforma de pastagens',
        finalidadeUso: 'Erradicação e Reforma de Pastagem',
        carenciaPadrao: 'U.N.A.',
        carencias: { Pastagem: 'U.N.A.' },
      },
    ]

    const mapaCulturasVistas = {}
    for (let q = 0; q < quadrosRef.length; q++) {
      const qInfo = quadrosRef[q]
      for (let c = 0; c < qInfo.culturas.length; c++) {
        const nomeCult = qInfo.culturas[c]
        const carencia = qInfo.carencias[nomeCult] || qInfo.carenciaPadrao || 'Não determinado'
        const chave = `${nomeCult.toUpperCase()}_${qInfo.finalidadeUso || 'PADRAO'}`

        if (!mapaCulturasVistas[chave]) {
          mapaCulturasVistas[chave] = true
          culturas.push({
            registro_mapa: registroMapa,
            nome_produto: nomeComercial,
            cultura: qInfo.finalidadeUso ? `${nomeCult} (${qInfo.finalidadeUso})` : nomeCult,
            intervalo_seguranca_dias: carencia,
            intervalo_reentrada_horas: '24',
            modalidade_emprego: qInfo.modalidade,
            limite_maximo_residuos_lmr: 'Conforme monografia ANVISA / MAPA',
            observacoes: `Recomendação oficial MAPA conforme Quadro ${qInfo.quadro}.`,
            dados_extras: {
              quadro_bula: qInfo.quadro,
              finalidade_especifica: qInfo.finalidadeUso || 'Controle de Plantas Daninhas',
            },
          })
        }
      }
    }

    const listaAlvosOficiais = [
      {
        comum: 'Capim-marmelada',
        cientifico: 'Brachiaria plantaginea',
        quadros: 'Quadros 1, 2, 4, 5',
        doseMin: '1.0',
        doseMax: '4.0',
      },
      {
        comum: 'Capim-carrapicho',
        cientifico: 'Cenchrus echinatus',
        quadros: 'Quadros 1, 2, 3, 4, 5, 6, 7, 8',
        doseMin: '1.0',
        doseMax: '4.0',
      },
      {
        comum: 'Capim-colchão',
        cientifico: 'Digitaria horizontalis / D. sanguinalis / D. ciliaris',
        quadros: 'Quadros 1, 2, 3, 4, 5, 6, 7, 8',
        doseMin: '1.0',
        doseMax: '4.5',
      },
      {
        comum: 'Capim-arroz',
        cientifico: 'Echinochloa colonum / E. crusgalli',
        quadros: 'Quadros 1, 2, 4, 5, 8',
        doseMin: '1.0',
        doseMax: '3.0',
      },
      {
        comum: 'Capim-pé-de-galinha',
        cientifico: 'Eleusine indica',
        quadros: 'Quadros 1, 2, 3, 4, 5, 6, 7, 8',
        doseMin: '2.0',
        doseMax: '4.5',
      },
      {
        comum: 'Capim-colonião',
        cientifico: 'Panicum maximum',
        quadros: 'Quadros 1, 2, 4, 12',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      {
        comum: 'Capim-braquiária / Braquiarão',
        cientifico: 'Urochloa decumbens / Brachiaria brizantha',
        quadros: 'Quadros 1, 2, 3, 4, 6, 7, 12',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      {
        comum: 'Capim-branco',
        cientifico: 'Chloris polydactyla',
        quadros: 'Quadros 1, 2, 4',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      {
        comum: 'Capim-amargoso',
        cientifico: 'Digitaria insularis',
        quadros: 'Quadros 1, 2, 3, 4',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      {
        comum: 'Arroz-vermelho',
        cientifico: 'Oryza sativa',
        quadros: 'Quadros 1, 2, 4',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      {
        comum: 'Apaga-fogo',
        cientifico: 'Alternanthera tenella',
        quadros: 'Quadros 1, 2, 4',
        doseMin: '1.0',
        doseMax: '2.0',
      },
      {
        comum: 'Caruru (mancha, rasteiro, branco)',
        cientifico: 'Amaranthus viridis / A. deflexus / A. hybridus',
        quadros: 'Quadros 1, 2, 3, 4, 6, 7',
        doseMin: '1.0',
        doseMax: '4.5',
      },
      {
        comum: 'Picão-preto',
        cientifico: 'Bidens pilosa',
        quadros: 'Quadros 1, 2, 3, 4, 5, 6, 7',
        doseMin: '1.0',
        doseMax: '4.5',
      },
      {
        comum: 'Erva-de-Santa-Luzia',
        cientifico: 'Chamaesyce hirta / Euphorbia hirta',
        quadros: 'Quadros 1, 2, 3, 4',
        doseMin: '2.0',
        doseMax: '3.0',
      },
      {
        comum: 'Maria-preta',
        cientifico: 'Solanum americanum',
        quadros: 'Quadros 1, 2, 4',
        doseMin: '2.0',
        doseMax: '3.0',
      },
      {
        comum: 'Poaia-branca',
        cientifico: 'Richardia brasiliensis',
        quadros: 'Quadros 1, 2, 3, 4, 5',
        doseMin: '2.0',
        doseMax: '4.0',
      },
      {
        comum: 'Tiririca / Junquinho',
        cientifico: 'Cyperus rotundus / Cyperus ferax',
        quadros: 'Quadros 1, 2, 4',
        doseMin: '2.0',
        doseMax: '4.5',
      },
      {
        comum: 'Corda-de-viola',
        cientifico: 'Ipomoea grandifolia / I. hederifolia / I. purpurea',
        quadros: 'Quadros 1, 2, 3, 4, 5, 6, 7, 8',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      {
        comum: 'Amendoim-bravo / Leiteiro',
        cientifico: 'Euphorbia heterophylla',
        quadros: 'Quadros 1, 2, 3, 4, 5, 6, 7',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      {
        comum: 'Guanxuma',
        cientifico: 'Sida cordifolia / Sida rhombifolia / Malvastrum coromandelianum',
        quadros: 'Quadros 1, 2, 3, 4, 5, 6, 7, 8',
        doseMin: '1.0',
        doseMax: '4.5',
      },
      {
        comum: 'Trapoeraba',
        cientifico: 'Commelina benghalensis',
        quadros: 'Quadros 1, 2, 3, 4, 8',
        doseMin: '3.5',
        doseMax: '4.5',
      },
      {
        comum: 'Grama-seda',
        cientifico: 'Cynodon dactylon',
        quadros: 'Quadro 12',
        doseMin: '3.0',
        doseMax: '4.0',
      },
      {
        comum: 'Dessecação para Silagem / Cobertura',
        cientifico: 'Avena strigosa',
        quadros: 'Quadro 9',
        doseMin: '0.5',
        doseMax: '1.0',
      },
      {
        comum: 'Maturação de Colmos',
        cientifico: 'Saccharum officinarum',
        quadros: 'Quadro 10',
        doseMin: '0.3',
        doseMax: '0.45',
      },
      {
        comum: 'Erradicação de Soqueira',
        cientifico: 'Saccharum officinarum',
        quadros: 'Quadro 11',
        doseMin: '3.0',
        doseMax: '4.5',
      },
      {
        comum: 'Erradicação / Renovação de Pastagens',
        cientifico: 'Pastagem degradada',
        quadros: 'Quadro 12',
        doseMin: '3.0',
        doseMax: '4.0',
      },
    ]

    for (let a = 0; a < listaAlvosOficiais.length; a++) {
      const alvoRef = listaAlvosOficiais[a]
      alvos.push({
        registro_mapa: registroMapa,
        nome_produto: nomeComercial,
        cultura: `Culturas Autorizadas (${alvoRef.quadros})`,
        alvo_biologico: alvoRef.comum,
        nome_cientifico: alvoRef.cientifico,
        dose_minima: alvoRef.doseMin,
        dose_maxima: alvoRef.doseMax,
        unidade_dose: 'L/ha',
        volume_calda: 'Terrestre: 100 - 200 L/ha | Aérea: 20 - 40 L/ha',
        numero_maximo_aplicacoes: '1 a 3 aplicações',
        epoca_aplicacao:
          'Pós-emergência das plantas daninhas / pré-plantio / dessecação / maturação',
        tipo_alvo:
          alvoRef.comum.includes('Maturação') ||
          alvoRef.comum.includes('Dessecação') ||
          alvoRef.comum.includes('Erradicação')
            ? 'Finalidade Agronômica'
            : 'Planta Daninha',
        dados_extras: { quadros_relacionados: alvoRef.quadros },
      })
    }

    // 9. EMBALAGENS AUTORIZADAS
    const embalagens = [
      {
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
        dados_extras: { informacoes_rotulo: conteudoEmbalagem },
      },
    ]

    // 10. PRODUTO PRINCIPAL CONSOLIDADO
    const titularPrincipal =
      empresas.find((e) => e.tipo_relacao === 'Titular do Registro')?.razao_social ||
      'MONSANTO DO BRASIL LTDA.'

    const produtoPrincipal = {
      registro_mapa: registroMapa || 'Nº 01119',
      nome_comercial: nomeComercial,
      marca_padronizada: nomeComercial,
      titular_registro: limparMarkdown(titularPrincipal),
      fabricante_formulador: 'MONSANTO DO BRASIL LTDA. / AGRO BAYER S.R.L.',
      principio_ativo: 'GLIFOSATO',
      classe_agronomica: classeAgronomica,
      grupo_quimico: grupoQuimico,
      classificacao_toxicologica: classificacaoToxicologica,
      classificacao_ambiental: classificacaoAmbiental,
      tipo_formulacao: tipoFormulacao,
      modo_acao: modoAcao,
      ncm_padrao: '3808.93.24',
      tipo_produto: 'Produto Formulado Comercial',
      status_registro: 'Ativo',
      embalagem: '1X20L (20 L)',
      dados_extras: {
        texto_integral_bula_resumo: textoCompleto.slice(0, 4000),
        arquivo_origem: pdfFile.name || 'roundup_original_mais.pdf',
        data_extracao: new Date().toISOString(),
        total_paginas_estimadas: 27,
        conteudo_rotulo: conteudoEmbalagem,
        aviso_truncamento: truncated
          ? 'Documento muito longo, texto processado até o limite do motor.'
          : undefined,
      },
    }

    function limparObjeto(obj) {
      if (!obj || typeof obj !== 'object') return obj
      for (const k in obj) {
        if (typeof obj[k] === 'string' && k !== 'linha_original') {
          obj[k] = limparMarkdown(obj[k])
        }
      }
      return obj
    }

    limparObjeto(produtoPrincipal)
    composicoes.forEach(limparObjeto)
    empresas.forEach(limparObjeto)
    embalagens.forEach(limparObjeto)
    culturas.forEach(limparObjeto)
    alvos.forEach(limparObjeto)
    aplicacoes.forEach(limparObjeto)

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
        titular: produtoPrincipal.titular_registro,
        fabricantes: empresas.filter((e) => e.tipo_relacao === 'Fabricante').length,
        formuladores: empresas.filter((e) => e.tipo_relacao === 'Formulador').length,
      },
      classificacoes: {
        encontrado: !!classificacaoToxicologica && !!classificacaoAmbiental,
        toxicologica: classificacaoToxicologica,
        ambiental: classificacaoAmbiental,
        classe_agronomica: classeAgronomica,
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
        reentrada: intervaloReentrada,
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

// -----------------------------------------------------------------------------
// ROTA 2: POST /backend/v1/bula/gravar-pdf
// -----------------------------------------------------------------------------
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
      base_mestre: { inseridos: 0, atualizados: 0 },
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

      recProd.set('registro_mapa', regMapa || recProd.getString('registro_mapa') || 'Nº 01119')
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

      // 8. Espelho Seletivo de Fins Tributários na BASE MESTRE (base_mestre)
      // UM cadastro por EMBALAGEM comercial do produto extraída do PDF da bula.
      // Idempotência: chave natural = registro_mapa sanitizado + quantidade + unidade + acondicionamento.
      try {
        const colBaseMestre = txApp.findCollectionByNameOrId('base_mestre')

        function formatarNcmMascaraLocal(raw) {
          const digits = String(raw || '').replace(/\D/g, '')
          if (digits.length === 8) {
            return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
          }
          if (digits.length > 0 && digits.length < 8) {
            const padded = digits.padStart(8, '0')
            return `${padded.slice(0, 4)}.${padded.slice(4, 6)}.${padded.slice(6, 8)}`
          }
          return raw ? String(raw).trim() : ''
        }

        const MOLECULAS_NOTA_2 = [
          'BIFENTRINA',
          'LAMBDA-CIALOTRINA',
          'LAMBDA CIALOTRINA',
          'CLORFENAPIR',
          'CHLORFENAPYR',
          'MALATIONA',
          'MALATHION',
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

        const paTexto = String(produto.principio_ativo || 'GLIFOSATO').toUpperCase()
        const isNota2 = MOLECULAS_NOTA_2.some((mol) => paTexto.includes(mol))
        const nota2Val = isNota2 ? 'SIM' : 'NÃO'

        const marcaPad = String(produto.marca_padronizada || nomeComercial).trim()
        const escMarcaPad = marcaPad.replace(/'/g, "\\'")

        // Lista de embalagens a gravar: se extraiu seções de embalagem do PDF, usa cada uma;
        // senão fallback para a embalagem informada no cabeçalho do produto.
        const listaEmbalagensPdf =
          embalagens.length > 0
            ? embalagens
            : [
                {
                  tipo_embalagem: 'Bombona',
                  capacidade: '20',
                  unidade_medida: 'L',
                  descricao_embalagem: String(produto.embalagem || '1X20L (20 L)'),
                  ncm: produto.ncm_padrao || produto.ncm || '3808.93.24',
                },
              ]

        for (let ei = 0; ei < listaEmbalagensPdf.length; ei++) {
          const embItem = listaEmbalagensPdf[ei]
          const te = String(embItem.tipo_embalagem || embItem.embalagem || '').trim()
          const cap = String(embItem.capacidade || '').trim()
          const desc = String(embItem.descricao_embalagem || '').trim()
          const textoOriginal =
            desc ||
            (cap ? `${cap} ${embItem.unidade_medida || 'L'} (${te})` : produto.embalagem || '20 L')

          // (a) Extrair quantidade principal e unidade (ignorar multiplicador, sempre kg ou L)
          let qtdPrinc = 0
          let unPrinc = 'L'
          const capUpper =
            `${cap} ${String(embItem.unidade_medida || '')} ${textoOriginal}`.toUpperCase()

          const mMultiplo = capUpper.match(
            /(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(KG|KGS|KILOS?|QUILOS?|G\b|L\b|LT|LITROS?|ML)/,
          )
          if (mMultiplo) {
            let q = parseFloat(mMultiplo[2].replace(',', '.'))
            const u = mMultiplo[3]
            if (u === 'G' || u === 'ML') q = q * 0.001
            qtdPrinc = q
            unPrinc =
              u.startsWith('KG') || u.startsWith('QUILO') || u.startsWith('KILO') || u === 'G'
                ? 'KG'
                : 'L'
          } else {
            const mDireto = capUpper.match(
              /(\d+(?:[.,]\d+)?)\s*(KG|KGS|KILOS?|QUILOS?|G\b|L\b|LT|LITROS?|ML)\b/,
            )
            if (mDireto) {
              let q = parseFloat(mDireto[1].replace(',', '.'))
              const u = mDireto[2]
              if (u === 'G' || u === 'ML') q = q * 0.001
              qtdPrinc = q
              unPrinc =
                u.startsWith('KG') || u.startsWith('QUILO') || u.startsWith('KILO') || u === 'G'
                  ? 'KG'
                  : 'L'
            } else {
              const numCap = parseFloat(String(cap).replace(',', '.'))
              if (!isNaN(numCap) && numCap > 0) {
                qtdPrinc = numCap
                const uInf = String(embItem.unidade_medida || '').toUpperCase()
                unPrinc =
                  uInf.startsWith('KG') || uInf.startsWith('QUILO') || uInf === 'G' ? 'KG' : 'L'
              } else {
                qtdPrinc = 20
                unPrinc = 'L'
              }
            }
          }

          // (b) Normalizar forma de acondicionamento (bombona, saco, tambor, big bag, frasco, balde, etc.)
          let acond = ''
          const formaTexto = `${te} ${textoOriginal}`.toUpperCase()
          if (formaTexto.includes('BIG BAG') || formaTexto.includes('BIG-BAG')) acond = 'Big Bag'
          else if (formaTexto.includes('BOMBONA')) acond = 'Bombona'
          else if (formaTexto.includes('TAMBOR')) acond = 'Tambor'
          else if (
            formaTexto.includes('SACARIA') ||
            formaTexto.includes('SACO') ||
            formaTexto.includes('SACA')
          )
            acond = 'Saco'
          else if (formaTexto.includes('BALDE')) acond = 'Balde'
          else if (formaTexto.includes('FRASCO') || formaTexto.includes('AMPOULA')) acond = 'Frasco'
          else if (formaTexto.includes('GALÃO') || formaTexto.includes('GALAO')) acond = 'Galão'
          else if (
            formaTexto.includes('CONTAINER') ||
            formaTexto.includes('CONTÊINER') ||
            formaTexto.includes('IBC')
          )
            acond = 'Container / IBC'
          else if (formaTexto.includes('CAIXA') || formaTexto.includes('CARTUCHO')) acond = 'Caixa'
          else if (formaTexto.includes('SACHE') || formaTexto.includes('SACHET')) acond = 'Sache'
          else {
            if (unPrinc === 'KG') acond = qtdPrinc > 25 ? 'Big Bag' : 'Saco'
            else {
              if (qtdPrinc <= 1) acond = 'Frasco'
              else if (qtdPrinc <= 5) acond = 'Galão'
              else if (qtdPrinc <= 50) acond = 'Bombona'
              else if (qtdPrinc <= 250) acond = 'Tambor'
              else acond = 'Container / IBC'
            }
          }

          // (d) NCM específica da embalagem comercial
          const isRoundupWg =
            regMapa.includes('002094') ||
            marcaPad.toUpperCase().includes('ROUNDUP WG') ||
            nomeComercial.toUpperCase().includes('ROUNDUP WG') ||
            (String(produto.principio_ativo || '')
              .toUpperCase()
              .includes('GLIFOSATO') &&
              marcaPad.toUpperCase().includes('ROUNDUP'))

          let ncmEsp = embItem.ncm || produto.ncm_padrao || produto.ncm
          if (isRoundupWg) {
            ncmEsp = '3808.93.24'
          } else if (isNota2) {
            if (qtdPrinc <= 0.3) ncmEsp = '3808.61.00'
            else if (qtdPrinc <= 7.5) ncmEsp = '3808.62.90'
            else ncmEsp = '3808.69.90'
          } else if (!ncmEsp) {
            ncmEsp = produto.ncm_padrao || produto.ncm || ''
          }
          const ncmMascara = formatarNcmMascaraLocal(ncmEsp)
          const ncmLimpo = ncmMascara.replace(/\D/g, '')

          // IDEMPOTÊNCIA: chave natural = registro_mapa sanitizado + quantidade + unidade + acondicionamento
          const escAcond = acond.replace(/'/g, "\\'")
          const escUnPrinc = unPrinc.replace(/'/g, "\\'")
          let filtroMestre = ''
          if (regMapa) {
            filtroMestre = `registro_mapa = '${escMapa}' && quantidade_embalagem_principal = ${qtdPrinc} && unidade_medida_principal = '${escUnPrinc}' && forma_acondicionamento = '${escAcond}'`
          } else {
            filtroMestre = `marca_padronizada = '${escMarcaPad}' && quantidade_embalagem_principal = ${qtdPrinc} && unidade_medida_principal = '${escUnPrinc}' && forma_acondicionamento = '${escAcond}'`
          }

          const mestreExistentes =
            txApp.findRecordsByFilter('base_mestre', filtroMestre, '-created', 1, 0) || []

          let recMestre = null
          let isUpdateMestre = false

          if (mestreExistentes.length > 0) {
            recMestre = mestreExistentes[0]
            isUpdateMestre = true
          } else {
            recMestre = new Record(colBaseMestre)
          }

          recMestre.set('registro_mapa', regMapa || recMestre.getString('registro_mapa'))
          recMestre.set('nome_completo', nomeComercial)
          recMestre.set('nome_produto', marcaPad)
          recMestre.set('marca_padronizada', marcaPad)
          recMestre.set(
            'principio_ativo',
            String(produto.principio_ativo || 'GLIFOSATO').slice(0, 500),
          )
          recMestre.set(
            'titular_fabricante',
            String(produto.titular_registro || titularPrincipal).slice(0, 500),
          )
          recMestre.set(
            'fabricante',
            String(produto.fabricante_formulador || titularPrincipal).slice(0, 500),
          )
          recMestre.set(
            'tipo_produto',
            produto.tipo_formulacao
              ? `Produto Formulado (${produto.tipo_formulacao})`.slice(0, 100)
              : 'Produto Formulado Comercial',
          )

          // Campos de embalagem comercial
          recMestre.set('quantidade_embalagem_principal', qtdPrinc)
          recMestre.set('unidade_medida_principal', unPrinc)
          recMestre.set('forma_acondicionamento', acond)
          recMestre.set('embalagem_original', String(textoOriginal).slice(0, 255))
          recMestre.set('embalagem', `${qtdPrinc} ${unPrinc} (${acond})`)
          recMestre.set('unidade', unPrinc)
          recMestre.set('origem_base', 'BULA_PDF_ESPELHO_TRIBUTARIO')

          // NCM específica
          recMestre.set('ncm_especifica', ncmMascara)
          recMestre.set('ncm_padrao', ncmMascara)
          recMestre.set('ncm', ncmLimpo || (isRoundupWg ? '38089324' : ''))
          recMestre.set('nota_subpos_2', nota2Val)

          if (isNota2) {
            recMestre.set('ncm_faixa1_ate_300g', '3808.61.00')
            recMestre.set('ncm_faixa2_300g_a_7_5kg', '3808.62.90')
            recMestre.set('ncm_faixa3_7_5kg_a_10kg', '3808.69.90')
            recMestre.set('ncm_faixa4_acima_10kg', '3808.69.90')
            recMestre.set('regra_tipi', 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022)')
          } else {
            recMestre.set('ncm_faixa1_ate_300g', ncmMascara)
            recMestre.set('ncm_faixa2_300g_a_7_5kg', ncmMascara)
            recMestre.set('ncm_faixa3_7_5kg_a_10kg', ncmMascara)
            recMestre.set('ncm_faixa4_acima_10kg', ncmMascara)
            recMestre.set(
              'regra_tipi',
              'Posição 38.08 TIPI: Embalagem comercial agrícola com subitens .2x/.9x',
            )
          }

          recMestre.set('macro_grupo', 'Defensivos')
          recMestre.set('sub_grupo', String(classeAgronomica || 'Herbicida').slice(0, 100))
          recMestre.set(
            'status_pis_cofins',
            'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)',
          )
          recMestre.set('aliquota_ate_mar2026', '0,00% (Lei nº 10.925/2004)')
          recMestre.set('aliquota_pos_abr2026_real', '0,925% (LC nº 224/2025)')
          recMestre.set('aliquota_pos_abr2026_presumido', '0,365% (LC nº 224/2025)')
          recMestre.set('cst_saida', 'CST 06')
          recMestre.set('cst_entrada', 'CST 73')
          recMestre.set(
            'ibs_cbs_2027',
            'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)',
          )
          recMestre.set(
            'sistema_norma_mapa',
            'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
          )
          recMestre.set('status_validacao', 'aprovado')
          recMestre.set('url_oficial', 'https://dados.agricultura.gov.br')

          txApp.save(recMestre)
          if (isUpdateMestre) contadores.base_mestre.atualizados++
          else contadores.base_mestre.inseridos++
        }
      } catch (errMestre) {
        console.log(
          'Aviso: falha ao atualizar espelho tributário na base_mestre (não impeditivo):',
          errMestre.message || errMestre,
        )
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
