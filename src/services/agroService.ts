import pb from '@/lib/pocketbase/client'
import type {
  RegraNcmEmbalagem,
  DicionarioPrincipioAtivo,
  BaseMestreProduto,
  ParametrizacaoFiscal,
  LogValidacao,
  RelatorioValidacao,
  ProdutoInput,
} from '@/types/agro'

// -----------------------------------------------------------------------------
// Validação no Servidor (Hook Customizado)
// -----------------------------------------------------------------------------
export async function validarProdutoServidor(dados: ProdutoInput): Promise<RelatorioValidacao> {
  const response = await pb.send<RelatorioValidacao>('/backend/v1/validar-produto', {
    method: 'POST',
    body: dados,
  })
  return response
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
  return pb.collection('base_mestre').create<BaseMestreProduto>(data)
}

export async function atualizarProdutoBaseMestre(id: string, data: Partial<BaseMestreProduto>) {
  return pb.collection('base_mestre').update<BaseMestreProduto>(id, data)
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
  const sort = params?.sort || 'principio_ativo'
  return pb
    .collection('dicionario_principios_ativos')
    .getList<DicionarioPrincipioAtivo>(page, perPage, {
      filter: params?.filter,
      sort,
    })
}

export async function criarPrincipioAtivo(data: Partial<DicionarioPrincipioAtivo>) {
  return pb.collection('dicionario_principios_ativos').create<DicionarioPrincipioAtivo>(data)
}

export async function atualizarPrincipioAtivo(id: string, data: Partial<DicionarioPrincipioAtivo>) {
  return pb.collection('dicionario_principios_ativos').update<DicionarioPrincipioAtivo>(id, data)
}

export async function excluirPrincipioAtivo(id: string) {
  return pb.collection('dicionario_principios_ativos').delete(id)
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
