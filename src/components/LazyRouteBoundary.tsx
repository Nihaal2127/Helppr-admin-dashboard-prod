import React, { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Shown when a lazy route chunk fails to load. */
  title?: string;
};

type State = {
  error: Error | null;
};

/**
 * Catches lazy-route / chunk errors so CRA does not show a full-screen overlay.
 * User can reload the page to recover after HMR or transient bundle races.
 */
export default class LazyRouteBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[LazyRouteBoundary]", error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="d-flex flex-column align-items-center justify-content-center p-5 text-center"
          style={{ minHeight: "240px" }}
        >
          <p className="mb-2 fw-semibold" style={{ color: "var(--navi-color)" }}>
            {this.props.title ?? "This page could not be loaded."}
          </p>
          <p className="mb-3 text-muted small">
            Please refresh the page. If the problem continues, clear the browser
            cache and try again.
          </p>
          <button
            type="button"
            className="custom-btn-primary"
            onClick={this.handleRetry}
          >
            Refresh page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
