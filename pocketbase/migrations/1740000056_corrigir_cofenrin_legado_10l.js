migrate(
  (app) => {
    // Migration 1740000056: Correção de registro legado COFENRIN 2X10L (10 L)
    // 10 L é > 7,5 kg, portanto a NCM correta deve ser 3808.69.90 (38086990) e sub_grupo Inseticida / Acaricida
    console.log('Iniciando migration 1740000056: Alinhamento de COFENRIN 10 L para 3808.69.90...')

    if (app.hasTable('base_mestre')) {
      try {
        const registros =
          app.findRecordsByFilter(
            'base_mestre',
            "(marca_padronizada = 'COFENRIN' || nome_completo ~ 'COFENRIN') && quantidade_embalagem_principal = 10",
            '-created',
            10,
            0,
          ) || []

        for (let i = 0; i < registros.length; i++) {
          const r = registros[i]
          r.set('ncm', '38086990')
          r.set('ncm_especifica', '3808.69.90')
          r.set('ncm_padrao', '3808.69.90')
          r.set('sub_grupo', 'Inseticida / Acaricida')
          r.set('titular_fabricante', 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.')
          r.set('fabricante', 'RAINBOW DEFENSIVOS AGRÍCOLAS LTDA.')
          r.set(
            'regra_tipi',
            'Nota de Subposições 2 Cap. 38 TIPI (SC COSIT 98.042/2022): Até 7,5 kg -> 3808.62.90; Acima de 7,5 kg -> 3808.69.90',
          )
          app.save(r)
          console.log(
            `Registro ${r.id} (${r.getString('nome_completo')}) corrigido para NCM 3808.69.90`,
          )
        }
      } catch (err) {
        console.log('Aviso ao corrigir COFENRIN 10 L:', err.message || err)
      }
    }
  },
  (app) => {
    console.log('Reversão da migration 1740000056 (no-op)')
  },
)
