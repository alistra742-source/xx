import { Component } from 'react';

// Without a boundary a render error unmounts the whole tree, which leaves the
// dark page background and nothing else — indistinguishable from a dead site.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[studio] render failed', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <div className="alert error" role="alert">
          <strong>The studio hit an unexpected error.</strong>
          <p>{this.state.error.message || 'Unknown error.'}</p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>Reload the studio</button>
        </div>
      </div>
    );
  }
}
