/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 1740000045:
 * Adicionar campos de texto opcional e numérico na coleção 'sim_produtos_base':
 * - grupo_codigo: text (B1_GRUPO)
 * - grupo_descricao: text (BM_DESC)
 * - descricao_grupo_tributario: text ("DESCRIÇÃO GRUPO TRIBUTARIO")
 * - segmento: text ("SEGMENTO")
 * - comissao_padrao: number ("COMISSAO_PADRAO")
 *
 * Idempotente: seguro para ser executado múltiplas vezes e em bancos vazios.
 */

migrate(
  (app) => {
    if (!app.hasTable('sim_produtos_base')) {
      return
    }

    const col = app.findCollectionByNameOrId('sim_produtos_base')
    let salvouSchema = false

    if (!col.fields.getByName('grupo_codigo')) {
      col.fields.add(
        new TextField({
          name: 'grupo_codigo',
          required: false,
        }),
      )
      salvouSchema = true
    }

    if (!col.fields.getByName('grupo_descricao')) {
      col.fields.add(
        new TextField({
          name: 'grupo_descricao',
          required: false,
        }),
      )
      salvouSchema = true
    }

    if (!col.fields.getByName('descricao_grupo_tributario')) {
      col.fields.add(
        new TextField({
          name: 'descricao_grupo_tributario',
          required: false,
        }),
      )
      salvouSchema = true
    }

    if (!col.fields.getByName('segmento')) {
      col.fields.add(
        new TextField({
          name: 'segmento',
          required: false,
        }),
      )
      salvouSchema = true
    }

    if (!col.fields.getByName('comissao_padrao')) {
      col.fields.add(
        new NumberField({
          name: 'comissao_padrao',
          required: false,
        }),
      )
      salvouSchema = true
    }

    if (salvouSchema) {
      app.save(col)
      console.log(
        "[Migration 1740000045] Campos 'grupo_codigo', 'grupo_descricao', 'descricao_grupo_tributario', 'segmento' e 'comissao_padrao' adicionados a 'sim_produtos_base'.",
      )
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('sim_produtos_base')
      const camposParaRemover = [
        'grupo_codigo',
        'grupo_descricao',
        'descricao_grupo_tributario',
        'segmento',
        'comissao_padrao',
      ]
      let mudou = false
      camposParaRemover.forEach((nome) => {
        const campo = col.fields.getByName(nome)
        if (campo) {
          col.fields.remove(campo)
          mudou = true
        }
      })
      if (mudou) {
        app.save(col)
      }
    } catch (_) {}
  },
)
