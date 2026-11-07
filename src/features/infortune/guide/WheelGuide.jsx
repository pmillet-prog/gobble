import React from 'react';
import { createPortal } from 'react-dom';
import './wheelGuide.css';

const pages = [
  {
    short: 'La cagnotte', title: 'Fais grandir ta cagnotte', image: 'cagnotte-v1',
    alt: 'Le plateau de la roue, les trois candidats et leur cagnotte en euros.',
    content: <><p>Entre les manches du mini-tournoi, tu as <strong>4 lancers de roue</strong> pour préparer ta finale.</p>
      <p>Le montant obtenu s’ajoute à ta <strong>cagnotte en euros</strong>. Un bon lancer rapporte 50 € de plus, un lancer parfait 100 €. Chaque gobble trouvé ajoute aussi 100 €, en plus des 5 gobblars gagnés.</p>
      <p><strong>Bonus :</strong> +1 000 € et +100 gobblars. <strong>Passe :</strong> aucun montant de case. <strong>Banqueroute :</strong> la cagnotte retombe à zéro.</p>
      <aside>Garde cette cagnotte pour acheter des lettres en finale.</aside></>,
  },
  {
    short: 'Les échanges', title: 'Au 4e lancer, les échanges', image: 'echanges-v1',
    alt: 'Le choix d’échange permet de sélectionner un candidat du plateau, de confirmer ou de ne pas échanger.',
    content: <><p>Des cases <strong>Échange</strong> apparaissent au dernier lancer. Les cagnottes sont alors cachées.</p>
      <p>Si tu tombes sur l’une d’elles, tu peux <strong>échanger toute ta cagnotte avec l’un des deux autres candidats de ton plateau</strong>.</p>
      <p>Tu préfères garder la tienne ? Choisis <strong>« Ne pas échanger »</strong>. Sans réponse à la fin de ton chrono, aucun échange n’est demandé.</p>
      <aside>Le tableau sous la roue indique qui doit encore lancer et qui choisit un échange. Un autre joueur peut aussi échanger avec toi.</aside></>,
  },
  {
    short: 'La finale', title: 'Dévoile la question, trouve la réponse', image: 'finale-v2',
    alt: 'Exemple de finale : la question dévoilée décrit un instrument indiquant le nord ; BOUSSOLE est saisi comme réponse.',
    content: <><p>Le tableau cache <strong>une question ou une énigme</strong>. Ce n’est pas une grille où chercher un mot.</p>
      <ol><li><strong>Achète des lettres</strong> pour lire la question : 50 € la consonne, 150 € la voyelle.</li>
        <li><strong>Trouve la réponse à cette question.</strong> Inutile de tout dévoiler si tu as compris !</li>
        <li>Appuie sur <strong>« J’ai la réponse »</strong>, saisis <strong>un mot</strong>, puis valide avant la fin du chrono. <strong>Une seule tentative !</strong></li></ol>
      <aside>Bonne réponse : <strong>+10 points</strong> au mini-tournoi et la cagnotte restante convertie en gobblars (<strong>10 € = 1 gobblar</strong>).</aside>
      <p className="wheel-guide__small">Si ta cagnotte ne permet plus d’acheter une lettre, tu peux utiliser tes gobblars : 5, puis 10, 20… Chaque achat demande confirmation.</p></>,
  },
];

export default function WheelGuide({ onComplete }) {
  const [page, setPage] = React.useState(0), [visited, setVisited] = React.useState(0);
  const dialog = React.useRef(null), heading = React.useRef(null), scroll = React.useRef(null);
  const canClose = visited === pages.length - 1, current = pages[page];
  React.useEffect(() => {
    const node = dialog.current, previous = document.activeElement;
    node.showModal();
    return () => { node.close(); if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, []);
  React.useEffect(() => { scroll.current?.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); }, [page]);
  function go(next) { setPage(next); setVisited(value => Math.max(value, next)); }
  return createPortal(<dialog ref={dialog} className="wheel-guide" aria-labelledby="wheel-guide-title"
    onCancel={event => { event.preventDefault(); if (canClose) onComplete(); }}>
    <header className="wheel-guide__header"><span>LA NOUVELLE ROUE · MODE D’EMPLOI</span>
      {canClose && <button type="button" aria-label="Fermer les explications" onClick={onComplete}>✕</button>}</header>
    <nav className="wheel-guide__steps" aria-label="Les trois étapes">{pages.map((item, index) => <span key={item.short} aria-current={page === index ? 'step' : undefined}>
      <b>{index + 1}</b>{item.short}</span>)}</nav>
    <div ref={scroll} className="wheel-guide__scroll"><div className="wheel-guide__page" key={page}>
      <figure><img src={`/ui/wheel-guide/${current.image}.webp`} alt={current.alt} width="1100" height="760" />
        <figcaption>{page === 2 ? 'Exemple : la réponse à cette énigme est BOUSSOLE.' : 'Capture du jeu'}</figcaption></figure>
      <section><h2 ref={heading} tabIndex={-1} id="wheel-guide-title">{current.title}</h2>{current.content}</section>
    </div></div>
    <footer><span>{page + 1} / {pages.length}</span><div>
      {page > 0 && <button type="button" onClick={() => go(page - 1)}>Précédent</button>}
      {page < pages.length - 1 ? <button type="button" className="wheel-guide__next" onClick={() => go(page + 1)}>Suivant →</button>
        : <button type="button" className="wheel-guide__next" onClick={onComplete}>J’ai compris, c’est parti !</button>}
    </div></footer>
  </dialog>, document.body);
}
