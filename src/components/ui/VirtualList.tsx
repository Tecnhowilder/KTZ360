/**
 * VirtualList — Lista virtualizada para alto volumen de ítems (Sprint 22)
 *
 * Usa react-window para renderizar solo los ítems visibles en pantalla.
 * Crítico para: Cotizaciones (100-500+), Clientes (100-2000+), Materiales.
 * Sin virtualización → lag en dispositivos gama baja con listas grandes.
 *
 * Uso:
 *   <VirtualList
 *     items={quotes}
 *     itemHeight={76}
 *     height={window.innerHeight - 200}
 *     renderItem={(item, index) => <QuoteCard key={item.id} quote={item} />}
 *   />
 */
import { List as FixedSizeList } from 'react-window';
type ListChildComponentProps = { index: number; style: React.CSSProperties };
import { useMemo, useCallback } from 'react';

interface VirtualListProps<T> {
  items:        T[];
  itemHeight:   number;   // Altura fija de cada ítem en px
  height:       number;   // Altura total del contenedor en px
  width?:       string | number;
  renderItem:   (item: T, index: number) => React.ReactNode;
  overscan?:    number;   // Cuántos ítems extra renderizar fuera del viewport
  className?:   string;
}

export function VirtualList<T>({
  items,
  itemHeight,
  height,
  width = '100%',
  renderItem,
  overscan = 3,
  className,
}: VirtualListProps<T>) {
  const Row = useCallback(
    ({ index, style }: ListChildComponentProps) => (
      <div style={style}>
        {renderItem(items[index], index)}
      </div>
    ),
    [items, renderItem],
  );

  if (items.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ListAny = FixedSizeList as any;

  return (
    <ListAny
      height={height}
      width={width}
      itemCount={items.length}
      itemSize={itemHeight}
      overscanCount={overscan}
      className={className}
      style={{ outline: 'none' }}
    >
      {Row}
    </ListAny>
  );
}

/**
 * Hook para calcular la altura disponible para la lista virtualizada.
 * Resta header, tabs, bottom nav, etc.
 */
export function useListHeight(subtract = 200): number {
  return useMemo(() => {
    const vh = window.innerHeight;
    return Math.max(300, vh - subtract);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Umbral: virtualizar si hay más de N ítems.
 * Debajo del umbral, renderizar normalmente (sin overhead de react-window).
 */
export const VIRTUALIZATION_THRESHOLD = 50;
