import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) return {}
  const data = error.response?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(data)) {
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      errors[field] = (detail as { message: string }).message
    }
  }
  return errors
}

export function getErrorMessage(
  error: unknown,
  fallbackMensagem: string = 'Ocorreu um erro inesperado.',
): string {
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  if (error && typeof error === 'object') {
    const errObj = error as Record<string, any>

    // 1. Resposta JSON direta da nossa rota customizada: err.response?.data?.error ou err.data?.error
    const respData = errObj.response?.data ?? errObj.data
    if (respData) {
      if (typeof respData === 'string' && respData.trim()) {
        return respData.trim()
      }
      if (typeof respData.error === 'string' && respData.error.trim()) {
        return respData.error.trim()
      }
      if (typeof respData.message === 'string' && respData.message.trim()) {
        return respData.message.trim()
      }
    }

    // 2. Erros de validação de campos PocketBase em data: { field: { message: "..." } }
    if (error instanceof ClientResponseError || errObj.response?.data) {
      const fieldErrors = extractFieldErrors(error)
      const msgs = Object.entries(fieldErrors).map(([field, msg]) => `${field}: ${msg}`)
      if (msgs.length > 0) {
        return msgs.join(', ')
      }
    }

    // 3. Propriedade error direta (ex: retorno customizado { sucesso: false, error: "..." })
    if (typeof errObj.error === 'string' && errObj.error.trim()) {
      return errObj.error.trim()
    }

    // 4. Mensagem do erro, ignorando "Something went wrong." genérico do PocketBase se houver alternativa
    const msg = typeof errObj.message === 'string' ? errObj.message.trim() : ''
    if (msg && !/^Something went wrong/i.test(msg)) {
      return msg
    }
  }

  return fallbackMensagem
}
