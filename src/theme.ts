/**
 * The only place colours live. Every value maps a Lumen token.
 * Fallbacks (after the comma) are used until @iubenda/lumen/tokens.css is installed.
 */
export const color = {
  surface: 'var(--lumen-color-surface-default, #ffffff)',
  surfaceSubtle: 'var(--lumen-color-surface-subtle, #f7f7fa)',
  surfaceRaised: 'var(--lumen-color-surface-raised, #eeeef3)',
  text: 'var(--lumen-color-text-primary, #16161d)',
  textSecondary: 'var(--lumen-color-text-secondary, #5c5c70)',
  border: 'var(--lumen-color-border-default, #d9d6f5)',
  borderStrong: 'var(--lumen-color-border-strong, #7f76e8)',
  action: 'var(--lumen-color-action-primary, #3b29ff)',
  success: 'var(--lumen-color-feedback-success, #1cc691)',
  successSubtle: 'var(--lumen-color-feedback-success-subtle, #c9f4e6)',
  warning: 'var(--lumen-color-feedback-warning, #ffc23d)',
  warningSubtle: 'var(--lumen-color-feedback-warning-subtle, #fff4d6)',
  danger: 'var(--lumen-color-feedback-destructive, #ff5d4d)',
  dangerSubtle: 'var(--lumen-color-feedback-destructive-subtle, #ffe3df)',
} as const

export const font = {
  body: 'var(--lumen-font-body, Poppins, system-ui, sans-serif)',
} as const
