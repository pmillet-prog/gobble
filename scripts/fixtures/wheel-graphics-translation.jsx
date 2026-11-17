import React from 'react';
import { createRoot } from 'react-dom/client';
import WheelGraphicsSetup from '../../src/features/infortune/graphics/WheelGraphicsSetup.jsx';

localStorage.clear();
const fixture = window.graphicsFixture = { errors: [] };
const originalFetch = window.fetch;
window.fetch = (url, options) => String(url).startsWith('/api/infortune/graphics?')
  ? new Promise(resolve => { fixture.lookup = () => resolve({ ok: true, json: async () => ({}) }); })
  : originalFetch(url, options);

class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { fixture.errors.push({ message: error.message, stack: info.componentStack }); }
  render() { return this.state.failed ? <p id="crashed">Crash</p> : this.props.children; }
}
function Fixture() {
  const [open, setOpen] = React.useState(true);
  return <Boundary>{open ? <WheelGraphicsSetup onComplete={result => {
    fixture.result = result; setOpen(false);
  }} /> : <p id="completed">Completed</p>}</Boundary>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
