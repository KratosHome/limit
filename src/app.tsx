import { LimitApp } from './app/limit-app';
import { TrackingWidget } from './app/tracking-widget';

export default function App() {
  return new URLSearchParams(window.location.search).get('widget') ===
    'tracking' ? (
    <TrackingWidget />
  ) : (
    <LimitApp />
  );
}
