import { useEffect, useState } from 'react'
import { ShieldAlert, CheckCircle2, XCircle, Percent, Clock, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { listarLogValidacoes } from '@/services/agroService'
import { useRealtime } from '@/hooks/use-realtime'
import type { LogValidacao } from '@/types/agro'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface TravaStats {
  id: number
  nome: string
  totalDisparado: number
  aprovadas: number
  reprovadas: number
  taxaAprovacao: number
  ultimoDisparo: string | null
}

const TRAVAS_DEFINICAO = [
  { id: 1, nome: 'NCM Obrigatório' },
  { id: 2, nome: 'Embalagem vs NCM' },
  { id: 3, nome: 'Princípio Ativo Obrigatório' },
  { id: 4, nome: 'Duplicidade de Cadastro' },
  { id: 5, nome: 'Concentração Válida' },
  { id: 6, nome: 'Registro MAPA' },
]

export function Travas() {
  const [stats, setStats] = useState<TravaStats[]>([])
  const [logs, setLogs] = useState<LogValidacao[]>([])
  const [loading, setLoading] = useState(true)

  const carregarDados = async () => {
    try {
      const logsRes = await listarLogValidacoes({ perPage: 150, sort: '-created' })
      setLogs(logsRes.items)

      // Agregar estatísticas por ID da trava
      const statsMap: Record<number, TravaStats> = {}
      TRAVAS_DEFINICAO.forEach((t) => {
        statsMap[t.id] = {
          id: t.id,
          nome: t.nome,
          totalDisparado: 0,
          aprovadas: 0,
          reprovadas: 0,
          taxaAprovacao: 100,
          ultimoDisparo: null,
        }
      })

      logsRes.items.forEach((item) => {
        const id = item.id_trava
        if (statsMap[id]) {
          statsMap[id].totalDisparado++
          if (item.aprovado) {
            statsMap[id].aprovadas++
          } else {
            statsMap[id].reprovadas++
          }
          if (!statsMap[id].ultimoDisparo) {
            statsMap[id].ultimoDisparo = item.created
          }
        }
      })

      // Calcular taxas
      const resultadoFinal = Object.values(statsMap).map((s) => {
        const taxa = s.totalDisparado > 0 ? Math.round((s.aprovadas / s.totalDisparado) * 100) : 100
        return {
          ...s,
          taxaAprovacao: taxa,
        }
      })

      setStats(resultadoFinal)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  useRealtime('log_validacoes', () => carregarDados())

  const chartData = stats.map((s) => ({
    trava: `T${s.id}`,
    nome: s.nome,
    Aprovadas: s.aprovadas,
    Reprovadas: s.reprovadas,
  }))

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-[#C62828]" />
          <span>Monitoramento das Travas de Auditoria</span>
        </h2>
        <p className="text-xs text-[#5A6D5A] mt-0.5">
          Estatísticas detalhadas de bloqueio, taxas de assertividade e trilha de auditoria em
          conformidade regulatória.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 6 CARDS-RESUMO, UM POR TRAVA */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card
            key={s.id}
            className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm hover:shadow-md transition-all duration-200"
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-900 border-emerald-200 text-[10px] font-bold"
                >
                  Trava 0{s.id}
                </Badge>
                <span className="text-xs font-bold text-[#1C2B1C] flex items-center gap-1">
                  <Percent className="w-3 h-3 text-[#1B5E20]" />
                  {s.taxaAprovacao}% aprovação
                </span>
              </div>
              <CardTitle className="text-sm font-bold text-[#1C2B1C] mt-1">{s.nome}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={s.taxaAprovacao} className="h-2 rounded-full [&>div]:bg-[#2E7D32]" />

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#2E7D32]" />
                  <span className="text-[#5A6D5A]">
                    {s.aprovadas} aprovada{s.aprovadas !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-[#C62828]" />
                  <span className="text-[#5A6D5A]">
                    {s.reprovadas} bloqueada{s.reprovadas !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#F0F4F0] flex items-center justify-between text-[11px] text-[#5A6D5A]">
                <span>Total disparos: {s.totalDisparado}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#5A6D5A]" />
                  {s.ultimoDisparo
                    ? new Date(s.ultimoDisparo).toLocaleDateString('pt-BR')
                    : 'Sem histórico'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* GRÁFICO COMPARATIVO: APROVADO VS REPROVADO POR TRAVA */}
      {/* ------------------------------------------------------------------ */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold text-[#1C2B1C]">
            Comparativo de Eficácia por Trava Regulamentar
          </CardTitle>
          <CardDescription className="text-xs text-[#5A6D5A]">
            Contagem acumulada de aprovações e bloqueios acionados pelo motor de auditoria
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {stats.every((s) => s.totalDisparado === 0) ? (
            <div className="h-full flex items-center justify-center text-xs text-[#5A6D5A]">
              Nenhuma validação registrada ainda. Teste um produto na tela "Validar Cadastro".
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="trava" tick={{ fontSize: 11, fill: '#5A6D5A' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5A6D5A' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #DCE5DC',
                    fontSize: '12px',
                  }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Aprovadas" fill="#2E7D32" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Reprovadas" fill="#C62828" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* HISTÓRICO COMPLETO DE LOG_VALIDAÇÕES */}
      {/* ------------------------------------------------------------------ */}
      <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base font-bold text-[#1C2B1C]">
            Trilha de Auditoria e Histórico de Eventos
          </CardTitle>
          <CardDescription className="text-xs text-[#5A6D5A]">
            Registro imutável das análises realizadas para fins de compliance fiscal e agrônomo
          </CardDescription>
        </CardHeader>
        <ScrollableTable>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F7F1] border-b border-[#DCE5DC] text-left text-[#5A6D5A]">
                <th className="py-3 px-4 font-semibold">Data / Hora</th>
                <th className="py-3 px-4 font-semibold">Produto Auditado</th>
                <th className="py-3 px-4 font-semibold">NCM</th>
                <th className="py-3 px-4 font-semibold">Trava</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Diagnóstico da Trava</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[#5A6D5A]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1B5E20] mb-2" />
                    Carregando trilha de auditoria...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[#5A6D5A]">
                    Nenhum log de auditoria gerado até o momento.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F5F7F1]/50 transition-colors">
                    <td className="py-3 px-4 text-[#5A6D5A] whitespace-nowrap">
                      {new Date(log.created).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 font-bold text-[#1C2B1C] max-w-[200px] truncate">
                      {log.nome_produto}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[#1B5E20] whitespace-nowrap">
                      {log.ncm || '—'}
                    </td>
                    <td className="py-3 px-4 text-[#1C2B1C] whitespace-nowrap">{log.trava_nome}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.aprovado ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 flex items-center gap-1 w-fit text-[10px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          Aprovado
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-0 flex items-center gap-1 w-fit text-[10px]">
                          <XCircle className="w-3 h-3 text-red-700" />
                          Bloqueado
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#5A6D5A] max-w-[340px] truncate">
                      {log.mensagem}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollableTable>
      </Card>
    </div>
  )
}
