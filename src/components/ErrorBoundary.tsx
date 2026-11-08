import { Component, type ReactNode } from 'react'
import { reportError } from '../lib/monitoring'
import ErrorPage from './ErrorPage'

// Catches a crash in the page below it, reports it, and shows the error page
// with Retry instead of a blank screen. `resetKey` (the route) clears it when
// the user navigates away.
export default class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string; fullScreen?: boolean },
  { error: unknown; key?: string }
> {
  state: { error: unknown; key?: string } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: unknown; key?: string }) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey }
    return null
  }

  componentDidCatch(error: unknown) {
    reportError(error)
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorPage
          error={this.state.error}
          fullScreen={this.props.fullScreen}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}
