import { act, fireEvent, render, screen } from '@testing-library/react'
import type { AppSettings } from '@shared/ipc'
import { App } from '../App'
import { installFakeBridge, type FakeBridge } from './fake-bridge'

/**
 * Clicks and waits for the settings round-trip.
 *
 * Every interaction that changes a setting also fires an async write, so the
 * click is wrapped in an async `act` that flushes the resulting promise before
 * the test makes its assertions.
 */
export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element)
  })
}

/** Types into an uncontrolled field and flushes the resulting state updates. */
export async function setField(element: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(element, { target: { value } })
  })
}

/** Installs the fake preload bridge and renders the app once settings load. */
export async function renderApp(overrides: Partial<AppSettings> = {}): Promise<FakeBridge> {
  const bridge = installFakeBridge({
    lastViewedDate: '2024-06-26',
    defaultView: 'month',
    ...overrides
  })
  render(<App />)
  await screen.findByRole('heading', { name: '万年历' })
  return bridge
}
