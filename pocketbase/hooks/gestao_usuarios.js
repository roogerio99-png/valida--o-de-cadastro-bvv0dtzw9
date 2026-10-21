/**
 * pocketbase/hooks/gestao_usuarios.js
 * Endpoints protegidos para Gestão de Usuários e Convites:
 * Apenas usuários com role == 'admin' podem executar ações administrativas.
 *
 * NOTA: Cada callback do PocketBase roda em VM isolada — todas as funções auxiliares
 * devem ser declaradas DENTRO do callback do handler.
 *
 * Endpoints:
 * - GET  /backend/v1/usuarios: Lista todos os usuários e convites
 * - POST /backend/v1/usuarios/convidar: Cria usuário com status inicial e gera convite
 * - POST /backend/v1/usuarios/alterar-papel: Altera role de um usuário (admin <-> analista)
 * - POST /backend/v1/usuarios/excluir: Remove usuário ou cancela convite
 */

// 1. GET /backend/v1/usuarios - Listar usuários e convites pendentes
routerAdd('GET', '/backend/v1/usuarios', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, {
      sucesso: false,
      error: 'Acesso não autorizado. É necessário estar autenticado.',
    })
  }
  const role = authRecord.getString('role') || 'analista'
  if (role !== 'admin') {
    return e.json(403, {
      sucesso: false,
      error: 'Apenas administradores podem realizar esta ação.',
    })
  }

  try {
    const userRecords = $app.findRecordsByFilter('users', 'id != ""', '-created', 500, 0) || []
    const usersList = userRecords.map((u) => ({
      id: u.id,
      name: u.getString('name') || '',
      email: u.getString('email') || '',
      role: u.getString('role') || 'analista',
      verified: u.getBool('verified'),
      created: u.getString('created'),
      updated: u.getString('updated'),
    }))

    // Buscar convites pendentes
    let convitesList = []
    try {
      const convRecords =
        $app.findRecordsByFilter('convites_usuarios', 'status = "pendente"', '-created', 200, 0) ||
        []
      convitesList = convRecords.map((c) => ({
        id: c.id,
        email: c.getString('email'),
        nome: c.getString('nome'),
        role: c.getString('role') || 'analista',
        status: c.getString('status'),
        token_convite: c.getString('token_convite'),
        link_definicao_senha: c.getString('link_definicao_senha'),
        convidado_por: c.getString('convidado_por'),
        created: c.getString('created'),
      }))
    } catch (_) {}

    return e.json(200, {
      sucesso: true,
      usuarios: usersList,
      convites: convitesList,
    })
  } catch (err) {
    return e.json(500, {
      sucesso: false,
      error: `Erro ao listar usuários: ${err.message || String(err)}`,
    })
  }
})

// 2. POST /backend/v1/usuarios/convidar - Convidar novo usuário
routerAdd('POST', '/backend/v1/usuarios/convidar', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, {
      sucesso: false,
      error: 'Acesso não autorizado. É necessário estar autenticado.',
    })
  }
  const role = authRecord.getString('role') || 'analista'
  if (role !== 'admin') {
    return e.json(403, {
      sucesso: false,
      error: 'Apenas administradores podem realizar esta ação.',
    })
  }

  try {
    const info = e.requestInfo()
    const body = info.body || {}
    const email = String(body.email || '')
      .trim()
      .toLowerCase()
    const nome = String(body.nome || '').trim()
    const roleDesejado = String(body.role || 'analista').trim() === 'admin' ? 'admin' : 'analista'

    if (!email || !email.includes('@')) {
      return e.json(400, { sucesso: false, error: 'E-mail válido é obrigatório.' })
    }

    // 1. Verificar se usuário já existe em users
    let usuarioExistente = null
    try {
      usuarioExistente = $app.findAuthRecordByEmail('_pb_users_auth_', email)
    } catch (_) {}

    if (usuarioExistente) {
      return e.json(400, {
        sucesso: false,
        error: `O usuário com o e-mail "${email}" já possui cadastro no sistema (Papel: ${usuarioExistente.getString('role') || 'analista'}).`,
      })
    }

    // 2. Gerar senha temporária segura
    const tempPassword = 'P@ss' + $security.randomString(10)
    const tokenConvite = $security.randomString(24)

    // 3. Criar registro do usuário no banco
    const colUsers = $app.findCollectionByNameOrId('_pb_users_auth_')
    const novoUsuario = new Record(colUsers)
    novoUsuario.setEmail(email)
    novoUsuario.setPassword(tempPassword)
    novoUsuario.set('name', nome || email.split('@')[0])
    novoUsuario.set('role', roleDesejado)
    novoUsuario.setVerified(false)
    $app.save(novoUsuario)

    // 4. Disparar reset de senha oficial do PocketBase se disponível
    let emailDisparado = false
    let avisoEmail = ''
    try {
      $app.sendAuthResetPassword(novoUsuario)
      emailDisparado = true
    } catch (mailErr) {
      emailDisparado = false
      avisoEmail = `Envio de e-mail não configurado no servidor (${mailErr.message || 'SMTP indisponível'}). Utilize o link ou credenciais abaixo para repassar ao usuário.`
    }

    const linkDefinicaoSenha = `/redefinir-senha?email=${encodeURIComponent(email)}&token=${encodeURIComponent(tokenConvite)}`

    // 5. Registrar convite na collection convites_usuarios
    try {
      const colConvites = $app.findCollectionByNameOrId('convites_usuarios')
      const recConvite = new Record(colConvites)
      recConvite.set('email', email)
      recConvite.set('nome', nome || email.split('@')[0])
      recConvite.set('role', roleDesejado)
      recConvite.set('status', 'pendente')
      recConvite.set('token_convite', tokenConvite)
      recConvite.set('link_definicao_senha', linkDefinicaoSenha)
      recConvite.set('convidado_por', authRecord.getString('email') || authRecord.id)
      $app.save(recConvite)
    } catch (_) {}

    return e.json(201, {
      sucesso: true,
      mensagem: emailDisparado
        ? `Convite enviado por e-mail com sucesso para ${email}.`
        : `Usuário cadastrado. Como o envio automático de e-mail não está ativo, repasse o link de primeiro acesso ou as credenciais ao usuário.`,
      email_enviado: emailDisparado,
      aviso_email: avisoEmail,
      usuario_id: novoUsuario.id,
      email: email,
      role: roleDesejado,
      link_primeiro_acesso: linkDefinicaoSenha,
      senha_temporaria: tempPassword,
    })
  } catch (err) {
    return e.json(500, {
      sucesso: false,
      error: `Erro ao convidar usuário: ${err.message || String(err)}`,
    })
  }
})

// 3. POST /backend/v1/usuarios/alterar-papel - Alterar papel de usuário existente
routerAdd('POST', '/backend/v1/usuarios/alterar-papel', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, {
      sucesso: false,
      error: 'Acesso não autorizado. É necessário estar autenticado.',
    })
  }
  const role = authRecord.getString('role') || 'analista'
  if (role !== 'admin') {
    return e.json(403, {
      sucesso: false,
      error: 'Apenas administradores podem realizar esta ação.',
    })
  }

  try {
    const info = e.requestInfo()
    const body = info.body || {}
    const userId = String(body.id || '').trim()
    const novoRole = String(body.role || '')
      .trim()
      .toLowerCase()

    if (!userId) {
      return e.json(400, { sucesso: false, error: 'ID do usuário é obrigatório.' })
    }

    if (novoRole !== 'admin' && novoRole !== 'analista') {
      return e.json(400, {
        sucesso: false,
        error: 'Papel inválido. Valores aceitos: "admin" ou "analista".',
      })
    }

    const usuario = $app.findRecordById('users', userId)
    const emailUsuario = usuario.getString('email')

    if (emailUsuario === 'roogerio99@gmail.com' && novoRole !== 'admin') {
      return e.json(400, {
        sucesso: false,
        error:
          'O usuário administrador principal (roogerio99@gmail.com) não pode ter seu papel alterado.',
      })
    }

    if (usuario.id === authRecord.id && novoRole !== 'admin') {
      return e.json(400, {
        sucesso: false,
        error: 'Você não pode rebaixar seu próprio papel de administrador.',
      })
    }

    usuario.set('role', novoRole)
    $app.save(usuario)

    return e.json(200, {
      sucesso: true,
      mensagem: `Papel do usuário ${emailUsuario} alterado para "${novoRole === 'admin' ? 'Administrador' : 'Analista'}".`,
      id: usuario.id,
      email: emailUsuario,
      role: novoRole,
    })
  } catch (err) {
    return e.json(500, {
      sucesso: false,
      error: `Erro ao alterar papel: ${err.message || String(err)}`,
    })
  }
})

// 4. POST /backend/v1/usuarios/excluir - Excluir usuário ou cancelar convite
routerAdd('POST', '/backend/v1/usuarios/excluir', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, {
      sucesso: false,
      error: 'Acesso não autorizado. É necessário estar autenticado.',
    })
  }
  const role = authRecord.getString('role') || 'analista'
  if (role !== 'admin') {
    return e.json(403, {
      sucesso: false,
      error: 'Apenas administradores podem realizar esta ação.',
    })
  }

  try {
    const info = e.requestInfo()
    const body = info.body || {}
    const userId = String(body.id || '').trim()
    const conviteId = String(body.convite_id || '').trim()

    // Caso A: Cancelar convite pendente
    if (conviteId) {
      try {
        const convite = $app.findRecordById('convites_usuarios', conviteId)
        const emailConv = convite.getString('email')
        convite.set('status', 'cancelado')
        $app.save(convite)

        try {
          const userPendente = $app.findAuthRecordByEmail('_pb_users_auth_', emailConv)
          if (!userPendente.getBool('verified')) {
            $app.delete(userPendente)
          }
        } catch (_) {}

        return e.json(200, {
          sucesso: true,
          mensagem: `Convite para ${emailConv} cancelado com sucesso.`,
        })
      } catch (errConv) {
        return e.json(404, { sucesso: false, error: `Convite não encontrado: ${errConv.message}` })
      }
    }

    // Caso B: Excluir usuário existente
    if (!userId) {
      return e.json(400, { sucesso: false, error: 'ID do usuário ou do convite é obrigatório.' })
    }

    const usuario = $app.findRecordById('users', userId)
    const emailUsuario = usuario.getString('email')

    if (emailUsuario === 'roogerio99@gmail.com') {
      return e.json(400, {
        sucesso: false,
        error: 'O usuário administrador principal (roogerio99@gmail.com) não pode ser excluído.',
      })
    }

    if (usuario.id === authRecord.id) {
      return e.json(400, {
        sucesso: false,
        error: 'Você não pode excluir sua própria conta enquanto estiver logado.',
      })
    }

    $app.delete(usuario)

    try {
      const convites =
        $app.findRecordsByFilter(
          'convites_usuarios',
          `email = '${emailUsuario.replace(/'/g, "\\'")}'`,
          '-created',
          10,
          0,
        ) || []
      for (let i = 0; i < convites.length; i++) {
        $app.delete(convites[i])
      }
    } catch (_) {}

    return e.json(200, {
      sucesso: true,
      mensagem: `Usuário ${emailUsuario} excluído com sucesso do sistema.`,
    })
  } catch (err) {
    return e.json(500, {
      sucesso: false,
      error: `Erro ao excluir usuário: ${err.message || String(err)}`,
    })
  }
})
