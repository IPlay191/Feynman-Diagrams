import { Component, StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import App from './App.jsx';

// "Other perspective": La Guaira is its own app. Only one of the two is ever loaded, so switching
// unloads the other map and all its data. The choice is kept in the address (#la-guaira).
const LaGuairaApp = lazy(() => import('./laguaira/LaGuairaApp.jsx'));
const placeFromHash = () => (location.hash === '#la-guaira' ? 'laguaira' : 'florida');

function Root() {
  const [place, setPlace] = useState(placeFromHash);
  useEffect(() => {
    const onHash = () => setPlace(placeFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const go = (p) => {
    history.pushState(null, '', p === 'laguaira' ? '#la-guaira' : location.pathname + location.search);
    setPlace(p);
  };
  if (place === 'laguaira') {
    return (
      <Suspense fallback={<div className="loading-screen">Loading La Guaira…</div>}>
        <LaGuairaApp onSwitch={() => go('florida')} />
      </Suspense>
    );
  }
  return <App onSwitch={() => go('laguaira')} />;
}

// If something breaks, show a friendly message instead of a blank page.
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Something went wrong 😕</h1>
        <p>{String(this.state.error.message || this.state.error)}</p>
        <button onClick={() => location.reload()}>Reload the page</button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);
