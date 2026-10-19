import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Sprout, ShieldCheck, Lock, Mail, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('roogerio99@gmail.com')
  const [password, setPassword] = useState('Skip@Pass')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Falha na autenticação. Verifique seu e-mail e senha.'
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-[#1B5E20] via-[#114016] to-[#0D3B0F] relative overflow-hidden">
      {/* Elementos decorativos de fundo */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-emerald-900/20 p-8 z-10 animate-in fade-in-up duration-300">
        {/* Logo e Título */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#1B5E20] to-[#2E7D32] text-white shadow-lg mb-3">
            <Sprout className="w-8 h-8 text-emerald-300" />
          </div>
          <h1 className="text-2xl font-bold text-[#1C2B1C]">Validador Agro</h1>
          <p className="text-sm text-[#5A6D5A] mt-1">
            Plataforma Integrada de Auditoria e Validação Cadastral
          </p>
        </div>

        {/* Mensagem de Erro */}
        {errorMsg && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-[#1C2B1C]">
              E-mail de Acesso
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
                className="pl-9 text-sm h-11 border-[#DCE5DC] focus-visible:ring-1 focus-visible:ring-[#1B5E20]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-semibold text-[#1C2B1C]">
                Senha
              </Label>
              <Link
                to="/esqueci-senha"
                className="text-xs text-[#1B5E20] hover:underline font-medium"
              >
                Esqueceu a senha?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#5A6D5A] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 text-sm h-11 border-[#DCE5DC] focus-visible:ring-1 focus-visible:ring-[#1B5E20]"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <>
                <span>Entrar no Sistema</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>

        {/* Card informativo de credenciais de teste para o proprietário */}
        <div className="mt-6 pt-5 border-t border-[#DCE5DC] text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-[11px] text-emerald-800 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>
              Acesso seed padrão: <strong>roogerio99@gmail.com</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
