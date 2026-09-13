import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanDefinitionText,
  cleanEtymologyText,
} from "./build-wiktionary-definitions.mjs";
import { hasUnbalancedEtymologyDelimiters } from "./lib/etymologyText.mjs";

test("conserve le texte visible des liens Wikipédia", () => {
  assert.equal(
    cleanDefinitionText(
      "Voir {{w|Denis Diderot}}, {{W|Jean le Rond d’Alembert}} et {{WP|Encyclopédie|titre=l’Encyclopédie}}."
    ),
    "Voir Denis Diderot, Jean le Rond d’Alembert et l’Encyclopédie."
  );
});

test("préfère le libellé visible d’un lien Wikipédia", () => {
  assert.equal(
    cleanDefinitionText("{{w|Lord Kelvin|baron Kelvin|lang=fr}}"),
    "baron Kelvin"
  );
});

test("conserve les dates et siècles utiles au texte", () => {
  assert.equal(
    cleanDefinitionText("{{date|lang=fr|1753}} puis {{siècle|XX}}"),
    "1753 puis XXe siècle"
  );
});

test("répare l’étymologie de champlever issue du dump", () => {
  const raw =
    ": {{date|1753}}{{RÉF|1}} Première attestation dans l’{{w|Encyclopédie ou Dictionnaire raisonné des sciences, des arts et des métiers|Encyclopédie}} de {{w|Denis Diderot}} et {{w|Jean le Rond d’Alembert}}. Mot construit à partir du mot [[champ]], « fond d’une gravure », avec le verbe [[lever]].";

  assert.equal(
    cleanEtymologyText(raw),
    "1753 Première attestation dans l’Encyclopédie de Denis Diderot et Jean le Rond d’Alembert. Mot construit à partir du mot champ, « fond d’une gravure », avec le verbe lever."
  );
});

test("conserve les transcriptions et sens nommés, sans perdre les mots courts", () => {
  assert.equal(cleanDefinitionText("{{lien|σχολή|grc|tr=skholế|sens=loisir}}"), "σχολή, skholế (« loisir »)");
  assert.equal(cleanDefinitionText("{{lien|aa|fr}}"), "aa");
  assert.equal(cleanDefinitionText("{{lien|picea|la|dif=pĭcĕa}}"), "pĭcĕa");
  assert.equal(cleanDefinitionText("{{lien|フランス|ja|tr=Furansu|sens=France}}"), "フランス, Furansu (« France »)");
});

test("conserve les positions vides et les paramètres numériques des étymons", () => {
  assert.equal(cleanDefinitionText("{{étyl|grc|fr|σχολή||loisir}}"), "grec ancien σχολή (« loisir »)");
  assert.equal(cleanDefinitionText("{{étyl|1=grc|2=fr|3=σχολή|4=skholế|5=loisir}}"), "grec ancien σχολή, skholế (« loisir »)");
  assert.equal(cleanDefinitionText("{{étyl|la|fr}}"), "latin");
});

test("répare les racines disparues dans école, photographie et philosophie", () => {
  const school = "De l’{{étyl|fro|fr|escole}}, d’un latin tardif {{recons|lang-mot-vedette=fr|escola}}, du {{étyl|la|fr|mot=schola|sens=loisir studieux, leçon, lieu d’étude}}, lui-même issu du {{étyl|grc|fr|σχολή|skholế|loisir|nocat=1}}.";
  assert.equal(cleanEtymologyText(school), "De l’ancien français escole, d’un latin tardif escola (forme reconstruite), du latin schola (« loisir studieux, leçon, lieu d’étude »), lui-même issu du grec ancien σχολή, skholế (« loisir »).");
  const photo = "{{date|1832}} Du {{étyl|grc|fr|mot=φῶς|dif=φῶς, φωτός|tr=phôs, phôtós|sens=lumière}} et {{polytonique|{{lien|γράφω|grc}}|gráphô|écrire}}, littéralement : « écrire avec la lumière ».";
  assert.equal(cleanEtymologyText(photo), "1832 Du grec ancien φῶς, φωτός, phôs, phôtós (« lumière ») et γράφω, gráphô (« écrire »), littéralement: « écrire avec la lumière ».");
  const philosophy = "Du grec ancien {{polytonique|[[φιλοσοφία#grc|φιλοσοφία]]|philosophía|état de celui qui est philosophe}}.";
  assert.equal(cleanEtymologyText(philosophy), "Du grec ancien φιλοσοφία, philosophía (« état de celui qui est philosophe »).");
});

test("les liens imbriqués dans le sens ne décalent pas les paramètres", () => {
  assert.equal(cleanDefinitionText("{{étyl|grc|fr|σχολή|skholế|[[loisir|temps libre]]}}"), "grec ancien σχολή, skholế (« temps libre »)");
  assert.equal(cleanDefinitionText("{{lien|σχολή|grc|tr=-|sens=loisir}}"), "σχολή (« loisir »)");
});

test("une étymologie longue n’est pas coupée au milieu du sens d’une racine", () => {
  const raw = 'Du {{étyl|la|fr|schola|sens=loisir studieux, leçon, lieu d’étude}}, lui-même issu du {{étyl|grc|fr|σχολή|skholế|loisir et temps libre consacré à des activités intellectuelles}}.';
  const text = cleanEtymologyText(raw, 145);
  assert.ok(text.length <= 145);
  assert.equal(hasUnbalancedEtymologyDelimiters(text), false);
  assert.match(text, /schola/);
  assert.match(text, /\.\.\.$/);
});

test("répudier conserve une datation explicitement inconnue et le sens latin", () => {
  assert.equal(cleanEtymologyText(":{{siècle|lang=fr|?}} Du {{étyl|la|fr|mot=repudiare|sens=repousser}}."),
    "(Siècle à préciser) Du latin repudiare (« repousser »).");
  assert.equal(cleanDefinitionText("{{date|?}}"), "(Date à préciser)");
  assert.equal(cleanEtymologyText("{{siècle|?}}."), "");
  assert.equal(cleanEtymologyText("{{date|lang=fr}}"), "");
});

test("les siècles arabes, romains, liés et les fourchettes restent lisibles", () => {
  for (const [raw, expected] of [
    ["{{siècle|15}}", "XVe siècle"],
    ["{{siècle|16e}}", "XVIe siècle"],
    ["{{siècle|I}}", "Ier siècle"],
    ["{{siècle|Fin du XIX}}", "Fin du XIXe siècle"],
    ["{{siècle|Début du XIV}}", "Début du XIVe siècle"],
    ["{{siècle|Vers le XI av. J.-C.}}", "Vers le XIe siècle av. J.-C."],
    ["{{siècle|XVII|XVIII|doute=oui}}", "XVIIe siècle – XVIIIe siècle?"],
    ["{{siècle|[[XVe siècle]]}}", "XVe siècle"],
    ["{{siècle2|12}}-{{siècle2|xiii}} siècles", "XIIe-XIIIe siècles"],
    ["{{siècle2|1}} siècle", "Ier siècle"],
    ["{{siècle|XV{{e}}}}", "XVe siècle"],
    ["{{date|{{circa|1100}}}}", "vers 1100"],
    ["I{{er}} siècle {{avJC}}", "Ier siècle av. J.-C."],
    ["XVI<sup>e</sup> siècle", "XVIe siècle"],
  ]) assert.equal(cleanDefinitionText(raw), expected, raw);
});

test("les dates d’article et de semaine ne disparaissent plus", () => {
  assert.equal(cleanEtymologyText("De l’ancien français article (fin {{siècle2|12}}-début {{siècle2|13}})."),
    "De l’ancien français article (fin XIIe-début XIIIe).");
  assert.equal(cleanEtymologyText("Attesté aux {{siècle2|XVI}} et {{siècle2|XVII}} siècles."),
    "Attesté aux XVIe et XVIIe siècles.");
});

test("les racines encapsulées dans un modèle de mise en forme sont conservées", () => {
  assert.equal(cleanEtymologyText("Du latin {{Lang|la|[[Martis]] [[dies]]}} signifiant le jour de Mars."),
    "Du latin Martis dies signifiant le jour de Mars.");
  assert.equal(cleanDefinitionText("{{nobr|{{smcp|XV}}{{e}}}} siècle"), "XVe siècle");
  assert.equal(cleanDefinitionText("[[répudier#fr]] et [[répudier#fr|répudier]]"), "répudier et répudier");
  assert.equal(cleanDefinitionText("«&nbsp;mince&nbsp;» &amp; &#xE9; &thinsp; &#39;"), "« mince » & é '");
});

test("les étymologies composées conservent toutes leurs racines et affixes", () => {
  assert.equal(cleanEtymologyText("{{siècle|XIX}} {{composé de|m=1|collaborer|-ation|lang=fr}}."),
    "XIXe siècle Dérivé de collaborer, avec le suffixe -ation.");
  assert.equal(cleanEtymologyText("{{composé de|m=1|re-|faire|lang=fr}}."),
    "Dérivé de faire, avec le préfixe re-.");
  assert.equal(cleanDefinitionText("{{composé de|1=φῶς|2=γράφω|tr1=phôs|sens1=lumière|tr2=gráphô|sens2=écrire}}"),
    "composé de φῶς, phôs (« lumière ») et de γράφω, gráphô (« écrire »)");
  assert.equal(cleanDefinitionText("{{composé de|porte|monnaie|m=1|dif1=porte-}}"), "Composé de porte- et de monnaie");
});

test("les dérivations d’accueil, filtrer et dico ne deviennent pas vides", () => {
  assert.equal(cleanEtymologyText("{{siècle|XII}} {{déverbal|de=accueillir|lang=fr|m=1}}."), "XIIe siècle Déverbal d’accueillir.");
  assert.equal(cleanEtymologyText("{{siècle|XVI}} {{dénominal|de=filtre|lang=fr|m=1}}."), "XVIe siècle Dénominal de filtre.");
  assert.equal(cleanEtymologyText("{{apocope|m=1|fr|de=dictionnaire}} avec ajout du suffixe -o."), "Apocope de dictionnaire avec ajout du suffixe -o.");
});

test("le diagnostic signale les modèles inconnus hors références", () => {
  const unsupported = [];
  cleanEtymologyText("Du latin {{modèle-inconnu|racine}}.<ref>{{ouvrage|titre=Source}}</ref>", undefined,
    { onUnsupportedTemplate: item => unsupported.push(item.name) });
  assert.deepEqual(unsupported, ["modele-inconnu"]);
});
