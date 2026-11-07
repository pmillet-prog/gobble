import intro from "./assets/intro.mp3";
import spin from "./assets/spin.mp3";
import drums from "./assets/suspense-drums.mp3";
import small from "./assets/result-small.mp3";
import good from "./assets/result-good.mp3";
import jackpot from "./assets/result-jackpot.mp3";
import bonus from "./assets/result-bonus.mp3";
import bankrupt from "./assets/bankrupt.mp3";
import exchange from "./assets/result-exchange.mp3";
import low1 from "./assets/audience-low-1.mp3";
import low2 from "./assets/audience-low-2.mp3";
import honorable from "./assets/audience-honorable.mp3";
import fiveHundred from "./assets/audience-500.mp3";
import top from "./assets/audience-top.mp3";
import fiveHundred2 from "./assets/audience-500-2.mp3";
import disappointedBankrupt from "./assets/audience-bankrupt.mp3";
import disappointedPass from "./assets/audience-pass.mp3";
import gasp from "./assets/audience-gasp.mp3";
import surprised from "./assets/audience-surprised.mp3";
import laughter from "./assets/audience-laughter.mp3";
import exchangeDrop1 from "./assets/exchange-drop-1.wav";
import exchangeDrop2 from "./assets/exchange-drop-2.wav";

export const WHEEL_SOUND_ASSETS = { intro, spin, drums, results: { small, good, jackpot, bonus, bankrupt, exchange },
  exchangeArrival: [{ url: exchangeDrop1, impactSeconds: .12348 }, { url: exchangeDrop2, impactSeconds: .09081 }],
  audience: { low1, low2, honorable, fiveHundred, fiveHundred2, top,
    disappointedBankrupt, disappointedPass, gasp, surprised, laughter } };
