import pb from '@/lib/pocketbase/client'

export interface UsuarioItem {
  id: string
  name: string
  email: string
  role: 'admin' | 'analista'
  verified: boolean
  created: string
  updated: string
}

export interface ConviteItem {
  id: string
  email: string
  nome?: string
  role: 'admin' | 'analista'
  status: 'pendente' | 'aceito' | 'cancelado'
  token_convite: string
  link_definicao_senha?: string
  convidado_por?: string
  created: string
}

export interface ListarUsuariosResponse {
  sucesso: boolean
  usuarios: UsuarioItem[]
  convites: ConviteItem[]
  error?: string
}

export interface ConvidarUsuarioInput {
  email: string
  nome?: string
  role?: 'admin' | 'analista'
}

export interface ConvidarUsuarioResponse {
  sucesso: boolean
  mensagem: string
  email_enviado: boolean
  aviso_email?: string
  usuario_id?: string
  email?: string
  role?: 'admin' | 'analista'
  link_primeiro_acesso?: string
  senha_temporaria?: string
  error?: string
}

export async function listarUsuarios(): Promise<ListarUsuariosResponse> {
  return pb.send<ListarUsuariosResponse>('/backend/v1/usuarios', {
    method: 'GET',
  })
}

export async function convidarUsuario(dados: ConvidarUsuarioInput): Promise<ConvidarUsuarioResponse> {
  return pb.send<ConvidarUsuarioResponse>('/backend/v1/usuarios/convidar', {
    method: 'POST',
    body: dados,
  })
}

export async function alterarPapelUsuario(id: string, role: 'admin' | 'analista'): Promise<{ sucesso: boolean; mensagem: string; error?: string }> {
  return pb.send<{ sucesso: boolean; mensagem: string; error?: string }>('/backend/v1/usuarios/alterar-papel', {
    method: 'POST',
    body: { id, role },
  })
}

export async function excluirUsuario(id: string): Promise<{ sucesso: boolean; mensagem: string; error?: string }> {
  return pb.send<{ sucesso: boolean; mensagem: string; error?: string }>('/backend/v1/usuarios/excluir', {
    method: 'POST',
    body: { id },
  })
}

export async function cancelarConvite(conviteId: string): Promise<{ sucesso: boolean; mensagem: string; error?: string }> {
  return pb.send<{ sucesso: boolean; mensagem: string; error?: string }>('/backend/v1/usuarios/excluir', {
    method: 'POST',
    body: { convite_id: conviteId },
  })
}
