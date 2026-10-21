import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sprout, Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'

export function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    try {
      await pb.collection('users').requestPasswordReset(email)
      setSuccess(true)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível solicitar a recuperação. Verifique o e-mail informado.'
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-[#1B5E20] via-[#114016] to-[#0D3B0F] relative overflow-hidden">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-emerald-900/20 p-8 z-10 animate-in fade-in-up duration-300">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1B5E20] text-white shadow-lg mb-3">
            <Sprout className="w-8 h-8 text-emerald-300" />
          </div>
          <h1 className="text-2xl font-bold text-[#1C2B1C]">Recuperar Senha</h1>
          <p className="text-sm text-[#5A6D5A] mt-1">
            Informe o e-mail cadastrado para receber as instruções
          </p>
        </div>

        {success ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-[#2E7D32]">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <p className="text-sm text-[#1C2B1C] font-medium">
              E-mail de recuperação enviado com sucesso para:
            </p>
            <p className="text-xs font-semibold text-[#1B5E20] bg-emerald-50 py-2 px-3 rounded-lg border border-emerald-200">
              {email}
            </p>
            <p className="text-xs text-[#5A6D5A]">
              Verifique sua caixa de entrada e spam para redefinir sua credencial.
            </p>
            <Link to="/login" className="block pt-2">
              <Button variant="outline" className="w-full">
                Voltar para o Login
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                {errorMsg}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-[#1C2B1C]">
                E-mail Cadastrado
              </Label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#5A6D5A] absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@empresa.com.br"
                  className="pl-9 text-sm h-11 border-[#DCE5DC]"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-semibold rounded-xl"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar Instruções'}
            </Button>

            <div className="text-center pt-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs text-[#5A6D5A] hover:text-[#1B5E20] font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar para a tela de login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
