migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Adicionar o campo role com valores ['admin', 'analista'] se ainda não existir
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          maxSelect: 1,
          values: ['admin', 'analista'],
        }),
      )
    }

    // 2. Proteger as regras de acesso da coleção users:
    // - createRule: null (DESABILITA auto-cadastro público; somente endpoints do admin criam via $app)
    // - listRule: apenas autenticados
    // - viewRule: apenas autenticados
    // - updateRule: autenticado pode atualizar seu próprio perfil, mas NÃO pode alterar seu próprio role:
    //   id = @request.auth.id && @request.body.role:changed = false
    // - deleteRule: apenas admin (mas operações de exclusão de usuário serão feitas pelo endpoint do admin)
    users.createRule = null
    users.listRule = "@request.auth.id != ''"
    users.viewRule = "@request.auth.id != ''"
    users.updateRule = "@request.auth.id != '' && id = @request.auth.id && @request.body.role:changed = false"
    users.deleteRule = null

    app.save(users)

    // 3. Garantir idempotentemente que o usuário semeado roogerio99@gmail.com exista e seja 'admin'
    try {
      const adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'roogerio99@gmail.com')
      adminUser.set('role', 'admin')
      app.save(adminUser)
    } catch (_) {
      // Se não existir por algum motivo, criar com role admin
      const record = new Record(users)
      record.setEmail('roogerio99@gmail.com')
      record.setPassword('Skip@Pass')
      record.setVerified(true)
      record.set('name', 'Rogério (Admin)')
      record.set('role', 'admin')
      app.save(record)
    }

    // 4. Backfill em quaisquer outros usuários existentes sem role: definir como 'analista'
    try {
      app.db().newQuery("UPDATE users SET role = 'analista' WHERE (role IS NULL OR role = '') AND email != 'roogerio99@gmail.com'").execute()
    } catch (_) {}
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const roleField = users.fields.getByName('role')
    if (roleField) {
      users.fields.removeByName('role')
      app.save(users)
    }
  },
)
