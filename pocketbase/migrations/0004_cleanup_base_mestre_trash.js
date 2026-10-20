migrate(
  (app) => {
    // Limpeza idempotente de lixo na collection 'base_mestre':
    // 1. Linhas cujo nome_produto seja número puro (ex: "1", "2", "18", "429", "469")
    // 2. Linhas de cabeçalhos/textos informativos/instruções importados como produtos:
    //    - COMEÇA COM "COMO USAR"
    //    - COMEÇA COM "PRODUTOS EM VALIDA"
    //    - "Código", "Codigo", "Código Produto", "Codigo Produto", "Categoria de Divergência Auditada"
    //    - "Total de Produtos Auditados na Base Mestre"
    //    - COMEÇA COM "1. ", "2. ", "3. "
    //    - embalagem contendo texto TIPI ("Posição 38.08 TIPI", "Nota 2 Seção VI TIPI", "Cap. 31 TIPI", "Nota Subpos.", etc.)
    //    - registro_mapa contendo instruções ("Registro Numérico AGROFIT Obrigatório", "Registro SIPEAGRO Obrigatório", "Vincular Registro da Marca Comercial")
    //    - ncm vazio ou nulo

    app
      .db()
      .newQuery(`
      DELETE FROM base_mestre
      WHERE
        -- NCM vazio ou ausente
        ncm IS NULL OR TRIM(ncm) = ''

        -- nome_produto numérico puro (apenas dígitos)
        OR TRIM(nome_produto) GLOB '[0-9]*' AND TRIM(nome_produto) NOT GLOB '*[^0-9]*'

        -- Textos de instrução no nome_produto
        OR LOWER(nome_produto) LIKE 'como usar%'
        OR LOWER(nome_produto) LIKE 'produtos em valida%'
        OR LOWER(nome_produto) LIKE 'total de produtos%'
        OR LOWER(nome_produto) LIKE '1. regras oficiais%'
        OR LOWER(nome_produto) LIKE '2. resumo quantitativo%'
        OR LOWER(nome_produto) LIKE '3. relacao nominal%'
        OR LOWER(nome_produto) LIKE '3. relação nominal%'
        OR LOWER(TRIM(nome_produto)) IN ('codigo', 'código', 'codigo produto', 'código produto', 'categoria de divergência auditada', 'categoria de divergencia auditada')

        -- Textos de notas TIPI vazados na embalagem
        OR LOWER(embalagem) LIKE '%posicao 38.08 tipi%'
        OR LOWER(embalagem) LIKE '%posição 38.08 tipi%'
        OR LOWER(embalagem) LIKE '%nota 2 seção vi tipi%'
        OR LOWER(embalagem) LIKE '%nota 2 secao vi tipi%'
        OR LOWER(embalagem) LIKE '%cap. 31 tipi%'
        OR LOWER(embalagem) LIKE '%cap. 25 tipi%'
        OR LOWER(embalagem) LIKE '%regra geral tipi%'
        OR LOWER(embalagem) LIKE '%nota subpos.%'
        OR LOWER(embalagem) LIKE '%nota 5 cap. 31 tipi%'

        -- Textos de instrução vazados no registro_mapa
        OR LOWER(registro_mapa) LIKE '%agrofit obrigatório%'
        OR LOWER(registro_mapa) LIKE '%agrofit obrigatorio%'
        OR LOWER(registro_mapa) LIKE '%sipeagro obrigatório%'
        OR LOWER(registro_mapa) LIKE '%sipeagro obrigatorio%'
        OR LOWER(registro_mapa) LIKE '%vincular registro da marca comercial%'
    `)
      .execute()
  },
  () => {
    // Reversão de limpeza: não é possível recuperar linhas de lixo excluídas.
  },
)
