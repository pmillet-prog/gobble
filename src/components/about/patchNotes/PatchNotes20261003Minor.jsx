import React from "react";

export default function PatchNotes20261003Minor({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour mineure du <time dateTime="2026-10-03">3 octobre 2026</time>
      </h2>
      <ul className="mt-2 list-disc pl-5 space-y-2">
        <li>
          <strong>Les animateurs laissent leur place aux joueurs.</strong> En live,
          ils complètent les humains présents pour atteindre <strong>6 participants</strong> :
          avec 3 humains, 3 animateurs jouent ; dès 6 humains, aucun animateur ne participe aux manches.
        </li>
        <li>
          Les moins forts se retirent d’abord : Laurent Rhum&Co, Laurent Bafouille,
          Julien Lechéper, Maître Gobbello, puis Bernard Pinot.
          Avec <strong>5 humains, Bernard Pinot joue seul à leurs côtés</strong>.
        </li>
        <li>
          Si des humains quittent le salon, les animateurs reviennent compléter les places.
          Leur présence s’ajuste immédiatement dans le salon ; lorsqu’une manche est en cours,
          le changement prend effet <strong>à la manche suivante</strong>.
        </li>
      </ul>
    </article>
  );
}
