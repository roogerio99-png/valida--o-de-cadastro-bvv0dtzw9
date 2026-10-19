import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Sprout, Lock, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'

export default function RedefinirSenha() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== passwordConfirm) {
      setErrorMsg('As senhas digitadas não coincidem.')
      return
    }
    if (password.length < 8) {
      setErrorMsg('A nova senha deve possuir pelo menos 8 caracteres.')
      return
    }

    setErrorMsg('')
    setLoading(true)

    try {
      await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
      setSuccess(true)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Token inválido ou expirado. Solicite uma nova recuperação.'
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
          <h1 className="text-2xl font-bold text-[#1C2B1C]">Redefinir Senha</h1>
          <p className="text-sm text-[#5A6D5A] mt-1">
            Defina sua nova senha de acesso ao Validador Agro
          </p>
        </div>

        {success ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-[#2E7D32]">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <p className="text-sm text-[#1C2B1C] font-semibold">Senha redefinida com sucesso!</p>
            <p className="text-xs text-[#5A6D5A]">
              Você já pode acessar o sistema com sua nova credencial.
            </p>
            <Link to="/login" className="block pt-2">
              <Button className="w-full bg-[#1B5E20] hover:bg-[#2E7D32]">Ir para o Login</Button>
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
              <Label htmlFor="pass" className="text-xs font-semibold text-[#1C2B1C]">
                Nova Senha (mínimo 8 dígitos)
              </Label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#5A6D5A] absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="pass"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 text-sm h-11 border-[#DCE5DC]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="passConfirm" className="text-xs font-semibold text-[#1C2B1C]">
                Confirmar Nova Senha
              </Label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#5A6D5A] absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="passConfirm"
                  type="password"
                  required
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 text-sm h-11 border-[#DCE5DC]"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-semibold rounded-xl"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Atualizar Senha'}
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
