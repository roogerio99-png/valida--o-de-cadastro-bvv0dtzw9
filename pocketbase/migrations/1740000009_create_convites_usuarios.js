migrate(
  (app) => {
    // Verificar se a coleção convites_usuarios já existe
    try {
      app.findCollectionByNameOrId('convites_usuarios')
      return // Já existe
    } catch (_) {}

    const collection = new Collection({
      name: 'convites_usuarios',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'email', type: 'text', required: true },
        { name: 'nome', type: 'text', required: false },
        { name: 'role', type: 'select', values: ['admin', 'analista'], maxSelect: 1, required: true },
        { name: 'status', type: 'select', values: ['pendente', 'aceito', 'cancelado'], maxSelect: 1, required: true },
        { name: 'token_convite', type: 'text', required: true },
        { name: 'link_definicao_senha', type: 'text', required: false },
        { name: 'convidado_por', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_convites_email ON convites_usuarios (email)',
        'CREATE INDEX idx_convites_token ON convites_usuarios (token_convite)',
        'CREATE INDEX idx_convites_status ON convites_usuarios (status)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('convites_usuarios')
      app.delete(col)
    } catch (_) {}
  },
)
