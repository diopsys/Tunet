/**
 * Symbol-Vorschlag für ein Fach bzw. eine Aktivität anhand des Namens (Teilwort, ohne
 * Groß-/Kleinschreibung). Die erste passende Regel gewinnt, deshalb stehen genauere
 * Begriffe (z. B. „Basketball“) vor allgemeineren („Ball“, „Sport“). null = kein Vorschlag.
 */
const REGELN = [
  [['schwimm', 'swim'], '🏊'],
  [['tennis'], '🎾'],
  [['basketball'], '🏀'],
  [['volleyball'], '🏐'],
  [['handball', 'fußball', 'fussball', 'soccer'], '⚽'],
  [['turnen', 'turn', 'gymnast'], '🤸'],
  [['reit', 'pferd', 'voltig'], '🐴'],
  [['ballett', 'tanz', 'dance'], '🩰'],
  [['judo', 'karate', 'kampfsport', 'taekwondo'], '🥋'],
  [['rad', 'fahrrad', 'bike'], '🚴'],
  [['lauf', 'leichtathletik', 'joggen'], '🏃'],
  [['yoga'], '🧘'],
  [['sport'], '⚽'],
  [['klavier', 'piano'], '🎹'],
  [['gitarre', 'guitar', 'band'], '🎸'],
  [['schlagzeug', 'trommel', 'drum'], '🥁'],
  [['chor', 'gesang', 'singen'], '🎤'],
  [['geige', 'violin', 'flöte', 'floete', 'musik', 'music'], '🎵'],
  [['theater', 'drama'], '🎭'],
  [['kunst', 'malen', 'zeichnen'], '🎨'],
  [['werken', 'technik'], '🔨'],
  [['textil', 'nähen', 'naehen', 'handarbeit'], '🧵'],
  [['koch', 'hauswirtschaft', 'backen'], '🍳'],
  [['mathe', 'rechnen', 'math'], '➗'],
  [['deutsch', 'lesen', 'german'], '📖'],
  [['englisch', 'english'], '🇬🇧'],
  [['französisch', 'franzoesisch', 'french'], '🇫🇷'],
  [['spanisch', 'spanish'], '🇪🇸'],
  [['italienisch'], '🇮🇹'],
  [['latein', 'griechisch', 'latin'], '🏛️'],
  [['geschichte', 'history'], '📜'],
  [['erdkunde', 'geograf', 'geograph'], '🌍'],
  [['politik', 'sozialkunde', 'gemeinschaftskunde', 'wirtschaft'], '🗳️'],
  [['bio'], '🌱'],
  [['chemie', 'chemistry'], '🧪'],
  [['physik', 'physics'], '🔬'],
  [['sachunterricht', 'nawi', 'naturwissenschaft'], '🔭'],
  [['informatik', 'computer', 'programmier'], '💻'],
  [['robotik', 'roboter'], '🤖'],
  [['religion', 'reli'], '✝️'],
  [['ethik', 'philosophie'], '🤔'],
  [['lernzeit', 'hausaufgaben', 'förder', 'foerder'], '📚'],
  [['studientag', 'homeschooling'], '🏠'],
  [['ganztag', 'betreuung', 'hort', 'ogs'], '🏫'],
  [['ferien', 'urlaub'], '🏖️'],
  [['pause', 'frei'], '😴'],
  [['ag'], '🧩'],
];

export function symbolVorschlag(name) {
  const text = String(name || '').trim().toLowerCase();
  if (!text) return null;
  // „ag“ nur als eigenes Wort (z. B. „Robotik-AG“), nicht in „Nachmittag“
  const woerter = text.split(/[^a-zäöüß]+/).filter(Boolean);
  for (const [begriffe, symbol] of REGELN) {
    const passt = begriffe.some((b) => (b.length <= 2 ? woerter.includes(b) : text.includes(b)));
    if (passt) return symbol;
  }
  return null;
}
