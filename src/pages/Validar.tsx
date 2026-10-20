import React, { useState, useEffect } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  RotateCcw,
  Sparkles,
  Info,
  Check,
  Globe,
  FileText,
  ExternalLink,
  ShieldCheck,
  Database,
  Building,
  Layers,
  Search,
  Package,
  Layers2,
  ArrowRight,
  RefreshCw,
  HelpCircle,
  Download,
  FileSpreadsheet,
  FileCode,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/use-toast'
import {
  validarCadastroProduto,
  listarBaseMestre,
  criarProdutoBaseMestre,
  atualizarProdutoBaseMestre,
} from '@/services/agroService'
import type {
  ValidarCadastroInput,
  RespostaValidacaoCadastro,
  BaseMestreProduto,
  CampoValidadoResultado,
  LinhaNcmEmbalagem,
} from '@/types/agro'

const ETAPAS_PROGRESSO = [
  { etapa: 1, texto: 'Iniciando validação de cadastro...' },
  { etapa: 2, texto: 'Buscando bula oficial no AGROFIT / Anvisa pelo Nome Comercial...' },
  { etapa: 3, texto: 'Extraindo princípios ativos, concentrações, fabricante e embalagens...' },
  { etapa: 4, texto: 'Auditando NCM no motor químico-aduaneiro e catálogo Siscomex / TIPI...' },
  { etapa: 5, texto: 'Calculando enquadramento de NCM por faixa de embalagem (TIPI)...' },
  { etapa: 6, texto: 'Confrontando travas regulatórias e consolidando parecer...' },
]

export default function Validar() {
  // Modo de validação: "novo" (Validar Cadastro) ou "existente" (Validar Existente)
  const [modo, setModo] = useState<'novo' | 'existente'>('novo')

  // Os 5 campos de entrada do escopo
  const [nomeComercial, setNomeComercial] = useState('')
  const [ncm, setNcm] = useState('')
  const [principioAtivo, setPrincipioAtivo] = useState('')
  const [codigoMapa, setCodigoMapa] = useState('')
  const [embalagem, setEmbalagem] = useState('')

  // Para o modo "Validar Existente": busca rápida de produto na Base Mestre
  const [buscaExistenteTexto, setBuscaExistenteTexto] = useState('')
  const [produtosBaseMestre, setProdutosBaseMestre] = useState<BaseMestreProduto[]>([])
  const [produtoExistenteSelecionado, setProdutoExistenteSelecionado] =
    useState<BaseMestreProduto | null>(null)
  const [buscandoExistentes, setBuscandoExistentes] = useState(false)

  // Interruptor de auto-cadastro na Base Mestre
  const [autoCadastrar, setAutoCadastrar] = useState(true)

  // Estados de execução e retorno
  const [loading, setLoading] = useState(false)
  const [progressoIndice, setProgressoIndice] = useState(0)
  const [savingBaseMestre, setSavingBaseMestre] = useState(false)
  const [resultado, setResultado] = useState<RespostaValidacaoCadastro | null>(null)
  const [salvoComSucesso, setSalvoComSucesso] = useState(false)

  // Efeito do timer de etapas dinâmicas durante a validação
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    if (loading) {
      setProgressoIndice(0)
      timer = setInterval(() => {
        setProgressoIndice((prev) => (prev < ETAPAS_PROGRESSO.length - 1 ? prev + 1 : prev))
      }, 1100)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [loading])

  // Formatação de máscara do NCM em tempo real (0000.00.00)
  const formatarNcmInput = (valor: string): string => {
    const digits = valor.replace(/\D/g, '').slice(0, 8)
    if (digits.length <= 4) return digits
    if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }

  const handleNcmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatado = formatarNcmInput(e.target.value)
    setNcm(formatado)
  }

  const ncmDigitos = ncm.replace(/\D/g, '')
  const ncmIncompleto = ncmDigitos.length > 0 && ncmDigitos.length < 8

  // Busca rápida de produtos na Base Mestre para o modo existente
  const handleBuscarBaseMestre = async () => {
    const termo = buscaExistenteTexto.trim()
    if (!termo) {
      toast({
        title: 'Informe um termo',
        description: 'Digite o nome do produto ou marca para pesquisar na Base Mestre.',
      })
      return
    }
    setBuscandoExistentes(true)
    try {
      const esc = termo.replace(/'/g, "\\'")
      const resp = await listarBaseMestre({
        page: 1,
        perPage: 8,
        filter: `nome_completo ~ '${esc}' || marca_padronizada ~ '${esc}' || nome_produto ~ '${esc}' || registro_mapa ~ '${esc}'`,
      })
      setProdutosBaseMestre(resp.items)
      if (resp.items.length === 0) {
        toast({
          title: 'Nenhum produto localizado',
          description: `Não encontramos cadastros na Base Mestre com o termo "${termo}".`,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar Base Mestre.'
      toast({ variant: 'destructive', title: 'Erro de Busca', description: msg })
    } finally {
      setBuscandoExistentes(false)
    }
  }

  const handleSelecionarProdutoExistente = (prod: BaseMestreProduto) => {
    setProdutoExistenteSelecionado(prod)
    setNomeComercial(prod.marca_padronizada || prod.nome_completo || prod.nome_produto || '')
    const ncmClean = (prod.ncm_padrao || prod.ncm || '').replace(/\D/g, '')
    setNcm(formatarNcmInput(ncmClean))
    setPrincipioAtivo(prod.principio_ativo || '')
    setCodigoMapa(prod.registro_mapa || '')
    setEmbalagem(prod.embalagem || '')
    setProdutosBaseMestre([])
    toast({
      title: 'Produto Selecionado',
      description: `Dados de "${prod.marca_padronizada || prod.nome_produto}" carregados no formulário para validação cruzada.`,
    })
  }

  // Submissão do formulário
  const handleValidar = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nomeComercial.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome Comercial Obrigatório',
        description: 'Por favor, informe o Nome Comercial do produto.',
      })
      return
    }

    if (ncmDigitos.length !== 8) {
      toast({
        variant: 'destructive',
        title: 'NCM Incompleto',
        description: 'O código NCM deve possuir exatamente 8 dígitos numéricos.',
      })
      return
    }

    setLoading(true)
    setSalvoComSucesso(false)

    try {
      const payload: ValidarCadastroInput = {
        nome_comercial: nomeComercial.trim(),
        ncm: ncmDigitos,
        principio_ativo: principioAtivo.trim() || undefined,
        codigo_mapa: codigoMapa.trim() || undefined,
        embalagem: embalagem.trim() || undefined,
        modo: modo,
        id_produto_existente: produtoExistenteSelecionado?.id,
        auto_cadastrar: autoCadastrar,
      }

      const resp = await validarCadastroProduto(payload)
      setResultado(resp)

      if (resp.veredito_geral === 'APROVADO') {
        if (resp.gravacao_base_mestre?.executada) {
          setSalvoComSucesso(true)
          toast({
            title: 'Cadastro Aprovado e Salvo!',
            description: resp.gravacao_base_mestre.mensagem,
          })
        } else {
          toast({
            title: 'Cadastro Aprovado!',
            description:
              'Todas as informações conferem com a bula oficial e as regras tributárias.',
          })
        }
      } else if (resp.veredito_geral === 'APROVADO COM RESSALVAS') {
        toast({
          title: 'Aprovado com Ressalvas',
          description: resp.veredito_motivo,
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Cadastro Reprovado',
          description: resp.veredito_motivo,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao executar validação de cadastro.'
      toast({
        variant: 'destructive',
        title: 'Erro no Motor de Validação',
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  // Ação manual de salvar ou atualizar na Base Mestre
  const handleGravarBaseMestre = async () => {
    if (!resultado || resultado.veredito_geral === 'REPROVADO') return
    setSavingBaseMestre(true)

    try {
      const canon = resultado.produto_canonico || {}
      const payload = {
        nome_completo: canon.nome_completo || nomeComercial,
        marca_padronizada: canon.marca_padronizada || nomeComercial,
        ncm_padrao: canon.ncm_padrao || formatarNcmInput(ncmDigitos),
        ncm: (canon.ncm_padrao || ncmDigitos).replace(/\D/g, ''),
        principio_ativo: canon.principio_ativo || principioAtivo || nomeComercial,
        registro_mapa: canon.registro_mapa || codigoMapa,
        titular_fabricante: canon.titular_fabricante,
        embalagem: canon.embalagem || embalagem || '1X20L (20 L)',
        tipo_produto: canon.tipo_produto,
        unidade: canon.unidade,
        macro_grupo: canon.macro_grupo,
        sub_grupo: canon.sub_grupo,
        nota_subpos_2: canon.nota_subpos_2,
        ncm_faixa1_ate_300g: canon.ncm_faixa1_ate_300g,
        ncm_faixa2_300g_a_7_5kg: canon.ncm_faixa2_300g_a_7_5kg,
        ncm_faixa3_7_5kg_a_10kg: canon.ncm_faixa3_7_5kg_a_10kg,
        ncm_faixa4_acima_10kg: canon.ncm_faixa4_acima_10kg,
        regra_tipi: canon.regra_tipi,
        sistema_norma_mapa: canon.sistema_norma_mapa,
        status_pis_cofins: canon.status_pis_cofins,
        aliquota_ate_mar2026: canon.aliquota_ate_mar2026,
        aliquota_pos_abr2026_real: canon.aliquota_pos_abr2026_real,
        aliquota_pos_abr2026_presumido: canon.aliquota_pos_abr2026_presumido,
        cst_saida: canon.cst_saida,
        cst_entrada: canon.cst_entrada,
        ibs_cbs_2027: canon.ibs_cbs_2027,
        url_oficial: canon.url_oficial,
        status_validacao: 'aprovado' as const,
      }

      if (
        modo === 'existente' &&
        (produtoExistenteSelecionado?.id || resultado.comparacao_existente?.id_registro)
      ) {
        const idAlvo =
          produtoExistenteSelecionado?.id || resultado.comparacao_existente?.id_registro || ''
        await atualizarProdutoBaseMestre(idAlvo, payload)
        toast({
          title: 'Base Mestre Atualizada!',
          description: `O produto "${payload.marca_padronizada}" foi atualizado com as correções da bula.`,
        })
      } else {
        await criarProdutoBaseMestre(payload)
        toast({
          title: 'Produto Gravado na Base Mestre!',
          description: `Novo produto "${payload.marca_padronizada}" cadastrado no Padrão Canônico de 28 Campos.`,
        })
      }
      setSalvoComSucesso(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gravar na Base Mestre.'
      toast({ variant: 'destructive', title: 'Falha ao Gravar', description: msg })
    } finally {
      setSavingBaseMestre(false)
    }
  }

  // Exportação CSV do Parecer Unificado de Validação
  const handleExportarCsv = () => {
    if (!resultado) return

    const linhas: string[] = []
    const dataHoraIso = resultado.timestamp || resultado.data_validacao || new Date().toISOString()
    linhas.push('RELATÓRIO DE AUDITORIA E VALIDAÇÃO FISCAL CADASTRAL')
    linhas.push(`Data/Hora;${new Date(dataHoraIso).toLocaleString('pt-BR')}`)
    linhas.push(`Veredito Geral;${resultado.veredito_geral}`)
    linhas.push(`Score de Conformidade;${resultado.score}%`)
    linhas.push(`Motivo do Veredito;"${(resultado.veredito_motivo || '').replace(/"/g, '""')}"`)
    linhas.push('')
    linhas.push('VALIDAÇÃO CRUZADA CAMPO A CAMPO (INFORMADO VS BULA OFICIAL)')
    linhas.push(
      'Campo;Obrigatório;Valor Informado;Encontrado na Bula / Base;Status Validação;Análise e Explicação Técnica',
    )

    resultado.campos_validacao.forEach((c) => {
      linhas.push(
        `"${c.campo}";"${c.obrigatorio ? 'SIM' : 'NÃO'}";"${(c.informado || '').replace(/"/g, '""')}";"${(c.encontrado_bula || '').replace(/"/g, '""')}";"${c.status}";"${(c.explicacao || '').replace(/"/g, '""')}"`,
      )
    })

    linhas.push('')
    linhas.push('TRAVAS DE AUDITORIA E CONFORMIDADE ADUANEIRA / REGULATÓRIA')
    linhas.push('ID Trava;Nome da Trava;Status;Mensagem da Auditoria')
    resultado.travas.forEach((t) => {
      linhas.push(
        `"${t.id_trava}";"${t.trava_nome}";"${t.aprovado ? 'CONFORME' : 'NÃO CONFORME'}";"${(t.mensagem || '').replace(/"/g, '""')}"`,
      )
    })

    if (resultado.linhas_ncm_embalagem && resultado.linhas_ncm_embalagem.length > 0) {
      linhas.push('')
      linhas.push('ENQUADRAMENTO TIPI POR FAIXA DE EMBALAGEM')
      linhas.push(
        'Faixa;Rótulo;Exemplo / Capacidade;NCM Correta TIPI;NCM Informada;Aplica-se à Informada',
      )
      resultado.linhas_ncm_embalagem.forEach((l) => {
        linhas.push(
          `"${l.faixa_nome}";"${l.faixa_rotulo}";"${l.exemplo_embalagem}";"${l.ncm_correta}";"${ncm}";"${l.ncm_informada_se_aplica ? 'SIM' : 'NÃO'}"`,
        )
      })
    }

    const csvContent = '\uFEFF' + linhas.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `validacao_${(nomeComercial || 'produto').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV Exportado',
      description: 'O parecer unificado de validação foi exportado em formato CSV.',
    })
  }

  // Exportação JSON completo do Parecer Unificado
  const handleExportarJson = () => {
    if (!resultado) return

    const exportData = {
      tipo_relatorio: 'PARECER_UNIFICADO_VALIDACAO_FISCAL',
      gerado_em: new Date().toISOString(),
      produto_consultado: {
        nome_comercial: nomeComercial,
        ncm_informada: ncm,
        principio_ativo_informado: principioAtivo,
        codigo_mapa_informado: codigoMapa,
        embalagem_informada: embalagem,
        modo_validacao: modo,
      },
      parecer_unificado: {
        veredito_geral: resultado.veredito_geral,
        score_conformidade: resultado.score,
        veredito_motivo: resultado.veredito_motivo,
        timestamp: resultado.timestamp || resultado.data_validacao || new Date().toISOString(),
      },
      validacao_cruzada_campos: resultado.campos_validacao,
      travas_auditoria: resultado.travas,
      enquadramento_ncm_embalagem: resultado.linhas_ncm_embalagem,
      produto_canonico_determinado: resultado.produto_canonico,
      bula_extraida: resultado.bula_extraida,
      fontes_consultadas: resultado.fontes_consultadas,
    }

    const jsonStr = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `validacao_${(nomeComercial || 'produto').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'JSON Exportado',
      description: 'Estrutura técnica e parecer oficial exportados em formato JSON.',
    })
  }

  const handleLimpar = () => {
    setNomeComercial('')
    setNcm('')
    setPrincipioAtivo('')
    setCodigoMapa('')
    setEmbalagem('')
    setBuscaExistenteTexto('')
    setProdutosBaseMestre([])
    setProdutoExistenteSelecionado(null)
    setResultado(null)
    setSalvoComSucesso(false)
  }

  const handleCarregarExemplo = (tipo: 'roundup' | 'standak' | 'priori') => {
    if (tipo === 'roundup') {
      setNomeComercial('ROUNDUP ORIGINAL DI')
      setNcm('3808.93.24')
      setPrincipioAtivo('Glifosato')
      setCodigoMapa('008907')
      setEmbalagem('Bombona 20 L')
    } else if (tipo === 'standak') {
      setNomeComercial('STANDAK TOP')
      setNcm('3808.91.99')
      setPrincipioAtivo('Fipronil + Piraclostrobina + Tiofanato-metílico')
      setCodigoMapa('001209')
      setEmbalagem('Frasco 1 L')
    } else {
      setNomeComercial('TALISMAN')
      setNcm('3808.62.90')
      setPrincipioAtivo('Bifentrina + Carbossulfano')
      setCodigoMapa('001807')
      setEmbalagem('Frasco 250 mL')
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* ------------------------------------------------------------------ */}
      {/* CABEÇALHO */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <span>Validar Cadastro de Produtos</span>
            <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs font-semibold">
              Motor Bula Oficial & AGROFIT
            </Badge>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Validação de novos cadastros e auditoria de cadastros existentes cruzando dados da Bula
            Oficial (MAPA / Anvisa).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-[#DCE5DC] rounded-xl p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setModo('novo')
                setProdutoExistenteSelecionado(null)
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                modo === 'novo'
                  ? 'bg-[#1B5E20] text-white shadow-sm'
                  : 'text-[#5A6D5A] hover:text-[#1C2B1C]'
              }`}
            >
              Novo Cadastro
            </button>
            <button
              type="button"
              onClick={() => setModo('existente')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                modo === 'existente'
                  ? 'bg-[#1B5E20] text-white shadow-sm'
                  : 'text-[#5A6D5A] hover:text-[#1C2B1C]'
              }`}
            >
              Validar Existente
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCarregarExemplo('roundup')}
            className="text-xs h-8 text-[#1B5E20] border-emerald-300 hover:bg-emerald-50"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-[#F57F17]" />
            Exemplo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLimpar}
            className="text-xs h-8 text-[#5A6D5A] hover:text-[#1C2B1C]"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Limpar
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* GRID PRINCIPAL: FORMULÁRIO (5 COLUNAS) vs RESULTADO (7 COLUNAS) */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUNA ESQUERDA: FORMULÁRIO COM EXATOS 5 CAMPOS */}
        <div className="lg:col-span-5">
          <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-[#1C2B1C] flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-[#1B5E20]" />
                  <span>
                    {modo === 'novo' ? 'Dados do Novo Produto' : 'Auditar Cadastro Existente'}
                  </span>
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold border-0 ${
                    modo === 'novo' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                  }`}
                >
                  {modo === 'novo' ? 'Modo: Novo Cadastro' : 'Modo: Base Mestre'}
                </Badge>
              </div>
              <CardDescription className="text-xs text-[#5A6D5A]">
                {modo === 'novo'
                  ? 'Informe Nome Comercial e NCM (obrigatórios) para buscar a bula oficial e validar o cadastro.'
                  : 'Selecione ou informe um cadastro já gravado para conferir se diverge da bula oficial.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Seletor / Pesquisa no modo Validar Existente */}
              {modo === 'existente' && (
                <div className="mb-4 p-3 rounded-xl bg-purple-50/50 border border-purple-200/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-purple-900 flex items-center gap-1">
                      <Search className="w-3.5 h-3.5 text-purple-700" />
                      <span>Localizar na Base Mestre</span>
                    </Label>
                    {produtoExistenteSelecionado && (
                      <span className="text-[10px] text-purple-700 font-medium">Vinculado</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Buscar por marca, nome ou registro MAPA..."
                      value={buscaExistenteTexto}
                      onChange={(e) => setBuscaExistenteTexto(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleBuscarBaseMestre()}
                      className="h-8 text-xs border-purple-200 bg-white"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleBuscarBaseMestre}
                      disabled={buscandoExistentes}
                      className="h-8 text-xs bg-purple-700 hover:bg-purple-800 text-white font-medium"
                    >
                      {buscandoExistentes ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Buscar'
                      )}
                    </Button>
                  </div>
                  {/* Lista de resultados encontrados */}
                  {produtosBaseMestre.length > 0 && (
                    <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {produtosBaseMestre.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelecionarProdutoExistente(p)}
                          className="w-full text-left p-2 rounded-lg bg-white hover:bg-purple-100/70 border border-purple-200/80 transition-colors text-xs flex items-center justify-between"
                        >
                          <div>
                            <strong className="text-[#1C2B1C] block">
                              {p.marca_padronizada || p.nome_completo || p.nome_produto}
                            </strong>
                            <span className="text-[10px] text-[#5A6D5A]">
                              NCM: {p.ncm_padrao || p.ncm || 'N/D'} | MAPA:{' '}
                              {p.registro_mapa || 'N/D'}
                            </span>
                          </div>
                          <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px]">
                            Carregar
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}
                  {produtoExistenteSelecionado && (
                    <div className="p-2 bg-white rounded-lg border border-purple-200 text-xs flex items-center justify-between">
                      <div className="truncate pr-2">
                        <span className="text-[10px] text-purple-700 font-bold block">
                          Cadastro Carregado:
                        </span>
                        <strong className="text-[#1C2B1C] truncate block">
                          {produtoExistenteSelecionado.marca_padronizada ||
                            produtoExistenteSelecionado.nome_produto}
                        </strong>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setProdutoExistenteSelecionado(null)}
                        className="h-6 px-2 text-[10px] text-red-600 hover:bg-red-50"
                      >
                        Desvincular
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* FORMULÁRIO COM OS 5 CAMPOS */}
              <form onSubmit={handleValidar} className="space-y-3.5">
                {/* CAMPO 1: NOME COMERCIAL (Obrigatório) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="nome_comercial"
                      className="text-xs font-semibold text-[#1C2B1C]"
                    >
                      Nome Comercial *
                    </Label>
                    <span className="text-[10px] text-[#1B5E20] font-medium bg-emerald-50 px-1.5 py-0.2 rounded">
                      Chave da Busca da Bula
                    </span>
                  </div>
                  <Input
                    id="nome_comercial"
                    required
                    value={nomeComercial}
                    onChange={(e) => setNomeComercial(e.target.value)}
                    placeholder="Ex.: ROUNDUP ORIGINAL DI, STANDAK TOP, TALISMAN..."
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                  <span className="text-[10px] text-[#5A6D5A] block leading-tight">
                    O sistema buscará a bula oficial no AGROFIT através deste nome comercial.
                  </span>
                </div>

                {/* CAMPO 2: NCM (Obrigatório, 8 dígitos, máscara 0000.00.00) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ncm" className="text-xs font-semibold text-[#1C2B1C]">
                      NCM * (8 dígitos)
                    </Label>
                    <span className="text-[10px] text-[#5A6D5A] font-mono">0000.00.00</span>
                  </div>
                  <Input
                    id="ncm"
                    required
                    maxLength={10}
                    value={ncm}
                    onChange={handleNcmChange}
                    placeholder="0000.00.00"
                    className={`h-9 text-xs font-mono font-bold border-[#DCE5DC] text-[#1B5E20] focus-visible:ring-[#1B5E20] ${
                      ncmIncompleto ? 'border-amber-400 bg-amber-50/40 text-amber-900' : ''
                    }`}
                  />
                  {ncmIncompleto ? (
                    <p className="text-[11px] text-amber-700 flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
                        NCM incompleta ({ncmDigitos.length}/8 dígitos). Preencha os 8 dígitos para
                        validação.
                      </span>
                    </p>
                  ) : (
                    <span className="text-[10px] text-[#5A6D5A] block leading-tight">
                      Será comparado com a NCM canônica da fórmula e com a tabela TIPI / Siscomex.
                    </span>
                  )}
                </div>

                {/* CAMPO 3: PRINCÍPIO ATIVO (Opcional) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="principio_ativo"
                      className="text-xs font-semibold text-[#1C2B1C]"
                    >
                      Princípio Ativo
                    </Label>
                    <span className="text-[10px] text-[#5A6D5A] italic">Opcional</span>
                  </div>
                  <Input
                    id="principio_ativo"
                    value={principioAtivo}
                    onChange={(e) => setPrincipioAtivo(e.target.value)}
                    placeholder="Ex.: Glifosato, Bifentrina, 2,4-D (se conhecido)"
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                  <span className="text-[10px] text-[#5A6D5A] block leading-tight">
                    Se não informado, o sistema extrai diretamente da bula oficial sem reprovar.
                  </span>
                </div>

                {/* CAMPO 4: CÓDIGO MAPA (Opcional) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="codigo_mapa" className="text-xs font-semibold text-[#1C2B1C]">
                      Código MAPA (Registro)
                    </Label>
                    <span className="text-[10px] text-[#5A6D5A] italic">Opcional</span>
                  </div>
                  <Input
                    id="codigo_mapa"
                    value={codigoMapa}
                    onChange={(e) => setCodigoMapa(e.target.value)}
                    placeholder="Ex.: 008907, Nº 0315 ou TC 00123"
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                  <span className="text-[10px] text-[#5A6D5A] block leading-tight">
                    Preserva zeros à esquerda e compara com o registro oficial da bula/AGROFIT.
                  </span>
                </div>

                {/* CAMPO 5: EMBALAGEM (Opcional) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="embalagem" className="text-xs font-semibold text-[#1C2B1C]">
                      Embalagem Comercial
                    </Label>
                    <span className="text-[10px] text-[#5A6D5A] italic">Opcional</span>
                  </div>
                  <Input
                    id="embalagem"
                    value={embalagem}
                    onChange={(e) => setEmbalagem(e.target.value)}
                    placeholder="Ex.: frasco 250 mL, saco 5 kg, bombona 20 L"
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                  <div className="flex items-center justify-between text-[10px] text-[#5A6D5A] pt-0.5">
                    <span>Atalhos rápidos:</span>
                    <div className="flex gap-1">
                      {[
                        'Frasco 250 mL',
                        'Frasco 1 L',
                        'Bombona 5 L',
                        'Bombona 20 L',
                        'Saco 5 kg',
                      ].map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setEmbalagem(item)}
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-[#1B5E20] hover:bg-emerald-100 transition-colors border border-emerald-200/60"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Toggle de Auto-Cadastrar / Atualizar na Base Mestre */}
                <div className="pt-2 border-t border-[#DCE5DC]">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/60">
                    <div className="space-y-0.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-[#1B5E20]" />
                        <span className="text-xs font-bold text-[#1C2B1C]">
                          {modo === 'novo'
                            ? 'Gravar na Base Mestre se Aprovado'
                            : 'Atualizar Base Mestre se Aprovado'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5A6D5A] leading-tight">
                        {modo === 'novo'
                          ? 'Insere automaticamente o produto no Padrão Canônico de 28 Campos.'
                          : 'Sincroniza os dados do cadastro existente com o que foi achado na bula.'}
                      </p>
                    </div>
                    <Switch
                      checked={autoCadastrar}
                      onCheckedChange={setAutoCadastrar}
                      className="data-[state=checked]:bg-[#1B5E20]"
                    />
                  </div>
                </div>

                {/* BOTÕES DE AÇÃO DO FORMULÁRIO */}
                <div className="pt-1">
                  <Button
                    type="submit"
                    disabled={loading || ncmIncompleto}
                    className="w-full h-11 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Buscando Bula Oficial no AGROFIT...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>
                          {modo === 'novo' ? 'Validar Cadastro' : 'Validar Cadastro Existente'}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              </form>

              {/* Barra de Progresso Dinâmico das Etapas */}
              {loading && (
                <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#1B5E20]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#1B5E20]" />
                    <span>{ETAPAS_PROGRESSO[progressoIndice].texto}</span>
                  </div>
                  <div className="w-full bg-emerald-200/50 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-[#1B5E20] h-full transition-all duration-500 rounded-full"
                      style={{
                        width: `${((progressoIndice + 1) / ETAPAS_PROGRESSO.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[#5A6D5A] block mt-1 text-right">
                    Etapa {progressoIndice + 1} de {ETAPAS_PROGRESSO.length}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* COLUNA DIREITA: PAINEL DE VALIDAÇÃO (7 COLUNAS) */}
        {/* ------------------------------------------------------------------ */}
        <div className="lg:col-span-7 space-y-4">
          {!resultado ? (
            <div className="bg-white rounded-2xl border border-dashed border-[#DCE5DC] p-12 text-center flex flex-col items-center justify-center min-h-[460px]">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center mb-3">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-[#1C2B1C]">Aguardando Validação</h3>
              <p className="text-xs text-[#5A6D5A] max-w-sm mt-1">
                Preencha o Nome Comercial e NCM ao lado. O sistema localizará a bula oficial no
                AGROFIT, validará campo a campo e detalhará a NCM por faixa de embalagem.
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCarregarExemplo('roundup')}
                  className="text-xs h-8 text-[#1B5E20] border-emerald-300"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-[#F57F17]" />
                  Carregar Exemplo Roundup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCarregarExemplo('priori')}
                  className="text-xs h-8 text-[#1B5E20] border-emerald-300"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-[#F57F17]" />
                  Exemplo Nota 2 TIPI
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* ------------------------------------------------------------------ */}
              {/* 1. CARD DE VEREDITO GERAL COM BADGE COLORIDA */}
              {/* ------------------------------------------------------------------ */}
              <Card
                className={`rounded-2xl border transition-all duration-300 shadow-md ${
                  resultado.veredito_geral === 'APROVADO'
                    ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/80 to-white'
                    : resultado.veredito_geral === 'APROVADO COM RESSALVAS'
                      ? 'border-amber-300 bg-gradient-to-br from-amber-50/80 to-white'
                      : 'border-red-300 bg-gradient-to-br from-red-50/80 to-white'
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md ${
                          resultado.veredito_geral === 'APROVADO'
                            ? 'bg-[#2E7D32]'
                            : resultado.veredito_geral === 'APROVADO COM RESSALVAS'
                              ? 'bg-[#F57F17]'
                              : 'bg-[#C62828]'
                        }`}
                      >
                        {resultado.veredito_geral === 'APROVADO' ? (
                          <CheckCircle2 className="w-8 h-8" />
                        ) : resultado.veredito_geral === 'APROVADO COM RESSALVAS' ? (
                          <AlertTriangle className="w-8 h-8" />
                        ) : (
                          <XCircle className="w-8 h-8" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#5A6D5A]">
                            Veredito Geral da Validação
                          </span>
                          <Badge
                            className={`font-bold text-xs ${
                              resultado.veredito_geral === 'APROVADO'
                                ? 'bg-emerald-600 text-white'
                                : resultado.veredito_geral === 'APROVADO COM RESSALVAS'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-red-600 text-white'
                            }`}
                          >
                            {resultado.veredito_geral}
                          </Badge>
                        </div>
                        <h3 className="text-xl font-bold text-[#1C2B1C] mt-0.5">
                          Conformidade Cadastral: {resultado.score}%
                        </h3>
                        <p className="text-xs text-[#5A6D5A]">{resultado.veredito_motivo}</p>
                      </div>
                    </div>

                    {/* Botões de Ação: Exportar Parecer (CSV/JSON) e Gravar */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleExportarCsv}
                        className="text-xs h-9 text-[#1B5E20] border-[#DCE5DC] hover:bg-emerald-50 rounded-xl"
                        title="Exportar Parecer Unificado em planilha CSV"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-[#1B5E20]" />
                        <span>Exportar CSV</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleExportarJson}
                        className="text-xs h-9 text-[#1B5E20] border-[#DCE5DC] hover:bg-emerald-50 rounded-xl"
                        title="Exportar Estrutura Técnica em JSON"
                      >
                        <FileCode className="w-3.5 h-3.5 mr-1 text-[#1B5E20]" />
                        <span>Exportar JSON</span>
                      </Button>

                      {/* Ação de Gravar / Salvar na Base Mestre */}
                      {resultado.veredito_geral !== 'REPROVADO' && (
                        <div className="flex-shrink-0">
                          {salvoComSucesso || resultado.gravacao_base_mestre?.executada ? (
                            <Badge className="bg-emerald-700 text-white px-3 py-2 text-xs flex items-center gap-1.5 shadow-sm">
                              <Check className="w-4 h-4" />
                              <span>Gravado na Base Mestre</span>
                            </Badge>
                          ) : (
                            <Button
                              onClick={handleGravarBaseMestre}
                              disabled={savingBaseMestre}
                              className="bg-[#1B5E20] hover:bg-[#2E7D32] text-white rounded-xl shadow-md flex items-center gap-2 text-xs font-semibold h-9 px-4"
                            >
                              {savingBaseMestre ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              <span>
                                {modo === 'existente'
                                  ? 'Atualizar na Base Mestre'
                                  : 'Gravar na Base Mestre'}
                              </span>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resumo Bula Extraída */}
                  {resultado.bula_extraida && (
                    <div className="mt-4 pt-3 border-t border-[#DCE5DC]/80 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5A6D5A]">
                      <span className="flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-[#1B5E20]" />
                        <span>Fabricante Oficial:</span>
                        <strong className="text-[#1C2B1C]">
                          {resultado.bula_extraida.fabricante || 'Localizado'}
                        </strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-[#1B5E20]" />
                        <span>Registro MAPA:</span>
                        <strong className="text-[#1C2B1C]">
                          {resultado.bula_extraida.registro_mapa || 'N/D'}
                        </strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="w-3.5 h-3.5 text-[#1B5E20]" />
                        <span>Embalagem Recomendada:</span>
                        <strong className="text-[#1C2B1C]">
                          {resultado.bula_extraida.embalagem_principal || '20 L'}
                        </strong>
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ------------------------------------------------------------------ */}
              {/* 2. TABELA DE VALIDAÇÃO POR CAMPO (Informado vs Bula/Base) */}
              {/* ------------------------------------------------------------------ */}
              <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-4 bg-[#FAFBF8] border-b border-[#DCE5DC]">
                  <CardTitle className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#1B5E20]" />
                      <span>Validação Cruzada Campo a Campo</span>
                    </span>
                    <span className="text-[10px] text-[#5A6D5A] font-normal">
                      Informado vs. Oficial na Bula
                    </span>
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#DCE5DC] bg-[#F5F7F1]/50 text-[#5A6D5A] font-semibold text-left">
                        <th className="py-2.5 px-3">Campo</th>
                        <th className="py-2.5 px-3">Informado</th>
                        <th className="py-2.5 px-3">Encontrado na Bula / Base</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Análise / Explicação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE5DC]">
                      {resultado.campos_validacao.map((item: CampoValidadoResultado) => {
                        let badgeBg = 'bg-gray-100 text-gray-800'
                        let trBg = 'hover:bg-emerald-50/20'

                        if (item.status === 'OK') {
                          badgeBg = 'bg-emerald-100 text-emerald-800'
                        } else if (item.status === 'DIVERGENTE') {
                          badgeBg = 'bg-red-600 text-white'
                          trBg = 'bg-red-50/40 hover:bg-red-50/60'
                        } else if (item.status === 'NÃO INFORMADO') {
                          badgeBg = 'bg-blue-50 text-blue-700'
                        } else if (item.status === 'NÃO LOCALIZADO') {
                          badgeBg = 'bg-amber-100 text-amber-800'
                        }

                        const ehDivergente = item.status === 'DIVERGENTE'

                        return (
                          <tr key={item.chave} className={`transition-colors ${trBg}`}>
                            <td className="py-2.5 px-3 font-semibold text-[#1C2B1C] whitespace-nowrap">
                              {item.campo}
                              {item.obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
                            </td>
                            <td
                              className={`py-2.5 px-3 font-mono text-[11px] ${
                                ehDivergente ? 'text-red-700 font-bold' : 'text-[#1C2B1C]'
                              }`}
                            >
                              {item.informado}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#1B5E20] font-semibold">
                              {item.encontrado_bula}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <Badge className={`text-[10px] font-bold border-0 ${badgeBg}`}>
                                {item.status}
                              </Badge>
                            </td>
                            <td
                              className={`py-2.5 px-3 text-[11px] leading-relaxed max-w-xs ${
                                ehDivergente ? 'text-red-900 font-medium' : 'text-[#5A6D5A]'
                              }`}
                            >
                              {item.explicacao}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* ------------------------------------------------------------------ */}
              {/* 3. SEÇÃO NCM POR EMBALAGEM EM LINHAS DIFERENTES (Requisito Explícito) */}
              {/* ------------------------------------------------------------------ */}
              <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-4 bg-[#FAFBF8] border-b border-[#DCE5DC]">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider flex items-center gap-1.5">
                      <Layers2 className="w-4 h-4 text-[#1B5E20]" />
                      <span>NCM Aplicável por Faixa de Embalagem (Tabela TIPI)</span>
                    </CardTitle>
                    {resultado.possui_diferenca_ncm_embalagem ? (
                      <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                        Variação de NCM por Embalagem Identificada
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">
                        NCM Homogêneo nas Faixas
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs text-[#5A6D5A]">
                    Conforme as 4 faixas da TIPI (Nota de Subposições 2 do Cap. 38 ou Nota 1 do Cap.
                    31). Cada embalagem comercial autorizada deve adotar a NCM da sua respectiva
                    faixa.
                  </CardDescription>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#DCE5DC] bg-[#F5F7F1]/50 text-[#5A6D5A] font-semibold text-left">
                        <th className="py-2 px-3">Faixa de Embalagem</th>
                        <th className="py-2 px-3">Exemplos / Quantidade</th>
                        <th className="py-2 px-3">NCM Correta da Faixa</th>
                        <th className="py-2 px-3">NCM Informada ({ncm})</th>
                        <th className="py-2 px-3">Enquadramento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE5DC]">
                      {resultado.linhas_ncm_embalagem.map((linha: LinhaNcmEmbalagem) => {
                        const aplica = linha.ncm_informada_se_aplica
                        return (
                          <tr
                            key={linha.faixa_id}
                            className={`transition-colors ${
                              aplica ? 'bg-emerald-50/50 font-semibold' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-[#1C2B1C]">{linha.faixa_nome}</div>
                              <span className="text-[10px] text-[#5A6D5A]">
                                {linha.faixa_rotulo}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-[#5A6D5A] text-[11px]">
                              {linha.exemplo_embalagem}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">
                              {linha.ncm_correta}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#1C2B1C]">
                              {ncm}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <Badge
                                className={`text-[10px] font-bold border-0 ${
                                  aplica ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {aplica ? 'Aplica-se à Informada' : 'NCM Distinta'}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* ------------------------------------------------------------------ */}
              {/* 4. SEÇÃO DE DIVERGÊNCIAS (MODO VALIDAR EXISTENTE) */}
              {/* ------------------------------------------------------------------ */}
              {resultado.comparacao_existente && (
                <Card className="rounded-2xl border-purple-200 bg-gradient-to-br from-purple-50/40 to-white shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-purple-700" />
                      <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                        Conferência com a Base Mestre (Cadastro Existente)
                      </h4>
                    </div>
                    <Badge
                      className={`text-[10px] border-0 font-bold ${
                        resultado.comparacao_existente.necessita_atualizacao
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {resultado.comparacao_existente.necessita_atualizacao
                        ? `${resultado.comparacao_existente.divergencias.length} Divergência(s) Encontrada(s)`
                        : 'Dados 100% Sincronizados com a Bula'}
                    </Badge>
                  </div>

                  {resultado.comparacao_existente.divergencias.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-purple-900">
                        O cadastro gravado na Base Mestre diverge da bula oficial nos seguintes
                        pontos:
                      </p>
                      <div className="space-y-2">
                        {resultado.comparacao_existente.divergencias.map((div, i) => (
                          <div
                            key={i}
                            className="p-2.5 rounded-xl border border-purple-200 bg-white text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <strong className="text-purple-900 font-bold">{div.campo}</strong>
                              <span className="text-[10px] text-[#5A6D5A]">
                                Gravado hoje: <strong>{div.valor_gravado}</strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-[11px]">
                              <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Valor Correto na Bula: {div.valor_correto_bula}</span>
                            </div>
                            <p className="text-[11px] text-[#5A6D5A] italic">{div.sugestao}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>
                        Parabéns! O cadastro gravado na Base Mestre confere com todas as
                        especificações da bula oficial e vigência regulatória do MAPA.
                      </span>
                    </div>
                  )}
                </Card>
              )}

              {/* ------------------------------------------------------------------ */}
              {/* 5. TRAVAS DE AUDITORIA APLICADAS */}
              {/* ------------------------------------------------------------------ */}
              <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#1B5E20]" />
                    <h4 className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider">
                      Travas de Auditoria Regulatória Aplicadas
                    </h4>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-[#5A6D5A]">
                    {resultado.total_aprovadas} de {resultado.total_travas} Conformes
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {resultado.travas.map((t) => (
                    <div
                      key={t.id_trava}
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                        t.aprovado
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-red-200 bg-red-50/40'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-white ${
                          t.aprovado ? 'bg-emerald-600' : 'bg-red-600'
                        }`}
                      >
                        {t.aprovado ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <strong className="text-[#1C2B1C] block font-bold">
                          Trava {t.id_trava}: {t.trava_nome}
                        </strong>
                        <p className="text-[11px] text-[#5A6D5A] mt-0.5 leading-snug">
                          {t.mensagem}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* ------------------------------------------------------------------ */}
              {/* 6. FONTES CONSULTADAS */}
              {/* ------------------------------------------------------------------ */}
              <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#1B5E20]" />
                    <h4 className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider">
                      Rastreabilidade das Fontes Oficiais
                    </h4>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-[#5A6D5A]">
                    Auditoria Rastreável
                  </Badge>
                </div>
                <div className="space-y-2">
                  {resultado.fontes_consultadas.map((fonte, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl border border-[#DCE5DC] bg-[#FAFBF8] flex items-start justify-between gap-2 text-xs"
                    >
                      <div>
                        <strong className="text-[#1C2B1C] block font-bold">{fonte.fonte}</strong>
                        <p className="text-[11px] text-[#5A6D5A] mt-0.5 leading-relaxed">
                          {fonte.detalhes}
                        </p>
                      </div>
                      {fonte.url && (
                        <a
                          href={fonte.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#1B5E20] hover:underline flex items-center gap-1 flex-shrink-0"
                        >
                          <span>Portal</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
