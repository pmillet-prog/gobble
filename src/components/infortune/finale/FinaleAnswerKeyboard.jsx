import React from 'react';
import './finaleAnswerKeyboard.css';

export default function FinaleAnswerKeyboard({ disabled, onType, onErase }) {
  return <section className="finale-answer-keyboard" aria-label="Clavier de réponse AZERTY">
    {['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'].map((row, index) => <div className="finale-answer-keyboard__row" key={row}>
      {[...row].map(letter => <button type="button" key={letter} disabled={disabled} aria-label={`Écrire ${letter}`}
        onMouseDown={event => event.preventDefault()} onClick={() => onType(letter)}>{letter}</button>)}
      {index === 2 && <button type="button" className="finale-answer-keyboard__erase" disabled={disabled} onMouseDown={event => event.preventDefault()}
        onClick={onErase} aria-label="Effacer la dernière lettre"><span aria-hidden="true">⌫</span> Effacer</button>}
    </div>)}
  </section>;
}
