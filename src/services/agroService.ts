import pb from '@/lib/pocketbase/client'
import type {
  RegraNcmEmbalagem,
  DicionarioPrincipioAtivo,
  BaseMestreProduto,
  ParametrizacaoFiscal,
  LogValidacao,
  RelatorioValidacao,
  ProdutoInput,
  RespostaSincronizacao,
  HistoricoSincronizacaoRecord,
} from '@/types/agro'

// -----------------------------------------------------------------------------
// Sincronização de Produtos Oficiais (MAPA / AGROFIT / SIPEAGRO)
// -----------------------------------------------------------------------------
export async function executarSincronizacaoProdutos(params?: {
  fontes?: string[]
  auto_inclusao?: boolean
  limite_por_fonte?: number
}): Promise<RespostaSincronizacao> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''

  const response = await fetch(`${baseUrl}/backend/v1/sincronizar-produtos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(params || {}),
  })

  if (!response.ok) {
    let msg = `Erro no servidor (HTTP ${response.status})`
    try {
      const clone = response.clone()
      const data = await clone.json()
      if (data?.error || data?.message) {
        msg = data.error || data.message
      }
    } catch (_) {
      try {
        const text = await response.text()
        if (text) {
          try {
            const parsed = JSON.parse(text)
            msg = parsed?.error || parsed?.message || text.slice(0, 300)
          } catch {
            msg = text.slice(0, 300)
          }
        }
      } catch {
        /* intentionally ignored */
      }
    }
    throw new Error(msg)
  }

  return (await response.json()) as RespostaSincronizacao
}

export async function listarHistoricoSincronizacao(params?: {
  page?: number
  perPage?: number
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 20
  const sort = params?.sort || '-created'
  return pb
    .collection('sincronizacao_historico')
    .getList<HistoricoSincronizacaoRecord>(page, perPage, {
      sort,
    })
}

export async function obterHistoricoSincronizacaoPorId(id: string) {
  return pb.collection('sincronizacao_historico').getOne<HistoricoSincronizacaoRecord>(id)
}

// -----------------------------------------------------------------------------
// Validação no Servidor (Hook Customizado)
// -----------------------------------------------------------------------------
export async function validarProdutoServidor(dados: ProdutoInput): Promise<RelatorioValidacao> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''

  const response = await fetch(`${baseUrl}/backend/v1/validar-produto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(dados),
  })

  if (!response.ok) {
    let msg = `Erro na validação (HTTP ${response.status})`
    try {
      const data = await response.json()
      if (data?.error || data?.message) msg = data.error || data.message
    } catch {
      /* intentionally ignored */
    }
    throw new Error(msg)
  }

  return (await response.json()) as RelatorioValidacao
}

// -----------------------------------------------------------------------------
// Base Mestre
// -----------------------------------------------------------------------------
export async function listarBaseMestre(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 30
  const sort = params?.sort || '-created'
  return pb.collection('base_mestre').getList<BaseMestreProduto>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

export async function criarProdutoBaseMestre(data: Partial<BaseMestreProduto>) {
  const payload: Record<string, unknown> = { ...data }
  if (data.marca_padronizada && !payload.nome_produto) {
    payload.nome_produto = data.marca_padronizada
  }
  if (data.ncm_padrao && !payload.ncm) {
    payload.ncm = data.ncm_padrao.replace(/\D/g, '')
  }
  if (data.titular_fabricante && !payload.fabricante) {
    payload.fabricante = data.titular_fabricante
  }
  return pb.collection('base_mestre').create<BaseMestreProduto>(payload)
}

export async function atualizarProdutoBaseMestre(id: string, data: Partial<BaseMestreProduto>) {
  const payload: Record<string, unknown> = { ...data }
  if (data.marca_padronizada && !payload.nome_produto) {
    payload.nome_produto = data.marca_padronizada
  }
  if (data.ncm_padrao && !payload.ncm) {
    payload.ncm = data.ncm_padrao.replace(/\D/g, '')
  }
  if (data.titular_fabricante && !payload.fabricante) {
    payload.fabricante = data.titular_fabricante
  }
  return pb.collection('base_mestre').update<BaseMestreProduto>(id, payload)
}

export async function excluirProdutoBaseMestre(id: string) {
  return pb.collection('base_mestre').delete(id)
}

// -----------------------------------------------------------------------------
// Relatório de Duplicidades no Servidor
// -----------------------------------------------------------------------------
export async function obterRelatorioDuplicidades() {
  return pb.send<{
    total_grupos: number
    total_produtos_duplicados: number
    grupos: import('@/types/agro').GrupoDuplicidade[]
  }>('/backend/v1/relatorio-duplicidades', {
    method: 'GET',
  })
}

// -----------------------------------------------------------------------------
// Regras NCM × Embalagem
// -----------------------------------------------------------------------------
export async function listarRegrasNcm(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || 'ncm'
  return pb.collection('regras_ncm_embalagem').getList<RegraNcmEmbalagem>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

export async function criarRegraNcm(data: Partial<RegraNcmEmbalagem>) {
  return pb.collection('regras_ncm_embalagem').create<RegraNcmEmbalagem>(data)
}

export async function atualizarRegraNcm(id: string, data: Partial<RegraNcmEmbalagem>) {
  return pb.collection('regras_ncm_embalagem').update<RegraNcmEmbalagem>(id, data)
}

export async function excluirRegraNcm(id: string) {
  return pb.collection('regras_ncm_embalagem').delete(id)
}

// -----------------------------------------------------------------------------
// Dicionário de Princípios Ativos
// -----------------------------------------------------------------------------
export async function listarPrincipiosAtivos(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || 'principio_ativo_chave'
  return pb
    .collection('dicionario_principios_ativos')
    .getList<DicionarioPrincipioAtivo>(page, perPage, {
      filter: params?.filter,
      sort,
    })
}

export async function criarPrincipioAtivo(data: Partial<DicionarioPrincipioAtivo>) {
  const chave = (data.principio_ativo_chave || data.principio_ativo || '').trim().toUpperCase()
  const payload = {
    ...data,
    principio_ativo_chave: chave,
    principio_ativo: chave,
  }
  return pb.collection('dicionario_principios_ativos').create<DicionarioPrincipioAtivo>(payload)
}

export async function atualizarPrincipioAtivo(id: string, data: Partial<DicionarioPrincipioAtivo>) {
  const payload = { ...data }
  if (payload.principio_ativo_chave || payload.principio_ativo) {
    const chave = (payload.principio_ativo_chave || payload.principio_ativo || '')
      .trim()
      .toUpperCase()
    payload.principio_ativo_chave = chave
    payload.principio_ativo = chave
  }
  return pb.collection('dicionario_principios_ativos').update<DicionarioPrincipioAtivo>(id, payload)
}

export async function excluirPrincipioAtivo(id: string) {
  return pb.collection('dicionario_principios_ativos').delete(id)
}

/**
 * Conta em tempo real quantos produtos da base_mestre estão vinculados a este princípio ativo
 */
export async function contarProdutosVinculadosAoPrincipioAtivo(paId: string): Promise<number> {
  try {
    const res = await pb.collection('base_mestre').getList(1, 1, {
      filter: `principio_ativo_id = "${paId}"`,
      fields: 'id',
    })
    return res.totalItems
  } catch (_) {
    return 0
  }
}

/**
 * Propaga as regras canônicas de um princípio ativo para todos os produtos vinculados em cascata
 */
export async function sincronizarPrincipioAtivoEmCascata(id: string): Promise<{
  sucesso: boolean
  mensagem: string
  total_vinculados: number
  atualizados: number
}> {
  return await pb.send<{
    sucesso: boolean
    mensagem: string
    total_vinculados: number
    atualizados: number
  }>(`/backend/v1/sincronizar-pa-cascata/${encodeURIComponent(id)}`, {
    method: 'POST',
  })
}

/**
 * Pipeline Dual-Sync Atômico (Seção 5 da especificação técnica 2.5.0)
 */
export async function importarNovoCadastroDualSync(dados: {
  nome_comercial_portal: string
  principio_ativo_declarado: string
  numero_registro_mapa: string
  classe_agronomica?: string
  titular_registro?: string
  embalagem_comercial?: string
  unidade_medida?: string
  origem_portal?: string
  url_publicacao_dou?: string
  simular_falha_ncm?: boolean
}) {
  return await pb.send<{
    sucesso: boolean
    mensagem: string
    principio_ativo_id: string
    principio_ativo_chave: string
    principio_ativo_novo_criado: boolean
    produto_mestre_id: string
    produto_mestre_nome: string
    registro_mapa: string
    ncm_padrao: string
    cst_saida: string
  }>('/backend/v1/importar-novo-cadastro', {
    method: 'POST',
    body: dados,
  })
}

// -----------------------------------------------------------------------------
// Parametrização Fiscal
// -----------------------------------------------------------------------------
export async function listarParametrizacaoFiscal(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || 'ncm'
  return pb.collection('parametrizacao_fiscal').getList<ParametrizacaoFiscal>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

export async function salvarParametrizacaoFiscal(data: Partial<ParametrizacaoFiscal>) {
  if (data.id) {
    return pb.collection('parametrizacao_fiscal').update<ParametrizacaoFiscal>(data.id, data)
  }
  // Verificar se NCM já existe
  const ncm = String(data.ncm || '').trim()
  const existentes = await pb
    .collection('parametrizacao_fiscal')
    .getList<ParametrizacaoFiscal>(1, 1, {
      filter: `ncm = '${ncm}'`,
    })
  if (existentes.items.length > 0) {
    return pb
      .collection('parametrizacao_fiscal')
      .update<ParametrizacaoFiscal>(existentes.items[0].id, data)
  }
  return pb.collection('parametrizacao_fiscal').create<ParametrizacaoFiscal>(data)
}

// -----------------------------------------------------------------------------
// Log de Validações (Auditoria)
// -----------------------------------------------------------------------------
export async function listarLogValidacoes(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || '-created'
  return pb.collection('log_validacoes').getList<LogValidacao>(page, perPage, {
    filter: params?.filter,
    sort,
  })
}

// -----------------------------------------------------------------------------
// Bulk Insert no Cliente para Importações (Chunked com delay para estabilidade)
// -----------------------------------------------------------------------------
export interface ItemErroImportacao {
  linhaOriginal: number
  linhaLote: number
  motivo: string
  categoria: string
  campo?: string
  valor?: string
  dados: Record<string, unknown>
}

export interface ResultadoImportacaoLote {
  inseridos: number
  ignorados: number
  erros: ItemErroImportacao[]
  resumoCategorias: Record<string, number>
}

// -----------------------------------------------------------------------------
// Limpeza Segura de Bases (base_mestre / dicionario_principios_ativos)
// -----------------------------------------------------------------------------
export interface RespostaLimpezaBases {
  sucesso: boolean
  mensagem: string
  executado_por?: string
  alvo: string
  apagados: {
    base_mestre: number
    dicionario_principios_ativos: number
    total: number
  }
  preservados: string[]
  timestamp: string
}

export async function limparBases(params: {
  alvo: 'todas' | 'base_mestre' | 'dicionario_principios_ativos'
  confirmar: string
}): Promise<RespostaLimpezaBases> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''

  const response = await fetch(`${baseUrl}/backend/v1/limpar-bases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    let msg = `Erro na operação de limpeza (HTTP ${response.status})`
    try {
      const data = await response.json()
      if (data?.error || data?.message) msg = data.error || data.message
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }

  return (await response.json()) as RespostaLimpezaBases
}

/**
 * Importação em lote resiliente com controle de concorrência,
 * auto-retry exponencial contra rate-limit 429 e relatório detalhado com auditoria de erros.
 */
export async function importarEmLote<T extends Record<string, unknown>>(
  collectionName: string,
  records: { data: T; originalLine?: number }[],
  onProgress?: (processados: number, total: number) => void,
): Promise<ResultadoImportacaoLote> {
  let inseridos = 0
  let ignorados = 0
  const erros: ItemErroImportacao[] = []
  const resumoCategorias: Record<string, number> = {}
  const total = records.length

  const registrarErro = (erro: ItemErroImportacao) => {
    erros.push(erro)
    resumoCategorias[erro.categoria] = (resumoCategorias[erro.categoria] || 0) + 1
  }

  for (let i = 0; i < total; i++) {
    const { data: item, originalLine } = records[i]
    const rowNum = originalLine ?? i + 1

    let sucesso = false
    let tentativas = 0
    const maxTentativas = 4

    while (!sucesso && tentativas < maxTentativas) {
      try {
        await pb.collection(collectionName).create(item)
        inseridos++
        sucesso = true
      } catch (err: unknown) {
        tentativas++
        const msg = err instanceof Error ? err.message : String(err)
        const is429 = msg.includes('429') || msg.toLowerCase().includes('too many requests')
        const isUnique =
          msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('already exists')

        if (is429 && tentativas < maxTentativas) {
          // Backoff exponencial para lidar suavemente com o rate limit do PocketBase
          const delay = tentativas * 400 + Math.random() * 200
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }

        if (isUnique) {
          ignorados++
          sucesso = true
        } else {
          // Categorizar erro para relatório inteligível
          let categoria = 'Erro no Banco de Dados'
          let motivo = msg

          if (msg.includes('nome_produto') || msg.includes('Cannot be blank')) {
            categoria = 'Campo Obrigatório Ausente'
            motivo = 'Nome do produto ou identificador obrigatório ausente.'
          } else if (msg.includes('ncm')) {
            categoria = 'NCM Inválido'
            motivo = 'Formato ou valor de NCM rejeitado pelo banco.'
          } else if (is429) {
            categoria = 'Limite de Requisições (429)'
            motivo = 'Muitas requisições simultâneas ao servidor.'
          }

          registrarErro({
            linhaOriginal: rowNum,
            linhaLote: i + 1,
            motivo,
            categoria,
            dados: item,
          })
          break
        }
      }
    }

    // Pequeno throttle de 30ms a cada 10 registros para garantir estabilidade da conexão
    if (i % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 30))
    }

    if (onProgress && (i % 5 === 0 || i === total - 1)) {
      onProgress(i + 1, total)
    }
  }

  return { inseridos, ignorados, erros, resumoCategorias }
}
