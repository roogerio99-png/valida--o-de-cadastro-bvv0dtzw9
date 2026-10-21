import React, { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

export interface ScrollableTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  /** Classe adicional para o container de rolagem real */
  scrollClassName?: string
  /** Se deve forçar ocultação da barra flutuante (ex.: quando a tela é muito pequena) */
  hideFloatingBarOnTouch?: boolean
}

/**
 * ScrollableTable
 *
 * Componente wrapper para tabelas com rolagem horizontal que implementa
 * uma barra de rolagem horizontal flutuante (docked / sticky no viewport visível).
 *
 * Resolve o problema de tabelas longas e largas onde o usuário precisava
 * rolar até o fim vertical da página para conseguir rolar horizontalmente.
 *
 * Recursos:
 * 1. Barra visível apenas quando há transbordamento horizontal real (`scrollWidth > clientWidth`).
 * 2. Posicionamento sticky no rodapé visível do container ou viewport do scroll da aplicação (`main`).
 * 3. Trilha e thumb estilizados, com arrasto suave (mouse drag, wheel e touch).
 * 4. Botões de deslocamento rápido (< e >) e porcentagem/indicador visual.
 * 5. Sincronização bidirecional em tempo real com o scroll nativo do container.
 * 6. Suporte nativo ao trackpad / Shift + roda do mouse e touch swipe.
 * 7. Não quebra sticky headers, seleções por checkbox ou linhas expansíveis.
 */
export function ScrollableTable({
  children,
  className,
  scrollClassName,
  hideFloatingBarOnTouch = true,
  ...props
}: ScrollableTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const [hasOverflow, setHasOverflow] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0) // 0 a 1
  const [thumbWidthRatio, setThumbWidthRatio] = useState(0.2) // tamanho relativo do thumb (0 a 1)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Medições e atualização de dimensões
  const updateDimensions = useCallback(() => {
    const el = containerRef.current
    if (!el) return

    const clientWidth = el.clientWidth
    const scrollWidth = el.scrollWidth
    const maxScroll = scrollWidth - clientWidth

    if (maxScroll > 2) {
      setHasOverflow(true)
      const ratio = Math.max(0.08, Math.min(1, clientWidth / scrollWidth))
      setThumbWidthRatio(ratio)
      const currentScroll = el.scrollLeft
      setScrollProgress(maxScroll > 0 ? Math.min(1, Math.max(0, currentScroll / maxScroll)) : 0)
    } else {
      setHasOverflow(false)
      setScrollProgress(0)
    }
  }, [])

  // Sincronização quando o usuário rola o container nativo (wheel, trackpad, touch swipe, teclado)
  const handleNativeScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll > 0) {
      setScrollProgress(Math.min(1, Math.max(0, el.scrollLeft / maxScroll)))
    }
  }, [])

  // Observa redimensionamento de janela e conteúdo
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    updateDimensions()

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })

    resizeObserver.observe(el)
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild)
    }

    window.addEventListener('resize', updateDimensions)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateDimensions)
    }
  }, [updateDimensions])

  // Lógica de arrasto (drag) do thumb da barra flutuante
  const dragStartRef = useRef<{
    startX: number
    startScrollLeft: number
    maxScroll: number
    trackWidth: number
    thumbWidth: number
  }>({ startX: 0, startScrollLeft: 0, maxScroll: 0, trackWidth: 0, thumbWidth: 0 })

  const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const el = containerRef.current
    const track = trackRef.current
    if (!el || !track) return

    const trackRect = track.getBoundingClientRect()
    const maxScroll = el.scrollWidth - el.clientWidth
    const trackWidth = trackRect.width
    const thumbWidth = Math.max(40, trackWidth * thumbWidthRatio)

    dragStartRef.current = {
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      maxScroll,
      trackWidth,
      thumbWidth,
    }

    setIsDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handleThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    e.preventDefault()

    const el = containerRef.current
    if (!el) return

    const { startX, startScrollLeft, maxScroll, trackWidth, thumbWidth } = dragStartRef.current
    const availableTrack = trackWidth - thumbWidth

    if (availableTrack <= 0 || maxScroll <= 0) return

    const deltaX = e.clientX - startX
    const deltaScroll = (deltaX / availableTrack) * maxScroll
    const newScrollLeft = Math.min(maxScroll, Math.max(0, startScrollLeft + deltaScroll))

    el.scrollLeft = newScrollLeft
  }

  const handleThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setIsDragging(false)
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Ignora erro de release caso o ponteiro já tenha sido liberado
    }
  }

  // Clique direto na trilha (pula para aquela posição proporcional)
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Se o clique foi no thumb, não faz nada (já tratado pelo pointer down)
    if ((e.target as HTMLElement).dataset?.role === 'thumb') return

    const track = trackRef.current
    const el = containerRef.current
    if (!track || !el) return

    const rect = track.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const trackWidth = rect.width
    const thumbWidth = Math.max(40, trackWidth * thumbWidthRatio)

    // Centraliza o thumb na posição do clique
    const targetThumbLeft = clickX - thumbWidth / 2
    const availableTrack = trackWidth - thumbWidth
    if (availableTrack <= 0) return

    const ratio = Math.max(0, Math.min(1, targetThumbLeft / availableTrack))
    const maxScroll = el.scrollWidth - el.clientWidth

    el.scrollTo({
      left: ratio * maxScroll,
      behavior: 'smooth',
    })
  }

  // Botões de passo rápido (< e >)
  const handleScrollStep = (direction: 'left' | 'right') => {
    const el = containerRef.current
    if (!el) return
    const step = el.clientWidth * 0.45
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    })
  }

  // Cálculo da posição do thumb em pixels ou %
  const thumbLeftPercent = scrollProgress * (1 - thumbWidthRatio) * 100
  const thumbWidthPercent = thumbWidthRatio * 100

  return (
    <div
      className={cn('relative w-full group/scrollable', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {/* Container de Rolagem Real da Tabela */}
      <div
        ref={containerRef}
        onScroll={handleNativeScroll}
        className={cn(
          'w-full overflow-x-auto overflow-y-visible',
          // Oculta levemente a barra nativa no desktop para dar destaque à barra flutuante suave,
          // mantendo a funcionalidade em trackpad e touch
          'scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700',
          scrollClassName,
        )}
      >
        {children}
      </div>

      {/* Barra de Rolagem Horizontal Flutuante (Sticky) */}
      {hasOverflow && (
        <div
          className={cn(
            'sticky bottom-0 left-0 right-0 z-30 pt-1.5 pb-2 px-3',
            'transition-all duration-200 ease-out select-none',
            // Efeito flutuante com fundo translúcido e borda suave
            'bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-[#DCE5DC] dark:border-zinc-800 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]',
            // Visível sempre ou realçada ao hover/drag
            isDragging || isHovered
              ? 'opacity-100 shadow-[0_-6px_16px_rgba(0,0,0,0.09)]'
              : 'opacity-90',
            // Em dispositivos exclusivamente touch com largura reduzida, pode ocultar se solicitado
            hideFloatingBarOnTouch ? 'hidden sm:block' : 'block',
          )}
          aria-label="Controle de rolagem horizontal flutuante da tabela"
        >
          <div className="flex items-center gap-2 max-w-full">
            {/* Botão de deslizar à esquerda */}
            <button
              type="button"
              onClick={() => handleScrollStep('left')}
              disabled={scrollProgress <= 0.01}
              aria-label="Rolar tabela para a esquerda"
              className={cn(
                'h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-xs transition-colors',
                'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 active:scale-95',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-50',
              )}
            >
              <svg className="w-3.5 h-3.5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Trilha da Barra Flutuante */}
            <div
              ref={trackRef}
              onClick={handleTrackClick}
              className={cn(
                'relative flex-1 h-3.5 rounded-full bg-emerald-950/10 dark:bg-zinc-800/60 cursor-pointer overflow-hidden border border-emerald-900/10',
                'hover:bg-emerald-950/15 transition-colors',
              )}
              title="Clique ou arraste para rolar horizontalmente a tabela"
            >
              {/* Thumb arrastável */}
              <div
                data-role="thumb"
                onPointerDown={handleThumbPointerDown}
                onPointerMove={handleThumbPointerMove}
                onPointerUp={handleThumbPointerUp}
                onPointerCancel={handleThumbPointerUp}
                style={{
                  left: `${thumbLeftPercent}%`,
                  width: `${thumbWidthPercent}%`,
                  minWidth: '40px',
                }}
                className={cn(
                  'absolute top-0 bottom-0 rounded-full cursor-grab active:cursor-grabbing transition-transform',
                  'bg-gradient-to-r from-[#1B5E20] to-[#2E7D32] hover:from-[#154a19] hover:to-[#1B5E20]',
                  'shadow-sm flex items-center justify-center',
                  isDragging && 'ring-2 ring-emerald-400 ring-offset-1',
                )}
              >
                {/* Indicador visual com 3 pontinhos para conforto de drag */}
                <div className="flex items-center gap-0.5 pointer-events-none opacity-80">
                  <span className="w-1 h-1 rounded-full bg-white/90" />
                  <span className="w-1 h-1 rounded-full bg-white/90" />
                  <span className="w-1 h-1 rounded-full bg-white/90" />
                </div>
              </div>
            </div>

            {/* Botão de deslizar à direita */}
            <button
              type="button"
              onClick={() => handleScrollStep('right')}
              disabled={scrollProgress >= 0.99}
              aria-label="Rolar tabela para a direita"
              className={cn(
                'h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-xs transition-colors',
                'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 active:scale-95',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-50',
              )}
            >
              <svg className="w-3.5 h-3.5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Indicador sutil de orientação */}
            <span className="hidden md:inline-flex items-center text-[10px] text-[#5A6D5A] font-medium shrink-0 ml-1">
              Deslize para ver colunas
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
