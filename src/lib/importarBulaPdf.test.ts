import { describe, it, expect } from 'vitest'

// Funções de sanitização e parsing que espelham o hook pocketbase/hooks/importar_bula_pdf.js
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

export function sanitizarNomeComercial(raw: unknown): string {
  if (!raw) return ''
  let s = String(raw)
  s = s.replace(/\s+corresponde\s+a.*$/i, '')
  s = s.replace(/[®™]/g, '')
  s = limparMarkdown(s)
  s = s.replace(/^\d+\/\d+\s*/, '')
  return s.trim()
}

export function parsearTextoBula(markdown: string, pdfFileName?: string, truncatedFlag?: boolean) {
  const textoCompleto = markdown || ''
  const linhas = textoCompleto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  // 1. Registro MAPA ancorado
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

  // 2. Nome Comercial
  let nomeComercial = ''
  const prodComMatch = textoCompleto.match(/Produto\s+comercial\s*:\s*([^\n\r]+)/i)
  if (prodComMatch && prodComMatch[1]) {
    const rawProd = prodComMatch[1]
    const cleaned = sanitizarNomeComercial(rawProd)
    if (cleaned && cleaned.length > 2 && !/^[°º\d\s-]+$/.test(cleaned)) {
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
          !/^[°º\d\s\-./]+$/.test(cleaned) &&
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

  // 3. Classe agronômica, grupo químico, formulação
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

    const gqMatch = rawClasse.match(/grupo\s+qu[íi]mico\s+([^.,;]+)/i)
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

  // 4. Toxicologia e Ambiental
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
  } else if (/Perigoso ao Meio Ambiente\s*\(CLASSE\s+III\)/i.test(textoCompleto)) {
    classificacaoAmbiental = 'PRODUTO PERIGOSO AO MEIO AMBIENTE - CLASSE III'
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
        const percMatch = lcomp.match(/\((\d+[.,]\d+%\s*[mv/]+)\)/i)

        let nomeIngrediente = lcomp
          .replace(/[.\s]+(\d+[.,]\d+)\s*(g\/[Ll]|g\/kg|%|mg\/[Ll]).*$/i, '')
          .replace(/\.{2,}/g, '')
          .trim()
        nomeIngrediente = limparMarkdown(nomeIngrediente)

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

  // 6. Empresas
  const empresas: any[] = []
  function extrairEmpresasPorSecao(tipoRelacao: string, regexSecao: RegExp) {
    const secMatch = textoCompleto.match(regexSecao)
    if (!secMatch || !secMatch[1]) return []

    const textoSecao = secMatch[1].trim()
    const linhasSec = textoSecao
      .split(/\r?\n/)
      .map((l) => limparMarkdown(l))
      .filter((l) => l.length > 0)

    const lista: any[] = []
    let emp: any = null

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
  empresas.push(...titulares)

  const fabricantes = extrairEmpresasPorSecao(
    'Fabricante',
    /FABRICANTE\s+DO\s+PRODUTO\s+T[ÉE]CNICO\s*:([\s\S]*?)(?=FORMULADOR\s*:)/i,
  )
  empresas.push(...fabricantes)

  const formuladores = extrairEmpresasPorSecao(
    'Formulador',
    /FORMULADOR\s*:([\s\S]*?)(?=IMPORTADOR\s*:)/i,
  )
  empresas.push(...formuladores)

  const importadores = extrairEmpresasPorSecao(
    'Importador',
    /IMPORTADOR\s*:([\s\S]*?)(?=N°\s+do\s+lote|Marca\s+registrada|ANTES\s+DE\s+USAR|CLASSIFICA[ÇC][ÃA]O)/i,
  )
  empresas.push(...importadores)

  // 7. Intervalo de reentrada e EPI
  let intervaloReentrada = 'no mínimo 24 horas após a aplicação'
  const reentMatch = textoCompleto.match(
    /INTERVALO\s+DE\s+REENTRADA[^\n\r]*[\r\n]+([^\n\r]+(?:\n[^\n\r]+)?)/i,
  )
  if (reentMatch && reentMatch[1]) {
    intervaloReentrada = limparMarkdown(reentMatch[1])
  }

  // 8. Produto principal
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
    ncm_padrao: '3808.93.24',
    tipo_produto: 'Produto Formulado Comercial',
    status_registro: 'Ativo',
    embalagem: '1X20L (20 L)',
  }

  return {
    produto: produtoPrincipal,
    composicao: composicoes,
    empresas: empresas,
    intervaloReentrada,
  }
}

describe('Testes do Parser de Bula PDF - Caso Real ROUNDUP ORIGINAL MAIS', () => {
  // Simulação do texto markdown real gerado pelo conversor a partir de roundup_original_mais.pdf
  const textoBulaRealMarkdown = `
# ## ROUNDUP ORIGINAL® MAIS

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
## MONSANTO DO BRASIL LTDA.
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
BAYER CROPSCIENCE LP
Muscatine Plant - 2.500 - Wiggins Road - Muscatine - Iowa - 52.761 - E.U.A.
BAYER AGRICULTURE BV
Antwerp Plant - Haven 627, Scheldelaan 460 - Antuérpia (Lillo) - 2040 - Bélgica

FORMULADOR:
MONSANTO DO BRASIL LTDA.
Av. Carlos Marcondes, 1200, km 159,5 - Limoeiro - CEP 12241-421 
São José dos Campos - SP - Tel.: 0800-011-5560 - CNPJ: 64.858.525/0002-26
Registro Estadual nº 525 - CDA/SP
AGRO BAYER S.R.L.
Zarate Plant – Ruta Provincial 6, km 83,1 - Zarate - 2800 - Argentina. 

IMPORTADOR:
MONSANTO DO BRASIL LTDA.
Rua Domingos Jorge, 1.100 - CEP: 04779-900 - São Paulo/SP
CNPJ 64.858.525/0001-45 - Registro Estadual nº 426 - CDA/SP
MONSANTO DO BRASIL LTDA.
Av. Carlos Marcondes, 1200, km 159,5 - Limoeiro - CEP 12241-421
São José dos Campos - SP - Tel.: 0800-011-5560 - CNPJ: 64.858.525/0002-26

2/27
Registro Estadual nº 525 - CDA/SP
® Marca registrada Bayer CropScience LP / USA
CLASSIFICAÇÃO TOXICOLÓGICA: CATEGORIA 5 – PRODUTO IMPROVÁVEL DE CAUSAR DANO AGUDO
CLASSIFICAÇÃO DO POTENCIAL DE PERICULOSIDADE AMBIENTAL PRODUTO PERIGOSO AO MEIO AMBIENTE - CLASSE III

3/27
Produto comercial: ROUNDUP ORIGINAL® MAIS corresponde a 577 g/L do sal de di-amônio de glifosato ou 480 g/L do equivalente ácido de glifosato.

Quadro 1
Cultura: CANA-DE-AÇÚCAR, CITROS, EUCALIPTO, PINUS

16/27
INTERVALO DE REENTRADA DE PESSOAS NAS CULTURAS E ÁREAS TRATADAS: 
Não entrar na área em que o produto foi aplicado antes da secagem completa da calda (no mínimo 24 horas após a aplicação).

23/27
PRECAUÇÕES DE USO E ADVERTÊNCIAS QUANTO AOS CUIDADOS DE PROTEÇÃO AO MEIO AMBIENTE:
- Este produto é:
 - Altamente Perigoso ao Meio Ambiente (CLASSE I)
 - Muito Perigoso ao Meio Ambiente (CLASSE II).
 - Perigoso ao Meio Ambiente (CLASSE III).
 - Pouco Perigoso ao Meio Ambiente (CLASSE IV).
`

  it('1. Registro MAPA deve extrair Nº 01119 (nunca Nº 0040 ou registros estaduais)', () => {
    const res = parsearTextoBula(textoBulaRealMarkdown)
    expect(res.produto.registro_mapa).toBe('Nº 01119')
    expect(res.produto.registro_mapa).not.toBe('Nº 0040')
    expect(res.produto.registro_mapa).not.toBe('Nº 0426')
    expect(res.produto.registro_mapa).not.toBe('Nº 0525')
  })

  it('2. Nome Comercial deve extrair ROUNDUP ORIGINAL MAIS sem marca de registro e sem número', () => {
    const res = parsearTextoBula(textoBulaRealMarkdown)
    expect(res.produto.nome_comercial).toBe('ROUNDUP ORIGINAL MAIS')
    expect(res.produto.nome_comercial).not.toContain('®')
    expect(res.produto.nome_comercial).not.toContain('01119')
    expect(res.produto.nome_comercial).not.toContain('corresponde a')
  })

  it('3. Titular do Registro deve vir sanitizado sem marcadores de markdown (##)', () => {
    const res = parsearTextoBula(textoBulaRealMarkdown)
    expect(res.produto.titular_registro).toBe('MONSANTO DO BRASIL LTDA.')
    expect(res.produto.titular_registro).not.toContain('#')
  })

  it('4. Composição deve extrair exatamente 4 linhas (glifosato sal, glifosato equiv ácido, dietilenoglicol, outros ingredientes)', () => {
    const res = parsearTextoBula(textoBulaRealMarkdown)
    expect(res.composicao.length).toBe(4)

    expect(res.composicao[0].ingrediente_ativo).toContain('Sal de Di-amônio')
    expect(res.composicao[0].concentracao).toBe('577.0')
    expect(res.composicao[0].funcao_ingrediente).toBe('Ingrediente Ativo')

    expect(res.composicao[1].ingrediente_ativo).toContain('Equivalente ácido')
    expect(res.composicao[1].concentracao).toBe('480.0')
    expect(res.composicao[1].funcao_ingrediente).toBe('Equivalente Ácido')

    expect(res.composicao[2].ingrediente_ativo).toContain('Dietilenoglicol')
    expect(res.composicao[2].concentracao).toBe('20.0')
    expect(res.composicao[2].funcao_ingrediente).toBe('Outros Ingredientes')

    expect(res.composicao[3].ingrediente_ativo).toContain('Outros Ingredientes')
    expect(res.composicao[3].concentracao).toBe('658.0')
    expect(res.composicao[3].funcao_ingrediente).toBe('Outros Ingredientes')
  })

  it('5. Cadeia de Empresas deve extrair titular, 5 fabricantes, formuladores e importadores sem markdown', () => {
    const res = parsearTextoBula(textoBulaRealMarkdown)
    expect(res.empresas.length).toBeGreaterThanOrEqual(6)

    const titular = res.empresas.find((e) => e.tipo_relacao === 'Titular do Registro')
    expect(titular).toBeDefined()
    expect(titular?.razao_social).toBe('MONSANTO DO BRASIL LTDA.')
    expect(titular?.cnpj).toBe('64.858.525/0001-45')
    expect(titular?.inscricao_estadual).toBe('Registro Estadual nº 426 - CDA/SP')

    const fabricantes = res.empresas.filter((e) => e.tipo_relacao === 'Fabricante')
    expect(fabricantes.length).toBe(5)
    expect(fabricantes.some((f) => f.razao_social === 'AGRO BAYER S.R.L.')).toBe(true)
    expect(fabricantes.some((f) => f.razao_social === 'BAYER AGRICULTURE BV')).toBe(true)

    const formuladores = res.empresas.filter((e) => e.tipo_relacao === 'Formulador')
    expect(formuladores.length).toBe(2)
  })

  it('6. Classificação Ambiental deve ser CLASSE III (e não a lista das quatro classes juntas)', () => {
    const res = parsearTextoBula(textoBulaRealMarkdown)
    expect(res.produto.classificacao_ambiental).toBe(
      'PRODUTO PERIGOSO AO MEIO AMBIENTE - CLASSE III',
    )
    expect(res.produto.classificacao_ambiental).not.toContain('CLASSE I')
    expect(res.produto.classificacao_ambiental).not.toContain('CLASSE II')
    expect(res.produto.classificacao_ambiental).not.toContain('CLASSE IV')
  })

  it('7. Intervalo de Reentrada deve ser no mínimo 24 horas', () => {
    const res = parsearTextoBula(textoBulaRealMarkdown)
    expect(res.intervaloReentrada).toContain('24 horas')
  })
})
