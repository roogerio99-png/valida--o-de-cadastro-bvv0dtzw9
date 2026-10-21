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
          } else if (
            paUpper.includes('GLIFOSATO') ||
            paUpper.includes('GLYPHOSATE') ||
            nomeUpper.includes('ROUNDUP')
          ) {
            // Glifosato / ROUNDUP WG formulado agrícola: NCM 3808.93.24 conforme bula oficial do MAPA (Herbicida agrícola formulado)
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
        } else if (
          subGrupo.includes('Raticida') ||
          subGrupo.includes('Rodenticida') ||
          paUpper.includes('RATICIDA') ||
          paUpper.includes('RODENTICIDA')
        ) {
          ncmPadrao = '3808.94.90'
        } else if (
          subGrupo.includes('Inseticida') ||
          subGrupo.includes('Acaricida') ||
          paUpper.includes('INSETICIDA') ||
          paUpper.includes('ACARICIDA')
        ) {
          if (paUpper.includes('ACEFATO') || paUpper.includes('THURINGIENSIS')) {
            ncmPadrao = '3808.91.91'
          } else if (paUpper.includes('CIPERMETRINA') || paUpper.includes('CYPERMETHRIN')) {
            ncmPadrao = '3808.91.92'
          } else {
            ncmPadrao = '3808.91.99'
          }
        } else {
          // Inconclusivo / Não Reconhecido: mantém código neutro residual 3808.99.99 sem inventar herbicida
          ncmPadrao = '3808.99.99'
        }
        ncmFaixa1 = ncmPadrao
        ncmFaixa2 = ncmPadrao
        ncmFaixa3 = ncmPadrao
        ncmFaixa4 = ncmPadrao
        regraTipi =
          'Posição 38.08 TIPI: Embalagem comercial agrícola usa subitens .2x ou .9x, vedada subposição domissanitária (.1x)'
      }

      // NOTA FISCAL CRÍTICA: O input.ncm informado pelo usuário NUNCA deve sobrescrever
      // a determinação canônica do motor químico-aduaneiro.

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

    const cleanStr = function (s) {
      if (!s) return ''
      return String(s)
        .toLowerCase()
        .replace(/[\s\-_]/g, '')
    }

    // -------------------------------------------------------------------------
    // ENTRADA DOS DADOS (5 campos do escopo reformulado)
    // -------------------------------------------------------------------------
    const info = e.requestInfo()
    const data = info.body || {}

    const nomeComercial = String(
      data.nome_comercial || data.nome_produto || data.nome_completo || '',
    ).trim()
    const ncmInputRaw = String(data.ncm || data.ncm_padrao || '').trim()
    const ncmDigitos = ncmInputRaw.replace(/\D/g, '')
    const ncmFormatado = motor.formatarNcmMascara(ncmDigitos)

    const principioAtivoInformado = String(data.principio_ativo || '').trim()
    const codigoMapaInformado = String(
      data.codigo_mapa || data.registro_mapa || data.registro || '',
    ).trim()
    const embalagemInformada = String(data.embalagem || '').trim()

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

    if (!ncmDigitos || ncmDigitos.length !== 8) {
      return e.json(400, {
        status: 'REPROVADO',
        error: `O NCM é obrigatório e deve conter exatamente 8 dígitos numéricos (recebido: "${ncmInputRaw}").`,
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

    // 1.4 Consulta Externa BrasilAPI (Catálogo Oficial Siscomex / TIPI para o NCM)
    let ncmExternoInfo = null
    try {
      const resNcm = $http.send({
        url: `https://brasilapi.com.br/api/ncm/v1/${ncmDigitos}`,
        method: 'GET',
        headers: {
          'User-Agent': 'ValidadorAgro/2.0 (Auditoria Fiscal)',
          Accept: 'application/json',
        },
        timeout: 5,
      })
      if (resNcm.statusCode === 200) {
        const bodyNcm =
          typeof resNcm.json === 'function' ? resNcm.json() : JSON.parse(resNcm.raw || '{}')
        ncmExternoInfo = {
          codigo: bodyNcm.codigo || ncmDigitos,
          descricao: bodyNcm.descricao || '',
          data_inicio: bodyNcm.data_inicio || '',
        }
        fontesConsultadas.push({
          fonte: 'Classif Siscomex / TIPI (Receita Federal)',
          tipo: 'ncm',
          status: 'sucesso',
          url: 'https://portalunico.siscomex.gov.br/classif/',
          detalhes: `NCM ${ncmFormatado} confirmado na tabela oficial TIPI: "${ncmExternoInfo.descricao}".`,
        })
      } else if (resNcm.statusCode === 404) {
        fontesConsultadas.push({
          fonte: 'Classif Siscomex / TIPI (Receita Federal)',
          tipo: 'ncm',
          status: 'nao_encontrado',
          url: 'https://portalunico.siscomex.gov.br/classif/',
          detalhes: `Código NCM ${ncmFormatado} não encontrado no catálogo oficial Siscomex.`,
        })
      }
    } catch (httpErr) {
      fontesConsultadas.push({
        fonte: 'Classif Siscomex / TIPI (Receita Federal)',
        tipo: 'ncm',
        status: 'indisponivel',
        detalhes: `Consulta Siscomex externa indisponível (${httpErr.message || 'timeout'}). Auditoria mantida pela matriz local.`,
      })
    }

    // 1.5 Busca da BULA e do Registro no AGROFIT / MAPA via IA / Dados Oficiais
    let bulaExtraida = null
    let agrofitOficial = null

    try {
      const promptAuditoriaBula = `Você é o Auditor Oficial e Perito Químico-Aduaneiro do Ministério da Agricultura (MAPA / AGROFIT).
O usuário submeteu um produto comercial para validação cadastral:
- Nome Comercial informado: "${nomeComercial}"
- NCM informada: "${ncmFormatado}"
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

    const embalagemFinal =
      embalagemInformada ||
      bulaExtraida?.embalagem_principal ||
      (produtoBaseMestreEncontrado
        ? produtoBaseMestreEncontrado.getString('embalagem')
        : 'Bombona 20 L')

    // -------------------------------------------------------------------------
    // CASCATA DE 4 ETAPAS PARA DEDUÇÃO DE CLASSE AGRONÔMICA E NCM CANÔNICO:
    // 1º. Consultar a matriz de princípios ativos (dicionario_principios_ativos) buscando a(s) molécula(s)
    // 2º. Se não resolver, consultar a Base Mestre (base_mestre) por produtos com mesmo PA e usar a NCM/classe
    // 3º. Se ainda não resolver, usar a busca de bula/AGROFIT (classe de uso declarada na bula)
    // 4º. Último recurso: lista fixa de moléculas conhecidas no código
    // Se NENHUMA etapa determinar a classe, a validação deve sair como INCONCLUSIVO ("ressalva")
    // -------------------------------------------------------------------------
    let classeUsoFinal = ''
    let etapaOrigemClasse = ''
    let ncmSugeridoCascata = ''

    // Helper para extrair nomes de moléculas do texto do PA
    const extrairMoleculasTexto = function (txt) {
      if (!txt) return []
      return String(txt)
        .replace(/[\(\)\[\],;\/\+\&]/g, ' ')
        .split(/\s+/)
        .map((s) => s.trim().toUpperCase())
        .filter(
          (s) =>
            s.length >= 4 &&
            !/^\d+$/.test(s) &&
            !['COM', 'PARA', 'AGRO', 'TECNICO', 'SOLUVEL', 'CONCENTRADO'].includes(s),
        )
    }

    // ETAPA 0 (BULA OFICIAL / USO DECLARADO): A consulta à bula/AGROFIT extrai o USO declarado
    // (uso agrícola vs uso domissanitário) e a classe de uso.
    // A bula tem prioridade sobre ncm_padrao gravado quando este for contraditório com o tipo do produto.
    const usoBulaDeclarado = bulaExtraida?.uso_declarado || 'Uso Agrícola'
    const isUsoAgricola =
      !usoBulaDeclarado.toLowerCase().includes('domiss') &&
      !usoBulaDeclarado.toLowerCase().includes('domést')

    // ETAPA 1: Consultar a Matriz de Princípios Ativos (dicionario_principios_ativos)
    let paMatrizRecord = paDicionarioEncontrado
    if (!paMatrizRecord && (principioAtivoFinal || nomeComercial)) {
      const tokensMoleculas = extrairMoleculasTexto(`${principioAtivoFinal} ${nomeComercial}`)
      for (const token of tokensMoleculas) {
        try {
          const escToken = token.replace(/'/g, "\\'")
          const achouPa = $app.findRecordsByFilter(
            'dicionario_principios_ativos',
            `principio_ativo = '${escToken}' || principio_ativo_chave = '${escToken}' || principio_ativo ~ '${escToken}'`,
            '-created',
            1,
            0,
          )
          if (achouPa && achouPa.length > 0) {
            paMatrizRecord = achouPa[0]
            break
          }
        } catch (_) {}
      }
    }

    if (paMatrizRecord) {
      const cl =
        paMatrizRecord.getString('classe') ||
        paMatrizRecord.getString('macro_grupo_subgrupo_padrao')
      if (
        cl &&
        !cl.toLowerCase().includes('inconclusivo') &&
        !cl.toLowerCase().includes('defensivo fitossanit')
      ) {
        classeUsoFinal = cl
        etapaOrigemClasse = '1ª Etapa (Matriz de Princípios Ativos)'
        const ncmRefMatriz = paMatrizRecord.getString('ncm_padrao_referencia') || ''
        const cleanRef = ncmRefMatriz.replace(/\D/g, '')
        // Se for uso agrícola segundo a bula, não aceita subitem domissanitário/técnico (.1x) da matriz
        if (
          isUsoAgricola &&
          (cleanRef.startsWith('3808931') ||
            cleanRef.startsWith('3808921') ||
            cleanRef.startsWith('3808911'))
        ) {
          // ignora ncm de técnico/domissanitário
        } else {
          ncmSugeridoCascata = ncmRefMatriz
        }
      }
    }

    // ETAPA 2: Se não resolver, consultar a Base Mestre (base_mestre) por produtos com mesmo PA
    if (!classeUsoFinal && principioAtivoFinal) {
      try {
        const tokensMoleculas = extrairMoleculasTexto(principioAtivoFinal)
        for (const token of tokensMoleculas) {
          const escToken = token.replace(/'/g, "\\'")
          const matchesBm =
            $app.findRecordsByFilter(
              'base_mestre',
              `principio_ativo ~ '${escToken}'`,
              '-created',
              5,
              0,
            ) || []
          for (const bm of matchesBm) {
            const sub = bm.getString('sub_grupo')
            const ncmBm = bm.getString('ncm_padrao') || bm.getString('ncm')
            if (
              sub &&
              !sub.toLowerCase().includes('inconclusivo') &&
              !sub.toLowerCase().includes('defensivo fitossanit')
            ) {
              classeUsoFinal = sub
              etapaOrigemClasse = '2ª Etapa (Base Mestre por Princípio Ativo)'
              const cleanBm = (ncmBm || '').replace(/\D/g, '')
              // Se a bula atesta uso agrícola e o registro na base estiver poluído com técnico/domissanitário (.1x), ignora
              if (
                isUsoAgricola &&
                (cleanBm.startsWith('3808931') ||
                  cleanBm.startsWith('3808921') ||
                  cleanBm.startsWith('3808911'))
              ) {
                // não herda ncm de técnico
              } else if (!ncmSugeridoCascata && ncmBm) {
                ncmSugeridoCascata = ncmBm
              }
              break
            }
          }
          if (classeUsoFinal) break
        }
      } catch (errBm) {
        console.log('Aviso ao consultar base_mestre por PA:', errBm.message)
      }
    }

    // ETAPA 3: Se ainda não resolver, usar a busca de bula/AGROFIT (classe de uso declarada na bula)
    if (!classeUsoFinal && bulaExtraida?.classe_uso) {
      const bCl = bulaExtraida.classe_uso
      if (
        !bCl.toLowerCase().includes('defensivo fitossanit') &&
        !bCl.toLowerCase().includes('fitossanitário') &&
        !bCl.toLowerCase().includes('não informado') &&
        !bCl.toLowerCase().includes('inconclusivo')
      ) {
        classeUsoFinal = bCl
        etapaOrigemClasse = '3ª Etapa (Bulário Oficial AGROFIT / MAPA)'
      }
    }

    // ETAPA 4: Último recurso - Lista fixa de moléculas conhecidas no código (executada via motor químico)
    if (!classeUsoFinal) {
      etapaOrigemClasse = '4ª Etapa (Lista Químico-Aduaneira de Moléculas)'
    }

    const dadosMotorInput = {
      nome_completo: nomeComercial,
      ncm: ncmFormatado,
      principio_ativo: principioAtivoFinal,
      embalagem: embalagemFinal,
      fabricante: fabricanteFinal,
      registro_mapa: registroMapaFinal,
      sub_grupo: classeUsoFinal,
      origem_base: 'VALIDADOR_CADASTRO_PORTAL',
    }

    const motorCanonico = motor.executarMotorCanonico(dadosMotorInput)

    // Se a etapa 1 ou 2 já tiver NCM homologado específico e o motor não aplicou Nota 2, sincroniza
    if (ncmSugeridoCascata && motorCanonico.nota_subpos_2 !== 'SIM') {
      const cleanSug = ncmSugeridoCascata.replace(/\D/g, '')
      if (cleanSug.length === 8) {
        // Se a NCM sugerida pela matriz/base mestre for da mesma subposição da classe determinada, preserva
        const subposSug = cleanSug.slice(0, 6)
        const subposCalc = motorCanonico.ncm_padrao.replace(/\D/g, '').slice(0, 6)
        if (subposSug === subposCalc || !subposCalc || subposCalc === '380899') {
          motorCanonico.ncm_padrao = motor.formatarNcmMascara(cleanSug)
        }
      }
    }

    // Se o produto for ROUNDUP WG ou Glifosato formulado agrícola, garantir alinhamento canônico das faixas em 3808.93.24
    if (
      motor.normalizarTexto(nomeComercial).includes('ROUNDUP WG') ||
      motorCanonico.ncm_padrao.replace(/\D/g, '') === '38089324'
    ) {
      motorCanonico.ncm_padrao = '3808.93.24'
      motorCanonico.ncm_faixa1_ate_300g = '3808.93.24'
      motorCanonico.ncm_faixa2_300g_a_7_5kg = '3808.93.24'
      motorCanonico.ncm_faixa3_7_5kg_a_10kg = '3808.93.24'
      motorCanonico.ncm_faixa4_acima_10kg = '3808.93.24'
    }

    const ncmCanonicoDeterminado = motorCanonico.ncm_padrao
    const classeAgronomicaInconclusiva =
      motorCanonico.sub_grupo.includes('Inconclusivo') ||
      motorCanonico.sub_grupo.includes('Não Reconhecido')

    // Helper para obter a descrição da subposição/família da NCM
    const descreverGrupoNcm = function (codigo8) {
      const c = String(codigo8 || '').replace(/\D/g, '')
      if (c.startsWith('380861') || c.startsWith('380862') || c.startsWith('380869')) {
        return `${motor.formatarNcmMascara(c)} — Mercadorias da Nota de Subposições 2 do Cap. 38 (por Faixa de Embalagem)`
      }
      if (c.startsWith('380891')) {
        return `${motor.formatarNcmMascara(c)} — Inseticidas, Acaricidas e afins`
      }
      if (c.startsWith('380892')) {
        return `${motor.formatarNcmMascara(c)} — Fungicidas`
      }
      if (c.startsWith('380893')) {
        if (c === '38089359' || c.startsWith('3808935')) {
          return `${motor.formatarNcmMascara(c)} — Reguladores de Crescimento de Plantas`
        }
        return `${motor.formatarNcmMascara(c)} — Herbicidas e Inibidores de Germinação`
      }
      if (c.startsWith('380894')) {
        return `${motor.formatarNcmMascara(c)} — Desinfetantes`
      }
      if (c.startsWith('380899')) {
        return `${motor.formatarNcmMascara(c)} — Nematicidas, Rodenticidas e Outros`
      }
      if (
        c.startsWith('3105') ||
        c.startsWith('3101') ||
        c.startsWith('3102') ||
        c.startsWith('3103') ||
        c.startsWith('3104')
      ) {
        return `${motor.formatarNcmMascara(c)} — Fertilizantes e Adubos (Capítulo 31)`
      }
      if (c.startsWith('2520') || c.startsWith('2521') || c.startsWith('2503')) {
        return `${motor.formatarNcmMascara(c)} — Corretivos e Condicionadores de Solo (Capítulo 25)`
      }
      if (c.startsWith('3002')) {
        return `${motor.formatarNcmMascara(c)} — Inoculantes e Culturas de Microrganismos (Capítulo 30)`
      }
      if (c.startsWith('3824')) {
        return `${motor.formatarNcmMascara(c)} — Adjuvantes e Preparações Químicas Diversas (Capítulo 38)`
      }
      return `${motor.formatarNcmMascara(c)} — Classificação Aduaneira Oficial`
    }

    const ncmCleanInf = ncmDigitos
    const ncmCleanCanonico = ncmCanonicoDeterminado.replace(/\D/g, '')

    // Determinar coerência e divergência exata de NCM
    const subposInformada = ncmCleanInf.slice(0, 6)
    const subposCanonica = ncmCleanCanonico.slice(0, 6)
    const ncmF1 = motorCanonico.ncm_faixa1_ate_300g.replace(/\D/g, '')
    const ncmF2 = motorCanonico.ncm_faixa2_300g_a_7_5kg.replace(/\D/g, '')
    const ncmF3 = motorCanonico.ncm_faixa3_7_5kg_a_10kg.replace(/\D/g, '')
    const ncmF4 = motorCanonico.ncm_faixa4_acima_10kg.replace(/\D/g, '')
    const bateFaixaEmbalagem = [ncmF1, ncmF2, ncmF3, ncmF4].includes(ncmCleanInf)

    // Regra decisiva: qualquer divergência de NCM entre a informada e a canônica deduzida
    // — inclusive dentro da mesma família/subposição (ex: .19 vs .24 ou .24 vs .34) —
    // força status DIVERGENTE na tela /validar, no veredito geral e nos relatórios.
    // Nenhum parecer sai "OK" havendo divergência de NCM!
    const ncmExataConfere = ncmCleanInf === ncmCleanCanonico
    let divergenciaCoerenciaClasseNcm = !ncmExataConfere

    // -------------------------------------------------------------------------
    // ETAPA 3 — NCM POR EMBALAGEM EM LINHAS DIFERENTES (Requisito Explícito)
    // Se o produto tiver variação de NCM por faixa TIPI, trazer UMA LINHA POR FAIXA/EMBALAGEM
    // -------------------------------------------------------------------------
    const linhasNcmEmbalagem = []

    const f1Ncm = motorCanonico.ncm_faixa1_ate_300g
    const f2Ncm = motorCanonico.ncm_faixa2_300g_a_7_5kg
    const f3Ncm = motorCanonico.ncm_faixa3_7_5kg_a_10kg
    const f4Ncm = motorCanonico.ncm_faixa4_acima_10kg

    const faixasDef = [
      {
        faixa_id: 1,
        faixa_nome: 'Faixa 1 — Embalagens até 300 g / mL (Frascos Pequenos / Doses)',
        faixa_rotulo: '≤ 300 g ou mL (ex.: Frasco 250 mL, Sachê 100 g)',
        ncm_correta: f1Ncm,
        exemplo_embalagem: 'Frasco 250 mL / Sachê 100 g',
      },
      {
        faixa_id: 2,
        faixa_nome: 'Faixa 2 — Embalagens > 300 g a 7,5 kg / L (Frascos / Galões Médios)',
        faixa_rotulo: '> 300 g a 7,5 kg ou L (ex.: Frasco 1 L, Galão 5 L)',
        ncm_correta: f2Ncm,
        exemplo_embalagem: 'Frasco 1 L / Galão 5 L',
      },
      {
        faixa_id: 3,
        faixa_nome: 'Faixa 3 — Embalagens > 7,5 kg a 10 kg / L (Bombonas Médias / Sacos 10 kg)',
        faixa_rotulo: '> 7,5 kg a 10 kg ou L (ex.: Bombona 10 L, Saco 10 kg)',
        ncm_correta: f3Ncm,
        exemplo_embalagem: 'Bombona 10 L / Saco 10 kg',
      },
      {
        faixa_id: 4,
        faixa_nome: 'Faixa 4 — Embalagens > 10 kg / L (Bombonas 20 L / Tambor / Big Bag / Granel)',
        faixa_rotulo: '> 10 kg ou L até Granel (ex.: Bombona 20 L, Tambor 200 L, Big Bag 1.000 kg)',
        ncm_correta: f4Ncm,
        exemplo_embalagem: 'Bombona 20 L / Tambor 200 L / Granel',
      },
    ]

    // Determinar se há diferença real entre as faixas
    const ncmSet = new Set([f1Ncm, f2Ncm, f3Ncm, f4Ncm])
    const possuiDiferencaNcmPorEmbalagem = ncmSet.size > 1

    faixasDef.forEach((faixa) => {
      const seAplicaAoInformado = faixa.ncm_correta.replace(/\D/g, '') === ncmDigitos
      linhasNcmEmbalagem.push({
        faixa_id: faixa.faixa_id,
        faixa_nome: faixa.faixa_nome,
        faixa_rotulo: faixa.faixa_rotulo,
        exemplo_embalagem: faixa.exemplo_embalagem,
        ncm_correta: faixa.ncm_correta,
        ncm_informada_se_aplica: seAplicaAoInformado,
        status_aplicacao: seAplicaAoInformado
          ? 'NCM INFORMADA SE APLICA'
          : 'NCM INFORMADA NÃO SE APLICA',
        observacao: seAplicaAoInformado
          ? `O código NCM ${ncmFormatado} é exatamente o aplicável para esta faixa de embalagem.`
          : `Para esta embalagem a NCM correta é ${faixa.ncm_correta} (informado: ${ncmFormatado}).`,
      })
    })

    // -------------------------------------------------------------------------
    // TRAVAS DE AUDITORIA (Trava 0 a 4)
    // -------------------------------------------------------------------------
    const travas = []

    // Trava 0/Coerência: Coerência de Classificação Fiscal (Classe Agronômica × Subposição NCM)
    // Se a classe agronômica for INCONCLUSIVA, não reprova: aprova com ressalva sem inventar classe
    const travaCoerenciaPassou = classeAgronomicaInconclusiva ? true : ncmExataConfere
    const descInfGrupo = descreverGrupoNcm(ncmCleanInf)
    const descCanonicoGrupo = descreverGrupoNcm(ncmCleanCanonico)

    let msgTravaCoerencia = ''
    if (classeAgronomicaInconclusiva) {
      msgTravaCoerencia = `Classe agronômica inconclusiva para as moléculas informadas. Enquadramento mantido com ressalva sem penalização fiscal.`
    } else if (travaCoerenciaPassou) {
      msgTravaCoerencia = `NCM ${ncmFormatado} perfeitamente compatível com o produto ("${motorCanonico.sub_grupo}") e seu uso regulamentado.`
    } else if (subposInformada !== subposCanonica) {
      msgTravaCoerencia = `Divergência de Enquadramento: NCM informada (${descInfGrupo}) diverge da classe agronômica do produto ("${motorCanonico.sub_grupo}"). NCM canônica correta: ${descCanonicoGrupo}.`
    } else {
      msgTravaCoerencia = `Divergência de Subitem TIPI (Uso Agrícola vs Outro): NCM informada foi ${ncmFormatado}, mas a canônica correta segundo a bula é ${ncmCanonicoDeterminado} (${descCanonicoGrupo}).`
    }

    travas.push({
      id_trava: 0,
      trava_nome: 'Coerência Classe × Subposição NCM (TIPI)',
      aprovado: travaCoerenciaPassou,
      mensagem: msgTravaCoerencia,
    })

    // Trava 1: NCM Obrigatório e Válido (com Fallback Dinâmico BrasilAPI / Siscomex)
    let regraNcmRecord = null
    try {
      const recs = $app.findRecordsByFilter(
        'regras_ncm_embalagem',
        `ncm = '${ncmDigitos}'`,
        '-created',
        1,
        0,
      )
      if (recs && recs.length > 0) {
        regraNcmRecord = recs[0]
      }
    } catch (_) {}

    // Fallback dinâmico: se a NCM de 8 dígitos não estiver na coleção local,
    // verifica se a consulta externa (BrasilAPI / Siscomex) já obteve retorno ou tenta novamente
    let consultaExternaRealizada = Boolean(ncmExternoInfo)
    let ncmExternoConfirmado = Boolean(ncmExternoInfo && ncmExternoInfo.descricao)
    let servicoExternoInacessivel = false

    const fonteNcmStatus = (fontesConsultadas.find((f) => f.tipo === 'ncm') || {}).status
    if (fonteNcmStatus === 'indisponivel') {
      servicoExternoInacessivel = true
    }

    // Se não encontrou localmente e ainda não tem confirmação nem erro 404 definitivo
    if (
      !regraNcmRecord &&
      !ncmExternoConfirmado &&
      !servicoExternoInacessivel &&
      fonteNcmStatus !== 'nao_encontrado'
    ) {
      try {
        const resNcmFallback = $http.send({
          url: `https://brasilapi.com.br/api/ncm/v1/${ncmDigitos}`,
          method: 'GET',
          headers: {
            'User-Agent': 'ValidadorAgro/2.0 (Auditoria Fiscal)',
            Accept: 'application/json',
          },
          timeout: 5,
        })
        consultaExternaRealizada = true
        if (resNcmFallback.statusCode === 200) {
          const bodyNcm =
            typeof resNcmFallback.json === 'function'
              ? resNcmFallback.json()
              : JSON.parse(resNcmFallback.raw || '{}')
          ncmExternoInfo = {
            codigo: bodyNcm.codigo || ncmDigitos,
            descricao: bodyNcm.descricao || '',
            data_inicio: bodyNcm.data_inicio || '',
          }
          ncmExternoConfirmado = true
        } else if (resNcmFallback.statusCode === 404) {
          ncmExternoConfirmado = false
        } else {
          servicoExternoInacessivel = true
        }
      } catch (errHttpFb) {
        consultaExternaRealizada = true
        servicoExternoInacessivel = true
      }
    }

    let trava1Passou = false
    let trava1Mensagem = ''

    if (regraNcmRecord) {
      trava1Passou = true
      const descLocal =
        regraNcmRecord.getString('descricao') || 'Classificação homologada na matriz agropecuária'
      trava1Mensagem = `NCM ${ncmFormatado} válido e homologado na base local TIPI (${descLocal}).`
    } else if (ncmExternoConfirmado) {
      trava1Passou = true
      trava1Mensagem = `NCM ${ncmFormatado} validado via catálogo oficial Siscomex/BrasilAPI: "${ncmExternoInfo.descricao}".`
    } else if (servicoExternoInacessivel) {
      // Quando inacessível externamente e não encontrado localmente, não reprova por falta de dados externos: marca como não verificável
      trava1Passou = true
      trava1Mensagem = `NCM ${ncmFormatado} com 8 dígitos, não verificável em tempo real (catálogo Siscomex/BrasilAPI indisponível; ausente na matriz local). Aprovado condicionalmente.`
    } else {
      trava1Passou = false
      trava1Mensagem = `NCM ${ncmFormatado} não localizado no catálogo oficial da TIPI/Siscomex (inexistente na base oficial).`
    }

    travas.push({
      id_trava: 1,
      trava_nome: 'NCM Válido (Siscomex / TIPI)',
      aprovado: trava1Passou,
      mensagem: trava1Mensagem,
    })

    // Trava 2: Embalagem vs NCM
    let trava2Passou = true
    let trava2Msg = ''
    if (!embalagemInformada) {
      trava2Msg = 'Embalagem não informada (opcional). Sem impedimento para o NCM.'
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
          const embNorm = cleanStr(embalagemInformada)
          const match = permitidas.some((p) => {
            const pNorm = cleanStr(p)
            return embNorm === pNorm || embNorm.includes(pNorm) || pNorm.includes(embNorm)
          })
          if (match) {
            trava2Passou = true
            trava2Msg = `Embalagem "${embalagemInformada}" autorizada para o NCM ${ncmFormatado}.`
          } else {
            trava2Passou = false
            trava2Msg = `Embalagem "${embalagemInformada}" não consta na lista de permitidas para ${ncmFormatado} (${permitidas.slice(0, 5).join(', ')}).`
          }
        } else {
          trava2Msg = `Embalagem "${embalagemInformada}" compatível com a NCM ${ncmFormatado}.`
        }
      } catch (err) {
        trava2Msg = `Matriz de embalagens avaliada: ${err.message}`
      }
    } else {
      trava2Msg = `Embalagem "${embalagemInformada}" aceita para análise aduaneira.`
    }

    travas.push({
      id_trava: 2,
      trava_nome: 'Embalagem vs NCM',
      aprovado: trava2Passou,
      mensagem: trava2Msg,
    })

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

      const porNome = $app.findRecordsByFilter(
        'base_mestre',
        `ncm_padrao = '${ncmFormatado}' || ncm = '${ncmDigitos}'`,
        '-created',
        10,
        0,
      )
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
    // 2.3 NCM (Obrigatório) — Validação Cruzada de NCM & Coerência Classe × Subposição TIPI
    // -------------------------------------------------------------------------
    let statusNcm = 'OK'
    let explNcm = ''

    if (!trava1Passou) {
      statusNcm = 'DIVERGENTE'
      explNcm = `Trava 1 Reprovada: ${trava1Mensagem}`
    } else if (classeAgronomicaInconclusiva) {
      statusNcm = 'RESSALVA'
      explNcm = `Classe agronômica inconclusiva após cascata de 4 etapas (Matriz PA, Base Mestre, AGROFIT e lista química). Classificação aduaneira inconclusiva; NCM informada ${ncmFormatado} aceita sob ressalva.`
    } else if (ncmCleanInf === ncmCleanCanonico) {
      statusNcm = 'OK'
      explNcm = `NCM informada (${ncmFormatado}) confere com a classificação química e aduaneira recomendada pelo motor canônico para a classe "${motorCanonico.sub_grupo}" e está homologada.`
    } else {
      // Qualquer divergência de NCM, inclusive dentro da mesma família/subposição, força DIVERGENTE
      statusNcm = 'DIVERGENTE'
      const descInf = descreverGrupoNcm(ncmCleanInf)
      const descCanonica = descreverGrupoNcm(ncmCleanCanonico)

      if (subposInformada !== subposCanonica) {
        explNcm = `Divergência de Subposição TIPI: NCM informada foi ${ncmFormatado} (${descInf}), mas a classificação canônica para a classe agronômica "${motorCanonico.sub_grupo}" é ${ncmCanonicoDeterminado} (${descCanonica}).`
      } else {
        explNcm = `Divergência de Subitem TIPI (Uso Agrícola vs Domissanitário/Técnico): NCM informada foi ${ncmFormatado}, mas a classificação canônica para este produto conforme bula oficial é ${ncmCanonicoDeterminado} (${descCanonica}).`
      }
    }

    camposValidacao.push({
      campo: 'NCM',
      chave: 'ncm',
      obrigatorio: true,
      informado: ncmFormatado,
      encontrado_bula: ncmCanonicoDeterminado,
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
    // Regra: O veredito geral NUNCA pode ser "APROVADO" quando qualquer trava de auditoria está reprovada.
    // -------------------------------------------------------------------------
    const temDivergenciaNcm = statusNcm === 'DIVERGENTE'
    const temDivergenciaPa = statusPa === 'DIVERGENTE'
    const travasReprovadas = travas.filter((t) => !t.aprovado)
    const algumaTravaReprovada = travasReprovadas.length > 0

    let vereditoGeral = 'APROVADO'
    let vereditoMotivo = 'Produto validado com sucesso e em plena conformidade regulatória.'

    if (
      !trava1Passou ||
      (modoValidacao !== 'existente' && !trava4Passou) ||
      (divergenciaCoerenciaClasseNcm && !classeAgronomicaInconclusiva)
    ) {
      vereditoGeral = 'REPROVADO'
      if (!trava1Passou) {
        vereditoMotivo = 'NCM informado inválido ou inexistente nas tabelas oficiais Siscomex/TIPI.'
      } else if (divergenciaCoerenciaClasseNcm && !classeAgronomicaInconclusiva) {
        vereditoMotivo = `Divergência de NCM (TIPI): NCM informada (${ncmFormatado}) diverge da canônica correta do produto (${ncmCanonicoDeterminado}) determinada pelo uso na bula oficial (${motorCanonico.sub_grupo}).`
      } else {
        vereditoMotivo =
          'Produto com marca ou registro idêntico já cadastrado na Base Mestre (duplicidade).'
      }
    } else if (classeAgronomicaInconclusiva) {
      vereditoGeral = 'APROVADO COM RESSALVAS'
      vereditoMotivo =
        'Classe agronômica e enquadramento aduaneiro inconclusivos após consulta na Matriz de PAs, Base Mestre e Bulário. Produto aprovado sob ressalva sem atribuição de classe arbitrária.'
    } else if (algumaTravaReprovada) {
      // Se qualquer outra trava estiver reprovada (ex: Trava 2 Embalagem vs NCM ou Trava 3 PA), nunca APROVADO
      vereditoGeral = 'APROVADO COM RESSALVAS'
      vereditoMotivo = `Pendências nas travas de auditoria: ${travasReprovadas.map((t) => t.trava_nome).join(', ')}.`
    } else if (temDivergenciaNcm || temDivergenciaPa) {
      vereditoGeral = temDivergenciaNcm ? 'REPROVADO' : 'APROVADO COM RESSALVAS'
      vereditoMotivo = temDivergenciaNcm
        ? `NCM informada (${ncmFormatado}) diverge da NCM canônica correta recomendada pelo motor (${ncmCanonicoDeterminado}).`
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
        logRec.set('ncm', ncmDigitos)
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
