export const ESTIMATE_DIALOG_EVENT = "flowpin:show-estimate"

export interface EstimateDialogDetail {
  taskIds: string[]
}

export function openEstimateDialog(taskIds: string[]): void {
  if (taskIds.length === 0) return
  window.dispatchEvent(
    new CustomEvent<EstimateDialogDetail>(ESTIMATE_DIALOG_EVENT, {
      detail: { taskIds },
    }),
  )
}
