import React from 'react';
import { createRoot } from 'react-dom/client';
import { createApplicationKernel } from '../../src/app/core/createApplicationKernel.js';
import { ApplicationRuntimeProvider } from '../../src/app/react/ApplicationRuntimeProvider.jsx';
import AboutModals from '../../src/components/about/AboutModals.jsx';
import ProfileAdminMenu from '../../src/features/admin/ProfileAdminMenu.jsx';
import { createAccountAdminFeature } from '../../src/features/admin/createAccountAdminFeature.js';
import '../../src/index.css';

const kernel = createApplicationKernel();
kernel.features.define('accountAdmin', createAccountAdminFeature);
kernel.commands.session.patch({ authState: { status: 'authenticated', user: { id: 99 }, loading: false } });
function Fixture() {
  const [about, setAbout] = React.useState(false), [dark, setDark] = React.useState(false);
  window.connectionFixture = { dark: setDark, logout: () => kernel.commands.session.patch({ authState: { status: 'no_account', user: null, loading: false } }) };
  return <ApplicationRuntimeProvider kernel={kernel}><main className="p-4" style={{ minHeight: '100vh', color: dark ? '#e2e8f0' : '#0f172a', background: dark ? '#0f172a' : '#f8fafc' }}>
    <button type="button" onClick={() => setAbout(true)}>À propos</button>
    <AboutModals isAboutOpen={about} menuDarkMode={dark} darkMode={dark} setIsAboutOpen={setAbout}
      setIsSupportOpen={() => {}} setSupportModalSection={() => {}} setIsPatchNotesOpen={() => {}} />
    <ProfileAdminMenu userId={17} nickname="Joueur exemple" viewerUserId={99} />
  </main></ApplicationRuntimeProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
