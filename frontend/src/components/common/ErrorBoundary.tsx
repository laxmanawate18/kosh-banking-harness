import React from 'react';

/** One broken page must never blank the whole app: show a calm message with a way out instead. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Page failed to render', error);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });  // navigating away recovers
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="empty" role="alert">
        <h3>This page could not be shown</h3>
        <p>Something went wrong while loading it. Your data is safe. Try again, or open another page from the menu.</p>
        <button type="button" className="k-btn" onClick={() => window.location.reload()}>Reload</button>
      </section>
    );
  }
}
