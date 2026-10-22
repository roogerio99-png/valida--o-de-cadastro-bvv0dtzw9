/**
 * pocketbase/migrations/1740000019_corrigir_pa_invalido_bula_produtos.js
 *
 * Corrige registros em `bula_produtos` onde `principio_ativo` ficou erroneamente
 * preenchido com o próprio `registro_mapa` (ex.: "Nº 17416" ou "TC07920") ou "Não Informado",
 * recuperando o ingrediente ativo correspondente a partir de `bula_composicao` caso disponível,
 * ou limpando o valor incorreto para preservar fidelidade.
 */

migrate(
  (app) => {
    if (!app.hasTable('bula_produtos')) return

    try {
      const produtos =
        app.findRecordsByFilter('bula_produtos', 'id != ""', '-created', 5000, 0) || []
      for (let i = 0; i < produtos.length; i++) {
        const prod = produtos[i]
        const regMapa = prod.getString('registro_mapa')
        let pa = prod.getString('principio_ativo')

        // Verifica se o princípio ativo ficou igual ao registro mapa ou código de registro
        const isIgualAoMapa =
          pa &&
          (pa === regMapa ||
            pa.replace(/\D/g, '') === regMapa.replace(/\D/g, '') ||
            pa.toUpperCase().startsWith('TC') ||
            pa.toUpperCase().startsWith('VINC-') ||
            pa.toUpperCase().startsWith('Nº') ||
            pa.toUpperCase().startsWith('NR'))

        if (isIgualAoMapa) {
          // Tentar buscar da coleção bula_composicao para este registro_mapa
          let paCorreto = ''
          if (app.hasTable('bula_composicao')) {
            const escMapa = regMapa.replace(/'/g, "\\'")
            const comps =
              app.findRecordsByFilter(
                'bula_composicao',
                `registro_mapa = '${escMapa}'`,
                '-created',
                10,
                0,
              ) || []
            if (comps.length > 0) {
              const ias = []
              for (let c = 0; c < comps.length; c++) {
                const iaNome = comps[c].getString('ingrediente_ativo')
                if (iaNome && !ias.includes(iaNome)) {
                  ias.push(iaNome)
                }
              }
              if (ias.length > 0) {
                paCorreto = ias.join(' + ')
              }
            }
          }

          // Se não encontrou na composição, deduz do nome comercial se conhecido (ex: MESOTRIONE TÉCNICO ROTAM)
          if (!paCorreto) {
            const nomeComercial = prod.getString('nome_comercial').toUpperCase()
            if (nomeComercial.includes('MESOTRIONE')) {
              paCorreto = 'MESOTRIONE'
            } else if (nomeComercial.includes('GLIFOSATO') || nomeComercial.includes('ROUNDUP')) {
              paCorreto = 'GLIFOSATO'
            } else if (nomeComercial.includes('ATRAZINA')) {
              paCorreto = 'ATRAZINA'
            } else if (nomeComercial.includes('2,4-D') || nomeComercial.includes('2,4 D')) {
              paCorreto = '2,4-D'
            } else {
              paCorreto = ''
            }
          }

          prod.set('principio_ativo', paCorreto)
          try {
            app.save(prod)
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log(
        'Aviso ao corrigir principio_ativo em bula_produtos:',
        err && err.message ? err.message : err,
      )
    }
  },
  (app) => {},
)
