import { describe, it, expect, beforeEach, vi } from 'vitest'

// The module keeps the captured event in module scope, so each test needs a
// fresh copy of it rather than a fresh composable call.
async function loadFresh() {
  vi.resetModules()
  return import('../useInstallPrompt')
}

function makePromptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string; platform: string }>
  }
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome, platform: 'web' })
  return event
}

describe('useInstallPrompt', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false }) as unknown as typeof matchMedia,
    )
  })

  it('cannot install until the browser says the app is installable', async () => {
    const { initInstallPrompt, useInstallPrompt } = await loadFresh()
    initInstallPrompt()

    expect(useInstallPrompt().canInstall.value).toBe(false)
  })

  it('offers installation once beforeinstallprompt fires', async () => {
    const { initInstallPrompt, useInstallPrompt } = await loadFresh()
    initInstallPrompt()

    window.dispatchEvent(makePromptEvent('accepted'))

    expect(useInstallPrompt().canInstall.value).toBe(true)
  })

  // The listener has to be registered at boot: the event fires long before a
  // lazy-loaded SettingsView mounts, and a missed event means no button ever.
  it('suppresses the browser mini-infobar so the in-app button owns the timing', async () => {
    const { initInstallPrompt } = await loadFresh()
    initInstallPrompt()

    const event = makePromptEvent('accepted')
    const prevented = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)

    expect(prevented).toHaveBeenCalled()
  })

  it('reports the accepted outcome and marks the app installed', async () => {
    const { initInstallPrompt, useInstallPrompt } = await loadFresh()
    initInstallPrompt()
    window.dispatchEvent(makePromptEvent('accepted'))

    const { promptInstall, isInstalled, canInstall } = useInstallPrompt()
    expect(await promptInstall()).toBe('accepted')
    expect(isInstalled.value).toBe(true)
    expect(canInstall.value).toBe(false)
  })

  // The event is single-use; prompting it twice throws in Chromium.
  it('discards the prompt after a dismissal so it cannot be reused', async () => {
    const { initInstallPrompt, useInstallPrompt } = await loadFresh()
    initInstallPrompt()
    window.dispatchEvent(makePromptEvent('dismissed'))

    const { promptInstall, canInstall, isInstalled } = useInstallPrompt()
    expect(await promptInstall()).toBe('dismissed')
    expect(canInstall.value).toBe(false)
    expect(isInstalled.value).toBe(false)
    expect(await promptInstall()).toBeNull()
  })

  it('treats a standalone display mode as already installed', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true }) as unknown as typeof matchMedia,
    )
    const { initInstallPrompt, useInstallPrompt } = await loadFresh()
    initInstallPrompt()

    window.dispatchEvent(makePromptEvent('accepted'))

    const { isInstalled, canInstall } = useInstallPrompt()
    expect(isInstalled.value).toBe(true)
    expect(canInstall.value).toBe(false)
  })
})
