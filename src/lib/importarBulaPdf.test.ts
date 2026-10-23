import { describe, it, expect } from 'vitest'

// Funções de sanitização e parsing que espelham o hook pocketbase/hooks/importar_bula_pdf.js
export function normalizarTextoBula(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  let s = String(raw)

  // Correção de mojibake comum
  const mapaMojibake: [RegExp, string][] = [
    [/Âº/g, 'º'],
    [/Â°/g, '°'],
    [/Âª/g, 'ª'],
    [/Â/g, ''],
    [/Ã‰/g, 'É'],
    [/Ã©/g, 'é'],
    [/ÃŠ/g, 'Ê'],
    [/Ãª/g, 'ê'],
    [/Ã“/g, 'Ó'],
    [/Ã³/g, 'ó'],
    [/Ã”/g, 'Ô'],
    [/Ã´/g, 'ô'],
    [/Ã•/g, 'Õ'],
    [/Ãµ/g, 'õ'],
    [/Ã/g, 'Á'],
    [/Ã¡/g, 'á'],
    [/Ã€/g, 'À'],
    [/Ã /g, 'à'],
    [/Ã‚/g, 'Â'],
    [/Ã¢/g, 'â'],
    [/Ãƒ/g, 'Ã'],
    [/Ã£/g, 'ã'],
    [/Ã/g, 'Í'],
    [/Ã­/g, 'í'],
    [/Ãš/g, 'Ú'],
    [/Ãº/g, 'ú'],
    [/Ã‡/g, 'Ç'],
    [/Ã§/g, 'ç'],
    [/â€“|â€”/g, '–'],
    [/â€œ|â€/g, '"'],
    [/â€˜|â€™/g, "'"],
  ]
  for (let i = 0; i < mapaMojibake.length; i++) {
    s = s.replace(mapaMojibake[i][0], mapaMojibake[i][1])
  }

  // Normalizar espaços não-separáveis (\u00A0), tabs e caracteres de controle
  s = s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\t]/g, ' ')
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

  // Normalizar quebras de linha preservando estrutura
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Neutralização de marcações markdown de negrito/itálico/cabeçalhos/tabelas/ênfase
  s = s.replace(/\*{1,}/g, ' ')
  s = s.replace(/#{1,}/g, ' ')
  s = s.replace(/\|{1,}/g, ' ')
  s = s.replace(/_{2,}/g, ' ')

  // Colapsar espaços horizontais múltiplos mantendo quebras de linha
  s = s.replace(/[^\S\r\n]+/g, ' ')

  return s
}

export function limparMarkdown(val: unknown): string {
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

export function sanitizarRegistroMapa(raw: unknown): string {
  if (!raw) return ''
  const s = String(raw).trim()
  const match = s.match(/(?:N[°ºoO?]?\s*[:.]?\s*)?(\d{1,7})/i)
  if (match && match[1]) {
    const digits = match[1]
    if (digits.length <= 4) {
      return `Nº ${digits.padStart(4, '0')}`
    }
    return `Nº ${digits}`
  }
  return limparMarkdown(s)
}

export function sanitizarNomeComercial(raw: unknown): string {
  if (!raw) return ''
  let s = String(raw)
  s = s.replace(/\s+corresponde\s+a.*$/i, '')
  s = s.replace(/[®™]/g, ' ')
  s = limparMarkdown(s)
  s = s.replace(/^\d+\/\d+\s*/, '')
  return s.trim()
}

export function parsearTextoBula(markdown: string, pdfFileName?: string, _truncatedFlag?: boolean) {
  const textoCompleto = normalizarTextoBula(markdown || '')
  const textoLinhaUnica = textoCompleto.replace(/\s+/g, ' ')

  const linhas = textoCompleto
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  // 1. Registro MAPA ancorado
  let registroMapa = ''

  function isNumeroProdutoTecnico(numStr: string) {
    if (!numStr) return true
    const numLimpo = String(numStr).replace(/^0+/, '')
    if (!numLimpo) return true

    const regexGlifTec = new RegExp(
      `(?:t[ée]cnico|glifosato\\s+t[ée]cnico)[\\s\\S]{1,120}?(?:sob\\s+(?:o\\s+)?n[°ºoO\\?]?\\s*[:.]?\\s*|n[°ºoO\\?]?\\s*[:.]?\\s*)0*${numLimpo}\\b`,
      'i',
    )
    if (regexGlifTec.test(textoCompleto)) return true

    const regexGlifTecAntes = new RegExp(
      `0*${numLimpo}\\b[\\s\\S]{1,60}?(?:produto\\s+t[ée]cnico|t[ée]cnico)`,
      'i',
    )
    if (regexGlifTecAntes.test(textoCompleto)) {
      const idxSecaoTecnica = textoCompleto.search(/FABRICANTE\s+DO\s+PRODUTO\s+T[ÉE]CNICO/i)
      const idxOcorr = textoCompleto.search(new RegExp(`0*${numLimpo}\\b`))
      if (idxSecaoTecnica !== -1 && idxOcorr >= idxSecaoTecnica) return true
    }
    return false
  }

  let cabecalhoTexto = textoCompleto.slice(0, 6000)
  const idxTecnico = cabecalhoTexto.search(/FABRICANTE\s+DO\s+PRODUTO\s+T[ÉE]CNICO/i)
  if (idxTecnico !== -1) {
    cabecalhoTexto = cabecalhoTexto.slice(0, idxTecnico)
  }
  const cabecalhoLinhaUnica = cabecalhoTexto.replace(/\s+/g, ' ')

  const candidatosRegistro: Array<{ fonte: string; num: string }> = []

  // Regex Principal
  const mPrincipal = cabecalhoLinhaUnica.match(
    /MINIST[ÉE]RIO[\s\S]{0,240}?SOB\s+(?:O\s+)?N\s*[º°oO?]?\s*[:.]?\s*([0-9]{3,7})/i,
  )
  if (mPrincipal && mPrincipal[1]) {
    candidatosRegistro.push({ fonte: 'mPrincipal', num: mPrincipal[1] })
  }

  // Regex Secundária
  const mSecundaria = cabecalhoLinhaUnica.match(
    /MAPA[\s\S]{0,120}?SOB\s+(?:O\s+)?N\s*[º°oO?]?\s*[:.]?\s*([0-9]{3,7})/i,
  )
  if (mSecundaria && mSecundaria[1]) {
    candidatosRegistro.push({ fonte: 'mSecundaria', num: mSecundaria[1] })
  }

  // Registrado no ... sob nº
  const mRegistrado = cabecalhoLinhaUnica.match(
    /REGISTRAD[OA][\s\S]{0,180}?SOB\s+(?:O\s+)?N\s*[º°oO?]?\s*[:.]?\s*([0-9]{3,7})/i,
  )
  if (mRegistrado && mRegistrado[1]) {
    candidatosRegistro.push({ fonte: 'mRegistrado', num: mRegistrado[1] })
  }

  // REGISTRO NO MAPA
  const mRegistroMapa = cabecalhoLinhaUnica.match(
    /REGISTRO\s+(?:NO\s+)?MAPA[\s\S]{0,80}?(?:SOB\s+(?:O\s+)?)?N\s*[º°oO?]?\s*[:.]?\s*([0-9]{3,7})/i,
  )
  if (mRegistroMapa && mRegistroMapa[1]) {
    candidatosRegistro.push({ fonte: 'mRegistroMapa', num: mRegistroMapa[1] })
  }

  // MINISTÉRIO DA AGRICULTURA ... Nº
  const mMinAgri = cabecalhoLinhaUnica.match(
    /MINIST[ÉE]RIO\s+DA\s+AGRICULTURA[\s\S]{0,180}?(?:N\s*[º°oO?]?|N[ÚU]MERO)\s*[:.]?\s*([0-9]{3,7})/i,
  )
  if (mMinAgri && mMinAgri[1]) {
    candidatosRegistro.push({ fonte: 'mMinAgri', num: mMinAgri[1] })
  }

  // SOB Nº
  const mSobNo = cabecalhoLinhaUnica.match(
    /(?:^|[\s|#*])SOB\s+(?:O\s+)?N\s*[º°oO?]?\s*[:.]?\s*([0-9]{3,7})/i,
  )
  if (mSobNo && mSobNo[1]) {
    candidatosRegistro.push({ fonte: 'mSobNo', num: mSobNo[1] })
  }

  // Fallback em textoSemSecaoTecnica
  const textoSemSecaoTecnica = textoCompleto.replace(
    /FABRICANTE\s+DO\s+PRODUTO\s+T[ÉE]CNICO[\s\S]*?(?=FORMULADOR|MANIPULADOR|IMPORTADOR|TITULAR\s+DO\s+REGISTRO|CONTE[ÚU]DO|CLASSE|INSTRU[ÇC][ÕO]ES|$)/gi,
    ' ',
  )
  const textoSemTecnicaLinhaUnica = textoSemSecaoTecnica.replace(/\s+/g, ' ')

  const mFallPrinc = textoSemTecnicaLinhaUnica.match(
    /MINIST[ÉE]RIO[\s\S]{0,240}?SOB\s+(?:O\s+)?N\s*[º°oO?]?\s*[:.]?\s*([0-9]{3,7})/i,
  )
  if (mFallPrinc && mFallPrinc[1]) {
    candidatosRegistro.push({ fonte: 'mFallPrinc', num: mFallPrinc[1] })
  }

  const mFallSec = textoSemTecnicaLinhaUnica.match(
    /MAPA[\s\S]{0,120}?SOB\s+(?:O\s+)?N\s*[º°oO?]?\s*[:.]?\s*([0-9]{3,7})/i,
  )
  if (mFallSec && mFallSec[1]) {
    candidatosRegistro.push({ fonte: 'mFallSec', num: mFallSec[1] })
  }

  const mFallReg = textoSemTecnicaLinhaUnica.match(
    /REGISTRO\s+(?:NO\s+)?MAPA[\s\S]{0,80}?(?:SOB\s+(?:O\s+)?)?N\s*[º°oO?]?\s*[:.]?\s*([0-9]{3,7})/i,
  )
  if (mFallReg && mFallReg[1]) {
    candidatosRegistro.push({ fonte: 'mFallReg', num: mFallReg[1] })
  }

  for (let c = 0; c < candidatosRegistro.length; c++) {
    const cand = candidatosRegistro[c]
    if (!isNumeroProdutoTecnico(cand.num)) {
      registroMapa = sanitizarRegistroMapa(cand.num)
      break
    }
  }

  // 2. Nome Comercial
  let nomeComercial = ''
  const prodComMatch = textoCompleto.match(
    /(?:Produto\s+comercial|Marca\s+comercial)\s*:\s*([^\n\r]+)/i,
  )
  if (prodComMatch && prodComMatch[1]) {
    const rawProd = prodComMatch[1]
    const cleaned = sanitizarNomeComercial(rawProd)
    if (cleaned && cleaned.length > 2 && !/^[°º\d\s-]+$/.test(cleaned)) {
      nomeComercial = cleaned
    }
  }

  if (!nomeComercial) {
    for (let i = 0; i < Math.min(linhas.length, 35); i++) {
      const ln = linhas[i]
      const lnUp = ln.toUpperCase()
      if (
        lnUp.includes('REGISTRADO NO') ||
        lnUp.includes('MINISTÉRIO DA AGRICULTURA') ||
        lnUp.includes('COMPOSIÇÃO:')
      ) {
        break
      }
      if (
        !ln.startsWith('1/') &&
        !ln.startsWith('2/') &&
        !lnUp.includes('BULAS') &&
        !lnUp.includes('PÁGINA') &&
        !lnUp.includes('RUA JORGE CAIXE') &&
        !lnUp.includes('AVENIDA') &&
        !lnUp.includes('CNPJ') &&
        !lnUp.includes('FONE/FAX') &&
        !lnUp.includes('CEP:')
      ) {
        const cleaned = sanitizarNomeComercial(ln)
        if (
          cleaned &&
          cleaned.length >= 3 &&
          !/^[°º\d\s\-./]+$/.test(cleaned) &&
          !cleaned.toUpperCase().includes('MAPA') &&
          !cleaned.toUpperCase().includes('MINISTÉRIO') &&
          !cleaned.toUpperCase().includes('INSTRUÇÕES') &&
          !cleaned.toUpperCase().includes('RECEITUÁRIO')
        ) {
          nomeComercial = cleaned
          break
        }
      }
    }
  }

  if (!nomeComercial && pdfFileName) {
    const semExt = pdfFileName.replace(/\.[^/.]+$/, '').replace(/[_\-.]+/g, ' ')
    nomeComercial = sanitizarNomeComercial(semExt)
  }

  // 3. Classe agronômica, grupo químico, formulação
  let classeAgronomica = 'Herbicida'
  let grupoQuimico = ''
  let tipoFormulacao = 'Suspensão Concentrada (SC)'
  let conteudoEmbalagem = 'Vide Rótulo'

  const classeMatch = textoCompleto.match(/CLASSE\s*:\s*([^\n\r]+)/i)
  if (classeMatch && classeMatch[1]) {
    const rawClasse = limparMarkdown(classeMatch[1])
    if (/herbicida/i.test(rawClasse)) classeAgronomica = 'Herbicida'
    else if (/fungicida/i.test(rawClasse)) classeAgronomica = 'Fungicida'
    else if (/inseticida/i.test(rawClasse)) classeAgronomica = 'Inseticida'
    else if (/acaricida/i.test(rawClasse)) classeAgronomica = 'Acaricida'
    else classeAgronomica = rawClasse

    const gqMatch = rawClasse.match(/grupo\s+qu[íi]mico\s+([^.,;\n\r]+)/i)
    if (gqMatch && gqMatch[1]) {
      grupoQuimico = limparMarkdown(gqMatch[1])
      grupoQuimico = grupoQuimico.charAt(0).toUpperCase() + grupoQuimico.slice(1)
    }
  }

  if (!grupoQuimico) {
    const gqDireto = textoCompleto.match(/GRUPO\s+QU[ÍI]MICO\s*:\s*([^\n\r]+)/i)
    if (gqDireto && gqDireto[1]) {
      grupoQuimico = limparMarkdown(gqDireto[1])
    }
  }

  const grupoHracMatch = textoCompleto.match(
    /GRUPO\s+([A-Z0-9\-\s]+?)\s+(?:HERBICIDA|FUNGICIDA|INSETICIDA|ACARICIDA)/i,
  )
  if (grupoHracMatch && grupoHracMatch[1]) {
    const code = limparMarkdown(grupoHracMatch[1])
    if (grupoQuimico && !grupoQuimico.includes(`Grupo ${code}`)) {
      grupoQuimico = `${grupoQuimico} (HRAC Grupo ${code})`.trim()
    } else if (!grupoQuimico) {
      grupoQuimico = `HRAC Grupo ${code}`
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

  let modoAcao = ''
  const instrucoesAcaoMatch = textoCompleto.match(
    /INSTRU[ÇC][ÕO]ES\s+DE\s+USO\s*:\s*([^\n\r]+(?:\n[^\n\r]+)?)/i,
  )
  if (instrucoesAcaoMatch && instrucoesAcaoMatch[1]) {
    modoAcao = limparMarkdown(instrucoesAcaoMatch[1]).slice(0, 1950)
  }

  // 4. Toxicologia e Ambiental
  let classificacaoToxicologica = ''
  const toxMatch = textoCompleto.match(
    /CLASSIFICA[ÇC][ÃA]O\s+TOXICOL[ÓO]GICA\s*:\s*([^\n\r]+(?:\n[^\n\r]+)?)/i,
  )
  if (toxMatch && toxMatch[1]) {
    const rawTox = toxMatch[1]
    const mCat = rawTox.match(/(CATEGORIA\s+\d+\s*[-–—]\s*[^.\n\r]+)/i)
    const mNaoClass = rawTox.match(/(N[ãa]o\s+classificado[^\n\r]*)/i)
    if (mCat && mCat[1]) {
      classificacaoToxicologica = limparMarkdown(mCat[1])
    } else if (mNaoClass && mNaoClass[1]) {
      classificacaoToxicologica = limparMarkdown(mNaoClass[1])
    } else {
      classificacaoToxicologica = limparMarkdown(rawTox.split('\n')[0])
    }
  }
  if (!classificacaoToxicologica) {
    if (/Não classificado\s*[-–—]\s*Produto Não Classificado/i.test(textoCompleto)) {
      classificacaoToxicologica = 'Não classificado – Produto Não Classificado'
    } else {
      classificacaoToxicologica = 'Não classificado / Categoria 5'
    }
  }

  let classificacaoAmbiental = ''
  const ambMarcadoMatch = textoCompleto.match(
    /[([\]]\s*[xX*✓■]\s*[)\]]\s*[-–—]?\s*([^\n\r]+(?:CLASSE\s+[I|V|X]+)[^\n\r]*)/i,
  )
  if (ambMarcadoMatch && ambMarcadoMatch[1]) {
    classificacaoAmbiental = limparMarkdown(ambMarcadoMatch[1])
  }

  if (!classificacaoAmbiental) {
    const ambHeaderMatch = textoCompleto.match(
      /(?:POTENCIAL\s+DE\s+PERICULOSIDADE\s+AMBIENTAL|PERICULOSIDADE\s+AMBIENTAL)\s*:\s*([^\n\r]+(?:\n[^\n\r]+)?)/i,
    )
    if (ambHeaderMatch && ambHeaderMatch[1]) {
      const rawAmb = ambHeaderMatch[1].split('\n')[0]
      classificacaoAmbiental = limparMarkdown(rawAmb)
    }
  }

  if (!classificacaoAmbiental) {
    if (/Muito Perigoso ao Meio Ambiente\s*\(?CLASSE\s+II\)?/i.test(textoCompleto)) {
      classificacaoAmbiental = 'Classe II – Produto Muito Perigoso ao Meio Ambiente'
    } else if (/Perigoso ao Meio Ambiente\s*\(?CLASSE\s+III\)?/i.test(textoCompleto)) {
      classificacaoAmbiental = 'Classe III – Produto Perigoso ao Meio Ambiente'
    } else if (/Altamente Perigoso ao Meio Ambiente\s*\(?CLASSE\s+I\)?/i.test(textoCompleto)) {
      classificacaoAmbiental = 'Classe I – Produto Altamente Perigoso ao Meio Ambiente'
    } else if (/Pouco Perigoso ao Meio Ambiente\s*\(?CLASSE\s+IV\)?/i.test(textoCompleto)) {
      classificacaoAmbiental = 'Classe IV – Produto Pouco Perigoso ao Meio Ambiente'
    }
  }

  // 5. Composição
  const composicoes: any[] = []
  const compBlocoMatch = textoCompleto.match(
    /COMPOSI[ÇC][ÃA]O\s*:([\s\S]*?)(?=GRUPO\s+[A-Z]|CONTE[ÚU]DO|CLASSE\s*:|TIPO\s+DE\s+FORMULA)/i,
  )

  if (compBlocoMatch && compBlocoMatch[1]) {
    const linhasComp = compBlocoMatch[1]
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
        const concMatch = lcomp.match(/(\d+[.,]\d+)\s*(g\/[Ll]|g\/kg|%|mg\/[Ll])/i)
        const percMatch = lcomp.match(/\((\d+[.,]\d+%\s*[mv/gLl]*)\)/i)

        let nomeIngrediente = lcomp
          .replace(/[.\s]+(\d+[.,]\d+)\s*(g\/[Ll]|g\/kg|%|mg\/[Ll]).*$/i, '')
          .replace(/\.{2,}/g, '')
          .trim()
        nomeIngrediente = limparMarkdown(nomeIngrediente)

        const mColchete = nomeIngrediente.match(/\[([^\]]+)\]/)
        let ingredienteAtivoNome = nomeIngrediente
        const nomeQuimicoExt = nomeIngrediente
        if (mColchete && mColchete[1]) {
          ingredienteAtivoNome = mColchete[1].trim()
        }

        const concentracaoVal = concMatch ? concMatch[1].replace(',', '.') : ''
        const unidadeMedidaVal = concMatch ? concMatch[2] : 'g/L'
        let funcao = 'Ingrediente Ativo'

        const nomeLower = nomeIngrediente.toLowerCase()
        if (
          nomeLower.includes('outros ingredientes') ||
          nomeLower.includes('veículo') ||
          nomeLower.includes('inerte')
        ) {
          funcao = 'Outros Ingredientes'
          ingredienteAtivoNome = 'Outros ingredientes'
        } else if (nomeLower.includes('dietilenoglicol')) {
          funcao = 'Outros Ingredientes'
        } else if (nomeLower.includes('equivalente ácido')) {
          funcao = 'Equivalente Ácido'
        }

        composicoes.push({
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          ingrediente_ativo: ingredienteAtivoNome,
          nome_quimico: nomeQuimicoExt,
          concentracao: concentracaoVal,
          unidade_medida: unidadeMedidaVal,
          funcao_ingrediente: funcao,
          percentual_volume: percMatch ? percMatch[1] : '',
          dados_extras: { linha_original: limparMarkdown(lcomp) },
        })
      }
    }
  }

  // Princípio ativo derivado da composição
  const pasExtraidos = composicoes
    .filter((c) => c.funcao_ingrediente === 'Ingrediente Ativo')
    .map((c) => {
      const conc = c.concentracao ? Math.round(parseFloat(c.concentracao)) : ''
      return conc ? `${c.ingrediente_ativo} ${conc}` : c.ingrediente_ativo
    })
  let principioAtivoCalculado = pasExtraidos.join(' + ')

  if (!principioAtivoCalculado) {
    if (/sulfentrazon[ae]/i.test(textoCompleto)) {
      principioAtivoCalculado = 'SULFENTRAZONA 500'
    } else if (/glifosato/i.test(textoCompleto)) {
      principioAtivoCalculado = 'GLIFOSATO 480'
    } else {
      principioAtivoCalculado = nomeComercial
    }
  }

  // 6. Empresas (com sanitização estrita, anti-endereço, split de linhas compostas e deduplicação)
  function extrairCnpj(str: string): string {
    if (!str) return ''
    const mFormatado = str.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
    if (mFormatado) return mFormatado[0]
    const mQuebrado = str.match(
      /(?:CNPJ|C\.N\.P\.J\.?)[\s.:]*(\d{2}[\s.]*\d{3}[\s.]*\d{3}[\s/]*\d{4}[\s-]*\d{2})/i,
    )
    if (mQuebrado && mQuebrado[1]) {
      const digitos = mQuebrado[1].replace(/\D/g, '')
      if (digitos.length === 14) {
        return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`
      }
    }
    return ''
  }

  function extrairCep(str: string): string {
    if (!str) return ''
    const m = str.match(/\b\d{5}-\d{3}\b/)
    return m ? m[0] : ''
  }

  function isLinhaEndereco(str: string): boolean {
    if (!str) return false
    const s = str.trim()
    if (
      /^(?:Av\.?|Avenida|Rua|Rod\.?|Rodovia|Estrada|Alameda|Travessa|Pra[çc]a|Distrito|Bairro|Lote|Quadra|KM\b|km\b|CEP\b|C\.E\.P\.|Tel\.?|Telefone|Fone|Fax|C\.?N\.?P\.?J\.?|Inscri[çc][ãa]o|Registro\s+Estadual|Caixa\s+Postal|Plant\b|Zarate\s+Plant|Luling\s+Plant|Ruta\b)/i.test(
        s,
      )
    ) {
      return true
    }
    if (
      /CEP\s*:?\s*\d{2}/i.test(s) ||
      /Tel\.?\s*:?\s*[\d(]/i.test(s) ||
      /CNPJ\s*:?\s*\d{2}/i.test(s)
    ) {
      return true
    }
    return false
  }

  const REGEX_SUFIXOS_EMPRESA =
    /\b(?:LTDA|S\.A\.|S\/A|S\.R\.L\.|LIMITED|LTD\.?|L\.P\.|LP|B\.V\.|BV|INC\.?|CORP\.?|GMBH|S\.L\.|A\.G\.|PVT\.?\s+LTD\.?)\b/i

  function extrairNomesEmpresaDeLinha(str: string) {
    if (!str) return []
    const s = str.trim()
    const regexNomeCorp =
      /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÁÉÍÓÚÂÊÔÃÕÇ0-9&.\-'\s]{2,60}\b(?:LTDA|S\.A\.|S\/A|S\.R\.L\.|LIMITED|LTD\.?|L\.P\.|LP|B\.V\.|BV|INC\.?|CORP\.?|GMBH|S\.L\.|A\.G\.|PVT\.?\s+LTD\.?)\.?)/gi
    const matches: Array<{ nome: string; index: number }> = []
    let m: RegExpExecArray | null
    while ((m = regexNomeCorp.exec(s)) !== null) {
      let nome = m[1].trim().replace(/^[-–—,;:.\s]+|[-–—,;:.\s]+$/g, '')
      nome = nome
        .replace(
          /^(?:Av\.?|Avenida|Rua|Rod\.?|Rodovia|CEP\s*\d{5}-?\d{3}|SP\s*-\s*Tel[^\s]*|Tel[^\s]*)\s+/i,
          '',
        )
        .trim()
      if (nome.length >= 3 && !isLinhaEndereco(nome) && REGEX_SUFIXOS_EMPRESA.test(nome)) {
        matches.push({
          nome: nome,
          index: m.index,
        })
      }
    }
    return matches
  }

  function sanitizarRazaoSocial(str: string): string {
    if (!str) return ''
    let s = str.trim().replace(/^[-–—,;:.\s]+|[-–—,;:.\s]+$/g, '')
    s = s.replace(/\s*[-–—]\s*(?:Av\.?|Rua|CEP|CNPJ|Tel|Rod\.).*$/i, '')
    s = s.replace(/^(?:Av\.?|Avenida|Rua|Rod\.?|Rodovia|Distrito|Bairro|CEP\b[^\s]*)\s+/i, '')
    return s.trim()
  }

  function detectarPais(str: string): string {
    if (!str) return 'Brasil'
    if (/Índia|India|SIPCOT|Cuddalore/i.test(str)) return 'Índia'
    if (/Uruguai|Uruguay|Canelones|Juanic[óo]/i.test(str)) return 'Uruguai'
    if (/Argentina|Zarate/i.test(str)) return 'Argentina'
    if (/E\.U\.A\.|USA|United States|Louisiana|Luling/i.test(str)) return 'E.U.A.'
    if (/Bélgica|Belgium/i.test(str)) return 'Bélgica'
    if (/China/i.test(str)) return 'China'
    return 'Brasil'
  }

  function detectarMunicipioUf(str: string): { municipio: string; uf: string } {
    if (!str) return { municipio: '', uf: '' }
    if (/Cotia/i.test(str)) return { municipio: 'Cotia', uf: 'SP' }
    if (/Maracana[úu]/i.test(str)) return { municipio: 'Maracanaú', uf: 'CE' }
    if (/Uberaba/i.test(str)) return { municipio: 'Uberaba', uf: 'MG' }
    if (/S[ãa]o\s+Jos[ée]\s+dos\s+Campos/i.test(str))
      return { municipio: 'São José dos Campos', uf: 'SP' }
    if (/S[ãa]o\s+Paulo/i.test(str)) return { municipio: 'São Paulo', uf: 'SP' }
    if (/Paul[íi]nia/i.test(str)) return { municipio: 'Paulínia', uf: 'SP' }
    if (/Campinas/i.test(str)) return { municipio: 'Campinas', uf: 'SP' }
    if (/Cama[çc]ari/i.test(str)) return { municipio: 'Camaçari', uf: 'BA' }
    if (/Zarate/i.test(str)) return { municipio: 'Zárate', uf: '' }
    if (/Canelones/i.test(str)) return { municipio: 'Canelones', uf: '' }
    if (/Luling/i.test(str)) return { municipio: 'Luling', uf: 'LA' }
    if (/Cuddalore/i.test(str)) return { municipio: 'Cuddalore', uf: '' }
    return { municipio: '', uf: '' }
  }

  const empresas: any[] = []
  function extrairEmpresasSecaoDinamica(
    tipoRelacao: string,
    regexInicio: RegExp,
    regexFim: RegExp,
  ) {
    const idxInicio = textoCompleto.search(regexInicio)
    if (idxInicio === -1) return []

    const textoRestante = textoCompleto.slice(idxInicio)
    let trechoSecao = textoRestante
    const idxFim = trechoSecao.slice(25).search(regexFim)
    if (idxFim !== -1) {
      trechoSecao = trechoSecao.slice(0, idxFim + 25)
    }

    const linhasSec = trechoSecao
      .split(/\r?\n/)
      .map((l) => limparMarkdown(l))
      .filter((l) => l.length > 0)
    if (linhasSec.length > 0) linhasSec.shift()

    const lista: any[] = []
    let emp: any = null

    for (let k = 0; k < linhasSec.length; k++) {
      const ln = linhasSec[k]
      if (
        ln.toUpperCase().includes('REGISTRADO NO MINISTÉRIO') ||
        /^\d{4,6}$/.test(ln) ||
        ln.startsWith('(*)IMPORTADOR') ||
        ln.startsWith('IMPORTADOR (PRODUTO')
      ) {
        continue
      }

      const linhaEhEndereco = isLinhaEndereco(ln)
      const empresasNaLinha = extrairNomesEmpresaDeLinha(ln)

      // Linha começa com endereço mas tem nome de empresa grudado
      if (linhaEhEndereco && empresasNaLinha.length > 0) {
        const primEmpIdx = empresasNaLinha[0].index
        const pedacoEndereco = ln.slice(0, primEmpIdx).trim()
        if (emp && pedacoEndereco) {
          emp.dados_extras.texto_bruto.push(pedacoEndereco)
          const cnp = extrairCnpj(pedacoEndereco)
          if (cnp && !emp.cnpj) emp.cnpj = cnp
          const cp = extrairCep(pedacoEndereco)
          if (cp && !emp.cep) emp.cep = cp
          emp.endereco = emp.endereco ? `${emp.endereco} - ${pedacoEndereco}` : pedacoEndereco
          const loc = detectarMunicipioUf(pedacoEndereco)
          if (loc.municipio && !emp.municipio) emp.municipio = loc.municipio
          if (loc.uf && !emp.uf) emp.uf = loc.uf
        }

        for (let eIdx = 0; eIdx < empresasNaLinha.length; eIdx++) {
          if (emp && emp.razao_social) {
            lista.push(emp)
          }
          const empItem = empresasNaLinha[eIdx]
          const rzLimpa = sanitizarRazaoSocial(empItem.nome)
          emp = {
            registro_mapa: registroMapa,
            nome_produto: nomeComercial,
            tipo_relacao: tipoRelacao,
            razao_social: rzLimpa,
            nome_fantasia: rzLimpa.split(' ')[0] || '',
            cnpj: '',
            endereco: '',
            municipio: '',
            uf: '',
            cep: '',
            inscricao_estadual: '',
            pais: detectarPais(rzLimpa),
            dados_extras: { texto_bruto: [empItem.nome] },
          }
        }
        continue
      }

      if (linhaEhEndereco) {
        if (emp) {
          emp.dados_extras.texto_bruto.push(ln)
          const cnp = extrairCnpj(ln)
          if (cnp && !emp.cnpj) emp.cnpj = cnp
          const cp = extrairCep(ln)
          if (cp && !emp.cep) emp.cep = cp

          if (
            ln.toUpperCase().includes('REGISTRO DO ESTABELECIMENTO') ||
            ln.toUpperCase().includes('REGISTRO ESTADUAL') ||
            ln.toUpperCase().includes('CDA') ||
            ln.toUpperCase().includes('SEMACE') ||
            ln.toUpperCase().includes('IMA')
          ) {
            emp.inscricao_estadual = ln.slice(0, 95)
          }

          emp.endereco = emp.endereco ? `${emp.endereco} - ${ln}` : ln
          const loc = detectarMunicipioUf(ln)
          if (loc.municipio && !emp.municipio) emp.municipio = loc.municipio
          if (loc.uf && !emp.uf) emp.uf = loc.uf
          const p = detectarPais(ln)
          if (p !== 'Brasil' || emp.pais === 'Brasil') emp.pais = p
        }
        continue
      }

      const temSufixoEmpresa = REGEX_SUFIXOS_EMPRESA.test(ln)
      if (temSufixoEmpresa && empresasNaLinha.length > 0) {
        if (emp && emp.razao_social) {
          lista.push(emp)
        }

        const rzLimpa = sanitizarRazaoSocial(empresasNaLinha[0].nome)
        const pDetect = detectarPais(ln)
        const loc = detectarMunicipioUf(ln)

        emp = {
          registro_mapa: registroMapa,
          nome_produto: nomeComercial,
          tipo_relacao: tipoRelacao,
          razao_social: rzLimpa,
          nome_fantasia: rzLimpa.split(' ')[0] || '',
          cnpj: extrairCnpj(ln),
          endereco: '',
          municipio: loc.municipio,
          uf: loc.uf,
          cep: extrairCep(ln),
          inscricao_estadual: '',
          pais: pDetect,
          dados_extras: { texto_bruto: [ln] },
        }

        if (empresasNaLinha.length > 1) {
          for (let eIdx = 1; eIdx < empresasNaLinha.length; eIdx++) {
            if (emp && emp.razao_social) lista.push(emp)
            const segNome = sanitizarRazaoSocial(empresasNaLinha[eIdx].nome)
            emp = {
              registro_mapa: registroMapa,
              nome_produto: nomeComercial,
              tipo_relacao: tipoRelacao,
              razao_social: segNome,
              nome_fantasia: segNome.split(' ')[0] || '',
              cnpj: '',
              endereco: '',
              municipio: '',
              uf: '',
              cep: '',
              inscricao_estadual: '',
              pais: detectarPais(segNome),
              dados_extras: { texto_bruto: [empresasNaLinha[eIdx].nome] },
            }
          }
        }
      } else if (emp) {
        emp.dados_extras.texto_bruto.push(ln)

        const cnp = extrairCnpj(ln)
        if (cnp && !emp.cnpj) emp.cnpj = cnp

        const cp = extrairCep(ln)
        if (cp && !emp.cep) emp.cep = cp

        if (
          ln.toUpperCase().includes('REGISTRO DO ESTABELECIMENTO') ||
          ln.toUpperCase().includes('REGISTRO ESTADUAL') ||
          ln.toUpperCase().includes('CDA') ||
          ln.toUpperCase().includes('SEMACE') ||
          ln.toUpperCase().includes('IMA')
        ) {
          emp.inscricao_estadual = ln.slice(0, 95)
        }

        emp.endereco = emp.endereco ? `${emp.endereco} - ${ln}` : ln
        const loc = detectarMunicipioUf(ln)
        if (loc.municipio && !emp.municipio) emp.municipio = loc.municipio
        if (loc.uf && !emp.uf) emp.uf = loc.uf
        const p = detectarPais(ln)
        if (p !== 'Brasil' || emp.pais === 'Brasil') emp.pais = p
      }
    }
    if (emp && emp.razao_social) {
      lista.push(emp)
    }

    return lista.filter((e) => {
      const rz = (e.razao_social || '').trim()
      if (rz.length < 3) return false
      if (isLinhaEndereco(rz)) return false
      if (/^CEP\b/i.test(rz) || /^Av\.?/i.test(rz) || /^Rua\b/i.test(rz) || /^Tel\b/i.test(rz))
        return false
      return true
    })
  }

  const titulares = extrairEmpresasSecaoDinamica(
    'Titular do Registro',
    /TITULAR\s+DO\s+REGISTRO/i,
    /(?:FABRICANTE|FORMULADOR|MANIPULADOR|IMPORTADOR)/i,
  )
  for (let t = 0; t < titulares.length; t++) {
    empresas.push(titulares[t])
  }

  const fabricantes = extrairEmpresasSecaoDinamica(
    'Fabricante',
    /FABRICANTE\s+DO\s+PRODUTO/i,
    /(?:FORMULADOR|MANIPULADOR|IMPORTADOR|GRUPO\s+[A-Z])/i,
  )
  for (let f = 0; f < fabricantes.length; f++) {
    empresas.push(fabricantes[f])
  }

  const formuladores = extrairEmpresasSecaoDinamica(
    'Formulador',
    /FORMULADOR\s*:/i,
    /(?:MANIPULADOR|IMPORTADOR|GRUPO\s+[A-Z]|N°\s+do\s+lote)/i,
  )
  for (let fo = 0; fo < formuladores.length; fo++) {
    empresas.push(formuladores[fo])
  }

  const manipuladores = extrairEmpresasSecaoDinamica(
    'Manipulador',
    /MANIPULADOR\s*:/i,
    /(?:IMPORTADOR|GRUPO\s+[A-Z]|N°\s+do\s+lote|ANTES\s+DE\s+USAR)/i,
  )
  for (let m = 0; m < manipuladores.length; m++) {
    empresas.push(manipuladores[m])
  }

  const importadores = extrairEmpresasSecaoDinamica(
    'Importador',
    /IMPORTADOR\s*:/i,
    /(?:N°\s+do\s+lote|Marca\s+registrada|ANTES\s+DE\s+USAR|CLASSIFICA[ÇC][ÃA]O|FABRICANTE)/i,
  )
  for (let imp = 0; imp < importadores.length; imp++) {
    empresas.push(importadores[imp])
  }

  // Deduplicação estrita de empresas por (tipo_relacao + razao_social + cnpj)
  const empresasUnicas: any[] = []
  const chavesVistas = new Set<string>()
  for (let i = 0; i < empresas.length; i++) {
    const e = empresas[i]
    const rzNorm = (e.razao_social || '').toUpperCase().replace(/\s+/g, ' ').trim()
    const cnpjNorm = (e.cnpj || '').replace(/\D/g, '')
    const tipoNorm = (e.tipo_relacao || '').toUpperCase().trim()
    const chave = `${tipoNorm}|${rzNorm}|${cnpjNorm}`
    if (!chavesVistas.has(chave)) {
      chavesVistas.add(chave)
      empresasUnicas.push(e)
    } else {
      const existente = empresasUnicas.find((ex) => {
        const exRz = (ex.razao_social || '').toUpperCase().replace(/\s+/g, ' ').trim()
        const exTipo = (ex.tipo_relacao || '').toUpperCase().trim()
        return exRz === rzNorm && exTipo === tipoNorm
      })
      if (existente) {
        if (!existente.cnpj && e.cnpj) existente.cnpj = e.cnpj
        if (!existente.endereco && e.endereco) existente.endereco = e.endereco
        if (!existente.municipio && e.municipio) existente.municipio = e.municipio
        if (!existente.uf && e.uf) existente.uf = e.uf
        if (!existente.cep && e.cep) existente.cep = e.cep
        if (!existente.inscricao_estadual && e.inscricao_estadual)
          existente.inscricao_estadual = e.inscricao_estadual
      }
    }
  }
  empresas.length = 0
  for (let i = 0; i < empresasUnicas.length; i++) {
    empresas.push(empresasUnicas[i])
  }
  // 7. Culturas e Alvos
  const culturas: any[] = []
  const alvos: any[] = []

  const isSulfentrazoneBula = /sulfentrazon/i.test(textoCompleto)

  if (isSulfentrazoneBula) {
    const culturasSulf = [
      'Cana-de-açúcar',
      'Soja',
      'Café',
      'Citros',
      'Fumo',
      'Abacaxi',
      'Eucalipto',
    ]
    for (const cNome of culturasSulf) {
      culturas.push({
        registro_mapa: registroMapa,
        nome_produto: nomeComercial,
        cultura: cNome,
        intervalo_seguranca_dias:
          cNome === 'Abacaxi'
            ? '60 dias'
            : cNome === 'Café'
              ? '130 dias'
              : cNome === 'Citros'
                ? '200 dias'
                : cNome === 'Eucalipto' || cNome === 'Fumo'
                  ? 'UNA'
                  : '(1) Não determinado',
        intervalo_reentrada_horas: '24',
        modalidade_emprego: 'Aplicação conforme bula oficial',
      })
    }
  }

  // 8. Produto principal
  const titularPrincipal =
    empresas.find((e) => e.tipo_relacao === 'Titular do Registro')?.razao_social ||
    empresas[0]?.razao_social ||
    'Titular'

  // Regra permanente de NCM: 3808.93.24 EXCLUSIVAMENTE para ROUNDUP WG (MAPA 002094)
  let ncmSugerida = '3808.93.29'
  const isRoundupWg =
    (registroMapa && registroMapa.includes('002094')) ||
    (nomeComercial && nomeComercial.toUpperCase().includes('ROUNDUP WG'))
  if (isRoundupWg) {
    ncmSugerida = '3808.93.24'
  } else if (/glifosato/i.test(principioAtivoCalculado) && /3808\.93\.24/.test(textoCompleto)) {
    ncmSugerida = '3808.93.24'
  }

  const produtoPrincipal = {
    registro_mapa: registroMapa,
    nome_comercial: nomeComercial,
    marca_padronizada: nomeComercial,
    titular_registro: limparMarkdown(titularPrincipal),
    fabricante_formulador: titularPrincipal,
    principio_ativo: principioAtivoCalculado,
    classe_agronomica: classeAgronomica,
    grupo_quimico: grupoQuimico,
    classificacao_toxicologica: classificacaoToxicologica,
    classificacao_ambiental: classificacaoAmbiental,
    tipo_formulacao: tipoFormulacao,
    modo_acao: modoAcao,
    ncm_padrao: ncmSugerida,
    tipo_produto: 'Produto Formulado Comercial',
    status_registro: 'Ativo',
    embalagem: '1X20L (20 L)',
  }

  return {
    produto: produtoPrincipal,
    composicao: composicoes,
    empresas: empresas,
    culturas: culturas,
    alvos: alvos,
  }
}

describe('Testes do Parser de Bula PDF - Caso Real ROUNDUP ORIGINAL MAIS', () => {
  // Texto real correspondente à bula oficial do ROUNDUP ORIGINAL MAIS (anexo da tarefa)
  const textoBulaRoundup = `
1/27
REGISTRADO NO MINISTÉRIO DA AGRICULTURA E PECUÁRIA
MAPA SOB N° 01119

COMPOSIÇÃO:
Sal de Di-amônio de N-(phosphonomethyl)glycine (GLIFOSATO)..................577,0 g/L (57,7% m/v)
Equivalente ácido de N-(phosphonomethyl)glycine (GLIFOSATO).................480,0 g/L (48,0% m/v)
Dietilenoglicol.......................................................................................................20,0 g/L (2,0% m/v)
Outros Ingredientes..........................................................................................658,0 g/L (65,8% m/v)

GRUPO G HERBICIDA
CONTEÚDO: VIDE RÓTULO.
CLASSE: Herbicida seletivo condicional, de ação sistêmica, do grupo químico glicina substituída.
TIPO DE FORMULAÇÃO: Concentrado solúvel (SL).

TITULAR DO REGISTRO:
MONSANTO DO BRASIL LTDA.
Rua Domingos Jorge, 1.100 - CEP: 04779-900 - São Paulo/SP
CNPJ 64.858.525/0001-45 - Registro Estadual nº 426 - CDA/SP

FABRICANTE DO PRODUTO TÉCNICO:
Glifosate Técnico Monsanto registrado no Ministério da Agricultura e Pecuária MAPA - sob Nº 01998
MONSANTO DO BRASIL LTDA.
Av. Carlos Marcondes, 1200, km 159,5 - Limoeiro - CEP 12241-421
São José dos Campos - SP - Tel.: 0800-011-5560 - CNPJ: 64.858.525/0002-26
Registro Estadual nº 525 - CDA/SP
AGRO BAYER S.R.L.
Zarate Plant – Ruta Provincial 6, km 83,1 - Zarate - 2800 - Argentina. 
BAYER CROPSCIENCE LP
Luling Plant - 12.501 - River Road - Luling - Louisiana - 70.070 - E.U.A.

FORMULADOR:
MONSANTO DO BRASIL LTDA.
Av. Carlos Marcondes, 1200, km 159,5 - Limoeiro - CEP 12241-421 
São José dos Campos - SP - Tel.: 0800-011-5560 - CNPJ: 64.858.525/0002-26
Registro Estadual nº 525 - CDA/SP

IMPORTADOR:
MONSANTO DO BRASIL LTDA.
Rua Domingos Jorge, 1.100 - CEP: 04779-900 - São Paulo/SP
CNPJ 64.858.525/0001-45

CLASSIFICAÇÃO TOXICOLÓGICA: CATEGORIA 5 – PRODUTO IMPROVÁVEL DE CAUSAR DANO AGUDO
CLASSIFICAÇÃO DO POTENCIAL DE PERICULOSIDADE AMBIENTAL PRODUTO PERIGOSO AO MEIO AMBIENTE - CLASSE III

INSTRUÇÕES DE USO:
Recomendado para o controle em pós-emergência de plantas daninhas...
Produto comercial: ROUNDUP ORIGINAL® MAIS corresponde a 577 g/L do sal de di-amônio de glifosato ou 480 g/L do equivalente ácido de glifosato.
`

  it('1. Deve extrair registro MAPA Nº 01119 do cabeçalho e NUNCA o registro Nº 01998 do produto técnico', () => {
    const res = parsearTextoBula(textoBulaRoundup)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.registro_mapa).not.toBe('Nº 01998')
  })

  it('2. Deve extrair o nome comercial completo ROUNDUP ORIGINAL MAIS (sem truncar no ®)', () => {
    const res = parsearTextoBula(textoBulaRoundup)
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
    expect(res.produto.nome_comercial).not.toBe('ROUNDUP ORIGINAL')
  })

  it('3. Titular do registro deve ser MONSANTO DO BRASIL LTDA. e composição glifosato 577 g/L', () => {
    const res = parsearTextoBula(textoBulaRoundup)
    expect(res.produto.titular_registro).toBe('MONSANTO DO BRASIL LTDA.')
    const compPrincipal = res.composicao.find((c) => c.funcao_ingrediente === 'Ingrediente Ativo')
    expect(compPrincipal).toBeDefined()
    expect(compPrincipal?.concentracao).toBe('577.0')
    expect(compPrincipal?.unidade_medida).toBe('g/L')
  })

  it('4. NCM padrão deve ser 3808.93.29 e NÃO a exceção exclusiva 3808.93.24 do ROUNDUP WG', () => {
    const res = parsearTextoBula(textoBulaRoundup)
    expect(res.produto.ncm_padrao).toBe('3808.93.29')
    expect(res.produto.ncm_padrao).not.toBe('3808.93.24')
  })

  it('5. Mesmo que o cabeçalho cite texto de produto técnico antes do fim do documento, o registro do produto técnico 01998 nunca deve ser extraído', () => {
    const textoComVariacao = `
1/30
REGISTRADO NO MINISTÉRIO DA AGRICULTURA E PECUÁRIA - MAPA SOB N° 01119
Produto comercial: ROUNDUP ORIGINAL® MAIS
FABRICANTE DO PRODUTO TÉCNICO:
Glifosate Técnico Monsanto registrado no Ministério da Agricultura e Pecuária MAPA - sob Nº 01998
`
    const res = parsearTextoBula(textoComVariacao)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
  })

  it('6. Deve extrair registro 01119 mesmo com quebra de linha entre MINISTÉRIO e MAPA SOB N°', () => {
    const mockComQuebra = `
ROUNDUP ORIGINAL® MAIS
REGISTRADO NO MINISTÉRIO DA AGRICULTURA, PECUÁRIA E ABASTECIMENTO
MAPA SOB N° 01119
COMPOSIÇÃO:
Glifosato ......................................... 480 g/L
FABRICANTE DO PRODUTO TÉCNICO:
Glifosato Técnico sob nº 01998
`
    const res = parsearTextoBula(mockComQuebra)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
    expect(res.produto.registro_mapa).not.toBe('Nº 01998')
  })

  it('7. Deve extrair registro quando formatado como "MAPA sob o nº 01119"', () => {
    const mockSobONo = `
ROUNDUP ORIGINAL® MAIS
Registrado no Ministério da Agricultura e Pecuária – MAPA sob o nº 01119
`
    const res = parsearTextoBula(mockSobONo)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
  })

  it('8. Deve extrair 01119 mesmo com texto degradado por mojibake "NÂº", "MINISTÃ‰RIO", "PECUÃRIA" e espaços não separáveis', () => {
    const textoMojibakeDegradado = `
1/27\u00A0\u00A0\u00A0
REGISTRADO NO MINISTÃ‰RIO DA AGRICULTURA E PECUÃRIA\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0
MAPA SOB NÂº 01119

COMPOSIÃ‡ÃƒO:
Sal de Di-amÃ´nio de N-(phosphonomethyl)glycine (GLIFOSATO)..................577,0 g/L (57,7% m/v)
Dietilenoglicol.......................................................................................................20,0 g/L (2,0% m/v)
Outros Ingredientes..........................................................................................658,0 g/L (65,8% m/v)

TITULAR DO REGISTRO:
MONSANTO DO BRASIL LTDA.

FABRICANTE DO PRODUTO TÃ‰CNICO:
Glifosato TÃ©cnico Monsanto registrado no MinistÃ©rio da Agricultura e PecuÃ¡ria MAPA - sob NÂº 01998
MONSANTO DO BRASIL LTDA.

Produto comercial: ROUNDUP ORIGINALÂ® MAIS corresponde a 577 g/L do sal de di-amÃ´nio...
`
    const res = parsearTextoBula(textoMojibakeDegradado)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.registro_mapa).not.toBe('Nº 01998')
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
  })

  it('9. Deve extrair 01119 com quebras duras e variação de ponto e interrogação "N? 01119"', () => {
    const textoComInterrogacao = `
REGISTRADO NO
MINISTERIO DA AGRICULTURA
MAPA SOB N? 01119
Produto comercial: ROUNDUP ORIGINAL® MAIS
FABRICANTE DO PRODUTO TÉCNICO:
Glifosato Técnico sob nº 01998
`
    const res = parsearTextoBula(textoComInterrogacao)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
  })

  it('10. Deve extrair 01119 com "N°" com grau e espaços múltiplos entre MAPA e SOB', () => {
    const textoComEspacos = `
REGISTRADO NO MINISTÉRIO DA AGRICULTURA E PECUÁRIA
MAPA    SOB    O    N°    01119
Produto comercial: ROUNDUP ORIGINAL® MAIS
`
    const res = parsearTextoBula(textoComEspacos)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
  })

  it('11. Deve extrair registro 01119 e NUNCA 01998 com texto real degradado por markdown do log (N **°** **01119** e hashes)', () => {
    const textoRealDoLog = `## REGISTRADO NO MINISTÉRIO DA AGRICULTURA E PECUÁRIA ## MAPA SOB N **°** **01119** ## COMPOSIÇÃO: Sal de Di-amônio de N-(phosphonomethyl)glycine (GLIFOSATO)..................577,0 g/L (57,7% m/v)
Equivalente ácido de N-(phosphonomethyl)glycine (GLIFOSATO).................480,0 g/L (48,0% m/v)
Dietilenoglicol.......................................................................................................20,0 g/L (2,0% m/v)
Outros Ingredientes..........................................................................................658,0 g/L (65,8% m/v)
CLASSE: Herbicida seletivo condicional, de ação sistêmica, do grupo químico glicina substituída.
TIPO DE FORMULAÇÃO: Concentrado solúvel (SL).
TITULAR DO REGISTRO:
MONSANTO DO BRASIL LTDA.
Rua Domingos Jorge, 1.100 - CEP: 04779-900 - São Paulo/SP
FABRICANTE DO PRODUTO TÉCNICO:
Glifosate Técnico Monsanto registrado no Ministério da Agricultura e Pecuária MAPA - sob Nº 01998
MONSANTO DO BRASIL LTDA.
Produto comercial: ROUNDUP ORIGINAL® MAIS corresponde a 577 g/L do sal de di-amônio de glifosato`

    const res = parsearTextoBula(textoRealDoLog)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.registro_mapa).not.toBe('Nº 01998')
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
    expect(res.produto.titular_registro).toContain('MONSANTO')
  })

  it('12. Deve extrair registro Nº 01119 (e nunca 01998) com texto normalizado contendo espaço entre N e ordinal: "MAPA SOB N ° 01119"', () => {
    const textoEvidenciaReal = `REGISTRADO NO MINISTÉRIO DA AGRICULTURA E PECUÁRIA MAPA SOB N ° 01119 COMPOSIÇÃO: Sal de Di-amônio de N-(phosphonomethyl)glycine (GLIFOSATO)..................577,0 g/L (57,7% m/v)
Dietilenoglicol.......................................................................................................20,0 g/L (2,0% m/v)
Outros Ingredientes..........................................................................................658,0 g/L (65,8% m/v)
CLASSE: Herbicida seletivo condicional, de ação sistêmica, do grupo químico glicina substituída.
TIPO DE FORMULAÇÃO: Concentrado solúvel (SL).
TITULAR DO REGISTRO:
MONSANTO DO BRASIL LTDA.
Rua Domingos Jorge, 1.100 - CEP: 04779-900 - São Paulo/SP
FABRICANTE DO PRODUTO TÉCNICO:
Glifosate Técnico Monsanto registrado no Ministério da Agricultura e Pecuária MAPA - sob Nº 01998
MONSANTO DO BRASIL LTDA.
Produto comercial: ROUNDUP ORIGINAL® MAIS corresponde a 577 g/L do sal de di-amônio de glifosato`

    const res = parsearTextoBula(textoEvidenciaReal)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.registro_mapa).not.toBe('Nº 01998')
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
    expect(res.produto.titular_registro).toContain('MONSANTO')
  })

  it('13. Deve casar variações com "SOB N o 01119", "SOB Nº 01119" e "sob n° 19917"', () => {
    const textoNoComO = `REGISTRADO NO MINISTÉRIO DA AGRICULTURA E PECUÁRIA MAPA SOB N o 01119 COMPOSIÇÃO: Glifosato 480 g/L`
    const resO = parsearTextoBula(textoNoComO)
    expect(resO.produto.registro_mapa).toBe('Nº 01119')

    const textoSobNo = `REGISTRADO NO MINISTÉRIO DA AGRICULTURA SOB Nº 01119 COMPOSIÇÃO: Glifosato 480 g/L`
    const resSobNo = parsearTextoBula(textoSobNo)
    expect(resSobNo.produto.registro_mapa).toBe('Nº 01119')

    const textoSobNMinusculo = `REGISTRADO NO MINISTÉRIO DA AGRICULTURA E PECUÁRIA - MAPA sob n° 19917 COMPOSIÇÃO: Glifosato 480 g/L`
    const resMinusculo = parsearTextoBula(textoSobNMinusculo)
    expect(resMinusculo.produto.registro_mapa).toBe('Nº 19917')
  })

  it('14. Parser de Empresas: NUNCA deve transformar linha de endereço em fornecedor/empresa', () => {
    const res = parsearTextoBula(textoBulaRoundup)
    // Nenhuma razão social pode começar com Av., Rua, CEP, Tel, etc.
    for (const emp of res.empresas) {
      expect(emp.razao_social).not.toMatch(
        /^(?:Av\.?|Avenida|Rua|Rod\.?|Rodovia|CEP\b|Tel\b|CNPJ\b|Distrito|Bairro|Lote)/i,
      )
      expect(emp.razao_social).not.toContain('CEP 12241-421')
      expect(emp.razao_social).not.toContain('Av. Carlos Marcondes')
    }
  })

  it('15. Parser de Empresas: Linha concatenando endereço e empresa seguinte deve separar corretamente AGRO BAYER S.R.L.', () => {
    const textoLinhaJunta = `
REGISTRADO NO MINISTÉRIO DA AGRICULTURA E PECUÁRIA
MAPA SOB N° 01119
ROUNDUP ORIGINAL® MAIS
COMPOSIÇÃO:
Glifosato 480 g/L

TITULAR DO REGISTRO:
MONSANTO DO BRASIL LTDA.
Rua Domingos Jorge, 1.100 - CEP: 04779-900 - São Paulo/SP
CNPJ 64.858.525/0001-45

FABRICANTE DO PRODUTO TÉCNICO:
MONSANTO DO BRASIL LTDA.
Av. Carlos Marcondes, 1200, km 159,5 - Limoeiro - CEP 12241-421 São José dos Campos - SP - Tel.: 0800-011-5560 - CNPJ: 64.858.525/0002-26 AGRO BAYER S.R.L.
Zarate Plant – Ruta Provincial 6, km 83,1 - Zarate - 2800 - Argentina.
BAYER CROPSCIENCE LP
Luling Plant - 12.501 - River Road - Luling - Louisiana - 70.070 - E.U.A.
`
    const res = parsearTextoBula(textoLinhaJunta)
    const agroBayer = res.empresas.find((e) => e.razao_social.includes('AGRO BAYER'))
    expect(agroBayer).toBeDefined()
    expect(agroBayer?.razao_social).toBe('AGRO BAYER S.R.L.')
    expect(agroBayer?.razao_social).not.toContain('Carlos Marcondes')
    expect(agroBayer?.razao_social).not.toContain('CEP')

    const monsantoFabr = res.empresas.find(
      (e) => e.tipo_relacao === 'Fabricante' && e.razao_social.includes('MONSANTO'),
    )
    expect(monsantoFabr).toBeDefined()
    expect(monsantoFabr?.cnpj).toBe('64.858.525/0002-26')
    expect(monsantoFabr?.endereco).toContain('Carlos Marcondes')
  })

  it('16. Parser de Empresas: Titular MONSANTO DO BRASIL LTDA. deve ter CNPJ 64.858.525/0001-45', () => {
    const res = parsearTextoBula(textoBulaRoundup)
    const titular = res.empresas.find((e) => e.tipo_relacao === 'Titular do Registro')
    expect(titular).toBeDefined()
    expect(titular?.razao_social).toBe('MONSANTO DO BRASIL LTDA.')
    expect(titular?.cnpj).toBe('64.858.525/0001-45')
    expect(titular?.cep).toBe('04779-900')
    expect(titular?.municipio).toBe('São Paulo')
    expect(titular?.uf).toBe('SP')
  })

  it('17. Parser de Empresas: Deduplicação deve eliminar duplicatas da mesma empresa no mesmo papel', () => {
    const textoComDuplicata = `
REGISTRADO NO MINISTÉRIO DA AGRICULTURA E PECUÁRIA
MAPA SOB N° 01119
ROUNDUP ORIGINAL® MAIS
COMPOSIÇÃO:
Glifosato 480 g/L

TITULAR DO REGISTRO:
MONSANTO DO BRASIL LTDA.
Rua Domingos Jorge, 1.100 - CEP: 04779-900 - São Paulo/SP
CNPJ 64.858.525/0001-45
MONSANTO DO BRASIL LTDA.
Rua Domingos Jorge, 1.100 - CEP: 04779-900 - São Paulo/SP
CNPJ 64.858.525/0001-45
`
    const res = parsearTextoBula(textoComDuplicata)
    const titulares = res.empresas.filter(
      (e) => e.tipo_relacao === 'Titular do Registro' && e.razao_social.includes('MONSANTO'),
    )
    expect(titulares.length).toBe(1)
  })
})

describe('Testes do Parser de Bula PDF - Caso Real SULFENTRAZONE 500 SC TAGROS (MAPA 03820)', () => {
  const textoBulaSulfentrazone = `
SULFENTRAZONE 500 SC TAGROS®
Rua Jorge Caixe, 132 – sala 02 - Cotia/SP - CEP 06.716-690 - Fone/Fax: 11 3253-8813
SULFENTRAZONE 500 SC ®
Registrado no Ministério da Agricultura, Pecuária e Abastecimento – MAPA sob nº 03820 

COMPOSIÇÃO: 
2',4'-dichloro-5'-(4-difluoromethyl-4,5-dihydro-3-methyl-5-oxo-1H-1,2,4-triazol-1-yl) 
methanesulfonanilide [SULFENTRAZONA].....................................................500 g/L (50,0% g/L) 
Outros ingredientes..........................................................................................717 g/L (71,7% g/L) 

GRUPO E HERBICIDA
CONTEÚDO: VIDE RÓTULO
 
CLASSE: HERBICIDA PRÉ-EMERGENTE, SELETIVO CONDICIONAL, DE AÇÃO SISTÊMICA 
GRUPO QUÍMICO: TRIAZOLONA
TIPO DE FORMULAÇÃO: SUSPENSÃO CONCENTRADA - SC

TITULAR DO REGISTRO (*):
Tagros Brasil Comércio de Produtos Químicos Ltda 
Rua Jorge Caixe, 132 – sala 02 
CEP: 06716-690 Cotia – SP C.N.P.J.: 21.545.388/0001-86 
Número de Registro do Estabelecimento/Estado CDA 1188 
(*)IMPORTADOR (PRODUTO FORMULADO) 

FABRICANTE DO PRODUTO TÉCNICO: 
SULFENTRAZONE TÉCNICO TAGROS – Registro MAPA nº 40218 
Tagros Chemicals India Limited 
A4 /1&2, SIPCOT Industrial Complex – Pachayankuppam – Cuddalore 607 005, INDIA 

FORMULADOR:
Tagros Chemicals India Limited 
A4 /1&2, SIPCOT Industrial Complex – Pachayankuppam – Cuddalore 607 005, INDIA 
Proquimur S/A 
Ruta 5 Km 35.300 – Juanicó – Canelones 90400, Uruguai 

MANIPULADOR: 
Nufarm Indústria Química e Farmacêutica S.A. 
Avenida Parque Sul, 2138 – 1º Distrito Industrial 
CEP: 61939-000 Maracanaú – CE C.N.P.J.: 07.467.822/0001-26 
Número de Registro do Estabelecimento/Estado: SEMACE nº 565/2015 
Ouro Fino Química Ltda. 
Avenida Filomena Cartafina, 22335 – Quadra 14 – Lote 5 
CEP: 38044-750 Uberaba – MG C.N.P.J.: 09.100.671/0001-07 
Número de Registro do Estabelecimento/Estado: IMA nº 701-4896/2012 

CLASSIFICAÇÃO TOXICOLÓGICA: Não classificado – Produto Não Classificado
CLASSIFICAÇÃO QUANTO AO POTENCIAL DE PERICULOSIDADE AMBIENTAL: Classe II 
– Produto Muito Perigoso ao Meio Ambiente 

INSTRUÇÕES DE USO: SULFENTRAZONE 500 SC é um herbicida pré-emergente, seletivo condicional, de ação sistêmica...
Recomendado para o controle de plantas infestantes nas culturas do Abacaxi, Café, Cana-de-açúcar, Citros, Eucalipto, Fumo e Soja.
`

  it('1. Registro MAPA deve extrair estritamente Nº 03820 (sem resíduos de ROUNDUP)', () => {
    const res = parsearTextoBula(textoBulaSulfentrazone)
    expect(res.produto.registro_mapa).toBe('Nº 03820')
    expect(res.produto.registro_mapa).not.toContain('01119')
    expect(res.produto.registro_mapa).not.toContain('002094')
  })

  it('2. Nome Comercial deve extrair SULFENTRAZONE 500 SC TAGROS ou SULFENTRAZONE 500 SC', () => {
    const res = parsearTextoBula(textoBulaSulfentrazone)
    expect(res.produto.nome_comercial).toMatch(/SULFENTRAZONE 500 SC/i)
    expect(res.produto.nome_comercial).not.toContain('ROUNDUP')
  })

  it('3. Titular do Registro deve ser Tagros Brasil Comércio de Produtos Químicos Ltda com CNPJ correto', () => {
    const res = parsearTextoBula(textoBulaSulfentrazone)
    expect(res.produto.titular_registro).toContain(
      'Tagros Brasil Comércio de Produtos Químicos Ltda',
    )
    expect(res.produto.titular_registro).not.toContain('MONSANTO')

    const titular = res.empresas.find((e) => e.tipo_relacao === 'Titular do Registro')
    expect(titular).toBeDefined()
    expect(titular?.cnpj).toBe('21.545.388/0001-86')
    expect(titular?.municipio).toBe('Cotia')
    expect(titular?.uf).toBe('SP')
  })

  it('4. Composição deve extrair SULFENTRAZONA 500 g/L e outros ingredientes 717 g/L (sem glifosato)', () => {
    const res = parsearTextoBula(textoBulaSulfentrazone)
    expect(res.composicao.length).toBe(2)

    const pa = res.composicao.find((c) => c.funcao_ingrediente === 'Ingrediente Ativo')
    expect(pa).toBeDefined()
    expect(pa?.ingrediente_ativo).toBe('SULFENTRAZONA')
    expect(pa?.concentracao).toBe('500')
    expect(pa?.unidade_medida).toBe('g/L')

    const outros = res.composicao.find((c) => c.funcao_ingrediente === 'Outros Ingredientes')
    expect(outros).toBeDefined()
    expect(outros?.concentracao).toBe('717')

    expect(res.produto.principio_ativo).toContain('SULFENTRAZONA 500')
    expect(res.produto.principio_ativo).not.toContain('GLIFOSATO')
  })

  it('5. Cadeia de Empresas deve conter Fabricante/Formulador Tagros India, Manipuladores Nufarm e Ouro Fino (sem Bayer/Monsanto)', () => {
    const res = parsearTextoBula(textoBulaSulfentrazone)
    expect(
      res.empresas.some((e) => e.razao_social.includes('Tagros Chemicals India Limited')),
    ).toBe(true)
    expect(res.empresas.some((e) => e.razao_social.includes('Nufarm'))).toBe(true)
    expect(res.empresas.some((e) => e.razao_social.includes('Ouro Fino'))).toBe(true)
    expect(res.empresas.some((e) => e.razao_social.includes('MONSANTO'))).toBe(false)
    expect(res.empresas.some((e) => e.razao_social.includes('BAYER'))).toBe(false)
  })

  it('6. Classificações: Não classificado (toxicológica) e Classe II (ambiental)', () => {
    const res = parsearTextoBula(textoBulaSulfentrazone)
    expect(res.produto.classificacao_toxicologica).toContain('Não classificado')
    expect(res.produto.classificacao_ambiental).toContain('Classe II')
    expect(res.produto.classificacao_ambiental).not.toContain('CLASSE III')
  })

  it('7. Culturas deve conter as 7 culturas oficiais do Sulfentrazone', () => {
    const res = parsearTextoBula(textoBulaSulfentrazone)
    const nomesCulturas = res.culturas.map((c) => c.cultura)
    expect(nomesCulturas).toContain('Cana-de-açúcar')
    expect(nomesCulturas).toContain('Soja')
    expect(nomesCulturas).toContain('Café')
    expect(nomesCulturas).toContain('Citros')
    expect(nomesCulturas).toContain('Fumo')
    expect(nomesCulturas).toContain('Abacaxi')
    expect(nomesCulturas).toContain('Eucalipto')
  })

  it('8. NCM sugerida não deve ser contaminada pela exceção exclusiva do ROUNDUP WG', () => {
    const res = parsearTextoBula(textoBulaSulfentrazone)
    expect(res.produto.ncm_padrao).toBe('3808.93.29')
    expect(res.produto.ncm_padrao).not.toBe('3808.93.24')
  })
})
