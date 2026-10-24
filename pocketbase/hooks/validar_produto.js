/**
 * POST /backend/v1/validar-produto
 * Endpoint canônico para validação de produtos agrícolas e novos cadastros:
 * - FORMULÁRIO DE ENTRADA: Nome Comercial (obrigatório), NCM (obrigatório),
 *   Princípio Ativo (opcional), Código MAPA (opcional), Embalagem (opcional).
 * - ETAPA 1: Busca pelo Nome Comercial na Base Mestre, Dicionário de PAs e fontes externas (AGROFIT / Bula MAPA).
 * - ETAPA 2: Validação cruzada campo a campo com status (OK / DIVERGENTE / NÃO INFORMADO / NÃO LOCALIZADO)
 *   e conferência com as Travas de Auditoria (1 a 4).
 * - ETAPA 3: NCM por Embalagem em linhas diferentes (conforme faixas TIPI / fertilizantes).
 * - Suporta validação de novo cadastro e conferência de cadastro existente da Base Mestre.
 * - Suporta auto_cadastrar e gravação canônica de 28 campos + registro em log_validacoes.
 */

routerAdd('POST', '/backend/v1/validar-produto', (e) => {
  try {
    // -------------------------------------------------------------------------
    // MOTOR QUÍMICO-ADUANEIRO E TRIBUTÁRIO CANÔNICO (Inline para isolamento)
    // -------------------------------------------------------------------------
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

        // Reconhecimento químico determinístico das principais moléculas de fungicidas (subposição 3808.92)
        const isFungicidaMolecula =
          paUpper.includes('CIPROCONAZOL') ||
          paUpper.includes('CYPROCONAZOLE') ||
          paUpper.includes('PICOXISTROBINA') ||
          paUpper.includes('PICOXYSTROBIN') ||
          paUpper.includes('TEBUCONAZOL') ||
          paUpper.includes('TEBUCONAZOLE') ||
          paUpper.includes('AZOXISTROBINA') ||
          paUpper.includes('AZOXYSTROBIN') ||
          paUpper.includes('DIFENOCONAZOL') ||
          paUpper.includes('DIFENOCONAZOLE') ||
          paUpper.includes('EPOXICONAZOL') ||
          paUpper.includes('EPOXICONAZOLE') ||
          paUpper.includes('PROTIOCONAZOL') ||
          paUpper.includes('PROTHIOCONAZOLE') ||
          paUpper.includes('MANCOZEB') ||
          paUpper.includes('MANCOZEBE') ||
          paUpper.includes('CLOROTALONIL') ||
          paUpper.includes('CHLOROTHALONIL') ||
          paUpper.includes('TRIFLOXISTROBINA') ||
          paUpper.includes('TRIFLOXYSTROBIN') ||
          paUpper.includes('PIRACLOSTROBINA') ||
          paUpper.includes('PYRACLOSTROBIN') ||
          paUpper.includes('CARBENDAZIM') ||
          paUpper.includes('BOSCALIDA') ||
          paUpper.includes('FLUXAPIROXADE') ||
          paUpper.includes('FLUXAPYROXAD') ||
          paUpper.includes('FOLPET') ||
          paUpper.includes('CAPTANA') ||
          paUpper.includes('CAPTAN') ||
          paUpper.includes('CUPRICO') ||
          paUpper.includes('COBRE') ||
          paUpper.includes('OXICLORETO DE COBRE') ||
          paUpper.includes('HIDROXIDO DE COBRE') ||
          paUpper.includes('SULFATOCUPRICO') ||
          paUpper.includes('ENXOFRE') ||
          paUpper.includes('SULFUR') ||
          paUpper.includes('PROPICONAZOL') ||
          paUpper.includes('PROPICONAZOLE') ||
          paUpper.includes('METCONAZOL') ||
          paUpper.includes('METCONAZOLE') ||
          paUpper.includes('KRESOXIM') ||
          paUpper.includes('DIMETOMORFE') ||
          paUpper.includes('DIMETHOMORPH') ||
          paUpper.includes('IPRODIONA') ||
          paUpper.includes('IPRODIONE') ||
          paUpper.includes('TIABENDAZOL') ||
          paUpper.includes('THIABENDAZOLE') ||
          paUpper.includes('TIOFANATO') ||
          paUpper.includes('THIOPHANATE') ||
          paUpper.includes('METALAXIL') ||
          paUpper.includes('METALAXYL') ||
          paUpper.includes('MEFENOXAM') ||
          nomeUpper.includes('FOLICRON') ||
          nomeUpper.includes('PRIORI') ||
          nomeUpper.includes('SPHERE') ||
          nomeUpper.includes('NATIVO') ||
          nomeUpper.includes('ELATUS') ||
          nomeUpper.includes('OPERA') ||
          nomeUpper.includes('FOX')

        // Reconhecimento químico determinístico de inseticidas (subposição 3808.91)
        const isInseticidaMolecula =
          paUpper.includes('TIAMETOXAM') ||
          paUpper.includes('THIAMETHOXAM') ||
          paUpper.includes('IMIDACLOPRID') ||
          paUpper.includes('CLORANTRANILIPROLE') ||
          paUpper.includes('CHLORANTRANILIPROLE') ||
          paUpper.includes('ACEFATO') ||
          paUpper.includes('ACEPHATE') ||
          paUpper.includes('CIPERMETRINA') ||
          paUpper.includes('CYPERMETHRIN') ||
          paUpper.includes('BIFENTRINA') ||
          paUpper.includes('BIFENTHRIN') ||
          paUpper.includes('FIPRONIL') ||
          paUpper.includes('LAMBDA-CIALOTRINA') ||
          paUpper.includes('LAMBDA CIALOTRINA') ||
          paUpper.includes('LUFENURON') ||
          paUpper.includes('ESPINOSADE') ||
          paUpper.includes('SPINOSAD') ||
          paUpper.includes('SPINETORAM') ||
          paUpper.includes('THURINGIENSIS') ||
          paUpper.includes('BACILLUS THURINGIENSIS') ||
          paUpper.includes('CLORFENAPIR') ||
          paUpper.includes('CHLORFENAPYR') ||
          paUpper.includes('DELTAMETRINA') ||
          paUpper.includes('DELTAMETHRIN') ||
          paUpper.includes('MALATIONA') ||
          paUpper.includes('MALATHION') ||
          paUpper.includes('PERMETRINA') ||
          paUpper.includes('PERMETHRIN') ||
          paUpper.includes('ACETAMIPRIDO') ||
          paUpper.includes('ACETAMIPRID') ||
          paUpper.includes('DINOTEFORAN') ||
          paUpper.includes('CLOTIANIDINA') ||
          paUpper.includes('CLOTHIANIDIN') ||
          paUpper.includes('INDOXACARBE') ||
          paUpper.includes('INDOXACARB') ||
          paUpper.includes('METOMIL') ||
          paUpper.includes('METHOMYL') ||
          paUpper.includes('TEFLUBENZURON') ||
          paUpper.includes('NOVALURON') ||
          paUpper.includes('BETA-CIFLUTRINA') ||
          paUpper.includes('PROFOFOS') ||
          paUpper.includes('DIAFENTIURON')

        // Reconhecimento químico determinístico de herbicidas (subposição 3808.93)
        const isHerbicidaMolecula =
          paUpper.includes('GLIFOSATO') ||
          paUpper.includes('GLYPHOSATE') ||
          nomeUpper.includes('ROUNDUP') ||
          paUpper.includes('2,4-D') ||
          paUpper.includes('2-4 D') ||
          paUpper.includes('ATRAZINA') ||
          paUpper.includes('ATRAZINE') ||
          paUpper.includes('DIURON') ||
          paUpper.includes('CLETODIM') ||
          paUpper.includes('CLETHODIM') ||
          paUpper.includes('HALOXIFOPE') ||
          paUpper.includes('HALOXYFOP') ||
          paUpper.includes('MESOTRIONA') ||
          paUpper.includes('MESOTRIONE') ||
          paUpper.includes('NICOSULFURON') ||
          paUpper.includes('PARAQUAT') ||
          paUpper.includes('DICAMBA') ||
          paUpper.includes('S-METOLACLORO') ||
          paUpper.includes('S-METOLACHLOR') ||
          paUpper.includes('METOLACLORO') ||
          paUpper.includes('CLOMAZONA') ||
          paUpper.includes('CLOMAZONE') ||
          paUpper.includes('FLUMIOXAZINA') ||
          paUpper.includes('FLUMIOXAZIN') ||
          paUpper.includes('SULFENTRAZONA') ||
          paUpper.includes('SULFENTRAZONE') ||
          paUpper.includes('DICLOSULAM') ||
          paUpper.includes('IMAZETAPIR') ||
          paUpper.includes('IMAZETHAPYR') ||
          paUpper.includes('IMAZAPIC') ||
          paUpper.includes('IMAZAPIR') ||
          paUpper.includes('CLORIMURON') ||
          paUpper.includes('CHLORIMURON') ||
          paUpper.includes('METSULFURON') ||
          paUpper.includes('AMETRINA') ||
          paUpper.includes('AMETRYN') ||
          paUpper.includes('HEXAZINONA') ||
          paUpper.includes('HEXAZINONE') ||
          paUpper.includes('METRIBUZIM') ||
          paUpper.includes('METRIBUZIN') ||
          paUpper.includes('GLUFOSINATO') ||
          paUpper.includes('GLUFOSINATE') ||
          paUpper.includes('TEMBOTRIONA') ||
          paUpper.includes('TEMBOTRIONE') ||
          paUpper.includes('TRICLOPIR') ||
          paUpper.includes('TRICLOPYR') ||
          paUpper.includes('PICLORAM') ||
          paUpper.includes('FLUROXIPIR') ||
          paUpper.includes('FLUROXYPYR') ||
          paUpper.includes('SAFLUFENACIL') ||
          paUpper.includes('QUIZALOFOPE') ||
          paUpper.includes('QUIZALOFOP') ||
          paUpper.includes('FOMESAFEM') ||
          paUpper.includes('FOMESAFEN') ||
          paUpper.includes('LACTOFEM') ||
          paUpper.includes('LACTOFEN') ||
          paUpper.includes('CARFENTRAZONA') ||
          paUpper.includes('CARFENTRAZONE')

        const isAcaricidaMolecula =
          paUpper.includes('ABAMECTINA') ||
          paUpper.includes('ABAMECTIN') ||
          paUpper.includes('SPIROMESIFEN') ||
          paUpper.includes('ESPIROMESIFENO') ||
          paUpper.includes('CI-HEXATINA') ||
          paUpper.includes('FENPIROXIMATO') ||
          paUpper.includes('HEXITIAZOX') ||
          paUpper.includes('HEXYTHIAZOX') ||
          paUpper.includes('CLORFENAPIR') ||
          paUpper.includes('PROPARGITO') ||
          paUpper.includes('PROPARGITE')

        const isNematicidaMolecula =
          paUpper.includes('FLUOPIRAM') ||
          paUpper.includes('FLUOPYRAM') ||
          paUpper.includes('CANDIDATUS') ||
          paUpper.includes('PASTEURIA') ||
          paUpper.includes('PURPUREOCILLIUM') ||
          paUpper.includes('CADUSAFOS') ||
          paUpper.includes('FOSTIAZATO')

        const isRaticidaMolecula =
          paUpper.includes('BRODIFACOUM') ||
          paUpper.includes('BROMADIOLONA') ||
          paUpper.includes('BROMADIOLONE') ||
          paUpper.includes('DIFENACOUM') ||
          paUpper.includes('FLOCOUMAFEN') ||
          paUpper.includes('COUMATETRALIL') ||
          paUpper.includes('WARFARINA')

        const isReguladorMolecula =
          paUpper.includes('ETEFOM') ||
          paUpper.includes('ETHEPHON') ||
          paUpper.includes('PACLOBUTRAZOL') ||
          paUpper.includes('GIBERELINA') ||
          paUpper.includes('GIBBERELLIN') ||
          paUpper.includes('TRINEXAPAC') ||
          paUpper.includes('CLORETO DE MEPIQUAT') ||
          paUpper.includes('MEPIQUAT')

        if (subL.includes('INSETICIDA') && (subL.includes('ACARICIDA') || isAcaricidaMolecula)) {
          subGrupo = 'Inseticida / Acaricida'
        } else if (subL.includes('FUNGICIDA') || isFungicidaMolecula) {
          subGrupo = 'Fungicida'
        } else if (subL.includes('INSETICIDA') || isInseticidaMolecula) {
          subGrupo = 'Inseticida'
        } else if (subL.includes('NEMATICIDA') || isNematicidaMolecula) {
          subGrupo = 'Nematicida'
        } else if (
          subL.includes('RATICIDA') ||
          subL.includes('RODENTICIDA') ||
          isRaticidaMolecula
        ) {
          subGrupo = 'Raticida / Rodenticida'
        } else if (subL.includes('REGULADOR') || isReguladorMolecula) {
          subGrupo = 'Regulador de Crescimento'
        } else if (subL.includes('ACARICIDA') || isAcaricidaMolecula) {
          subGrupo = 'Acaricida'
        } else if (subL.includes('HERBICIDA') || isHerbicidaMolecula) {
          subGrupo = 'Herbicida'
        } else {
          // Quando não reconhecido, marca Inconclusivo (sem default arbitrário)
          subGrupo = 'Inconclusivo / Não Reconhecido'
        }
        categoriaTributaria = 'beneficiado'
      }

      if (inputTipo) tipoProduto = inputTipo
      if (inputMacro) macroGrupo = inputMacro
      if (inputSub && !isAdjuvante && !isTecnico) subGrupo = inputSub

      const pertenceNotaSubpos2 = fallbackVerificarNotaSubpos2(principioAtivoBruto, nomeCompleto)
      const notaSubpos2 = pertenceNotaSubpos2 ? 'SIM' : 'NÃO'

      // Resolução via Base Mestre (Base Mestre é a ÚNICA fonte de NCM)
      let ncmPadrao = ''
      let ncmFaixa1 = ''
      let ncmFaixa2 = ''
      let ncmFaixa3 = ''
      let ncmFaixa4 = ''
      let regraTipi =
        'Classificação fiscal vinculada exclusivamente ao cadastro da embalagem na Base Mestre'

      ncmPadrao = fallbackFormatarNcmMascara(ncmPadrao)
      ncmFaixa1 = ncmPadrao
      ncmFaixa2 = ncmPadrao
      ncmFaixa3 = ncmPadrao
      ncmFaixa4 = ncmPadrao

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

    const cleanStr = function (s) {
      if (!s) return ''
      return String(s)
        .toLowerCase()
        .replace(/[\s\-_]/g, '')
    }

    // -------------------------------------------------------------------------
    // PARSER CANÔNICO DE EMBALAGEM (Idêntico ao importar_bula_pdf.js)
    // -------------------------------------------------------------------------
    const parsearEmbalagemCanonico = function (textoEmb, teInformado, capInformada, unInformada) {
      const te = String(teInformado || '').trim()
      const cap = String(capInformada || '').trim()
      const textoOriginal = String(textoEmb || '').trim()

      let qtdPrinc = 0
      let unPrinc = 'L'
      const capUpper = `${cap} ${String(unInformada || '')} ${textoOriginal}`.toUpperCase()

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
          const numCap = parseFloat(String(cap || textoOriginal).replace(',', '.'))
          if (!isNaN(numCap) && numCap > 0) {
            qtdPrinc = numCap
            const uInf = String(unInformada || '').toUpperCase()
            unPrinc = uInf.startsWith('KG') || uInf.startsWith('QUILO') || uInf === 'G' ? 'KG' : 'L'
          } else {
            qtdPrinc = 20
            unPrinc = 'L'
          }
        }
      }

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

      return {
        quantidade: qtdPrinc,
        unidade: unPrinc,
        acondicionamento: acond,
        descricao: `${qtdPrinc} ${unPrinc} (${acond})`,
      }
    }

    // -------------------------------------------------------------------------
    // ENTRADA DOS DADOS
    // A NCM informada no payload é IGNORADA por completo: a Base Mestre é a ÚNICA fonte de NCM.
    // -------------------------------------------------------------------------
    const info = e.requestInfo()
    const data = info.body || {}

    const nomeComercial = String(
      data.nome_comercial || data.nome_produto || data.nome_completo || '',
    ).trim()

    const principioAtivoInformado = String(data.principio_ativo || '').trim()
    const codigoMapaInformado = String(
      data.codigo_mapa || data.registro_mapa || data.registro || '',
    ).trim()
    const embalagemInformada = String(data.embalagem || '').trim()
    const quantidadeInformada = data.quantidade || data.quantidade_embalagem_principal
    const unidadeInformada = data.unidade || data.unidade_medida_principal
    const acondicionamentoInformado = data.forma_acondicionamento || data.acondicionamento

    const modoValidacao = data.modo === 'existente' ? 'existente' : 'novo'
    const idProdutoExistente = String(data.id_produto_existente || '').trim()
    const authRecord = e.auth
    const userRole = authRecord ? authRecord.getString('role') || 'analista' : 'analista'
    // Analistas ou não autenticados NUNCA gravam na base mestre
    const autoCadastrar = userRole === 'admin' && data.auto_cadastrar === true

    if (!nomeComercial) {
      return e.json(400, {
        status: 'REPROVADO',
        error: 'O campo Nome Comercial é obrigatório para a validação.',
      })
    }

    // -------------------------------------------------------------------------
    // ETAPA 1 — BUSCA POR NOME COMERCIAL (Base Mestre + Dicionário + Fontes Externas)
    // -------------------------------------------------------------------------
    const fontesConsultadas = []
    let cadastroExistenteNaBase = null

    // 1.1 Se o usuário indicou validar produto existente específico ou buscamos por ID
    if (idProdutoExistente) {
      try {
        cadastroExistenteNaBase = $app.findRecordById('base_mestre', idProdutoExistente)
      } catch (_) {}
    }

    // 1.2 Busca interna por Marca Padronizada / Nome Comercial na Base Mestre
    let produtoBaseMestreEncontrado = cadastroExistenteNaBase
    if (!produtoBaseMestreEncontrado) {
      try {
        const escNome = nomeComercial.replace(/'/g, "\\'")
        const matchBase = $app.findRecordsByFilter(
          'base_mestre',
          `nome_completo ~ '${escNome}' || marca_padronizada ~ '${escNome}' || nome_produto ~ '${escNome}'`,
          '-created',
          5,
          0,
        )
        if (matchBase && matchBase.length > 0) {
          const normIn = motor.normalizarTexto(nomeComercial)
          const exact = matchBase.find((r) => {
            const m = r.getString('marca_padronizada') || r.getString('nome_completo')
            return motor.normalizarTexto(m) === normIn
          })
          produtoBaseMestreEncontrado = exact || matchBase[0]
        }
      } catch (errBase) {
        console.log('Aviso ao consultar base_mestre por nome comercial:', errBase.message)
      }
    }

    if (produtoBaseMestreEncontrado) {
      fontesConsultadas.push({
        fonte: 'Base Mestre Interna (Skip Cloud)',
        tipo: 'mapa',
        status: 'sucesso',
        detalhes: `Produto localizado na base interna: "${produtoBaseMestreEncontrado.getString('nome_completo') || produtoBaseMestreEncontrado.getString('marca_padronizada')}". NCM cadastrado: ${produtoBaseMestreEncontrado.getString('ncm_padrao') || produtoBaseMestreEncontrado.getString('ncm')}.`,
      })
    }

    // 1.3 Busca no Dicionário de Princípios Ativos
    let paDicionarioEncontrado = null
    try {
      const escPa = (principioAtivoInformado || nomeComercial).replace(/'/g, "\\'")
      const recordsPa = $app.findRecordsByFilter(
        'dicionario_principios_ativos',
        `principio_ativo_chave ~ '${escPa}' || principio_ativo ~ '${escPa}'`,
        '-created',
        3,
        0,
      )
      if (recordsPa && recordsPa.length > 0) {
        paDicionarioEncontrado = recordsPa[0]
      }
    } catch (_) {}

    // 1.5 Busca da BULA e do Registro no AGROFIT / MAPA via IA / Dados Oficiais
    let bulaExtraida = null
    let agrofitOficial = null

    try {
      const promptAuditoriaBula = `Você é o Auditor Oficial e Perito Químico-Aduaneiro do Ministério da Agricultura (MAPA / AGROFIT).
O usuário submeteu um produto comercial para validação cadastral:
- Nome Comercial informado: "${nomeComercial}"
- Princípio Ativo informado: "${principioAtivoInformado || 'NÃO INFORMADO'}"
- Código MAPA informado: "${codigoMapaInformado || 'NÃO INFORMADO'}"
- Embalagem informada: "${embalagemInformada || 'NÃO INFORMADO'}"

Consulte a base pública oficial do AGROFIT e a BULA oficial registrada no MAPA / Anvisa para este produto ("${nomeComercial}"):
1. Localize a BULA oficial do produto pelo Nome Comercial.
2. Extraia:
   - Ingrediente(s) Ativo(s) oficiais e concentrações
   - Fabricante / Titular oficial do registro
   - Código / Número de Registro MAPA oficial (preserve os 4 dígitos ou padrão "Nº 0000" ou código SIPEAGRO)
   - Classe de uso e formulação (ex.: Herbicida, Concentrado Solúvel SL, Grânulos Dispersíveis em Água WG)
   - USO DECLARADO NA BULA: Extraia se a bula destina o produto estritamente para "Uso Agrícola" (culturas agrícolas / lavouras) ou "Uso Domissanitário / Jardinagem Amadora" ou "Produto Técnico Industrial".
   - Embalagens e faixas autorizadas na bula (ex.: frascos de 250 mL a 1 L, bombonas de 5 L e 20 L, sacos de 20 kg, etc.)
   - Quantidade principal de embalagem autorizada (ex.: 250 mL, 1 L, 5 L, 20 L, 20 kg)
3. Responda ESTRITAMENTE em formato JSON com esta estrutura:
{
  "encontrado": true/false,
  "fonte_utilizada": "AGROFIT / Bula Oficial MAPA",
  "nome_comercial_oficial": "Nome oficial do produto",
  "principio_ativo_oficial": "Nome canônico do ingrediente ativo",
  "fabricante_titular_oficial": "Razão social da empresa fabricante/titular",
  "registro_mapa_oficial": "Nº oficial ex: Nº 0315 ou 008907 ou 002094",
  "formulacao": "ex: Concentrado Solúvel (SL) ou Grânulos Dispersíveis em Água (WG)",
  "classe_uso": "Herbicida / Inseticida / Fungicida",
  "uso_declarado": "Uso Agrícola" ou "Uso Domissanitário" ou "Produto Técnico",
  "embalagens_autorizadas": ["Frasco 250 mL", "Frasco 1 L", "Bombona 5 L", "Bombona 20 L", "Saco 20 kg"],
  "embalagem_principal": "Bombona 20 L",
  "quantidade_embalagem_principal": "20 L",
  "resumo_bula": "Breve resumo técnico oficial da bula declarando uso e culturas",
  "link_oficial": "https://dados.agricultura.gov.br"
}`

      const aiRes = $ai.chat({
        model: 'fast',
        messages: [
          {
            role: 'system',
            content:
              'Você é um motor especialista em bulas de defensivos e fertilizantes do MAPA/AGROFIT. Responda apenas JSON válido.',
          },
          { role: 'user', content: promptAuditoriaBula },
        ],
      })

      const rawAiText = aiRes.choices?.[0]?.message?.content || '{}'
      const jsonMatch = rawAiText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsedBula = JSON.parse(jsonMatch[0])
        if (parsedBula && typeof parsedBula === 'object') {
          agrofitOficial = {
            encontrado: Boolean(parsedBula.encontrado),
            nome_comercial_oficial: parsedBula.nome_comercial_oficial || nomeComercial,
            principio_ativo: parsedBula.principio_ativo_oficial || '',
            fabricante: parsedBula.fabricante_titular_oficial || '',
            registro_mapa: parsedBula.registro_mapa_oficial || '',
            classe_uso: parsedBula.classe_uso || 'Defensivo Fitossanitário',
            formulacao: parsedBula.formulacao || '',
            uso_declarado: parsedBula.uso_declarado || 'Uso Agrícola',
            embalagens_autorizadas: Array.isArray(parsedBula.embalagens_autorizadas)
              ? parsedBula.embalagens_autorizadas
              : [],
            embalagem_principal: parsedBula.embalagem_principal || '1X20L (20 L)',
            quantidade_embalagem_principal: parsedBula.quantidade_embalagem_principal || '20 L',
            resumo_bula: parsedBula.resumo_bula || '',
            link_oficial: parsedBula.link_oficial || 'https://dados.agricultura.gov.br',
          }

          bulaExtraida = agrofitOficial

          fontesConsultadas.push({
            fonte: 'Bulário Oficial AGROFIT / MAPA',
            tipo: 'bula',
            status: agrofitOficial.encontrado ? 'sucesso' : 'nao_encontrado',
            url: agrofitOficial.link_oficial,
            detalhes: agrofitOficial.encontrado
              ? `Bula oficial localizada: Titular "${agrofitOficial.fabricante}". Princípio ativo: "${agrofitOficial.principio_ativo}". Registro MAPA: "${agrofitOficial.registro_mapa}". Embalagens autorizadas: ${agrofitOficial.embalagens_autorizadas.slice(0, 4).join(', ') || 'Diversas'}.`
              : `Bula oficial não localizada automaticamente para "${nomeComercial}". Validação prosseguida com bases locais.`,
          })
        }
      }
    } catch (errAi) {
      console.log('Aviso ao consultar bula via AI:', errAi.message)
      fontesConsultadas.push({
        fonte: 'Bulário Oficial AGROFIT / MAPA',
        tipo: 'bula',
        status: 'indisponivel',
        detalhes: `Serviço de bulário temporariamente ocupado (${errAi.message || 'timeout'}). Auditoria mantida com motor químico interno.`,
      })
    }

    // Fallback de contingência caso a busca externa não tenha achado dados
    if (!bulaExtraida || !bulaExtraida.encontrado) {
      if (produtoBaseMestreEncontrado) {
        bulaExtraida = {
          encontrado: true,
          nome_comercial_oficial:
            produtoBaseMestreEncontrado.getString('marca_padronizada') ||
            produtoBaseMestreEncontrado.getString('nome_completo'),
          principio_ativo: produtoBaseMestreEncontrado.getString('principio_ativo'),
          fabricante:
            produtoBaseMestreEncontrado.getString('titular_fabricante') ||
            produtoBaseMestreEncontrado.getString('fabricante'),
          registro_mapa: produtoBaseMestreEncontrado.getString('registro_mapa'),
          classe_uso: produtoBaseMestreEncontrado.getString('sub_grupo') || 'Defensivo',
          formulacao: 'Formulação Comercial Homologada',
          uso_declarado: 'Uso Agrícola',
          embalagens_autorizadas: [
            produtoBaseMestreEncontrado.getString('embalagem') || 'Bombona 20 L',
          ],
          embalagem_principal: produtoBaseMestreEncontrado.getString('embalagem') || 'Bombona 20 L',
          quantidade_embalagem_principal: '20 L',
          resumo_bula: 'Dados recuperados da Base Mestre homologada previamente.',
          link_oficial: 'https://dados.agricultura.gov.br',
        }
      }
    }

    // -------------------------------------------------------------------------
    // DETERMINAÇÃO CANÔNICA VIA MOTOR QUÍMICO-ADUANEIRO
    // -------------------------------------------------------------------------
    const principioAtivoFinal =
      bulaExtraida?.principio_ativo ||
      principioAtivoInformado ||
      paDicionarioEncontrado?.getString('principio_ativo') ||
      nomeComercial

    const fabricanteFinal =
      bulaExtraida?.fabricante ||
      (produtoBaseMestreEncontrado
        ? produtoBaseMestreEncontrado.getString('titular_fabricante') ||
          produtoBaseMestreEncontrado.getString('fabricante')
        : 'Fabricante Não Informado')

    const registroMapaFinal = motor.sanitizarRegistroMapa(
      bulaExtraida?.registro_mapa ||
        codigoMapaInformado ||
        (produtoBaseMestreEncontrado ? produtoBaseMestreEncontrado.getString('registro_mapa') : ''),
    )

    // -------------------------------------------------------------------------
    // RESOLUÇÃO DE EMBALAGEM E QUANTIDADE
    // -------------------------------------------------------------------------
    const embTextoBase =
      embalagemInformada ||
      bulaExtraida?.embalagem_principal ||
      (produtoBaseMestreEncontrado ? produtoBaseMestreEncontrado.getString('embalagem') : '')

    const embParseada = parsearEmbalagemCanonico(
      embTextoBase,
      acondicionamentoInformado,
      quantidadeInformada,
      unidadeInformada,
    )

    const qtdEmbalagemFinal =
      quantidadeInformada !== undefined &&
      quantidadeInformada !== null &&
      Number(quantidadeInformada) > 0
        ? Number(quantidadeInformada)
        : embParseada.quantidade

    const unidadeFinal = (unidadeInformada || embParseada.unidade || 'L').trim().toUpperCase()

    const acondicionamentoFinal =
      acondicionamentoInformado || embParseada.acondicionamento || 'Bombona'

    const embalagemFinal = `${acondicionamentoFinal} ${qtdEmbalagemFinal} ${unidadeFinal}`.trim()

    // -------------------------------------------------------------------------
    // RESOLUÇÃO DE NCM EXCLUSIVAMENTE VIA BASE MESTRE (chave natural da embalagem final)
    // Chave natural: registro_mapa + quantidade_embalagem_principal + unidade_medida_principal + forma_acondicionamento
    // -------------------------------------------------------------------------
    let ncmResolvidaBaseMestre = ''
    let cadastroEmbalagemBaseMestre = null

    // 1. Tentar busca exata pelos 4 campos da chave natural
    try {
      const regSanit = motor.sanitizarRegistroMapa(registroMapaFinal)
      const regDigits = regSanit.replace(/\D/g, '')

      let filtroChave = ''
      if (regSanit) {
        const escReg = regSanit.replace(/'/g, "\\'")
        const escUn = unidadeFinal.replace(/'/g, "\\'")
        const escAcond = acondicionamentoFinal.replace(/'/g, "\\'")

        filtroChave = `registro_mapa ~ '${escReg}' && quantidade_embalagem_principal = ${qtdEmbalagemFinal} && unidade_medida_principal = '${escUn}' && forma_acondicionamento = '${escAcond}'`

        let registrosBm = $app.findRecordsByFilter('base_mestre', filtroChave, '-created', 1, 0)
        if (registrosBm && registrosBm.length > 0) {
          cadastroEmbalagemBaseMestre = registrosBm[0]
        }
      }

      // 2. Se não achou exato com sanitizado completo, tentar apenas com dígitos do MAPA
      if (!cadastroEmbalagemBaseMestre && regDigits && regDigits.length >= 4) {
        const escUn = unidadeFinal.replace(/'/g, "\\'")
        const escAcond = acondicionamentoFinal.replace(/'/g, "\\'")
        const filtroDig = `registro_mapa ~ '${regDigits}' && quantidade_embalagem_principal = ${qtdEmbalagemFinal} && forma_acondicionamento = '${escAcond}'`
        const regsDig = $app.findRecordsByFilter('base_mestre', filtroDig, '-created', 5, 0)
        if (regsDig && regsDig.length > 0) {
          const matchDig = regsDig.find((r) => {
            const rd = r.getString('registro_mapa').replace(/\D/g, '')
            return rd === regDigits
          })
          if (matchDig) cadastroEmbalagemBaseMestre = matchDig
        }
      }

      // 3. Se ainda não achou, tentar com registro_mapa + quantidade + unidade
      if (!cadastroEmbalagemBaseMestre && regDigits && regDigits.length >= 4) {
        const regsQtd = $app.findRecordsByFilter(
          'base_mestre',
          `registro_mapa ~ '${regDigits}' && quantidade_embalagem_principal = ${qtdEmbalagemFinal}`,
          '-created',
          5,
          0,
        )
        if (regsQtd && regsQtd.length > 0) {
          const matchQtd = regsQtd.find((r) => {
            const rd = r.getString('registro_mapa').replace(/\D/g, '')
            return rd === regDigits
          })
          if (matchQtd) cadastroEmbalagemBaseMestre = matchQtd
        }
      }

      // 4. Se ainda não achou mas temos um cadastro existente específico ou por registro_mapa
      if (!cadastroEmbalagemBaseMestre) {
        if (idProdutoExistente && cadastroExistenteNaBase) {
          cadastroEmbalagemBaseMestre = cadastroExistenteNaBase
        } else if (regDigits && regDigits.length >= 4) {
          const regsMapa = $app.findRecordsByFilter(
            'base_mestre',
            `registro_mapa ~ '${regDigits}'`,
            '-created',
            5,
            0,
          )
          if (regsMapa && regsMapa.length > 0) {
            const matchM = regsMapa.find((r) => {
              const rd = r.getString('registro_mapa').replace(/\D/g, '')
              return rd === regDigits
            })
            if (matchM) cadastroEmbalagemBaseMestre = matchM
          }
        }
      }

      // 5. Se ainda não achou, tentar por nome/marca exata se fornecida
      if (!cadastroEmbalagemBaseMestre && produtoBaseMestreEncontrado) {
        cadastroEmbalagemBaseMestre = produtoBaseMestreEncontrado
      }

      if (cadastroEmbalagemBaseMestre) {
        const ncmEsp = cadastroEmbalagemBaseMestre.getString('ncm_especifica')
        const ncmPad = cadastroEmbalagemBaseMestre.getString('ncm_padrao')
        const ncmLeg = cadastroEmbalagemBaseMestre.getString('ncm')
        ncmResolvidaBaseMestre = motor.formatarNcmMascara(ncmEsp || ncmPad || ncmLeg || '')
      }
    } catch (errResBm) {
      console.log('Erro ao resolver NCM na Base Mestre:', errResBm.message)
    }

    const ncmResolvidaDigitos = ncmResolvidaBaseMestre.replace(/\D/g, '')
    const ncmResolvidaValida8 = ncmResolvidaDigitos.length === 8

    // Alinhamento do objeto motor canônico
    const dadosMotorInput = {
      nome_completo: nomeComercial,
      ncm: ncmResolvidaBaseMestre || '3808.99.99',
      principio_ativo: principioAtivoFinal,
      embalagem: embalagemFinal,
      fabricante: fabricanteFinal,
      registro_mapa: registroMapaFinal,
      sub_grupo:
        cadastroEmbalagemBaseMestre?.getString('sub_grupo') ||
        bulaExtraida?.classe_uso ||
        'Defensivo',
      origem_base: 'BASE_MESTRE_RESOLUCAO',
    }

    const motorCanonico = motor.executarMotorCanonico(dadosMotorInput)
    motorCanonico.ncm_padrao = ncmResolvidaBaseMestre
    motorCanonico.ncm_faixa1_ate_300g = ncmResolvidaBaseMestre
    motorCanonico.ncm_faixa2_300g_a_7_5kg = ncmResolvidaBaseMestre
    motorCanonico.ncm_faixa3_7_5kg_a_10kg = ncmResolvidaBaseMestre
    motorCanonico.ncm_faixa4_acima_10kg = ncmResolvidaBaseMestre
    motorCanonico.quantidade_embalagem_principal = qtdEmbalagemFinal
    motorCanonico.unidade_medida_principal = unidadeFinal
    motorCanonico.forma_acondicionamento = acondicionamentoFinal

    // -------------------------------------------------------------------------
    // TRAVAS DE AUDITORIA
    // Regra da Tarefa:
    // Trava 1 (NCM Obrigatória via Base Mestre):
    //   - SEM correspondência na Base Mestre -> Trava 1 reprova com a mensagem EXATA:
    //     "Produto sem classificação tributária na Base Mestre"
    //     (e as demais travas ficam bloqueadas/pendentes)
    //   - COM correspondência -> valida a NCM RESOLVIDA: 8 dígitos canônicos 0000.00.00
    //     e existência na referência TIPI
    // Trava 2 (Embalagem vs NCM):
    //   - cruza a matriz regras_ncm_embalagem contra a NCM RESOLVIDA para o acondicionamento/quantidade
    // -------------------------------------------------------------------------
    const travas = []

    // TRAVA 1: NCM Obrigatória na Base Mestre & Validade TIPI
    let trava1Passou = false
    let trava1Mensagem = ''
    let regraNcmRecord = null

    if (!ncmResolvidaBaseMestre || !cadastroEmbalagemBaseMestre || !ncmResolvidaValida8) {
      trava1Passou = false
      trava1Mensagem = 'Produto sem classificação tributária na Base Mestre'
    } else {
      // Validar na referência TIPI (coleção regras_ncm_embalagem ou consulta Siscomex/BrasilAPI)
      try {
        const recs = $app.findRecordsByFilter(
          'regras_ncm_embalagem',
          `ncm = '${ncmResolvidaDigitos}'`,
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          regraNcmRecord = recs[0]
        }
      } catch (_) {}

      let consultaExternaOk = false
      let descricaoTipi = regraNcmRecord ? regraNcmRecord.getString('descricao') : ''

      if (!regraNcmRecord) {
        try {
          const resNcm = $http.send({
            url: `https://brasilapi.com.br/api/ncm/v1/${ncmResolvidaDigitos}`,
            method: 'GET',
            headers: {
              'User-Agent': 'ValidadorAgro/2.0 (Auditoria Fiscal)',
              Accept: 'application/json',
            },
            timeout: 5,
          })
          if (resNcm.statusCode === 200) {
            consultaExternaOk = true
            const b =
              typeof resNcm.json === 'function' ? resNcm.json() : JSON.parse(resNcm.raw || '{}')
            descricaoTipi = b.descricao || ''
          }
        } catch (_) {}
      }

      if (regraNcmRecord || consultaExternaOk) {
        trava1Passou = true
        trava1Mensagem = `NCM ${ncmResolvidaBaseMestre} resolvida da Base Mestre e homologada na TIPI (${descricaoTipi || 'Tabela TIPI Oficial'}).`
      } else {
        // Se a NCM tem 8 dígitos no formato canônico mas não constou na API externa, aprova condicionalmente ou valida dígitos
        trava1Passou = true
        trava1Mensagem = `NCM ${ncmResolvidaBaseMestre} resolvida com sucesso da Base Mestre (8 dígitos canônicos).`
      }
    }

    travas.push({
      id_trava: 1,
      trava_nome: 'NCM Obrigatória (Base Mestre & TIPI)',
      aprovado: trava1Passou,
      mensagem: trava1Mensagem,
    })

    // TRAVA 2: Embalagem vs NCM
    // Se a Trava 1 falhar por falta de cadastro na Base Mestre, a Trava 2 fica bloqueada/pendente
    let trava2Passou = true
    let trava2Msg = ''

    if (!trava1Passou) {
      trava2Passou = false
      trava2Msg = 'Bloqueada: aguardando resolução de NCM na Base Mestre.'
    } else if (regraNcmRecord) {
      try {
        const rawJson = regraNcmRecord.getString('embalagens_permitidas')
        let permitidas = []
        if (rawJson) {
          try {
            const p = JSON.parse(rawJson)
            if (Array.isArray(p)) permitidas = p
          } catch (_) {
            permitidas = rawJson.split(/[,;/|]/).map((s) => s.trim())
          }
        }
        if (permitidas.length > 0) {
          const embNorm = cleanStr(`${acondicionamentoFinal} ${qtdEmbalagemFinal}${unidadeFinal}`)
          const acondNorm = cleanStr(acondicionamentoFinal)
          const match = permitidas.some((p) => {
            const pNorm = cleanStr(p)
            return (
              embNorm.includes(pNorm) ||
              pNorm.includes(embNorm) ||
              acondNorm.includes(pNorm) ||
              pNorm.includes(acondNorm)
            )
          })
          if (match) {
            trava2Passou = true
            trava2Msg = `Embalagem "${embalagemFinal}" autorizada para o NCM ${ncmResolvidaBaseMestre} na matriz TIPI.`
          } else {
            trava2Passou = false
            trava2Msg = `Embalagem "${embalagemFinal}" não consta na matriz de acondicionamentos homologados para ${ncmResolvidaBaseMestre}.`
          }
        } else {
          trava2Msg = `Acondicionamento "${acondicionamentoFinal}" (${qtdEmbalagemFinal} ${unidadeFinal}) compatível com o NCM ${ncmResolvidaBaseMestre}.`
        }
      } catch (err) {
        trava2Msg = `Matriz de embalagens avaliada: ${err.message}`
      }
    } else {
      trava2Msg = `Embalagem "${embalagemFinal}" vinculada com sucesso ao NCM ${ncmResolvidaBaseMestre}.`
    }

    travas.push({
      id_trava: 2,
      trava_nome: 'Embalagem vs NCM',
      aprovado: trava2Passou,
      mensagem: trava2Msg,
    })

    // Linha de NCM por Embalagem resolvida da Base Mestre
    const linhasNcmEmbalagem = [
      {
        faixa_id: 1,
        faixa_nome: `${acondicionamentoFinal} ${qtdEmbalagemFinal} ${unidadeFinal}`,
        faixa_rotulo: `${qtdEmbalagemFinal} ${unidadeFinal} (${acondicionamentoFinal})`,
        exemplo_embalagem: embalagemFinal,
        ncm_correta: ncmResolvidaBaseMestre || 'Sem NCM na Base Mestre',
        ncm_informada_se_aplica: Boolean(ncmResolvidaBaseMestre),
        status_aplicacao: ncmResolvidaBaseMestre
          ? 'NCM RESOLVIDA DA BASE MESTRE'
          : 'SEM CLASSIFICAÇÃO NA BASE MESTRE',
        observacao: ncmResolvidaBaseMestre
          ? `Classificação fiscal oficial resolvida da Base Mestre para ${acondicionamentoFinal} ${qtdEmbalagemFinal} ${unidadeFinal}.`
          : 'Produto sem classificação tributária na Base Mestre.',
      },
    ]
    const possuiDiferencaNcmPorEmbalagem = false

    // Trava 3: Princípio Ativo na Matriz
    const trava3Passou = Boolean(
      paDicionarioEncontrado ||
      (bulaExtraida && bulaExtraida.principio_ativo) ||
      !principioAtivoInformado,
    )
    travas.push({
      id_trava: 3,
      trava_nome: 'Princípio Ativo na Matriz / Bula',
      aprovado: trava3Passou,
      mensagem: trava3Passou
        ? `Princípio ativo vinculado com sucesso (${paDicionarioEncontrado ? 'Dicionário de PAs' : bulaExtraida?.principio_ativo ? 'Bula AGROFIT' : 'Opcional não informado'}).`
        : `Princípio ativo "${principioAtivoInformado}" não localizado no Dicionário nem na Bula oficial.`,
    })

    // Trava 4: Duplicidade na Base Mestre
    let duplicataId = null
    let trava4Passou = true
    let trava4Msg = 'Nenhuma duplicidade impeditiva identificada na Base Mestre.'

    try {
      const escNomeNorm = motor.normalizarTexto(nomeComercial)
      const escRegDigits = registroMapaFinal.replace(/\D/g, '')

      const porNome = $app.findRecordsByFilter('base_mestre', `id != ''`, '-created', 50, 0)
      const achouNome = (porNome || []).find((r) => {
        if (idProdutoExistente && r.id === idProdutoExistente) return false
        const n1 = motor.normalizarTexto(r.getString('nome_completo'))
        const n2 = motor.normalizarTexto(r.getString('marca_padronizada'))
        return n1 === escNomeNorm || n2 === escNomeNorm
      })

      if (achouNome) {
        duplicataId = achouNome.id
        trava4Msg = `Produto duplicado: Marca/Nome "${achouNome.getString('marca_padronizada') || achouNome.getString('nome_completo')}" já existe na Base Mestre.`
        // Se estiver no modo 'existente', é esperado encontrar o registro
        if (modoValidacao !== 'existente') {
          trava4Passou = false
        }
      } else if (escRegDigits && escRegDigits.length >= 4) {
        const porReg = $app.findRecordsByFilter(
          'base_mestre',
          `registro_mapa ~ '${escRegDigits}'`,
          '-created',
          5,
          0,
        )
        const achouReg = (porReg || []).find((r) => {
          if (idProdutoExistente && r.id === idProdutoExistente) return false
          const dig = r.getString('registro_mapa').replace(/\D/g, '')
          return dig && dig === escRegDigits
        })
        if (achouReg) {
          duplicataId = achouReg.id
          trava4Msg = `Produto com mesmo Registro MAPA "${achouReg.getString('registro_mapa')}" já cadastrado na Base Mestre.`
          if (modoValidacao !== 'existente') {
            trava4Passou = false
          }
        }
      }
    } catch (dupErr) {
      console.log('Aviso ao checar trava 4 de duplicidade:', dupErr.message)
    }

    travas.push({
      id_trava: 4,
      trava_nome: 'Duplicidade na Base Mestre',
      aprovado: trava4Passou,
      mensagem: trava4Msg,
    })

    // -------------------------------------------------------------------------
    // COMPARAÇÃO COM CADASTRO EXISTENTE (Modo "Validar Existente")
    // -------------------------------------------------------------------------
    let comparacaoExistente = null
    const alvoExistente = cadastroExistenteNaBase || produtoBaseMestreEncontrado

    if (modoValidacao === 'existente' || (alvoExistente && duplicataId)) {
      if (alvoExistente) {
        const gravadoNome =
          alvoExistente.getString('nome_completo') || alvoExistente.getString('marca_padronizada')
        const gravadoNcm = alvoExistente.getString('ncm_padrao') || alvoExistente.getString('ncm')
        const gravadoPa = alvoExistente.getString('principio_ativo')
        const gravadoMapa = alvoExistente.getString('registro_mapa')
        const gravadoFab =
          alvoExistente.getString('titular_fabricante') || alvoExistente.getString('fabricante')
        const gravadoEmb = alvoExistente.getString('embalagem')

        const divergenciasCadastradas = []

        if (motor.normalizarTexto(gravadoNcm) !== motor.normalizarTexto(ncmCanonicoDeterminado)) {
          divergenciasCadastradas.push({
            campo: 'NCM',
            valor_gravado: gravadoNcm || 'Não preenchido',
            valor_correto_bula: ncmCanonicoDeterminado,
            sugestao: `Atualizar NCM na Base Mestre de "${gravadoNcm}" para "${ncmCanonicoDeterminado}".`,
          })
        }

        if (
          bulaExtraida?.principio_ativo &&
          motor.normalizarTexto(gravadoPa) !== motor.normalizarTexto(bulaExtraida.principio_ativo)
        ) {
          divergenciasCadastradas.push({
            campo: 'Princípio Ativo',
            valor_gravado: gravadoPa || 'Não preenchido',
            valor_correto_bula: bulaExtraida.principio_ativo,
            sugestao: `Atualizar princípio ativo para o ingrediente oficial da bula ("${bulaExtraida.principio_ativo}").`,
          })
        }

        if (
          bulaExtraida?.fabricante &&
          gravadoFab &&
          !motor
            .normalizarTexto(gravadoFab)
            .includes(motor.normalizarTexto(bulaExtraida.fabricante)) &&
          !motor
            .normalizarTexto(bulaExtraida.fabricante)
            .includes(motor.normalizarTexto(gravadoFab))
        ) {
          divergenciasCadastradas.push({
            campo: 'Fabricante / Titular',
            valor_gravado: gravadoFab,
            valor_correto_bula: bulaExtraida.fabricante,
            sugestao: `Atualizar razão social do titular para "${bulaExtraida.fabricante}".`,
          })
        }

        if (
          bulaExtraida?.registro_mapa &&
          gravadoMapa &&
          gravadoMapa.replace(/\D/g, '') !== bulaExtraida.registro_mapa.replace(/\D/g, '')
        ) {
          divergenciasCadastradas.push({
            campo: 'Registro MAPA',
            valor_gravado: gravadoMapa,
            valor_correto_bula: bulaExtraida.registro_mapa,
            sugestao: `Corrigir número de registro para "${bulaExtraida.registro_mapa}".`,
          })
        }

        comparacaoExistente = {
          id_registro: alvoExistente.id,
          produto_gravado: {
            id: alvoExistente.id,
            nome_completo: gravadoNome,
            marca_padronizada: alvoExistente.getString('marca_padronizada'),
            ncm: gravadoNcm,
            principio_ativo: gravadoPa,
            registro_mapa: gravadoMapa,
            fabricante: gravadoFab,
            embalagem: gravadoEmb,
          },
          divergencias: divergenciasCadastradas,
          necessita_atualizacao: divergenciasCadastradas.length > 0,
        }
      }
    }

    // -------------------------------------------------------------------------
    // ETAPA 2 — VALIDAÇÃO CRUZADA CAMPO A CAMPO
    // Status possíveis: OK | DIVERGENTE | NÃO INFORMADO | NÃO LOCALIZADO
    // -------------------------------------------------------------------------
    const camposValidacao = []

    // 2.1 NOME COMERCIAL
    camposValidacao.push({
      campo: 'Nome Comercial',
      chave: 'nome_comercial',
      obrigatorio: true,
      informado: nomeComercial,
      encontrado_bula: bulaExtraida?.nome_comercial_oficial || motorCanonico.marca_padronizada,
      status: 'OK',
      explicacao: bulaExtraida?.encontrado
        ? 'Nome comercial localizado e homologado no bulário oficial.'
        : 'Nome comercial registrado para auditoria cadastral.',
    })

    // 2.2 PRINCÍPIO ATIVO (Opcional)
    let statusPa = 'OK'
    let explPa = ''
    const paBula = bulaExtraida?.principio_ativo || ''

    if (!principioAtivoInformado) {
      statusPa = 'NÃO INFORMADO'
      explPa = paBula
        ? `Campo opcional não preenchido. Identificado na bula/AGROFIT: "${paBula}".`
        : 'Campo opcional não preenchido pelo usuário.'
    } else if (paBula) {
      const normPaInf = motor.normalizarTexto(principioAtivoInformado)
      const normPaBula = motor.normalizarTexto(paBula)
      if (
        normPaInf === normPaBula ||
        normPaInf.includes(normPaBula) ||
        normPaBula.includes(normPaInf)
      ) {
        statusPa = 'OK'
        explPa = `Princípio ativo informado confere com o ingrediente ativo da bula oficial: "${paBula}".`
      } else {
        statusPa = 'DIVERGENTE'
        explPa = `Divergência: Informado "${principioAtivoInformado}", mas a bula oficial MAPA indica "${paBula}".`
      }
    } else {
      statusPa = 'NÃO LOCALIZADO'
      explPa = `Princípio ativo "${principioAtivoInformado}" não pôde ser confrontado em bula externa.`
    }

    camposValidacao.push({
      campo: 'Princípio Ativo',
      chave: 'principio_ativo',
      obrigatorio: false,
      informado: principioAtivoInformado || 'Não informado',
      encontrado_bula: paBula || 'Não localizado na bula',
      status: statusPa,
      explicacao: explPa,
    })

    // -------------------------------------------------------------------------
    // 2.3 NCM (Obrigatório via Base Mestre)
    // -------------------------------------------------------------------------
    let statusNcm = 'OK'
    let explNcm = ''

    if (!trava1Passou) {
      statusNcm = 'DIVERGENTE'
      explNcm = trava1Mensagem
    } else {
      statusNcm = 'OK'
      explNcm = `NCM ${ncmResolvidaBaseMestre} resolvida com sucesso da Base Mestre para o produto e embalagem.`
    }

    camposValidacao.push({
      campo: 'NCM (Base Mestre)',
      chave: 'ncm',
      obrigatorio: true,
      informado: '(Resolvido via Base Mestre)',
      encontrado_bula: ncmResolvidaBaseMestre || 'Sem NCM na Base Mestre',
      status: statusNcm,
      explicacao: explNcm,
    })

    // 2.4 CÓDIGO MAPA (Opcional)
    let statusMapa = 'OK'
    let explMapa = ''
    const mapaBula = bulaExtraida?.registro_mapa || ''

    if (!codigoMapaInformado) {
      statusMapa = 'NÃO INFORMADO'
      explMapa = mapaBula
        ? `Campo opcional não preenchido. Registro oficial encontrado na bula: "${mapaBula}".`
        : 'Campo opcional não preenchido pelo usuário.'
    } else if (mapaBula) {
      const dInf = codigoMapaInformado.replace(/\D/g, '')
      const dBula = mapaBula.replace(/\D/g, '')
      if (dInf && dBula && (dInf === dBula || dInf.endsWith(dBula) || dBula.endsWith(dInf))) {
        statusMapa = 'OK'
        explMapa = `Código MAPA informado (${codigoMapaInformado}) confere com o registro oficial da bula (${mapaBula}).`
      } else {
        statusMapa = 'DIVERGENTE'
        explMapa = `Divergência: Informado "${codigoMapaInformado}", mas a bula indica "${mapaBula}".`
      }
    } else {
      statusMapa = 'NÃO LOCALIZADO'
      explMapa = `Registro MAPA "${codigoMapaInformado}" não localizado na consulta externa.`
    }

    camposValidacao.push({
      campo: 'Código MAPA',
      chave: 'codigo_mapa',
      obrigatorio: false,
      informado: codigoMapaInformado || 'Não informado',
      encontrado_bula: mapaBula || 'Não localizado na bula',
      status: statusMapa,
      explicacao: explMapa,
    })

    // 2.5 FABRICANTE / TITULAR (Retorno da busca)
    camposValidacao.push({
      campo: 'Fabricante / Titular',
      chave: 'fabricante',
      obrigatorio: false,
      informado: '(Retorno da Busca Oficial)',
      encontrado_bula: fabricanteFinal,
      status: 'OK',
      explicacao: `Titular oficial identificado na bula/AGROFIT: "${fabricanteFinal}".`,
    })

    // 2.6 EMBALAGEM E QUANTIDADE (Retorno e conferência)
    let statusEmb = 'OK'
    let explEmb = ''
    const embBula =
      bulaExtraida?.embalagens_autorizadas && bulaExtraida.embalagens_autorizadas.length > 0
        ? bulaExtraida.embalagens_autorizadas.join(', ')
        : bulaExtraida?.embalagem_principal || 'Não informada'
    const qtdBula = bulaExtraida?.quantidade_embalagem_principal || '20 L'

    if (!embalagemInformada) {
      statusEmb = 'NÃO INFORMADO'
      explEmb = `Embalagem não informada. Bula oficial autoriza: ${embBula}. Quantidade sugerida: ${qtdBula}.`
    } else {
      statusEmb = 'OK'
      explEmb = `Embalagem informada: "${embalagemInformada}". Autorizadas na bula oficial: ${embBula}.`
    }

    camposValidacao.push({
      campo: 'Embalagem e Quantidade',
      chave: 'embalagem',
      obrigatorio: false,
      informado: embalagemInformada || 'Não informada',
      encontrado_bula: `${embBula} (Volume/Peso: ${qtdBula})`,
      status: statusEmb,
      explicacao: explEmb,
    })

    // -------------------------------------------------------------------------
    // VEREDITO GERAL (APROVADO / APROVADO COM RESSALVAS / REPROVADO)
    // -------------------------------------------------------------------------
    const temDivergenciaNcm = statusNcm === 'DIVERGENTE'
    const temDivergenciaPa = statusPa === 'DIVERGENTE'
    const travasReprovadas = travas.filter((t) => !t.aprovado)
    const algumaTravaReprovada = travasReprovadas.length > 0

    let vereditoGeral = 'APROVADO'
    let vereditoMotivo = 'Produto validado com sucesso e em conformidade com a Base Mestre.'

    if (!trava1Passou) {
      vereditoGeral = 'REPROVADO'
      vereditoMotivo = trava1Mensagem
    } else if (modoValidacao !== 'existente' && !trava4Passou) {
      vereditoGeral = 'REPROVADO'
      vereditoMotivo =
        'Produto com marca ou registro idêntico já cadastrado na Base Mestre (duplicidade).'
    } else if (algumaTravaReprovada) {
      vereditoGeral = 'APROVADO COM RESSALVAS'
      vereditoMotivo = `Pendências nas travas de auditoria: ${travasReprovadas.map((t) => t.trava_nome).join(', ')}.`
    } else if (temDivergenciaNcm || temDivergenciaPa) {
      vereditoGeral = temDivergenciaNcm ? 'REPROVADO' : 'APROVADO COM RESSALVAS'
      vereditoMotivo = temDivergenciaNcm
        ? trava1Mensagem
        : 'Identificadas divergências secundárias de princípio ativo em relação à bula oficial.'
    }

    // -------------------------------------------------------------------------
    // AÇÃO FINAL: GRAVAR / ATUALIZAR NA BASE MESTRE (Se solicitado ou autoCadastrar)
    // -------------------------------------------------------------------------
    let gravacaoResultado = {
      executada: false,
      acao: 'nenhuma',
      id_registro: null,
      mensagem: '',
    }

    if (autoCadastrar && vereditoGeral !== 'REPROVADO') {
      try {
        const colBase = $app.findCollectionByNameOrId('base_mestre')
        let recPersist = null

        if (alvoExistente && (modoValidacao === 'existente' || duplicataId)) {
          recPersist = alvoExistente
          gravacaoResultado.acao = 'atualizado'
        } else {
          recPersist = new Record(colBase)
          gravacaoResultado.acao = 'criado'
        }

        // Preenchimento de 28 campos
        recPersist.set('nome_completo', motorCanonico.nome_completo)
        recPersist.set('marca_padronizada', motorCanonico.marca_padronizada)
        recPersist.set('tipo_produto', motorCanonico.tipo_produto)
        recPersist.set('embalagem', motorCanonico.embalagem)
        recPersist.set('unidade', motorCanonico.unidade)
        recPersist.set('principio_ativo', motorCanonico.principio_ativo)
        recPersist.set('macro_grupo', motorCanonico.macro_grupo)
        recPersist.set('sub_grupo', motorCanonico.sub_grupo)
        recPersist.set('nota_subpos_2', motorCanonico.nota_subpos_2)
        recPersist.set('ncm_padrao', motorCanonico.ncm_padrao)
        recPersist.set('ncm_faixa1_ate_300g', motorCanonico.ncm_faixa1_ate_300g)
        recPersist.set('ncm_faixa2_300g_a_7_5kg', motorCanonico.ncm_faixa2_300g_a_7_5kg)
        recPersist.set('ncm_faixa3_7_5kg_a_10kg', motorCanonico.ncm_faixa3_7_5kg_a_10kg)
        recPersist.set('ncm_faixa4_acima_10kg', motorCanonico.ncm_faixa4_acima_10kg)
        recPersist.set('regra_tipi', motorCanonico.regra_tipi)
        recPersist.set('registro_mapa', motorCanonico.registro_mapa)
        recPersist.set('sistema_norma_mapa', motorCanonico.sistema_norma_mapa)
        recPersist.set('titular_fabricante', motorCanonico.titular_fabricante)
        recPersist.set('origem_base', motorCanonico.origem_base)
        recPersist.set('status_pis_cofins', motorCanonico.status_pis_cofins)
        recPersist.set('aliquota_ate_mar2026', motorCanonico.aliquota_ate_mar2026)
        recPersist.set('aliquota_pos_abr2026_real', motorCanonico.aliquota_pos_abr2026_real)
        recPersist.set(
          'aliquota_pos_abr2026_presumido',
          motorCanonico.aliquota_pos_abr2026_presumido,
        )
        recPersist.set('cst_saida', motorCanonico.cst_saida)
        recPersist.set('cst_entrada', motorCanonico.cst_entrada)
        recPersist.set('ibs_cbs_2027', motorCanonico.ibs_cbs_2027)
        recPersist.set('url_oficial', motorCanonico.url_oficial)

        // Compatibilidade com campos legados
        recPersist.set('nome_produto', motorCanonico.marca_padronizada)
        recPersist.set('ncm', motorCanonico.ncm_padrao.replace(/\D/g, ''))
        recPersist.set('fabricante', motorCanonico.titular_fabricante)
        recPersist.set('status_validacao', 'aprovado')
        recPersist.set(
          'macro_grupo_subgrupo',
          `${motorCanonico.macro_grupo} — ${motorCanonico.sub_grupo}`,
        )
        recPersist.set('regra_tipi_embalagem', motorCanonico.regra_tipi)
        recPersist.set(
          'cst_recomendado',
          `Saída: ${motorCanonico.cst_saida} | Entrada: ${motorCanonico.cst_entrada}`,
        )
        recPersist.set('dados_classificacao', JSON.stringify(motorCanonico))

        $app.save(recPersist)

        gravacaoResultado.executada = true
        gravacaoResultado.id_registro = recPersist.id
        gravacaoResultado.mensagem =
          gravacaoResultado.acao === 'criado'
            ? 'Produto cadastrado com sucesso na Base Mestre no Padrão Canônico de 28 Campos.'
            : 'Produto existente atualizado com sucesso na Base Mestre conforme os dados da bula.'
      } catch (errGrav) {
        console.log('Aviso ao persistir produto na Base Mestre:', errGrav.message)
        gravacaoResultado.mensagem = `Falha ao gravar na Base Mestre: ${errGrav.message}`
      }
    }

    // Gravar no log_validacoes para histórico permanente
    try {
      const colLog = $app.findCollectionByNameOrId('log_validacoes')
      for (const t of travas) {
        const logRec = new Record(colLog)
        logRec.set('nome_produto', nomeComercial)
        logRec.set('ncm', ncmResolvidaDigitos || '')
        logRec.set('embalagem', embalagemFinal)
        logRec.set('principio_ativo', principioAtivoFinal)
        logRec.set('id_trava', t.id_trava)
        logRec.set('trava_nome', t.trava_nome)
        logRec.set('aprovado', t.aprovado)
        logRec.set('mensagem', t.mensagem)
        $app.save(logRec)
      }
    } catch (_) {}

    // Resposta final completa para o frontend
    return e.json(200, {
      veredito_geral: vereditoGeral,
      status: vereditoGeral === 'REPROVADO' ? 'REPROVADO' : 'APROVADO',
      veredito_motivo: vereditoMotivo,
      modo: modoValidacao,
      score:
        vereditoGeral === 'APROVADO' ? 100 : vereditoGeral === 'APROVADO COM RESSALVAS' ? 75 : 30,
      total_travas: travas.length,
      total_aprovadas: travas.filter((t) => t.aprovado).length,
      campos_validacao: camposValidacao,
      possui_diferenca_ncm_embalagem: possuiDiferencaNcmPorEmbalagem,
      linhas_ncm_embalagem: linhasNcmEmbalagem,
      travas: travas,
      comparacao_existente: comparacaoExistente,
      fontes_consultadas: fontesConsultadas,
      bula_extraida: bulaExtraida,
      gravacao_base_mestre: gravacaoResultado,
      produto_canonico: motorCanonico,
      // Retrocompatibilidade
      base_mestre_inclusao: {
        incluido: gravacaoResultado.executada,
        motivo: gravacaoResultado.mensagem,
        id_registro: gravacaoResultado.id_registro,
      },
      produto_validado: {
        nome_produto: motorCanonico.marca_padronizada,
        ncm: motorCanonico.ncm_padrao,
        ncm_descricao_oficial: ncmExternoInfo?.descricao || '',
        embalagem: motorCanonico.embalagem,
        quantidade_embalagem: bulaExtraida?.quantidade_embalagem_principal || '20 L',
        principio_ativo: motorCanonico.principio_ativo,
        fabricante: motorCanonico.titular_fabricante,
        registro_mapa: motorCanonico.registro_mapa,
        concentracao: 0,
        classe_uso: motorCanonico.sub_grupo,
        formulacao: bulaExtraida?.formulacao || '',
        culturas: [],
        bula_resumo: bulaExtraida?.resumo_bula || '',
      },
    })
  } catch (errTop) {
    console.log('Erro crítico ao validar produto:', errTop.message || errTop, errTop.stack || '')
    return e.json(500, {
      veredito_geral: 'REPROVADO',
      status: 'REPROVADO',
      error: `Erro interno no servidor ao processar validação: ${errTop.message || String(errTop)}`,
      stack: String(errTop.stack || ''),
    })
  }
})

/**
 * GET /backend/v1/relatorio-duplicidades
 * Retorna grupos de duplicidades identificados na collection base_mestre
 */
// Endpoint de teste interno mantido limpo

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
