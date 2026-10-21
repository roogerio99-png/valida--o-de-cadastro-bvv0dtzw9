import React, { useState, useMemo } from 'react'
import {
  FileSpreadsheet,
  Download,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  XCircle,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Building2,
  Calendar,
  X,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollableTable } from '@/components/ScrollableTable'
import type {
  ItemRelatorioIntegracao,
  ContadoresDesfecho,
  DetalheFonteSincronizacao,
  DesfechoIntegracao,
} from '@/types/agro'

interface RelatorioIntegracaoProps {
  titulo?: string
  dataHora: string
  duracaoMs: number
  statusGeral: 'concluido' | 'parcial' | 'falha_total' | string
  autoInclusao: boolean
  fontes: DetalheFonteSincronizacao[]
  itens: ItemRelatorioIntegracao[]
  contadores?: ContadoresDesfecho
  onFechar?: () => void
}

export function PainelRelatorioIntegracao({
  titulo = 'Relatório de Integração',
  dataHora,
  duracaoMs,
  statusGeral,
  autoInclusao,
  fontes,
  itens,
  contadores,
  onFechar,
}: RelatorioIntegracaoProps) {
  // Filtros
  const [busca, setBusca] = useState<string>('')
  const [filtroFonte, setFiltroFonte] = useState<string>('TODAS')
  const [filtroDesfecho, setFiltroDesfecho] = useState<string>('TODOS')

  // Paginação
  const [pagina, setPagina] = useState<number>(1)
  const itensPorPagina = 25

  // Contadores consolidados (usa contadores passados ou calcula a partir dos itens)
  const stats = useMemo(() => {
    if (contadores && contadores.geral) {
      return {
        total: contadores.geral.total || itens.length,
        importados: contadores.geral.importado || 0,
        jaExistentes: contadores.geral.ja_existente || 0,
        atualizados: contadores.geral.atualizado || 0,
        descartados: contadores.geral.descartado || 0,
      }
    }
    const importados = itens.filter((i) => i.desfecho === 'IMPORTADO').length
    const jaExistentes = itens.filter((i) => i.desfecho === 'JA_EXISTENTE').length
    const atualizados = itens.filter((i) => i.desfecho === 'ATUALIZADO').length
    const descartados = itens.filter((i) => i.desfecho === 'DESCARTADO').length
    return {
      total: itens.length,
      importados,
      jaExistentes,
      atualizados,
      descartados,
    }
  }, [contadores, itens])

  // Filtragem dos itens
  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return itens.filter((item) => {
      // Filtro por fonte
      if (filtroFonte !== 'TODAS' && item.fonte !== filtroFonte) {
        return false
      }
      // Filtro por desfecho
      if (filtroDesfecho !== 'TODOS' && item.desfecho !== filtroDesfecho) {
        return false
      }
      // Busca livre
      if (termo) {
        const marca = (item.marca || '').toLowerCase()
        const titular = (item.titular || '').toLowerCase()
        const pa = (item.principio_ativo || '').toLowerCase()
        const mapa = (item.registro_mapa || '').toLowerCase()
        const ncm = (item.ncm || '').toLowerCase()
        const motivo = (item.motivo || '').toLowerCase()
        if (
          !marca.includes(termo) &&
          !titular.includes(termo) &&
          !pa.includes(termo) &&
          !mapa.includes(termo) &&
          !ncm.includes(termo) &&
          !motivo.includes(termo)
        ) {
          return false
        }
      }
      return true
    })
  }, [itens, busca, filtroFonte, filtroDesfecho])

  // Paginação
  const totalPaginas = Math.max(1, Math.ceil(itensFiltrados.length / itensPorPagina))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const itensPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina
    return itensFiltrados.slice(inicio, inicio + itensPorPagina)
  }, [itensFiltrados, paginaAtual, itensPorPagina])

  // Exportar para CSV com BOM UTF-8 e delimitador ;
  const exportarCsv = () => {
    const cabecalho = [
      'Data/Hora Execução',
      'Origem / Fonte',
      'Registro MAPA',
      'Marca / Produto',
      'Titular / Fabricante',
      'Princípio Ativo / Garantias',
      'NCM Classificada',
      'Desfecho da Integração',
      'Motivo / Detalhes do Desfecho',
    ]

    const linhas = itensFiltrados.map((item) => {
      const escape = (val: string | number | undefined | null) => {
        const s = String(val ?? '').replace(/"/g, '""')
        return `"${s}"`
      }
      return [
        escape(new Date(dataHora).toLocaleString('pt-BR')),
        escape(item.fonte_nome || item.fonte),
        escape(item.registro_mapa),
        escape(item.marca),
        escape(item.titular),
        escape(item.principio_ativo),
        escape(item.ncm),
        escape(item.desfecho),
        escape(item.motivo),
      ].join(';')
    })

    const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dataFmt = new Date(dataHora).toISOString().slice(0, 19).replace(/[:T]/g, '-')
    a.href = url
    a.download = `relatorio-integracao-mapa-${dataFmt}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Render badge de desfecho
  const renderBadgeDesfecho = (desfecho: DesfechoIntegracao) => {
    switch (desfecho) {
      case 'IMPORTADO':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-semibold text-xs flex items-center gap-1 w-fit">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Importado
          </Badge>
        )
      case 'JA_EXISTENTE':
        return (
          <Badge className="bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-100 font-semibold text-xs flex items-center gap-1 w-fit">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
            Já Existente
          </Badge>
        )
      case 'ATUALIZADO':
        return (
          <Badge className="bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-100 font-semibold text-xs flex items-center gap-1 w-fit">
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            Atualizado
          </Badge>
        )
      case 'DESCARTADO':
        return (
          <Badge className="bg-red-100 text-red-900 border-red-300 hover:bg-red-100 font-semibold text-xs flex items-center gap-1 w-fit">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            Descartado
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-gray-700">
            {desfecho}
          </Badge>
        )
    }
  }

  return (
    <Card className="border-2 border-emerald-600/30 bg-white shadow-lg overflow-hidden animate-in fade-in-50 duration-300">
      {/* 1. CABEÇALHO DO RELATÓRIO */}
      <CardHeader className="bg-gradient-to-r from-[#0D2811] via-[#1B5E20] to-[#2E7D32] text-white p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-emerald-300">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl font-bold tracking-tight text-white">
                  {titulo}
                </CardTitle>
                <Badge
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    statusGeral === 'concluido'
                      ? 'bg-emerald-400 text-emerald-950'
                      : statusGeral === 'parcial'
                        ? 'bg-amber-300 text-amber-950'
                        : 'bg-red-400 text-red-950'
                  }`}
                >
                  {statusGeral === 'concluido'
                    ? 'Concluído'
                    : statusGeral === 'parcial'
                      ? 'Parcial'
                      : 'Falha Total'}
                </Badge>
              </div>
              <CardDescription className="text-emerald-100/90 text-xs mt-1 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(dataHora).toLocaleString('pt-BR')}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Duração: {(duracaoMs / 1000).toFixed(1)}s
                </span>
                <span>•</span>
                <span>
                  Modo:{' '}
                  <strong>{autoInclusao ? 'Gravação Ativa' : 'Simulação (sem gravação)'}</strong>
                </span>
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <Button
              onClick={exportarCsv}
              size="sm"
              className="bg-white text-[#0D2811] hover:bg-emerald-50 font-bold shadow-sm h-9 flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-[#1B5E20]" />
              Baixar Relatório (.CSV)
            </Button>
            {onFechar && (
              <Button
                onClick={onFechar}
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/10 h-9 w-9 p-0"
                title="Fechar relatório"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* 2. TOTALIZADORES GERAIS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-4 rounded-xl border border-[#DCE5DC] bg-[#FAFBF9]">
            <p className="text-xs font-medium text-[#5A6D5A]">Total Processado</p>
            <p className="text-2xl font-black text-[#1C2B1C] mt-1">{stats.total}</p>
            <p className="text-[11px] text-[#5A6D5A] mt-0.5">Registros do MAPA</p>
          </div>

          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-900">Novos Importados</p>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-1">{stats.importados}</p>
            <p className="text-[11px] text-emerald-800 mt-0.5">Gravados na Base Mestre</p>
          </div>

          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-900">Já Existentes</p>
              <ShieldCheck className="w-4 h-4 text-amber-700" />
            </div>
            <p className="text-2xl font-black text-amber-800 mt-1">{stats.jaExistentes}</p>
            <p className="text-[11px] text-amber-800 mt-0.5">Trava 4 (Desconsiderados)</p>
          </div>

          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-900">Atualizados</p>
              <RefreshCw className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-black text-blue-800 mt-1">{stats.atualizados}</p>
            <p className="text-[11px] text-blue-800 mt-0.5">Dados enriquecidos</p>
          </div>

          <div className="p-4 rounded-xl border border-red-200 bg-red-50/70 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-red-900">Descartados / Erros</p>
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-black text-red-700 mt-1">{stats.descartados}</p>
            <p className="text-[11px] text-red-800 mt-0.5">Incompletos ou rejeitados</p>
          </div>
        </div>

        {/* 3. RESUMO POR FONTE (3 FONTES OFICIAIS DO MAPA) */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#5A6D5A] mb-3 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#1B5E20]" />
            Resumo da Integração por Fonte Governamental
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {fontes.map((f) => {
              const fKey = f.fonte
              const cFonte = contadores?.por_fonte?.[fKey]
              const totalBaixado = cFonte?.total ?? f.total_baixado
              const novos = cFonte?.importado ?? f.novos_cadastrados
              const jaEx = cFonte?.ja_existente ?? f.ignorados_duplicidade
              const at = cFonte?.atualizado ?? f.atualizados
              const desc = cFonte?.descartado ?? (f.descartados || 0)

              return (
                <div
                  key={f.fonte}
                  className="rounded-xl border border-[#DCE5DC] bg-[#FAFBF9] p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-[#1C2B1C]">{f.nome}</span>
                      <Badge
                        className={`text-[10px] font-semibold ${
                          f.status === 'concluido'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {f.status === 'concluido' ? 'Disponível' : 'Indisponível'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-[#5A6D5A] mb-3 leading-snug">{f.mensagem}</p>
                  </div>

                  <div className="pt-3 border-t border-[#DCE5DC] grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2 rounded-lg border border-[#DCE5DC]">
                      <span className="text-[10px] text-[#5A6D5A] block">Baixados</span>
                      <strong className="text-sm font-bold text-[#1C2B1C] font-mono">
                        {totalBaixado}
                      </strong>
                    </div>
                    <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-900 block font-medium">
                        Importados
                      </span>
                      <strong className="text-sm font-bold text-emerald-700 font-mono">
                        {novos}
                      </strong>
                    </div>
                    <div className="bg-amber-50/60 p-2 rounded-lg border border-amber-200">
                      <span className="text-[10px] text-amber-900 block font-medium">
                        Já Existentes
                      </span>
                      <strong className="text-sm font-bold text-amber-800 font-mono">{jaEx}</strong>
                    </div>
                    <div className="bg-blue-50/60 p-2 rounded-lg border border-blue-200">
                      <span className="text-[10px] text-blue-900 block font-medium">
                        Atualizados / Desc.
                      </span>
                      <strong className="text-sm font-bold text-blue-800 font-mono">
                        {at} <span className="text-red-600 font-normal text-xs">/ {desc}</span>
                      </strong>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 4. FILTROS E BUSCA NA TABELA DE ITENS */}
        <div className="pt-2 border-t border-[#DCE5DC] space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#1C2B1C] flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-[#1B5E20]" />
                Registros Processados Item a Item ({itensFiltrados.length} de {itens.length})
              </h3>
              <p className="text-xs text-[#5A6D5A]">
                Detalhamento individual de cada produto consultado no MAPA com classificação e
                motivo do desfecho.
              </p>
            </div>

            {/* Controles de filtro */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro por Fonte */}
              <select
                value={filtroFonte}
                onChange={(e) => {
                  setFiltroFonte(e.target.value)
                  setPagina(1)
                }}
                className="bg-white border border-[#DCE5DC] rounded-lg px-2.5 py-1.5 text-xs text-[#1C2B1C] focus:ring-1 focus:ring-[#1B5E20]"
              >
                <option value="TODAS">Todas as Fontes</option>
                <option value="AGROFIT_FORMULADO">AGROFIT Formulados</option>
                <option value="AGROFIT_TECNICO">AGROFIT Técnicos</option>
                <option value="SIPEAGRO">SIPEAGRO Fertilizantes</option>
              </select>

              {/* Filtro por Desfecho */}
              <select
                value={filtroDesfecho}
                onChange={(e) => {
                  setFiltroDesfecho(e.target.value)
                  setPagina(1)
                }}
                className="bg-white border border-[#DCE5DC] rounded-lg px-2.5 py-1.5 text-xs text-[#1C2B1C] focus:ring-1 focus:ring-[#1B5E20]"
              >
                <option value="TODOS">Todos os Desfechos</option>
                <option value="IMPORTADO">Apenas Importados</option>
                <option value="JA_EXISTENTE">Apenas Já Existentes</option>
                <option value="ATUALIZADO">Apenas Atualizados</option>
                <option value="DESCARTADO">Apenas Descartados</option>
              </select>

              {/* Busca Livre */}
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value)
                    setPagina(1)
                  }}
                  placeholder="Buscar produto, titular, MAPA..."
                  className="pl-8 h-8 text-xs border-[#DCE5DC] bg-white"
                />
              </div>
            </div>
          </div>

          {/* TABELA PAGINADA DE ITENS */}
          <div className="border border-[#DCE5DC] rounded-xl overflow-hidden bg-white shadow-sm flex flex-col">
            <ScrollableTable autoFitHeight={true} bottomOffset={76}>
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-[#FAFBF9] shadow-[0_1px_0_0_#DCE5DC]">
                  <TableRow className="bg-[#FAFBF9]">
                    <TableHead className="w-[120px]">Registro MAPA</TableHead>
                    <TableHead className="min-w-[180px]">Marca / Produto</TableHead>
                    <TableHead className="min-w-[150px]">Titular / Fabricante</TableHead>
                    <TableHead className="min-w-[160px]">Princípio Ativo</TableHead>
                    <TableHead className="w-[100px]">NCM</TableHead>
                    <TableHead className="w-[130px]">Fonte</TableHead>
                    <TableHead className="w-[130px]">Desfecho</TableHead>
                    <TableHead className="min-w-[260px]">Motivo / Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensPaginados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-xs text-[#5A6D5A]">
                        Nenhum registro encontrado para os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    itensPaginados.map((item, idx) => (
                      <TableRow
                        key={idx}
                        className={`hover:bg-[#FAFBF9] transition-colors ${
                          item.desfecho === 'IMPORTADO'
                            ? 'bg-emerald-50/20'
                            : item.desfecho === 'JA_EXISTENTE'
                              ? 'bg-amber-50/15'
                              : item.desfecho === 'ATUALIZADO'
                                ? 'bg-blue-50/15'
                                : 'bg-red-50/15'
                        }`}
                      >
                        <TableCell className="font-mono text-xs font-semibold text-[#1C2B1C]">
                          {item.registro_mapa || 'N/D'}
                        </TableCell>
                        <TableCell className="font-semibold text-xs text-[#1C2B1C]">
                          {item.marca}
                        </TableCell>
                        <TableCell className="text-xs text-[#5A6D5A]">
                          {item.titular || 'Não informado'}
                        </TableCell>
                        <TableCell className="text-xs text-[#1C2B1C]">
                          {item.principio_ativo || 'N/D'}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-emerald-800">
                          {item.ncm || 'N/D'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                            {item.fonte_nome || item.fonte}
                          </Badge>
                        </TableCell>
                        <TableCell>{renderBadgeDesfecho(item.desfecho)}</TableCell>
                        <TableCell className="text-xs text-[#5A6D5A] leading-relaxed">
                          {item.motivo}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollableTable>

            {/* Paginação */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#FAFBF9] border-t border-[#DCE5DC] text-xs">
              <span className="text-[#5A6D5A]">
                Mostrando {itensFiltrados.length === 0 ? 0 : (paginaAtual - 1) * itensPorPagina + 1}{' '}
                a {Math.min(paginaAtual * itensPorPagina, itensFiltrados.length)} de{' '}
                {itensFiltrados.length} registros
              </span>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual <= 1}
                  className="h-8 px-2.5 text-xs border-[#DCE5DC]"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  Anterior
                </Button>
                <span className="font-medium text-[#1C2B1C]">
                  Página {paginaAtual} de {totalPaginas}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual >= totalPaginas}
                  className="h-8 px-2.5 text-xs border-[#DCE5DC]"
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
