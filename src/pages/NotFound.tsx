/* 404 Page - Displays when a user attempts to access a non-existent route - translate to the language of the user */
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

export function NotFound() {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Erro: Rota não encontrada:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F0] p-4">
      <div className="text-center bg-white p-8 rounded-2xl border border-[#DCE5DC] shadow-sm max-w-md w-full">
        <h1 className="text-5xl font-extrabold text-[#1B5E20] mb-2">404</h1>
        <p className="text-lg font-bold text-[#1C2B1C] mb-2">Página não encontrada</p>
        <p className="text-xs text-[#5A6D5A] mb-6">
          A rota que você tentou acessar não existe ou foi movida.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[#1B5E20] text-white text-xs font-semibold hover:bg-[#2E7D32] transition-colors"
        >
          Voltar para o Início
        </a>
      </div>
    </div>
  )
}

export default NotFound
