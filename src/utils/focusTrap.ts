const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createFocusTrap(container: HTMLElement): { activate(): void; deactivate(): void } {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return {
    activate() {
      container.addEventListener('keydown', onKeyDown);
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    },
    deactivate() {
      container.removeEventListener('keydown', onKeyDown);
    },
  };
}
