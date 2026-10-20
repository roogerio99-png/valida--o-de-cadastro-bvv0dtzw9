import React, { useState, useRef } from 'react'
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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { readSpreadsheetFile, type ParsedTable } from '@/lib/importer/csvParser'
import {
  importarEmLote,
  type ItemErroImportacao,
  type ResultadoImportacaoLote,
} from '@/services/agroService'

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
  {
    id: 'validador',
    sheetIndex: 0,
    sheetKeywords: ['validador', 'automatico', 'cenario'],
    title: '1. Validador Automático',
    subtitle: 'Planilha de produtos e parâmetros operacionais para inserção na Base Mestre.',
    targetCollection: 'base_mestre',
    expectedHeaders: [
      'NOME PRODUTO',
      'NCM',
      'EMBALAGEM',
      'PRINCIPIO ATIVO',
      'FABRICANTE',
      'REGISTRO MAPA',
      'CONCENTRACAO',
    ],
    sampleDescription: 'Importa itens diretamente para homologação na base_mestre',
  },
  {
    id: 'regras',
    sheetIndex: 1,
    sheetKeywords: ['regras', 'ncm', 'tipi'],
    title: '2. Regras NCM × Embalagem',
    subtitle: 'Matriz regulamentar de NCMs, descrições TIPI e embalagens permitidas.',
    targetCollection: 'regras_ncm_embalagem',
    expectedHeaders: ['NCM', 'DESCRICAO', 'EMBALAGENS PERMITIDAS'],
    sampleDescription: 'Popula as travas 1 e 2 de conformidade por classificação fiscal',
  },
  {
    id: 'principios',
    sheetIndex: 2,
    sheetKeywords: ['dicionario', 'principios', 'ativos', 'moleculas'],
    title: '3. Dicionário Princípios Ativos',
    subtitle: 'Base de ingredientes ativos, toxicologia, classe e faixas de concentração.',
    targetCollection: 'dicionario_principios_ativos',
    expectedHeaders: [
      'PRINCIPIO ATIVO',
      'CLASSE',
      'GRUPO QUIMICO',
      'CONCENTRACAO MIN',
      'CONCENTRACAO MAX',
      'UNIDADE',
    ],
    sampleDescription: 'Popula as travas 3 e 5 de ingredientes ativos autorizados',
  },
  {
    id: 'base_mestre',
    sheetIndex: 3,
    sheetKeywords: ['base mestre', '845', 'catalogo', 'mestre'],
    title: '4. Base Mestre de Produtos',
    subtitle: 'Catálogo mestre consolidado da empresa com histórico de produtos.',
    targetCollection: 'base_mestre',
    expectedHeaders: ['CODIGO', 'DESCRICAO', 'NCM', 'EMBALAGEM', 'PRINCIPIO ATIVO'],
    sampleDescription: 'Popula a trava 4 para prevenção contra duplicidade cadastral',
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

export default function Importar() {
  const [activeZone, setActiveZone] = useState<ZoneConfig>(DROP_ZONES[3]) // Aba 4 selecionada por padrão para agilizar o fluxo do usuário
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
        setSelectedSheet(table.sheetName || table.sheetNames[0])
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
        const nome = getFieldValue(row, [
          'descricao',
          'nome_produto',
          'nome produto',
          'produto',
          'nome',
          'item',
        ])
        const codigo = getFieldValue(row, ['codigo', 'cod', 'id'])
        const ncmLimpo = cleanNcm(
          getFieldValue(row, ['ncm_oficial_exata', 'ncm exata', 'ncm', 'classificacao_fiscal']),
        )
        const emb = getFieldValue(row, [
          'embalagem_detectada',
          'embalagem',
          'emb',
          'tipo_embalagem',
          'recipiente',
        ])
        const pa = getFieldValue(row, [
          'pa_oficial_correto',
          'principio_ativo',
          'principio ativo',
          'pa',
          'ingrediente',
          'molecula',
          'pa_cadastrado_original',
        ])
        const fab = getFieldValue(row, ['fabricante', 'empresa', 'titular', 'marca', 'fornecedor'])
        const mapa = getFieldValue(row, [
          'mapa_oficial_limpo',
          'mapa_oficial_detalhado',
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
            'peso_vol',
            'concentracao',
            'teor',
            'volume',
            'peso',
          ]),
        )
        const unid =
          getFieldValue(row, ['unid_embalagem', 'unidade_concentracao', 'unidade', 'unid']) || 'L'

        // Validação de obrigatoriedade
        // Rejeitar apenas se não houver NENHUM nome ou descrição válida identificando o produto
        if (!nome && !codigo) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: 'Linha sem Nome ou Descrição do Produto.',
            categoria: 'Nome/Descrição Ausente',
            campo: 'Descricao',
            valor: '',
            dados: row,
          })
          return
        }

        const nomeFinal = nome || `Produto ${codigo}`

        // Se NCM foi informado, mas não tem 8 dígitos (ex: 4 dígitos ou lixo)
        if (ncmLimpo && ncmLimpo.length !== 8) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: `NCM "${ncmLimpo}" possui ${ncmLimpo.length} dígitos. O padrão TIPI exige 8 dígitos.`,
            categoria: 'NCM com Dígitos Inválidos',
            campo: 'NCM',
            valor: ncmLimpo,
            dados: row,
          })
          return
        }

        validos.push({
          originalLine: originalLineNum,
          data: {
            nome_produto: nomeFinal,
            ncm: ncmLimpo,
            embalagem: emb || 'Padrão',
            principio_ativo: pa || 'Não Informado',
            fabricante: fab || '',
            registro_mapa: mapa || '',
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
          // Se na verdade for uma linha sem NCM útil (ex: notas, contadores de divergência)
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: ncmLimpo
              ? `Código NCM "${ncmLimpo}" possui ${ncmLimpo.length} dígitos. O padrão TIPI exige 8 dígitos.`
              : 'NCM obrigatório ausente ou inválido.',
            categoria: 'NCM Inválido ou Ausente',
            campo: 'NCM',
            valor: rawNcm || 'vazio',
            dados: row,
          })
          return
        }

        // Processar embalagens permitidas: pode vir como "Saco, Tambor", "Bombona / Frasco"
        // ou como texto de condição "Até 5L; 10L; 20L"
        let embArr: string[] = []
        if (condicaoEmb) {
          embArr = condicaoEmb
            .split(/[,;/|\n]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        }

        // Se não houver lista explícita, mas houver regra, tentar manter regra especial clara
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
        const pa = getFieldValue(row, [
          'principio_ativo_composicao_chave',
          'principio_ativo',
          'principio ativo',
          'molecula',
          'nome',
        ])
        const grupo = getFieldValue(row, [
          'macro_grupo_e_sub_grupo_oficial',
          'grupo_quimico',
          'grupo',
          'classe',
        ])
        const regraReg = getFieldValue(row, [
          'regra_tipo_de_registro_mapa',
          'status',
          'enquadramento',
        ])

        if (!pa) {
          rejeitados.push({
            linhaOriginal: originalLineNum,
            linhaLote: idx + 1,
            motivo: 'Nome da molécula ou princípio ativo não informado.',
            categoria: 'Princípio Ativo Ausente',
            campo: 'Principio Ativo',
            valor: '',
            dados: row,
          })
          return
        }

        validos.push({
          originalLine: originalLineNum,
          data: {
            principio_ativo: pa,
            classe: grupo.includes('—') ? grupo.split('—')[0].trim() : 'Agropecuário',
            grupo_quimico: grupo.includes('—') ? grupo.split('—')[1].trim() : grupo,
            concentracao_min: 0,
            concentracao_max: 0,
            unidade: '%',
            status: regraReg || 'Ativo',
          },
        })
      }
    })

    return { validos, rejeitados }
  }

  // Executa a importação dos válidos
  const handleExecutarImportacao = async () => {
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
        ignorados: resultadoLote.ignorados,
        erros: todosErros,
        resumoCategorias: categoriasConsolidadas,
      }

      setImportSummary(finalResult)

      if (finalResult.inseridos > 0) {
        toast({
          title: 'Importação Concluída!',
          description: `${finalResult.inseridos} registros inseridos com sucesso na tabela "${targetCol}".${
            todosErros.length > 0 ? ` (${todosErros.length} linhas com ressalvas/erros).` : ''
          }`,
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Atenção na Importação',
          description: `Nenhum registro pôde ser inserido. Verifique o resumo de erros abaixo.`,
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
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
          <UploadCloud className="w-6 h-6 text-[#1B5E20]" />
          <span>Importação Operacional de Planilhas</span>
        </h2>
        <p className="text-xs text-[#5A6D5A] mt-0.5">
          Carregue suas planilhas de trabalho (.xlsx ou .csv). O validador identifica
          automaticamente as abas, tolera cabeçalhos variados e ignora cabeçalhos informativos sem
          quebrar a importação.
        </p>
      </div>

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
                      Inseridos com Sucesso
                    </span>
                    <strong className="text-xl font-bold text-emerald-800">
                      {importSummary.inseridos}
                    </strong>
                    <span className="block text-[10px] text-emerald-600 mt-0.5">
                      Prontos para validação
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 text-amber-900 border border-amber-200">
                    <span className="block text-[11px] text-amber-700 font-medium">
                      Ignorados (Duplicados)
                    </span>
                    <strong className="text-xl font-bold text-amber-800">
                      {importSummary.ignorados}
                    </strong>
                    <span className="block text-[10px] text-amber-600 mt-0.5">
                      Já existiam na base
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-red-50 text-red-900 border border-red-200">
                    <span className="block text-[11px] text-red-700 font-medium">
                      Linhas com Inconsistências
                    </span>
                    <strong className="text-xl font-bold text-red-800">
                      {importSummary.erros.length}
                    </strong>
                    <span className="block text-[10px] text-red-600 mt-0.5">
                      Exigem correção na planilha
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

                    <div className="border border-red-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-red-50/70 border-b border-red-200 text-red-900">
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
                                  <td className="py-2 px-3 text-red-700 truncate max-w-[200px]">
                                    {item.campo ? (
                                      <span>
                                        <strong>{item.campo}:</strong> {item.valor || 'vazio'}
                                      </span>
                                    ) : (
                                      '—'
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
              <div className="overflow-x-auto border border-[#DCE5DC] rounded-xl max-h-64 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead>
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
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
