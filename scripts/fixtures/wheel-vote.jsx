import React from 'react';
import { createRoot } from 'react-dom/client';
import { createApplicationKernel } from '../../src/app/core/createApplicationKernel.js';
import { ApplicationRuntimeProvider } from '../../src/app/react/ApplicationRuntimeProvider.jsx';
import { WheelVoteProvider, ModifyWheelVoteButton } from '../../src/features/wheelVote/WheelVoteProvider.jsx';
import WheelVoteResultsButton from '../../src/features/wheelVote/WheelVoteResultsButton.jsx';
import GobbleRewardAnimation from '../../src/features/gobblars/GobbleRewardAnimation.jsx';
import useVocabOverlayFit from '../../src/components/vocab/useVocabOverlayFit.js';
import '../../src/index.css';
import '../../src/features/gobblars/gameBalances.css';
import '../../src/components/vocab/vocabProgressOverlay.css';
import '../../src/components/settings/settingsMenuFrame.css';

const kernel = createApplicationKernel();
window.voteFixture = {
  account(id) {
    document.cookie = `vote_fixture=${id}; path=/`;
    kernel.commands.session.patch({ authState: { status: 'authenticated', user: { id }, loading: false } });
  },
};
window.voteFixture.account(1);
function Rewards() {
  const { viewportRef, panelRef } = useVocabOverlayFit(true);
  return <>
    <div ref={viewportRef} className="vocab-progress-dialog fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 12040, background: '#dbe5ed' }}>
      <div ref={panelRef} className="vocab-progress-panel rounded-2xl bg-white p-5" style={{ width: 450, maxWidth: '100%', height: 420 }}>
        <h2 className="text-xl font-bold">Votre progression de vocabulaire</h2><p>Un nouveau palier de vocabulaire !</p>
      </div>
    </div>
    <div className="currency-layer"><GobbleRewardAnimation reward={{ id: 'r', stage: 'split', gobbles: 2, wallet: 4, bank: 200 }} positions={{}} /></div>
  </>;
}
function Fixture() {
  const [rewards, setRewards] = React.useState(false), [settings, setSettings] = React.useState(false);
  window.voteFixture.rewards = () => setRewards(true);
  window.voteFixture.settings = () => setSettings(true);
  return <ApplicationRuntimeProvider kernel={kernel}><WheelVoteProvider enabled>
    <main className="p-6"><h1>Gobble · vérification locale</h1><button id="background">Jeu derrière le vote</button>
      <ModifyWheelVoteButton /><WheelVoteResultsButton />
      {rewards && <Rewards />}
      {settings && <div className="settings-menu-frame" style={{ background: '#162b41', color: 'white' }}>Paramètres</div>}
    </main>
  </WheelVoteProvider></ApplicationRuntimeProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
