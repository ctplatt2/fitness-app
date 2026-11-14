import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { initDb } from './lib/db';
import './style.css';

registerSW({ immediate: true });

initDb().then(() => {
  render(<App />, document.getElementById('app')!);
});
