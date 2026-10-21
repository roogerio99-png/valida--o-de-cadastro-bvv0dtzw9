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
  /** Se deve forçar exibição da barra flutuante (padrão: false — barra horizontal eliminada a pedido do usuário) */
  showFloatingHorizontalBar?: boolean
  /** Se deve forçar ocultação da barra flutuante (legado mantido por retrocompatibilidade) */
  hideFloatingBarOnTouch?: boolean
  /** Se deve esconder a barra de rolagem vertical visível (padrão: false, barra vertical interna mantida visível e funcional) */
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
 * Configuração visual:
 * - Nenhuma barra horizontal visível (nem flutuante, nem nativa horizontal).
 * - Rolagem horizontal 100% livre e funcional via trackpad, Shift + roda do mouse ou toque.
 * - Cabeçalho thead permanece sticky fixo no topo (sticky top-0).
 * - Barra vertical interna permanece visível (.custom-scrollbar) com indicador de posição.
 * - Toda a rolagem vertical ocorre exclusivamente dentro do bloco da tabela.
 */
export function ScrollableTable({
  children,
  className,
  scrollClassName,
  maxHeight,
  minHeight = '220px',
  showFloatingHorizontalBar = false,
  hideFloatingBarOnTouch: _hideFloatingBarOnTouch = false,
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
  const [computedMaxHeight, setComputedMaxHeight] = useState<string | undefined>(undefined)

  // Sincronização quando o usuário rola o container nativo
  const handleNativeScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return

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
    // Margem inferior de segurança (footer h-10 + padding)
    const reservedBottom = bottomOffset + (showFloatingHorizontalBar ? 44 : 8)
    const available = viewportHeight - rect.top - reservedBottom

    // Manter um limite mínimo utilizável (ex.: 180px)
    const targetHeight = Math.max(180, Math.floor(available))
    setComputedMaxHeight(`${targetHeight}px`)
  }, [autoFitHeight, bottomOffset, showFloatingHorizontalBar])

  // Observa redimensionamento de janela e conteúdo
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    updateAvailableHeight()

    const resizeObserver = new ResizeObserver(() => {
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
      updateAvailableHeight()
    }

    window.addEventListener('resize', handleWindowResize)
    window.addEventListener('scroll', updateAvailableHeight, { passive: true })

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleWindowResize)
      window.removeEventListener('scroll', updateAvailableHeight)
    }
  }, [updateAvailableHeight])

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
      style={style}
      {...props}
    >
      {/*
        Container de rolagem vertical E horizontal da tabela:
        1. thead com sticky top-0 trava perfeitamente no topo durante o scroll vertical das linhas.
        2. Barra vertical interna (.custom-scrollbar) permanece VISÍVEL por padrão, com indicador de posição.
        3. A barra horizontal fica OCULTA visualmente (custom-scrollbar com height: 0 e display: none horizontal,
           além de [&::-webkit-scrollbar:horizontal]:hidden), mas overflow-x: auto é PRESERVADO 100% para
           que o usuário possa deslizar lateralmente com trackpad, Shift + roda do mouse ou swipe/touch.
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
          // Oculta a barra de rolagem horizontal nativa em navegadores WebKit/Blink
          '[&::-webkit-scrollbar:horizontal]:hidden [&::-webkit-scrollbar:horizontal]:h-0',
          // Barra vertical: visível com .custom-scrollbar por padrão
          hideVerticalScrollbar
            ? 'no-scrollbar-vertical [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'custom-scrollbar',
          scrollClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
