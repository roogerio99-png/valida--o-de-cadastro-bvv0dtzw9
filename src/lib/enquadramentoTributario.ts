/**
 * Modulo de Enquadramento Tributario Canonico para o Agronegocio
 *
 * Determina com precisao legal (artigo, inciso, paragrafo e alinea)
 * o enquadramento tributario de cada produto para PIS, COFINS, IBS e CBS,
 * derivado exclusivamente dos dados cadastrais do produto:
 * - NCM (Nomenclatura Comum do Mercosul)
 * - Tipo de Produto (Formulado, Tecnico, Fertilizante, Inoculante, Semente, etc.)
 * - Principio Ativo
 * - Origem e finalidade
 *
 * Legislacao Federal Vigente e de Transicao:
 * - PIS/COFINS:
 *   * Lei nº 10.925/2004, art. 1º, incisos I a VII (aliquota zero historica e transitoria ate 31/03/2026)
 *   * Decreto nº 5.630/2005, art. 1º (regulamentacao da aliquota zero de insumos agropecuarios)
 *   * Lei Complementar nº 224/2025, art. 4º, § 1º, I e II, § 2º, II, "e", § 3º, III e § 4º, I
 *     (reoneracao linear residual de 10% da aliquota padrao a partir de 01/04/2026: 0,925% Real e 0,365% Presumido)
 *   * Leis nº 10.637/2002 (art. 2º) e nº 10.833/2003 (art. 2º) - Regimes padrao nao cumulativo
 *   * Lei nº 9.718/1998 (art. 8º) - Regime padrao cumulativo
 *   * Lei nº 10.865/2004, art. 8º, § 12 (PIS/COFINS Importacao sobre insumos agropecuarios)
 * - IBS:
 *   * Constituicao Federal de 1988, art. 156-A (acrescido pela EC nº 132/2023)
 *   * Lei Complementar nº 214/2025, Livro I, Titulo IV, Capitulo III, Secao X, art. 138, caput, § 1º e § 2º
 *   * Anexo IX da LC nº 214/2025 (Reducao de 60% das aliquotas e diferimento do recolhimento)
 * - CBS:
 *   * Constituicao Federal de 1988, art. 195, caput, inciso V (acrescido pela EC nº 132/2023)
 *   * Lei Complementar nº 214/2025, art. 1º, II e art. 138, caput, § 1º e § 2º c/c Anexo IX
 */

export interface CitacaoLegal {
  norma: string
  artigo: string
  inciso?: string
  paragrafo?: string
  alinea?: string
  textoArtigo: string
}

export interface TributoEnquadramento {
  tributo: 'PIS' | 'COFINS' | 'ICMS' | 'IBS' | 'CBS'
  nomeCompleto: string
  regime: string
  statusBeneficio: 'beneficiado' | 'reduzido' | 'diferido' | 'tributado' | 'a_confirmar'
  aliquotaTexto: string
  citacao: CitacaoLegal
  resumoClaro: string
  observacaoOperacional?: string
}

export interface EnquadramentoTributarioConsolidado {
  ncmLimpa: string
  categoriaProduto: string
  qualificadoAgro: boolean
  pis: TributoEnquadramento
  cofins: TributoEnquadramento
  icms: TributoEnquadramento
  ibs: TributoEnquadramento
  cbs: TributoEnquadramento
  resumoGeral: string
}

export interface DadosEntradaProdutoEnquadramento {
  ncm?: string | null
  tipo_produto?: string | null
  principio_ativo?: string | null
  macro_grupo?: string | null
  sub_grupo?: string | null
  registro_mapa?: string | null
  titular_fabricante?: string | null
}

/**
 * Normaliza o codigo NCM para apenas 8 digitos numericos
 */
export function normalizarNcmDigitos(ncm?: string | null): string {
  if (!ncm) return ''
  return ncm.replace(/\D/g, '').slice(0, 8)
}

/**
 * Avalia as caracteristicas do produto e classifica a categoria tributaria
 */
function identificarCategoriaTributaria(input: DadosEntradaProdutoEnquadramento): {
  categoria:
    | 'DEFENSIVO_AGRO'
    | 'FERTILIZANTE_ADUBO'
    | 'CORRETIVO_SOLO'
    | 'SEMENTE_MUDA'
    | 'INOCULANTE_BIO'
    | 'RACAO_NUTRICAO_ANIMAL'
    | 'OUTRO_INSUMO_AGRO'
    | 'NAO_BENEFICIADO'
  rotulo: string
} {
  const ncm = normalizarNcmDigitos(input.ncm)
  const tipo = (input.tipo_produto || '').toLowerCase()
  const macro = (input.macro_grupo || '').toLowerCase()
  const pa = (input.principio_ativo || '').toLowerCase()

  // 1. Defensivos agropecuarios (Posicao 38.08 TIPI)
  if (
    ncm.startsWith('3808') ||
    macro.includes('defensiv') ||
    tipo.includes('formulado') ||
    tipo.includes('tecnico') ||
    tipo.includes('defensivo')
  ) {
    return {
      categoria: 'DEFENSIVO_AGRO',
      rotulo: 'Defensivo Agropecuário (Posição 38.08 da TIPI)',
    }
  }

  // 2. Adubos ou fertilizantes (Capitulo 31 TIPI)
  if (
    ncm.startsWith('31') ||
    macro.includes('fertiliz') ||
    tipo.includes('fertilizante') ||
    pa.includes('npk') ||
    pa.includes('adubo')
  ) {
    return {
      categoria: 'FERTILIZANTE_ADUBO',
      rotulo: 'Adubo ou Fertilizante (Capítulo 31 da TIPI)',
    }
  }

  // 3. Corretivo de solo de origem mineral (Capitulo 25 TIPI: Calcario, Gesso, etc.)
  if (
    ncm.startsWith('25') ||
    macro.includes('corretiv') ||
    tipo.includes('corretivo') ||
    pa.includes('calcario') ||
    pa.includes('calcário') ||
    pa.includes('gesso')
  ) {
    return {
      categoria: 'CORRETIVO_SOLO',
      rotulo: 'Corretivo de Solo Mineral (Capítulo 25 da TIPI)',
    }
  }

  // 4. Inoculantes agricolas de bacterias fixadoras de nitrogenio (3002.90.99)
  if (
    ncm.startsWith('300290') ||
    macro.includes('inocul') ||
    tipo.includes('inoculante') ||
    tipo.includes('biologico') ||
    tipo.includes('biológico')
  ) {
    return {
      categoria: 'INOCULANTE_BIO',
      rotulo: 'Inoculante Agrícola / Biológico (Código 3002.90.99)',
    }
  }

  // 5. Sementes e mudas destinadas a semeadura/plantio (Capitulo 12 ou Lei 10.711/2003)
  if (
    ncm.startsWith('1209') ||
    macro.includes('semente') ||
    tipo.includes('semente') ||
    tipo.includes('muda')
  ) {
    return {
      categoria: 'SEMENTE_MUDA',
      rotulo: 'Semente Certificada / Muda para Plantio (Lei nº 10.711/2003)',
    }
  }

  // 6. Rações, concentrados, suplementos, aditivos, premix/núcleo (Capítulo 23 ou nutrição animal)
  if (
    ncm.startsWith('2309') ||
    macro.includes('racao') ||
    macro.includes('ração') ||
    macro.includes('nutricao animal') ||
    macro.includes('nutrição animal') ||
    tipo.includes('racao') ||
    tipo.includes('ração') ||
    tipo.includes('concentrado') ||
    tipo.includes('suplemento') ||
    tipo.includes('premix') ||
    tipo.includes('núcleo') ||
    tipo.includes('nucleo') ||
    tipo.includes('aditivo animal')
  ) {
    return {
      categoria: 'RACAO_NUTRICAO_ANIMAL',
      rotulo: 'Nutrição Animal / Ração / Concentrado / Premix (Capítulo 23)',
    }
  }

  // Se NCM nao informado ou nao reconhecido
  if (!ncm) {
    return {
      categoria: 'NAO_BENEFICIADO',
      rotulo: 'NCM não informada ou a confirmar',
    }
  }

  return {
    categoria: 'NAO_BENEFICIADO',
    rotulo: 'Produto não classificado em rol desonerado específico',
  }
}

/**
 * Calcula e gera o enquadramento tributario completo para PIS, COFINS, IBS e CBS
 * com citacao exata de artigo, inciso, paragrafo e alinea.
 */
export function determinarEnquadramentoTributario(
  input: DadosEntradaProdutoEnquadramento,
): EnquadramentoTributarioConsolidado {
  const ncm = normalizarNcmDigitos(input.ncm)
  const { categoria, rotulo } = identificarCategoriaTributaria(input)

  // ---------------------------------------------------------------------------
  // 1. PIS (Programa de Integracao Social)
  // ---------------------------------------------------------------------------
  let pis: TributoEnquadramento
  let cofins: TributoEnquadramento

  switch (categoria) {
    case 'DEFENSIVO_AGRO': {
      pis = {
        tributo: 'PIS',
        nomeCompleto: 'Contribuição para o Programa de Integração Social (PIS/Pasep)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,165% (Lucro Real) / 0,065% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso II',
          paragrafo:
            'c/c Lei Complementar nº 224/2025, Art. 4º, § 1º, inciso I, § 2º, inciso II, alínea "e", § 3º, inciso III e § 4º, inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso II: Ficam reduzidas a 0 (zero) as alíquotas da contribuição para o PIS/PASEP incidentes na importação e sobre a receita bruta de venda no mercado interno de defensivos agropecuários classificados na posição 38.08 da TIPI e suas matérias-primas. LC nº 224/2025, Art. 4º, § 4º, Inciso I: reoneração residual a 10% da alíquota padrão a partir de 01/04/2026.',
        },
        resumoClaro:
          'Defensivo agropecuário na posição 38.08 da TIPI usufrui de alíquota zero até 31/03/2026. A partir de 01/04/2026, por força da LC nº 224/2025, recolhe alíquota residual linear de 10% da alíquota padrão (0,165% no Lucro Real ou 0,065% no Lucro Presumido). Vedada apropriação de créditos pelo adquirente sobre essa parcela (LC 224/2025, art. 4º, § 7º).',
        observacaoOperacional:
          'CST de Saída recomendado: CST 06 (Alíquota Zero) ou conforme leiaute da EFD-Contribuições.',
      }

      cofins = {
        tributo: 'COFINS',
        nomeCompleto: 'Contribuição para o Financiamento da Seguridade Social (COFINS)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,760% (Lucro Real) / 0,300% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso II',
          paragrafo:
            'c/c Lei Complementar nº 224/2025, Art. 4º, § 1º, inciso II, § 2º, inciso II, alínea "e", § 3º, inciso III e § 4º, inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso II: Ficam reduzidas a 0 (zero) as alíquotas da COFINS incidentes na importação e sobre a receita bruta de venda no mercado interno de defensivos agropecuários classificados na posição 38.08 da TIPI e suas matérias-primas. LC nº 224/2025, Art. 4º, § 4º, Inciso I: reoneração residual de 10% da alíquota padrão.',
        },
        resumoClaro:
          'COFINS com alíquota zero plena até 31/03/2026. A partir de 01/04/2026, aplica-se a reoneração de 10% da alíquota padrão (0,76% no regime não cumulativo e 0,30% no cumulativo), totalizando carga conjunta PIS/COFINS de 0,925% (Lucro Real) ou 0,365% (Lucro Presumido).',
        observacaoOperacional:
          'Vedado crédito sobre a parcela residual conforme art. 4º, § 7º da LC nº 224/2025.',
      }
      break
    }

    case 'FERTILIZANTE_ADUBO': {
      pis = {
        tributo: 'PIS',
        nomeCompleto: 'Contribuição para o Programa de Integração Social (PIS/Pasep)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,165% (Lucro Real) / 0,065% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c Dec. nº 5.630/2005 e LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso I',
          paragrafo:
            '§ 1º da Lei nº 10.925/2004 c/c LC nº 224/2025, Art. 4º, § 1º, I, § 2º, II, "e" e § 4º, I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso I: Ficam reduzidas a 0 (zero) as alíquotas da contribuição para o PIS/PASEP incidentes na importação e sobre a receita bruta de venda no mercado interno de adubos ou fertilizantes classificados no Capítulo 31, exceto os produtos de uso veterinário, da TIPI, e suas matérias-primas.',
        },
        resumoClaro:
          'Adubos e fertilizantes classificados no Capítulo 31 da TIPI possuem desoneração de PIS via alíquota zero até 31/03/2026. A partir de 01/04/2026 ocorre reoneração residual linear de 10% (0,165% Lucro Real / 0,065% Lucro Presumido).',
      }

      cofins = {
        tributo: 'COFINS',
        nomeCompleto: 'Contribuição para o Financiamento da Seguridade Social (COFINS)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,760% (Lucro Real) / 0,300% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c Dec. nº 5.630/2005 e LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso I',
          paragrafo:
            '§ 1º da Lei nº 10.925/2004 c/c LC nº 224/2025, Art. 4º, § 1º, II, § 2º, II, "e" e § 4º, I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso I: Ficam reduzidas a 0 (zero) as alíquotas da COFINS sobre receita bruta de mercado interno e importação de adubos ou fertilizantes classificados no Capítulo 31 da TIPI (exceto uso veterinário) e matérias-primas.',
        },
        resumoClaro:
          'COFINS à alíquota zero no mercado interno e na importação para adubos e fertilizantes até 31/03/2026; a partir de 01/04/2026 reonera 10% (0,76% no regime não cumulativo e 0,30% no cumulativo).',
      }
      break
    }

    case 'CORRETIVO_SOLO': {
      pis = {
        tributo: 'PIS',
        nomeCompleto: 'Contribuição para o Programa de Integração Social (PIS/Pasep)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,165% (Lucro Real) / 0,065% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso IV',
          paragrafo: 'c/c Lei Complementar nº 224/2025, Art. 4º, § 4º, Inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso IV: Ficam reduzidas a 0 (zero) as alíquotas de PIS sobre a receita bruta e importação de corretivo de solo de origem mineral classificado no Capítulo 25 da TIPI.',
        },
        resumoClaro:
          'Corretivo de solo de origem mineral (calcário, gesso agrícola) classificado no Capítulo 25 da TIPI goza de alíquota zero até 31/03/2026 e 10% da alíquota padrão a partir de 01/04/2026.',
      }

      cofins = {
        tributo: 'COFINS',
        nomeCompleto: 'Contribuição para o Financiamento da Seguridade Social (COFINS)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,760% (Lucro Real) / 0,300% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso IV',
          paragrafo: 'c/c Lei Complementar nº 224/2025, Art. 4º, § 4º, Inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso IV: Redução a zero da COFINS sobre venda e importação de corretivo de solo de origem mineral classificado no Capítulo 25 da TIPI.',
        },
        resumoClaro:
          'COFINS à alíquota zero para corretivos minerais do Capítulo 25 da TIPI até 31/03/2026; após 01/04/2026 recolhe 0,76% (Lucro Real) ou 0,30% (Lucro Presumido).',
      }
      break
    }

    case 'INOCULANTE_BIO': {
      pis = {
        tributo: 'PIS',
        nomeCompleto: 'Contribuição para o Programa de Integração Social (PIS/Pasep)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,165% (Lucro Real) / 0,065% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso VI',
          paragrafo: 'c/c Lei Complementar nº 224/2025, Art. 4º, § 4º, Inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso VI: Ficam reduzidas a 0 (zero) as alíquotas de PIS incidentes na importação e venda no mercado interno de inoculantes agrícolas produzidos a partir de bactérias fixadoras de nitrogênio, classificados no código 3002.90.99 da TIPI.',
        },
        resumoClaro:
          'Inoculantes agrícolas e biológicos classificados no código 3002.90.99 da TIPI com alíquota zero até 31/03/2026 e 0,165% / 0,065% após 01/04/2026.',
      }

      cofins = {
        tributo: 'COFINS',
        nomeCompleto: 'Contribuição para o Financiamento da Seguridade Social (COFINS)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,760% (Lucro Real) / 0,300% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso VI',
          paragrafo: 'c/c Lei Complementar nº 224/2025, Art. 4º, § 4º, Inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso VI: Redução a zero da COFINS sobre venda e importação de inoculantes agrícolas produzidos a partir de bactérias fixadoras de nitrogênio (código 3002.90.99 da TIPI).',
        },
        resumoClaro:
          'COFINS à alíquota zero para inoculantes agrícolas até 31/03/2026, com reoneração linear residual a partir de 01/04/2026 pela LC 224/2025.',
      }
      break
    }

    case 'SEMENTE_MUDA': {
      pis = {
        tributo: 'PIS',
        nomeCompleto: 'Contribuição para o Programa de Integração Social (PIS/Pasep)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,165% (Lucro Real) / 0,065% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso III',
          paragrafo: 'c/c Lei Complementar nº 224/2025, Art. 4º, § 4º, Inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso III: Ficam reduzidas a 0 (zero) as alíquotas de PIS sobre sementes e mudas destinadas à semeadura e plantio, em conformidade com o disposto na Lei nº 10.711, de 5 de agosto de 2003, e produtos de natureza biológica utilizados em sua produção.',
        },
        resumoClaro:
          'Sementes e mudas certificadas destinadas a plantio sob a Lei nº 10.711/2003 gozam de alíquota zero até 31/03/2026 e reoneração linear de 10% a partir de 01/04/2026.',
      }

      cofins = {
        tributo: 'COFINS',
        nomeCompleto: 'Contribuição para o Financiamento da Seguridade Social (COFINS)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,760% (Lucro Real) / 0,300% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso III',
          paragrafo: 'c/c Lei Complementar nº 224/2025, Art. 4º, § 4º, Inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso III: Redução a zero da COFINS sobre sementes e mudas certificadas (Lei nº 10.711/2003) e produtos biológicos utilizados em sua produção.',
        },
        resumoClaro:
          'COFINS à alíquota zero para sementes e mudas até 31/03/2026 e 0,76% / 0,30% pós-01/04/2026.',
      }
      break
    }

    case 'RACAO_NUTRICAO_ANIMAL': {
      pis = {
        tributo: 'PIS',
        nomeCompleto: 'Contribuição para o Programa de Integração Social (PIS/Pasep)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,165% (Lucro Real) / 0,065% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso V',
          paragrafo: 'c/c Lei Complementar nº 224/2025, Art. 4º, § 4º, Inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso V: Redução a 0 (zero) das alíquotas de PIS incidentes sobre receita bruta e importação de rações para animais, concentrados, suplementos, aditivos, premix ou núcleo, fabricados por indústrias devidamente registradas no MAPA.',
        },
        resumoClaro:
          'Rações animais, suplementos e premix gozam de alíquota zero até 31/03/2026 e 10% da alíquota padrão a partir de 01/04/2026 (LC 224/2025).',
      }

      cofins = {
        tributo: 'COFINS',
        nomeCompleto: 'Contribuição para o Financiamento da Seguridade Social (COFINS)',
        regime: 'Alíquota Zero / Reoneração Linear Residual (10% padrão)',
        statusBeneficio: 'beneficiado',
        aliquotaTexto:
          '0,00% até 31/03/2026 | 0,760% (Lucro Real) / 0,300% (Lucro Presumido) pós-01/04/2026',
        citacao: {
          norma: 'Lei nº 10.925/2004 c/c LC nº 224/2025',
          artigo: 'Art. 1º',
          inciso: 'Inciso V',
          paragrafo: 'c/c Lei Complementar nº 224/2025, Art. 4º, § 4º, Inciso I',
          textoArtigo:
            'Lei nº 10.925/2004, Art. 1º, Inciso V: Redução a 0 (zero) das alíquotas de COFINS incidentes sobre venda e importação de insumos de nutrição animal registrados no MAPA.',
        },
        resumoClaro:
          'COFINS à alíquota zero para nutrição animal registrada no MAPA até 31/03/2026, com reoneração linear residual após 01/04/2026.',
      }
      break
    }

    default: {
      pis = {
        tributo: 'PIS',
        nomeCompleto: 'Contribuição para o Programa de Integração Social (PIS/Pasep)',
        regime: 'Regime Geral Não Desonerado / Tributação Padrão',
        statusBeneficio: ncm ? 'tributado' : 'a_confirmar',
        aliquotaTexto: '1,65% (Lucro Real) ou 0,65% (Lucro Presumido)',
        citacao: {
          norma: 'Lei nº 10.637/2002 c/c Lei nº 9.718/1998',
          artigo:
            'Art. 2º da Lei nº 10.637/2002 (Não Cumulativo) ou Art. 8º da Lei nº 9.718/1998 (Cumulativo)',
          textoArtigo:
            'A contribuição para o PIS/Pasep incide sobre a receita bruta auferida pela pessoa jurídica à alíquota de 1,65% no regime não cumulativo e 0,65% no regime cumulativo, por não se enquadrar no rol taxativo do art. 1º da Lei nº 10.925/2004.',
        },
        resumoClaro:
          'Produto não contemplado pelo rol de alíquota zero da Lei nº 10.925/2004; sujeita-se às alíquotas normais do regime tributário adotado pelo contribuinte vendedor.',
      }

      cofins = {
        tributo: 'COFINS',
        nomeCompleto: 'Contribuição para o Financiamento da Seguridade Social (COFINS)',
        regime: 'Regime Geral Não Desonerado / Tributação Padrão',
        statusBeneficio: ncm ? 'tributado' : 'a_confirmar',
        aliquotaTexto: '7,60% (Lucro Real) ou 3,00% (Lucro Presumido)',
        citacao: {
          norma: 'Lei nº 10.833/2003 c/c Lei nº 9.718/1998',
          artigo:
            'Art. 2º da Lei nº 10.833/2003 (Não Cumulativo) ou Art. 8º da Lei nº 9.718/1998 (Cumulativo)',
          textoArtigo:
            'A contribuição para a Cofins incide sobre o faturamento mensal à alíquota de 7,6% (regime não cumulativo) ou 3% (regime cumulativo), ausente hipótese legal de desoneração do art. 1º da Lei nº 10.925/2004.',
        },
        resumoClaro:
          'Tributação integral da COFINS pelas alíquotas padrão de 7,60% (não cumulativo) ou 3,00% (cumulativo).',
      }
      break
    }
  }

  // ---------------------------------------------------------------------------
  // 2. ICMS - Convênio ICMS 100/97 (CONFAZ, DOU 06.11.97, Ato COTEPE 17/97)
  // Alterado pelos Convs. ICMS 40/98 a 79/25; Vigência até 31/12/2027 (Cláusula Sétima)
  // ---------------------------------------------------------------------------
  let icms: TributoEnquadramento

  switch (categoria) {
    case 'DEFENSIVO_AGRO': {
      icms = {
        tributo: 'ICMS',
        nomeCompleto:
          'Imposto sobre Circulação de Mercadorias e Serviços (ICMS Estadual / Interestadual)',
        regime: 'Redução de 60% da Base de Cálculo Interestadual (Carga Efetiva 4,8%)',
        statusBeneficio: 'reduzido',
        aliquotaTexto:
          'Base reduzida em 60% | Carga efetiva interestadual de 4,8% (alíquota 12%) ou 2,8% (alíquota 7%)',
        citacao: {
          norma: 'Convênio ICMS nº 100/1997 (CONFAZ) alterado pelos Convs. ICMS 99/2004 e 79/2025',
          artigo: 'Cláusula primeira, caput',
          inciso: 'Inciso I (redação dada pelo Convênio ICMS nº 99/2004)',
          paragrafo:
            'c/c Cláusula terceira (operações internas), Cláusula quarta (crédito presumido), Cláusula quinta, II (dedução expressa em NF) e Cláusula sétima (vigência até 31/12/2027, redação Conv. ICMS 79/2025)',
          textoArtigo:
            'Cláusula primeira: Fica reduzida em 60% (sessenta por cento) a base de cálculo do ICMS nas saídas interestaduais dos seguintes produtos: I - inseticidas, fungicidas, formicidas, herbicidas, parasiticidas, germicidas, acaricidas, nematicidas, raticidas, desfolhantes, dessecantes, espalhantes, adesivos, estimuladores e inibidores de crescimento (reguladores), vacinas, soros e medicamentos, produzidos para uso na agricultura e na pecuária, inclusive inoculantes, vedada a sua aplicação quando dada ao produto destinação diversa.',
        },
        resumoClaro:
          'Defensivos agropecuários (NCM 3808) usufruem de redução de 60% da base de cálculo nas saídas interestaduais (carga tributária efetiva de 4,8% na alíquota interestadual de 12% ou 2,8% na de 7%), conforme Cláusula primeira, I do Convênio ICMS 100/97. Nas operações internas, a Cláusula terceira autoriza os Estados e o DF a conceder redução ou isenção. O valor dispensado deve ser deduzido do preço e discriminado na NF (Cláusula quinta, II). Vigente em âmbito nacional até 31/12/2027 (Convênio ICMS 79/25).',
        observacaoOperacional:
          'Obrigatoriedade de demonstrar a dedução do imposto dispensado no corpo e tags da NF-e (Ajuste SINIEF 10/12 c/c Cláusula quinta, II). Assegurado crédito presumido pelo Estado de destino se não conceder redução equivalente (Cláusula quarta).',
      }
      break
    }

    case 'INOCULANTE_BIO': {
      icms = {
        tributo: 'ICMS',
        nomeCompleto:
          'Imposto sobre Circulação de Mercadorias e Serviços (ICMS Estadual / Interestadual)',
        regime: 'Redução de 60% da Base de Cálculo Interestadual (Carga Efetiva 4,8%)',
        statusBeneficio: 'reduzido',
        aliquotaTexto:
          'Base reduzida em 60% | Carga efetiva interestadual de 4,8% (alíquota 12%) ou 2,8% (alíquota 7%)',
        citacao: {
          norma: 'Convênio ICMS nº 100/1997 (CONFAZ) alterado pelos Convs. ICMS 99/2004 e 79/2025',
          artigo: 'Cláusula primeira, caput',
          inciso: 'Inciso I, parte final (redação dada pelo Convênio ICMS nº 99/2004)',
          paragrafo:
            'c/c Cláusula terceira (operações internas) e Cláusula sétima (vigência prorrogada até 31/12/2027 pelo Conv. ICMS 79/2025)',
          textoArtigo:
            'Cláusula primeira, Inciso I: [...] produzidos para uso na agricultura e na pecuária, inclusive inoculantes, vedada a sua aplicação quando dada ao produto destinação diversa.',
        },
        resumoClaro:
          'Inoculantes agrícolas e biológicos de fixação nitrogenada possuem redução expressa de 60% da base de cálculo nas operações interestaduais pelo inciso I da Cláusula primeira do Convênio ICMS 100/97, resultando em carga de 4,8% (na alíquota de 12%) ou 2,8% (na alíquota de 7%). Operações internas sob disciplina de cada UF (Cláusula terceira). Vigência até 31/12/2027.',
        observacaoOperacional:
          'Exige destinação exclusiva ao uso agropecuário e dedução expressa do ICMS dispensado no documento fiscal.',
      }
      break
    }

    case 'FERTILIZANTE_ADUBO': {
      icms = {
        tributo: 'ICMS',
        nomeCompleto:
          'Imposto sobre Circulação de Mercadorias e Serviços (ICMS Estadual / Interestadual)',
        regime: 'Carga Tributária Uniforme de 4% nas Saídas Internas, Interestaduais e Importação',
        statusBeneficio: 'reduzido',
        aliquotaTexto:
          'Carga tributária efetiva equivalente a 4,00% sobre o valor da operação (Conv. ICMS 26/2021)',
        citacao: {
          norma:
            'Convênio ICMS nº 100/1997 (CONFAZ) com alterações dos Convs. ICMS 26/2021, 104/2021 e 79/2025',
          artigo: 'Cláusula terceira-A (acrescida pelo Convênio ICMS nº 26/2021)',
          inciso: 'Incisos I e II da Cláusula terceira-A',
          paragrafo:
            'c/c Parágrafo único (acrescido pelo Conv. ICMS 104/2021), Cláusula terceira-B e Cláusula sétima (vigência até 31/12/2027 pelo Conv. ICMS 79/2025)',
          textoArtigo:
            'Cláusula terceira-A (Conv. ICMS 26/2021): Fica reduzida a base de cálculo do ICMS, de forma que a carga tributária seja equivalente a aplicação do percentual de 4% (quatro por cento) sobre o valor da operação nas importações e nas saídas internas e interestaduais dos seguintes produtos: I - ácido nítrico, ácido sulfúrico, ácido fosfórico, fosfato natural bruto e enxofre [...]; II - amônia, uréia, sulfato de amônio, nitrato de amônio, nitrocálcio, MAP, DAP, cloreto de potássio, adubos simples e compostos, fertilizantes e DL Metionina e seus análogos, produzidos para uso na agricultura e na pecuária, vedada a destinação diversa. (NOTA: O antigo inciso II da Cláusula primeira foi expressamente REVOGADO pelo Conv. ICMS 26/2021 desde 01/01/2022).',
        },
        resumoClaro:
          'Fertilizantes e adubos (Capítulo 31) estão submetidos ao regime da Cláusula terceira-A do Convênio ICMS 100/97 (acrescida pelo Conv. ICMS 26/21, efeitos desde 01/01/2022). O benefício fixa carga tributária efetiva de 4% sobre a operação nas saídas internas, interestaduais e importações. O antigo benefício de 60% da Cláusula primeira, II foi revogado em 2022.',
        observacaoOperacional:
          'Condicionado à não aplicação de outras formas de tributação que resultem em postergação ou cargas inferiores (Cláusula terceira-B). Parágrafo único estende a remessas entre si e retornos de armazenagem.',
      }
      break
    }

    case 'CORRETIVO_SOLO': {
      icms = {
        tributo: 'ICMS',
        nomeCompleto:
          'Imposto sobre Circulação de Mercadorias e Serviços (ICMS Estadual / Interestadual)',
        regime: 'Redução de 60% da Base de Cálculo Interestadual (Carga Efetiva 4,8%)',
        statusBeneficio: 'reduzido',
        aliquotaTexto:
          'Base reduzida em 60% | Carga efetiva interestadual de 4,8% (alíquota 12%) ou 2,8% (alíquota 7%)',
        citacao: {
          norma:
            'Convênio ICMS nº 100/1997 (CONFAZ) com alterações dos Convs. ICMS 106/2002 e 79/2025',
          artigo: 'Cláusula primeira, caput',
          inciso: 'Inciso IV c/c Inciso XI da Cláusula primeira',
          paragrafo:
            'c/c Cláusula terceira (operações internas) e Cláusula sétima (vigência até 31/12/2027 pelo Conv. ICMS 79/2025)',
          textoArtigo:
            'Cláusula primeira, Inciso IV: calcário e gesso, destinados ao uso exclusivo na agricultura, como corretivo ou recuperador do solo; Inciso XI: gipsita britada destinada ao uso na agropecuária ou à fabricação de sal mineralizado.',
        },
        resumoClaro:
          'Calcário e gesso agrícola (Capítulo 25 da NCM) possuem redução de 60% da base de cálculo do ICMS nas saídas interestaduais (carga tributária efetiva de 4,8% para alíquota de 12% ou 2,8% para 7%), condicionados ao uso exclusivo na agricultura como corretivo ou recuperador do solo (Cláusula primeira, IV do Convênio ICMS 100/97).',
        observacaoOperacional:
          'Uso estritamente agrícola exigido no documento fiscal; operações internas autorizadas aos Estados para isenção/redução pela Cláusula terceira.',
      }
      break
    }

    case 'SEMENTE_MUDA': {
      icms = {
        tributo: 'ICMS',
        nomeCompleto:
          'Imposto sobre Circulação de Mercadorias e Serviços (ICMS Estadual / Interestadual)',
        regime: 'Redução de 60% da Base de Cálculo Interestadual (Carga Efetiva 4,8%)',
        statusBeneficio: 'reduzido',
        aliquotaTexto:
          'Base reduzida em 60% | Carga efetiva interestadual de 4,8% (alíquota 12%) ou 2,8% (alíquota 7%)',
        citacao: {
          norma:
            'Convênio ICMS nº 100/1997 (CONFAZ) alterado pelos Convs. ICMS 16/2005, 63/2005 e 79/2025',
          artigo: 'Cláusula primeira, caput',
          inciso: 'Inciso V (redação dada pelo Convênio ICMS nº 16/2005) e Inciso VIII (mudas)',
          paragrafo:
            '§ 4º da Cláusula primeira c/c § 1º da Cláusula terceira (campo de produção) e Cláusula sétima (vigência até 31/12/2027 pelo Conv. ICMS 79/2025)',
          textoArtigo:
            'Cláusula primeira, Inciso V: semente genética, semente básica, semente certificada de primeira geração - C1, semente certificada de segunda geração - C2, semente não certificada de primeira geração - S1 e semente não certificada de segunda geração - S2, destinadas à semeadura, desde que produzidas sob controle de entidades certificadoras ou fiscalizadoras, bem como as importadas, atendidas as disposições da Lei nº 10.711/2003, regulamentada pelo Decreto nº 5.153/2004, e as exigências do MAPA. § 4º: o benefício não se aplicará se a semente não satisfizer os padrões do Estado de destino ou tiver outro destino que não a semeadura.',
        },
        resumoClaro:
          'Sementes certificadas (genética, básica, C1, C2, S1, S2) sob controle da Lei nº 10.711/2003 e mudas de plantas usufruem de redução de 60% da base nas saídas interestaduais pelo Convênio ICMS 100/97 (Cláusula primeira, V e VIII). Benefício estende-se à saída do campo de produção (Cláusula terceira, § 1º).',
        observacaoOperacional:
          'Inaplicável se não satisfizer padrões oficiais do Estado de destino ou se destinada a fim diverso da semeadura (§ 4º).',
      }
      break
    }

    case 'RACAO_NUTRICAO_ANIMAL': {
      icms = {
        tributo: 'ICMS',
        nomeCompleto:
          'Imposto sobre Circulação de Mercadorias e Serviços (ICMS Estadual / Interestadual)',
        regime: 'Redução de 60% da Base de Cálculo Interestadual (Carga Efetiva 4,8%)',
        statusBeneficio: 'reduzido',
        aliquotaTexto:
          'Base reduzida em 60% | Carga efetiva interestadual de 4,8% (alíquota 12%) ou 2,8% (alíquota 7%)',
        citacao: {
          norma:
            'Convênio ICMS nº 100/1997 (CONFAZ) alterado pelos Convs. ICMS 93/2006, 17/2011 e 79/2025',
          artigo: 'Cláusula primeira, caput',
          inciso: 'Inciso III (redação dada pelo Convênio ICMS nº 93/2006)',
          paragrafo:
            'Alíneas "a", "b", "c" e § 2º (incisos I a V) da Cláusula primeira c/c Cláusula sétima (vigência até 31/12/2027)',
          textoArtigo:
            'Cláusula primeira, Inciso III: rações para animais, concentrados, suplementos, aditivos, premix ou núcleo, fabricados pelas respectivas indústrias, devidamente registradas no MAPA, desde que: a) os produtos estejam registrados no órgão competente do MAPA e o número do registro seja indicado no documento fiscal, quando exigido; b) haja rótulo ou etiqueta identificando o produto; c) os produtos se destinem exclusivamente ao uso na pecuária. § 2º: conceitos regulamentares de ração animal, concentrado, suplemento, aditivo e premix/núcleo.',
        },
        resumoClaro:
          'Rações para animais, concentrados, suplementos, aditivos e premix têm redução de 60% da base de cálculo interestadual (Cláusula primeira, III do Convênio ICMS 100/97), desde que fabricados por indústria registrada no MAPA, rotulados e destinados com exclusividade à pecuária.',
        observacaoOperacional:
          'Exige indicação do registro MAPA na NF e destinação zootécnica/pecuária estrita (estende-se a apicultura, aquicultura, avicultura, etc., nos termos do § 5º).',
      }
      break
    }

    default: {
      icms = {
        tributo: 'ICMS',
        nomeCompleto:
          'Imposto sobre Circulação de Mercadorias e Serviços (ICMS Estadual / Interestadual)',
        regime: 'Regime Geral Não Desonerado / Tributação Padrão dos Estados',
        statusBeneficio: ncm ? 'tributado' : 'a_confirmar',
        aliquotaTexto:
          'Alíquotas Padrão Interestaduais (7% ou 12%) e Internas (conforme UF de destino)',
        citacao: {
          norma:
            'Lei Complementar nº 87/1996 (Lei Kandir) c/c Resolução do Senado Federal nº 22/1989',
          artigo: 'Art. 2º da LC nº 87/1996 c/c Art. 1º da RSF nº 22/1989',
          textoArtigo:
            'O ICMS incide sobre operações relativas à circulação de mercadorias. Na ausência de enquadramento expresso no rol taxativo dos insumos agropecuários do Convênio ICMS nº 100/1997 ou outro ato CONFAZ nacional, aplicam-se as alíquotas normais interestaduais (12% nas regiões Sul/Sudeste exceto ES, ou 7% nas regiões Norte, Nordeste, Centro-Oeste e ES) e internas regulamentares de cada Estado.',
        },
        resumoClaro:
          'Produto não beneficiado pela redução de base de cálculo do Convênio ICMS 100/97; sujeita-se às alíquotas integrais interestaduais e internas vigentes no respectivo Estado de destino.',
        observacaoOperacional:
          'Enquadramento do ICMS a confirmar caso comprovada destinação agropecuária específica e registro no órgão regulador.',
      }
      break
    }
  }

  // ---------------------------------------------------------------------------
  // 3. IBS (Imposto sobre Bens e Servicos) - Art. 156-A CF/88 e LC 214/2025
  // ---------------------------------------------------------------------------
  let ibs: TributoEnquadramento
  let cbs: TributoEnquadramento

  if (categoria !== 'NAO_BENEFICIADO') {
    ibs = {
      tributo: 'IBS',
      nomeCompleto: 'Imposto sobre Bens e Serviços (IBS - Competência Estados / DF / Municípios)',
      regime: 'Regime Diferenciado com Redução de 60% e Diferimento do Recolhimento',
      statusBeneficio: 'reduzido',
      aliquotaTexto: 'Redução de 60% (alíquota efetiva de 40% da alíquota padrão)',
      citacao: {
        norma: 'Constituição Federal de 1988 c/c Lei Complementar nº 214/2025',
        artigo: 'Art. 156-A da CF/88 c/c Art. 138 da LC nº 214/2025',
        paragrafo: 'Art. 138, caput, § 1º, § 2º (incisos I e II) e Anexo IX da LC nº 214/2025',
        textoArtigo:
          'LC nº 214/2025, Art. 138, caput: Ficam reduzidas em 60% (sessenta por cento) as alíquotas do IBS e da CBS incidentes sobre o fornecimento dos insumos agropecuários e aquícolas relacionados no Anexo IX desta Lei Complementar, com a especificação das respectivas classificações da NCM/SH e da NBS. § 1º: A redução aplica-se aos produtos que, quando exigido, estejam registrados como insumos agropecuários no MAPA. § 2º: Fica diferido o recolhimento nas operações entre contribuintes regulares ou vendas a produtores rurais.',
      },
      resumoClaro:
        'Insumo agropecuário contemplado no Anexo IX da LC nº 214/2025 (registrado no MAPA): usufrui de redução de 60% da alíquota do IBS (pagando 40% da alíquota de referência) e diferimento do recolhimento quando fornecido entre contribuintes do regime regular ou a produtor rural (art. 138, § 2º).',
      observacaoOperacional:
        'Exige registro de insumo agropecuário no MAPA (art. 138, § 1º) e encerra diferimento em operações com não contribuintes ou sem emissão fiscal (§ 5º).',
    }

    cbs = {
      tributo: 'CBS',
      nomeCompleto: 'Contribuição Social sobre Bens e Serviços (CBS - Competência da União)',
      regime: 'Regime Diferenciado com Redução de 60% e Diferimento do Recolhimento',
      statusBeneficio: 'reduzido',
      aliquotaTexto: 'Redução de 60% (alíquota efetiva de 40% da alíquota padrão da União)',
      citacao: {
        norma: 'Constituição Federal de 1988 c/c Lei Complementar nº 214/2025',
        artigo:
          'Art. 195, caput, inciso V da CF/88 c/c Art. 1º, inciso II e Art. 138 da LC nº 214/2025',
        paragrafo: 'Art. 138, caput, § 1º e § 2º c/c Anexo IX da LC nº 214/2025',
        textoArtigo:
          'LC nº 214/2025, Art. 138, caput: Ficam reduzidas em 60% (sessenta por cento) as alíquotas do IBS e da CBS incidentes sobre o fornecimento dos insumos agropecuários e aquícolas relacionados no Anexo IX desta Lei Complementar. § 2º: Fica diferido o recolhimento da CBS no fornecimento e importação realizados por contribuinte sujeito ao regime regular.',
      },
      resumoClaro:
        'A CBS federal sobre o insumo agropecuário tem redução de 60% da alíquota nos termos do art. 138 da LC nº 214/2025 e diferimento do tributo até a saída tributada posterior que encerre a cadeia agroindustrial.',
      observacaoOperacional:
        'Ano-teste em 2026 (alíquota piloto compensável de 0,9% de CBS e 0,1% de IBS) e transição plena a partir de 01/01/2027.',
    }
  } else {
    ibs = {
      tributo: 'IBS',
      nomeCompleto: 'Imposto sobre Bens e Serviços (IBS)',
      regime: 'Regime Regular / Alíquota de Referência Padrão',
      statusBeneficio: ncm ? 'tributado' : 'a_confirmar',
      aliquotaTexto: 'Alíquota de Referência Integral (sem redução setorial)',
      citacao: {
        norma: 'Constituição Federal de 1988 c/c Lei Complementar nº 214/2025',
        artigo: 'Art. 156-A da CF/88 c/c Arts. 4º e 50 da LC nº 214/2025',
        paragrafo: 'Arts. 4º, caput e 50 da LC nº 214/2025',
        textoArtigo:
          'LC nº 214/2025, Art. 4º: O IBS e a CBS incidem sobre operações onerosas com bens ou com serviços. Art. 50: As alíquotas do IBS e da CBS serão fixadas em percentual uniforme aplicável sobre todas as operações, ressalvadas exclusivamente as hipóteses previstas nesta Lei Complementar.',
      },
      resumoClaro:
        'Produto não listado no Anexo IX da LC nº 214/2025. Sujeita-se à tributação integral de IBS pela alíquota-padrão de referência do Estado/Município de destino.',
      observacaoOperacional:
        'Enquadramento a confirmar se houver comprovação de registro MAPA ou vinculação a NCM beneficiada.',
    }

    cbs = {
      tributo: 'CBS',
      nomeCompleto: 'Contribuição Social sobre Bens e Serviços (CBS)',
      regime: 'Regime Regular / Alíquota de Referência Padrão Federal',
      statusBeneficio: ncm ? 'tributado' : 'a_confirmar',
      aliquotaTexto: 'Alíquota de Referência Federal Integral (~8,8% prevista)',
      citacao: {
        norma: 'Constituição Federal de 1988 c/c Lei Complementar nº 214/2025',
        artigo: 'Art. 195, V da CF/88 c/c Arts. 4º e 50 da LC nº 214/2025',
        paragrafo: 'Arts. 4º e 50 da LC nº 214/2025',
        textoArtigo:
          'LC nº 214/2025, Arts. 4º e 50: Incidência regular da CBS sobre operações com bens à alíquota padrão da União, sem benefício de redução.',
      },
      resumoClaro:
        'CBS tributada à alíquota padrão da União, com apuração plena de crédito físico/financeiro e sem diferimento.',
    }
  }

  const qualificadoAgro = categoria !== 'NAO_BENEFICIADO'
  const resumoGeral = qualificadoAgro
    ? `${rotulo}: Enquadramento oficial em 5 tributos — ICMS com benefício do Convênio ICMS 100/97 (CONFAZ, vigência até 31/12/2027 pela Cláusula Sétima dada pelo Conv. ICMS 79/25); PIS/COFINS com alíquota zero até 31/03/2026 (Lei nº 10.925/2004) e reoneração linear residual de 10% a partir de 01/04/2026 pela LC nº 224/2025; IBS/CBS com redução de 60% e diferimento pelo Art. 138 e Anexo IX da LC nº 214/2025.`
    : `Produto com NCM ${ncm || 'não informada'}: Não enquadrado no rol desonerado do Convênio ICMS 100/97, da Lei nº 10.925/2004 ou do Anexo IX da LC nº 214/2025. Sujeito às alíquotas gerais padrão.`

  return {
    ncmLimpa: ncm,
    categoriaProduto: rotulo,
    qualificadoAgro,
    pis,
    cofins,
    icms,
    ibs,
    cbs,
    resumoGeral,
  }
}
