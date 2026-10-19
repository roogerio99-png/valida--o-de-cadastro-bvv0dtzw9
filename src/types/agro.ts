import type { RecordModel } from 'pocketbase'

export interface RegraNcmEmbalagem extends RecordModel {
  ncm: string
  descricao: string
  embalagens_permitidas: string[]
  regra_especial?: string
  created: string
  updated: string
}

export interface DicionarioPrincipioAtivo extends RecordModel {
  principio_ativo: string
  classe: string
  grupo_quimico: string
  concentracao_min: number
  concentracao_max: number
  unidade: string
  status: string
  created: string
  updated: string
}

export type StatusValidacao = 'aprovado' | 'reprovado' | 'pendente'

export interface BaseMestreProduto extends RecordModel {
  nome_produto: string
  ncm: string
  embalagem: string
  principio_ativo: string
  fabricante: string
  registro_mapa: string
  concentracao: number
  unidade_concentracao?: string
  status_validacao: StatusValidacao
  data_inclusao: string
  created: string
  updated: string
}

export interface ParametrizacaoFiscal extends RecordModel {
  ncm: string
  aliquota_pis: number
  aliquota_cofins: number
  regime: 'cumulativo' | 'nao_cumulativo'
  aliquota_ibs: number
  aliquota_cbs: number
  classificacao: string
  tributacao: string
  created: string
  updated: string
}

export interface LogValidacao extends RecordModel {
  nome_produto: string
  ncm: string
  embalagem: string
  principio_ativo: string
  id_trava: number
  trava_nome: string
  aprovado: boolean
  mensagem: string
  data_validacao: string
  created: string
  updated: string
}

export interface TravaResultado {
  id_trava: number
  trava_nome: string
  aprovado: boolean
  mensagem: string
}

export interface RelatorioValidacao {
  status: 'APROVADO' | 'REPROVADO'
  score: number
  total_travas: number
  total_aprovadas: number
  travas: TravaResultado[]
  parametrizacao_fiscal: Partial<ParametrizacaoFiscal> | null
  produto_validado: {
    nome_produto: string
    ncm: string
    embalagem: string
    principio_ativo: string
    fabricante: string
    registro_mapa: string
    concentracao: number
  }
}

export interface ProdutoInput {
  nome_produto: string
  ncm: string
  embalagem: string
  principio_ativo: string
  fabricante: string
  registro_mapa: string
  concentracao: number
  unidade_concentracao?: string
}
