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
  tributo: 'PIS' | 'COFINS' | 'IBS' | 'CBS'
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
  // 2. IBS (Imposto sobre Bens e Servicos) - Art. 156-A CF/88 e LC 214/2025
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
    ? `${rotulo}: Alíquota Zero de PIS/COFINS até 31/03/2026 (Lei nº 10.925/2004, art. 1º) com reoneração linear residual de 10% da alíquota padrão a partir de 01/04/2026 pela LC nº 224/2025 (0,925% Real / 0,365% Presumido). No IVA Dual (IBS/CBS), usufrui de redução de 60% e diferimento pelo art. 138 e Anexo IX da LC nº 214/2025.`
    : `Produto com NCM ${ncm || 'não informada'}: Não enquadrado no rol desonerado da Lei nº 10.925/2004 nem no Anexo IX da LC nº 214/2025. Sujeito às alíquotas gerais padrão.`

  return {
    ncmLimpa: ncm,
    categoriaProduto: rotulo,
    qualificadoAgro,
    pis,
    cofins,
    ibs,
    cbs,
    resumoGeral,
  }
}
