import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
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
  Search,
  Package,
  Layers2,
  ArrowRight,
  RefreshCw,
  FileSpreadsheet,
  FileCode,
  Scale,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollableTable } from '@/components/ScrollableTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/use-toast'
import { PainelEnquadramentoTributario } from '@/components/PainelEnquadramentoTributario'
import {
  validarCadastroProduto,
  criarProdutoBaseMestre,
  atualizarProdutoBaseMestre,
  resolverNcmBaseMestre,
  buscarDadosOficiaisProduto,
  type CandidatoOficialProduto,
} from '@/services/agroService'
import { parsearEmbalagemComercial } from '@/lib/motorCanonico'
import type {
  ValidarCadastroInput,
  RespostaValidacaoCadastro,
  CampoValidadoResultado,
  LinhaNcmEmbalagem,
} from '@/types/agro'

const ETAPAS_PROGRESSO = [
  { etapa: 1, texto: 'Iniciando validação cadastral com dados oficiais confirmados...' },
  { etapa: 2, texto: 'Auditando Registro MAPA e vinculação com a Bula Oficial...' },
  { etapa: 3, texto: 'Confrontando NCM e Princípio Ativo com a TIPI e Base Mestre...' },
  { etapa: 4, texto: 'Aplicando as 6 Travas de Auditoria Regulatória...' },
  {
    etapa: 5,
    texto: 'Calculando enquadramento tributário completo (ICMS, PIS, COFINS, IBS, CBS)...',
  },
  { etapa: 6, texto: 'Consolidando parecer fiscal e fundamentação legal...' },
]

export function Validar() {
  // ---------------------------------------------------------------------------
  // 1. FORMULÁRIO DE CONSULTA: 4 CAMPOS BÁSICOS E FUNDAMENTAIS
  // ---------------------------------------------------------------------------
  const [nomeComercial, setNomeComercial] = useState('')
  const [ncm, setNcm] = useState('')
  const [embalagem, setEmbalagem] = useState('')
  const [codigoMapa, setCodigoMapa] = useState('')

  // Campos complementares opcionais (colapsados)
  const [exibirCamposOpcionais, setExibirCamposOpcionais] = useState(false)
  const [fabricanteOpcional, setFabricanteOpcional] = useState('')
  const [concentracaoOpcional, setConcentracaoOpcional] = useState('')

  // ---------------------------------------------------------------------------
  // 2. BUSCA EM DADOS OFICIAIS & RESOLUÇÃO DO PRINCÍPIO ATIVO
  // ---------------------------------------------------------------------------
  const [buscandoOficiais, setBuscandoOficiais] = useState(false)
  const [produtoOficialConfirmado, setProdutoOficialConfirmado] =
    useState<CandidatoOficialProduto | null>(null)
  const [candidatosOficiais, setCandidatosOficiais] = useState<CandidatoOficialProduto[]>([])
  const [buscaOficialRealizada, setBuscaOficialRealizada] = useState(false)

  // Resolução da NCM canônica na Base Mestre via embalagem
  const [ncmResolvidaMestre, setNcmResolvidaMestre] = useState<{
    ncmEspecifica: string
    quantidade: number
    unidade: string
    acondicionamento: string
  } | null>(null)

  // ---------------------------------------------------------------------------
  // 3. VALIDAÇÃO DO CADASTRO (Travas + Parecer + Fundamentação)
  // ---------------------------------------------------------------------------
  const { isAdmin } = useAuth()
  const [autoCadastrar, setAutoCadastrar] = useState(false)

  useEffect(() => {
    setAutoCadastrar(Boolean(isAdmin))
  }, [isAdmin])

  const [validando, setValidando] = useState(false)
  const [progressoIndice, setProgressoIndice] = useState(0)
  const [erroValidacao, setErroValidacao] = useState<string | null>(null)
  const [resultado, setResultado] = useState<RespostaValidacaoCadastro | null>(null)
  const [salvoComSucesso, setSalvoComSucesso] = useState(false)
  const [savingBaseMestre, setSavingBaseMestre] = useState(false)

  // Timer de progresso visual das etapas
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    if (validando) {
      setProgressoIndice(0)
      timer = setInterval(() => {
        setProgressoIndice((prev) => (prev < ETAPAS_PROGRESSO.length - 1 ? prev + 1 : prev))
      }, 1000)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [validando])

  // Quando o código MAPA ou a Embalagem mudam, resolve NCM na Base Mestre
  const atualizarResolucaoNcmMestre = async (mapaValor: string, embValor: string) => {
    const mapaLimpo = mapaValor.trim()
    if (!mapaLimpo) {
      setNcmResolvidaMestre(null)
      return
    }
    try {
      const parseada = parsearEmbalagemComercial(embValor)
      const res = await resolverNcmBaseMestre(
        mapaLimpo,
        parseada.quantidade,
        parseada.unidade,
        parseada.acondicionamento,
      )
      setNcmResolvidaMestre(res)
    } catch {
      setNcmResolvidaMestre(null)
    }
  }

  // ---------------------------------------------------------------------------
  // PASSO 2: EXECUTAR BUSCA EM DADOS OFICIAIS (Bula + Base Mestre)
  // ---------------------------------------------------------------------------
  const handleBuscarDadosOficiais = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    const nomeLimpo = nomeComercial.trim()
    const mapaLimpo = codigoMapa.trim()
    const ncmLimpa = ncm.replace(/\D/g, '')

    if (!nomeLimpo && !mapaLimpo && !ncmLimpa) {
      toast({
        variant: 'destructive',
        title: 'Informe os dados da consulta',
        description:
          'Preencha ao menos o Nome Comercial ou o Código MAPA para localizar o registro oficial.',
      })
      return
    }

    setBuscandoOficiais(true)
    setErroValidacao(null)
    setResultado(null)
    setSalvoComSucesso(false)

    try {
      // 1. Resolver NCM na Base Mestre
      await atualizarResolucaoNcmMestre(mapaLimpo, embalagem)

      // 2. Buscar nos dados oficiais do app (bula_produtos + base_mestre + bula_composicao)
      const resp = await buscarDadosOficiaisProduto({
        nomeComercial: nomeLimpo,
        ncm: ncmLimpa,
        embalagem: embalagem.trim(),
        codigoMapa: mapaLimpo,
      })

      setBuscaOficialRealizada(true)

      if (resp.candidatoPrincipal) {
        setProdutoOficialConfirmado(resp.candidatoPrincipal)
        setCandidatosOficiais(resp.outrosCandidatos)

        // Se NCM não estava preenchida ou era parcial, enriquece
        if (!ncm.trim() && resp.candidatoPrincipal.ncmOficial) {
          setNcm(resp.candidatoPrincipal.ncmOficial)
        }
        // Se Código MAPA não estava preenchido, enriquece
        if (!codigoMapa.trim() && resp.candidatoPrincipal.registroMapa) {
          setCodigoMapa(resp.candidatoPrincipal.registroMapa)
        }

        toast({
          title: 'Registro Oficial Localizado!',
          description: `Identificado na ${resp.candidatoPrincipal.origemRotulo}: ${resp.candidatoPrincipal.principioAtivo}`,
        })
      } else {
        setProdutoOficialConfirmado(null)
        setCandidatosOficiais([])
        toast({
          title: 'Nenhum registro oficial idêntico',
          description:
            'Não encontramos bula nem cadastro oficial correspondente a estes dados. Você ainda pode forçar a validação.',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao buscar dados oficiais.'
      setErroValidacao(msg)
      toast({
        variant: 'destructive',
        title: 'Erro na busca oficial',
        description: msg,
      })
    } finally {
      setBuscandoOficiais(false)
    }
  }

  // Confirmar um candidato oficial específico (quando há candidatos próximos)
  const handleSelecionarCandidato = (candidato: CandidatoOficialProduto) => {
    setProdutoOficialConfirmado(candidato)
    if (candidato.registroMapa) {
      setCodigoMapa(candidato.registroMapa)
    }
    if (candidato.ncmOficial && !ncm.trim()) {
      setNcm(candidato.ncmOficial)
    }
    if (candidato.marcaPadronizada && !nomeComercial.trim()) {
      setNomeComercial(candidato.marcaPadronizada)
    }
    atualizarResolucaoNcmMestre(candidato.registroMapa || codigoMapa, embalagem)

    toast({
      title: 'Produto Oficial Confirmado!',
      description: `Vinculado: ${candidato.nomeComercial} (Princípio Ativo: ${candidato.principioAtivo})`,
    })
  }

  // ---------------------------------------------------------------------------
  // PASSO 4: EXECUTAR VALIDAÇÃO DO CADASTRO (Travas + Parecer + Fundamentação)
  // ---------------------------------------------------------------------------
  const handleExecutarValidacao = async () => {
    const nomeEfetivo =
      nomeComercial.trim() ||
      produtoOficialConfirmado?.marcaPadronizada ||
      produtoOficialConfirmado?.nomeComercial ||
      ''

    if (!nomeEfetivo) {
      toast({
        variant: 'destructive',
        title: 'Nome Comercial obrigatório',
        description: 'Informe o Nome Comercial do produto para validar o cadastro.',
      })
      return
    }

    setValidando(true)
    setErroValidacao(null)
    setSalvoComSucesso(false)

    try {
      const mapaEfetivo = codigoMapa.trim() || produtoOficialConfirmado?.registroMapa || undefined
      const paEfetivo = produtoOficialConfirmado?.principioAtivo || undefined
      const fabEfetivo =
        fabricanteOpcional.trim() || produtoOficialConfirmado?.fabricante || undefined
      const ncmEfetiva =
        ncm.replace(/\D/g, '') ||
        ncmResolvidaMestre?.ncmEspecifica?.replace(/\D/g, '') ||
        produtoOficialConfirmado?.ncmOficial?.replace(/\D/g, '') ||
        undefined

      const payload: ValidarCadastroInput = {
        nome_comercial: nomeEfetivo,
        ncm: ncmEfetiva,
        codigo_mapa: mapaEfetivo,
        registro_mapa: mapaEfetivo,
        embalagem: embalagem.trim() || produtoOficialConfirmado?.embalagem || undefined,
        principio_ativo: paEfetivo,
        fabricante: fabEfetivo,
        concentracao: concentracaoOpcional.trim()
          ? Number(concentracaoOpcional.replace(',', '.'))
          : undefined,
        modo: 'novo',
        auto_cadastrar: autoCadastrar,
      }

      const resp = await validarCadastroProduto(payload)
      setResultado(resp)

      if (resp.veredito_geral === 'APROVADO') {
        if (resp.gravacao_base_mestre?.executada) {
          setSalvoComSucesso(true)
          toast({
            title: 'Cadastro Validado e Gravado!',
            description: resp.gravacao_base_mestre.mensagem,
          })
        } else {
          toast({
            title: 'Cadastro Aprovado!',
            description: 'Todas as travas regulatórias e enquadramentos fiscais conferem.',
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
      const msg = err instanceof Error ? err.message : 'Falha ao validar cadastro do produto.'
      setErroValidacao(msg)
      toast({
        variant: 'destructive',
        title: 'Erro no Motor de Validação',
        description: msg,
      })
    } finally {
      setValidando(false)
    }
  }

  // Gravação manual na Base Mestre (para Admin)
  const handleGravarBaseMestre = async () => {
    if (!resultado || resultado.veredito_geral === 'REPROVADO') return
    setSavingBaseMestre(true)

    try {
      const canon = resultado.produto_canonico || {}
      const ncmCalculada =
        ncmResolvidaMestre?.ncmEspecifica || canon.ncm_especifica || canon.ncm_padrao || ncm || ''

      const embParseada = parsearEmbalagemComercial(
        canon.embalagem || embalagem || '1X20L (20 L)',
      )

      const payload = {
        nome_completo: canon.nome_completo || nomeComercial,
        marca_padronizada: canon.marca_padronizada || nomeComercial,
        ncm_padrao: ncmCalculada,
        ncm_especifica: ncmResolvidaMestre?.ncmEspecifica || ncmCalculada,
        ncm: ncmCalculada.replace(/\D/g, ''),
        principio_ativo:
          canon.principio_ativo || produtoOficialConfirmado?.principioAtivo || nomeComercial,
        registro_mapa: canon.registro_mapa || codigoMapa || produtoOficialConfirmado?.registroMapa,
        titular_fabricante:
          canon.titular_fabricante || fabricanteOpcional || produtoOficialConfirmado?.fabricante,
        fabricante:
          canon.titular_fabricante || fabricanteOpcional || produtoOficialConfirmado?.fabricante,
        embalagem: canon.embalagem || embalagem || '1X20L (20 L)',
        embalagem_original: embalagem || canon.embalagem || '1X20L (20 L)',
        quantidade_embalagem_principal:
          canon.quantidade_embalagem_principal ||
          ncmResolvidaMestre?.quantidade ||
          embParseada.quantidade ||
          20,
        unidade_medida_principal:
          canon.unidade_medida_principal ||
          ncmResolvidaMestre?.unidade ||
          embParseada.unidade ||
          'L',
        forma_acondicionamento:
          canon.forma_acondicionamento ||
          ncmResolvidaMestre?.acondicionamento ||
          embParseada.acondicionamento ||
          'Bombona',
        concentracao: concentracaoOpcional ? Number(concentracaoOpcional.replace(',', '.')) : 0,
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

      await criarProdutoBaseMestre(payload)
      setSalvoComSucesso(true)
      toast({
        title: 'Produto Gravado na Base Mestre!',
        description: `Cadastro oficial de "${payload.marca_padronizada}" adicionado com sucesso.`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gravar na Base Mestre.'
      toast({ variant: 'destructive', title: 'Falha ao Gravar', description: msg })
    } finally {
      setSavingBaseMestre(false)
    }
  }

  // Limpeza geral do formulário
  const handleLimpar = () => {
    setNomeComercial('')
    setNcm('')
    setEmbalagem('')
    setCodigoMapa('')
    setFabricanteOpcional('')
    setConcentracaoOpcional('')
    setProdutoOficialConfirmado(null)
    setCandidatosOficiais([])
    setBuscaOficialRealizada(false)
    setNcmResolvidaMestre(null)
    setResultado(null)
    setErroValidacao(null)
    setSalvoComSucesso(false)
  }

  // Exemplos rápidos de produtos oficiais
  const handleCarregarExemplo = (
    tipo: 'roundup_wg' | 'roundup_original' | 'standak' | 'cofenrin_5l' | 'cofenrin_20l',
  ) => {
    if (tipo === 'cofenrin_5l') {
      setNomeComercial('COFENRIN')
      setNcm('38086290')
      setEmbalagem('4X5L')
      setCodigoMapa('06922')
      atualizarResolucaoNcmMestre('06922', '4X5L')
    } else if (tipo === 'cofenrin_20l') {
      setNomeComercial('COFENRIN')
      setNcm('38086990')
      setEmbalagem('1X20L')
      setCodigoMapa('06922')
      atualizarResolucaoNcmMestre('06922', '1X20L')
    } else if (tipo === 'roundup_wg') {
      setNomeComercial('ROUNDUP WG')
      setNcm('38089324')
      setEmbalagem('20KG')
      setCodigoMapa('002094')
      atualizarResolucaoNcmMestre('002094', '20KG')
    } else if (tipo === 'roundup_original') {
      setNomeComercial('ROUNDUP ORIGINAL')
      setNcm('38089329')
      setEmbalagem('20 L')
      setCodigoMapa('01119')
      atualizarResolucaoNcmMestre('01119', '20 L')
    } else {
      setNomeComercial('STANDAK TOP')
      setNcm('38089299')
      setEmbalagem('4x5L')
      setCodigoMapa('001209')
      atualizarResolucaoNcmMestre('001209', '4x5L')
    }
    setProdutoOficialConfirmado(null)
    setCandidatosOficiais([])
    setBuscaOficialRealizada(false)
    setResultado(null)
    setErroValidacao(null)
  }

  // Produto derivado para a Fundamentação Tributária dos 5 Tributos
  const produtoParaFundamentacao = (() => {
    if (!resultado) return null
    const canon = resultado.produto_canonico || {}
    const ncmFinal =
      ncmResolvidaMestre?.ncmEspecifica ||
      canon.ncm_especifica ||
      canon.ncm_padrao ||
      ncm ||
      canon.ncm ||
      ''
    return {
      marca_padronizada: canon.marca_padronizada || nomeComercial,
      nome_produto: canon.nome_produto || nomeComercial,
      nome_completo: canon.nome_completo || nomeComercial,
      ncm: ncmFinal,
      ncm_padrao: canon.ncm_padrao || ncmFinal,
      ncm_especifica: ncmFinal,
      tipo_produto: canon.tipo_produto,
      principio_ativo:
        canon.principio_ativo ||
        produtoOficialConfirmado?.principioAtivo ||
        resultado.bula_extraida?.principio_ativo,
      macro_grupo: canon.macro_grupo,
      sub_grupo: canon.sub_grupo,
      registro_mapa:
        canon.registro_mapa ||
        codigoMapa ||
        produtoOficialConfirmado?.registroMapa ||
        resultado.bula_extraida?.registro_mapa,
      titular_fabricante:
        canon.titular_fabricante ||
        fabricanteOpcional ||
        produtoOficialConfirmado?.fabricante ||
        resultado.bula_extraida?.fabricante,
      fabricante:
        canon.titular_fabricante ||
        fabricanteOpcional ||
        produtoOficialConfirmado?.fabricante ||
        resultado.bula_extraida?.fabricante,
      embalagem: canon.embalagem || embalagem,
      status_pis_cofins: canon.status_pis_cofins,
      aliquota_ate_mar2026: canon.aliquota_ate_mar2026,
      aliquota_pos_abr2026_real: canon.aliquota_pos_abr2026_real,
      aliquota_pos_abr2026_presumido: canon.aliquota_pos_abr2026_presumido,
      cst_saida: canon.cst_saida,
      cst_entrada: canon.cst_entrada,
      ibs_cbs_2027: canon.ibs_cbs_2027,
    }
  })()

  // Exportação CSV do Parecer
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
    linhas.push('REGISTRO OFICIAL IDENTIFICADO')
    linhas.push(
      `Produto/Marca;"${(produtoOficialConfirmado?.nomeComercial || nomeComercial).replace(/"/g, '""')}"`,
    )
    linhas.push(
      `Princípio Ativo;"${(produtoOficialConfirmado?.principioAtivo || 'N/D').replace(/"/g, '""')}"`,
    )
    linhas.push(
      `Origem do P.A.;"${(produtoOficialConfirmado?.principioAtivoFonte || 'N/D').replace(/"/g, '""')}"`,
    )
    linhas.push(
      `Registro MAPA;"${(produtoOficialConfirmado?.registroMapa || codigoMapa).replace(/"/g, '""')}"`,
    )
    linhas.push(
      `Fabricante Oficial;"${(produtoOficialConfirmado?.fabricante || 'N/D').replace(/"/g, '""')}"`,
    )
    linhas.push('')
    linhas.push('VALIDAÇÃO CRUZADA CAMPO A CAMPO')
    linhas.push('Campo;Obrigatório;Valor Informado;Encontrado na Bula / Base;Status;Explicação')
    resultado.campos_validacao.forEach((c) => {
      linhas.push(
        `"${c.campo}";"${c.obrigatorio ? 'SIM' : 'NÃO'}";"${(c.informado || '').replace(/"/g, '""')}";"${(c.encontrado_bula || '').replace(/"/g, '""')}";"${c.status}";"${(c.explicacao || '').replace(/"/g, '""')}"`,
      )
    })
    linhas.push('')
    linhas.push('TRAVAS DE AUDITORIA')
    linhas.push('ID Trava;Nome;Status;Diagnóstico')
    resultado.travas.forEach((t) => {
      linhas.push(
        `"${t.id_trava}";"${t.trava_nome}";"${t.aprovado ? 'CONFORME' : 'BLOQUEADO'}";"${(t.mensagem || '').replace(/"/g, '""')}"`,
      )
    })

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

  // Exportação JSON
  const handleExportarJson = () => {
    if (!resultado) return
    const exportData = {
      tipo_relatorio: 'PARECER_UNIFICADO_VALIDACAO_FISCAL',
      gerado_em: new Date().toISOString(),
      consulta_entrada_4_campos: {
        nome_comercial: nomeComercial,
        ncm: ncm,
        embalagem: embalagem,
        codigo_mapa: codigoMapa,
      },
      registro_oficial_resolvido: produtoOficialConfirmado,
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

  return (
    <div className="space-y-6 animate-in fade-in-up duration-300">
      {/* ------------------------------------------------------------------ */}
      {/* CABEÇALHO */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1C2B1C] flex items-center gap-2">
            <span>Validar Produto</span>
            <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs font-semibold">
              Consulta por 4 Campos Básicos & Dados Oficiais
            </Badge>
          </h2>
          <p className="text-xs text-[#5A6D5A] mt-0.5">
            Consulte a partir de <strong>Nome Comercial</strong>, <strong>NCM</strong>,{' '}
            <strong>Quantidade da Embalagem</strong> e <strong>Código MAPA</strong>. O sistema busca
            na Bula Oficial e na Base Mestre, resolve o Princípio Ativo e valida o cadastro com as 6
            travas regulatórias e o enquadramento fiscal.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCarregarExemplo('roundup_wg')}
            className="text-xs h-8 text-[#1B5E20] border-emerald-300 hover:bg-emerald-50"
            title="Exemplo: ROUNDUP WG (MAPA 002094, NCM 38089324, 20KG)"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-[#F57F17]" />
            Roundup WG
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCarregarExemplo('cofenrin_5l' as any)}
            className="text-xs h-8 text-[#1B5E20] border-emerald-300 hover:bg-emerald-50 font-medium"
            title="Exemplo: COFENRIN 5 L (MAPA 06922, ≤ 7,5 kg → NCM 38086290)"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
            COFENRIN ≤ 7,5kg (5L)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCarregarExemplo('cofenrin_20l' as any)}
            className="text-xs h-8 text-[#1B5E20] border-emerald-300 hover:bg-emerald-50 font-medium"
            title="Exemplo: COFENRIN 20 L (MAPA 06922, > 7,5 kg → NCM 38086990)"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            COFENRIN &gt; 7,5kg (20L)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCarregarExemplo('standak')}
            className="text-xs h-8 text-[#1B5E20] border-emerald-300 hover:bg-emerald-50"
            title="Exemplo: STANDAK TOP (MAPA 001209, 4x5L)"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-[#F57F17]" />
            Standak Top
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
      {/* GRID PRINCIPAL: FORMULÁRIO (5 COLUNAS) vs RESOLUÇÃO & VALIDAÇÃO (7 COLUNAS) */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUNA ESQUERDA: FORMULÁRIO DE CONSULTA (4 CAMPOS FUNDAMENTAIS) */}
        <div className="lg:col-span-5">
          <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-[#1C2B1C] flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-[#1B5E20]" />
                  <span>Passo 1: Formulário de Consulta</span>
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  4 Campos Fundamentais
                </Badge>
              </div>
              <CardDescription className="text-xs text-[#5A6D5A]">
                Informe os 4 dados básicos do produto para disparar a busca nos registros oficiais
                do aplicativo (Bula Oficial AGROFIT e Base Mestre).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBuscarDadosOficiais} className="space-y-3.5">
                {/* CAMPO 1: NOME COMERCIAL */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="nome_comercial"
                      className="text-xs font-semibold text-[#1C2B1C]"
                    >
                      1. Nome Comercial *
                    </Label>
                    <span className="text-[10px] text-[#1B5E20] font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                      Marca / Produto
                    </span>
                  </div>
                  <Input
                    id="nome_comercial"
                    required
                    value={nomeComercial}
                    onChange={(e) => setNomeComercial(e.target.value)}
                    placeholder="Ex.: ROUNDUP WG, STANDAK TOP, 2-4 D..."
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                </div>

                {/* CAMPO 2: NCM */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ncm" className="text-xs font-semibold text-[#1C2B1C]">
                      2. NCM (Nomenclatura Comum do Mercosul) *
                    </Label>
                    <span className="text-[10px] text-[#5A6D5A] font-mono">
                      8 dígitos (ex.: 3808.93.24)
                    </span>
                  </div>
                  <Input
                    id="ncm"
                    value={ncm}
                    onChange={(e) => setNcm(e.target.value)}
                    placeholder="Ex.: 38089324, 38089329, 38089299..."
                    className="h-9 text-xs font-mono font-bold border-[#DCE5DC] text-[#1B5E20] focus-visible:ring-[#1B5E20]"
                  />
                  <span className="text-[10px] text-[#5A6D5A] block leading-tight">
                    Confrontada com a subposição química e faixas de embalagem da TIPI.
                  </span>
                </div>

                {/* CAMPO 3: QUANTIDADE DA EMBALAGEM */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="embalagem" className="text-xs font-semibold text-[#1C2B1C]">
                      3. Quantidade da Embalagem *
                    </Label>
                    <span className="text-[10px] text-[#5A6D5A] font-mono">
                      ex.: 20KG, 4x5L, 20 L
                    </span>
                  </div>
                  <Input
                    id="embalagem"
                    value={embalagem}
                    onChange={(e) => {
                      const val = e.target.value
                      setEmbalagem(val)
                      atualizarResolucaoNcmMestre(codigoMapa, val)
                    }}
                    placeholder="Ex.: 20KG, 4x5L, Bombona 20 L, Frasco 1 L..."
                    className="h-9 text-xs border-[#DCE5DC] focus-visible:ring-[#1B5E20]"
                  />
                  {/* Atalhos rápidos de embalagem */}
                  <div className="flex items-center justify-between text-[10px] text-[#5A6D5A] pt-0.5">
                    <span>Atalhos:</span>
                    <div className="flex gap-1 flex-wrap">
                      {['20KG', '4x5L', '20 L Bombona', '1 L Frasco', 'Tambor 200 L'].map(
                        (item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              setEmbalagem(item)
                              atualizarResolucaoNcmMestre(codigoMapa, item)
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-[#1B5E20] hover:bg-emerald-100 transition-colors border border-emerald-200/60"
                          >
                            {item}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>

                {/* CAMPO 4: CÓDIGO MAPA */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="codigo_mapa" className="text-xs font-semibold text-[#1C2B1C]">
                      4. Código MAPA (Registro Oficial) *
                    </Label>
                    <span className="text-[10px] text-[#1B5E20] font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                      Chave Oficial MAPA
                    </span>
                  </div>
                  <Input
                    id="codigo_mapa"
                    value={codigoMapa}
                    onChange={(e) => {
                      const val = e.target.value
                      setCodigoMapa(val)
                      atualizarResolucaoNcmMestre(val, embalagem)
                    }}
                    placeholder="Ex.: 002094, 01119, 001209, 0315..."
                    className="h-9 text-xs font-mono font-bold border-[#DCE5DC] text-[#1B5E20] focus-visible:ring-[#1B5E20]"
                  />
                  <span className="text-[10px] text-[#5A6D5A] block leading-tight">
                    Preserva o número oficial de registro do defensivo no Ministério da Agricultura.
                  </span>
                </div>

                {/* BOTÃO PRINCIPAL DE BUSCA EM DADOS OFICIAIS */}
                <div className="pt-1">
                  <Button
                    type="submit"
                    disabled={buscandoOficiais}
                    className="w-full h-11 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
                  >
                    {buscandoOficiais ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Buscando na Bula e Base Mestre...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>Buscar em Dados Oficiais</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* CAMPOS EXTRAS OPCIONAIS (COLAPSADOS) */}
                <div className="pt-2 border-t border-[#DCE5DC]">
                  <button
                    type="button"
                    onClick={() => setExibirCamposOpcionais(!exibirCamposOpcionais)}
                    className="flex items-center justify-between w-full text-xs font-semibold text-[#5A6D5A] hover:text-[#1C2B1C] py-1"
                  >
                    <span className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-[#1B5E20]" />
                      <span>Campos Complementares (Opcionais)</span>
                    </span>
                    {exibirCamposOpcionais ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {exibirCamposOpcionais && (
                    <div className="mt-2.5 space-y-2.5 p-3 rounded-xl bg-[#FAFBF8] border border-[#DCE5DC] animate-in fade-in">
                      <div className="space-y-1">
                        <Label
                          htmlFor="fabricante_opcional"
                          className="text-xs font-semibold text-[#1C2B1C]"
                        >
                          Fabricante Declarado
                        </Label>
                        <Input
                          id="fabricante_opcional"
                          value={fabricanteOpcional}
                          onChange={(e) => setFabricanteOpcional(e.target.value)}
                          placeholder="Ex.: BAYER S/A, BASF, MONSANTO..."
                          className="h-8 text-xs border-[#DCE5DC]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor="concentracao_opcional"
                          className="text-xs font-semibold text-[#1C2B1C]"
                        >
                          Concentração (g/L ou g/kg)
                        </Label>
                        <Input
                          id="concentracao_opcional"
                          value={concentracaoOpcional}
                          onChange={(e) => setConcentracaoOpcional(e.target.value)}
                          placeholder="Ex.: 480, 720, 250..."
                          className="h-8 text-xs border-[#DCE5DC]"
                        />
                      </div>
                      <p className="text-[10px] text-[#5A6D5A] italic">
                        * O Princípio Ativo, Fabricante Oficial e NCM são resolvidos automaticamente
                        a partir da Bula e da Base Mestre.
                      </p>
                    </div>
                  )}
                </div>

                {/* Auto-cadastrar na Base Mestre (apenas Admin) */}
                <div className="pt-2 border-t border-[#DCE5DC]">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/60">
                    <div className="space-y-0.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-[#1B5E20]" />
                        <span className="text-xs font-bold text-[#1C2B1C]">
                          Gravar na Base Mestre ao Validar
                        </span>
                        {!isAdmin && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-blue-700 bg-blue-50 border-blue-200 ml-1"
                          >
                            Apenas Admin
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-[#5A6D5A] leading-tight">
                        {isAdmin
                          ? 'Insere automaticamente o produto no Padrão Canônico se for aprovado sem duplicidade.'
                          : 'Modo auditoria: somente leitura para perfil analista.'}
                      </p>
                    </div>
                    <Switch
                      checked={isAdmin && autoCadastrar}
                      onCheckedChange={setAutoCadastrar}
                      disabled={!isAdmin}
                      className="data-[state=checked]:bg-[#1B5E20]"
                    />
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* COLUNA DIREITA: RESOLUÇÃO DO REGISTRO OFICIAL + VALIDAÇÃO DAS TRAVAS */}
        <div className="lg:col-span-7 space-y-4">
          {/* Mensagem de Erro */}
          {erroValidacao && (
            <div className="p-4 rounded-2xl border border-red-300 bg-red-50/90 text-xs shadow-sm animate-in fade-in duration-300">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                  <XCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="text-sm font-bold text-red-950 block">
                    Falha na Operação
                  </strong>
                  <p className="text-red-900 mt-1 leading-relaxed">{erroValidacao}</p>
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ETAPA 1: SE AINDA NÃO FEZ BUSCA OFICIAL */}
          {/* ---------------------------------------------------------------- */}
          {!buscaOficialRealizada && !produtoOficialConfirmado && (
            <div className="bg-white rounded-2xl border border-dashed border-[#DCE5DC] p-10 text-center flex flex-col items-center justify-center min-h-[460px]">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center mb-3">
                <Search className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-[#1C2B1C]">
                Pronto para Consultar Dados Oficiais
              </h3>
              <p className="text-xs text-[#5A6D5A] max-w-md mt-1 leading-relaxed">
                Preencha os 4 campos fundamentais ao lado (Nome Comercial, NCM, Embalagem e Código
                MAPA) e clique em <strong>"Buscar em Dados Oficiais"</strong>. O sistema
                identificará a bula correspondente, resolverá o Princípio Ativo e apresentará a
                origem de cada informação antes de disparar a validação das 6 travas.
              </p>
              <div className="mt-4 flex gap-2 flex-wrap justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCarregarExemplo('roundup_wg')}
                  className="text-xs h-8 text-[#1B5E20] border-emerald-300"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-[#F57F17]" />
                  Exemplo Roundup WG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCarregarExemplo('standak')}
                  className="text-xs h-8 text-[#1B5E20] border-emerald-300"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-[#F57F17]" />
                  Exemplo Standak Top
                </Button>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ETAPA 2: REGISTRO OFICIAL RESOLVIDO (ORIGEM DE CADA DADO) */}
          {/* ---------------------------------------------------------------- */}
          {buscaOficialRealizada && (
            <Card className="rounded-2xl border-emerald-300 bg-white shadow-sm overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-emerald-50/80 to-white border-b border-emerald-100">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[#1B5E20]" />
                    <div>
                      <CardTitle className="text-sm font-bold text-[#1C2B1C]">
                        Passo 2 & 3: Registro Oficial Identificado & Princípio Ativo
                      </CardTitle>
                      <CardDescription className="text-xs text-[#5A6D5A]">
                        Rastreabilidade de onde veio cada dado oficial do produto
                      </CardDescription>
                    </div>
                  </div>
                  {produtoOficialConfirmado && (
                    <Badge className="bg-emerald-700 text-white font-semibold text-xs px-2.5 py-0.5">
                      {produtoOficialConfirmado.origemRotulo}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {produtoOficialConfirmado ? (
                  <>
                    {/* CARD PRINCIPAL DO REGISTRO IDENTIFICADO */}
                    <div className="p-4 rounded-xl bg-[#FAFBF8] border border-[#DCE5DC] space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A6D5A]">
                            Produto Identificado Oficialmente
                          </span>
                          <h3 className="text-base font-bold text-[#1C2B1C] mt-0.5">
                            {produtoOficialConfirmado.nomeComercial}
                          </h3>
                          <p className="text-xs text-[#5A6D5A] mt-0.5">
                            {produtoOficialConfirmado.motivoCorrespondencia}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-[#1B5E20] border-emerald-300 text-xs font-mono font-bold"
                        >
                          Correspondência: {produtoOficialConfirmado.scoreCorrespondencia}%
                        </Badge>
                      </div>

                      {/* MATRIZ DE ORIGEM DOS DADOS (PRINCÍPIO ATIVO, REGISTRO MAPA, NCM, FABRICANTE) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#DCE5DC]">
                        {/* PRINCÍPIO ATIVO */}
                        <div className="p-2.5 rounded-lg bg-white border border-[#DCE5DC] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#5A6D5A] uppercase tracking-wider">
                              Princípio Ativo Resolvido
                            </span>
                            <Badge className="text-[9px] bg-emerald-100 text-emerald-900 border-0">
                              {produtoOficialConfirmado.principioAtivoFonte}
                            </Badge>
                          </div>
                          <strong className="text-xs text-[#1C2B1C] block font-mono">
                            {produtoOficialConfirmado.principioAtivo}
                          </strong>
                        </div>

                        {/* REGISTRO MAPA */}
                        <div className="p-2.5 rounded-lg bg-white border border-[#DCE5DC] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#5A6D5A] uppercase tracking-wider">
                              Registro MAPA Oficial
                            </span>
                            <Badge className="text-[9px] bg-emerald-100 text-emerald-900 border-0">
                              Bula / MAPA
                            </Badge>
                          </div>
                          <strong className="text-xs text-[#1B5E20] block font-mono">
                            {produtoOficialConfirmado.registroMapa || codigoMapa || 'Não informado'}
                          </strong>
                        </div>

                        {/* NCM RESOLVIDA */}
                        <div className="p-2.5 rounded-lg bg-white border border-[#DCE5DC] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#5A6D5A] uppercase tracking-wider">
                              NCM Aplicável
                            </span>
                            <Badge className="text-[9px] bg-emerald-100 text-emerald-900 border-0">
                              {ncmResolvidaMestre
                                ? 'Base Mestre por Embalagem'
                                : produtoOficialConfirmado.ncmFonte}
                            </Badge>
                          </div>
                          <strong className="text-xs text-[#1C2B1C] block font-mono">
                            {ncmResolvidaMestre?.ncmEspecifica ||
                              produtoOficialConfirmado.ncmOficial ||
                              ncm ||
                              'A definir pela faixa TIPI'}
                          </strong>
                        </div>

                        {/* FABRICANTE / TITULAR */}
                        <div className="p-2.5 rounded-lg bg-white border border-[#DCE5DC] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#5A6D5A] uppercase tracking-wider">
                              Fabricante / Titular
                            </span>
                            <Badge className="text-[9px] bg-emerald-100 text-emerald-900 border-0">
                              {produtoOficialConfirmado.fabricanteFonte}
                            </Badge>
                          </div>
                          <strong className="text-xs text-[#1C2B1C] block truncate">
                            {produtoOficialConfirmado.fabricante}
                          </strong>
                        </div>
                      </div>

                      {/* BOTÃO PARA DISPARAR A VALIDAÇÃO FINAL */}
                      <div className="pt-2">
                        <Button
                          type="button"
                          onClick={handleExecutarValidacao}
                          disabled={validando}
                          className="w-full h-11 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all"
                        >
                          {validando ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Executando Auditoria das 6 Travas...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-4 h-4" />
                              <span>
                                Confirmar Produto e Validar Cadastro (6 Travas & Tributação)
                              </span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* SE HOUVER OUTROS CANDIDATOS PRÓXIMOS, PERMITE CONFIRMAR OUTRO */}
                    {candidatosOficiais.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <span className="text-xs font-bold text-[#1C2B1C] flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-[#1B5E20]" />
                          <span>
                            Outros Registros Oficiais Candidatos (Mesmo Nome / MAPA / NCM):
                          </span>
                        </span>
                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                          {candidatosOficiais.map((cand) => (
                            <div
                              key={cand.id}
                              className="p-2.5 rounded-lg bg-white border border-[#DCE5DC] hover:border-emerald-400 transition-colors flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <strong className="text-[#1C2B1C] truncate font-bold">
                                    {cand.nomeComercial}
                                  </strong>
                                  <Badge variant="outline" className="text-[9px] text-[#5A6D5A]">
                                    {cand.origemRotulo}
                                  </Badge>
                                </div>
                                <div className="text-[11px] text-[#5A6D5A] mt-0.5 flex items-center gap-3 flex-wrap">
                                  <span>
                                    <strong>P.A.:</strong> {cand.principioAtivo}
                                  </span>
                                  <span>
                                    <strong>MAPA:</strong> {cand.registroMapa || 'N/D'}
                                  </span>
                                  {cand.ncmOficial && (
                                    <span>
                                      <strong>NCM:</strong> {cand.ncmOficial}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleSelecionarCandidato(cand)}
                                className="h-7 text-xs border-emerald-300 text-[#1B5E20] hover:bg-emerald-50 shrink-0"
                              >
                                Selecionar Este
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-3">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                      <span>Nenhum registro oficial correspondente encontrado no aplicativo</span>
                    </div>
                    <p className="leading-relaxed">
                      Não encontramos bulas oficiais nem registros na Base Mestre com os termos
                      informados. Você pode tentar ajustar o Código MAPA ou o Nome Comercial, ou
                      disparar a validação com os dados informados.
                    </p>
                    <Button
                      type="button"
                      onClick={handleExecutarValidacao}
                      disabled={validando}
                      className="bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs h-9 rounded-lg"
                    >
                      {validando ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Validar com Dados Informados
                    </Button>
                  </div>
                )}

                {/* Barra de Progresso das Etapas da Validação */}
                {validando && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 animate-in fade-in duration-300">
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
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ETAPA 3: PARECER DA VALIDAÇÃO DO CADASTRO (TRAVAS + FUNDAMENTAÇÃO) */}
          {/* ---------------------------------------------------------------- */}
          {resultado && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* CARD DE VEREDITO GERAL */}
              <Card
                className={`rounded-2xl border transition-all duration-300 shadow-md ${
                  resultado.veredito_geral === 'APROVADO'
                    ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/80 to-white'
                    : resultado.veredito_geral === 'APROVADO COM RESSALVAS'
                      ? 'border-amber-300 bg-gradient-to-br from-amber-50/80 to-white'
                      : 'border-red-300 bg-gradient-to-br from-red-50/80 to-white'
                }`}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md ${
                          resultado.veredito_geral === 'APROVADO'
                            ? 'bg-[#2E7D32]'
                            : resultado.veredito_geral === 'APROVADO COM RESSALVAS'
                              ? 'bg-[#F57F17]'
                              : 'bg-[#C62828]'
                        }`}
                      >
                        {resultado.veredito_geral === 'APROVADO' ? (
                          <CheckCircle2 className="w-7 h-7" />
                        ) : resultado.veredito_geral === 'APROVADO COM RESSALVAS' ? (
                          <AlertTriangle className="w-7 h-7" />
                        ) : (
                          <XCircle className="w-7 h-7" />
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
                        <h3 className="text-lg font-bold text-[#1C2B1C] mt-0.5">
                          Conformidade Cadastral: {resultado.score}%
                        </h3>
                        <p className="text-xs text-[#5A6D5A]">{resultado.veredito_motivo}</p>
                      </div>
                    </div>

                    {/* Botões de Ação: Exportar e Gravar */}
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
                        <span>CSV</span>
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
                        <span>JSON</span>
                      </Button>

                      {/* Gravar na Base Mestre */}
                      {resultado.veredito_geral !== 'REPROVADO' && (
                        <div className="shrink-0">
                          {salvoComSucesso || resultado.gravacao_base_mestre?.executada ? (
                            <Badge className="bg-emerald-700 text-white px-3 py-2 text-xs flex items-center gap-1.5 shadow-sm">
                              <Check className="w-4 h-4" />
                              <span>Gravado na Base Mestre</span>
                            </Badge>
                          ) : isAdmin ? (
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
                              <span>Gravar na Base Mestre</span>
                            </Button>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs text-slate-500 bg-slate-50 border-slate-200 px-2.5 py-1.5"
                            >
                              Consulta / Somente Leitura
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AS 6 TRAVAS DE AUDITORIA REGULATÓRIA */}
              <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#1B5E20]" />
                    <h4 className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider">
                      As 6 Travas de Auditoria Regulatória
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
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-white ${
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

              {/* PAINEL FUNDAMENTAÇÃO LEGAL TRIBUTÁRIA (5 TRIBUTOS) */}
              {produtoParaFundamentacao && (
                <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Scale className="w-4 h-4 text-[#1B5E20]" />
                      <div>
                        <h4 className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider">
                          Fundamentação Legal Tributária
                        </h4>
                        <p className="text-[11px] text-[#5A6D5A]">
                          Citações normativas oficiais dos 5 tributos aplicáveis ao registro oficial
                          encontrado
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-[#1B5E20] border-emerald-300 bg-emerald-50"
                    >
                      5 Tributos Auditados
                    </Badge>
                  </div>

                  <PainelEnquadramentoTributario produto={produtoParaFundamentacao} />
                </Card>
              )}

              {/* VALIDAÇÃO CRUZADA CAMPO A CAMPO */}
              <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-4 bg-[#FAFBF8] border-b border-[#DCE5DC]">
                  <CardTitle className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#1B5E20]" />
                      <span>Validação Cruzada Campo a Campo</span>
                    </span>
                    <span className="text-[10px] text-[#5A6D5A] font-normal">
                      Informado vs. Bula Oficial / Base Mestre
                    </span>
                  </CardTitle>
                </CardHeader>
                <ScrollableTable autoFitHeight={false} maxHeight="340px">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-20 bg-[#F5F7F1] shadow-[0_1px_0_0_#DCE5DC]">
                      <tr className="border-b border-[#DCE5DC] bg-[#F5F7F1] text-[#5A6D5A] font-semibold text-left">
                        <th className="py-2.5 px-3">Campo</th>
                        <th className="py-2.5 px-3">Informado</th>
                        <th className="py-2.5 px-3">Encontrado Oficial</th>
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
                        } else if (item.status === 'RESSALVA') {
                          badgeBg = 'bg-amber-100 text-amber-900 border border-amber-300'
                          trBg = 'bg-amber-50/30 hover:bg-amber-50/50'
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
                </ScrollableTable>
              </Card>

              {/* ALERTA DE INCOMPATIBILIDADE NCM X FAIXA TIPI */}
              {resultado.analise_faixa_tipi?.possui_faixas &&
                !resultado.analise_faixa_tipi?.compativel &&
                resultado.analise_faixa_tipi?.alerta && (
                  <Card className="rounded-2xl border-amber-300 bg-amber-50 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-amber-900">
                            Incompatibilidade NCM × Faixa de Embalagem (TIPI)
                          </h4>
                          <Badge className="bg-amber-200 text-amber-900 border-amber-300 text-[10px] font-bold">
                            Regra Permanente TIPI
                          </Badge>
                        </div>
                        <p className="text-xs text-amber-800 mt-1 font-medium">
                          {resultado.analise_faixa_tipi.alerta}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-amber-800">Faixa aplicável identificada:</span>
                          <span className="font-bold text-amber-950">
                            {resultado.analise_faixa_tipi.faixa_aplicavel_nome}
                          </span>
                          <span className="text-amber-800">→ NCM esperada:</span>
                          <span className="font-mono font-bold text-amber-950 bg-amber-200/80 px-2 py-0.5 rounded">
                            {resultado.analise_faixa_tipi.ncm_esperada}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

              {/* ENQUADRAMENTO TIPI POR FAIXA DE EMBALAGEM */}
              {resultado.linhas_ncm_embalagem && resultado.linhas_ncm_embalagem.length > 0 && (
                <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm overflow-hidden">
                  <CardHeader className="pb-2 pt-4 px-4 bg-[#FAFBF8] border-b border-[#DCE5DC]">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider flex items-center gap-1.5">
                        <Layers2 className="w-4 h-4 text-[#1B5E20]" />
                        <span>NCM Aplicável por Faixa de Embalagem (Tabela TIPI)</span>
                      </CardTitle>
                      {resultado.possui_diferenca_ncm_embalagem ? (
                        <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                          Variação por Embalagem
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">
                          NCM Homogêneo
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <ScrollableTable autoFitHeight={false} maxHeight="280px">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-20 bg-[#F5F7F1] shadow-[0_1px_0_0_#DCE5DC]">
                        <tr className="border-b border-[#DCE5DC] bg-[#F5F7F1] text-[#5A6D5A] font-semibold text-left">
                          <th className="py-2 px-3">Faixa</th>
                          <th className="py-2 px-3">Quantidade / Exemplo</th>
                          <th className="py-2 px-3">NCM TIPI</th>
                          <th className="py-2 px-3">NCM Aplicada</th>
                          <th className="py-2 px-3">Enquadramento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DCE5DC]">
                        {resultado.linhas_ncm_embalagem.map((linha: LinhaNcmEmbalagem) => {
                          const aplica = linha.ncm_informada_se_aplica
                          const ncmExibida =
                            ncmResolvidaMestre?.ncmEspecifica ||
                            ncm ||
                            resultado.produto_canonico?.ncm_padrao ||
                            '—'
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
                                {ncmExibida}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <Badge
                                  className={`text-[10px] font-bold border-0 ${
                                    aplica
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {aplica ? 'Aplica-se à Embalagem' : 'Faixa Distinta'}
                                </Badge>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </ScrollableTable>
                </Card>
              )}

              {/* RASTREABILIDADE DAS FONTES OFICIAIS */}
              {resultado.fontes_consultadas && resultado.fontes_consultadas.length > 0 && (
                <Card className="rounded-2xl border-[#DCE5DC] bg-white shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#1B5E20]" />
                      <h4 className="text-xs font-bold text-[#1C2B1C] uppercase tracking-wider">
                        Rastreabilidade das Fontes Oficiais Auditadas
                      </h4>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-[#5A6D5A]">
                      Fontes Internas e Regulatórias
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {resultado.fontes_consultadas.map((fonte, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl border border-[#DCE5DC] bg-[#FAFBF8] flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <strong className="text-[#1C2B1C] font-bold">{fonte.fonte}</strong>
                            {fonte.status === 'sucesso' && (
                              <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]">
                                Conectado
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] mt-0.5 text-[#5A6D5A] leading-relaxed">
                            {fonte.detalhes}
                          </p>
                        </div>
                        {fonte.url && (
                          <a
                            href={fonte.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-[#1B5E20] hover:underline flex items-center gap-1 shrink-0"
                          >
                            <span>Link</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
