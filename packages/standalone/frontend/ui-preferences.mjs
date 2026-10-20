export const LOW_PERFORMANCE_KEY = 'ofm.ui.low-performance.v1'

/**
 * One store per standalone document, shared by the shell and the in-document
 * channel client. Storage access can throw even when reading window.localStorage.
 * @param {{ root: HTMLElement, getStorage: () => Storage, events: Window }} options
 */
export function createUiPreferences({ root, getStorage, events }) {
  const listeners = new Set()
  let lowPerformance = false
  let storageAvailable = true
  try { lowPerformance = getStorage().getItem(LOW_PERFORMANCE_KEY) === 'true' }
  catch { storageAvailable = false }
  let snapshot = Object.freeze({ lowPerformance, storageAvailable })
  const publish = (enabled, available) => {
    root.setAttribute('data-ofm-low-performance', String(enabled))
    if (snapshot.lowPerformance === enabled && snapshot.storageAvailable === available) return
    snapshot = Object.freeze({ lowPerformance: enabled, storageAvailable: available })
    listeners.forEach(listener => listener())
  }
  root.setAttribute('data-ofm-low-performance', String(lowPerformance))
  const onStorage = event => {
    if (event.key !== LOW_PERFORMANCE_KEY && event.key !== null) return
    // sessionStorage uses the same event type; it must not change this preference.
    try { if (event.storageArea && event.storageArea !== getStorage()) return }
    catch { return }
    publish(event.key !== null && event.newValue === 'true', true)
  }
  const onPreference = event => {
    if (typeof event.detail?.lowPerformance !== 'boolean') return
    publish(event.detail.lowPerformance, event.detail.storageAvailable !== false)
  }
  events.addEventListener('storage', onStorage)
  events.addEventListener('ofm:ui-preferences', onPreference)
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setLowPerformance(enabled) {
      const value = Boolean(enabled)
      let available = true
      try { getStorage().setItem(LOW_PERFORMANCE_KEY, String(value)) }
      catch { available = false }
      // A denied/quota-limited write never prevents the live document update.
      publish(value, available)
      const EventClass = events.CustomEvent ?? globalThis.CustomEvent
      if (typeof events.dispatchEvent === 'function' && typeof EventClass === 'function') {
        events.dispatchEvent(new EventClass('ofm:ui-preferences', { detail: { lowPerformance: value, storageAvailable: available } }))
      }
    },
    dispose() { events.removeEventListener('storage', onStorage); events.removeEventListener('ofm:ui-preferences', onPreference); listeners.clear() },
  }
}

/** @type {ReturnType<typeof createUiPreferences> | undefined} */
let standalonePreferences
export function getUiPreferences() {
  return standalonePreferences ??= createUiPreferences({
    root: document.documentElement, getStorage: () => window.localStorage, events: window,
  })
}

/**
 * Keep theme intent when cancelling a deferred view-transition callback. This
 * follows PR #481's cancellation/cleanup approach without its visual redesign.
 * @param {{ document: Document, window: Window, preferences: ReturnType<typeof createUiPreferences>, apply: (next: 'light' | 'dark') => void, commit?: (update: () => void) => void }} options
 */
export function createThemeSwitcher({ document, window, preferences, apply, commit = update => update() }) {
  const root = document.documentElement
  let intent = root.dataset.theme === 'dark' ? 'dark' : 'light'
  let transition
  let revision = 0
  let disposed = false
  const clearReveal = () => {
    root.classList.remove('theme-transitioning')
    for (const property of ['--theme-reveal-x', '--theme-reveal-y', '--theme-reveal-r']) root.style.removeProperty(property)
  }
  const stop = () => {
    revision++
    transition?.skipTransition()
    transition = undefined
    clearReveal()
  }
  const unsubscribe = preferences.subscribe(() => {
    if (preferences.getSnapshot().lowPerformance && transition) {
      stop()
      apply(intent)
    }
  })
  return {
    toggle(origin) {
      if (disposed) return
      const next = intent === 'dark' ? 'light' : 'dark'
      stop()
      intent = next
      // Test before requesting a snapshot: disabling CSS alone still pays for it.
      if (preferences.getSnapshot().lowPerformance || !origin
        || typeof document.startViewTransition !== 'function'
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        apply(next)
        return
      }
      const version = revision
      const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
      root.style.setProperty('--theme-reveal-x', origin.x + 'px')
      root.style.setProperty('--theme-reveal-y', origin.y + 'px')
      root.style.setProperty('--theme-reveal-r', radius + 'px')
      root.classList.add('theme-transitioning')
      const finish = () => {
        if (version !== revision) return
        transition = undefined
        clearReveal()
      }
      try {
        transition = document.startViewTransition(() => {
          if (!disposed && version === revision) commit(() => apply(next))
        })
        // ready can reject when a snapshot is skipped; consume that rejection too.
        transition.ready?.catch(() => {})
        transition.finished.then(finish, finish)
      } catch {
        finish()
        apply(next)
      }
    },
    dispose() { disposed = true; unsubscribe(); stop() },
  }
}
