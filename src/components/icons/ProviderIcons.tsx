import linearSvg from "@/assets/icons/linear.svg"
import todoistSvg from "@/assets/icons/todoist.svg"
import attioSvg from "@/assets/icons/attio.svg"
import type { IntegrationType } from "@/types/database"

interface ProviderIconProps {
  className?: string
}

export function LinearIcon({ className }: ProviderIconProps) {
  return <img src={linearSvg} alt="Linear" width={16} height={16} className={className} />
}

export function TodoistIcon({ className }: ProviderIconProps) {
  return <img src={todoistSvg} alt="Todoist" width={16} height={16} className={className} />
}

export function AttioIcon({ className }: ProviderIconProps) {
  return <img src={attioSvg} alt="Attio" width={16} height={16} className={className} />
}

/** Map integration type to its branded icon component */
export const PROVIDER_ICON_MAP: Record<IntegrationType, React.FC<ProviderIconProps>> = {
  linear: LinearIcon,
  todoist: TodoistIcon,
  attio: AttioIcon,
}
