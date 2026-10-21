import React, { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

export interface ScrollableTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  /** Classe adicional para o container de rolagem real */
  scrollClassName?: string
  /**
   * Altura máxima do viewport da tabela para criar container com scroll vertical próprio.
   * Pode ser um valor CSS (ex: 'calc(100vh - 310px)', '400px'), ou 'auto' / 'none' / 'flex'.
   * Quando 'auto' (ou se autoFitHeight estiver ativo), a altura se readequará dinamicamente
   * ao espaço visível da página mantendo cabeçalho no topo e rodapé na base.
   */
  maxHeight?: string
  /** Altura mínima para o container de dados da tabela (padrão: 220px) */
  minHeight?: string
  /** Se deve forçar ocultação da barra flutuante (ex.: quando a tela é muito pequena) */
  hideFloatingBarOnTouch?: boolean
  /** Se deve esconder a barra de rolagem vertical visível (padrão: false, barra interna visível e funcional) */
  hideVerticalScrollbar?: boolean
  /** Se deve calcular a altura restante até o rodapé da página dinamicamente via medição do viewport */
  autoFitHeight?: boolean
  /** Margem inferior de segurança em pixels para o autoFitHeight (padrão: 64px para footer + padding) */
  bottomOffset?: number
  /** Callback opcional acionado quando o usuário se aproxima do final do scroll vertical */
  onNearBottom?: () => void
  /** Distância em pixels do final para disparar o onNearBottom (padrão: 200px) */
  bottomThreshold?: number
  /** Ref opcional para o contêiner interno com overflow */
  containerRef?: React.RefObject<HTMLDivElement>
}

/**
 * ScrollableTable
 *
 * Componente contêiner para tabelas largas e longas.
 *
 * Resolve o requisito do usuário:
 * A barra de rolagem horizontal permanece sempre visível na base do bloco,
 * o cabeçalho thead fica fixo no topo (sticky top-0), a barra de rolagem
 * vertical interna do bloco fica visível com seu indicador de posição,
 * e toda a rolagem vertical ocorre exclusivamente dentro do bloco da tabela.
 */
export function ScrollableTable({
  children,
  className,
  scrollClassName,
  maxHeight,
  minHeight = '220px',
  hideFloatingBarOnTouch = false,
  hideVerticalScrollbar = false,
  autoFitHeight = true,
  bottomOffset = 64,
  onNearBottom,
  bottomThreshold = 200,
  containerRef: externalContainerRef,
  style,
  ...props
}: ScrollableTableProps) {
  const rootWrapperRef = useRef<HTMLDivElement>(null)
  const internalContainerRef = useRef<HTMLDivElement>(null)
  const containerRef = externalContainerRef || internalContainerRef
  const trackRef = useRef<HTMLDivElement>(null)

  const [hasOverflow, setHasOverflow] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0) // 0 a 1
  const [thumbWidthRatio, setThumbWidthRatio] = useState(0.2) // tamanho relativo do thumb (0 a 1)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [computedMaxHeight, setComputedMaxHeight] = useState<string | undefined>(undefined)

  // Medição de overflow e dimensões do container
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

  // Sincronização quando o usuário rola o container nativo
  const handleNativeScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll > 0) {
      setScrollProgress(Math.min(1, Math.max(0, el.scrollLeft / maxScroll)))
    }

    // Detecção de aproximação do final vertical para rolagem infinita
    if (onNearBottom) {
      const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      if (scrollBottom <= bottomThreshold) {
        onNearBottom()
      }
    }
  }, [containerRef, onNearBottom, bottomThreshold])

  // Medição dinâmica da altura restante até o rodapé visível da página
  const updateAvailableHeight = useCallback(() => {
    if (!autoFitHeight) return

    const wrapper = rootWrapperRef.current
    if (!wrapper) return

    const rect = wrapper.getBoundingClientRect()
    // Espaço da base do wrapper/início da tabela até o rodapé da viewport
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    // Considerar barra horizontal se visível (~44px) + margem do rodapé da tela (footer h-10 = 40px + padding)
    const reservedBottom = bottomOffset + (hasOverflow ? 44 : 8)
    const available = viewportHeight - rect.top - reservedBottom

    // Manter um limite mínimo utilizável (ex.: 180px)
    const targetHeight = Math.max(180, Math.floor(available))
    setComputedMaxHeight(`${targetHeight}px`)
  }, [autoFitHeight, bottomOffset, hasOverflow])

  // Observa redimensionamento de janela e conteúdo
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    updateDimensions()
    updateAvailableHeight()

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions()
      updateAvailableHeight()
    })

    resizeObserver.observe(el)
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild)
    }
    if (rootWrapperRef.current) {
      resizeObserver.observe(rootWrapperRef.current)
    }

    const handleWindowResize = () => {
      updateDimensions()
      updateAvailableHeight()
    }

    window.addEventListener('resize', handleWindowResize)
    window.addEventListener('scroll', updateAvailableHeight, { passive: true })

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleWindowResize)
      window.removeEventListener('scroll', updateAvailableHeight)
    }
  }, [updateDimensions, updateAvailableHeight])

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
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // Ignora erro caso pointer capture falhe
    }
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
      // Ignora erro caso o ponteiro já tenha sido liberado
    }
  }

  // Clique direto na trilha (pula para aquela posição proporcional)
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset?.role === 'thumb') return

    const track = trackRef.current
    const el = containerRef.current
    if (!track || !el) return

    const rect = track.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const trackWidth = rect.width
    const thumbWidth = Math.max(40, trackWidth * thumbWidthRatio)

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

  const thumbLeftPercent = scrollProgress * (1 - thumbWidthRatio) * 100
  const thumbWidthPercent = thumbWidthRatio * 100

  // Determina a restrição de altura a ser aplicada:
  // Se maxHeight for explicitamente passado e não for 'auto', respeita o maxHeight fornecido.
  // Se autoFitHeight estiver ativo e tiver altura calculada, usa a altura calculada dinamicamente.
  // Fallback padrão: 'calc(100vh - 280px)'
  const effectiveMaxHeight =
    maxHeight && maxHeight !== 'auto' && maxHeight !== 'none'
      ? maxHeight
      : autoFitHeight && computedMaxHeight
        ? computedMaxHeight
        : maxHeight === 'none'
          ? undefined
          : 'calc(100vh - 280px)'

  const containerHeightStyle: React.CSSProperties = {
    ...(effectiveMaxHeight ? { maxHeight: effectiveMaxHeight } : {}),
    ...(minHeight ? { minHeight } : {}),
    // Em contêineres flex, permite encolher e rolar internamente
    flex: '1 1 auto',
  }

  return (
    <div
      ref={rootWrapperRef}
      className={cn('relative w-full flex flex-col group/scrollable', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={style}
      {...props}
    >
      {/*
        Container de rolagem vertical E horizontal da tabela.
        Ao ter altura calculada + overflow-y: auto + overflow-x: auto:
        1. thead com sticky top-0 trava perfeitamente no topo durante o scroll vertical das linhas.
        2. Toda a barra flutuante horizontal fica docking no fundo do contêiner e nunca desce além do viewport visível.
        3. A barra vertical de rolagem interna fica VISÍVEL por padrão (scrollbar nativa/estilizada),
           para que o usuário veja a posição exata das linhas enquanto rola o bloco.
      */}
      <div
        ref={containerRef}
        onScroll={handleNativeScroll}
        style={containerHeightStyle}
        className={cn(
          'w-full overflow-x-auto overflow-y-auto relative',
          // Regra CSS utilitária para fixar thead das tabelas filhas automaticamente
          '[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-[#F5F7F1] [&_thead_th]:bg-[#F5F7F1]',
          '[&_thead_th]:shadow-[0_1px_0_0_#DCE5DC]',
          // Ocultação opcional apenas se explicitamente solicitada
          hideVerticalScrollbar
            ? 'no-scrollbar-vertical [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'custom-scrollbar',
          scrollClassName,
        )}
      >
        {children}
      </div>

      {/*
        Barra de Rolagem Horizontal Fixa na Base da Tabela.
        Fica no rodapé do ScrollableTable. Como o container acima tem maxHeight,
        esta barra fica SEMPRE VISÍVEL na tela, logo abaixo do conteúdo visível,
        mesmo com milhares de linhas. O usuário nunca precisa rolar verticalmente
        até o final para arrastar horizontalmente!
      */}
      {hasOverflow && (
        <div
          className={cn(
            'w-full pt-1.5 pb-2 px-3 z-30 flex-shrink-0',
            'transition-all duration-200 ease-out select-none',
            'bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-[#DCE5DC] dark:border-zinc-800 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]',
            isDragging || isHovered
              ? 'opacity-100 shadow-[0_-6px_16px_rgba(0,0,0,0.09)]'
              : 'opacity-95',
            hideFloatingBarOnTouch ? 'hidden sm:block' : 'block',
          )}
          aria-label="Controle de rolagem horizontal fixo da tabela"
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
                  minWidth: '44px',
                }}
                className={cn(
                  'absolute top-0 bottom-0 rounded-full cursor-grab active:cursor-grabbing transition-transform',
                  'bg-gradient-to-r from-[#1B5E20] to-[#2E7D32] hover:from-[#154a19] hover:to-[#1B5E20]',
                  'shadow-sm flex items-center justify-center',
                  isDragging && 'ring-2 ring-emerald-400 ring-offset-1',
                )}
              >
                {/* 3 pontinhos para conforto de drag */}
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

            {/* Indicador visual de orientação */}
            <span className="hidden md:inline-flex items-center text-[10px] text-[#5A6D5A] font-medium shrink-0 ml-1">
              Deslize para ver colunas
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
