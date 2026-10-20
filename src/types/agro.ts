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

export interface FonteConsultada {
  fonte: string
  tipo: 'mapa' | 'bula' | 'ncm' | 'outros'
  status: 'sucesso' | 'nao_encontrado' | 'divergencia' | 'indisponivel'
  url?: string
  detalhes: string
}

export interface BaseMestreInclusaoResultado {
  incluido: boolean
  motivo: string
  id_registro?: string | null
}

export interface ProdutoValidadoConsolidado {
  nome_produto: string
  ncm: string
  ncm_descricao_oficial?: string
  embalagem: string
  quantidade_embalagem?: string
  principio_ativo: string
  fabricante: string
  registro_mapa: string
  concentracao: number
  unidade_concentracao?: string
  classe_uso?: string
  formulacao?: string
  culturas?: string[]
  bula_resumo?: string
}

export interface RelatorioValidacao {
  status: 'APROVADO' | 'REPROVADO'
  score: number
  total_travas: number
  total_aprovadas: number
  travas: TravaResultado[]
  parametrizacao_fiscal: Partial<ParametrizacaoFiscal> | null
  fontes_consultadas?: FonteConsultada[]
  avisos_divergencia?: string[]
  base_mestre_inclusao?: BaseMestreInclusaoResultado
  produto_validado: ProdutoValidadoConsolidado
}

export interface ProdutoInput {
  nome_produto: string
  ncm: string
  embalagem: string
  quantidade_embalagem?: string
  unidade_embalagem?: string
  principio_ativo: string
  fabricante: string
  registro_mapa: string
  concentracao: number
  unidade_concentracao?: string
  auto_cadastrar?: boolean
}

export interface GrupoDuplicidade {
  id: string
  criterio: string
  criterio_tipo: 'ncm_pa' | 'registro_mapa' | 'nome_ncm'
  chave: string
  total_ocorrencias: number
  registros: BaseMestreProduto[]
}

export interface RelatorioDuplicidades {
  total_grupos: number
  total_produtos_duplicados: number
  grupos: GrupoDuplicidade[]
}
