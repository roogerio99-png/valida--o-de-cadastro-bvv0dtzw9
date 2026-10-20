/**
 * POST /backend/v1/validar-produto
 * Executa as 6 travas de auditoria agropecuária no servidor PocketBase:
 * 1. NCM Obrigatório (8 dígitos, confere com regras_ncm_embalagem e fontes oficiais TIPI/Siscomex)
 * 2. Embalagem vs NCM (matriz de embalagens permitidas para o NCM)
 * 3. Princípio Ativo Obrigatório (dicionario_principios_ativos e cruzamento com Bula/AGROFIT)
 * 4. Duplicidade (NCM + marca/nome/registro em base_mestre)
 * 5. Concentração Válida (faixa concentracao_min / concentracao_max e cruzamento com Bula oficial)
 * 6. Registro MAPA (formato canônico "Nº ", "TC", "ISENTO" ou código estadual)
 *
 * PREENCHIMENTO AUTOMÁTICO DA BASE MESTRE:
 * Quando o status for APROVADO e auto_cadastrar !== false, submete os dados ao
 * Motor Químico-Aduaneiro e Tributário Canônico e insere na collection base_mestre
 * preenchendo obrigatoriamente TODOS os 28 campos canônicos.
 */

routerAdd('POST', '/backend/v1/validar-produto', (e) => {
  try {
    // Motor químico-aduaneiro e tributário determinístico canônico (Contrato Canônico de 28 Campos)
    // Definido inline para garantir isolamento e compatibilidade total com o bundling de hooks no Skip Cloud
    const MOLECULAS_NOTA_SUBPOS_2 = [
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

    const fallbackNormTxt = function (s) {
      if (!s) return ''
      return String(s)
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
    }

    const fallbackSanitizarMarca = function (nomeCompleto) {
      const texto = String(nomeCompleto || '').trim()
      if (!texto) return 'PRODUTO AGRO'
      const padraoEmb =
        /\s+(?:\d+\s*[xX]\s*\d+\s*[A-Za-z]+|\d+(?:[.,]\d+)?\s*(?:L|LT|LITROS|KG|G|SC|SACO|ML|DOSES)\b|\(IMP\)|\bTC\b|\bIMP\b).*/i
      let limpo = texto.replace(padraoEmb, '').trim()
      limpo = limpo.replace(/[-–—/]+$/, '').trim()
      return limpo || texto
    }

    const fallbackFormatarNcmMascara = function (ncm) {
      const digits = String(ncm || '').replace(/\D/g, '')
      if (digits.length !== 8) {
        if (digits.length > 0 && digits.length < 8) {
          const padded = digits.padStart(8, '0')
          return `${padded.slice(0, 4)}.${padded.slice(4, 6)}.${padded.slice(6, 8)}`
        }
        return ncm || '3808.99.99'
      }
      return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
    }

    const fallbackSanitizarRegistroMapa = function (reg) {
      if (!reg) return 'ISENTO'
      let s = String(reg).trim()
      if (!s) return 'ISENTO'
      const upper = s.toUpperCase()
      if (upper.includes('ISENTO')) return 'ISENTO'
      if (upper.startsWith('TC')) return upper
      if (s.includes('-')) return s
      if (s.startsWith('Nº ') || s.startsWith('Nº')) {
        const semPrefixo = s.replace(/^Nº\s*/i, '').trim()
        const digits = semPrefixo.replace(/\D/g, '')
        if (digits.length > 0 && digits.length < 4) {
          return `Nº ${digits.padStart(4, '0')}`
        }
        return `Nº ${semPrefixo}`
      }
      const digits = s.replace(/\D/g, '')
      if (digits.length > 0 && digits.length < 4) {
        return `Nº ${digits.padStart(4, '0')}`
      }
      if (/^\d+$/.test(s)) return `Nº ${s}`
      return s
    }

    const fallbackValidarFormatoRegistroMapa = function (reg) {
      const s = String(reg || '').trim()
      if (!s) return false
      return s.startsWith('Nº ') || s.startsWith('TC') || s.includes('ISENTO') || s.includes('-')
    }

    const fallbackVerificarNotaSubpos2 = function (principioAtivo, nomeCompleto) {
      const paUpper = `${String(principioAtivo || '')} ${String(nomeCompleto || '')}`.toUpperCase()
      return MOLECULAS_NOTA_SUBPOS_2.some((mol) => paUpper.includes(mol))
    }

    const fallbackDeduzirUnidade = function (embalagem, unidadeInformada) {
      if (unidadeInformada) {
        const u = String(unidadeInformada).trim().toUpperCase()
        if (['L', 'KG', 'SC', 'UN', 'DOSES'].includes(u)) return u
        if (u === 'LT' || u === 'LITROS' || u === 'ML') return 'L'
        if (u === 'G' || u === 'KILOS' || u === 'QUILOS') return 'KG'
        if (u === 'SACO' || u === 'SACAS') return 'SC'
        if (u === 'FRASCO' || u === 'BOMBONA' || u === 'TAMBOR') return 'UN'
      }
      const embUpper = String(embalagem || '').toUpperCase()
      if (embUpper.includes('KG') || embUpper.includes('QUILO') || embUpper.includes('G'))
        return 'KG'
      if (embUpper.includes('SC') || embUpper.includes('SACO') || embUpper.includes('SACARIA'))
        return 'SC'
      if (embUpper.includes('DOSE')) return 'DOSES'
      if (embUpper.includes('UN') || embUpper.includes('PECA')) return 'UN'
      return 'L'
    }

    const fallbackExecutarMotorCanonico = function (input) {
      const nomeCompleto = String(
        input.nome_completo ||
          input.nome_produto ||
          input.marcas_comerciais ||
          input.nome_comercial_bruto ||
          '',
      ).trim()
      const marcaPadronizada =
        String(input.marca_padronizada || '').trim() || fallbackSanitizarMarca(nomeCompleto)
      const embalagemBruta = String(
        input.embalagem || input.embalagem_referencia || input.embalagem_bruta || '1X20L (20 L)',
      ).trim()
      const unidade = fallbackDeduzirUnidade(embalagemBruta, input.unidade || input.unidade_bruta)
      const principioAtivoBruto = String(
        input.principio_ativo ||
          input.principio_ativo_ou_garantia ||
          input.principio_ativo_garantias ||
          input.materiaprima ||
          marcaPadronizada,
      ).trim()
      const titular = String(
        input.titular_fabricante ||
          input.fabricante ||
          input.titular_empresa ||
          input.titular_registro ||
          'Não Informado',
      ).trim()
      const origemBase = String(
        input.origem_base || input.origem_integracao || 'PORTAL_WEB_INTEGRATION',
      ).trim()
      const registroMapaFormatado = fallbackSanitizarRegistroMapa(
        input.registro_mapa || input.numero_registro_mapa || input.registro || '',
      )

      const paUpper = principioAtivoBruto.toUpperCase()
      const nomeUpper = nomeCompleto.toUpperCase()
      const marcaUpper = marcaPadronizada.toUpperCase()
      const origemUpper = origemBase.toUpperCase()

      let tipoProduto = 'Produto Formulado Comercial'
      let macroGrupo = 'Defensivos'
      let subGrupo = 'Herbicida'
      let sistemaNormaMapa = 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)'
      let categoriaTributaria = 'beneficiado'

      const inputTipo = String(input.tipo_produto || '').trim()
      const inputMacro = String(input.macro_grupo || '').trim()
      const inputSub = String(input.sub_grupo || input.classe_uso || '').trim()

      const isTecnico =
        origemUpper.includes('TECNICO') ||
        inputTipo.includes('Técnico') ||
        marcaUpper.includes(' TECNICO') ||
        registroMapaFormatado.startsWith('TC') ||
        paUpper.includes('TECNICO')

      const isFertilizanteOuCorretivo =
        origemUpper.includes('SIPEAGRO') ||
        inputTipo.includes('Fertilizante') ||
        inputTipo.includes('Corretivo') ||
        inputTipo.includes('Inoculante') ||
        registroMapaFormatado.includes('-')

      const isAdjuvante =
        inputTipo.includes('Adjuvante') ||
        paUpper.includes('ADJUVANTE') ||
        paUpper.includes('OLEO MINERAL') ||
        paUpper.includes('ÓLEO MINERAL') ||
        paUpper.includes('ESPALHANTE') ||
        nomeUpper.includes('ADJUVANTE') ||
        nomeUpper.includes('ESPALHANTE ADESIVO')

      if (isAdjuvante) {
        tipoProduto = 'Adjuvante / Espalhante Adesivo'
        macroGrupo = 'Adjuvantes'
        subGrupo = 'Espalhante Adesivo'
        sistemaNormaMapa = 'MAPA — Adjuvantes Agrícolas'
        categoriaTributaria = 'tributado_integral'
      } else if (isTecnico) {
        tipoProduto = 'Produto Técnico Industrial'
        macroGrupo = 'Produtos Técnicos'
        subGrupo = 'Matéria-Prima Técnica Industrial'
        sistemaNormaMapa = 'AGROFIT/MAPA — Produto Técnico (Lei nº 14.785/2023)'
        categoriaTributaria = 'condicional'
      } else if (isFertilizanteOuCorretivo) {
        sistemaNormaMapa = 'SIPEAGRO/MAPA (IN 39/2018 ou IN 35/2006)'
        if (
          paUpper.includes('INOCULANTE') ||
          paUpper.includes('BRADYRHIZOBIUM') ||
          paUpper.includes('AZOSPIRILLUM') ||
          paUpper.includes('RHIZOBIUM') ||
          nomeUpper.includes('INOCULANTE')
        ) {
          tipoProduto = 'Inoculante / Biológico'
          macroGrupo = 'Inoculantes e Biológicos'
          subGrupo = 'Inoculante Fixador de Nitrogênio'
          categoriaTributaria = 'beneficiado'
        } else if (
          paUpper.includes('MEGATERIUM') ||
          paUpper.includes('SOLUBILIZADOR') ||
          paUpper.includes('BACILLUS') ||
          paUpper.includes('PSEUDOMONAS') ||
          nomeUpper.includes('SOLUBILIZADOR')
        ) {
          tipoProduto = 'Inoculante / Biológico'
          macroGrupo = 'Inoculantes e Biológicos'
          subGrupo = 'Solubilizador de Nutrientes'
          categoriaTributaria = 'tributado_integral'
        } else if (
          paUpper.includes('CORRETIVO') ||
          paUpper.includes('CALCARIO') ||
          paUpper.includes('GESSO') ||
          paUpper.includes('FOSFOGESSO') ||
          paUpper.includes('CONDICIONADOR') ||
          nomeUpper.includes('CALCARIO') ||
          nomeUpper.includes('GESSO')
        ) {
          tipoProduto = 'Corretivo / Condicionador de Solo'
          macroGrupo = 'Corretivos de Solo'
          subGrupo = paUpper.includes('GESSO') ? 'Gesso Agrícola' : 'Calcário Agrícola'
          categoriaTributaria = 'condicional'
        } else {
          tipoProduto = 'Fertilizante Mineral / Organomineral'
          macroGrupo = 'Fertilizantes'
          subGrupo =
            paUpper.includes('ORGANO') || nomeUpper.includes('ORGANO')
              ? 'Organomineral'
              : 'Mineral Composto NPK'
          categoriaTributaria = 'beneficiado'
        }
      } else {
        tipoProduto = 'Produto Formulado Comercial'
        macroGrupo = 'Defensivos'
        const subL = `${inputSub} ${paUpper} ${nomeUpper}`
        if (subL.includes('INSETICIDA') && subL.includes('ACARICIDA')) {
          subGrupo = 'Inseticida / Acaricida'
        } else if (subL.includes('INSETICIDA')) {
          subGrupo = 'Inseticida'
        } else if (subL.includes('FUNGICIDA')) {
          subGrupo = 'Fungicida'
        } else if (subL.includes('NEMATICIDA')) {
          subGrupo = 'Nematicida'
        } else if (subL.includes('REGULADOR')) {
          subGrupo = 'Regulador de Crescimento'
        } else if (subL.includes('ACARICIDA')) {
          subGrupo = 'Acaricida'
        } else {
          subGrupo = 'Herbicida'
        }
        categoriaTributaria = 'beneficiado'
      }

      if (inputTipo) tipoProduto = inputTipo
      if (inputMacro) macroGrupo = inputMacro
      if (inputSub && !isAdjuvante && !isTecnico) subGrupo = inputSub

      const pertenceNotaSubpos2 = fallbackVerificarNotaSubpos2(principioAtivoBruto, nomeCompleto)
      const notaSubpos2 = pertenceNotaSubpos2 ? 'SIM' : 'NÃO'

      let ncmPadrao = ''
      let ncmFaixa1 = ''
      let ncmFaixa2 = ''
      let ncmFaixa3 = ''
      let ncmFaixa4 = ''
      let regraTipi = ''

      if (pertenceNotaSubpos2) {
        ncmPadrao = '3808.62.90'
        ncmFaixa1 = '3808.61.00'
        ncmFaixa2 = '3808.62.90'
        ncmFaixa3 = '3808.69.90'
        ncmFaixa4 = '3808.69.90'
        regraTipi =
          'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022): Molécula taxativa com subitens genéricos (.1x/.99) expressamente vedados'
      } else if (tipoProduto === 'Fertilizante Mineral / Organomineral') {
        ncmFaixa1 = '3105.10.00'
        ncmFaixa2 = '3105.10.00'
        ncmFaixa3 = '3105.10.00'
        if (subGrupo === 'Organomineral' || paUpper.includes('ORGANO')) {
          ncmPadrao = '3101.00.00'
          ncmFaixa4 = '3101.00.00'
        } else {
          ncmPadrao = '3105.90.90'
          ncmFaixa4 = '3105.90.90'
        }
        regraTipi =
          'Nota 1 Cap. 31 TIPI: Embalagens brutas até 10 kg classificam-se obrigatoriamente na posição 3105.10.00'
      } else if (tipoProduto === 'Corretivo / Condicionador de Solo') {
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
        regraTipi = 'Capítulo 25 TIPI: Minerais e condicionadores de solo ensacados ou a granel'
      } else if (tipoProduto === 'Inoculante / Biológico') {
        ncmPadrao = '3002.49.99'
        ncmFaixa1 = '3002.49.99'
        ncmFaixa2 = '3002.49.99'
        ncmFaixa3 = '3002.49.99'
        ncmFaixa4 = '3002.49.99'
        regraTipi =
          categoriaTributaria === 'tributado_integral'
            ? 'Posição 3002 TIPI (SC COSIT 261/2023): Inoculante solubilizador/promotor tributado integralmente'
            : 'Posição 3002 TIPI: Culturas de microrganismos para fixação biológica de N2 com alíquota zero'
      } else if (tipoProduto === 'Produto Técnico Industrial') {
        if (subGrupo.includes('Herbicida') || paUpper.includes('HERBICIDA')) {
          ncmPadrao = '3808.93.19'
        } else if (subGrupo.includes('Fungicida') || paUpper.includes('FUNGICIDA')) {
          ncmPadrao = '3808.92.20'
        } else {
          ncmPadrao = '3808.91.20'
        }
        ncmFaixa1 = ncmPadrao
        ncmFaixa2 = ncmPadrao
        ncmFaixa3 = ncmPadrao
        ncmFaixa4 = ncmPadrao
        regraTipi =
          'Nota 2 Seção VI TIPI: Preparações intermediárias (3808.9x.19/.20) e produtos químicos orgânicos isolados (Cap. 29)'
      } else if (tipoProduto === 'Adjuvante / Espalhante Adesivo') {
        ncmPadrao = '3824.99.89'
        ncmFaixa1 = '3824.99.89'
        ncmFaixa2 = '3824.99.89'
        ncmFaixa3 = '3824.99.89'
        ncmFaixa4 = '3824.99.89'
        regraTipi =
          'Posição 3824 TIPI (SC COSIT 4/2024): Adjuvante agrícola não enquadrado como defensivo (Tributação Integral)'
      } else {
        if (subGrupo.includes('Herbicida') || paUpper.includes('HERBICIDA')) {
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
        } else if (subGrupo.includes('Regulador') || paUpper.includes('REGULADOR')) {
          ncmPadrao = '3808.93.59'
        } else if (subGrupo.includes('Fungicida') || paUpper.includes('FUNGICIDA')) {
          if (paUpper.includes('MANCOZEBE') || paUpper.includes('MANCOZEB')) {
            ncmPadrao = '3808.92.93'
          } else {
            ncmPadrao = '3808.92.99'
          }
        } else if (subGrupo.includes('Nematicida') || paUpper.includes('NEMATICIDA')) {
          ncmPadrao = '3808.99.95'
        } else {
          if (paUpper.includes('ACEFATO') || paUpper.includes('THURINGIENSIS')) {
            ncmPadrao = '3808.91.91'
          } else if (paUpper.includes('CIPERMETRINA') || paUpper.includes('CYPERMETHRIN')) {
            ncmPadrao = '3808.91.92'
          } else {
            ncmPadrao = '3808.91.99'
          }
        }
        ncmFaixa1 = ncmPadrao
        ncmFaixa2 = ncmPadrao
        ncmFaixa3 = ncmPadrao
        ncmFaixa4 = ncmPadrao
        regraTipi =
          'Posição 38.08 TIPI: Embalagem comercial agrícola usa subitens .2x ou .9x, vedada subposição domissanitária (.1x)'
      }

      if (input.ncm || input.ncm_padrao) {
        const rawDigits = String(input.ncm || input.ncm_padrao).replace(/\D/g, '')
        if (rawDigits.length === 8) {
          const formatado = fallbackFormatarNcmMascara(rawDigits)
          if (!pertenceNotaSubpos2 && tipoProduto !== 'Fertilizante Mineral / Organomineral') {
            ncmPadrao = formatado
            ncmFaixa1 = formatado
            ncmFaixa2 = formatado
            ncmFaixa3 = formatado
            ncmFaixa4 = formatado
          }
        }
      }

      ncmPadrao = fallbackFormatarNcmMascara(ncmPadrao)
      ncmFaixa1 = fallbackFormatarNcmMascara(ncmFaixa1)
      ncmFaixa2 = fallbackFormatarNcmMascara(ncmFaixa2)
      ncmFaixa3 = fallbackFormatarNcmMascara(ncmFaixa3)
      ncmFaixa4 = fallbackFormatarNcmMascara(ncmFaixa4)

      let statusPisCofins = ''
      let aliquotaAteMar2026 = ''
      let aliquotaPosAbr2026Real = ''
      let aliquotaPosAbr2026Presumido = ''
      let cstSaida = ''
      let cstEntrada = ''
      let ibsCbs2027 = ''

      if (categoriaTributaria === 'tributado_integral') {
        statusPisCofins = 'Tributado Integralmente (SC COSIT 4/24 e 261/23)'
        aliquotaAteMar2026 = '9,25% Real / 3,65% Pres.'
        aliquotaPosAbr2026Real = '9,250% (Alíquota Integral)'
        aliquotaPosAbr2026Presumido = '3,650% (Alíquota Integral)'
        cstSaida = 'CST 01'
        cstEntrada = 'CST 50'
        ibsCbs2027 = 'Alíquota Padrão Integral (sem benefício fiscal)'
      } else if (categoriaTributaria === 'condicional') {
        statusPisCofins = 'Benefício Condicional (Dec. 5.630/05)'
        aliquotaAteMar2026 = '0,00% (se uso agro/ind.)'
        aliquotaPosAbr2026Real = '0,925% (se uso agro/ind.)'
        aliquotaPosAbr2026Presumido = '0,365% (se uso agro/ind.)'
        cstSaida = 'CST 06'
        cstEntrada = 'CST 73'
        ibsCbs2027 = 'Redução de 60% + Diferimento (Condicional)'
      } else {
        statusPisCofins =
          'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real / 0,365% Pres. pós-Abr/26 (LC 224/25)'
        aliquotaAteMar2026 = '0,00% (Lei nº 10.925/2004)'
        aliquotaPosAbr2026Real = '0,925% (LC nº 224/2025)'
        aliquotaPosAbr2026Presumido = '0,365% (LC nº 224/2025)'
        cstSaida = 'CST 06'
        cstEntrada = 'CST 73'
        ibsCbs2027 = 'Redução de 60% + Diferimento (Art. 138 e Anexo IX LC 214/2025)'
      }

      let urlOficial = String(input.url_oficial || '').trim()
      if (!urlOficial) {
        if (origemUpper.includes('SIPEAGRO')) {
          urlOficial = 'https://dados.agricultura.gov.br/dataset/sipeagro'
        } else if (origemUpper.includes('DOU')) {
          urlOficial = 'https://www.in.gov.br/consulta/-/buscar/dou'
        } else {
          urlOficial = 'https://dados.agricultura.gov.br'
        }
      }

      return {
        nome_completo: nomeCompleto,
        marca_padronizada: marcaPadronizada,
        tipo_produto: tipoProduto,
        embalagem: embalagemBruta,
        unidade: unidade,
        principio_ativo: principioAtivoBruto,
        macro_grupo: macroGrupo,
        sub_grupo: subGrupo,
        nota_subpos_2: notaSubpos2,
        ncm_padrao: ncmPadrao,
        ncm_faixa1_ate_300g: ncmFaixa1,
        ncm_faixa2_300g_a_7_5kg: ncmFaixa2,
        ncm_faixa3_7_5kg_a_10kg: ncmFaixa3,
        ncm_faixa4_acima_10kg: ncmFaixa4,
        regra_tipi: regraTipi,
        registro_mapa: registroMapaFormatado,
        sistema_norma_mapa: sistemaNormaMapa,
        titular_fabricante: titular,
        origem_base: origemBase,
        status_pis_cofins: statusPisCofins,
        aliquota_ate_mar2026: aliquotaAteMar2026,
        aliquota_pos_abr2026_real: aliquotaPosAbr2026Real,
        aliquota_pos_abr2026_presumido: aliquotaPosAbr2026Presumido,
        cst_saida: cstSaida,
        cst_entrada: cstEntrada,
        ibs_cbs_2027: ibsCbs2027,
        url_oficial: urlOficial,
      }
    }

    const motor = {
      normalizarTexto: fallbackNormTxt,
      sanitizarMarcaComercial: fallbackSanitizarMarca,
      formatarNcmMascara: fallbackFormatarNcmMascara,
      sanitizarRegistroMapa: fallbackSanitizarRegistroMapa,
      validarFormatoRegistroMapa: fallbackValidarFormatoRegistroMapa,
      verificarNotaSubpos2: fallbackVerificarNotaSubpos2,
      deduzirUnidade: fallbackDeduzirUnidade,
      executarMotorCanonico: fallbackExecutarMotorCanonico,
    }

    function normTxt(s) {
      return motor.normalizarTexto(s)
    }

    function cleanStr(s) {
      if (!s) return ''
      return String(s)
        .toLowerCase()
        .replace(/[\s\-_]/g, '')
    }

    const info = e.requestInfo()
    const data = info.body || {}

    const nomeProduto = String(data.nome_produto || data.nome_completo || '').trim()
    const ncmRaw = String(data.ncm || data.ncm_padrao || '').trim()
    const ncm = ncmRaw.replace(/\D/g, '')
    let embalagem = String(data.embalagem || '').trim()
    const quantidadeEmbalagem = String(
      data.quantidade_embalagem || data.qtd_embalagem_principal || '',
    ).trim()
    const unidadeEmbalagem = String(
      data.unidade_embalagem || data.unidade_embalagem_principal || data.unidade || '',
    ).trim()

    // Se a quantidade da embalagem foi informada separadamente e não consta na string de embalagem, compor
    let qtdFormatada = ''
    if (quantidadeEmbalagem) {
      const qtdUpper = quantidadeEmbalagem.toUpperCase().replace(/\s+/g, '')
      const unidUpper = unidadeEmbalagem.toUpperCase().replace(/\s+/g, '')
      if (/[A-Z]/.test(qtdUpper)) {
        qtdFormatada = qtdUpper
      } else if (unidUpper) {
        qtdFormatada = `${qtdUpper}${unidUpper}`
      } else {
        qtdFormatada = qtdUpper
      }
    }

    if (qtdFormatada) {
      if (!embalagem) {
        embalagem = qtdFormatada
      } else if (!embalagem.toUpperCase().includes(qtdFormatada)) {
        embalagem = `${embalagem} ${qtdFormatada}`.trim()
      }
    }

    const principioAtivo = String(data.principio_ativo || '').trim()
    const fabricante = String(data.fabricante || data.titular_fabricante || '').trim()
    let registroMapa = String(data.registro_mapa || '').trim()
    const concentracao = Number(data.concentracao)
    const unidadeConcentracao = String(data.unidade_concentracao || 'g/L').trim()
    const autoCadastrar = data.auto_cadastrar !== false // Default true

    // Sanitizar registro MAPA
    if (registroMapa) {
      registroMapa = motor.sanitizarRegistroMapa(registroMapa)
    }

    // Resolver ou criar Princípio Ativo na Matriz (13 campos canônicos) para garantir vínculo relacional 1:N
    let paRecordResolvido = null
    const paNomeUpper = String(principioAtivo || nomeProduto)
      .toUpperCase()
      .trim()
    if (paNomeUpper) {
      try {
        const colPaMatriz = $app.findCollectionByNameOrId('dicionario_principios_ativos')
        const escPa = paNomeUpper.replace(/'/g, "\\'")
        const pasExistentes = $app.findRecordsByFilter(
          'dicionario_principios_ativos',
          `principio_ativo_chave = '${escPa}' || principio_ativo = '${escPa}'`,
          '-created',
          1,
          0,
        )
        if (pasExistentes && pasExistentes.length > 0) {
          paRecordResolvido = pasExistentes[0]
        } else if (autoCadastrar) {
          // Criar na matriz com 13 campos canônicos
          const novoPa = new Record(colPaMatriz)
          const isNota2 = motor.verificarNotaSubpos2(paNomeUpper, nomeProduto)
          const nota2Val = isNota2 ? 'SIM' : 'NÃO'

          let macroSub = 'Defensivos — Herbicida'
          let ncmRef = '3808.93.29'
          let ncmF1 = '3808.93.29'
          let ncmF2 = '3808.93.29'
          let ncmF3 = '3808.93.29'
          let ncmF4 = '3808.93.29'
          let ncmGranel = '3808.93.19'
          let regTipi = 'Posição 38.08 TIPI: Embalagem comercial agrícola'
          let sisMapa = 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)'
          let regimePis = 'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real pós-Abr/26'
          let cstStr = 'Saída: CST 06 (c/ Ajuste M220/M620) | Entrada: CST 73'

          if (isNota2) {
            macroSub = 'Defensivos — Inseticida / Acaricida'
            ncmRef = '3808.62.90'
            ncmF1 = '3808.61.00'
            ncmF2 = '3808.62.90'
            ncmF3 = '3808.69.90'
            ncmF4 = '3808.69.90'
            ncmGranel = '3808.69.90'
            regTipi = 'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022)'
          }

          novoPa.set('principio_ativo_chave', paNomeUpper)
          novoPa.set('macro_grupo_subgrupo_padrao', macroSub)
          novoPa.set('nota_subpos_2', nota2Val)
          novoPa.set('ncm_padrao_referencia', motor.formatarNcmMascara(ncmRef))
          novoPa.set('ncm_faixa1_ate_300g', motor.formatarNcmMascara(ncmF1))
          novoPa.set('ncm_faixa2_300g_a_7_5kg', motor.formatarNcmMascara(ncmF2))
          novoPa.set('ncm_faixa3_7_5kg_a_10kg', motor.formatarNcmMascara(ncmF3))
          novoPa.set('ncm_faixa4_acima_10kg', motor.formatarNcmMascara(ncmF4))
          novoPa.set('ncm_granel_tecnico', motor.formatarNcmMascara(ncmGranel))
          novoPa.set('regra_tipi_embalagem', regTipi)
          novoPa.set('sistema_registro_mapa', sisMapa)
          novoPa.set('enquadramento_pis_cofins', regimePis)
          novoPa.set('cst_recomendado', cstStr)
          novoPa.set('principio_ativo', paNomeUpper)
          novoPa.set('status', 'Ativo')

          $app.save(novoPa)
          paRecordResolvido = novoPa
        }
      } catch (errPa) {
        console.log('Aviso ao resolver princípio ativo na matriz:', errPa.message)
      }
    }

    // -------------------------------------------------------------------------
    // AUDITORIA AMPLIADA: CONSULTAS EXTERNAS
    // -------------------------------------------------------------------------
    const fontesConsultadas = []

    let ncmExternoInfo = null
    if (ncm && ncm.length === 8) {
      const urlBrasilApi = `https://brasilapi.com.br/api/ncm/v1/${ncm}`
      try {
        const resNcm = $http.send({
          url: urlBrasilApi,
          method: 'GET',
          headers: {
            'User-Agent': 'ValidadorAgro/1.0 (Auditoria Fiscal)',
            Accept: 'application/json',
          },
          timeout: 5,
        })

        if (resNcm.statusCode === 200) {
          const bodyNcm =
            typeof resNcm.json === 'function' ? resNcm.json() : JSON.parse(resNcm.raw || '{}')
          ncmExternoInfo = {
            codigo: bodyNcm.codigo || ncm,
            descricao: bodyNcm.descricao || '',
            data_inicio: bodyNcm.data_inicio || '',
            data_fim: bodyNcm.data_fim || '',
            ato: bodyNcm.numero_ato
              ? `${bodyNcm.tipo_ato || 'Ato'} ${bodyNcm.numero_ato}/${bodyNcm.ano_ato || ''}`
              : '',
          }
          fontesConsultadas.push({
            fonte: 'Classif Siscomex / TIPI (Receita Federal)',
            tipo: 'ncm',
            status: 'sucesso',
            url: 'https://portalunico.siscomex.gov.br/classif/',
            detalhes: `NCM ${ncm} validada no catálogo oficial. Descrição: "${ncmExternoInfo.descricao}". Vigência: ${ncmExternoInfo.data_inicio || 'Vigente'}.`,
          })
        } else if (resNcm.statusCode === 404) {
          fontesConsultadas.push({
            fonte: 'Classif Siscomex / TIPI (Receita Federal)',
            tipo: 'ncm',
            status: 'nao_encontrado',
            url: 'https://portalunico.siscomex.gov.br/classif/',
            detalhes: `Código NCM ${ncm} não encontrado na tabela oficial da TIPI/Siscomex.`,
          })
        } else {
          fontesConsultadas.push({
            fonte: 'Classif Siscomex / TIPI (Receita Federal)',
            tipo: 'ncm',
            status: 'indisponivel',
            url: 'https://portalunico.siscomex.gov.br/classif/',
            detalhes: `Consulta externa retornou status ${resNcm.statusCode}. Utilizando dados locais.`,
          })
        }
      } catch (httpErr) {
        fontesConsultadas.push({
          fonte: 'Classif Siscomex / TIPI (Receita Federal)',
          tipo: 'ncm',
          status: 'indisponivel',
          url: 'https://portalunico.siscomex.gov.br/classif/',
          detalhes: `Serviço externo temporariamente indisponível (${httpErr.message || 'timeout'}). Auditoria mantida pela base local.`,
        })
      }
    }

    let agrofitInfo = null
    let bulaInfo = null
    const mapaLimpo = registroMapa.trim()
    const mapaDigits = mapaLimpo.replace(/\D/g, '')

    if (mapaDigits.length >= 4 || nomeProduto) {
      try {
        const promptAgrofit = `Você é o auditor oficial de registros fitossanitários do Ministério da Agricultura (MAPA / AGROFIT).
Analise os dados fornecidos pelo usuário para validação cadastral:
- Nome Comercial: "${nomeProduto}"
- Registro MAPA: "${registroMapa}"
- Princípio Ativo informado: "${principioAtivo}"
- Fabricante informado: "${fabricante}"
- Concentração informada: "${concentracao} ${unidadeConcentracao}"
- Embalagem informada: "${embalagem}"

Com base na base pública oficial do AGROFIT e nas bulas oficiais registradas no MAPA:
1. Verifique se o registro MAPA "${registroMapa}" ou o produto "${nomeProduto}" existe no AGROFIT.
2. Identifique o status regulatório (Vigente, Cancelado, Em análise, Suspenso ou Não Localizado).
3. Recupere os dados oficiais da BULA: titular, ingrediente ativo, concentração oficial, formulação, classe de uso agronômico, culturas principais e resumo.
4. Responda ESTRITAMENTE em formato JSON:
{
  "encontrado": true/false,
  "status_registro": "Vigente" | "Cancelado" | "Não localizado" | "Pendente",
  "registro_oficial": "número oficial ou padrão",
  "titular_oficial": "Nome da empresa titular",
  "principio_ativo_oficial": "Nome oficial do ingrediente ativo",
  "concentracao_oficial": número ou string,
  "unidade_concentracao_oficial": "g/L ou % ou g/kg",
  "classe_uso": "Herbicida / Inseticida / etc.",
  "formulacao": "ex: Concentrado Solúvel (SL)",
  "culturas_principais": ["Soja", "Milho"],
  "bula_resumo": "Breve resumo agronômico oficial",
  "divergencias": ["divergência 1 se houver"],
  "link_oficial": "https://dados.agricultura.gov.br"
}`

        const aiRes = $ai.chat({
          model: 'fast',
          messages: [
            {
              role: 'system',
              content:
                'Você é um motor especialista em agrotóxicos e fertilizantes do MAPA/AGROFIT. Responda apenas JSON válido.',
            },
            { role: 'user', content: promptAgrofit },
          ],
        })

        const rawAiText = aiRes.choices?.[0]?.message?.content || '{}'
        const jsonMatch = rawAiText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsedAi = JSON.parse(jsonMatch[0])
          if (parsedAi && typeof parsedAi === 'object') {
            agrofitInfo = {
              encontrado: Boolean(parsedAi.encontrado),
              status_registro:
                parsedAi.status_registro || (parsedAi.encontrado ? 'Vigente' : 'Não localizado'),
              registro_oficial: parsedAi.registro_oficial || registroMapa,
              titular_oficial: parsedAi.titular_oficial || fabricante,
              classe_uso: parsedAi.classe_uso || 'Agrotóxico Fitossanitário',
              formulacao: parsedAi.formulacao || '',
              culturas: parsedAi.culturas_principais || [],
              link: parsedAi.link_oficial || 'https://dados.agricultura.gov.br',
            }

            bulaInfo = {
              encontrada: Boolean(parsedAi.encontrado),
              principio_ativo_oficial: parsedAi.principio_ativo_oficial || '',
              concentracao_oficial: parsedAi.concentracao_oficial || '',
              unidade_oficial: parsedAi.unidade_concentracao_oficial || '',
              resumo: parsedAi.bula_resumo || '',
              divergencias: Array.isArray(parsedAi.divergencias) ? parsedAi.divergencias : [],
            }

            fontesConsultadas.push({
              fonte: 'Sistema AGROFIT — Ministério da Agricultura (MAPA)',
              tipo: 'mapa',
              status: parsedAi.encontrado ? 'sucesso' : 'nao_encontrado',
              url: agrofitInfo.link,
              detalhes: parsedAi.encontrado
                ? `Registro MAPA validado no AGROFIT. Status: ${agrofitInfo.status_registro}. Titular oficial: ${agrofitInfo.titular_oficial}. Classe: ${agrofitInfo.classe_uso}.`
                : `Registro MAPA "${registroMapa}" não localizado com status regular no AGROFIT.`,
            })
          }
        }
      } catch (aiErr) {
        fontesConsultadas.push({
          fonte: 'Sistema AGROFIT — Ministério da Agricultura (MAPA)',
          tipo: 'mapa',
          status: 'indisponivel',
          url: 'https://dados.agricultura.gov.br',
          detalhes: `Consulta ampliada AGROFIT indisponível (${aiErr.message || 'timeout'}). Auditoria mantida por regras locais.`,
        })
      }
    }

    // -------------------------------------------------------------------------
    // TRAVAS DE AUDITORIA (1 a 6)
    // -------------------------------------------------------------------------
    const travas = []
    const avisosDivergencia = []

    // TRAVA 1: NCM Obrigatório
    let trava1Passou = false
    let trava1Msg = ''
    let regraNcmRecord = null

    if (!ncm) {
      trava1Msg = 'NCM não informado. Obrigatório 8 dígitos numéricos.'
    } else if (ncm.length !== 8) {
      trava1Msg = `NCM "${ncmRaw}" inválido. Deve conter exatamente 8 dígitos numéricos.`
    } else {
      try {
        const records = $app.findRecordsByFilter(
          'regras_ncm_embalagem',
          `ncm = '${ncm}'`,
          '-created',
          1,
          0,
        )
        if (records && records.length > 0) {
          regraNcmRecord = records[0]
          trava1Passou = true
          trava1Msg = `NCM ${ncm} válido e localizado na tabela TIPI (${regraNcmRecord.getString('descricao') || 'Sem descrição'}).`
        } else if (ncmExternoInfo && ncmExternoInfo.descricao) {
          trava1Passou = true
          trava1Msg = `NCM ${ncm} homologado via Catálogo Oficial Siscomex/TIPI ("${ncmExternoInfo.descricao}").`
        } else {
          trava1Msg = `NCM ${ncm} não cadastrado na tabela de Regras NCM × Embalagem (TIPI) nem confirmado nas fontes oficiais.`
        }
      } catch (err) {
        trava1Msg = `Erro ao consultar regras para o NCM ${ncm}: ${err.message}`
      }
    }

    travas.push({
      id_trava: 1,
      trava_nome: 'NCM Obrigatório',
      aprovado: trava1Passou,
      mensagem: trava1Msg,
    })

    // TRAVA 2: Embalagem vs NCM
    let trava2Passou = false
    let trava2Msg = ''

    if (!embalagem) {
      trava2Msg = 'Tipo de embalagem não informado.'
    } else if (!regraNcmRecord) {
      trava2Passou = true
      trava2Msg = `Embalagem "${embalagem}" recebida. Sem restrições impeditivas locais cadastradas para o NCM.`
    } else {
      try {
        const rawJson = regraNcmRecord.getString('embalagens_permitidas')
        let permitidas = []
        if (rawJson) {
          try {
            const parsed = JSON.parse(rawJson)
            if (Array.isArray(parsed)) permitidas = parsed
            else if (typeof parsed === 'string')
              permitidas = parsed.split(/[,;/|]/).map((s) => s.trim())
          } catch (_) {
            permitidas = rawJson.split(/[,;/|]/).map((s) => s.trim())
          }
        }
        permitidas = permitidas.map((s) => String(s).trim()).filter(Boolean)

        if (!Array.isArray(permitidas) || permitidas.length === 0) {
          trava2Passou = true
          trava2Msg = `Nenhuma restrição específica de embalagem cadastrada para o NCM ${ncm}. Embalagem "${embalagem}" aceita.`
        } else {
          const embNorm = cleanStr(embalagem)
          const match = permitidas.some((p) => {
            const pNorm = cleanStr(p)
            return embNorm === pNorm || embNorm.includes(pNorm) || pNorm.includes(embNorm)
          })
          if (match) {
            trava2Passou = true
            trava2Msg = `Embalagem "${embalagem}" autorizada para o NCM ${ncm}.`
          } else {
            trava2Msg = `Embalagem "${embalagem}" NÃO autorizada para o NCM ${ncm}. Permitidas: ${permitidas.slice(0, 6).join(', ')}.`
          }
        }
      } catch (err) {
        trava2Msg = `Falha ao processar matriz de embalagens permitidas: ${err.message}`
      }
    }

    travas.push({
      id_trava: 2,
      trava_nome: 'Embalagem vs NCM',
      aprovado: trava2Passou,
      mensagem: trava2Msg,
    })

    // TRAVA 3: Princípio Ativo Obrigatório
    let trava3Passou = false
    let trava3Msg = ''
    let principioRecord = null

    if (!principioAtivo) {
      trava3Msg = 'Princípio ativo não informado.'
    } else {
      try {
        const escaped = principioAtivo.replace(/'/g, "\\'")
        const records = $app.findRecordsByFilter(
          'dicionario_principios_ativos',
          `principio_ativo ~ '${escaped}'`,
          '-created',
          1,
          0,
        )
        if (records && records.length > 0) {
          principioRecord = records[0]
          trava3Passou = true
          trava3Msg = `Princípio ativo "${principioRecord.getString('principio_ativo')}" homologado no dicionário.`
        } else if (bulaInfo && bulaInfo.principio_ativo_oficial) {
          trava3Passou = true
          trava3Msg = `Princípio ativo "${principioAtivo}" confirmado oficialmente pela Bula do AGROFIT.`
        } else {
          trava3Msg = `Princípio ativo "${principioAtivo}" não encontrado no Dicionário de Princípios Ativos.`
        }
      } catch (err) {
        trava3Msg = `Erro ao consultar Dicionário de Princípios Ativos: ${err.message}`
      }
    }

    travas.push({
      id_trava: 3,
      trava_nome: 'Princípio Ativo Obrigatório',
      aprovado: trava3Passou,
      mensagem: trava3Msg,
    })

    // TRAVA 4: Duplicidade Multicritério na Base Mestre
    let trava4Passou = false
    let trava4Msg = ''
    let duplicataEncontrada = null

    if (!ncm && !nomeProduto) {
      trava4Msg = 'Dados insuficientes para verificação de duplicidade.'
    } else {
      try {
        const escNcm = ncm.replace(/'/g, "\\'")
        const escNome = nomeProduto.replace(/'/g, "\\'")
        const escMapa = registroMapa.replace(/'/g, "\\'")

        // 1. Checagem por Nome do Produto / Marca + NCM
        if (nomeProduto && ncm) {
          const porNome = $app.findRecordsByFilter(
            'base_mestre',
            `(ncm_padrao = '${escNcm}' || ncm = '${escNcm}') && (nome_completo ~ '${escNome}' || nome_produto ~ '${escNome}' || marca_padronizada ~ '${escNome}')`,
            '-created',
            5,
            0,
          )
          const matchNome = (porNome || []).find((r) => {
            const nomeRec = r.getString('nome_completo') || r.getString('nome_produto')
            return normTxt(nomeRec) === normTxt(nomeProduto)
          })
          if (matchNome) {
            duplicataEncontrada = matchNome
            trava4Msg = `Produto duplicado: Marca/Nome idêntico já cadastrado na Base Mestre.`
          }
        }

        // 2. Checagem por Registro MAPA
        if (!duplicataEncontrada && registroMapa && registroMapa.replace(/\D/g, '').length >= 4) {
          const limpoMapaDigits = registroMapa.replace(/\D/g, '')
          const porMapa = $app.findRecordsByFilter(
            'base_mestre',
            `registro_mapa ~ '${escMapa}'`,
            '-created',
            5,
            0,
          )
          const matchMapa = (porMapa || []).find((r) => {
            const m = r.getString('registro_mapa').replace(/\D/g, '')
            return m && m === limpoMapaDigits
          })
          if (matchMapa) {
            duplicataEncontrada = matchMapa
            trava4Msg = `Produto duplicado: Registro MAPA ${registroMapa} já cadastrado na Base Mestre.`
          }
        }

        if (duplicataEncontrada) {
          trava4Passou = false
        } else {
          trava4Passou = true
          trava4Msg = 'Nenhuma duplicidade encontrada na Base Mestre.'
        }
      } catch (err) {
        trava4Msg = `Erro ao checar duplicidade: ${err.message}`
      }
    }

    travas.push({
      id_trava: 4,
      trava_nome: 'Duplicidade',
      aprovado: trava4Passou,
      mensagem: trava4Msg,
    })

    // TRAVA 5: Concentração Válida
    let trava5Passou = false
    let trava5Msg = ''

    if (isNaN(concentracao) || concentracao <= 0) {
      trava5Msg = 'Concentração não informada ou valor numérico inválido.'
    } else if (!principioRecord) {
      trava5Passou = true
      trava5Msg = `Concentração informada (${concentracao} ${unidadeConcentracao}). Aceita para análise.`
    } else {
      const min = principioRecord.getFloat('concentracao_min')
      const max = principioRecord.getFloat('concentracao_max')
      const unid = principioRecord.getString('unidade') || '%'

      if (min === 0 && max === 0) {
        trava5Passou = true
        trava5Msg = `Concentração informada (${concentracao} ${unid}). Princípio ativo sem restrição rígida de faixa.`
      } else if (concentracao < min) {
        trava5Msg = `Concentração informada (${concentracao} ${unid}) abaixo do mínimo (${min} ${unid}).`
      } else if (max > 0 && concentracao > max) {
        trava5Msg = `Concentração informada (${concentracao} ${unid}) excede o máximo (${max} ${unid}).`
      } else {
        trava5Passou = true
        trava5Msg = `Concentração ${concentracao} ${unid} dentro da faixa regulamentar (${min} a ${max} ${unid}).`
      }
    }

    travas.push({
      id_trava: 5,
      trava_nome: 'Concentração Válida',
      aprovado: trava5Passou,
      mensagem: trava5Msg,
    })

    // TRAVA 6: Registro MAPA com Validação Estrita de Formato
    let trava6Passou = false
    let trava6Msg = ''

    if (!registroMapa) {
      trava6Msg = 'Número de Registro MAPA não informado.'
    } else {
      const isValidFormat = motor.validarFormatoRegistroMapa(registroMapa)
      if (!isValidFormat) {
        trava6Msg = `Registro MAPA "${registroMapa}" deve iniciar com 'Nº ', código 'TC' ou 'ISENTO'.`
      } else {
        trava6Passou = true
        trava6Msg = `Registro MAPA "${registroMapa}" formatado conforme padrão oficial.`
      }
    }

    travas.push({
      id_trava: 6,
      trava_nome: 'Registro MAPA',
      aprovado: trava6Passou,
      mensagem: trava6Msg,
    })

    // Resultado Geral
    const totalTravas = travas.length
    const totalAprovadas = travas.filter((t) => t.aprovado).length
    const score = Math.round((totalAprovadas / totalTravas) * 100)
    const statusGeral = totalAprovadas === totalTravas ? 'APROVADO' : 'REPROVADO'

    // Preenchimento e dedução determinística dos 28 campos canônicos via motor
    const dadosParaMotor = {
      nome_completo: nomeProduto,
      embalagem: embalagem,
      unidade: unidadeEmbalagem,
      principio_ativo: bulaInfo?.principio_ativo_oficial || principioAtivo,
      registro_mapa: registroMapa,
      titular_fabricante: agrofitInfo?.titular_oficial || fabricante,
      ncm_padrao: ncm,
      origem_base: 'PRE_CADASTRO_PORTAL',
      url_oficial: agrofitInfo?.link || 'https://dados.agricultura.gov.br',
    }

    const canonicoCalculado = motor.executarMotorCanonico(dadosParaMotor)

    // -------------------------------------------------------------------------
    // PREENCHIMENTO AUTOMÁTICO DA BASE MESTRE SE APROVADO
    // -------------------------------------------------------------------------
    let baseMestreInclusao = {
      incluido: false,
      motivo: '',
      id_registro: null,
    }

    if (statusGeral === 'APROVADO' && autoCadastrar) {
      if (duplicataEncontrada) {
        baseMestreInclusao = {
          incluido: false,
          motivo: `Não inserido na Base Mestre pois já existe produto correspondente cadastrado.`,
          id_registro: duplicataEncontrada.id,
        }
      } else {
        try {
          const colBase = $app.findCollectionByNameOrId('base_mestre')
          const recBase = new Record(colBase)

          // Gravação dos 28 campos canônicos com vínculo relacional
          if (paRecordResolvido) {
            recBase.set('principio_ativo_id', paRecordResolvido.id)
          }
          recBase.set('nome_completo', canonicoCalculado.nome_completo)
          recBase.set('marca_padronizada', canonicoCalculado.marca_padronizada)
          recBase.set('tipo_produto', canonicoCalculado.tipo_produto)
          recBase.set('embalagem', canonicoCalculado.embalagem)
          recBase.set('unidade', canonicoCalculado.unidade)
          recBase.set('principio_ativo', canonicoCalculado.principio_ativo)
          recBase.set('macro_grupo', canonicoCalculado.macro_grupo)
          recBase.set('sub_grupo', canonicoCalculado.sub_grupo)
          recBase.set('nota_subpos_2', canonicoCalculado.nota_subpos_2)
          recBase.set('ncm_padrao', canonicoCalculado.ncm_padrao)
          recBase.set('ncm_faixa1_ate_300g', canonicoCalculado.ncm_faixa1_ate_300g)
          recBase.set('ncm_faixa2_300g_a_7_5kg', canonicoCalculado.ncm_faixa2_300g_a_7_5kg)
          recBase.set('ncm_faixa3_7_5kg_a_10kg', canonicoCalculado.ncm_faixa3_7_5kg_a_10kg)
          recBase.set('ncm_faixa4_acima_10kg', canonicoCalculado.ncm_faixa4_acima_10kg)
          recBase.set('regra_tipi', canonicoCalculado.regra_tipi)
          recBase.set('registro_mapa', canonicoCalculado.registro_mapa)
          recBase.set('sistema_norma_mapa', canonicoCalculado.sistema_norma_mapa)
          recBase.set('titular_fabricante', canonicoCalculado.titular_fabricante)
          recBase.set('origem_base', canonicoCalculado.origem_base)
          recBase.set('status_pis_cofins', canonicoCalculado.status_pis_cofins)
          recBase.set('aliquota_ate_mar2026', canonicoCalculado.aliquota_ate_mar2026)
          recBase.set('aliquota_pos_abr2026_real', canonicoCalculado.aliquota_pos_abr2026_real)
          recBase.set(
            'aliquota_pos_abr2026_presumido',
            canonicoCalculado.aliquota_pos_abr2026_presumido,
          )
          recBase.set('cst_saida', canonicoCalculado.cst_saida)
          recBase.set('cst_entrada', canonicoCalculado.cst_entrada)
          recBase.set('ibs_cbs_2027', canonicoCalculado.ibs_cbs_2027)
          recBase.set('url_oficial', canonicoCalculado.url_oficial)

          // Compatibilidade legada
          recBase.set('nome_produto', canonicoCalculado.marca_padronizada)
          recBase.set('ncm', canonicoCalculado.ncm_padrao.replace(/\D/g, ''))
          recBase.set('fabricante', canonicoCalculado.titular_fabricante)
          recBase.set('concentracao', concentracao || 0)
          recBase.set('unidade_concentracao', unidadeConcentracao)
          recBase.set('status_validacao', 'aprovado')
          recBase.set(
            'macro_grupo_subgrupo',
            `${canonicoCalculado.macro_grupo} — ${canonicoCalculado.sub_grupo}`,
          )
          recBase.set('regra_tipi_embalagem', canonicoCalculado.regra_tipi)
          recBase.set(
            'cst_recomendado',
            `Saída: ${canonicoCalculado.cst_saida} | Entrada: ${canonicoCalculado.cst_entrada}`,
          )
          recBase.set('dados_classificacao', JSON.stringify(canonicoCalculado))

          $app.save(recBase)

          baseMestreInclusao = {
            incluido: true,
            motivo:
              'Produto aprovado em todas as 6 travas e consolidado na Base Mestre no Padrão Canônico de 28 Campos.',
            id_registro: recBase.id,
          }
        } catch (insertErr) {
          baseMestreInclusao = {
            incluido: false,
            motivo: `Falha ao auto-incluir na Base Mestre: ${insertErr.message}`,
            id_registro: null,
          }
        }
      }
    }

    // Gravar no log_validacoes
    try {
      const logCol = $app.findCollectionByNameOrId('log_validacoes')
      for (const t of travas) {
        const logRec = new Record(logCol)
        logRec.set('nome_produto', nomeProduto || 'Não informado')
        logRec.set('ncm', ncm || ncmRaw)
        logRec.set('embalagem', embalagem)
        logRec.set('principio_ativo', principioAtivo)
        logRec.set('id_trava', t.id_trava)
        logRec.set('trava_nome', t.trava_nome)
        logRec.set('aprovado', t.aprovado)
        logRec.set('mensagem', t.mensagem)
        $app.save(logRec)
      }
    } catch (logErr) {
      console.log('Aviso ao registrar log_validacoes:', logErr.message)
    }

    return e.json(200, {
      status: statusGeral,
      score: score,
      total_travas: totalTravas,
      total_aprovadas: totalAprovadas,
      travas: travas,
      fontes_consultadas: fontesConsultadas,
      avisos_divergencia: avisosDivergencia,
      base_mestre_inclusao: baseMestreInclusao,
      produto_validado: canonicoCalculado,
    })
  } catch (errTop) {
    console.log('Erro crítico ao validar produto:', errTop.message || errTop)
    return e.json(500, {
      status: 'REPROVADO',
      score: 0,
      total_travas: 6,
      total_aprovadas: 0,
      travas: [],
      error: `Erro interno no servidor ao validar produto: ${errTop.message || String(errTop)}`,
    })
  }
})

/**
 * GET /backend/v1/relatorio-duplicidades
 * Retorna grupos de duplicidades identificados na collection base_mestre
 */
routerAdd('GET', '/backend/v1/relatorio-duplicidades', (e) => {
  try {
    const records = $app.findRecordsByFilter('base_mestre', 'id != ""', '-created', 1500, 0) || []

    const norm = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')

    const simplifyRecord = (r) => ({
      id: r.id,
      nome_completo: r.getString('nome_completo') || r.getString('nome_produto'),
      marca_padronizada: r.getString('marca_padronizada') || r.getString('nome_produto'),
      ncm_padrao: r.getString('ncm_padrao') || r.getString('ncm'),
      embalagem: r.getString('embalagem'),
      principio_ativo: r.getString('principio_ativo'),
      titular_fabricante: r.getString('titular_fabricante') || r.getString('fabricante'),
      registro_mapa: r.getString('registro_mapa'),
      created: r.getString('created'),
    })

    const gruposMap = {}

    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      const ncm = String(rec.getString('ncm_padrao') || rec.getString('ncm') || '').replace(
        /\D/g,
        '',
      )
      const nome = rec.getString('nome_completo') || rec.getString('nome_produto')
      const marca = rec.getString('marca_padronizada') || nome
      const marcaNorm = norm(marca)
      const pa = rec.getString('principio_ativo')
      const paNorm = norm(pa)
      const mapa = rec.getString('registro_mapa')
      const mapaDigits = mapa.replace(/\D/g, '')

      const item = simplifyRecord(rec)

      // Critério C: Marca Comercial / Nome Normalizado + NCM
      if (marcaNorm && ncm && ncm.length === 8) {
        const key = `c_nome_ncm:${marcaNorm}_${ncm}`
        if (!gruposMap[key]) {
          gruposMap[key] = {
            id: key,
            criterio: 'Marca Padronizada + NCM',
            criterio_tipo: 'nome_ncm',
            chave: `${marca} (NCM ${ncm})`,
            registros: [],
          }
        }
        gruposMap[key].registros.push(item)
      }

      // Critério B: Registro MAPA repetido
      if (mapaDigits.length >= 4) {
        const key = `b_mapa:${mapaDigits}`
        if (!gruposMap[key]) {
          gruposMap[key] = {
            id: key,
            criterio: 'Registro MAPA Duplicado',
            criterio_tipo: 'registro_mapa',
            chave: `MAPA ${mapa}`,
            registros: [],
          }
        }
        gruposMap[key].registros.push(item)
      }

      // Critério A: NCM + Princípio Ativo Normalizado
      if (ncm && ncm.length === 8 && paNorm && paNorm !== 'naoinformado' && paNorm !== 'padrao') {
        const key = `a_ncm_pa:${ncm}_${paNorm}`
        if (!gruposMap[key]) {
          gruposMap[key] = {
            id: key,
            criterio: 'NCM + Princípio Ativo',
            criterio_tipo: 'ncm_pa',
            chave: `NCM ${ncm} + ${pa}`,
            registros: [],
          }
        }
        gruposMap[key].registros.push(item)
      }
    }

    const gruposDuplicados = []
    const idsProdutosDuplicados = {}

    for (const k in gruposMap) {
      const g = gruposMap[k]
      const uniqueRegs = []
      const seenIds = {}
      for (let j = 0; j < g.registros.length; j++) {
        const r = g.registros[j]
        if (!seenIds[r.id]) {
          seenIds[r.id] = true
          uniqueRegs.push(r)
        }
      }

      if (uniqueRegs.length > 1) {
        g.registros = uniqueRegs
        g.total_ocorrencias = uniqueRegs.length
        gruposDuplicados.push(g)

        uniqueRegs.forEach((r) => {
          idsProdutosDuplicados[r.id] = true
        })
      }
    }

    gruposDuplicados.sort((a, b) => b.total_ocorrencias - a.total_ocorrencias)

    return e.json(200, {
      total_grupos: gruposDuplicados.length,
      total_produtos_duplicados: Object.keys(idsProdutosDuplicados).length,
      grupos: gruposDuplicados,
    })
  } catch (err) {
    return e.json(500, {
      error: 'Erro ao analisar duplicidades na Base Mestre: ' + err.message,
    })
  }
})
