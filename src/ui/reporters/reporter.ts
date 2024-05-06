export interface Reporter {
  promptConfirmation(): Promise<boolean>
}
