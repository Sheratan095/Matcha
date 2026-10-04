/** After a failed submit, puts the keyboard on the first field marked invalid inside `root`. */
export function focusFirstInvalid(root: HTMLElement | null): void {
  requestAnimationFrame(() => {
    const invalid = root?.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (!invalid) return
    const target = invalid.matches('input, textarea, select, button')
      ? invalid
      : (invalid.querySelector<HTMLElement>('input:checked') ?? invalid.querySelector<HTMLElement>('input, button'))
    target?.focus()
  })
}
