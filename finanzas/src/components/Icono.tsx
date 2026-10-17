const TRAZOS = {
  inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  lista: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  mas: 'M12 5v14M5 12h14',
  calendario: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  ajustes: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  izquierda: 'M15 18l-6-6 6-6',
  derecha: 'M9 6l6 6-6 6',
  cerrar: 'M6 6l12 12M18 6L6 18',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
} as const

export type NombreIcono = keyof typeof TRAZOS

export function Icono({ nombre, tam = 22 }: { nombre: NombreIcono; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRAZOS[nombre]} />
    </svg>
  )
}
