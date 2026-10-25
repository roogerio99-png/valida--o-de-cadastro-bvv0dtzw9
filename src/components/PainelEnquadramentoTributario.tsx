import React, { useState } from 'react'
import {
  FileText,
  Scale,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpen,
  Info,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building2,
  Copy,
  Check,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  determinarEnquadramentoTributario,
  type TributoEnquadramento,
  type DadosEntradaProdutoEnquadramento,
} from '@/lib/enquadramentoTributario'

interface PainelEnquadramentoTributarioProps {
  produto: DadosEntradaProdutoEnquadramento & {
    id?: string
    marca_padronizada?: string
    nome_completo?: string
    ncm_especifica?: string
    ncm_padrao?: string
    aliquota_ate_mar2026?: string
    aliquota_pos_abr2026_real?: string
    aliquota_pos_abr2026_presumido?: string
    ibs_cbs_2027?: string
    cst_saida?: string
    cst_entrada?: string
  }
  modoCompacto?: boolean
}

export function PainelEnquadramentoTributario({
  produto,
  modoCompacto = false,
}: PainelEnquadramentoTributarioProps) {
  const [detalhesAbertos, setDetalhesAbertos] = useState<Record<string, boolean>>({})
  const [copiado, setCopiado] = useState<string | null>(null)

  const enquadramento = determinarEnquadramentoTributario({
    ncm: produto.ncm_especifica || produto.ncm_padrao || produto.ncm,
    tipo_produto: produto.tipo_produto,
    principio_ativo: produto.principio_ativo,
    macro_grupo: produto.macro_grupo,
    sub_grupo: produto.sub_grupo,
    registro_mapa: produto.registro_mapa,
    titular_fabricante: produto.titular_fabricante,
  })

  const toggleDetalhe = (tributo: string) => {
    setDetalhesAbertos((prev) => ({
      ...prev,
      [tributo]: !prev[tributo],
    }))
  }

  const handleCopiarCitacao = (tributo: TributoEnquadramento) => {
    const texto = `${tributo.nomeCompleto} (${tributo.tributo})
Regime: ${tributo.regime}
Alíquota: ${tributo.aliquotaTexto}
Fundamentação Legal: ${tributo.citacao.norma} - ${tributo.citacao.artigo}${tributo.citacao.inciso ? `, ${tributo.citacao.inciso}` : ''}${tributo.citacao.paragrafo ? `, ${tributo.citacao.paragrafo}` : ''}
Texto Normativo: "${tributo.citacao.textoArtigo}"
Resumo Técnico: ${tributo.resumoClaro}`

    navigator.clipboard.writeText(texto)
    setCopiado(tributo.tributo)
    setTimeout(() => setCopiado(null), 2500)
  }

  const tributosList = [
    { key: 'PIS', data: enquadramento.pis, cor: 'amber' },
    { key: 'COFINS', data: enquadramento.cofins, cor: 'orange' },
    { key: 'IBS', data: enquadramento.ibs, cor: 'blue' },
    { key: 'CBS', data: enquadramento.cbs, cor: 'emerald' },
  ]

  const getCorTema = (cor: string) => {
    switch (cor) {
      case 'amber':
        return {
          bg: 'bg-amber-50/60',
          border: 'border-amber-200',
          badge: 'bg-amber-100 text-amber-900 border-amber-300',
          title: 'text-amber-950',
          icon: 'text-amber-700',
          accent: 'text-amber-800',
          legalBg: 'bg-amber-100/40 border-amber-200',
        }
      case 'orange':
        return {
          bg: 'bg-orange-50/60',
          border: 'border-orange-200',
          badge: 'bg-orange-100 text-orange-900 border-orange-300',
          title: 'text-orange-950',
          icon: 'text-orange-700',
          accent: 'text-orange-800',
          legalBg: 'bg-orange-100/40 border-orange-200',
        }
      case 'blue':
        return {
          bg: 'bg-blue-50/60',
          border: 'border-blue-200',
          badge: 'bg-blue-100 text-blue-900 border-blue-300',
          title: 'text-blue-950',
          icon: 'text-blue-700',
          accent: 'text-blue-800',
          legalBg: 'bg-blue-100/40 border-blue-200',
        }
      case 'emerald':
      default:
        return {
          bg: 'bg-emerald-50/60',
          border: 'border-emerald-200',
          badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          title: 'text-emerald-950',
          icon: 'text-emerald-700',
          accent: 'text-emerald-800',
          legalBg: 'bg-emerald-100/40 border-emerald-200',
        }
    }
  }

  return (
    <div className="space-y-3.5">
      {/* Cabeçalho do Enquadramento */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-[#F5F7F1] border border-[#DCE5DC] rounded-xl">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-[#1B5E20]" />
          <span className="font-bold text-xs text-[#1C2B1C]">
            Enquadramento Tributário Oficial por Tributo
          </span>
          <Badge
            variant="outline"
            className="text-[10px] font-mono bg-white text-[#1B5E20] border-[#A8C5A8]"
          >
            {enquadramento.ncmLimpa ? `NCM ${enquadramento.ncmLimpa}` : 'Sem NCM'}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] font-semibold ${
              enquadramento.qualificadoAgro
                ? 'bg-emerald-100/80 text-emerald-900 border-emerald-300'
                : 'bg-gray-100 text-gray-800 border-gray-300'
            }`}
          >
            {enquadramento.qualificadoAgro ? 'Insumo Agro Beneficiado' : 'Tributação Padrão Geral'}
          </Badge>
        </div>

        <span className="text-[11px] text-[#5A6D5A] italic">
          Citações exatas de Lei Federal, Artigo, Inciso e Parágrafo
        </span>
      </div>

      {/* Grid com os 4 Impostos: PIS, COFINS, IBS, CBS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {tributosList.map(({ key, data, cor }) => {
          const tema = getCorTema(cor)
          const isOpen = Boolean(detalhesAbertos[key])
          const foiCopiado = copiado === key

          return (
            <Card
              key={key}
              className={`p-3.5 rounded-xl border ${tema.border} ${tema.bg} shadow-xs flex flex-col justify-between transition-all`}
            >
              <div className="space-y-2.5">
                {/* Linha de Título do Tributo e Badge de Regime */}
                <div className="flex items-start justify-between gap-2 border-b pb-2 border-black/5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-black tracking-tight ${tema.title} px-2 py-0.5 rounded-md bg-white border border-black/5 shadow-2xs font-mono`}
                    >
                      {data.tributo}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-[#1C2B1C] leading-snug">
                        {data.nomeCompleto}
                      </h4>
                      <p className="text-[10px] text-[#5A6D5A]">{data.regime}</p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopiarCitacao(data)}
                    className="h-6 px-1.5 text-[10px] text-[#5A6D5A] hover:text-[#1C2B1C] bg-white/70 hover:bg-white border border-black/5"
                    title="Copiar fundamentação legal completa"
                  >
                    {foiCopiado ? (
                      <Check className="w-3 h-3 text-emerald-600 mr-1" />
                    ) : (
                      <Copy className="w-3 h-3 mr-1" />
                    )}
                    {foiCopiado ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>

                {/* Bloco de Alíquota e Regime */}
                <div className="p-2 bg-white/80 rounded-lg border border-black/5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#5A6D5A] font-medium">Alíquota / Carga:</span>
                    <span className="font-bold text-[#1C2B1C] font-mono text-right">
                      {data.aliquotaTexto}
                    </span>
                  </div>
                </div>

                {/* Citação Legal Específica: Artigo, Inciso, Parágrafo */}
                <div className={`p-2.5 rounded-lg border ${tema.legalBg} space-y-1.5`}>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1C2B1C]">
                    <BookOpen className={`w-3.5 h-3.5 ${tema.icon}`} />
                    <span>Citação Legal Vigente:</span>
                  </div>

                  <div className="text-[11px] space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">
                      <span className="px-1.5 py-0.5 bg-white rounded border border-black/10 font-bold text-[#1B5E20] font-mono text-[10px]">
                        {data.citacao.norma}
                      </span>
                      <span className="px-1.5 py-0.5 bg-white rounded border border-black/10 font-bold text-[#1C2B1C] font-mono text-[10px]">
                        {data.citacao.artigo}
                      </span>
                      {data.citacao.inciso && (
                        <span className="px-1.5 py-0.5 bg-white rounded border border-black/10 font-semibold text-blue-900 font-mono text-[10px]">
                          {data.citacao.inciso}
                        </span>
                      )}
                    </div>

                    {data.citacao.paragrafo && (
                      <p className="text-[10px] text-[#4A5D4A] font-mono leading-tight pt-0.5">
                        <strong className="text-[#1C2B1C]">Dispositivo:</strong>{' '}
                        {data.citacao.paragrafo}
                      </p>
                    )}
                  </div>

                  {/* Texto do Artigo Completo (Expansível ou Visível) */}
                  <div className="pt-1 border-t border-black/5">
                    <button
                      type="button"
                      onClick={() => toggleDetalhe(key)}
                      className="flex items-center justify-between w-full text-[10px] font-semibold text-[#1B5E20] hover:underline"
                    >
                      <span>
                        {isOpen ? 'Ocultar teor do texto legal' : 'Ver teor literal do artigo'}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="mt-1.5 p-2 bg-white rounded border border-black/10 text-[10px] text-[#2C3B2C] italic leading-relaxed animate-in fade-in">
                        "{data.citacao.textoArtigo}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Resumo em Linguagem Clara */}
                <div className="p-2 bg-white/90 rounded-lg border border-black/5 space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-[#5A6D5A] uppercase tracking-wider">
                    <Info className="w-3 h-3 text-[#1B5E20]" />
                    <span>Resumo Prático</span>
                  </div>
                  <p className="text-[11px] text-[#1C2B1C] leading-snug">{data.resumoClaro}</p>
                </div>

                {/* Observação Operacional (se houver) */}
                {data.observacaoOperacional && (
                  <p className="text-[10px] text-[#5A6D5A] italic px-1">
                    * {data.observacaoOperacional}
                  </p>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Alerta de Síntese da Transição Fiscal */}
      <div className="p-3 bg-white border border-[#DCE5DC] rounded-xl flex items-start gap-2.5 shadow-2xs">
        <ShieldCheck className="w-4 h-4 text-[#1B5E20] flex-shrink-0 mt-0.5" />
        <div className="text-xs text-[#2C3E2C] space-y-1">
          <p className="font-bold text-[#1C2B1C]">
            Síntese do Enquadramento Canônico — Base Mestre Validação de Cadastro
          </p>
          <p className="text-[11px] text-[#4A5D4A] leading-relaxed">{enquadramento.resumoGeral}</p>
        </div>
      </div>
    </div>
  )
}
