import React, { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  RefreshCw,
  FileText,
  Download,
  ChevronDown,
  ChevronRight,
  Layers,
  HelpCircle,
  XCircle,
  FileCheck2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ModalImportarBulaPdf } from '@/components/ModalImportarBulaPdf'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ScrollableTable } from '@/components/ScrollableTable'
import { toast } from '@/hooks/use-toast'
import { readSpreadsheetFile, type ParsedTable } from '@/lib/importer/csvParser'
import { useAuth } from '@/contexts/AuthContext'
import {
  importarEmLote,
  type ItemErroImportacao,
  type ResultadoImportacaoLote,
} from '@/services/agroService'
import {
  executarMotorCanonicoFrontend,
  formatarNcmMascara,
  sanitizarRegistroMapa,
  sanitizarMarcaComercial,
} from '@/lib/motorCanonico'

interface ZoneConfig {
  id: string
  sheetIndex: number
  sheetKeywords: string[]
  title: string
  subtitle: string
  targetCollection: string
  expectedHeaders: string[]
  sampleDescription: string
}

const DROP_ZONES: ZoneConfig[] = [
  // --- ZONAS DE CADASTRO DE BULA OFICIAL (7 ABAS CONSOLIDADAS) ---
  {
    id: 'bula_mestre',
    sheetIndex: 0,
    sheetKeywords: [
      'cadastro_mestre_1a1',
      'cadastro_mestre',
      'mestre_1a1',
      'bula_produtos',
      'sheet 1',
    ],
    title: 'Bula 1: Cadastro Mestre (1:1)',
    subtitle:
      'Cadastro principal 1:1 do produto formulado, registro MAPA, toxicologia e formulação.',
    targetCollection: 'bula_produtos',
    expectedHeaders: [
      'REGISTRO MAPA',
      'NOME COMERCIAL',
      'MARCA PADRONIZADA',
      'TITULAR REGISTRO',
      'PRINCIPIO ATIVO',
      'CLASSE AGRONOMICA',
      'NCM',
    ],
    sampleDescription: 'Importa o produto principal para a coleção bula_produtos',
  },
  {
    id: 'bula_composicao',
    sheetIndex: 1,
    sheetKeywords: ['composicao_em_linhas', 'composicao', 'bula_composicao', 'sheet 2'],
    title: 'Bula 2: Composição em Linhas',
    subtitle: 'Ingredientes ativos, garantias, CAS e concentração em linhas.',
    targetCollection: 'bula_composicao',
    expectedHeaders: [
      'REGISTRO MAPA',
      'NOME PRODUTO',
      'INGREDIENTE ATIVO',
      'NOME QUIMICO',
      'NUMERO CAS',
      'CONCENTRACAO',
      'UNIDADE MEDIDA',
    ],
    sampleDescription: 'Bloco acessório de composição química vinculado por registro_mapa',
  },
  {
    id: 'bula_empresas',
    sheetIndex: 2,
    sheetKeywords: [
      'cadeia_empresas_linhas',
      'cadeia_empresas',
      'empresas',
      'bula_empresas',
      'sheet 3',
    ],
    title: 'Bula 3: Cadeia de Empresas',
    subtitle: 'Cadeia de empresas (titular, formulador, manipulador, importador).',
    targetCollection: 'bula_empresas',
    expectedHeaders: [
      'REGISTRO MAPA',
      'NOME PRODUTO',
      'TIPO RELACAO',
      'RAZAO SOCIAL',
      'CNPJ',
      'ENDERECO',
      'UF',
    ],
    sampleDescription: 'Bloco acessório da cadeia produtiva e corporativa da bula',
  },
  {
    id: 'bula_embalagens',
    sheetIndex: 3,
    sheetKeywords: [
      'embalagens_ncm_linhas',
      'embalagens_ncm',
      'embalagens',
      'bula_embalagens',
      'sheet 4',
    ],
    title: 'Bula 4: Embalagens × NCM',
    subtitle: 'Especificação técnica de recipientes, capacidades, materiais e NCM.',
    targetCollection: 'bula_embalagens',
    expectedHeaders: [
      'REGISTRO MAPA',
      'NOME PRODUTO',
      'TIPO EMBALAGEM',
      'MATERIAL',
      'CAPACIDADE',
      'NCM',
    ],
    sampleDescription: 'Bloco acessório de embalagens autorizadas e enquadramento fiscal',
  },
  {
    id: 'bula_culturas',
    sheetIndex: 4,
    sheetKeywords: [
      'culturas_carencia_linhas',
      'culturas_carencia',
      'culturas',
      'bula_culturas',
      'sheet 5',
    ],
    title: 'Bula 5: Culturas e Carência',
    subtitle: 'Culturas autorizadas, período de carência (intervalo de segurança) e reentrada.',
    targetCollection: 'bula_culturas',
    expectedHeaders: [
      'REGISTRO MAPA',
      'NOME PRODUTO',
      'CULTURA',
      'INTERVALO SEGURANCA DIAS',
      'MODALIDADE EMPREGO',
    ],
    sampleDescription: 'Bloco acessório agronômico de culturas e prazos de carência',
  },
  {
    id: 'bula_alvos',
    sheetIndex: 5,
    sheetKeywords: [
      'alvos_e_doses_linhas',
      'alvos_e_doses',
      'alvos',
      'doses',
      'bula_alvos',
      'sheet 6',
    ],
    title: 'Bula 6: Alvos e Doses',
    subtitle:
      'Alvos biológicos (pragas, doenças, plantas daninhas), doses recomendadas e volume de calda.',
    targetCollection: 'bula_alvos',
    expectedHeaders: [
      'REGISTRO MAPA',
      'CULTURA',
      'ALVO BIOLOGICO',
      'DOSE MINIMA',
      'DOSE MAXIMA',
      'UNIDADE DOSE',
    ],
    sampleDescription: 'Bloco acessório de eficácia agronômica, pragas e dosagens',
  },
  {
    id: 'bula_aplicacao',
    sheetIndex: 6,
    sheetKeywords: [
      'aplicacao_e_epi_linhas',
      'aplicacao_e_epi',
      'aplicacao',
      'epi',
      'bula_aplicacao',
      'sheet 7',
    ],
    title: 'Bula 7: Aplicação e EPI',
    subtitle:
      'Instruções de tecnologia de aplicação, condições meteorológicas, EPI e primeiros socorros.',
    targetCollection: 'bula_aplicacao',
    expectedHeaders: [
      'REGISTRO MAPA',
      'NOME PRODUTO',
      'TIPO APLICACAO',
      'EQUIPAMENTO RECOMENDADO',
      'EPI APLICACAO',
    ],
    sampleDescription: 'Bloco acessório de segurança operacional, receituário e EPI',
  },

  // --- BASES HISTÓRICAS E FISCAIS (BASE MESTRE, TIPI, PRINCÍPIOS ATIVOS) ---
  {
    id: 'base_mestre',
    sheetIndex: 3,
    sheetKeywords: ['base mestre', '845', 'catalogo', 'mestre'],
    title: 'Base Mestre de Produtos',
    subtitle: 'Catálogo mestre consolidado de produtos e compliance fiscal.',
    targetCollection: 'base_mestre',
    expectedHeaders: [
      'CÓDIGO',
      'DESCRIÇÃO',
      'NCM OFICIAL EXATA',
      'EMBALAGEM DETECTADA',
      'PA OFICIAL CORRETO',
      'MAPA OFICIAL LIMPO',
      'FABRICANTE',
    ],
    sampleDescription: 'Popula o catálogo geral de 28 campos da base_mestre',
  },
  {
    id: 'principios',
    sheetIndex: 2,
    sheetKeywords: ['dicionario', 'principios', 'ativos', 'moleculas'],
    title: 'Dicionário Princípios Ativos',
    subtitle: 'Matriz canônica de 13 campos de ingredientes ativos e regras TIPI.',
    targetCollection: 'dicionario_principios_ativos',
    expectedHeaders: [
      'PRINCIPIO ATIVO',
      'CLASSE',
      'GRUPO QUIMICO',
      'CONCENTRACAO MIN',
      'CONCENTRACAO MAX',
      'UNIDADE',
    ],
    sampleDescription: 'Popula as regras determinísticas de moléculas da matriz',
  },
  {
    id: 'regras',
    sheetIndex: 1,
    sheetKeywords: ['regras', 'ncm', 'tipi'],
    title: 'Regras NCM × Embalagem',
    subtitle: 'Matriz regulamentar de NCMs, descrições TIPI e embalagens permitidas.',
    targetCollection: 'regras_ncm_embalagem',
    expectedHeaders: ['NCM', 'DESCRICAO', 'EMBALAGENS PERMITIDAS'],
    sampleDescription: 'Popula as travas 1 e 2 de conformidade por classificação fiscal',
  },
]

// Normalização de strings para comparação e busca flexível
export const normalize = (str: string) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')

// Helper para obter valor de uma coluna por palavras-chave com prioridade de exatidão
export function getFieldValue(row: Record<string, string>, targetAliases: string[]): string {
  const rowEntries = Object.entries(row)

  // 1ª passada: match exato no nome normalizado
  for (const alias of targetAliases) {
    const normAlias = normalize(alias)
    for (const [key, val] of rowEntries) {
      if (normalize(key) === normAlias && val !== undefined && val !== null) {
        return String(val).trim()
      }
    }
  }

  // 2ª passada: se o nome normalizado da coluna começa com o alias
  for (const alias of targetAliases) {
    const normAlias = normalize(alias)
    for (const [key, val] of rowEntries) {
      const normKey = normalize(key)
      if (normKey.startsWith(normAlias) && val !== undefined && val !== null) {
        return String(val).trim()
      }
    }
  }

  // 3ª passada: substring match
  for (const alias of targetAliases) {
    const normAlias = normalize(alias)
    for (const [key, val] of rowEntries) {
      const normKey = normalize(key)
      if (normKey.includes(normAlias) && val !== undefined && val !== null) {
        return String(val).trim()
      }
    }
  }

  return ''
}

// Limpeza e coerção de NCM: retira pontuação e completa 8 dígitos se veio com zeros omitidos
export function cleanNcm(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  // Se veio por exemplo como número "38086100" ou com 7 dígitos porque o zero à esquerda caiu
  if (digits.length >= 7 && digits.length <= 8) {
    return digits.padStart(8, '0')
  }
  return digits
}

// Coerção numérica brasileira e internacional (trata '12,5', '12.5', '1.200,50')
export function cleanNumber(raw: string): number {
  if (!raw) return 0
  let str = String(raw).trim()
  if (!str) return 0

  // Se possui vírgula e ponto (ex: 1.250,50)
  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else if (str.includes(',')) {
    // Apenas vírgula decimal (ex: 12,50)
    str = str.replace(',', '.')
  }

  // Limpar caracteres não numéricos exceto ponto e sinal negativo
  const cleaned = str.replace(/[^\d.-]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

export function Importar() {
  const { isAdmin } = useAuth()
  const [activeZone, setActiveZone] = useState<ZoneConfig>(DROP_ZONES[0]) // Aba Bula 1: Cadastro Mestre selecionada por padrão
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [availableSheets, setAvailableSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [parsedData, setParsedData] = useState<ParsedTable | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Status de importação
  const [importing, setImporting] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [importSummary, setImportSummary] = useState<ResultadoImportacaoLote | null>(null)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null)
  const [expandedErrorRow, setExpandedErrorRow] = useState<number | null>(null)

  // Modal Importação de Bula (PDF)
  const [modalPdfOpen, setModalPdfOpen] = useState<boolean>(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSelectZone = (zone: ZoneConfig) => {
    setActiveZone(zone)
    setValidationError(null)
    setImportSummary(null)
    setProgress(0)

    // Se já houver um arquivo XLSX aberto com múltiplas abas, troca para a aba correspondente
    if (selectedFile && availableSheets.length > 0) {
      carregarArquivo(selectedFile, zone.sheetIndex)
    }
  }

  const carregarArquivo = async (file: File, sheetIndexOrName?: number | string) => {
    setFileName(file.name)
    setSelectedFile(file)
    setValidationError(null)
    setImportSummary(null)
    setProgress(0)

    try {
      const targetSheet = sheetIndexOrName !== undefined ? sheetIndexOrName : activeZone.sheetIndex
      const table = await readSpreadsheetFile(file, targetSheet)

      if (table.sheetNames && table.sheetNames.length > 0) {
        setAvailableSheets(table.sheetNames)
        const sheetEfetiva = table.sheetName || table.sheetNames[0]
        setSelectedSheet(sheetEfetiva)

        // Se o usuário estiver subindo um arquivo e a aba encontrada corresponder a outra DropZone,
        // sincroniza a DropZone ativa automaticamente para maior comodidade
        const matchingZone = DROP_ZONES.find((z) => {
          const normS = normalize(sheetEfetiva)
          return z.sheetKeywords.some((k) => normS.includes(normalize(k)))
        })
        if (matchingZone && matchingZone.id !== activeZone.id) {
          setActiveZone(matchingZone)
        }
      }

      if (table.headers.length === 0 || table.rows.length === 0) {
        throw new Error('A planilha selecionada está vazia ou não possui linhas de dados válidas.')
      }

      setParsedData(table)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar arquivo.'
      setValidationError(msg)
      setParsedData(null)
    }
  }

  const handleFileChange = async (file: File) => {
    await carregarArquivo(file, activeZone.sheetIndex)
  }

  const handleSheetChange = async (newSheetName: string) => {
    if (!selectedFile) return
    setSelectedSheet(newSheetName)
    await carregarArquivo(selectedFile, newSheetName)
  }

  // Prepara e valida os registros antes de enviar ao banco
  const processarLinhasParaImportacao = () => {
    if (!parsedData || parsedData.rows.length === 0) return { validos: [], rejeitados: [] }

    const targetCol = activeZone.targetCollection
    const validos: { data: Record<string, unknown>; originalLine?: number }[] = []
    const rejeitados: ItemErroImportacao[] = []

    parsedData.rows.forEach((row, idx) => {
      const originalLineNum = parsedData.rowIndices?.[idx] ?? idx + 2 // +2 considerando header linha 1 no Excel

      // ------------------------------------------------------------------
      // ZONA 4 ou ZONA 1: base_mestre
      // ------------------------------------------------------------------
      if (targetCol === 'base_mestre') {
        // Prioridade de colunas para mapeamento exato da Aba 4 e Aba 1:
        // Código: 'codigo', 'cod', 'codigo_produto', 'id'
        // Descrição -> nome_produto: 'descricao', 'nome_produto', 'nome_do_produto', 'produto', 'item'
        // NCM Oficial Exata -> ncm: 'ncm_oficial_exata', 'ncm_exata', 'ncm_oficial', 'ncm', 'classificacao_fiscal'
        // Embalagem Detectada -> embalagem: 'embalagem_detectada', 'embalagem', 'tipo_embalagem', 'emb', 'recipiente'
        // PA Oficial Correto -> principio_ativo: 'pa_oficial_correto', 'pa_oficial', 'principio_ativo', 'principio_ativo_composicao_chave', 'pa'
        // MAPA Oficial Limpo -> registro_mapa: 'mapa_oficial_limpo', 'mapa_oficial', 'registro_mapa', 'codigo_mapa', 'mapa', 'sipeagro', 'agrofit'
        // Fabricante -> fabricante: 'fabricante', 'empresa', 'titular', 'marca', 'fornecedor'
        // Peso/Vol Unit -> concentracao/unidade: 'peso_vol_unit_kg_l', 'peso_vol_unit', 'peso_vol', 'concentracao', 'volume', 'peso'
        // Unidade: 'unid_embalagem', 'unidade_concentracao', 'unid_erp', 'unidade', 'unid'

        const codigo = getFieldValue(row, ['codigo', 'cod', 'codigo_produto', 'id'])
        const rawNome = getFieldValue(row, [
          'descricao',
          'descricao_produto',
          'nome_produto',
          'nome produto',
          'produto',
          'item',
          'nome',
        ])
        const rawNcm = getFieldValue(row, [
          'ncm_oficial_exata',
          'ncm exata',
          'ncm_oficial',
          'ncm',
          'classificacao_fiscal',
        ])
        const ncmLimpo = cleanNcm(rawNcm)
        const emb = getFieldValue(row, [
          'embalagem_detectada',
          'embalagem detectada',
          'embalagem',
          'tipo_embalagem',
          'emb',
          'recipiente',
        ])
        const pa = getFieldValue(row, [
          'pa_oficial_correto',
          'pa oficial correto',
          'pa_oficial',
          'principio_ativo',
          'principio ativo',
          'pa',
          'ingrediente',
          'molecula',
        ])
        const fab = getFieldValue(row, ['fabricante', 'empresa', 'titular', 'marca', 'fornecedor'])
        const mapa = getFieldValue(row, [
          'mapa_oficial_limpo',
          'mapa oficial limpo',
          'mapa_oficial',
          'registro_mapa',
          'registro mapa',
          'codigo_mapa',
          'mapa',
          'sipeagro',
          'agrofit',
        ])
        const pesoVol = cleanNumber(
          getFieldValue(row, [
            'peso_vol_unit_kg_l',
            'peso_vol_unit',
            'peso_vol',
            'concentracao',
            'teor',
            'volume',
            'peso',
          ]),
        )
        const unid =
          getFieldValue(row, [
            'unid_embalagem',
            'unidade_concentracao',
            'unid_erp',
            'unidade',
            'unid',
          ]) || 'L'

        // 1. REJEITAR LINHAS DE CABEÇALHOS OU INFORMAÇÕES GERAIS
        const allText = Object.values(row).join(' ').trim()
        const lowerAll = allText.toLowerCase()

        if (
          lowerAll.includes('como usar:') ||
          lowerAll.includes('produtos em valida') ||
          lowerAll.includes('total de produtos') ||
          lowerAll.includes('regras oficiais da tipi') ||
          lowerAll.includes('resumo quantitativo') ||
          lowerAll.includes('relação nominal') ||
          lowerAll.includes('relacao nominal') ||
          lowerAll.includes('categoria de divergência') ||
          lowerAll.includes('categoria de divergencia')
        ) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: 'Linha de instruções, notas ou cabeçalho informativo ignorada.',
            categoria: 'Linha Informativa / Cabeçalho',
            campo: 'Linha',
            valor: allText.slice(0, 60),
            dados: row,
          })
          return
        }

        // 2. REJEITAR SE O NOME DO PRODUTO FOR NÚMERO PURO (ex: "1", "2", contadores de linha ou índice)
        const trimmedNome = rawNome.trim()
        const isNumericNome = /^\d+$/.test(trimmedNome)

        if (!trimmedNome || isNumericNome) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: isNumericNome
              ? `Descrição "${trimmedNome}" é numérica (número de linha/índice). Nome de produto válido é obrigatório.`
              : 'Linha sem Descrição ou Nome do Produto.',
            categoria: isNumericNome
              ? 'Descrição Numérica (Linha de Tabela)'
              : 'Nome/Descrição Ausente',
            campo: 'Descricao',
            valor: trimmedNome,
            dados: row,
          })
          return
        }

        // Se o nome_produto for exatamente "Código", "Codigo", "Produto", etc. (cabeçalho repetido no meio)
        if (
          ['codigo', 'código', 'descricao', 'descrição', 'produto', 'item'].includes(
            normalize(trimmedNome),
          )
        ) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: `Linha de cabeçalho duplicada no corpo da planilha ("${trimmedNome}").`,
            categoria: 'Cabeçalho Duplicado',
            campo: 'Descricao',
            valor: trimmedNome,
            dados: row,
          })
          return
        }

        // 3. REJEITAR OU LIMPAR SE CAMPOS DE DADOS RECEBERAM TEXTO DE NOTA TIPI OU INSTRUÇÃO
        const isTextoTipi = (s: string) => {
          const l = s.toLowerCase()
          return (
            l.includes('posição 38.08 tipi') ||
            l.includes('posicao 38.08 tipi') ||
            l.includes('nota 2 seção vi tipi') ||
            l.includes('nota 2 secao vi tipi') ||
            l.includes('cap. 31 tipi') ||
            l.includes('cap. 25 tipi') ||
            l.includes('regra geral tipi') ||
            l.includes('nota subpos.') ||
            l.includes('sc cosit')
          )
        }

        const isTextoInstrucaoMapa = (s: string) => {
          const l = s.toLowerCase()
          return (
            l.includes('registro numérico agrofit obrigatório') ||
            l.includes('registro numerico agrofit obrigatorio') ||
            l.includes('registro sipeagro obrigatório') ||
            l.includes('registro sipeagro obrigatorio') ||
            l.includes('vincular registro da marca comercial')
          )
        }

        // Se a embalagem ou registro MAPA contiver nota TIPI/instrução pura
        let embalagemLimpa = emb.trim()
        if (isTextoTipi(embalagemLimpa)) {
          embalagemLimpa = 'Padrão'
        }

        let mapaLimpo = mapa.trim()
        if (isTextoInstrucaoMapa(mapaLimpo) || isTextoTipi(mapaLimpo)) {
          mapaLimpo = ''
        }

        // Se o princípio ativo contiver nota TIPI
        let paLimpo = pa.trim()
        if (isTextoTipi(paLimpo)) {
          paLimpo = 'Não Informado'
        }

        // Fabricante: extraído da coluna Fabricante; onde a planilha não traz, gravar "Não Informado"
        // Higienização defensiva preventiva para o limite de 500 caracteres
        let fabLimpo = fab.trim() || 'Não Informado'
        if (fabLimpo.length > 500) {
          fabLimpo = fabLimpo.slice(0, 500)
        }

        // 4. VALIDAÇÃO E DEDUÇÃO DETERMINÍSTICA DE NCM
        let ncmEfetivo = ncmLimpo

        // Se o NCM estiver ausente, tentar dedução pelo motor determinístico se houver princípio ativo / indícios
        if (!ncmEfetivo) {
          const canonicoPrevio = executarMotorCanonicoFrontend({
            nome_completo: trimmedNome,
            embalagem: embalagemLimpa || '1X20L (20 L)',
            unidade: unid || 'L',
            principio_ativo: paLimpo || trimmedNome,
            registro_mapa: mapaLimpo,
            titular_fabricante: fabLimpo,
            origem_base: 'PLANILHA_IMPORTACAO',
          })

          const deduzidoDigits = canonicoPrevio.ncm_padrao
            ? canonicoPrevio.ncm_padrao.replace(/\D/g, '')
            : ''

          if (deduzidoDigits && deduzidoDigits.length === 8 && deduzidoDigits !== '38089999') {
            ncmEfetivo = deduzidoDigits
          } else {
            rejeitados.push({
              linhaOriginal: originalLineNum,
              linhaLote: idx + 1,
              motivo: 'NCM obrigatório ausente.',
              categoria: 'NCM Ausente',
              campo: 'NCM',
              valor: rawNcm || 'vazio',
              dados: row,
            })
            return
          }
        }

        if (ncmEfetivo.length !== 8) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: `NCM "${ncmEfetivo}" possui ${ncmEfetivo.length} dígitos. O padrão TIPI exige 8 dígitos numéricos.`,
            categoria: 'NCM com Dígitos Inválidos',
            campo: 'NCM',
            valor: ncmEfetivo,
            dados: row,
          })
          return
        }

        // Executar Motor Químico-Aduaneiro e Tributário Determinístico para gerar os 28 campos
        const canonico = executarMotorCanonicoFrontend({
          nome_completo: trimmedNome,
          embalagem: embalagemLimpa || '1X20L (20 L)',
          unidade: unid || 'L',
          principio_ativo: paLimpo || trimmedNome,
          registro_mapa: mapaLimpo,
          titular_fabricante: fabLimpo,
          ncm_padrao: ncmEfetivo,
          origem_base: 'PLANILHA_IMPORTACAO',
        })

        validos.push({
          originalLine: originalLineNum,
          data: {
            // 28 Campos Canônicos
            nome_completo: canonico.nome_completo,
            marca_padronizada: canonico.marca_padronizada,
            tipo_produto: canonico.tipo_produto,
            embalagem: canonico.embalagem,
            unidade: canonico.unidade,
            principio_ativo: canonico.principio_ativo,
            macro_grupo: canonico.macro_grupo,
            sub_grupo: canonico.sub_grupo,
            nota_subpos_2: canonico.nota_subpos_2,
            ncm_padrao: canonico.ncm_padrao,
            ncm_faixa1_ate_300g: canonico.ncm_faixa1_ate_300g,
            ncm_faixa2_300g_a_7_5kg: canonico.ncm_faixa2_300g_a_7_5kg,
            ncm_faixa3_7_5kg_a_10kg: canonico.ncm_faixa3_7_5kg_a_10kg,
            ncm_faixa4_acima_10kg: canonico.ncm_faixa4_acima_10kg,
            regra_tipi: canonico.regra_tipi,
            registro_mapa: canonico.registro_mapa,
            sistema_norma_mapa: canonico.sistema_norma_mapa,
            titular_fabricante: canonico.titular_fabricante,
            origem_base: canonico.origem_base,
            status_pis_cofins: canonico.status_pis_cofins,
            aliquota_ate_mar2026: canonico.aliquota_ate_mar2026,
            aliquota_pos_abr2026_real: canonico.aliquota_pos_abr2026_real,
            aliquota_pos_abr2026_presumido: canonico.aliquota_pos_abr2026_presumido,
            cst_saida: canonico.cst_saida,
            cst_entrada: canonico.cst_entrada,
            ibs_cbs_2027: canonico.ibs_cbs_2027,
            url_oficial: canonico.url_oficial,

            // Compatibilidade com campos antigos
            nome_produto: canonico.marca_padronizada,
            ncm: canonico.ncm_padrao.replace(/\D/g, ''),
            fabricante: canonico.titular_fabricante,
            concentracao: pesoVol,
            unidade_concentracao: unid,
            status_validacao: 'aprovado',
          },
        })
      }

      // ------------------------------------------------------------------
      // ZONA 2: regras_ncm_embalagem
      // ------------------------------------------------------------------
      else if (targetCol === 'regras_ncm_embalagem') {
        // Obter valores brutos das colunas da aba 2
        const rawNcm = getFieldValue(row, [
          'ncm_obrigatoria',
          'ncm obrigatoria',
          'ncm_oficial',
          'codigo_ncm',
          'ncm',
          'classificacao_fiscal',
          'classificacao',
        ])
        const rawRegraId = getFieldValue(row, ['regra_id', 'regra', 'id_regra', 'item', 'codigo'])
        const desc = getFieldValue(row, [
          'escopo_quimico_agronomico',
          'escopo quimico',
          'descricao_fiscal',
          'descricao',
          'escopo',
          'especificacao',
        ])
        const condicaoEmb = getFieldValue(row, [
          'condicao_da_embalagem_unitaria_descrita',
          'condicao_embalagem',
          'embalagens_permitidas',
          'embalagens permitidas',
          'embalagem_permitida',
          'embalagens',
          'embalagem',
        ])
        const dispositivo = getFieldValue(row, [
          'dispositivo_legal_tipi_rfb',
          'dispositivo_legal',
          'dispositivo',
          'fundamentacao_legal',
          'base_legal',
          'regra_especial',
          'observacao',
          'obs',
        ])

        // Checar se a linha é cabeçalho de seção (ex: "1. REGRAS OFICIAIS...", "2. RESUMO...") ou instrução
        const allText = Object.values(row).join(' ').trim()
        const isSectionHeader =
          allText.length > 50 &&
          (allText.includes('REGRAS OFICIAIS DA TIPI') ||
            allText.includes('RESUMO QUANTITATIVO') ||
            allText.includes('RELAÇÃO NOMINAL') ||
            allText.includes('RELACAO NOMINAL') ||
            allText.includes('Fundamentação Legal') ||
            allText.includes('Fundamentacao Legal') ||
            allText.includes('Nota de Subposições'))

        if (isSectionHeader) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: 'Linha de cabeçalho de seção ou notas explicativas ignorada.',
            categoria: 'Cabeçalho / Seção Informativa',
            campo: 'Seção',
            valor: allText.slice(0, 80),
            dados: row,
          })
          return
        }

        // Tentar extrair NCM limpo
        const ncmLimpo = cleanNcm(rawNcm)

        // Se o NCM não for válido (deve ter 8 dígitos na TIPI)
        if (!ncmLimpo || ncmLimpo.length !== 8) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: ncmLimpo
              ? `Código NCM "${ncmLimpo}" possui ${ncmLimpo.length} dígitos. O padrão TIPI exige 8 dígitos numéricos.`
              : 'NCM obrigatório ausente ou inválido.',
            categoria: 'NCM Inválido ou Ausente',
            campo: 'NCM',
            valor: rawNcm || 'vazio',
            dados: row,
          })
          return
        }

        // Processar embalagens permitidas: pode vir como "Saco, Tambor", "Bombona / Frasco"
        let embArr: string[] = []
        if (condicaoEmb) {
          embArr = condicaoEmb
            .split(/[,;/|\n]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        }

        const regraCompleta = [rawRegraId ? `[${rawRegraId}]` : '', dispositivo || '']
          .filter(Boolean)
          .join(' ')
          .trim()

        validos.push({
          originalLine: originalLineNum,
          data: {
            ncm: ncmLimpo,
            descricao: desc || `NCM ${ncmLimpo}`,
            embalagens_permitidas: embArr,
            regra_especial: regraCompleta || undefined,
          },
        })
      }

      // ------------------------------------------------------------------
      // ZONA 3: dicionario_principios_ativos
      // ------------------------------------------------------------------
      else if (targetCol === 'dicionario_principios_ativos') {
        // Mapeamento Canônico dos 13 Campos da Aba 3 / Matriz (Matriz de Princípios Ativos v2.5.0)
        const paChave = getFieldValue(row, [
          'principio_ativo_chave',
          'principio_ativo',
          'princípio ativo',
          'princípio ativo / composição / garantia',
          'ingrediente ativo',
          'molecula',
          'ativo',
        ])
        const macroSub = getFieldValue(row, [
          'macro_grupo_subgrupo_padrao',
          'macro-grupo e sub-grupo padrão',
          'macro_grupo_e_sub_grupo_oficial',
          'macro_grupo',
          'classe',
        ])
        const nota2Raw = getFieldValue(row, [
          'nota_subpos_2',
          'nota subpos. 2 cap. 38?',
          'nota 2',
          'subpos 2',
        ])
        const ncmRef = getFieldValue(row, [
          'ncm_padrao_referencia',
          'ncm padrão (> 10kg/l)',
          'ncm_padrao',
          'ncm',
        ])
        const ncmF1 = getFieldValue(row, [
          'ncm_faixa1_ate_300g',
          'ncm faixa 1 (≤ 300g/ml)',
          'ncm_f1',
          'faixa 1',
        ])
        const ncmF2 = getFieldValue(row, [
          'ncm_faixa2_300g_a_7_5kg',
          'ncm faixa 2 (300g a 7,5kg/l)',
          'ncm_f2',
          'faixa 2',
        ])
        const ncmF3 = getFieldValue(row, [
          'ncm_faixa3_7_5kg_a_10kg',
          'ncm faixa 3 (7,5kg a 10kg/l)',
          'ncm_f3',
          'faixa 3',
        ])
        const ncmF4 = getFieldValue(row, [
          'ncm_faixa4_acima_10kg',
          'ncm faixa 4 (> 10kg/l)',
          'ncm_f4',
          'faixa 4',
        ])
        const ncmGranel = getFieldValue(row, [
          'ncm_granel_tecnico',
          'ncm granel / produto técnico',
          'ncm_granel',
          'granel',
        ])
        const regraTipi = getFieldValue(row, [
          'regra_tipi_embalagem',
          'regra de embalagem tipi',
          'regra_tipi',
          'fundamentacao tipi',
        ])
        const sisMapa = getFieldValue(row, [
          'sistema_registro_mapa',
          'sistema de registro mapa',
          'norma mapa',
          'regra_tipo_de_registro_mapa',
        ])
        const pisCofins = getFieldValue(row, [
          'enquadramento_pis_cofins',
          'enquadramento pis/cofins',
          'enquadramento pis / cofins',
          'status_pis_cofins',
          'pis_cofins',
        ])
        const cstRec = getFieldValue(row, [
          'cst_recomendado',
          'cst recomendado (saída / entrada)',
          'cst recomendado (saida / entrada)',
          'cst recomendado',
          'cst',
        ])
        const classeVal = getFieldValue(row, [
          'classe',
          'classe_agronomica',
          'classe agronomica',
          'sub_grupo',
          'subgrupo',
        ])
        const statusVal = getFieldValue(row, ['status', 'situacao', 'ativo'])
        const unidadeVal = getFieldValue(row, ['unidade', 'und', 'uom'])
        const grupoQuimicoVal = getFieldValue(row, ['grupo_quimico', 'grupo quimico'])

        // Checar linhas de cabeçalho explicativo ou instrução no corpo da planilha
        const allText = Object.values(row).join(' ').trim()
        const lowerAll = allText.toLowerCase()
        if (
          lowerAll.includes('como usar:') ||
          lowerAll.includes('regras oficiais da tipi') ||
          lowerAll.includes('resumo quantitativo') ||
          lowerAll.includes('relação nominal') ||
          lowerAll.includes('relacao nominal')
        ) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: 'Linha de notas ou instruções informativas ignorada.',
            categoria: 'Linha Informativa / Cabeçalho',
            campo: 'Linha',
            valor: allText.slice(0, 60),
            dados: row,
          })
          return
        }

        if (!paChave || /^\d+$/.test(paChave.trim())) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: /^\d+$/.test(paChave.trim())
              ? `Chave de Princípio Ativo "${paChave}" é numérica (índice/linha). Nome químico ou ingrediente ativo é obrigatório.`
              : 'Nome do princípio ativo / chave canônica obrigatório ausente.',
            categoria: /^\d+$/.test(paChave.trim())
              ? 'Chave Numérica (Linha de Tabela)'
              : 'Princípio Ativo Ausente',
            campo: 'Principio Ativo',
            valor: paChave || 'vazio',
            dados: row,
          })
          return
        }

        // Se for repetição de cabeçalho
        if (
          ['principioativo', 'principio_ativo', 'ingredienteativo', 'molecula', 'ativo'].includes(
            normalize(paChave),
          )
        ) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: `Linha de cabeçalho duplicada ("${paChave}") identificada no corpo da planilha.`,
            categoria: 'Cabeçalho Duplicado',
            campo: 'Principio Ativo',
            valor: paChave,
            dados: row,
          })
          return
        }

        const chaveUpper = paChave.trim().toUpperCase()

        // Normalização flexível e robusta de nota_subpos_2: aceita "S", "Sim", "SIM", "true", "1"
        const nota2StrUpper = String(nota2Raw || '')
          .trim()
          .toUpperCase()
        const nota2Norm =
          nota2StrUpper === 'SIM' ||
          nota2StrUpper === 'S' ||
          nota2StrUpper === 'TRUE' ||
          nota2StrUpper === '1' ||
          nota2StrUpper.startsWith('SIM')
            ? 'SIM'
            : 'NÃO'

        const ncmPadraoNorm = cleanNcm(ncmRef)
          ? formatarNcmMascara(cleanNcm(ncmRef))
          : nota2Norm === 'SIM'
            ? '3808.62.90'
            : '3808.93.29'
        const ncmF1Norm = cleanNcm(ncmF1)
          ? formatarNcmMascara(cleanNcm(ncmF1))
          : nota2Norm === 'SIM'
            ? '3808.61.00'
            : ncmPadraoNorm
        const ncmF2Norm = cleanNcm(ncmF2) ? formatarNcmMascara(cleanNcm(ncmF2)) : ncmPadraoNorm
        const ncmF3Norm = cleanNcm(ncmF3) ? formatarNcmMascara(cleanNcm(ncmF3)) : ncmPadraoNorm
        const ncmF4Norm = cleanNcm(ncmF4) ? formatarNcmMascara(cleanNcm(ncmF4)) : ncmPadraoNorm
        const ncmGranelNorm = cleanNcm(ncmGranel)
          ? formatarNcmMascara(cleanNcm(ncmGranel))
          : nota2Norm === 'SIM'
            ? '3808.69.90'
            : '3808.93.19'

        validos.push({
          originalLine: originalLineNum,
          data: {
            principio_ativo_chave: chaveUpper,
            macro_grupo_subgrupo_padrao: macroSub || 'Defensivos — Herbicida',
            nota_subpos_2: nota2Norm,
            ncm_padrao_referencia: ncmPadraoNorm,
            ncm_faixa1_ate_300g: ncmF1Norm,
            ncm_faixa2_300g_a_7_5kg: ncmF2Norm,
            ncm_faixa3_7_5kg_a_10kg: ncmF3Norm,
            ncm_faixa4_acima_10kg: ncmF4Norm,
            ncm_granel_tecnico: ncmGranelNorm,
            regra_tipi_embalagem:
              regraTipi ||
              (nota2Norm === 'SIM' ? 'Nota de Subposições 2 Cap. 38 TIPI' : 'Posição 38.08 TIPI'),
            sistema_registro_mapa:
              sisMapa || 'AGROFIT/MAPA — Produto Formulado (Lei nº 14.785/2023)',
            enquadramento_pis_cofins:
              pisCofins || 'Beneficiado (Lei 10.925/04): 0% até Mar/26 | 0,925% Real pós-Abr/26',
            cst_recomendado: cstRec || 'Saída: CST 06 (c/ Ajuste M220/M620) | Entrada: CST 73',
            // Legado
            principio_ativo: chaveUpper,
            classe:
              classeVal ||
              (macroSub.includes('—')
                ? macroSub.split('—')[1].trim()
                : macroSub.includes('-')
                  ? macroSub.split('-')[1].trim()
                  : 'Defensivos'),
            grupo_quimico: grupoQuimicoVal || 'Importação Aba 3 Matriz',
            concentracao_min: 0,
            concentracao_max: 0,
            unidade: unidadeVal || '%',
            status: statusVal || 'Ativo',
          },
        })
      }

      // ------------------------------------------------------------------
      // BULA 1: bula_produtos (Cadastro Mestre 1:1 da Bula)
      // Ingestão na íntegra: SEM NENHUM FILTRO DE VALIDAÇÃO OU RECUSA
      // Cada linha/SKU vira um registro individual identificado por ID Produto / SKU + Registro MAPA
      // ------------------------------------------------------------------
      else if (targetCol === 'bula_produtos') {
        const codigo = getFieldValue(row, [
          'id_produto',
          'id produto',
          'id_prod',
          'id',
          'codigo',
          'cod',
          'codigo_produto',
          'sku',
        ])
        const mapa = getFieldValue(row, [
          'registro_mapa',
          'numero_registro_mapa',
          'no_registro_mapa',
          'n_registro_mapa',
          'registro_no_mapa',
          'numero_mapa',
          'codigo_mapa',
          'nr_registro',
          'mapa',
          'registro',
          'mapa_oficial_limpo',
        ])
        const nome = getFieldValue(row, [
          'nome_comercial_completo_sku_base',
          'nome_comercial_completo',
          'nome_comercial',
          'marca_comercial',
          'nome_produto',
          'produto',
          'sku_base',
          'descricao',
          'nome',
        ])
        const marcaPad = getFieldValue(row, [
          'marca_comercial_padronizada',
          'marca_padronizada',
          'marca',
        ])
        const titular = getFieldValue(row, [
          'titular_registro',
          'titular_do_registro',
          'titular',
          'empresa_titular',
          'empresa',
          'fabricante',
          'razao_social',
        ])
        const fab = getFieldValue(row, [
          'fabricante_formulador',
          'fabricante_e_formulador',
          'formulador',
          'fabricante',
        ])
        const pa = getFieldValue(row, [
          'principio_ativo',
          'ingrediente_ativo',
          'substancia_ativa',
          'ativo',
          'molecula',
          'substancia_principio_ativo',
          'substancia_principio_ativo_garantia',
          'pa_oficial_correto',
          'pa_oficial',
        ])
        const paOficialCorreto = getFieldValue(row, ['pa_oficial_correto', 'pa_oficial'])
        const mapaOficialLimpo = getFieldValue(row, ['mapa_oficial_limpo', 'mapa_limpo'])
        const embalagemVal = getFieldValue(row, ['embalagem', 'embalagem_detectada'])
        const ncmOficialExata = getFieldValue(row, ['ncm_oficial_exata', 'ncm_exata'])
        const urlOficialVal = getFieldValue(row, ['url_oficial', 'url', 'link'])
        const macroGrupoVal = getFieldValue(row, [
          'macro_grupo_agronomico',
          'macro_grupo',
          'macro_grupo_subgrupo',
        ])
        const subGrupoVal = getFieldValue(row, ['sub_grupo', 'subgrupo'])
        const notaSubpos2Val = getFieldValue(row, ['nota_subpos_2', 'nota_subpos2', 'subpos_2'])
        const regraTipiVal = getFieldValue(row, ['regra_tipi', 'regra_tipi_embalagem'])
        const classe = getFieldValue(row, ['classe_agronomica', 'classe', 'sub_grupo', 'funcao'])
        const grupoQ = getFieldValue(row, ['grupo_quimico', 'grupo'])
        const tox = getFieldValue(row, [
          'classificacao_toxicologica',
          'toxicologia',
          'classe_tox',
          'toxicidade',
        ])
        const amb = getFieldValue(row, [
          'classificacao_ambiental',
          'ambiental',
          'periculosidade_ambiental',
        ])
        const form = getFieldValue(row, ['tipo_formulacao', 'formulacao'])
        const modo = getFieldValue(row, ['modo_acao', 'acao'])
        const ncmRaw = getFieldValue(row, ['ncm_padrao', 'ncm', 'classificacao_fiscal'])
        const tipoProd = getFieldValue(row, ['tipo_produto', 'categoria'])
        const statusReg = getFieldValue(row, ['status_registro', 'status', 'situacao'])

        // Preserva valores na íntegra no JSON de dados_extras
        const dadosExtrasObj: Record<string, unknown> = { ...row }
        if (titular) dadosExtrasObj['titular_original'] = titular
        if (fab) dadosExtrasObj['fabricante_original'] = fab
        if (pa) dadosExtrasObj['principio_ativo_original'] = pa

        // Defesa: se texto for extraordinariamente longo (> 4900), trunca defensivamente para o campo
        const titularDefensivo =
          titular && titular.length > 4900 ? titular.slice(0, 4900) + '...' : titular
        const fabDefensivo = fab && fab.length > 4900 ? fab.slice(0, 4900) + '...' : fab
        const paDefensivo = pa && pa.length > 1950 ? pa.slice(0, 1950) + '...' : pa
        const modoDefensivo = modo && modo.length > 1950 ? modo.slice(0, 1950) + '...' : modo

        const mapaFinal = mapa ? sanitizarRegistroMapa(mapa) : `LINHA-${originalLineNum}`
        const nomeFinal = nome || mapaFinal || `Produto Linha ${originalLineNum}`
        const marcaFinal = marcaPad || sanitizarMarcaComercial(nomeFinal)

        validos.push({
          originalLine: originalLineNum,
          data: {
            registro_mapa: mapaFinal,
            nome_comercial: nomeFinal,
            marca_padronizada: marcaFinal,
            titular_registro: titularDefensivo || '',
            fabricante_formulador: fabDefensivo || '',
            principio_ativo: paDefensivo || '',
            classe_agronomica: classe || '',
            grupo_quimico: grupoQ || '',
            classificacao_toxicologica: tox || '',
            classificacao_ambiental: amb || '',
            tipo_formulacao: form || '',
            modo_acao: modoDefensivo || '',
            ncm_padrao: cleanNcm(ncmRaw) ? formatarNcmMascara(cleanNcm(ncmRaw)) : ncmRaw || '',
            tipo_produto: tipoProd || 'Produto Formulado Comercial',
            status_registro: statusReg || 'Ativo',
            codigo: codigo || '',
            pa_oficial_correto: paOficialCorreto || '',
            mapa_oficial_limpo: mapaOficialLimpo || '',
            embalagem: embalagemVal || '',
            ncm_oficial_exata: cleanNcm(ncmOficialExata)
              ? formatarNcmMascara(cleanNcm(ncmOficialExata))
              : ncmOficialExata || '',
            url_oficial: urlOficialVal || '',
            macro_grupo: macroGrupoVal || '',
            sub_grupo: subGrupoVal || '',
            nota_subpos_2: notaSubpos2Val || '',
            regra_tipi: regraTipiVal || '',
            dados_extras: dadosExtrasObj,
          },
        })
      }
      // ------------------------------------------------------------------
      // BULA 2: bula_composicao (Composição em Linhas)
      // Ingestão na íntegra: SEM NENHUM FILTRO DE VALIDAÇÃO OU RECUSA
      // ------------------------------------------------------------------
      else if (targetCol === 'bula_composicao') {
        const mapa = getFieldValue(row, [
          'registro_mapa',
          'numero_registro_mapa',
          'no_registro_mapa',
          'n_registro_mapa',
          'mapa',
          'numero_mapa',
          'codigo_mapa',
          'registro',
        ])
        const nomeProd = getFieldValue(row, [
          'nome_produto',
          'nome_comercial_completo_sku_base',
          'nome_comercial',
          'marca_comercial',
          'produto',
        ])
        const ia = getFieldValue(row, [
          'substancia_principio_ativo_garantia',
          'substancia_principio_ativo',
          'substancia',
          'ingrediente_ativo',
          'principio_ativo',
          'pa',
          'ativo',
          'molecula',
          'quimico',
        ])
        const nomeQuim = getFieldValue(row, [
          'nome_quimico_oficial_iupac_cepa',
          'nome_quimico_oficial',
          'nome_quimico',
          'quimico',
        ])
        const cas = getFieldValue(row, ['numero_cas', 'cas'])
        const conc = getFieldValue(row, [
          'concentracao_garantia',
          'concentracao',
          'teor',
          'garantia',
        ])
        const und = getFieldValue(row, ['unidade', 'unidade_medida', 'uom'])
        const func = getFieldValue(row, [
          'tipo_do_componente',
          'tipo_componente',
          'funcao_ingrediente',
          'funcao',
          'tipo',
        ])
        const grupoQ = getFieldValue(row, ['grupo_quimico_categoria', 'grupo_quimico', 'grupo'])
        // ID Produto Base da planilha (ex.: 1014, 1, 2, 3...) alimenta codigo
        const codigo = getFieldValue(row, [
          'id_produto_base',
          'id_produto',
          'id produto base',
          'id produto',
          'id_prod',
          'codigo_produto',
          'codigo',
          'cod',
          'sku',
          'id',
        ])
        const percPeso = getFieldValue(row, ['percentual_peso', 'peso_percentual', 'pct_peso'])
        const percVol = getFieldValue(row, ['percentual_volume', 'volume_percentual', 'pct_volume'])

        const mapaFinal = mapa ? sanitizarRegistroMapa(mapa) : `LINHA-${originalLineNum}`
        const iaFinal = ia || nomeQuim || nomeProd || 'Ingrediente Ativo'

        validos.push({
          originalLine: originalLineNum,
          data: {
            registro_mapa: mapaFinal,
            nome_produto: nomeProd || '',
            ingrediente_ativo: iaFinal,
            nome_quimico: nomeQuim || '',
            numero_cas: cas || '',
            concentracao: conc || '',
            unidade_medida: und || 'g/L',
            funcao_ingrediente: func || '',
            grupo_quimico: grupoQ || '',
            codigo: codigo || '',
            percentual_peso: percPeso || '',
            percentual_volume: percVol || '',
            dados_extras: row,
          },
        })
      }

      // ------------------------------------------------------------------
      // BULA 3: bula_empresas (Cadeia de Empresas em Linhas)
      // Ingestão na íntegra: SEM NENHUM FILTRO DE VALIDAÇÃO OU RECUSA
      // ------------------------------------------------------------------
      else if (targetCol === 'bula_empresas') {
        const mapa = getFieldValue(row, [
          'registro_mapa',
          'numero_registro_mapa',
          'no_registro_mapa',
          'n_registro_mapa',
          'mapa',
          'numero_mapa',
          'codigo_mapa',
          'registro',
        ])
        const nomeProd = getFieldValue(row, [
          'nome_produto',
          'nome_comercial_completo_sku_base',
          'nome_comercial',
          'marca_comercial',
          'produto',
        ])
        const tipoRel = getFieldValue(row, [
          'tipo_relacao',
          'tipo_empresa',
          'relacao',
          'funcao_empresa',
          'papel',
        ])
        const razao = getFieldValue(row, [
          'razao_social',
          'empresa',
          'nome_empresa',
          'fabricante',
          'titular',
        ])
        const fant = getFieldValue(row, ['nome_fantasia', 'fantasia'])
        const cnpj = getFieldValue(row, ['cnpj', 'documento'])
        const end = getFieldValue(row, ['endereco', 'logradouro'])
        const mun = getFieldValue(row, ['municipio', 'cidade'])
        const uf = getFieldValue(row, ['uf', 'estado'])
        const pais = getFieldValue(row, ['pais'])
        const codigo = getFieldValue(row, [
          'id_produto_base',
          'id_produto',
          'id produto base',
          'id produto',
          'id_prod',
          'codigo_produto',
          'codigo',
          'cod',
          'sku',
          'id',
        ])
        const cep = getFieldValue(row, ['cep', 'codigo_postal'])
        const bairro = getFieldValue(row, ['bairro', 'distrito'])
        const ie = getFieldValue(row, ['inscricao_estadual', 'ie', 'inscr_estadual'])

        const mapaFinal = mapa ? sanitizarRegistroMapa(mapa) : `LINHA-${originalLineNum}`
        const razaoFinal = razao || fant || 'Empresa Vinculada'

        validos.push({
          originalLine: originalLineNum,
          data: {
            registro_mapa: mapaFinal,
            nome_produto: nomeProd || '',
            tipo_relacao: tipoRel || 'Formulador',
            razao_social: razaoFinal,
            nome_fantasia: fant || '',
            cnpj: cnpj || '',
            endereco: end || '',
            municipio: mun || '',
            uf: uf || '',
            pais: pais || 'Brasil',
            codigo: codigo || '',
            cep: cep || '',
            bairro: bairro || '',
            inscricao_estadual: ie || '',
            dados_extras: row,
          },
        })
      }

      // ------------------------------------------------------------------
      // BULA 4: bula_embalagens (Embalagens × NCM em Linhas)
      // Ingestão na íntegra: SEM NENHUM FILTRO DE VALIDAÇÃO OU RECUSA
      // ------------------------------------------------------------------
      else if (targetCol === 'bula_embalagens') {
        const mapa = getFieldValue(row, [
          'registro_mapa',
          'numero_registro_mapa',
          'no_registro_mapa',
          'n_registro_mapa',
          'mapa',
          'numero_mapa',
          'codigo_mapa',
          'registro',
        ])
        const nomeProd = getFieldValue(row, [
          'nome_produto',
          'nome_comercial_completo_sku_base',
          'nome_comercial',
          'marca_comercial',
          'produto',
        ])
        const tipoEmb = getFieldValue(row, ['tipo_embalagem', 'embalagem', 'tipo', 'recipiente'])
        const mat = getFieldValue(row, ['material', 'tipo_material'])
        const cap = getFieldValue(row, ['capacidade', 'volume', 'peso', 'tamanho'])
        const und = getFieldValue(row, ['unidade_medida', 'unidade'])
        const ncmRaw = getFieldValue(row, ['ncm', 'classificacao_fiscal'])
        const dest = getFieldValue(row, ['destinacao_final', 'destinacao', 'descarte'])
        const codigo = getFieldValue(row, [
          'id_produto_base',
          'id_produto',
          'id produto base',
          'id produto',
          'id_prod',
          'codigo_produto',
          'codigo',
          'cod',
          'sku',
          'id',
        ])
        const ncmFaixa = getFieldValue(row, ['ncm_faixa', 'faixa_ncm', 'faixa'])
        const descEmb = getFieldValue(row, ['descricao_embalagem', 'descricao', 'desc_embalagem'])

        const mapaFinal = mapa ? sanitizarRegistroMapa(mapa) : `LINHA-${originalLineNum}`

        validos.push({
          originalLine: originalLineNum,
          data: {
            registro_mapa: mapaFinal,
            nome_produto: nomeProd || '',
            tipo_embalagem: tipoEmb || 'Padrão',
            material: mat || '',
            capacidade: cap || '',
            unidade_medida: und || 'L',
            ncm: cleanNcm(ncmRaw) ? formatarNcmMascara(cleanNcm(ncmRaw)) : ncmRaw || '',
            destinacao_final: dest || '',
            codigo: codigo || '',
            ncm_faixa: ncmFaixa || '',
            descricao_embalagem: descEmb || '',
            dados_extras: row,
          },
        })
      }

      // ------------------------------------------------------------------
      // BULA 5: bula_culturas (Culturas e Carência em Linhas)
      // Ingestão na íntegra: SEM NENHUM FILTRO DE VALIDAÇÃO OU RECUSA
      // ------------------------------------------------------------------
      else if (targetCol === 'bula_culturas') {
        const mapa = getFieldValue(row, [
          'registro_mapa',
          'numero_registro_mapa',
          'no_registro_mapa',
          'n_registro_mapa',
          'mapa',
          'numero_mapa',
          'codigo_mapa',
          'registro',
        ])
        const nomeProd = getFieldValue(row, [
          'nome_produto',
          'nome_comercial_completo_sku_base',
          'nome_comercial',
          'marca_comercial',
          'produto',
        ])
        const cult = getFieldValue(row, ['cultura', 'culturas', 'cultivo', 'planta'])
        const car = getFieldValue(row, [
          'intervalo_seguranca_dias',
          'intervalo_seguranca',
          'carencia',
          'dias_carencia',
        ])
        const reen = getFieldValue(row, [
          'intervalo_reentrada_horas',
          'intervalo_reentrada',
          'reentrada',
        ])
        const mod = getFieldValue(row, ['modalidade_emprego', 'modalidade', 'aplicacao'])
        const lmr = getFieldValue(row, ['limite_maximo_residuos_lmr', 'lmr'])
        const obs = getFieldValue(row, ['observacoes', 'observacao', 'obs'])
        const codigo = getFieldValue(row, [
          'id_produto_base',
          'id_produto',
          'id produto base',
          'id produto',
          'id_prod',
          'codigo_produto',
          'codigo',
          'cod',
          'sku',
          'id',
        ])
        const tipoCult = getFieldValue(row, ['tipo_cultura', 'tipo'])
        const epocaCar = getFieldValue(row, ['epoca_carencia', 'epoca', 'momento_carencia'])

        const mapaFinal = mapa ? sanitizarRegistroMapa(mapa) : `LINHA-${originalLineNum}`
        const cultFinal = cult || 'Todas as Culturas Autorizadas'

        validos.push({
          originalLine: originalLineNum,
          data: {
            registro_mapa: mapaFinal,
            nome_produto: nomeProd || '',
            cultura: cultFinal,
            intervalo_seguranca_dias: car || '',
            intervalo_reentrada_horas: reen || '',
            modalidade_emprego: mod || '',
            limite_maximo_residuos_lmr: lmr || '',
            observacoes: obs || '',
            codigo: codigo || '',
            tipo_cultura: tipoCult || '',
            epoca_carencia: epocaCar || '',
            dados_extras: row,
          },
        })
      }

      // ------------------------------------------------------------------
      // BULA 6: bula_alvos (Alvos e Doses em Linhas)
      // Ingestão na íntegra: SEM NENHUM FILTRO DE VALIDAÇÃO OU RECUSA
      // ------------------------------------------------------------------
      else if (targetCol === 'bula_alvos') {
        const mapa = getFieldValue(row, [
          'registro_mapa',
          'numero_registro_mapa',
          'no_registro_mapa',
          'n_registro_mapa',
          'mapa',
          'numero_mapa',
          'codigo_mapa',
          'registro',
        ])
        const nomeProd = getFieldValue(row, [
          'nome_produto',
          'nome_comercial_completo_sku_base',
          'nome_comercial',
          'marca_comercial',
          'produto',
        ])
        const cult = getFieldValue(row, ['cultura', 'cultivo'])
        const alvo = getFieldValue(row, [
          'alvo_biologico',
          'alvo',
          'praga',
          'doenca',
          'planta_daninha',
        ])
        const nomeCient = getFieldValue(row, ['nome_cientifico', 'cientifico'])
        const doseMin = getFieldValue(row, ['dose_minima', 'dose_min', 'dose'])
        const doseMax = getFieldValue(row, ['dose_maxima', 'dose_max'])
        const undDose = getFieldValue(row, ['unidade_dose', 'unidade'])
        const vol = getFieldValue(row, ['volume_calda', 'volume', 'calda'])
        const numAp = getFieldValue(row, [
          'numero_maximo_aplicacoes',
          'num_aplicacoes',
          'aplicacoes',
        ])
        const epoca = getFieldValue(row, ['epoca_aplicacao', 'epoca', 'momento_aplicacao'])
        const codigo = getFieldValue(row, [
          'id_produto_base',
          'id_produto',
          'id produto base',
          'id produto',
          'id_prod',
          'codigo_produto',
          'codigo',
          'cod',
          'sku',
          'id',
        ])
        const tipoAlvo = getFieldValue(row, ['tipo_alvo', 'tipo'])
        const intAplDias = getFieldValue(row, [
          'intervalo_aplicacao_dias',
          'intervalo_dias',
          'intervalo_aplicacao',
        ])

        const mapaFinal = mapa ? sanitizarRegistroMapa(mapa) : `LINHA-${originalLineNum}`
        const alvoFinal = alvo || 'Alvo Biológico da Bula'

        validos.push({
          originalLine: originalLineNum,
          data: {
            registro_mapa: mapaFinal,
            nome_produto: nomeProd || '',
            cultura: cult || '',
            alvo_biologico: alvoFinal,
            nome_cientifico: nomeCient || '',
            dose_minima: doseMin || '',
            dose_maxima: doseMax || '',
            unidade_dose: undDose || 'L/ha',
            volume_calda: vol || '',
            numero_maximo_aplicacoes: numAp || '',
            epoca_aplicacao: epoca || '',
            codigo: codigo || '',
            tipo_alvo: tipoAlvo || '',
            intervalo_aplicacao_dias: intAplDias || '',
            dados_extras: row,
          },
        })
      }

      // ------------------------------------------------------------------
      // BULA 7: bula_aplicacao (Aplicação e EPI em Linhas)
      // Ingestão na íntegra: SEM NENHUM FILTRO DE VALIDAÇÃO OU RECUSA
      // ------------------------------------------------------------------
      else if (targetCol === 'bula_aplicacao') {
        const mapa = getFieldValue(row, [
          'registro_mapa',
          'numero_registro_mapa',
          'no_registro_mapa',
          'n_registro_mapa',
          'mapa',
          'numero_mapa',
          'codigo_mapa',
          'registro',
        ])
        const nomeProd = getFieldValue(row, [
          'nome_produto',
          'nome_comercial_completo_sku_base',
          'nome_comercial',
          'marca_comercial',
          'produto',
        ])
        const tipoApl = getFieldValue(row, ['tipo_aplicacao', 'modo_aplicacao', 'aplicacao'])
        const equip = getFieldValue(row, ['equipamento_recomendado', 'equipamento'])
        const clima = getFieldValue(row, [
          'condicoes_meteorologicas',
          'meteorologia',
          'clima',
          'vento',
        ])
        const epiCalda = getFieldValue(row, ['epi_preparo_calda', 'epi_preparo', 'epi_calda'])
        const epiApl = getFieldValue(row, ['epi_aplicacao', 'epi'])
        const socorro = getFieldValue(row, [
          'medidas_primeiros_socorros',
          'primeiros_socorros',
          'socorro',
        ])
        const descarte = getFieldValue(row, ['descarte_embalagens', 'descarte', 'triplice_lavagem'])
        const codigo = getFieldValue(row, [
          'id_produto_base',
          'id_produto',
          'id produto base',
          'id produto',
          'id_prod',
          'codigo_produto',
          'codigo',
          'cod',
          'sku',
          'id',
        ])
        const volCaldaApl = getFieldValue(row, ['volume_calda_aplicacao', 'volume_calda', 'calda'])
        const toxApl = getFieldValue(row, [
          'classe_toxicologica_aplicacao',
          'toxicologia',
          'classe_tox',
        ])
        const orientGerais = getFieldValue(row, [
          'orientacoes_gerais',
          'orientacoes',
          'recomendacoes',
        ])

        const mapaFinal = mapa ? sanitizarRegistroMapa(mapa) : `LINHA-${originalLineNum}`

        validos.push({
          originalLine: originalLineNum,
          data: {
            registro_mapa: mapaFinal,
            nome_produto: nomeProd || '',
            tipo_aplicacao: tipoApl || 'Terrestre',
            equipamento_recomendado: equip || '',
            condicoes_meteorologicas: clima || '',
            epi_preparo_calda: epiCalda || '',
            epi_aplicacao: epiApl || '',
            medidas_primeiros_socorros: socorro || '',
            descarte_embalagens: descarte || '',
            codigo: codigo || '',
            volume_calda_aplicacao: volCaldaApl || '',
            classe_toxicologica_aplicacao: toxApl || '',
            orientacoes_gerais: orientGerais || '',
            dados_extras: row,
          },
        })
      }
    })

    return { validos, rejeitados }
  }

  // Executa a importação dos válidos
  const handleExecutarImportacao = async () => {
    if (!isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Acesso Restrito',
        description: 'Apenas administradores podem importar dados para o banco.',
      })
      return
    }
    if (!parsedData || parsedData.rows.length === 0) return
    setImporting(true)
    setProgress(0)

    try {
      const targetCol = activeZone.targetCollection
      const { validos, rejeitados } = processarLinhasParaImportacao()

      if (validos.length === 0 && rejeitados.length === 0) {
        throw new Error('Nenhum registro correspondente foi identificado para importação.')
      }

      // Se houver válidos, grava no banco de dados com tratamento de rate-limit
      let resultadoLote: ResultadoImportacaoLote = {
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        erros: [],
        resumoCategorias: {},
      }

      if (validos.length > 0) {
        resultadoLote = await importarEmLote(targetCol, validos, (processados, total) => {
          setProgress(Math.round((processados / total) * 100))
        })
      }

      // Consolidar erros prévios de validação com erros retornados pelo PocketBase
      const todosErros = [...rejeitados, ...resultadoLote.erros]
      const categoriasConsolidadas = { ...resultadoLote.resumoCategorias }
      rejeitados.forEach((r) => {
        categoriasConsolidadas[r.categoria] = (categoriasConsolidadas[r.categoria] || 0) + 1
      })

      const finalResult: ResultadoImportacaoLote = {
        inseridos: resultadoLote.inseridos,
        atualizados: resultadoLote.atualizados ?? 0,
        ignorados: resultadoLote.ignorados,
        erros: todosErros,
        resumoCategorias: categoriasConsolidadas,
      }

      setImportSummary(finalResult)

      const totalGravados = finalResult.inseridos + (finalResult.atualizados || 0)
      if (totalGravados > 0 || finalResult.ignorados > 0) {
        toast({
          title: 'Importação Concluída na Íntegra!',
          description: `${finalResult.inseridos} registros inseridos e ${finalResult.atualizados || 0} enriquecidos/atualizados com sucesso na tabela "${targetCol}".`,
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Atenção na Importação',
          description: `Nenhum registro pôde ser processado. Verifique os avisos abaixo.`,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na rotina de importação.'
      toast({ variant: 'destructive', title: 'Erro de Importação', description: msg })
    } finally {
      setImporting(false)
    }
  }

  // Exportar relatório de erros em CSV para conferência do usuário
  const exportarErrosCsv = () => {
    if (!importSummary || importSummary.erros.length === 0) return

    const headers = [
      'Linha_Planilha',
      'Categoria_Erro',
      'Motivo',
      'Campo_Problema',
      'Valor_Identificado',
    ]
    const csvRows = [headers.join(';')]

    importSummary.erros.forEach((e) => {
      const row = [
        e.linhaOriginal,
        `"${e.categoria.replace(/"/g, '""')}"`,
        `"${e.motivo.replace(/"/g, '""')}"`,
        `"${(e.campo || '').replace(/"/g, '""')}"`,
        `"${(e.valor || '').replace(/"/g, '""')}"`,
      ]
      csvRows.push(row.join(';'))
    })

    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `erros_importacao_${activeZone.id}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Download Iniciado',
      description: 'O CSV com as linhas que apresentaram erro foi gerado.',
    })
  }

  // Erros filtrados por categoria selecionada
  const errosFiltrados = importSummary
    ? selectedCategoryFilter
      ? importSummary.erros.filter((e) => e.categoria === selectedCategoryFilter)
      : importSummary.erros
    : []

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Modal de Importação de Bula (PDF) */}
      <ModalImportarBulaPdf open={modalPdfOpen} onOpenChange={setModalPdfOpen} />
      {/* Top Header com Botão PDF em Destaque */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-[#1B5E20]" />
            <span>Central de Importação</span>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Importe dados para o sistema via <strong>Bula Oficial em PDF</strong> (preenchimento
            inteligente de todos os 7 blocos da bula) ou via{' '}
            <strong>Planilhas Excel (.xlsx / .csv)</strong> 1:1 por linha.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setModalPdfOpen(true)}
            className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white text-xs h-9 rounded-xl shadow-sm flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4 text-emerald-300" />
            <span>Importar Bula (PDF)</span>
            <Badge className="bg-emerald-400/20 text-emerald-100 text-[9px] border-emerald-300/30 px-1 py-0 ml-0.5">
              Novo
            </Badge>
          </Button>

          <Link to="/bula">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 rounded-xl border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50 hover:text-[#1B5E20] hover:border-emerald-300 flex items-center gap-1.5"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Ver Cadastro de Bula</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Card Promocional da Nova Importação por PDF */}
      <Card className="p-4 bg-gradient-to-r from-emerald-50/90 via-emerald-50/50 to-white border-emerald-200 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1B5E20] text-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
            <FileText className="w-5 h-5 text-emerald-200" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm text-emerald-950 flex items-center gap-2">
              <span>Importação Direta a partir da Bula em PDF</span>
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-100/60 text-emerald-900 border-emerald-300 font-normal"
              >
                7 Blocos em 1 Clique
              </Badge>
            </h4>
            <p className="text-xs text-[#5A6D5A] mt-0.5 leading-relaxed">
              Suba o PDF da bula verdadeira do produto (ex: ROUNDUP ORIGINAL MAIS, MAPA Nº 01119). O
              motor extrai cabeçalho, composição, fabricantes/formuladores, toxicologia, doses,
              quadros de uso e modo de aplicação de uma única vez.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => setModalPdfOpen(true)}
          className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white text-xs h-8 px-3.5 rounded-xl shadow-sm flex items-center gap-1.5 flex-shrink-0"
        >
          <span>Subir Bula (PDF)</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 4 ZONAS DE DESTINO */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DROP_ZONES.map((zone) => {
          const isSelected = activeZone.id === zone.id
          return (
            <div
              key={zone.id}
              onClick={() => handleSelectZone(zone)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 text-left bg-white shadow-sm flex flex-col justify-between ${
                isSelected
                  ? 'border-[#1B5E20] ring-2 ring-emerald-600/30 shadow-md bg-emerald-50/20'
                  : 'border-[#DCE5DC] hover:border-emerald-300 hover:bg-[#F5F7F1]/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isSelected ? 'bg-[#1B5E20] text-white' : 'bg-emerald-50 text-[#1B5E20]'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  {isSelected && (
                    <Badge className="bg-[#1B5E20] text-white text-[10px] py-0 px-2">
                      Aba Ativa
                    </Badge>
                  )}
                </div>
                <h3 className="font-bold text-xs text-[#1C2B1C]">{zone.title}</h3>
                <p className="text-[11px] text-[#5A6D5A] mt-1 leading-relaxed">{zone.subtitle}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-[#F0F4F0] flex items-center justify-between text-[10px] text-[#1B5E20] font-semibold">
                <span>Destino: {zone.targetCollection}</span>
                <span className="text-[9px] text-[#5A6D5A] font-normal">
                  Aba {zone.sheetIndex + 1}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* DROP ZONE ATIVA & CARREGADOR */}
      {/* ------------------------------------------------------------------ */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-6">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const files = e.dataTransfer.files
            if (files && files[0]) handleFileChange(files[0])
          }}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[#DCE5DC] hover:border-[#1B5E20] bg-[#F5F7F1]/50 hover:bg-emerald-50/30 rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center"
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls,.csv,.txt,.tsv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileChange(e.target.files[0])
              }
            }}
          />

          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-[#1B5E20] flex items-center justify-center mb-3 shadow-inner">
            <UploadCloud className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-sm text-[#1C2B1C]">
            Arraste ou clique para selecionar a planilha ({activeZone.title})
          </h4>
          <p className="text-xs text-[#5A6D5A] mt-1 max-w-md">
            Formatos aceitos nativamente: <strong>.xlsx (Excel)</strong> com múltiplas abas ou{' '}
            <strong>.csv</strong> delimitado.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[11px] text-[#5A6D5A] border border-[#DCE5DC]">
            <FileText className="w-3.5 h-3.5 text-[#1B5E20]" />
            <span>Colunas identificadas por aproximação e sinônimos oficiais</span>
          </div>
        </div>

        {/* Mensagem de Erro ou Alerta */}
        {validationError && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Aviso no processamento do arquivo:</p>
              <p className="mt-0.5 leading-relaxed">{validationError}</p>
            </div>
          </div>
        )}

        {/* Seletor de Abas para arquivos XLSX com mais de 1 aba */}
        {availableSheets.length > 1 && (
          <div className="mt-5 p-4 rounded-xl bg-[#F5F7F1] border border-[#DCE5DC] flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1C2B1C]">
              <Layers className="w-4 h-4 text-[#1B5E20]" />
              <span>Abas detectadas no arquivo Excel:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableSheets.map((sheet, sIdx) => {
                const isCurrent = sheet === selectedSheet
                return (
                  <Button
                    key={sIdx}
                    variant={isCurrent ? 'default' : 'outline'}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSheetChange(sheet)
                    }}
                    className={`text-xs h-7 rounded-lg transition-all ${
                      isCurrent
                        ? 'bg-[#1B5E20] text-white hover:bg-[#2E7D32]'
                        : 'bg-white text-[#1C2B1C] border-[#DCE5DC] hover:border-emerald-300'
                    }`}
                  >
                    <span>{sheet}</span>
                    {sIdx === activeZone.sheetIndex && (
                      <span className="ml-1 text-[10px] opacity-80">(Sugerida)</span>
                    )}
                  </Button>
                )
              })}
            </div>
          </div>
        )}

        {/* Arquivo Carregado e Ações */}
        {fileName && parsedData && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-[#1B5E20]" />
                <div>
                  <h5 className="font-bold text-xs text-[#1C2B1C]">
                    {fileName} {selectedSheet ? `(Aba: "${selectedSheet}")` : ''}
                  </h5>
                  <p className="text-[11px] text-[#5A6D5A]">
                    {parsedData.rows.length} registros identificados • {parsedData.headers.length}{' '}
                    colunas mapeadas
                  </p>
                </div>
              </div>

              {isAdmin ? (
                <Button
                  onClick={handleExecutarImportacao}
                  disabled={importing}
                  className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-xl text-xs font-semibold px-5 h-10 shadow-md flex items-center gap-2"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Importando ({progress}%)...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirmar e Importar no Banco</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-xs text-amber-700 bg-amber-50 border-amber-300 py-1.5 px-3"
                  >
                    Modo Somente Leitura (Apenas Admin pode importar)
                  </Badge>
                </div>
              )}
            </div>

            {/* Barra de Progresso durante a carga */}
            {importing && (
              <div className="space-y-1.5 animate-in fade-in">
                <div className="flex justify-between text-xs text-[#5A6D5A]">
                  <span>Gravando registros no PocketBase com controle de vazão...</span>
                  <span className="font-bold text-[#1B5E20]">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2 rounded-full [&>div]:bg-[#1B5E20]" />
              </div>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* NOVO RELATÓRIO DE EXECUÇÃO DETALHADO POR MOTIVO DE ERRO */}
            {/* ------------------------------------------------------------------ */}
            {importSummary && (
              <div className="p-5 rounded-2xl bg-white border border-[#DCE5DC] shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F0F4F0] pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-[#2E7D32]" />
                    <div>
                      <h4 className="font-bold text-sm text-[#1C2B1C]">
                        Relatório Detalhado de Importação
                      </h4>
                      <p className="text-[11px] text-[#5A6D5A]">
                        Concluído na tabela{' '}
                        <code className="bg-[#F5F7F1] px-1.5 py-0.5 rounded text-[#1B5E20]">
                          {activeZone.targetCollection}
                        </code>
                      </p>
                    </div>
                  </div>

                  {importSummary.erros.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportarErrosCsv}
                      className="text-xs h-8 rounded-xl border-[#DCE5DC] text-[#1C2B1C] hover:bg-emerald-50 hover:text-[#1B5E20] hover:border-emerald-300 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar Linhas com Erro (.CSV)</span>
                    </Button>
                  )}
                </div>

                {/* Cards de Métricas */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200">
                    <span className="block text-[11px] text-emerald-700 font-medium">
                      Novos Inseridos
                    </span>
                    <strong className="text-xl font-bold text-emerald-800">
                      {importSummary.inseridos}
                    </strong>
                    <span className="block text-[10px] text-emerald-600 mt-0.5">
                      {activeZone.targetCollection === 'bula_produtos'
                        ? 'Novos SKUs gravados (1:1 por linha)'
                        : 'Gravados na base'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50 text-blue-900 border border-blue-200">
                    <span className="block text-[11px] text-blue-700 font-medium">
                      Atualizados / Enriquecidos
                    </span>
                    <strong className="text-xl font-bold text-blue-800">
                      {importSummary.atualizados ?? 0}
                    </strong>
                    <span className="block text-[10px] text-blue-600 mt-0.5">
                      {activeZone.targetCollection === 'bula_produtos'
                        ? 'Mesmo SKU/Código reimportado'
                        : 'Dados complementados'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 text-slate-900 border border-slate-200">
                    <span className="block text-[11px] text-slate-700 font-medium">
                      {importSummary.erros.length > 0
                        ? 'Erros Técnicos de Infraestrutura'
                        : 'Linhas Recusadas / Ignoradas'}
                    </span>
                    <strong
                      className={`text-xl font-bold ${importSummary.erros.length > 0 ? 'text-red-800' : 'text-slate-800'}`}
                    >
                      {importSummary.erros.length}
                    </strong>
                    <span className="block text-[10px] text-slate-600 mt-0.5">
                      {importSummary.erros.length === 0
                        ? '0 perdas • 100% gravado'
                        : 'Falhas de conexão ou DB'}
                    </span>
                  </div>
                </div>

                {/* Resumo por Categoria de Erro (Chips clicáveis) */}
                {Object.keys(importSummary.resumoCategorias).length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs text-[#5A6D5A]">
                      <span className="font-semibold text-[#1C2B1C]">
                        Diagnóstico por Categoria (clique para filtrar):
                      </span>
                      {selectedCategoryFilter && (
                        <button
                          onClick={() => setSelectedCategoryFilter(null)}
                          className="text-[11px] text-[#1B5E20] hover:underline"
                        >
                          Limpar filtro (ver todos)
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(importSummary.resumoCategorias).map(([cat, qtd]) => {
                        const isFiltered = selectedCategoryFilter === cat
                        return (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategoryFilter(isFiltered ? null : cat)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all ${
                              isFiltered
                                ? 'bg-red-600 text-white shadow-sm ring-2 ring-red-400'
                                : 'bg-red-50 text-red-900 border border-red-200 hover:bg-red-100'
                            }`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            <span className="font-semibold">{cat}:</span>
                            <span className="bg-white/80 text-red-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                              {qtd} {qtd === 1 ? 'linha' : 'linhas'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Tabela Interativa de Linhas com Erro */}
                {errosFiltrados.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#F0F4F0]">
                    <div className="flex items-center justify-between text-xs text-[#5A6D5A]">
                      <span className="font-semibold text-[#1C2B1C]">
                        Detalhamento das Linhas Problemáticas ({errosFiltrados.length} exibidas):
                      </span>
                      <span className="text-[11px]">
                        Clique na linha para expandir os dados brutos
                      </span>
                    </div>

                    <div className="border border-red-200 rounded-xl overflow-hidden text-[11px]">
                      <ScrollableTable autoFitHeight={false} maxHeight="260px" minHeight="160px">
                        <table className="w-full text-left">
                          <thead className="sticky top-0 z-20 bg-red-50 border-b border-red-200 text-red-900 shadow-[0_1px_0_0_#fecaca]">
                            <tr>
                              <th className="py-2 px-3 font-semibold w-16">Linha</th>
                              <th className="py-2 px-3 font-semibold">Categoria</th>
                              <th className="py-2 px-3 font-semibold">Motivo da Recusa</th>
                              <th className="py-2 px-3 font-semibold">Campo / Valor</th>
                              <th className="py-2 px-2 text-center w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100 bg-white">
                            {errosFiltrados.map((item, errIdx) => {
                              const isExpanded = expandedErrorRow === errIdx
                              return (
                                <React.Fragment key={errIdx}>
                                  <tr
                                    onClick={() => setExpandedErrorRow(isExpanded ? null : errIdx)}
                                    className="hover:bg-red-50/40 cursor-pointer transition-colors"
                                  >
                                    <td className="py-2 px-3 font-mono font-bold text-red-700">
                                      {item.linhaOriginal}
                                    </td>
                                    <td className="py-2 px-3 font-medium text-red-900">
                                      {item.categoria}
                                    </td>
                                    <td className="py-2 px-3 text-red-800">{item.motivo}</td>
                                    <td
                                      className="py-2 px-3 text-red-700 max-w-[260px]"
                                      title={
                                        item.campo
                                          ? `${item.campo}: ${item.valor || 'vazio'}`
                                          : item.motivo
                                      }
                                    >
                                      {item.campo && (
                                        <div className="mb-0.5">
                                          <Badge
                                            variant="outline"
                                            className="text-[9px] px-1.5 py-0 border-red-300 text-red-800 bg-red-50/50 font-mono"
                                          >
                                            {item.campo}
                                          </Badge>
                                        </div>
                                      )}
                                      {item.valor ? (
                                        <span
                                          className="font-mono text-[10px] text-red-600 block truncate"
                                          title={item.valor}
                                        >
                                          {item.valor}
                                        </span>
                                      ) : (
                                        <span className="text-red-400 italic text-[10px]">
                                          {item.campo ? 'valor não especificado' : '—'}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-center text-red-500">
                                      {isExpanded ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr className="bg-[#F5F7F1]">
                                      <td colSpan={5} className="p-3 text-[10px] text-[#1C2B1C]">
                                        <div className="font-semibold text-[#1B5E20] mb-1">
                                          Conteúdo bruto extraído da Linha {item.linhaOriginal}:
                                        </div>
                                        <pre className="bg-white p-2 rounded-lg border border-[#DCE5DC] overflow-x-auto text-xs font-mono">
                                          {JSON.stringify(item.dados, null, 2)}
                                        </pre>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </ScrollableTable>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preview das primeiras 10 linhas identificadas */}
            <div className="space-y-2 pt-2">
              <h5 className="font-bold text-xs text-[#1C2B1C] flex items-center justify-between">
                <span>Pré-visualização do Mapeamento (10 primeiras linhas de dados)</span>
                <span className="text-[11px] text-[#5A6D5A] font-normal">
                  Total de colunas: {parsedData.headers.length}
                </span>
              </h5>
              <div className="border border-[#DCE5DC] rounded-xl overflow-hidden">
                <ScrollableTable autoFitHeight={false} maxHeight="300px" minHeight="200px">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 z-20 bg-[#F5F7F1] shadow-[0_1px_0_0_#DCE5DC]">
                      <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                        <th className="py-2 px-3 font-semibold text-center w-12">#</th>
                        {parsedData.headers.map((h, i) => (
                          <th key={i} className="py-2 px-3 font-semibold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F4F0]">
                      {parsedData.rows.slice(0, 10).map((r, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-[#F5F7F1]/40">
                          <td className="py-1.5 px-3 text-center text-[#5A6D5A] font-mono text-[10px]">
                            {parsedData.rowIndices?.[rowIdx] ?? rowIdx + 2}
                          </td>
                          {parsedData.headers.map((h, colIdx) => (
                            <td
                              key={colIdx}
                              className="py-1.5 px-3 max-w-[220px] truncate text-[#1C2B1C]"
                              title={r[h] || ''}
                            >
                              {r[h] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
