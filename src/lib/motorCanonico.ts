/**
 * motorCanonico.ts
 * Motor Químico-Aduaneiro e Tributário Determinístico no Frontend (TypeScript)
 * Fiel à especificação técnica 2.4.0 (Contrato Canônico de 28 Campos).
 */

import { BaseMestreProduto, TipoProdutoCanonico, UnidadeFisicaCanonica } from '@/types/agro'

export const MOLECULAS_NOTA_SUBPOS_2 = [
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
] as const

export function normalizarTexto(s?: string): string {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function sanitizarMarcaComercial(nomeCompleto?: string): string {
  const texto = String(nomeCompleto || '').trim()
  if (!texto) return 'PRODUTO AGRO'

  // Remove sufixos como 1X20L, 4X5L, 20L, 50 KG, (IMP), TC, etc.
  const padraoEmb =
    /\s+(?:\d+\s*[xX]\s*\d+\s*[A-Za-z]+|\d+(?:[.,]\d+)?\s*(?:L|LT|LITROS|KG|G|SC|SACO|ML|DOSES)\b|\(IMP\)|\bTC\b|\bIMP\b).*/i
  let limpo = texto.replace(padraoEmb, '').trim()
  limpo = limpo.replace(/[-–—/]+$/, '').trim()
  return limpo || texto
}

export function formatarNcmMascara(ncm?: string): string {
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

export function sanitizarRegistroMapa(reg?: string): string {
  if (!reg) return 'ISENTO'
  const s = String(reg).trim()
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
  if (/^\d+$/.test(s)) {
    return `Nº ${s}`
  }

  return s
}

export function validarFormatoRegistroMapa(reg?: string): boolean {
  const s = String(reg || '').trim()
  if (!s) return false
  return s.startsWith('Nº ') || s.startsWith('TC') || s.includes('ISENTO') || s.includes('-')
}

export function verificarNotaSubpos2(principioAtivo?: string, nomeCompleto?: string): boolean {
  const paUpper = `${String(principioAtivo || '')} ${String(nomeCompleto || '')}`.toUpperCase()
  return MOLECULAS_NOTA_SUBPOS_2.some((mol) => paUpper.includes(mol))
}

export function deduzirUnidade(
  embalagem?: string,
  unidadeInformada?: string,
): UnidadeFisicaCanonica {
  if (unidadeInformada) {
    const u = String(unidadeInformada).trim().toUpperCase()
    if (['L', 'KG', 'SC', 'UN', 'DOSES'].includes(u)) {
      return u as UnidadeFisicaCanonica
    }
    if (u === 'LT' || u === 'LITROS' || u === 'ML') return 'L'
    if (u === 'G' || u === 'KILOS' || u === 'QUILOS') return 'KG'
    if (u === 'SACO' || u === 'SACAS') return 'SC'
    if (u === 'FRASCO' || u === 'BOMBONA' || u === 'TAMBOR') return 'UN'
  }

  const embUpper = String(embalagem || '').toUpperCase()
  if (embUpper.includes('KG') || embUpper.includes('QUILO') || embUpper.includes('G')) return 'KG'
  if (embUpper.includes('SC') || embUpper.includes('SACO') || embUpper.includes('SACARIA'))
    return 'SC'
  if (embUpper.includes('DOSE')) return 'DOSES'
  if (embUpper.includes('UN') || embUpper.includes('PECA')) return 'UN'
  return 'L'
}

export interface MotorInput {
  nome_completo?: string
  nome_produto?: string
  marcas_comerciais?: string
  marca_padronizada?: string
  tipo_produto?: string
  embalagem?: string
  unidade?: string
  principio_ativo?: string
  principio_ativo_ou_garantia?: string
  macro_grupo?: string
  sub_grupo?: string
  classe_uso?: string
  registro_mapa?: string
  numero_registro_mapa?: string
  titular_fabricante?: string
  fabricante?: string
  origem_base?: string
  ncm_padrao?: string
  ncm?: string
  url_oficial?: string
}

export function executarMotorCanonicoFrontend(
  input: MotorInput,
): Omit<BaseMestreProduto, 'id' | 'created' | 'updated'> {
  const nomeCompleto = String(
    input.nome_completo || input.nome_produto || input.marcas_comerciais || '',
  ).trim()

  const marcaPadronizada =
    String(input.marca_padronizada || '').trim() || sanitizarMarcaComercial(nomeCompleto)

  const embalagemBruta = String(input.embalagem || '1X20L (20 L)').trim()
  const unidade = deduzirUnidade(embalagemBruta, input.unidade)

  const principioAtivoBruto = String(
    input.principio_ativo || input.principio_ativo_ou_garantia || marcaPadronizada,
  ).trim()

  const titular = String(input.titular_fabricante || input.fabricante || 'Não Informado').trim()

  const origemBase = String(input.origem_base || 'PRE_CADASTRO_PORTAL').trim()
  const registroMapaFormatado = sanitizarRegistroMapa(
    input.registro_mapa || input.numero_registro_mapa || '',
  )

  const paUpper = principioAtivoBruto.toUpperCase()
  const nomeUpper = nomeCompleto.toUpperCase()
  const marcaUpper = marcaPadronizada.toUpperCase()
  const origemUpper = origemBase.toUpperCase()

  let tipoProduto: TipoProdutoCanonico = 'Produto Formulado Comercial'
  let macroGrupo = 'Defensivos'
  let subGrupo = 'Herbicida'
  let sistemaNormaMapa = 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)'
  let categoriaTributaria: 'beneficiado' | 'condicional' | 'tributado_integral' = 'beneficiado'

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

    // Reconhecimento químico determinístico das principais moléculas de fungicidas
    const isFungicidaMolecula =
      paUpper.includes('CIPROCONAZOL') ||
      paUpper.includes('PICOXISTROBINA') ||
      paUpper.includes('TEBUCONAZOL') ||
      paUpper.includes('AZOXISTROBINA') ||
      paUpper.includes('DIFENOCONAZOL') ||
      paUpper.includes('EPOXICONAZOL') ||
      paUpper.includes('PROTIOCONAZOL') ||
      paUpper.includes('MANCOZEB') ||
      paUpper.includes('CLOROTALONIL') ||
      paUpper.includes('TRIFLOXISTROBINA') ||
      paUpper.includes('PIRACLOSTROBINA') ||
      paUpper.includes('CARBENDAZIM') ||
      paUpper.includes('BOSCALIDA') ||
      paUpper.includes('FLUXAPIROXADE') ||
      paUpper.includes('FOLPET') ||
      paUpper.includes('CAPTANA') ||
      paUpper.includes('CUPRICO') ||
      paUpper.includes('COBRE') ||
      nomeUpper.includes('FOLICRON') ||
      nomeUpper.includes('PRIORI') ||
      nomeUpper.includes('SPHERE') ||
      nomeUpper.includes('NATIVO') ||
      nomeUpper.includes('ELATUS') ||
      nomeUpper.includes('OPERA') ||
      nomeUpper.includes('FOX')

    // Reconhecimento químico determinístico de inseticidas
    const isInseticidaMolecula =
      paUpper.includes('TIAMETOXAM') ||
      paUpper.includes('IMIDACLOPRID') ||
      paUpper.includes('CLORANTRANILIPROLE') ||
      paUpper.includes('ACEFATO') ||
      paUpper.includes('CIPERMETRINA') ||
      paUpper.includes('BIFENTRINA') ||
      paUpper.includes('FIPRONIL') ||
      paUpper.includes('LAMBDA-CIALOTRINA') ||
      paUpper.includes('LUFENURON') ||
      paUpper.includes('ESPINOSADE') ||
      paUpper.includes('THURINGIENSIS')

    // Reconhecimento químico determinístico de herbicidas
    const isHerbicidaMolecula =
      paUpper.includes('GLIFOSATO') ||
      paUpper.includes('GLYPHOSATE') ||
      paUpper.includes('2,4-D') ||
      paUpper.includes('2-4 D') ||
      paUpper.includes('ATRAZINA') ||
      paUpper.includes('DIURON') ||
      paUpper.includes('CLETODIM') ||
      paUpper.includes('HALOXIFOPE') ||
      paUpper.includes('MESOTRIONA') ||
      paUpper.includes('NICOSULFURON') ||
      paUpper.includes('PARAQUAT') ||
      paUpper.includes('DICAMBA') ||
      paUpper.includes('S-METOLACLORO')

    if (subL.includes('INSETICIDA') && subL.includes('ACARICIDA')) {
      subGrupo = 'Inseticida / Acaricida'
    } else if (subL.includes('FUNGICIDA') || isFungicidaMolecula) {
      subGrupo = 'Fungicida'
    } else if (subL.includes('INSETICIDA') || isInseticidaMolecula) {
      subGrupo = 'Inseticida'
    } else if (subL.includes('NEMATICIDA')) {
      subGrupo = 'Nematicida'
    } else if (
      subL.includes('REGULADOR') ||
      paUpper.includes('ETEFOM') ||
      paUpper.includes('PACLOBUTRAZOL')
    ) {
      subGrupo = 'Regulador de Crescimento'
    } else if (subL.includes('ACARICIDA')) {
      subGrupo = 'Acaricida'
    } else if (subL.includes('HERBICIDA') || isHerbicidaMolecula) {
      subGrupo = 'Herbicida'
    } else {
      subGrupo = 'Herbicida'
    }
    categoriaTributaria = 'beneficiado'
  }

  if (inputTipo) tipoProduto = inputTipo as TipoProdutoCanonico
  if (inputMacro) macroGrupo = inputMacro
  if (inputSub && !isAdjuvante && !isTecnico) subGrupo = inputSub

  // 2. Nota de Subposições 2 do Cap. 38 TIPI
  const pertenceNotaSubpos2 = verificarNotaSubpos2(principioAtivoBruto, nomeCompleto)
  const notaSubpos2 = (pertenceNotaSubpos2 ? 'SIM' : 'NÃO') as 'SIM' | 'NÃO'

  // 3. Matriz de Decisão das 4 Faixas de Embalagem (NCM)
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
    // Defensivo comum fora da Nota 2
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

  // NOTA FISCAL CRÍTICA: O input.ncm informado pelo usuário NUNCA deve sobrescrever
  // a determinação canônica do motor químico-aduaneiro. A NCM padrão calculada reflete
  // a molécula/princípio ativo, classe agronômica e faixas da TIPI.

  ncmPadrao = formatarNcmMascara(ncmPadrao)
  ncmFaixa1 = formatarNcmMascara(ncmFaixa1)
  ncmFaixa2 = formatarNcmMascara(ncmFaixa2)
  ncmFaixa3 = formatarNcmMascara(ncmFaixa3)
  ncmFaixa4 = formatarNcmMascara(ncmFaixa4)

  // 4. Motor Tributário Temporal
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
    // Campos de compatibilidade
    nome_produto: marcaPadronizada,
    ncm: ncmPadrao.replace(/\D/g, ''),
    fabricante: titular,
    concentracao: 0,
    unidade_concentracao: '%',
    status_validacao: 'aprovado',
  }
}
