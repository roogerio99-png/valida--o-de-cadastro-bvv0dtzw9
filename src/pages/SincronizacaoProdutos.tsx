import React, { useState, useEffect, useCallback } from 'react'
import {
  CloudSync,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  ExternalLink,
  ShieldCheck,
  Building2,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  Filter,
  Check,
  AlertTriangle,
  BadgeInfo,
  Calendar,
  Sparkles,
  Search,
  Database,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollableTable } from '@/components/ScrollableTable'
import { useToast } from '@/hooks/use-toast'
import {
  executarSincronizacaoProdutos,
  listarHistoricoSincronizacao,
  obterHistoricoSincronizacaoPorId,
} from '@/services/agroService'
import { Trash2 } from 'lucide-react'
import { ModalLimparBase } from '@/components/ModalLimparBase'
import { PainelRelatorioIntegracao } from '@/components/PainelRelatorioIntegracao'
import { useAuth } from '@/contexts/AuthContext'
import type {
  RespostaSincronizacao,
  DetalheFonteSincronizacao,
  HistoricoSincronizacaoRecord,
  OrigemFonteSincronizacao,
  ItemRelatorioIntegracao,
  ContadoresDesfecho,
} from '@/types/agro'

interface FonteDef {
  id: OrigemFonteSincronizacao
  nome: string
  subtitulo: string
  portal: string
  csvUrl: string
  descricao: string
  badge: string
}

const FONTES_DISPONIVEIS: FonteDef[] = [
  {
    id: 'AGROFIT_FORMULADO',
    nome: 'AGROFIT Formulados',
    subtitulo: 'Defensivos comerciais, biodefensivos e reguladores de crescimento',
    portal:
      'https://dados.agricultura.gov.br/dataset/sistema-de-agrotoxicos-fitossanitarios-agrofit',
    csvUrl:
      'https://dados.agricultura.gov.br/dataset/6c913699-e82e-4da3-a0a1-fb6c431e367f/resource/d30b30d7-e256-484e-9ab8-cd40974e1238/download/agrofitprodutosformulados.csv',
    descricao: 'Posição 38.08 TIPI, matriz de 4 faixas de embalagem e Nota de Subposições 2.',
    badge: 'Lei 14.785/2023',
  },
  {
    id: 'AGROFIT_TECNICO',
    nome: 'AGROFIT Técnicos',
    subtitulo: 'Princípios ativos técnicos e matérias-primas industriais puras',
    portal:
      'https://dados.agricultura.gov.br/dataset/sistema-de-agrotoxicos-fitossanitarios-agrofit',
    csvUrl:
      'https://dados.agricultura.gov.br/dataset/6c913699-e82e-4da3-a0a1-fb6c431e367f/resource/a200c70b-e025-4a9a-be1b-ec7275d7921f/download/agrofitprodutostecnicos.csv',
    descricao:
      'Nota 2 Seção VI TIPI: Cap. 29/38.08 e benefício tributário condicional (Dec. 5.630/05).',
    badge: 'Insumo Técnico',
  },
  {
    id: 'SIPEAGRO',
    nome: 'SIPEAGRO Fertilizantes',
    subtitulo: 'Fertilizantes (IN 39/18), corretivos (IN 35/06) e inoculantes biológicos',
    portal: 'https://dados.agricultura.gov.br/dataset/sipeagro',
    csvUrl:
      'https://dados.agricultura.gov.br/dataset/52a01565-72d6-410e-b21b-64035831a7be/resource/e0bbc9d5-f161-448b-a6d4-c7beb312ec33/download/sipeagrofertilizante.csv',
    descricao:
      'Capítulo 31 TIPI, inoculantes biológicos N2 (3002.49.99) e corretivos minerais de solo.',
    badge: 'IN MAPA 39/18',
  },
]

export function SincronizacaoProdutos() {
  const { user, isAdmin } = useAuth()
  const { toast } = useToast()

  // Configurações da sincronização
  const [fontesSelecionadas, setFontesSelecionadas] = useState<string[]>([
    'AGROFIT_FORMULADO',
    'AGROFIT_TECNICO',
    'SIPEAGRO',
  ])
  const [autoInclusao, setAutoInclusao] = useState<boolean>(true)
  const [limitePorFonte, setLimitePorFonte] = useState<number>(120)

  // Modal Limpar Bases
  const [modalLimparOpen, setModalLimparOpen] = useState(false)

  // Estados de execução
  const [sincronizando, setSincronizando] = useState<boolean>(false)
  const [etapaAtual, setEtapaAtual] = useState<string>('')
  const [progressoEstimado, setProgressoEstimado] = useState<number>(0)
  const [resultadoAtual, setResultadoAtual] = useState<RespostaSincronizacao | null>(null)
  const [erroExecucao, setErroExecucao] = useState<string | null>(null)

  // Estado para visualização do Relatório de Integração
  const [relatorioAtivo, setRelatorioAtivo] = useState<{
    titulo: string
    dataHora: string
    duracaoMs: number
    statusGeral: string
    autoInclusao: boolean
    fontes: DetalheFonteSincronizacao[]
    itens: ItemRelatorioIntegracao[]
    contadores?: ContadoresDesfecho
  } | null>(null)

  // Histórico persistido
  const [historico, setHistorico] = useState<HistoricoSincronizacaoRecord[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState<boolean>(true)
  const [detalheExpandido, setDetalheExpandido] = useState<string | null>(null)

  // Carregar histórico
  const carregarHistorico = useCallback(async () => {
    try {
      setCarregandoHistorico(true)
      const resp = await listarHistoricoSincronizacao({ page: 1, perPage: 15, sort: '-created' })
      setHistorico(resp.items || [])
    } catch (err: unknown) {
      console.log('Erro ao carregar histórico de sincronização:', err)
    } finally {
      setCarregandoHistorico(false)
    }
  }, [])

  useEffect(() => {
    carregarHistorico()
  }, [carregarHistorico])

  // Toggle de seleção de fontes
  const toggleFonte = (id: string) => {
    setFontesSelecionadas((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) {
          toast({
            title: 'Atenção',
            description: 'Selecione ao menos um portal oficial para a sincronização.',
            variant: 'destructive',
          })
          return prev
        }
        return prev.filter((item) => item !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  // Disparo da sincronização
  const handleSincronizar = async () => {
    if (!isAdmin) {
      toast({
        title: 'Acesso Restrito',
        description:
          'Apenas usuários com perfil Administrador podem acionar a sincronização oficial.',
        variant: 'destructive',
      })
      return
    }

    if (fontesSelecionadas.length === 0) {
      toast({
        title: 'Selecione uma fonte',
        description: 'Selecione ao menos um portal governamental para sincronizar.',
        variant: 'destructive',
      })
      return
    }

    setSincronizando(true)
    setErroExecucao(null)
    setResultadoAtual(null)
    setProgressoEstimado(10)
    setEtapaAtual('Conectando aos portais de dados abertos do MAPA...')

    // Intervalo de animação de progresso suave com etapas descritivas
    let tickCount = 0
    const timer = setInterval(() => {
      tickCount++
      if (tickCount === 2) {
        setEtapaAtual('Baixando bases oficiais (AGROFIT Formulados, Técnicos e SIPEAGRO)...')
        setProgressoEstimado(35)
      } else if (tickCount === 4) {
        setEtapaAtual('Executando Motor Determinístico de 28 Campos e Nota Subposições 2 TIPI...')
        setProgressoEstimado(60)
      } else if (tickCount === 7) {
        setEtapaAtual('Aplicando Trava 4 de Duplicidade e consolidando Base Mestre...')
        setProgressoEstimado(82)
      } else if (tickCount >= 10) {
        setEtapaAtual('Finalizando auditoria de integração e persistindo histórico...')
        setProgressoEstimado((old) => (old < 94 ? old + 2 : old))
      }
    }, 900)

    try {
      const resp = await executarSincronizacaoProdutos({
        fontes: fontesSelecionadas,
        auto_inclusao: autoInclusao,
        limite_por_fonte: limitePorFonte,
      })

      clearInterval(timer)
      setProgressoEstimado(100)
      setEtapaAtual('Sincronização concluída com sucesso!')
      setResultadoAtual(resp)

      const algumErro =
        Array.isArray(resp.fontes) && resp.fontes.some((f) => f.status === 'indisponivel')

      // Abre automaticamente o Relatório de Integração completo na tela
      if (resp.relatorio_integracao) {
        setRelatorioAtivo({
          titulo: 'Relatório de Integração — Execução Concluída',
          dataHora: new Date().toISOString(),
          duracaoMs: resp.duracao_ms,
          statusGeral: algumErro ? 'parcial' : 'concluido',
          autoInclusao: resp.auto_inclusao,
          fontes: resp.fontes || [],
          itens: resp.relatorio_integracao.itens || [],
          contadores: resp.relatorio_integracao.contadores,
        })
      }

      const totalBaixado = resp.resumo?.total_baixado ?? 0
      const novosCad = resp.resumo?.novos_cadastrados ?? 0
      const duplEvit = resp.resumo?.ignorados_duplicidade ?? 0
      const atualiz = resp.resumo?.atualizados ?? 0

      if (algumErro) {
        toast({
          title: 'Sincronização Concluída com Alertas',
          description: `${novosCad} novos produtos gravados, ${duplEvit} duplicidades evitadas. Consulte o relatório completo.`,
        })
      } else {
        toast({
          title: 'Sincronização Finalizada com Sucesso',
          description: `${totalBaixado} registros processados, ${novosCad} novos cadastrados, ${atualiz} atualizados e ${duplEvit} duplicidades barradas.`,
        })
      }

      // Recarrega o histórico
      carregarHistorico()
    } catch (err: unknown) {
      clearInterval(timer)
      setProgressoEstimado(0)
      setEtapaAtual('')
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Falha na comunicação com o serviço de sincronização do servidor.'
      setErroExecucao(msg)
      toast({
        title: 'Falha na Sincronização de Produtos',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSincronizando(false)
    }
  }

  // Helper para renderizar status de fonte
  const renderStatusFonte = (status: DetalheFonteSincronizacao['status']) => {
    switch (status) {
      case 'concluido':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Concluído
          </Badge>
        )
      case 'indisponivel':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 flex items-center gap-1 font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            Indisponível (Contingência)
          </Badge>
        )
      case 'baixando':
      case 'processando':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-300 flex items-center gap-1 font-medium animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            Processando
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-gray-500">
            Aguardando
          </Badge>
        )
    }
  }

  // Helper de parse seguro para JSON do histórico
  const safeParseJson = <T,>(val: unknown, fallback: T): T => {
    if (!val) return fallback
    if (typeof val === 'object') return val as T
    if (typeof val === 'string') {
      try {
        return JSON.parse(val) as T
      } catch (_) {
        return fallback
      }
    }
    return fallback
  }

  // Reabrir relatório a partir de um registro do histórico
  const handleAbrirRelatorioHistorico = async (h: HistoricoSincronizacaoRecord) => {
    try {
      let recCompleto = h
      if (!h.itens_relatorio) {
        recCompleto = await obterHistoricoSincronizacaoPorId(h.id)
      }

      const itens = safeParseJson<ItemRelatorioIntegracao[]>(recCompleto.itens_relatorio, [])
      const contadores = safeParseJson<ContadoresDesfecho | undefined>(
        recCompleto.contadores_desfecho,
        undefined,
      )
      const fontes = safeParseJson<DetalheFonteSincronizacao[]>(recCompleto.detalhes_fontes, [])

      setRelatorioAtivo({
        titulo: `Relatório de Integração — Execução de ${new Date(recCompleto.created).toLocaleString('pt-BR')}`,
        dataHora: recCompleto.created,
        duracaoMs: recCompleto.duracao_ms,
        statusGeral: recCompleto.status_geral,
        autoInclusao: recCompleto.auto_inclusao,
        fontes: fontes,
        itens: itens,
        contadores: contadores,
      })

      window.scrollTo({ top: 380, behavior: 'smooth' })
    } catch (err: unknown) {
      console.log('Erro ao reabrir relatório:', err)
      toast({
        title: 'Erro ao abrir relatório',
        description: 'Não foi possível carregar os detalhes desta execução.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ------------------------------------------------------------------ */}
      {/* HEADER DA PÁGINA */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DCE5DC] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#0D2811] text-emerald-400 shadow-sm border border-emerald-800/40">
              <CloudSync className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-[#1C2B1C] tracking-tight">
                  Sincronização de Produtos
                </h1>
                <Badge className="bg-[#1B5E20] text-white border-0 text-[11px] font-semibold">
                  Oficial MAPA
                </Badge>
              </div>
              <p className="text-sm text-[#5A6D5A]">
                Captura determinística em dados abertos (AGROFIT e SIPEAGRO) com aplicação dos 28
                campos canônicos, Trava 4 e motor aduaneiro-tributário.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin ? (
            <>
              <Button
                variant="outline"
                onClick={() => setModalLimparOpen(true)}
                disabled={sincronizando}
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 flex items-center gap-2 h-10 px-4 text-xs font-semibold"
                title="Apaga permanentemente os registros da Base Mestre para reiniciar do zero"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                Limpar Bases
              </Button>

              <Button
                onClick={handleSincronizar}
                disabled={sincronizando}
                className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white shadow-md flex items-center gap-2 h-10 px-5 font-semibold transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
                {sincronizando ? 'Sincronizando...' : 'Sincronizar Agora'}
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Conectado como {user?.email} (Perfil Analista: somente consulta)</span>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MENSAGEM DE ERRO (CASO OCORRA) */}
      {/* ------------------------------------------------------------------ */}
      {erroExecucao && (
        <Card className="border-red-300 bg-red-50/80 shadow-sm animate-in fade-in duration-300">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 flex-1">
              <h4 className="text-sm font-bold text-red-900">
                Não foi possível concluir a sincronização
              </h4>
              <p className="text-xs text-red-800 leading-relaxed font-mono">{erroExecucao}</p>
              <div className="pt-2">
                <Button
                  size="sm"
                  onClick={handleSincronizar}
                  className="bg-red-700 hover:bg-red-800 text-white text-xs h-7 px-3 font-semibold"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Tentar Novamente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* PAINEL DE CONTROLE / FILTROS E CONFIGURAÇÕES */}
      {/* ------------------------------------------------------------------ */}
      <Card className="border-[#DCE5DC] shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-[#FAFBF9] border-b border-[#DCE5DC] py-4 px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#1B5E20]" />
                Fontes Governamentais e Parâmetros de Execução
              </CardTitle>
              <CardDescription className="text-xs text-[#5A6D5A]">
                Selecione as bases de dados oficiais do Ministério da Agricultura (MAPA) a
                consultar.
              </CardDescription>
            </div>

            {/* Switch de Inclusão Automática */}
            <div className="flex items-center gap-3 p-2 px-3 rounded-lg bg-emerald-50/80 border border-emerald-200">
              <div className="text-right">
                <p className="text-xs font-semibold text-[#0D2811]">Inclusão Automática</p>
                <p className="text-[10px] text-emerald-800">
                  {autoInclusao ? 'Grava direto na Base Mestre' : 'Apenas simular e auditar'}
                </p>
              </div>
              <Switch
                checked={isAdmin && autoInclusao}
                onCheckedChange={setAutoInclusao}
                disabled={sincronizando || !isAdmin}
                className="data-[state=checked]:bg-[#1B5E20]"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Seleção de Fontes Oficiais */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#5A6D5A] mb-3 block">
              Fontes Conectadas via Portal de Dados Abertos
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {FONTES_DISPONIVEIS.map((fonte) => {
                const isChecked = fontesSelecionadas.includes(fonte.id)
                return (
                  <div
                    key={fonte.id}
                    onClick={() => !sincronizando && toggleFonte(fonte.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all relative flex flex-col justify-between ${
                      isChecked
                        ? 'border-[#1B5E20] bg-emerald-50/40 shadow-sm ring-1 ring-[#1B5E20]/20'
                        : 'border-[#DCE5DC] bg-[#FAFBF9] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleFonte(fonte.id)}
                            disabled={sincronizando}
                            className="data-[state=checked]:bg-[#1B5E20] data-[state=checked]:border-[#1B5E20]"
                          />
                          <span className="font-bold text-sm text-[#1C2B1C]">{fonte.nome}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold text-[#1B5E20] border-emerald-300 bg-white"
                        >
                          {fonte.badge}
                        </Badge>
                      </div>

                      <p className="text-xs font-medium text-emerald-950 mb-1">{fonte.subtitulo}</p>
                      <p className="text-[11px] text-[#5A6D5A] leading-relaxed">
                        {fonte.descricao}
                      </p>
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-[#DCE5DC]/80 flex items-center justify-between text-[11px] text-[#5A6D5A]">
                      <a
                        href={fonte.portal}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#1B5E20] hover:underline flex items-center gap-1 font-semibold text-[11px]"
                      >
                        Portal MAPA
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <span className="text-[10px] text-emerald-700 font-medium">
                        Download Automático
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Limite de registros por fonte */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#DCE5DC] text-xs">
            <div className="flex items-center gap-2 text-[#5A6D5A]">
              <BadgeInfo className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span>
                <strong>Idempotência garantida:</strong> executar a sincronização sucessivas vezes
                não duplicará cadastros já existentes na Base Mestre (critérios da Trava 4).
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[#1C2B1C] font-semibold">Limite por fonte:</span>
              <select
                value={limitePorFonte}
                onChange={(e) => setLimitePorFonte(Number(e.target.value))}
                disabled={sincronizando}
                className="bg-white border border-[#DCE5DC] rounded-lg px-2.5 py-1 text-xs text-[#1C2B1C] font-medium focus:ring-1 focus:ring-[#1B5E20]"
              >
                <option value={50}>50 produtos (Rápido)</option>
                <option value={120}>120 produtos (Recomendado)</option>
                <option value={250}>250 produtos (Lote Médio)</option>
                <option value={500}>500 produtos (Lote Máximo)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* STATUS DA EXECUÇÃO ATUAL / PROGRESSO COM ETAPAS CLARAS */}
      {/* ------------------------------------------------------------------ */}
      {sincronizando && (
        <Card className="border-emerald-400 bg-emerald-50/70 shadow-md animate-in fade-in duration-300">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-[#1B5E20] animate-spin" />
                <div>
                  <h3 className="text-sm font-bold text-[#0D2811]">
                    Executando Sincronização Oficial
                  </h3>
                  <p className="text-xs text-emerald-800 font-medium">{etapaAtual}</p>
                </div>
              </div>
              <span className="text-sm font-bold text-[#1B5E20] font-mono">
                {progressoEstimado}%
              </span>
            </div>
            <Progress value={progressoEstimado} className="h-2.5 bg-emerald-200" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs text-emerald-900 font-medium">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                <span>1. Download e normalização dos dados MAPA</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                <span>2. Motor determinístico canônico (28 campos)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                <span>3. Trava 4 de duplicidade e gravação</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* PAINEL RELATÓRIO DE INTEGRAÇÃO (COMPONENTE CANÔNICO DE AUDITORIA) */}
      {/* ------------------------------------------------------------------ */}
      {relatorioAtivo && (
        <PainelRelatorioIntegracao
          titulo={relatorioAtivo.titulo}
          dataHora={relatorioAtivo.dataHora}
          duracaoMs={relatorioAtivo.duracaoMs}
          statusGeral={relatorioAtivo.statusGeral}
          autoInclusao={relatorioAtivo.autoInclusao}
          fontes={relatorioAtivo.fontes}
          itens={relatorioAtivo.itens}
          contadores={relatorioAtivo.contadores}
          onFechar={() => setRelatorioAtivo(null)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* RESULTADO DA ÚLTIMA SINCRONIZAÇÃO (RESUMO EM CARDS) */}
      {/* ------------------------------------------------------------------ */}
      {resultadoAtual && !relatorioAtivo && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-[#DCE5DC] bg-white shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#5A6D5A]">Total Baixado (MAPA)</p>
                  <p className="text-2xl font-bold text-[#1C2B1C] mt-1">
                    {resultadoAtual.resumo.total_baixado}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                  <Download className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#DCE5DC] bg-white shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#5A6D5A]">Novos Cadastrados</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {resultadoAtual.resumo.novos_cadastrados}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#DCE5DC] bg-white shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#5A6D5A]">Ignorados (Trava 4)</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">
                    {resultadoAtual.resumo.ignorados_duplicidade}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#DCE5DC] bg-white shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#5A6D5A]">Atualizados / Enriquecidos</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">
                    {resultadoAtual.resumo.atualizados || 0}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700">
                  <Layers className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (resultadoAtual.relatorio_integracao) {
                  setRelatorioAtivo({
                    titulo: 'Relatório de Integração — Execução Concluída',
                    dataHora: new Date().toISOString(),
                    duracaoMs: resultadoAtual.duracao_ms,
                    statusGeral: 'concluido',
                    autoInclusao: resultadoAtual.auto_inclusao,
                    fontes: resultadoAtual.fontes || [],
                    itens: resultadoAtual.relatorio_integracao.itens || [],
                    contadores: resultadoAtual.relatorio_integracao.contadores,
                  })
                }
              }}
              className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white flex items-center gap-2 text-xs font-semibold"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Ver Relatório de Integração Completo Desta Execução
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* HISTÓRICO DE EXECUÇÕES PERSISTIDO */}
      {/* ------------------------------------------------------------------ */}
      <Card className="border-[#DCE5DC] shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-[#FAFBF9] border-b border-[#DCE5DC] py-4 px-6 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-[#1C2B1C] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1B5E20]" />
              Histórico de Sincronizações Oficiais
            </CardTitle>
            <CardDescription className="text-xs text-[#5A6D5A]">
              Auditoria permanente de todas as rotinas de sincronização executadas no sistema.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={carregarHistorico}
            disabled={carregandoHistorico}
            className="border-[#DCE5DC] text-[#1C2B1C] hover:bg-white text-xs h-8 flex items-center gap-1.5 font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregandoHistorico ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {carregandoHistorico ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-[#1B5E20] mx-auto mb-2" />
              <p className="text-xs text-[#5A6D5A]">Carregando histórico de sincronizações...</p>
            </div>
          ) : historico.length === 0 ? (
            <div className="p-12 text-center">
              <CloudSync className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-[#1C2B1C]">
                Nenhuma sincronização executada ainda
              </p>
              <p className="text-xs text-[#5A6D5A] mt-1 max-w-md mx-auto">
                Clique no botão <strong>Sincronizar Agora</strong> acima para buscar os produtos
                mais recentes dos portais do MAPA e alimentar a Base Mestre.
              </p>
            </div>
          ) : (
            <ScrollableTable maxHeight="460px">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#FAFBF9] hover:bg-[#FAFBF9]">
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="text-xs font-bold text-[#1C2B1C]">Data / Hora</TableHead>
                    <TableHead className="text-xs font-bold text-[#1C2B1C]">
                      Fontes Executadas
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#1C2B1C]">Modo</TableHead>
                    <TableHead className="text-xs font-bold text-[#1C2B1C] text-right">
                      Baixados
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#1C2B1C] text-right">
                      Novos
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#1C2B1C] text-right">
                      Duplicados
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#1C2B1C] text-right">
                      Duração
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#1C2B1C]">Status</TableHead>
                    <TableHead className="text-xs font-bold text-[#1C2B1C] text-center">
                      Ação
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((h) => {
                    const fontesArr = safeParseJson<string[]>(h.fontes_executadas, [])
                    const detalhes = safeParseJson<DetalheFonteSincronizacao[]>(
                      h.detalhes_fontes,
                      [],
                    )
                    const isExpanded = detalheExpandido === h.id

                    return (
                      <React.Fragment key={h.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-emerald-50/20 transition-colors"
                          onClick={() => setDetalheExpandido(isExpanded ? null : h.id)}
                        >
                          <TableCell className="text-[#5A6D5A] p-2 text-center">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[#1B5E20]" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-[#5A6D5A]" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-[#1C2B1C]">
                            {new Date(h.created).toLocaleString('pt-BR')}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {fontesArr.map((f, fIdx) => (
                                <Badge
                                  key={fIdx}
                                  variant="outline"
                                  className="text-[10px] py-0 px-1.5 border-[#DCE5DC] text-[#1C2B1C]"
                                >
                                  {f.replace('AGROFIT_', '')}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {h.auto_inclusao ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                                Auto Inclusão
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-700 border-gray-300 text-[10px]">
                                Simulação
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {h.total_baixado}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold text-emerald-700">
                            {h.novos_cadastrados}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-amber-700 font-semibold">
                            {h.ignorados_duplicidade}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-[#5A6D5A]">
                            {(h.duracao_ms / 1000).toFixed(1)}s
                          </TableCell>
                          <TableCell>
                            {h.status_geral === 'concluido' ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                                Concluído
                              </Badge>
                            ) : h.status_geral === 'parcial' ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                                Parcial
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 border-red-300 text-[10px]">
                                Falha Total
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center p-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAbrirRelatorioHistorico(h)
                              }}
                              className="text-[#1B5E20] hover:text-[#2E7D32] hover:bg-emerald-50 h-7 text-xs font-semibold px-2"
                              title="Abrir o relatório detalhado desta execução"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
                              Relatório
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Linha expandida com detalhamento das fontes */}
                        {isExpanded && (
                          <TableRow className="bg-[#FAFBF9]/90 border-t border-b border-[#DCE5DC]">
                            <TableCell colSpan={10} className="p-4">
                              <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#DCE5DC]">
                                  <div>
                                    <p className="text-xs font-bold text-[#1C2B1C]">
                                      Detalhamento por Fonte Governamental na Execução
                                    </p>
                                    <p className="text-[11px] text-[#5A6D5A]">
                                      Auditoria de cada CSV baixado e processado nesta rotina.
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleAbrirRelatorioHistorico(h)
                                    }}
                                    className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white text-xs h-8 flex items-center gap-1.5 shadow-sm font-semibold"
                                  >
                                    <FileSpreadsheet className="w-3.5 h-3.5" />
                                    Abrir Relatório de Integração Completo
                                  </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  {detalhes.map((df, dfIdx) => (
                                    <div
                                      key={dfIdx}
                                      className="p-3 rounded-lg border border-[#DCE5DC] bg-white text-xs space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-[#1C2B1C]">{df.nome}</span>
                                        {renderStatusFonte(df.status)}
                                      </div>
                                      <p className="text-[11px] text-[#5A6D5A]">{df.mensagem}</p>
                                      <div className="pt-2 border-t border-[#DCE5DC]/60 flex items-center justify-between font-mono text-[11px]">
                                        <span>Baixados: {df.total_baixado}</span>
                                        <span className="text-emerald-700 font-bold">
                                          Novos: {df.novos_cadastrados}
                                        </span>
                                        <span className="text-amber-700 font-semibold">
                                          Duplicados: {df.ignorados_duplicidade}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollableTable>
          )}

          {historico.length > 0 && !carregandoHistorico && (
            <div className="flex items-center justify-between p-3.5 border-t border-[#DCE5DC] bg-[#FAFBF9] text-xs text-[#5A6D5A]">
              <span className="font-semibold text-[#1C2B1C]">
                {historico.length}{' '}
                {historico.length === 1 ? 'execução registrada' : 'execuções registradas'}
              </span>
              <span className="text-[11px] text-[#8A9A86]">
                Clique em qualquer execução para inspecionar os detalhes e reabrir o relatório
                canônico
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Limpar Bases */}
      <ModalLimparBase
        open={modalLimparOpen}
        onOpenChange={setModalLimparOpen}
        alvo="todas"
        tituloAlvo="Bases de Dados (Base Mestre e Princípios Ativos)"
        onSucesso={() => {
          carregarHistorico()
          setResultadoAtual(null)
          setRelatorioAtivo(null)
        }}
      />
    </div>
  )
}
