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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { readSpreadsheetFile, type ParsedTable } from '@/lib/importer/csvParser'
import { importarEmLote } from '@/services/agroService'

interface ZoneConfig {
  id: string
  title: string
  subtitle: string
  targetCollection: string
  expectedHeaders: string[]
  sampleDescription: string
}

const DROP_ZONES: ZoneConfig[] = [
  {
    id: 'validador',
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
    title: '2. Regras NCM × Embalagem',
    subtitle: 'Matriz regulamentar de NCMs, descrições TIPI e embalagens permitidas.',
    targetCollection: 'regras_ncm_embalagem',
    expectedHeaders: ['NCM', 'DESCRICAO', 'EMBALAGENS PERMITIDAS'],
    sampleDescription: 'Popula as travas 1 e 2 de conformidade por classificação fiscal',
  },
  {
    id: 'principios',
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
    title: '4. Base Mestre de Produtos',
    subtitle: 'Catálogo mestre consolidado da empresa com histórico de produtos.',
    targetCollection: 'base_mestre',
    expectedHeaders: ['NOME PRODUTO', 'NCM', 'EMBALAGEM', 'PRINCIPIO ATIVO', 'FABRICANTE'],
    sampleDescription: 'Popula a trava 4 para prevenção contra duplicidade cadastral',
  },
]

export default function Importar() {
  const [activeZone, setActiveZone] = useState<ZoneConfig>(DROP_ZONES[0])
  const [parsedData, setParsedData] = useState<ParsedTable | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Status de importação
  const [importing, setImporting] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [importSummary, setImportSummary] = useState<{
    inseridos: number
    ignorados: number
    erros: string[]
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSelectZone = (zone: ZoneConfig) => {
    setActiveZone(zone)
    setParsedData(null)
    setFileName('')
    setValidationError(null)
    setImportSummary(null)
    setProgress(0)
  }

  // Normalização de cabeçalhos para conferência insensível a maiúsculas/acentos
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')

  const handleFileChange = async (file: File) => {
    setFileName(file.name)
    setValidationError(null)
    setImportSummary(null)
    setProgress(0)

    try {
      const table = await readSpreadsheetFile(file)
      if (table.headers.length === 0 || table.rows.length === 0) {
        throw new Error('O arquivo está vazio ou não possui registros válidos.')
      }

      // Validação de cabeçalhos esperados
      const fileHeadersNorm = table.headers.map(normalize)
      const expectedNorm = activeZone.expectedHeaders.map(normalize)

      // Checa se pelo menos metade dos cabeçalhos esperados estão presentes
      const missing = activeZone.expectedHeaders.filter(
        (exp) =>
          !fileHeadersNorm.some((fh) => fh.includes(normalize(exp)) || normalize(exp).includes(fh)),
      )

      if (missing.length > 2) {
        setValidationError(
          `Cabeçalhos incompatíveis com "${activeZone.title}". Colunas esperadas: [${activeZone.expectedHeaders.join(
            ', ',
          )}]. Colunas encontradas no arquivo: [${table.headers.join(', ')}]. Ausentes: [${missing.join(', ')}]`,
        )
      }

      setParsedData(table)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar arquivo.'
      setValidationError(msg)
      setParsedData(null)
    }
  }

  // Executa a carga para o PocketBase
  const handleExecutarImportacao = async () => {
    if (!parsedData || parsedData.rows.length === 0) return
    setImporting(true)
    setProgress(0)

    try {
      // Mapear os dados parsed conforme a collection de destino
      const targetCol = activeZone.targetCollection
      const recordsToInsert: Record<string, unknown>[] = []

      // Helper para achar coluna no row
      const findVal = (row: Record<string, string>, keys: string[]) => {
        for (const k of Object.keys(row)) {
          const normK = normalize(k)
          if (keys.some((target) => normK.includes(normalize(target)))) {
            return row[k]
          }
        }
        return ''
      }

      for (const row of parsedData.rows) {
        if (targetCol === 'base_mestre') {
          const nome = findVal(row, ['nome', 'produto', 'descricao'])
          if (!nome) continue // linha vazia
          const ncm = findVal(row, ['ncm']).replace(/\D/g, '')
          const embalagem = findVal(row, ['embalagem', 'tipo'])
          const pa = findVal(row, ['principio', 'ativo', 'ingrediente'])
          const fab = findVal(row, ['fabricante', 'titular', 'empresa'])
          const mapa = findVal(row, ['mapa', 'registro'])
          const conc = parseFloat(findVal(row, ['concentracao', 'teor'])) || 0
          const unidade = findVal(row, ['unidade']) || 'g/L'

          recordsToInsert.push({
            nome_produto: nome,
            ncm: ncm,
            embalagem: embalagem,
            principio_ativo: pa,
            fabricante: fab,
            registro_mapa: mapa,
            concentracao: conc,
            unidade_concentracao: unidade,
            status_validacao: 'aprovado',
          })
        } else if (targetCol === 'regras_ncm_embalagem') {
          const ncm = findVal(row, ['ncm']).replace(/\D/g, '')
          if (!ncm) continue
          const desc = findVal(row, ['descricao', 'desc', 'especificacao'])
          const embStr = findVal(row, ['embalagens', 'permitidas', 'embalagem'])
          // Separar embalagens por vírgula, barra ou ponto-e-vírgula
          const embArr = embStr
            ? embStr
                .split(/[,;/]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : []
          const regraEsp = findVal(row, ['regra', 'especial', 'embargo', 'obs'])

          recordsToInsert.push({
            ncm: ncm,
            descricao: desc,
            embalagens_permitidas: embArr,
            regra_especial: regraEsp,
          })
        } else if (targetCol === 'dicionario_principios_ativos') {
          const pa = findVal(row, ['principio', 'ativo', 'nome'])
          if (!pa) continue
          const classe = findVal(row, ['classe', 'tipo'])
          const grupo = findVal(row, ['grupo', 'quimico'])
          const min = parseFloat(findVal(row, ['min', 'minima'])) || 0
          const max = parseFloat(findVal(row, ['max', 'maxima'])) || 0
          const unidade = findVal(row, ['unidade']) || '%'
          const status = findVal(row, ['status', 'situacao']) || 'Ativo'

          recordsToInsert.push({
            principio_ativo: pa,
            classe: classe,
            grupo_quimico: grupo,
            concentracao_min: min,
            concentracao_max: max,
            unidade: unidade,
            status: status,
          })
        }
      }

      if (recordsToInsert.length === 0) {
        throw new Error('Nenhum registro correspondente foi identificado para importação.')
      }

      const result = await importarEmLote(targetCol, recordsToInsert, (processados, total) => {
        setProgress(Math.round((processados / total) * 100))
      })

      setImportSummary(result)
      toast({
        title: 'Importação Concluída!',
        description: `${result.inseridos} registros inseridos com sucesso na tabela ${targetCol}.`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na rotina de importação.'
      toast({ variant: 'destructive', title: 'Erro de Importação', description: msg })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
          <UploadCloud className="w-6 h-6 text-[#1B5E20]" />
          <span>Importação Operacional de Planilhas</span>
        </h2>
        <p className="text-xs text-[#5A6D5A] mt-0.5">
          Carregue suas planilhas de trabalho em tempo real (.csv, .xlsx ou exportações tabuladas).
          Os registros são validados no navegador e inseridos diretamente no banco de dados.
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
                      Selecionada
                    </Badge>
                  )}
                </div>
                <h3 className="font-bold text-xs text-[#1C2B1C]">{zone.title}</h3>
                <p className="text-[11px] text-[#5A6D5A] mt-1 leading-relaxed">{zone.subtitle}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-[#F0F4F0] text-[10px] text-[#1B5E20] font-semibold">
                Destino: {zone.targetCollection}
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
            accept=".csv,.txt,.tsv"
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
            Formatos aceitos: <strong>.csv</strong> delimitado por vírgula ou ponto-e-vírgula.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[11px] text-[#5A6D5A] border border-[#DCE5DC]">
            <FileText className="w-3.5 h-3.5 text-[#1B5E20]" />
            <span>Colunas sugeridas: {activeZone.expectedHeaders.join(', ')}</span>
          </div>
        </div>

        {/* Mensagem de Erro ou Alerta de Cabeçalhos */}
        {validationError && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Atenção na validação das colunas:</p>
              <p className="mt-0.5 leading-relaxed">{validationError}</p>
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
                  <h5 className="font-bold text-xs text-[#1C2B1C]">{fileName}</h5>
                  <p className="text-[11px] text-[#5A6D5A]">
                    {parsedData.rows.length} linhas identificadas • {parsedData.headers.length}{' '}
                    colunas
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
                  <span>Gravando registros no PocketBase...</span>
                  <span className="font-bold text-[#1B5E20]">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2 rounded-full [&>div]:bg-[#1B5E20]" />
              </div>
            )}

            {/* Resumo da Importação */}
            {importSummary && (
              <div className="p-4 rounded-xl bg-white border border-[#DCE5DC] shadow-sm space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#1C2B1C]">
                  <CheckCircle2 className="w-4 h-4 text-[#2E7D32]" />
                  <span>Resumo da Execução de Carga</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs pt-1">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200">
                    <span className="block text-[10px] text-emerald-700">
                      Inseridos com Sucesso
                    </span>
                    <strong className="text-base font-bold">{importSummary.inseridos}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">
                    <span className="block text-[10px] text-amber-700">Ignorados (Duplicados)</span>
                    <strong className="text-base font-bold">{importSummary.ignorados}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-red-50 text-red-900 border border-red-200">
                    <span className="block text-[10px] text-red-700">Falhas / Erros</span>
                    <strong className="text-base font-bold">{importSummary.erros.length}</strong>
                  </div>
                </div>
                {importSummary.erros.length > 0 && (
                  <div className="text-[11px] text-red-700 bg-red-50/60 p-2.5 rounded-lg border border-red-200 max-h-32 overflow-y-auto">
                    <p className="font-semibold mb-1">Detalhes dos erros:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {importSummary.erros.slice(0, 5).map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Preview das primeiras 10 linhas */}
            <div className="space-y-2">
              <h5 className="font-bold text-xs text-[#1C2B1C]">
                Pré-visualização das 10 primeiras linhas (Mapping Preview)
              </h5>
              <div className="overflow-x-auto border border-[#DCE5DC] rounded-xl max-h-64 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
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
                        {parsedData.headers.map((h, colIdx) => (
                          <td
                            key={colIdx}
                            className="py-1.5 px-3 max-w-[200px] truncate text-[#1C2B1C]"
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
