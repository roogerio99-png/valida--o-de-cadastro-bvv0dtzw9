import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
  Cell,
  ComposedChart,
  Line,
} from 'recharts'
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  BarChart3,
  Activity,
  ArrowUpRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface MetricaValidacaoTrava {
  trava: string
  travaCurta: string
  aprovados: number
  erros: number
  taxaConformidade: number
}

export interface ErroPorTipoItem {
  tipo: string
  categoria: string
  quantidade: number
  percentual: number
  cor: string
}

export interface ProgressoSincronizacaoMensalItem {
  mes: string
  consultados: number
  homologados: number
  atualizados: number
  erros: number
}

interface DashboardAnalyticsChartsProps {
  metricasValidacao: MetricaValidacaoTrava[]
  errosPorTipo: ErroPorTipoItem[]
  sincronizacaoMensal: ProgressoSincronizacaoMensalItem[]
  loading?: boolean
}

export const DashboardAnalyticsCharts: React.FC<DashboardAnalyticsChartsProps> = ({
  metricasValidacao,
  errosPorTipo,
  sincronizacaoMensal,
  loading = false,
}) => {
  const navigate = useNavigate()
  const [periodoSync, setPeriodoSync] = useState<'6m' | '3m'>('6m')

  const totalAprovados = metricasValidacao.reduce((acc, item) => acc + item.aprovados, 0)
  const totalErros = errosPorTipo.reduce((acc, item) => acc + item.quantidade, 0)
  const totalAvaliacoes = totalAprovados + totalErros
  const taxaGlobalConformidade =
    totalAvaliacoes > 0 ? Math.round((totalAprovados / totalAvaliacoes) * 1000) / 10 : 100

  const dadosSyncExibidos =
    periodoSync === '3m' ? sincronizacaoMensal.slice(-3) : sincronizacaoMensal

  const ultimoMesSync =
    sincronizacaoMensal.length > 0
      ? sincronizacaoMensal[sincronizacaoMensal.length - 1]
      : { mes: 'Atual', consultados: 0, homologados: 0, atualizados: 0, erros: 0 }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Seção Analítica com Resumo Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#DCE5DC] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-[#1B5E20] flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#1C2B1C]">
                Inteligência Analítica de Validação e Sincronização
              </h3>
              <Badge className="bg-emerald-100 text-[#1B5E20] hover:bg-emerald-100 border-0 text-[10px] font-semibold">
                Tempo Real
              </Badge>
            </div>
            <p className="text-xs text-[#5A6D5A]">
              Desempenho das 6 travas regulatórias, diagnóstico de divergências por tipo e evolução
              mensal de sincronização MAPA/AGROFIT
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F0F4F0]">
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5A6D5A] block">
              Índice de Conformidade
            </span>
            <span className="text-lg font-bold text-[#1B5E20]">{taxaGlobalConformidade}%</span>
          </div>
          <div className="h-8 w-px bg-[#DCE5DC]" />
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5A6D5A] block">
              Verificações Totais
            </span>
            <span className="text-lg font-bold text-[#1C2B1C]">
              {totalAvaliacoes.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
      </div>

      {/* Grid Principal: Produtos Validados por Trava + Erros Encontrados por Tipo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Métricas de Produtos Validados por Trava Regulatória */}
        <Card className="lg:col-span-7 rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#2E7D32]" />
                  Métricas de Produtos Validados por Trava
                </CardTitle>
                <CardDescription className="text-xs text-[#5A6D5A] mt-0.5">
                  Comparativo entre aprovações e bloqueios nas 6 travas de auditoria fiscal e
                  regulatória
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/validar')}
                className="h-8 text-xs rounded-xl border-[#DCE5DC] text-[#1B5E20] hover:bg-emerald-50 shrink-0"
              >
                <span>Validar Produto</span>
                <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {loading ? (
                <div className="h-full flex items-center justify-center text-xs text-[#5A6D5A]">
                  Carregando métricas de validação...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={metricasValidacao}
                    margin={{ top: 12, right: 12, left: -16, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EFE8" />
                    <XAxis
                      dataKey="travaCurta"
                      tick={{ fontSize: 11, fill: '#5A6D5A', fontWeight: 500 }}
                      axisLine={{ stroke: '#DCE5DC' }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: '#5A6D5A' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      unit="%"
                      tick={{ fontSize: 10, fill: '#2E7D32' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #DCE5DC',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, name: string) => {
                        if (name === 'Conformidade (%)') return [`${value}%`, name]
                        return [value, name]
                      }}
                      labelFormatter={(label, payload) => {
                        const fullLabel = payload?.[0]?.payload?.trava
                        return fullLabel || label
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar
                      yAxisId="left"
                      dataKey="aprovados"
                      name="Validados (OK)"
                      fill="#1B5E20"
                      radius={[6, 6, 0, 0]}
                      barSize={24}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="erros"
                      name="Com Divergência"
                      fill="#C62828"
                      radius={[6, 6, 0, 0]}
                      barSize={24}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="taxaConformidade"
                      name="Conformidade (%)"
                      stroke="#F57F17"
                      strokeWidth={2}
                      dot={{ r: 3.5, fill: '#F57F17', strokeWidth: 1.5, stroke: '#FFFFFF' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Erros Encontrados por Tipo */}
        <Card className="lg:col-span-5 rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#C62828]" />
                  Erros Encontrados por Tipo
                </CardTitle>
                <CardDescription className="text-xs text-[#5A6D5A] mt-0.5">
                  Incidência de não-conformidades fiscais, NCM/embalagem e registro MAPA
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/travas')}
                className="h-8 text-xs text-[#C62828] hover:text-red-800 hover:bg-red-50 shrink-0"
              >
                Auditar Travas
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-52 w-full">
              {loading ? (
                <div className="h-full flex items-center justify-center text-xs text-[#5A6D5A]">
                  Analisando tipos de erro...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={errosPorTipo}
                    layout="vertical"
                    margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E8EFE8" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#5A6D5A' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="tipo"
                      width={132}
                      tick={{ fontSize: 11, fill: '#1C2B1C', fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #DCE5DC',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, _name: string, props: any) => [
                        `${value} ocorrência(s) (${props?.payload?.percentual ?? 0}%)`,
                        props?.payload?.categoria || 'Ocorrências',
                      ]}
                    />
                    <Bar dataKey="quantidade" name="Ocorrências" radius={[0, 6, 6, 0]} barSize={18}>
                      {errosPorTipo.map((entry, idx) => (
                        <Cell key={`err-cell-${idx}`} fill={entry.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Lista compacta de legendas de erro com percentual */}
            <div className="mt-3 pt-3 border-t border-[#F0F4F0] grid grid-cols-2 gap-2">
              {errosPorTipo.slice(0, 4).map((err, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#F5F7F1]/70 text-xs"
                >
                  <div className="flex items-center gap-1.5 truncate pr-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: err.cor }}
                    />
                    <span className="text-[#1C2B1C] font-medium truncate">{err.tipo}</span>
                  </div>
                  <span className="font-mono font-bold text-[#5A6D5A] shrink-0">
                    {err.quantidade} ({err.percentual}%)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Progresso de Sincronização Mensal (MAPA / AGROFIT / SIPEAGRO) */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#1B5E20]" />
                Progresso de Sincronização Mensal (MAPA / AGROFIT & Base Mestre)
              </CardTitle>
              <CardDescription className="text-xs text-[#5A6D5A] mt-0.5">
                Evolução mensal de produtos consultados nas bases oficiais, novos registros
                homologados e atualizações cadastrais
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl border border-[#DCE5DC] p-0.5 bg-[#F5F7F1]">
                <button
                  type="button"
                  onClick={() => setPeriodoSync('3m')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    periodoSync === '3m'
                      ? 'bg-[#1B5E20] text-white shadow-xs'
                      : 'text-[#5A6D5A] hover:text-[#1C2B1C]'
                  }`}
                >
                  Últimos 3 Meses
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodoSync('6m')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    periodoSync === '6m'
                      ? 'bg-[#1B5E20] text-white shadow-xs'
                      : 'text-[#5A6D5A] hover:text-[#1C2B1C]'
                  }`}
                >
                  Semestral (6M)
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/sincronizacao')}
                className="h-8 text-xs rounded-xl border-[#DCE5DC] text-[#1B5E20] hover:bg-emerald-50"
              >
                <Activity className="w-3.5 h-3.5 mr-1.5" />
                <span>Central de Sincronização</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-center">
            <div className="lg:col-span-3 h-64 w-full">
              {loading ? (
                <div className="h-full flex items-center justify-center text-xs text-[#5A6D5A]">
                  Carregando histórico mensal de sincronização...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={dadosSyncExibidos}
                    margin={{ top: 10, right: 16, left: -16, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="gradConsultados" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1B5E20" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#1B5E20" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradHomologados" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2E7D32" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2E7D32" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="gradAtualizados" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F57F17" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#F57F17" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EFE8" />
                    <XAxis
                      dataKey="mes"
                      tick={{ fontSize: 11, fill: '#5A6D5A', fontWeight: 500 }}
                      axisLine={{ stroke: '#DCE5DC' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#5A6D5A' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #DCE5DC',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Area
                      type="monotone"
                      dataKey="consultados"
                      name="Consultados no MAPA/AGROFIT"
                      stroke="#1B5E20"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#gradConsultados)"
                    />
                    <Area
                      type="monotone"
                      dataKey="homologados"
                      name="Homologados na Base Mestre"
                      stroke="#2E7D32"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#gradHomologados)"
                    />
                    <Area
                      type="monotone"
                      dataKey="atualizados"
                      name="Atualizados (NCM / Faixa TIPI)"
                      stroke="#F57F17"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#gradAtualizados)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Resumo Lateral do Ciclo Mensal Atual */}
            <div className="space-y-3 bg-[#F5F7F1]/70 border border-[#DCE5DC] rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1C2B1C]">
                  Ciclo Vigente ({ultimoMesSync.mes})
                </span>
                <Badge className="bg-emerald-100 text-[#1B5E20] hover:bg-emerald-100 border-0 text-[10px]">
                  Sincronizado
                </Badge>
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="bg-white rounded-xl p-3 border border-[#E6ECE6]">
                  <span className="text-[11px] text-[#5A6D5A] block">
                    Itens Auditados no Mês
                  </span>
                  <div className="flex items-baseline justify-between mt-0.5">
                    <span className="text-xl font-bold text-[#1B5E20]">
                      {ultimoMesSync.consultados.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 flex items-center">
                      <TrendingUp className="w-3 h-3 mr-0.5" /> 100% processado
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-3 border border-[#E6ECE6]">
                  <span className="text-[11px] text-[#5A6D5A] block">
                    Homologados & Atualizados
                  </span>
                  <div className="flex items-baseline justify-between mt-0.5">
                    <span className="text-xl font-bold text-[#1C2B1C]">
                      {(ultimoMesSync.homologados + ultimoMesSync.atualizados).toLocaleString(
                        'pt-BR',
                      )}
                    </span>
                    <span className="text-[11px] text-[#5A6D5A]">
                      {ultimoMesSync.atualizados} revisões NCM
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-3 border border-[#E6ECE6] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#F57F17]" />
                    <span className="text-xs font-medium text-[#1C2B1C]">Divergências no Ciclo</span>
                  </div>
                  <span className="text-sm font-bold text-[#C62828]">{ultimoMesSync.erros}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default DashboardAnalyticsCharts
