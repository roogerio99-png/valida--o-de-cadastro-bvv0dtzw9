import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Boxes,
  FileCheck2,
  FlaskConical,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  Copy,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import type { LogValidacao } from '@/types/agro'
import { obterRelatorioDuplicidades } from '@/services/agroService'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

const PIE_COLORS = ['#2E7D32', '#C62828', '#F57F17']

export function Dashboard() {
  const navigate = useNavigate()
  const [totalProdutos, setTotalProdutos] = useState<number>(0)
  const [totalRegras, setTotalRegras] = useState<number>(0)
  const [totalPrincipios, setTotalPrincipios] = useState<number>(0)
  const [totalTravasDisparadas, setTotalTravasDisparadas] = useState<number>(0)
  const [totalDuplicados, setTotalDuplicados] = useState<number>(0)
  const [totalGruposDuplicados, setTotalGruposDuplicados] = useState<number>(0)
  const [recentLogs, setRecentLogs] = useState<LogValidacao[]>([])
  const [ncmBarData, setNcmBarData] = useState<{ capitulo: string; quantidade: number }[]>([])
  const [statusPieData, setStatusPieData] = useState<{ name: string; value: number }[]>([
    { name: 'Aprovados', value: 0 },
    { name: 'Reprovados', value: 0 },
    { name: 'Pendentes', value: 0 },
  ])
  const [loading, setLoading] = useState(true)

  const carregarDados = async () => {
    try {
      // 1. Contagens rápidas das collections
      const resBase = await pb.collection('base_mestre').getList(1, 1)
      const resRegras = await pb.collection('regras_ncm_embalagem').getList(1, 1)
      const resPrincipios = await pb.collection('dicionario_principios_ativos').getList(1, 1)
      const resTravasFalhas = await pb.collection('log_validacoes').getList(1, 1, {
        filter: 'aprovado = false',
      })

      setTotalProdutos(resBase.totalItems)
      setTotalRegras(resRegras.totalItems)
      setTotalPrincipios(resPrincipios.totalItems)
      setTotalTravasDisparadas(resTravasFalhas.totalItems)

      // 1.1 Consulta de duplicidades no servidor
      try {
        const dupRes = await obterRelatorioDuplicidades()
        setTotalDuplicados(dupRes.total_produtos_duplicados || 0)
        setTotalGruposDuplicados(dupRes.total_grupos || 0)
      } catch (dupErr) {
        console.warn('Erro ao carregar indicador de duplicidades:', dupErr)
      }

      // 2. Logs recentes
      const logsRes = await pb.collection('log_validacoes').getList<LogValidacao>(1, 6, {
        sort: '-created',
      })
      setRecentLogs(logsRes.items)

      // 3. Distribuição por status da Base Mestre
      const aprovadosRes = await pb.collection('base_mestre').getList(1, 1, {
        filter: "status_validacao = 'aprovado'",
      })
      const reprovadosRes = await pb.collection('base_mestre').getList(1, 1, {
        filter: "status_validacao = 'reprovado'",
      })
      const pendentesRes = await pb.collection('base_mestre').getList(1, 1, {
        filter: "status_validacao = 'pendente'",
      })

      setStatusPieData([
        { name: 'Aprovados', value: aprovadosRes.totalItems },
        { name: 'Reprovados', value: reprovadosRes.totalItems },
        { name: 'Pendentes', value: pendentesRes.totalItems },
      ])

      // 4. Agrupamento por capítulo NCM (primeiros 2 dígitos) a partir dos primeiros 100 itens
      const amostragem = await pb.collection('base_mestre').getList(1, 100, {
        fields: 'ncm,ncm_padrao',
      })
      const mapCapitulos: Record<string, number> = {}
      amostragem.items.forEach((item) => {
        const rawNcm = String(item.ncm_padrao || item.ncm || '').replace(/\D/g, '')
        const cap = rawNcm.length >= 2 ? `Cap. ${rawNcm.slice(0, 2)}` : 'Outros'
        mapCapitulos[cap] = (mapCapitulos[cap] || 0) + 1
      })

      const barFormatted = Object.keys(mapCapitulos).map((k) => ({
        capitulo: k,
        quantidade: mapCapitulos[k],
      }))

      setNcmBarData(
        barFormatted.length > 0
          ? barFormatted.slice(0, 8)
          : [
              { capitulo: 'Cap. 38 (Química)', quantidade: 0 },
              { capitulo: 'Cap. 31 (Adubos)', quantidade: 0 },
              { capitulo: 'Cap. 12 (Sementes)', quantidade: 0 },
            ],
      )
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Atualização em tempo real quando houver novas validações ou cadastros
  useRealtime('log_validacoes', () => carregarDados())
  useRealtime('base_mestre', () => carregarDados())
  useRealtime('regras_ncm_embalagem', () => carregarDados())

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Top Banner de Ações Rápidas */}
      <div className="bg-gradient-to-r from-[#1B5E20] via-[#246B2A] to-[#0D3B0F] rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 text-xs text-emerald-200 mb-2 font-medium backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Sistema em conformidade com Tabela TIPI 2025
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Painel de Auditoria Agropecuária</h2>
          <p className="text-emerald-100 text-sm mt-1 max-w-2xl">
            Monitore a conformidade de defensivos, fertilizantes e sementes em tempo real. Importe
            suas planilhas operacionais e execute auditorias instantâneas com as 6 travas ativas.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button
            onClick={() => navigate('/validar')}
            className="bg-[#F57F17] hover:bg-[#F9A825] text-white font-semibold rounded-xl px-5 h-11 flex items-center gap-2 shadow-md flex-1 md:flex-initial"
          >
            <span>Nova Validação</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/importar')}
            className="bg-white/10 hover:bg-white/20 text-white border-white/30 rounded-xl px-4 h-11 flex items-center gap-2 backdrop-blur-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Importar</span>
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5 CARDS DE KPIS (INCLUINDO DUPLICIDADES) */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#5A6D5A]">
              Total de Produtos
            </CardTitle>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1C2B1C]">
              {loading ? '...' : totalProdutos.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-[#5A6D5A] mt-1 flex items-center gap-1">
              <span className="text-[#2E7D32] font-semibold flex items-center">
                <TrendingUp className="w-3 h-3 mr-0.5" /> Base Mestre
              </span>
              <span>sincronizada</span>
            </p>
          </CardContent>
        </Card>

        {/* CARD PRODUTOS EM DUPLICIDADE */}
        <Card
          onClick={() => navigate('/base-mestre')}
          className={`rounded-2xl border transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md ${
            totalDuplicados > 0
              ? 'border-amber-300 bg-amber-50/30 hover:border-amber-400'
              : 'border-[#DCE5DC] bg-white'
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#5A6D5A]">
              Em Duplicidade
            </CardTitle>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                totalDuplicados > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-[#1B5E20]'
              }`}
            >
              <Copy className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                totalDuplicados > 0 ? 'text-amber-800' : 'text-[#1C2B1C]'
              }`}
            >
              {loading ? '...' : totalDuplicados.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-[#5A6D5A] mt-1 flex items-center justify-between">
              <span>{totalGruposDuplicados} grupos detectados</span>
              <span className="text-[10px] text-amber-700 font-semibold underline">
                Ver análise
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#5A6D5A]">
              Regras Ativas (NCM)
            </CardTitle>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1C2B1C]">
              {loading ? '...' : totalRegras.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-[#5A6D5A] mt-1">Matriz NCM × Embalagem</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#5A6D5A]">
              Princípios Ativos
            </CardTitle>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#F57F17] flex items-center justify-center">
              <FlaskConical className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1C2B1C]">
              {loading ? '...' : totalPrincipios.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-[#5A6D5A] mt-1">Dicionário Regulatório</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#5A6D5A]">
              Travas Disparadas
            </CardTitle>
            <div className="w-9 h-9 rounded-xl bg-red-50 text-[#C62828] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#C62828]">
              {loading ? '...' : totalTravasDisparadas.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-[#5A6D5A] mt-1">Alertas e não-conformidades</p>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* GRÁFICOS: BARRAS POR CAPÍTULO NCM + PIE DE STATUS */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Barras */}
        <Card className="lg:col-span-2 rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold text-[#1C2B1C]">
              Concentração de Produtos por Capítulo NCM
            </CardTitle>
            <CardDescription className="text-xs text-[#5A6D5A]">
              Distribuição dos registros cadastrados conforme capítulos da Tabela TIPI
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {ncmBarData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[#5A6D5A]">
                Nenhum dado importado na Base Mestre ainda.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ncmBarData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="capitulo" tick={{ fontSize: 11, fill: '#5A6D5A' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#5A6D5A' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '12px',
                      border: '1px solid #DCE5DC',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="quantidade" fill="#1B5E20" radius={[6, 6, 0, 0]} name="Produtos" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de Pizza - Status */}
        <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold text-[#1C2B1C]">
              Distribuição por Status
            </CardTitle>
            <CardDescription className="text-xs text-[#5A6D5A]">
              Situação cadastral na Base Mestre
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72 flex items-center justify-center">
            {statusPieData.every((d) => d.value === 0) ? (
              <div className="text-center text-xs text-[#5A6D5A] px-4">
                <p>Nenhum produto cadastrado.</p>
                <Button
                  variant="link"
                  onClick={() => navigate('/importar')}
                  className="text-xs text-[#1B5E20] font-semibold mt-1"
                >
                  Importar planilha agora
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '12px',
                      border: '1px solid #DCE5DC',
                      fontSize: '12px',
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* TABELA DE ATIVIDADE RECENTE (LOGS DE VALIDAÇÃO) */}
      {/* ------------------------------------------------------------------ */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-[#1C2B1C]">
              Atividades Recentes de Auditoria
            </CardTitle>
            <CardDescription className="text-xs text-[#5A6D5A]">
              Histórico em tempo real dos disparos das travas e testes de validação
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/travas')}
            className="text-xs text-[#1B5E20] hover:text-[#2E7D32] hover:bg-emerald-50"
          >
            Ver histórico completo
          </Button>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <div className="text-center py-8 text-xs text-[#5A6D5A]">
              Nenhuma validação executada recentemente. Clique em "Nova Validação" para testar um
              produto.
            </div>
          ) : (
            <ScrollableTable maxHeight="420px">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_0_#DCE5DC]">
                  <tr className="border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                    <th className="pb-2 font-semibold">Horário</th>
                    <th className="pb-2 font-semibold">Produto</th>
                    <th className="pb-2 font-semibold">NCM</th>
                    <th className="pb-2 font-semibold">Trava Testada</th>
                    <th className="pb-2 font-semibold">Veredito</th>
                    <th className="pb-2 font-semibold">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F0]">
                  {recentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F5F7F1]/60 transition-colors">
                      <td className="py-2.5 text-[#5A6D5A] flex items-center gap-1.5 whitespace-nowrap">
                        <Clock className="w-3.5 h-3.5 text-[#5A6D5A]" />
                        {new Date(log.created).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 font-medium text-[#1C2B1C] max-w-[180px] truncate">
                        {log.nome_produto || 'Produto sem nome'}
                      </td>
                      <td className="py-2.5 font-mono text-[#1B5E20] font-semibold">
                        {log.ncm || '—'}
                      </td>
                      <td className="py-2.5 text-[#1C2B1C]">{log.trava_nome}</td>
                      <td className="py-2.5">
                        {log.aprovado ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 flex items-center gap-1 w-fit">
                            <CheckCircle className="w-3 h-3 text-emerald-700" />
                            Aprovado
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-0 flex items-center gap-1 w-fit">
                            <XCircle className="w-3 h-3 text-red-700" />
                            Bloqueado
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 text-[#5A6D5A] max-w-[260px] truncate">
                        {log.mensagem}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
