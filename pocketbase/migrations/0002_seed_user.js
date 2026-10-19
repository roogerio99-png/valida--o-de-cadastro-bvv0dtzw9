migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Idempotente: não recria se já existir
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'roogerio99@gmail.com')
      return
    } catch (_) {}

    const record = new Record(users)
    record.setEmail('roogerio99@gmail.com')
    record.setPassword('Skip@Pass')
    record.setVerified(true)
    record.set('name', 'Rogério')
    app.save(record)
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail('_pb_users_auth_', 'roogerio99@gmail.com')
      app.delete(record)
    } catch (_) {}
  },
)
