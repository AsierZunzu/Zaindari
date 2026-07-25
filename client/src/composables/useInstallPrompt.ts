import { computed, ref } from 'vue'

// Not in lib.dom: `beforeinstallprompt` is a Chromium extension to the spec, so
// the event shape has to be described here.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

// Module scope, not component scope. The browser fires beforeinstallprompt once
// and early — well before a lazy-loaded SettingsView has mounted — so the event
// has to be caught at boot and parked somewhere that outlives any component.
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isInstalled = ref(false)

function detectInstalled(): boolean {
  // `standalone` is Safari's non-standard answer to the same question; iOS
  // never fires beforeinstallprompt, so it is the only signal there.
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    iosStandalone === true
  )
}

/**
 * Starts listening for installability. Called from main.ts rather than from a
 * component, because by the time any view mounts the event has already fired.
 */
export function initInstallPrompt(): void {
  isInstalled.value = detectInstalled()

  window.addEventListener('beforeinstallprompt', (event) => {
    // Chromium shows its own mini-infobar unless this is cancelled. Suppressing
    // it is what hands the timing to us — and on Brave, which never shows an
    // automatic banner at all, our button is the only affordance there is.
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent
  })

  window.addEventListener('appinstalled', () => {
    // The prompt is spent once accepted; keeping it would offer a second
    // install that immediately throws.
    deferredPrompt.value = null
    isInstalled.value = true
  })
}

export function useInstallPrompt() {
  const canInstall = computed(
    () => deferredPrompt.value !== null && !isInstalled.value,
  )

  /**
   * Shows the browser's install dialog and resolves with what the user chose.
   * Resolves to null when there was no prompt to show.
   */
  async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
    const event = deferredPrompt.value
    if (!event) return null

    await event.prompt()
    const { outcome } = await event.userChoice

    // Single-use: the same event cannot be prompted twice. Chromium re-fires
    // beforeinstallprompt on a later page load if the user dismissed it, which
    // is what restores the button.
    deferredPrompt.value = null

    if (outcome === 'accepted') isInstalled.value = true
    return outcome
  }

  return {
    canInstall,
    isInstalled,
    promptInstall,
  }
}
