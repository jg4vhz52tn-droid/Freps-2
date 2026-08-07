// Klausurfuchs Supabase data layer.
// Same public API as the old localStorage-based window.KFStore / window.KFCatalog
// mockups, but every method is now async and backed by real tables. Load this
// as a <script type="module"> after config.js on every page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.KF_SUPABASE_URL, window.KF_SUPABASE_ANON_KEY);
window.supabase = supabase;

const DEVICE_TOKEN_KEY = "klausurfuchs_device_token";
const OAUTH_CLAIM_PENDING_KEY = "klausurfuchs_oauth_claim_pending";

// Single source of truth for which baustein types exist and their display
// labels -- app.html and Pruef-Dashboard.html each used to keep their own
// independent copy of this list, and a new baustein (lernplan) once shipped
// in one copy but not the other. Both pages read window.KF_BAUSTEIN_LABELS
// instead of keeping their own now; add a new baustein here once.
window.KF_BAUSTEIN_LABELS = {
  zusammenfassung: "Zusammenfassung", karteikarten: "Karteikarten", uebungen: "Übungsaufgaben",
  altklausuren: "Altklausuren", tutorien: "Tutorien", zusatz: "Zusatzmodule", lernplan: "Lernplan"
};

// Kuratierte Liste bekannter deutscher Hochschulen samt Namensvarianten
// (aliases) -- einzige Quelle sowohl für das Autocomplete im Creator-Wizard
// (app.html liest hier statt eine eigene Kopie zu pflegen) als auch für die
// Alias-Normalisierung beim Kurs-Anlegen/JSON-Import (KFHochschulen.findGroup(),
// siehe resolveOrCreateHochschule() weiter unten) -- ohne diese eine Quelle
// legt jeder Tippfehler/jedes Alias eine neue "Phantom-Hochschule" an, statt
// die bereits bestehende Zeile wiederzuverwenden.
window.KF_HOCHSCHULEN = [
    { name: 'HWG Ludwigshafen', aliases: ['Hochschule Ludwigshafen', 'Hochschule für Wirtschaft und Gesellschaft Ludwigshafen', 'HWG LU'] },
    { name: 'Frankfurt University of Applied Sciences', aliases: ['FH Frankfurt', 'Fachhochschule Frankfurt', 'Frankfurt UAS'] },
    { name: 'Hochschule Mainz', aliases: ['FH Mainz', 'Fachhochschule Mainz'] },
    { name: 'Hochschule Worms', aliases: ['FH Worms', 'Fachhochschule Worms'] },
    { name: 'Hochschule Trier', aliases: ['FH Trier', 'Fachhochschule Trier'] },
    { name: 'Hochschule RheinMain', aliases: ['FH Wiesbaden', 'Hochschule Wiesbaden'] },
    { name: 'Hochschule Darmstadt', aliases: ['h_da', 'FH Darmstadt'] },
    { name: 'Technische Hochschule Mittelhessen', aliases: ['THM', 'FH Gießen-Friedberg'] },
    { name: 'Hochschule Fulda', aliases: ['FH Fulda'] },
    { name: 'Hochschule Koblenz', aliases: ['FH Koblenz'] },
    { name: 'Hochschule Kaiserslautern', aliases: ['FH Kaiserslautern'] },
    { name: 'Duale Hochschule Baden-Württemberg Mannheim', aliases: ['DHBW Mannheim'] },
    { name: 'Duale Hochschule Baden-Württemberg Stuttgart', aliases: ['DHBW Stuttgart'] },
    { name: 'Hochschule Mannheim', aliases: ['FH Mannheim'] },
    { name: 'Hochschule Heilbronn', aliases: ['FH Heilbronn'] },
    { name: 'Hochschule Karlsruhe', aliases: ['HKA', 'FH Karlsruhe'] },
    { name: 'Hochschule Pforzheim', aliases: ['FH Pforzheim'] },
    { name: 'Hochschule Esslingen', aliases: ['FH Esslingen'] },
    { name: 'Hochschule für Technik Stuttgart', aliases: ['HFT Stuttgart'] },
    { name: 'Technische Hochschule Nürnberg Georg Simon Ohm', aliases: ['TH Nürnberg', 'Ohm Nürnberg'] },
    { name: 'Hochschule München', aliases: ['FH München'] },
    { name: 'Technische Hochschule Rosenheim', aliases: ['TH Rosenheim', 'FH Rosenheim'] },
    { name: 'Hochschule Augsburg', aliases: ['FH Augsburg'] },
    { name: 'Technische Hochschule Ingolstadt', aliases: ['THI'] },
    { name: 'Hochschule Köln', aliases: ['TH Köln', 'FH Köln'] },
    { name: 'Hochschule Bonn-Rhein-Sieg', aliases: ['H-BRS'] },
    { name: 'Hochschule Düsseldorf', aliases: ['HSD', 'FH Düsseldorf'] },
    { name: 'Hochschule Niederrhein', aliases: ['FH Niederrhein', 'Krefeld Mönchengladbach'] },
    { name: 'Fachhochschule Aachen', aliases: ['FH Aachen'] },
    { name: 'Hochschule Bochum', aliases: ['FH Bochum'] },
    { name: 'Hochschule Bremen', aliases: ['FH Bremen'] },
    { name: 'Hochschule für Angewandte Wissenschaften Hamburg', aliases: ['HAW Hamburg'] },
    { name: 'Hochschule Hannover', aliases: ['FH Hannover', 'HsH'] },
    { name: 'Ostfalia Hochschule für angewandte Wissenschaften', aliases: ['Ostfalia'] },
    { name: 'Hochschule für Technik und Wirtschaft Berlin', aliases: ['HTW Berlin'] },
    { name: 'Beuth Hochschule für Technik Berlin', aliases: ['Beuth Hochschule'] },
    { name: 'Hochschule für Wirtschaft und Recht Berlin', aliases: ['HWR Berlin'] },
    { name: 'Hochschule für Technik und Wirtschaft Dresden', aliases: ['HTW Dresden'] },
    { name: 'Westsächsische Hochschule Zwickau', aliases: ['WHZ'] },
    { name: 'Hochschule Merseburg', aliases: [] },
    { name: 'Hochschule Anhalt', aliases: [] },
    { name: 'Universität Mannheim', aliases: [] },
    { name: 'Universität Heidelberg', aliases: [] },
    { name: 'Goethe-Universität Frankfurt', aliases: ['Uni Frankfurt'] },
    { name: 'Johannes Gutenberg-Universität Mainz', aliases: ['Uni Mainz', 'JGU'] },
    { name: 'Ludwig-Maximilians-Universität München', aliases: ['LMU München', 'LMU'] },
    { name: 'Technische Universität München', aliases: ['TU München', 'TUM'] },
    { name: 'Rheinisch-Westfälische Technische Hochschule Aachen', aliases: ['RWTH Aachen'] },
    // Baden-Württemberg
    { name: 'Karlsruher Institut für Technologie', aliases: ['KIT', 'Universität Karlsruhe'] },
    { name: 'Universität Stuttgart', aliases: [] },
    { name: 'Universität Tübingen', aliases: ['Eberhard Karls Universität Tübingen'] },
    { name: 'Universität Freiburg', aliases: ['Albert-Ludwigs-Universität Freiburg'] },
    { name: 'Universität Ulm', aliases: [] },
    { name: 'Universität Hohenheim', aliases: [] },
    { name: 'Universität Konstanz', aliases: [] },
    { name: 'Duale Hochschule Baden-Württemberg Karlsruhe', aliases: ['DHBW Karlsruhe'] },
    { name: 'Duale Hochschule Baden-Württemberg Villingen-Schwenningen', aliases: ['DHBW Villingen-Schwenningen'] },
    { name: 'Duale Hochschule Baden-Württemberg Heidenheim', aliases: ['DHBW Heidenheim'] },
    { name: 'Duale Hochschule Baden-Württemberg Lörrach', aliases: ['DHBW Lörrach'] },
    { name: 'Duale Hochschule Baden-Württemberg Ravensburg', aliases: ['DHBW Ravensburg'] },
    { name: 'Duale Hochschule Baden-Württemberg Heilbronn', aliases: ['DHBW Heilbronn'] },
    { name: 'Hochschule Aalen', aliases: ['FH Aalen'] },
    { name: 'Hochschule Furtwangen', aliases: ['HFU'] },
    { name: 'Hochschule Offenburg', aliases: ['FH Offenburg'] },
    { name: 'Hochschule Reutlingen', aliases: ['FH Reutlingen'] },
    { name: 'Hochschule Ravensburg-Weingarten', aliases: ['RWU'] },
    { name: 'Hochschule für Wirtschaft und Umwelt Nürtingen-Geislingen', aliases: ['HfWU'] },
    { name: 'Pädagogische Hochschule Freiburg', aliases: [] },
    { name: 'Pädagogische Hochschule Heidelberg', aliases: [] },
    { name: 'Pädagogische Hochschule Karlsruhe', aliases: [] },
    { name: 'Pädagogische Hochschule Ludwigsburg', aliases: [] },
    { name: 'Pädagogische Hochschule Schwäbisch Gmünd', aliases: [] },
    { name: 'Pädagogische Hochschule Weingarten', aliases: [] },
    // Bayern
    { name: 'Universität Augsburg', aliases: [] },
    { name: 'Universität Bayreuth', aliases: [] },
    { name: 'Universität Regensburg', aliases: [] },
    { name: 'Universität Würzburg', aliases: ['Julius-Maximilians-Universität Würzburg'] },
    { name: 'Friedrich-Alexander-Universität Erlangen-Nürnberg', aliases: ['FAU', 'Uni Erlangen-Nürnberg'] },
    { name: 'Universität Passau', aliases: [] },
    { name: 'Universität Bamberg', aliases: [] },
    { name: 'Katholische Universität Eichstätt-Ingolstadt', aliases: ['KU Eichstätt'] },
    { name: 'Hochschule Landshut', aliases: [] },
    { name: 'Ostbayerische Technische Hochschule Regensburg', aliases: ['OTH Regensburg', 'Hochschule Regensburg'] },
    { name: 'Ostbayerische Technische Hochschule Amberg-Weiden', aliases: ['OTH Amberg-Weiden'] },
    { name: 'Hochschule Ansbach', aliases: [] },
    { name: 'Hochschule Aschaffenburg', aliases: [] },
    { name: 'Hochschule Coburg', aliases: [] },
    { name: 'Hochschule Hof', aliases: [] },
    { name: 'Hochschule Kempten', aliases: [] },
    { name: 'Hochschule Neu-Ulm', aliases: ['HNU'] },
    { name: 'Hochschule Weihenstephan-Triesdorf', aliases: ['HSWT'] },
    { name: 'Technische Hochschule Würzburg-Schweinfurt', aliases: ['THWS', 'FHWS'] },
    { name: 'Technische Hochschule Deggendorf', aliases: ['THD'] },
    { name: 'Munich Business School', aliases: [] },
    // Berlin
    { name: 'Freie Universität Berlin', aliases: ['FU Berlin'] },
    { name: 'Humboldt-Universität zu Berlin', aliases: ['HU Berlin'] },
    { name: 'Technische Universität Berlin', aliases: ['TU Berlin'] },
    { name: 'Alice Salomon Hochschule Berlin', aliases: ['ASH Berlin'] },
    { name: 'Evangelische Hochschule Berlin', aliases: ['EHB'] },
    { name: 'Katholische Hochschule für Sozialwesen Berlin', aliases: ['KHSB'] },
    { name: 'Universität der Künste Berlin', aliases: ['UdK Berlin'] },
    { name: 'ESMT Berlin', aliases: [] },
    { name: 'Hertie School', aliases: [] },
    { name: 'Charité – Universitätsmedizin Berlin', aliases: ['Charité Berlin'] },
    { name: 'SRH Hochschule Berlin', aliases: [] },
    // Brandenburg
    { name: 'Universität Potsdam', aliases: [] },
    { name: 'Europa-Universität Viadrina Frankfurt (Oder)', aliases: ['Viadrina'] },
    { name: 'Brandenburgische Technische Universität Cottbus-Senftenberg', aliases: ['BTU Cottbus'] },
    { name: 'Technische Hochschule Brandenburg', aliases: [] },
    { name: 'Hochschule für nachhaltige Entwicklung Eberswalde', aliases: ['HNEE'] },
    { name: 'Technische Hochschule Wildau', aliases: [] },
    // Bremen
    { name: 'Universität Bremen', aliases: [] },
    { name: 'Jacobs University Bremen', aliases: [] },
    { name: 'Hochschule Bremerhaven', aliases: [] },
    { name: 'Hochschule für Künste Bremen', aliases: ['HfK Bremen'] },
    // Hamburg
    { name: 'Universität Hamburg', aliases: [] },
    { name: 'Technische Universität Hamburg', aliases: ['TUHH'] },
    { name: 'HafenCity Universität Hamburg', aliases: ['HCU Hamburg'] },
    { name: 'Bucerius Law School', aliases: [] },
    { name: 'Kühne Logistics University', aliases: ['KLU Hamburg'] },
    // Hessen
    { name: 'Justus-Liebig-Universität Gießen', aliases: ['Uni Gießen'] },
    { name: 'Philipps-Universität Marburg', aliases: ['Uni Marburg'] },
    { name: 'Technische Universität Darmstadt', aliases: ['TU Darmstadt'] },
    { name: 'Universität Kassel', aliases: [] },
    { name: 'Hochschule Geisenheim', aliases: [] },
    { name: 'EBS Universität für Wirtschaft und Recht', aliases: ['EBS Oestrich-Winkel'] },
    // Mecklenburg-Vorpommern
    { name: 'Universität Rostock', aliases: [] },
    { name: 'Universität Greifswald', aliases: [] },
    { name: 'Hochschule Stralsund', aliases: [] },
    { name: 'Hochschule Wismar', aliases: [] },
    { name: 'Hochschule Neubrandenburg', aliases: [] },
    // Niedersachsen
    { name: 'Georg-August-Universität Göttingen', aliases: ['Uni Göttingen'] },
    { name: 'Leibniz Universität Hannover', aliases: ['Uni Hannover'] },
    { name: 'Technische Universität Braunschweig', aliases: ['TU Braunschweig'] },
    { name: 'Carl von Ossietzky Universität Oldenburg', aliases: ['Uni Oldenburg'] },
    { name: 'Universität Osnabrück', aliases: [] },
    { name: 'Universität Hildesheim', aliases: [] },
    { name: 'Universität Vechta', aliases: [] },
    { name: 'Leuphana Universität Lüneburg', aliases: ['Uni Lüneburg'] },
    { name: 'Technische Universität Clausthal', aliases: [] },
    { name: 'Hochschule Osnabrück', aliases: [] },
    { name: 'Hochschule Emden/Leer', aliases: [] },
    { name: 'HAWK Hochschule Hildesheim/Holzminden/Göttingen', aliases: ['HAWK'] },
    { name: 'Jade Hochschule', aliases: ['Jade Hochschule Wilhelmshaven'] },
    { name: 'PFH Private Hochschule Göttingen', aliases: [] },
    // Nordrhein-Westfalen
    { name: 'Universität Bonn', aliases: [] },
    { name: 'Universität zu Köln', aliases: ['Uni Köln'] },
    { name: 'Universität Münster', aliases: ['WWU Münster'] },
    { name: 'Ruhr-Universität Bochum', aliases: ['RUB'] },
    { name: 'Universität Duisburg-Essen', aliases: [] },
    { name: 'Universität Bielefeld', aliases: [] },
    { name: 'Universität Paderborn', aliases: [] },
    { name: 'Universität Siegen', aliases: [] },
    { name: 'Bergische Universität Wuppertal', aliases: ['Uni Wuppertal'] },
    { name: 'Technische Universität Dortmund', aliases: ['TU Dortmund'] },
    { name: 'Deutsche Sporthochschule Köln', aliases: [] },
    { name: 'FernUniversität in Hagen', aliases: ['FernUni Hagen'] },
    { name: 'Hochschule Ruhr West', aliases: ['HRW'] },
    { name: 'Westfälische Hochschule', aliases: ['Gelsenkirchen Bocholt Recklinghausen'] },
    { name: 'Hochschule Hamm-Lippstadt', aliases: ['HSHL'] },
    { name: 'Technische Hochschule Ostwestfalen-Lippe', aliases: ['TH OWL', 'Hochschule Lemgo'] },
    { name: 'Fachhochschule Südwestfalen', aliases: ['Iserlohn Hagen Meschede Soest'] },
    { name: 'Hochschule für Gesundheit Bochum', aliases: ['hsg Bochum'] },
    { name: 'Hochschule Rhein-Waal', aliases: ['Kleve Kamp-Lintfort'] },
    { name: 'Folkwang Universität der Künste', aliases: ['Folkwang Essen'] },
    { name: 'Kunstakademie Düsseldorf', aliases: [] },
    { name: 'Robert Schumann Hochschule Düsseldorf', aliases: [] },
    // Rheinland-Pfalz
    { name: 'Universität Trier', aliases: [] },
    { name: 'Universität Koblenz', aliases: [] },
    { name: 'Rheinland-Pfälzische Technische Universität Kaiserslautern-Landau', aliases: ['RPTU', 'TU Kaiserslautern'] },
    // Saarland
    { name: 'Universität des Saarlandes', aliases: ['Uni Saarland'] },
    { name: 'Hochschule für Technik und Wirtschaft des Saarlandes', aliases: ['htw saar'] },
    // Sachsen
    { name: 'Technische Universität Dresden', aliases: ['TU Dresden'] },
    { name: 'Universität Leipzig', aliases: [] },
    { name: 'Technische Universität Chemnitz', aliases: ['TU Chemnitz'] },
    { name: 'Technische Universität Bergakademie Freiberg', aliases: [] },
    { name: 'Hochschule Mittweida', aliases: [] },
    { name: 'Hochschule Zittau/Görlitz', aliases: [] },
    { name: 'Hochschule für Technik, Wirtschaft und Kultur Leipzig', aliases: ['HTWK Leipzig'] },
    { name: 'Hochschule für Grafik und Buchkunst Leipzig', aliases: ['HGB Leipzig'] },
    { name: 'Hochschule für Musik und Theater Leipzig', aliases: [] },
    // Sachsen-Anhalt
    { name: 'Martin-Luther-Universität Halle-Wittenberg', aliases: ['Uni Halle'] },
    { name: 'Otto-von-Guericke-Universität Magdeburg', aliases: ['Uni Magdeburg'] },
    { name: 'Hochschule Magdeburg-Stendal', aliases: [] },
    { name: 'Burg Giebichenstein Kunsthochschule Halle', aliases: [] },
    // Schleswig-Holstein
    { name: 'Christian-Albrechts-Universität zu Kiel', aliases: ['Uni Kiel', 'CAU Kiel'] },
    { name: 'Universität zu Lübeck', aliases: [] },
    { name: 'Universität Flensburg', aliases: [] },
    { name: 'Hochschule Kiel', aliases: ['FH Kiel'] },
    { name: 'Hochschule Flensburg', aliases: [] },
    { name: 'Fachhochschule Westküste', aliases: ['FH Westküste Heide'] },
    { name: 'Muthesius Kunsthochschule Kiel', aliases: [] },
    // Thüringen
    { name: 'Friedrich-Schiller-Universität Jena', aliases: ['Uni Jena'] },
    { name: 'Bauhaus-Universität Weimar', aliases: [] },
    { name: 'Technische Universität Ilmenau', aliases: ['TU Ilmenau'] },
    { name: 'Universität Erfurt', aliases: [] },
    { name: 'Hochschule Schmalkalden', aliases: [] },
    { name: 'Ernst-Abbe-Hochschule Jena', aliases: ['EAH Jena'] },
    { name: 'Hochschule Nordhausen', aliases: [] },
    { name: 'Fachhochschule Erfurt', aliases: [] }
];
function kfNormalizeHsName(s) { return (s || "").toLowerCase().trim().replace(/\s+/g, " "); }
function kfFindHochschulenGroup(input) {
  var q = kfNormalizeHsName(input);
  if (!q) { return null; }
  for (var i = 0; i < window.KF_HOCHSCHULEN.length; i++) {
    var h = window.KF_HOCHSCHULEN[i];
    var candidates = [h.name].concat(h.aliases || []);
    for (var j = 0; j < candidates.length; j++) {
      if (kfNormalizeHsName(candidates[j]) === q) { return h; }
    }
  }
  return null;
}
window.KFHochschulen = { list: window.KF_HOCHSCHULEN, normalize: kfNormalizeHsName, findGroup: kfFindHochschulenGroup };

// Turns a chapter's raw subchapters text ("1.1 Aufbau der Vorlesung\n1.1.1
// Foliensatz\n1.2 Klausuraufbau") into a nested outline tree, purely from the
// dot-depth of each line's leading number -- "1.1" is depth 1, "1.1.1" is
// depth 2, and so on. No DB access, so this works anywhere kf-supabase.js is
// loaded (creator wizard, reviewer dashboard, learner view) regardless of
// session. chapters.subchapters itself stays a plain text column -- the tree
// is always re-derived from it, so existing courses (all flat "X.Y" lines
// today) parse into exactly the same flat structure they already render as.
function parseOutline(rawText) {
  var lines = (rawText || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  var root = [];
  var stack = []; // [{ depth, node }]
  lines.forEach(function (line) {
    var m = line.match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
    var number, title, depth;
    if (m) {
      number = m[1];
      title = m[2];
      depth = number.split(".").length - 1;
    } else {
      // Free-form line without "X.Y" numbering (older content, or a creator
      // who never used numbering) -- stays depth 0, same as today's flat
      // behavior.
      number = null;
      title = line;
      depth = 0;
    }
    var node = { number: number, title: title, depth: depth, path: number || title, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= depth) { stack.pop(); }
    if (stack.length) { stack[stack.length - 1].node.children.push(node); }
    else { root.push(node); }
    stack.push({ depth: depth, node: node });
  });
  return root;
}
function findOutlineNode(tree, path) {
  for (var i = 0; i < tree.length; i++) {
    if (tree[i].path === path) { return tree[i]; }
    var found = findOutlineNode(tree[i].children, path);
    if (found) { return found; }
  }
  return null;
}
// Every reader of stored zusammenfassung content (chapter_content.content for
// type='zusammenfassung') needs to go through this before touching .subs:
// content saved before this feature shipped -- and any live/published course
// whose creator hasn't reopened the wizard since -- still has subs as a flat
// array indexed by position among the chapter's (always depth-1, pre-nesting)
// top-level subchapters. Once already path-keyed, it's passed through as-is.
function normalizeOutlineSubs(subsRaw, tree) {
  if (!subsRaw) { return {}; }
  if (!Array.isArray(subsRaw)) { return subsRaw; }
  var out = {};
  tree.forEach(function (node, i) {
    if (subsRaw[i] !== undefined) { out[node.path] = subsRaw[i]; }
  });
  return out;
}
window.KFOutline = { parse: parseOutline, findNode: findOutlineNode, normalizeSubs: normalizeOutlineSubs };

// Same idea as KF_BAUSTEIN_LABELS, but for the label of a single entry within
// a baustein (one subchapter, one flashcard, one exercise, ...) -- both
// Pruef-Dashboard.html (per-item review UI) and app.html (reviewer-feedback
// jump links) need to turn a sub_key back into the same human label, so it
// lives here once instead of as two copies that can drift apart.
window.KFLabels = {
  bausteinLabel: function (type) { return window.KF_BAUSTEIN_LABELS[type] || type; },
  // content = the baustein's content object (chapterContent.zusammenfassung,
  // chapterContent.karteikarten, courseContent.altklausuren, ...). The 4th arg
  // is only used for zusammenfassung, where sub_key is now a path string like
  // "1.1.1" (see KFOutline.parse) rather than a flat index -- it must be the
  // chapter's raw subchapters text so the matching outline node's own title
  // can be looked up, since a path alone doesn't carry its title.
  subLabel: function (type, subKey, content, rawSubchaptersText) {
    content = content || {};
    var i = parseInt(subKey, 10);
    if (type === "zusammenfassung") {
      if (subKey === "merke") return "Merke-Box";
      if (subKey === "tipps") return "Tipps für die Klausur";
      var tree = parseOutline(rawSubchaptersText || "");
      var node = findOutlineNode(tree, subKey);
      return node ? (node.number ? node.number + " " + node.title : node.title) : subKey;
    }
    if (type === "karteikarten") {
      return "Karte " + (i + 1);
    }
    if (type === "uebungen") {
      var ueb = ((content.items || [])[i]) || {};
      return "Aufgabe " + (i + 1) + " (" + (ueb.themenKuerzel || "") + (ueb.schwierigkeit ? ", " + ueb.schwierigkeit : "") + ")";
    }
    if (type === "altklausuren") {
      var alt = ((content.items || [])[i]) || {};
      return (alt.semester || "") + " " + (alt.jahr || "") + " · " + (alt.aufgabennummer || "") + " · " + (alt.thema || "");
    }
    if (type === "tutorien") {
      var tut = ((content.items || [])[i]) || {};
      return tut.blatt || "Tutoriumsblatt";
    }
    if (type === "zusatz") {
      var mod = ((content.modules || [])[i]) || {};
      return (mod.art || "") + (mod.titel ? " — " + mod.titel : "");
    }
    if (type === "lernplan") {
      var lp = ((content.items || [])[i]) || {};
      return (lp.tag || "") + (lp.dauer ? " · " + lp.dauer : "");
    }
    return subKey;
  }
};

// Zusammenfassung-Textfelder erlauben eine einfache [table]...[/table]-Pipe-
// Syntax für kleine Tabellen (z. B. Konjugationstabellen), damit Creator die
// nicht mehr als Screenshot einfügen müssen -- der gespeicherte Wert bleibt
// reiner Text (kompatibel mit Diff, Suche, Migration), wird aber überall, wo
// er als HTML angezeigt wird, als <table> gerendert. Zentral hier abgelegt
// (wie KFOutline/KFLabels), damit Wizard, Prüf-Dashboard und Lernenden-
// Ansicht exakt dieselbe Erkennung/Darstellung verwenden, statt drei Kopien
// zu pflegen, die auseinanderlaufen können. Bewusst mit expliziten
// [table]/[/table]-Markern statt freiem Markdown-Pipe-Format, damit ein
// zufälliges "|" in normalem Fließtext nie versehentlich als Tabelle erkannt
// wird.
function escTableText(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function parseTableRows(tableText) {
  return String(tableText || "").replace(/^\r?\n/, "").replace(/\r?\n$/, "").split(/\r?\n/)
    .map(function (r) { return r.trim(); })
    .filter(function (r) { return r.length > 0; })
    .map(function (r) { return r.split("|").map(function (c) { return c.trim(); }); });
}
function renderTableBlock(tableText) {
  var rows = parseTableRows(tableText);
  if (!rows.length) { return ""; }
  var head = rows[0], body = rows.slice(1);
  return '<div class="kf-inline-table-wrap"><table class="kf-inline-table">' +
    "<thead><tr>" + head.map(function (c) { return "<th>" + escTableText(c) + "</th>"; }).join("") + "</tr></thead>" +
    "<tbody>" + body.map(function (r) {
      return "<tr>" + r.map(function (c) { return "<td>" + escTableText(c) + "</td>"; }).join("") + "</tr>";
    }).join("") + "</tbody></table></div>";
}
function findTableBlocks(raw) {
  // Liefert [{start, end, inner, rows}] mit Zeichen-Offsets des KOMPLETTEN
  // "[table]...[/table]"-Blocks (Marker inklusive) im String -- damit ein
  // gefundener Block beim Bearbeiten exakt an seiner Stelle ersetzt werden
  // kann, ohne den Rest des Textfelds anzufassen.
  var re = /\[table\]([\s\S]*?)\[\/table\]/g;
  var out = [];
  var str = String(raw || "");
  var m;
  while ((m = re.exec(str))) {
    out.push({ start: m.index, end: m.index + m[0].length, inner: m[1], rows: parseTableRows(m[1]) });
  }
  return out;
}
function splitTextAndTableBlocks(raw) {
  // Liefert die Segmente in Dokumentreihenfolge als {type:'text'|'table',
  // value} -- genutzt vom Wort-Diff, damit nur die Fließtext-Segmente
  // wortweise verglichen werden und Tabellenblöcke separat (komplett, nicht
  // wortweise) behandelt werden.
  var blocks = findTableBlocks(raw);
  var str = String(raw || "");
  var out = [];
  var last = 0;
  blocks.forEach(function (b) {
    if (b.start > last) { out.push({ type: "text", value: str.slice(last, b.start) }); }
    out.push({ type: "table", value: b.inner });
    last = b.end;
  });
  if (last < str.length) { out.push({ type: "text", value: str.slice(last) }); }
  return out;
}
function renderTextWithTables(raw) {
  // Nur noch HTML-escapen -- Zeilenumbrüche/Einrückungen kommen jetzt direkt
  // aus dem Text selbst, per white-space:pre-wrap auf .block/.kf-text-content
  // (app.html). Ein zusätzliches <br> hier würde sonst zu doppelten
  // Zeilenumbrüchen führen (einmal durch das echte \n, einmal durch <br>).
  var parts = String(raw || "").split(/\[table\]([\s\S]*?)\[\/table\]/);
  return parts.map(function (part, i) {
    if (i % 2 === 1) { return renderTableBlock(part); }
    return escTableText(part);
  }).join("");
}
window.KFTables = {
  render: renderTextWithTables,
  renderBlock: renderTableBlock,
  hasTable: function (raw) { return /\[table\][\s\S]*?\[\/table\]/.test(String(raw || "")); },
  findBlocks: findTableBlocks,
  splitTextAndTableBlocks: splitTextAndTableBlocks,
  parseRows: parseTableRows,
  serialize: function (grid) {
    return "[table]\n" + (grid || []).map(function (row) { return row.join(" | "); }).join("\n") + "\n[/table]";
  }
};

async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) return null;
  return data;
}

// ---------------------------------------------------------------------------
// KFAuth
// ---------------------------------------------------------------------------
window.KFAuth = (function () {
  var watcherStarted = false;
  var onForcedLogout = null;

  // If the project requires email confirmation, signUp succeeds but returns
  // no session (data.session is null) until the user clicks the confirmation
  // link — the caller needs to tell those two cases apart.
  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email: email, password: password });
    if (error) throw error;
    if (data.session && data.user) {
      await claimDeviceSession(data.user.id);
    }
    return { needsEmailConfirmation: !data.session };
  }

  // Google's redirect is a full page reload, so there's no single promise
  // chain to hang the device-session claim off like signIn/signUp have.
  // (Tried an onAuthStateChange('SIGNED_IN') listener for this instead --
  // that event also refires on a plain reload with an already-persisted
  // session, not just on a genuinely new login, which raced the claim
  // against the consistency check on every page load and caused a
  // self-inflicted "logged in elsewhere" logout.) A one-time flag set right
  // before redirecting, and consumed once on the way back in, avoids that.
  async function signInWithGoogle() {
    localStorage.setItem(OAUTH_CLAIM_PENDING_KEY, "1");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) { localStorage.removeItem(OAUTH_CLAIM_PENDING_KEY); throw error; }
  }

  async function claimPendingOAuthSession() {
    if (localStorage.getItem(OAUTH_CLAIM_PENDING_KEY) !== "1") return;
    localStorage.removeItem(OAUTH_CLAIM_PENDING_KEY);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await claimDeviceSession(user.id);
    if (typeof window.showView === "function") { window.showView("view-my-courses"); }
  }

  // Claiming a new device token on every login, and comparing it back against
  // the server value from every open tab, is the whole "Ein-Geräte-Login"
  // enforcement — logging in elsewhere overwrites the row and every other
  // tab notices on its next check and signs itself out.
  async function claimDeviceSession(userId) {
    var token = crypto.randomUUID();
    const { error } = await supabase.from("profiles").update({ active_session_token: token }).eq("id", userId);
    if (error) throw error;
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
    // Sicherheits-Audit 06.08.2026, Punkt 2: die active_session_token-Spalte
    // allein war nur eine weiche Sperre -- custom_access_token_hook() stempelt
    // bei JEDEM Token-Mint (auch beim stillen Auto-Refresh, nicht nur beim
    // Login) den AKTUELLEN DB-Wert in den Claim. Ein verdrängtes Gerät wurde
    // dadurch beim nächsten automatischen Refresh (supabase-js macht das von
    // selbst, binnen ~1h) unbemerkt wieder "gültig", ganz ohne aktiven
    // Reclaim. signOut({scope:'others'}) ist der echte, serverseitige Fix:
    // GoTrue widerruft damit sofort alle ANDEREN Refresh-Tokens dieses
    // Nutzers (kein service_role/Admin-API nötig, das ist ein regulärer
    // Client-Aufruf) -- ein verdrängtes Gerät kann sich danach gar nicht mehr
    // stillschweigend erneuern, sondern muss sich echt neu einloggen.
    const { error: soErr } = await supabase.auth.signOut({ scope: "others" });
    if (soErr) { console.error("signOut({scope:'others'}) failed:", soErr); }
    // The access token this very login just received was minted (by the
    // custom access token hook) from whatever active_session_token was on
    // file BEFORE the update above -- i.e. it still carries the previous
    // device's value, not the one just claimed. Force a remint so this
    // session's own next request already carries the correct claim,
    // otherwise a normal fresh login would immediately fail its own
    // session-validity check.
    await supabase.auth.refreshSession();
    return token;
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (error) throw error;
    await claimDeviceSession(data.user.id);
    return getSession();
  }

  async function signOut() {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    await supabase.auth.signOut();
  }

  async function getSession() {
    const profile = await getMyProfile();
    if (!profile) return null;
    return {
      id: profile.id,
      email: profile.email,
      isReviewer: profile.is_reviewer || profile.is_admin,
      isCreator: profile.is_creator,
      isAdmin: profile.is_admin
    };
  }

  // Flips is_creator on the moment the creator flow is entered (not at
  // signup, and not at course creation) -- an account can be learner and
  // creator at the same time, so this never touches any other field.
  async function becomeCreator() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ is_creator: true }).eq("id", user.id);
    if (error) throw error;
  }

  function setForcedLogoutHandler(fn) {
    onForcedLogout = fn;
  }

  async function checkDeviceSession() {
    var local = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!local) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from("profiles").select("active_session_token").eq("id", user.id).single();
    if (error) return;
    if (data.active_session_token !== local) {
      await signOut();
      if (typeof onForcedLogout === "function") onForcedLogout();
    }
  }

  function startSessionWatcher() {
    if (watcherStarted) return;
    watcherStarted = true;
    checkDeviceSession();
    setInterval(checkDeviceSession, 30000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") checkDeviceSession();
    });
  }

  return {
    signUp: signUp,
    signIn: signIn,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getSession: getSession,
    becomeCreator: becomeCreator,
    startSessionWatcher: startSessionWatcher,
    setForcedLogoutHandler: setForcedLogoutHandler,
    claimPendingOAuthSession: claimPendingOAuthSession
  };
})();

// ---------------------------------------------------------------------------
// KFStore — chapter submissions / review comments
// ---------------------------------------------------------------------------
window.KFStore = (function () {
  var CHAPTER_SELECT = "id, position, title, subchapters, status, is_free_preview, created_at, updated_at, course_id, current_round," +
    " course:courses ( title, professor, creator:profiles ( email ), hochschule:hochschulen ( name ) )," +
    " chapter_comments ( author, role, text, content_type, sub_key, round_no, created_at )";

  // chapter_comments.role is stored as 'pruefer' in the DB; the existing UI
  // code (Pruef-Dashboard.html, app.html) checks for the string 'reviewer',
  // so that's translated back here to avoid touching every render call site.
  function mapChapterRow(row) {
    var comments = (row.chapter_comments || []).slice().sort(function (a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    }).map(function (c) {
      return { author: c.author, role: c.role === "pruefer" ? "reviewer" : c.role, text: c.text, date: c.created_at, contentType: c.content_type, subKey: c.sub_key, roundNo: c.round_no };
    });
    return {
      id: row.id,
      courseId: row.course_id,
      courseTitle: row.course ? row.course.title : "",
      courseProf: row.course ? row.course.professor : "",
      courseCreatorEmail: row.course && row.course.creator ? row.course.creator.email : "",
      hochschule: row.course && row.course.hochschule ? row.course.hochschule.name : "",
      chapterIndex: row.position,
      chapterTitle: row.title,
      subchapters: row.subchapters || "",
      status: row.status,
      isFreePreview: !!row.is_free_preview,
      comments: comments,
      currentRound: row.current_round,
      submittedAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // A chapter in 'offen' was never submitted -- the wizard's autosave creates
  // these rows eagerly, but there is nothing for a reviewer to look at yet
  // (approve/reject would just fail server-side), so they're excluded even
  // from the "Alle" filter.
  async function getSubmissions() {
    const { data, error } = await supabase.from("chapters").select(CHAPTER_SELECT).neq("status", "offen");
    if (error) { console.error(error); return []; }
    return data.map(mapChapterRow);
  }

  async function getForCourse(courseId) {
    const { data, error } = await supabase.from("chapters").select(CHAPTER_SELECT).eq("course_id", courseId);
    if (error) { console.error(error); return []; }
    return data.map(mapChapterRow);
  }

  async function getOne(id) {
    const { data, error } = await supabase.from("chapters").select(CHAPTER_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapChapterRow(data);
  }

  // Creator reicht Kapitel ein (neu oder nach Überarbeitung)
  async function submit(sub) {
    const { data: existing } = await supabase.from("chapters").select("id, status")
      .eq("course_id", sub.courseId).eq("position", sub.chapterIndex).maybeSingle();

    const { data: chapter, error } = await supabase.from("chapters")
      .upsert(
        { course_id: sub.courseId, position: sub.chapterIndex, title: sub.chapterTitle, status: "pruefung" },
        { onConflict: "course_id,position" }
      ).select("id").single();
    if (error) throw error;

    // Chapter rows now get created early by syncCourseContent() (on every
    // "Speichern", before any submission), so "the row already existed" no
    // longer means "this was submitted before" -- only comment when it's an
    // actual resubmission after review feedback.
    var wasResubmission = existing && (existing.status === "ueberarbeitung" || existing.status === "freigegeben");
    if (wasResubmission) {
      await supabase.from("chapter_comments").insert({
        chapter_id: chapter.id,
        author: sub.courseProf || "Creator",
        role: "creator",
        text: "Kapitel überarbeitet und erneut eingereicht."
      });
    }
    return true;
  }

  // Converts { key: text } into the [{content_type, sub_key, text}, ...]
  // array reviewer_decide_chapter() expects -- key is either "type"
  // (baustein-wide) or "type::subKey" (one entry within that baustein, e.g.
  // one subchapter or one flashcard) -- see Pruef-Dashboard.html's
  // collectNotesByKey().
  function buildNotesPayload(notesByKey) {
    return Object.keys(notesByKey || {})
      .filter(function (key) { return notesByKey[key] && notesByKey[key].trim(); })
      .map(function (key) {
        var parts = key.split("::");
        var type = parts[0], subKey = parts.length > 1 ? parts[1] : null;
        return {
          text: notesByKey[key].trim(),
          content_type: type === "allgemein" ? null : type,
          sub_key: subKey
        };
      });
  }

  // Prüfer gibt frei / schickt zur Überarbeitung zurück (mit Kommentaren je
  // Baustein/Eintrag). Status-Update + Kommentare laufen als eine
  // reviewer_decide_chapter()-RPC in einer Transaktion -- schlägt der
  // Kommentar-Insert fehl, wird auch das Status-Update zurückgerollt, statt
  // (wie zuvor bei zwei getrennten Requests möglich) einen Status ohne die
  // zugehörigen Anmerkungen stehen zu lassen.
  async function approve(id, notesByKey) {
    const { error } = await supabase.rpc("reviewer_decide_chapter", {
      p_chapter_id: id, p_new_status: "freigegeben", p_notes: buildNotesPayload(notesByKey)
    });
    if (error) throw error;
  }

  async function requestChanges(id, notesByKey) {
    const { error } = await supabase.rpc("reviewer_decide_chapter", {
      p_chapter_id: id, p_new_status: "ueberarbeitung", p_notes: buildNotesPayload(notesByKey)
    });
    if (error) throw error;
  }

  // Creator markiert ein Kapitel als kostenlose Vorschau (oder nimmt das zurück)
  async function setFreePreview(chapterId, value) {
    const { error } = await supabase.from("chapters").update({ is_free_preview: !!value }).eq("id", chapterId);
    if (error) throw error;
  }

  // Findet zu einem eingegebenen Hochschul-Namen die bereits existierende
  // hochschulen-Zeile -- auch wenn der Name nur ein Alias ist oder sich in
  // Groß-/Kleinschreibung bzw. Leerzeichen unterscheidet -- statt sie (Bug:
  // "Phantom-Hochschulen" durch Tippfehler/Aliase) doppelt anzulegen. Wichtig:
  // die im Alias-Katalog (KF_HOCHSCHULEN) als "kanonisch" hinterlegte Langform
  // ist NICHT zwingend der tatsächliche name-Wert in der DB (Seed-Daten haben
  // z. B. name='FH Frankfurt', die Langform steht nur im subtitle) -- deshalb
  // wird zuerst gegen ALLE Kandidaten der Alias-Gruppe (kanonischer Name +
  // alle Aliase) nach einer bereits existierenden Zeile gesucht, und nur wenn
  // keine existiert, mit dem kanonischen Namen neu angelegt.
  // requireKnownAlias=true (nur beim JSON-Import, der ohne das Autocomplete
  // der Wizard-Eingabe läuft) bricht bei einem unbekannten Namen hart ab,
  // statt stillschweigend eine neue Hochschule anzulegen.
  async function resolveOrCreateHochschule(inputName, requireKnownAlias) {
    var group = window.KFHochschulen ? window.KFHochschulen.findGroup(inputName) : null;
    if (requireKnownAlias && !group) {
      throw new Error("Unbekannte Hochschule \"" + (inputName || "") + "\" in der Sicherungsdatei -- Import abgebrochen, um keine Phantom-Hochschule anzulegen.");
    }
    var candidateNames = group ? [group.name].concat(group.aliases || []) : [String(inputName || "").trim()];
    var normalize = (window.KFHochschulen && window.KFHochschulen.normalize) || function (s) { return String(s || "").toLowerCase().trim(); };
    var normalizedCandidates = candidateNames.map(normalize);
    const { data: allHochschulen, error: listErr } = await supabase.from("hochschulen").select("id, name");
    if (listErr) throw listErr;
    var existing = (allHochschulen || []).find(function (h) { return normalizedCandidates.indexOf(normalize(h.name)) !== -1; });
    if (existing) { return existing; }
    // status='vorschlag' statt 'aktiv' (Sicherheits-Audit 06.08.2026, Punkt 3):
    // ein Creator legt eine wirklich neue Hochschule nur noch als Vorschlag an
    // -- unsichtbar in der öffentlichen Hochschulauswahl (getHochschulen()
    // filtert 'vorschlag' raus), bis ein Reviewer sie im Prüf-Dashboard
    // freigibt. Die RLS-Policy "hochschulen: insert" erlaubt einem
    // Nicht-Reviewer ohnehin nur genau diesen Status.
    var nameToInsert = group ? group.name : String(inputName || "").trim();
    const { data: inserted, error: hErr } = await supabase.from("hochschulen")
      .insert({ name: nameToInsert, status: "vorschlag" }).select("id, name").single();
    if (hErr) throw hErr;
    return inserted;
  }

  // Holt den eigenen Entwurfskurs (per Fach-Titel) oder legt ihn an — ersetzt
  // die frühere Slug-ID aus courseIdentity(), die nur lokal existierte.
  async function getOrCreateDraftCourse(meta) {
    var hochschuleRow = await resolveOrCreateHochschule(meta.hochschule, false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nicht eingeloggt.");

    var courseRow;
    if (meta.existingCourseId) {
      // Once a course id has already been resolved (this session, or
      // restored from a saved draft/loaded course), any further edit to
      // Fach/Hochschule/etc. is a rename of that SAME row -- upserting by
      // title again would silently spawn a second, orphaned course row
      // instead (the bug that left abandoned "in_arbeit" phantom courses
      // behind after a title change).
      //
      // No .single() here: if the referenced row no longer exists (e.g. the
      // course was deleted, in another tab or via "Kurs löschen"), .update()
      // just matches zero rows -- not an error -- but .single() used to throw
      // on that ("Cannot coerce the result to a single JSON object"),
      // crashing saveDraft() outright. Falling through to the normal
      // create/find-by-title path below is the correct recovery: the stale
      // id is simply discarded and a fresh course row is created instead.
      const { data: updated, error: uErr } = await supabase.from("courses")
        .update({
          hochschule_id: hochschuleRow.id, title: meta.fach,
          professor: meta.prof || null, semester: meta.semester || null
        })
        .eq("id", meta.existingCourseId).eq("creator_id", user.id)
        .select("id");
      if (uErr) throw uErr;
      if (updated && updated.length) { courseRow = updated[0]; }
    }
    if (!courseRow) {
      // Atomic upsert (not select-then-insert): concurrent saves used to race
      // and create duplicate course rows for the same creator+title. status is
      // deliberately omitted so an existing course's status is never reset.
      const { data: inserted, error: cErr } = await supabase.from("courses")
        .upsert(
          {
            hochschule_id: hochschuleRow.id, creator_id: user.id, title: meta.fach,
            professor: meta.prof || null, semester: meta.semester || null
          },
          { onConflict: "creator_id,title" }
        ).select("id").single();
      if (cErr) throw cErr;
      courseRow = inserted;
    }

    if (meta.studiengang) {
      var sgRow = (await supabase.from("studiengaenge").select("id").eq("name", meta.studiengang).maybeSingle()).data;
      if (!sgRow) {
        // status='vorschlag' -- selbe Begründung wie bei resolveOrCreateHochschule()
        // oben (Sicherheits-Audit 06.08.2026, Punkt 3).
        const { data: insertedSg, error: sgErr } = await supabase.from("studiengaenge")
          .insert({ name: meta.studiengang, status: "vorschlag" }).select("id").single();
        if (sgErr) throw sgErr;
        sgRow = insertedSg;
      }
      await supabase.from("course_studiengaenge")
        .upsert(
          { course_id: courseRow.id, studiengang_id: sgRow.id },
          { onConflict: "course_id,studiengang_id", ignoreDuplicates: true }
        );
    }

    return courseRow.id;
  }

  async function saveZusammenfassung(chapterId, data) {
    const { error } = await supabase.from("chapter_content")
      .upsert(
        { chapter_id: chapterId, type: "zusammenfassung", content: data, updated_at: new Date().toISOString() },
        { onConflict: "chapter_id,type" }
      );
    if (error) throw error;
  }

  async function getZusammenfassung(chapterId) {
    const { data, error } = await supabase.from("chapter_content").select("content")
      .eq("chapter_id", chapterId).eq("type", "zusammenfassung").maybeSingle();
    if (error || !data) return null;
    return data.content;
  }

  // Builds the single JSON payload the sync_course_content() Postgres
  // function expects, shared by the normal (supabase-js) and keepalive (raw
  // fetch) sync paths below -- chapterTitles: resolved chapter titles in
  // order (index = position). state: the object collectState() already
  // builds in app.html.
  function buildSyncPayload(courseId, chapterTitles, state) {
    var cards = state.cards || [];
    var uebungen = state.uebungen || [];
    var zfData = state.zusammenfassungData || {};

    var chapters = chapterTitles.map(function (title, i) {
      var chapterCards = cards.filter(function (r) { return r[2] === title; })
        .map(function (r) { return { frage: r[0] || "", antwort: r[1] || "", frageBild: r[3] || null, antwortBild: r[4] || null }; });
      var chapterUebungen = uebungen.filter(function (r) { return r[2] === title; })
        .map(function (r) { return { themenKuerzel: r[0] || "", schwierigkeit: r[1] || "", aufgabe: r[3] || "", loesung: r[4] || "" }; });
      return {
        position: i,
        title: title,
        subchapters: (state.chapters[i] && state.chapters[i][1]) || null,
        zusammenfassung: zfData[i] || {},
        cards: chapterCards,
        uebungen: chapterUebungen
      };
    });

    var altklausuren = (state.altklausuren || []).map(function (r) {
      return { semester: r[0] || "", jahr: r[1] || "", aufgabennummer: r[2] || "", thema: r[3] || "", loesung: r[4] || "" };
    });
    var tutorien = (state.tutorien || []).map(function (r) {
      return { blatt: r[0] || "", loesung: r[1] || "" };
    });
    var lernplan = (state.lernplan || []).map(function (r) {
      return { tag: r[0] || "", aufgabe: r[1] || "", bausteinRef: r[2] || "", dauer: r[3] || "" };
    });

    return {
      p_course_id: courseId,
      p_chapters: chapters,
      p_course_content: {
        altklausuren: { items: altklausuren },
        tutorien: { items: tutorien },
        zusatz: state.zusatz || {},
        lernplan: { items: lernplan }
      }
    };
  }

  // Full sync of everything the wizard collects, called from saveDraft().
  // One request (a Postgres function doing every upsert/delete in a single
  // transaction) instead of the 5+ sequential requests this used to issue --
  // that used to be exactly what made the close-time save unreliable (see
  // keepaliveSyncCourseContent below).
  async function syncCourseContent(courseId, chapterTitles, state) {
    if (!chapterTitles.length) return;
    const { error } = await supabase.rpc("sync_course_content", buildSyncPayload(courseId, chapterTitles, state));
    if (error) throw error;
  }

  // beforeunload-only: browsers abort any normal in-flight request once the
  // tab actually closes, except fetch(..., {keepalive:true}) (sendBeacon
  // can't carry the Authorization header RLS needs, so it can't authenticate
  // as the user). supabase-js doesn't expose a keepalive option on its own
  // client, so this issues the single sync_course_content RPC call by hand.
  async function keepaliveSyncCourseContent(courseId, chapterTitles, state) {
    if (!courseId || !chapterTitles.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      fetch(window.KF_SUPABASE_URL + "/rest/v1/rpc/sync_course_content", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "apikey": window.KF_SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + session.access_token
        },
        body: JSON.stringify(buildSyncPayload(courseId, chapterTitles, state))
      });
    } catch (e) { /* best effort -- localStorage already has the same state */ }
  }

  // Rebuilds an object in exactly the shape restoreState() in app.html
  // already expects, so loading a course from the DB (e.g. via ?course=)
  // can reuse that function unchanged.
  async function loadCourseState(courseId) {
    const { data: course, error: courseErr } = await supabase.from("courses")
      .select("title, professor, semester, status, hochschule:hochschulen(name), course_studiengaenge(studiengaenge(name))")
      .eq("id", courseId).single();
    if (courseErr) throw courseErr;

    const { data: chapterRows, error: chErr } = await supabase.from("chapters")
      .select("id, position, title, subchapters, status")
      .eq("course_id", courseId).order("position");
    if (chErr) throw chErr;

    const chapterIds = chapterRows.map(function (c) { return c.id; });
    const { data: contentRows, error: contentErr } = chapterIds.length
      ? await supabase.from("chapter_content").select("chapter_id, type, content").in("chapter_id", chapterIds)
      : { data: [], error: null };
    if (contentErr) throw contentErr;

    const { data: courseContentRows, error: ccErr } = await supabase.from("course_content")
      .select("type, content").eq("course_id", courseId);
    if (ccErr) throw ccErr;

    var contentByChapter = {};
    contentRows.forEach(function (row) {
      contentByChapter[row.chapter_id] = contentByChapter[row.chapter_id] || {};
      contentByChapter[row.chapter_id][row.type] = row.content;
    });
    var courseContentByType = {};
    courseContentRows.forEach(function (row) { courseContentByType[row.type] = row.content; });

    // chapters.title is stored as the full display string ("Kapitel 1 – X"),
    // matching chapterTitles()'s output which the app also uses as the
    // .rowKapitelSelect value on card/uebung rows -- keep using the full
    // string for those matches. But refilling that full string back into the
    // short "Kapitel – Titel" input would make chapterTitles() prefix it a
    // second time next render ("Kapitel 1 – Kapitel 1 – X"), so only the
    // input-field copy needs the redundant "Kapitel N – " prefix stripped.
    function stripPositionPrefix(title, position) {
      var prefix = "Kapitel " + (position + 1) + " – ";
      return title && title.indexOf(prefix) === 0 ? title.slice(prefix.length) : (title || "");
    }

    var zusammenfassungData = {};
    var cards = [];
    var uebungen = [];
    var chapterStatuses = [];
    var chapters = chapterRows.map(function (row, i) {
      var c = contentByChapter[row.id] || {};
      if (c.zusammenfassung) { zusammenfassungData[i] = c.zusammenfassung; }
      ((c.karteikarten && c.karteikarten.cards) || []).forEach(function (card) {
        cards.push([card.frage || "", card.antwort || "", row.title, card.frageBild || "", card.antwortBild || ""]);
      });
      ((c.uebungen && c.uebungen.items) || []).forEach(function (item) {
        uebungen.push([item.themenKuerzel || "", item.schwierigkeit || "", row.title, item.aufgabe || "", item.loesung || ""]);
      });
      chapterStatuses.push(row.status);
      return [stripPositionPrefix(row.title, i), row.subchapters || ""];
    });

    var altklausuren = ((courseContentByType.altklausuren && courseContentByType.altklausuren.items) || [])
      .map(function (a) { return [a.semester || "", a.jahr || "", a.aufgabennummer || "", a.thema || "", a.loesung || ""]; });
    var tutorien = ((courseContentByType.tutorien && courseContentByType.tutorien.items) || [])
      .map(function (t) { return [t.blatt || "", t.loesung || ""]; });
    var lernplan = ((courseContentByType.lernplan && courseContentByType.lernplan.items) || [])
      .map(function (l) { return [l.tag || "", l.aufgabe || "", l.bausteinRef || "", l.dauer || ""]; });

    return {
      hochschule: course.hochschule ? course.hochschule.name : "",
      fach: course.title,
      prof: course.professor || "",
      studiengang: (course.course_studiengaenge && course.course_studiengaenge[0] && course.course_studiengaenge[0].studiengaenge.name) || "",
      semester: course.semester || "",
      chapters: chapters,
      zusammenfassungData: zusammenfassungData,
      cards: cards,
      uebungen: uebungen,
      altklausuren: altklausuren,
      tutorien: tutorien,
      zusatz: courseContentByType.zusatz || { enabled: false, modules: [] },
      lernplan: lernplan,
      chapterStatuses: chapterStatuses,
      newsUnseen: false
    };
  }

  async function getChapterContent(chapterId) {
    const { data, error } = await supabase.from("chapter_content").select("type, content").eq("chapter_id", chapterId);
    if (error) { console.error(error); return {}; }
    var byType = {};
    data.forEach(function (row) { byType[row.type] = row.content; });
    return byType;
  }

  async function getCourseContent(courseId) {
    const { data, error } = await supabase.from("course_content").select("type, content").eq("course_id", courseId);
    if (error) { console.error(error); return {}; }
    var byType = {};
    data.forEach(function (row) { byType[row.type] = row.content; });
    return byType;
  }

  // Content as it was frozen at the START of a given review round (see the
  // chapters_x_snapshot_after_submit trigger) -- only exists for
  // zusammenfassung/karteikarten/uebungen, the three per-chapter bausteine
  // the trigger snapshots. Used by Pruef-Dashboard.html to diff the previous
  // round's version against the current one.
  async function getChapterContentSnapshot(chapterId, roundNo) {
    if (roundNo == null || roundNo < 1) return {};
    const { data, error } = await supabase.from("chapter_content_snapshots")
      .select("type, content").eq("chapter_id", chapterId).eq("round_no", roundNo);
    if (error) { console.error(error); return {}; }
    var byType = {};
    data.forEach(function (row) { byType[row.type] = row.content; });
    return byType;
  }

  async function publishCourse(courseId) {
    const { error } = await supabase.from("courses").update({ status: "live" }).eq("id", courseId);
    if (error) throw error;
  }

  // Karteikarten-Bilder: Screenshots, die per Strg+V direkt in Frage/Antwort
  // eingefügt werden. Bucket ist privat -- Zugriff läuft ausschließlich über
  // zeitlich begrenzte Signed URLs, RLS auf storage.objects prüft dabei
  // Eigentümerschaft/Kauf anhand des Pfads (<course_id>/<uuid>.<ext>).
  var CARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  var CARD_IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  async function uploadCardImage(courseId, blob) {
    if (!CARD_IMAGE_ALLOWED_TYPES.includes(blob.type)) {
      throw new Error("Nicht unterstütztes Bildformat -- bitte JPG, PNG oder WebP verwenden.");
    }
    if (blob.size > CARD_IMAGE_MAX_BYTES) {
      throw new Error("Bild ist zu groß (max. 5 MB).");
    }
    var ext = blob.type.split("/")[1];
    var path = courseId + "/" + crypto.randomUUID() + "." + ext;
    const { error } = await supabase.storage.from("card-images")
      .upload(path, blob, { contentType: blob.type });
    if (error) throw error;
    return path;
  }

  async function getCardImageUrl(path) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from("card-images").createSignedUrl(path, 3600);
    if (error) { console.error(error); return null; }
    return data.signedUrl;
  }

  async function deleteCardImage(path) {
    if (!path) return;
    await supabase.storage.from("card-images").remove([path]);
  }

  // Notennachweis (Transcript of Records): the upload happens in
  // view-creator-setup, before any course row exists yet, so the object path
  // is keyed by the uploading user's id rather than a course_id --
  // setTranscriptPath() attaches it to the course once ensureCourseId()
  // resolves one.
  var TRANSCRIPT_MAX_BYTES = 10 * 1024 * 1024;
  // key = allowed MIME type, value = the extension used for the storage
  // path -- the extension comes from this validated map, not from the
  // caller-controlled file.name, so a renamed/spoofed filename can't smuggle
  // an arbitrary extension into the object path. The bucket itself also
  // enforces file_size_limit/allowed_mime_types server-side (see
  // 20260807130000_transcript_upload_limits.sql) -- this is defense in
  // depth, not the only check.
  var TRANSCRIPT_ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  async function uploadTranscript(file) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nicht eingeloggt.");
    var ext = TRANSCRIPT_ALLOWED_TYPES[file.type];
    if (!ext) {
      throw new Error("Nicht unterstütztes Dateiformat -- bitte PDF, JPG, PNG oder WebP verwenden.");
    }
    if (file.size > TRANSCRIPT_MAX_BYTES) {
      throw new Error("Datei ist zu groß (max. 10 MB).");
    }
    await cleanupOwnOrphanedTranscripts(user.id);
    var path = user.id + "/" + crypto.randomUUID() + "." + ext;
    const { error } = await supabase.storage.from("transcripts")
      .upload(path, file, { contentType: file.type });
    if (error) throw error;
    return path;
  }

  // U3 (Konsistenz-Audit 07.08.2026): der Transcript-Upload passiert im
  // Creator-Setup, BEVOR ein Kurs existiert -- bricht der Nutzer danach ab,
  // bleibt die Datei ohne jede Referenz im Storage liegen. Kein eigener
  // Cronjob nötig: bei jedem NEUEN Upload räumt diese Funktion vorher die
  // eigenen alten, unreferenzierten Dateien des Nutzers auf (still, per
  // Best-Effort -- ein Fehler hier darf den eigentlichen Upload nicht
  // blockieren).
  async function cleanupOwnOrphanedTranscripts(userId) {
    try {
      const { data: files, error: listErr } = await supabase.storage.from("transcripts").list(userId);
      if (listErr || !files || !files.length) return;
      const { data: referenced, error: refErr } = await supabase.from("courses")
        .select("transcript_path").eq("creator_id", userId).not("transcript_path", "is", null);
      if (refErr) return;
      var referencedPaths = (referenced || []).map(function (r) { return r.transcript_path; });
      var orphaned = files
        .map(function (f) { return userId + "/" + f.name; })
        .filter(function (p) { return referencedPaths.indexOf(p) === -1; });
      if (orphaned.length) {
        await supabase.storage.from("transcripts").remove(orphaned);
      }
    } catch (e) { /* best effort -- ein fehlgeschlagener Aufraeumversuch darf den Upload nicht verhindern */ }
  }

  async function setTranscriptPath(courseId, path) {
    const { error } = await supabase.from("courses").update({ transcript_path: path }).eq("id", courseId);
    if (error) throw error;
  }

  // Reviewer-Werkzeuge fürs Notennachweis-Review -- läuft parallel zum
  // Kapitel-Workflow, blockiert also nicht das Bauen/Einreichen von Kapiteln,
  // wird aber selbst zur Voraussetzung fürs finale "live"-Gehen (siehe
  // enforce_course_status_transition in der DB).
  // transcript_path selbst kommt seit dem Sicherheits-Audit (06.08.2026,
  // Punkt 4) nicht mehr aus der Basistabelle courses -- die Spalte ist dort
  // für authenticated/anon per REVOKE gesperrt (enthält die Creator-User-UUID
  // im Pfad), lesbar nur noch über courses_public (Owner/Reviewer-Maske).
  // hochschule:hochschulen(name) bleibt ein normaler Embed auf der
  // Basistabelle -- courses_public ist eine reine Projektion ohne eigene
  // Fremdschlüssel, PostgREST könnte den Embed darüber nicht sicher auflösen.
  async function getPendingTranscripts() {
    const { data, error } = await supabase.from("courses")
      .select("id, title, professor, hochschule:hochschulen(name)")
      .eq("transcript_status", "ausstehend");
    if (error) { console.error(error); return []; }
    if (!data.length) return [];
    const { data: pathRows, error: pathErr } = await supabase.from("courses_public")
      .select("id, transcript_path").in("id", data.map(function (c) { return c.id; }));
    if (pathErr) { console.error(pathErr); return []; }
    var pathById = {};
    pathRows.forEach(function (r) { pathById[r.id] = r.transcript_path; });
    return data.map(function (c) { return Object.assign({}, c, { transcript_path: pathById[c.id] || null }); });
  }

  async function getTranscriptUrl(path) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from("transcripts").createSignedUrl(path, 3600);
    if (error) { console.error(error); return null; }
    return data.signedUrl;
  }

  async function reviewTranscript(courseId, decision) {
    const { error } = await supabase.from("courses").update({ transcript_status: decision }).eq("id", courseId);
    if (error) throw error;
  }

  // Admin-Nutzerverwaltung (admin-dashboard.html): pro Nutzer:in die eigenen
  // Kurse samt Notennachweis-Status, damit dieselbe Genehmigung wie im
  // Prüf-Dashboard (getTranscriptUrl/reviewTranscript, unverändert) auch
  // nutzerzentriert im Admin-Dashboard möglich ist -- keine neue
  // Genehmigungslogik, nur eine zweite Oberfläche auf denselben Daten.
  async function getAllUsersWithCourses() {
    // courses_public statt courses: transcript_path ist auf der Basistabelle
    // seit dem Sicherheits-Audit (06.08.2026, Punkt 4) für authenticated
    // gesperrt, courses_public gibt sie (korrekt maskiert) nur an
    // Owner/Reviewer/Admin zurück -- für den hier aufrufenden Admin also
    // unverändert wie bisher.
    const [{ data: profiles, error: pErr }, { data: courses, error: cErr }] = await Promise.all([
      supabase.from("profiles")
        .select("id, email, is_creator, is_reviewer, is_admin, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("courses_public")
        .select("id, creator_id, title, professor, transcript_path, transcript_status, status")
    ]);
    if (pErr) { console.error(pErr); return []; }
    if (cErr) { console.error(cErr); return []; }
    var coursesByCreator = {};
    (courses || []).forEach(function (c) {
      if (!c.creator_id) return;
      (coursesByCreator[c.creator_id] = coursesByCreator[c.creator_id] || []).push(c);
    });
    return (profiles || []).map(function (p) {
      return Object.assign({}, p, { courses: coursesByCreator[p.id] || [] });
    });
  }

  // Admin-Dashboard: reine Kennzahlen-Abfragen, geschützt durch die
  // "admin select all" RLS-Policies auf profiles/purchases/questions bzw.
  // die bestehende is_reviewer()-Kaskade auf courses/chapters.
  async function getAdminStats() {
    const [
      totalUsers, totalCreators,
      entwurfCount, inArbeitCount, liveCount,
      totalActivations, openQuestions, pruefungChapters
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_creator", true),
      supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "entwurf"),
      supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "in_arbeit"),
      supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "live"),
      supabase.from("purchases").select("id", { count: "exact", head: true }),
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("status", "offen"),
      supabase.from("chapters").select("id", { count: "exact", head: true }).eq("status", "pruefung")
    ]);
    return {
      totalUsers: totalUsers.count || 0,
      totalCreators: totalCreators.count || 0,
      coursesByStatus: {
        entwurf: entwurfCount.count || 0,
        in_arbeit: inArbeitCount.count || 0,
        live: liveCount.count || 0
      },
      totalActivations: totalActivations.count || 0,
      openQuestions: openQuestions.count || 0,
      pruefungChapters: pruefungChapters.count || 0
    };
  }

  async function getRecentRegistrations(limit) {
    const { data, error } = await supabase.from("profiles")
      .select("email, created_at")
      .order("created_at", { ascending: false })
      .limit(limit || 10);
    if (error) { console.error(error); return []; }
    return data;
  }

  async function getRecentCourses(limit) {
    const { data, error } = await supabase.from("courses")
      .select("id, title, professor, semester, status, created_at, creator:profiles ( email ), hochschule:hochschulen ( name )," +
        " course_studiengaenge ( studiengaenge ( name ) )")
      .order("created_at", { ascending: false })
      .limit(limit || 10);
    if (error) { console.error(error); return []; }
    return data.map(function (r) {
      return {
        id: r.id, title: r.title, status: r.status, createdAt: r.created_at,
        prof: r.professor || "", semester: r.semester || "",
        hochschule: r.hochschule ? r.hochschule.name : "",
        creatorEmail: r.creator ? r.creator.email : "",
        sg: (r.course_studiengaenge || []).map(function (x) { return x.studiengaenge.name; })
      };
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Admin-only Kurs-Sicherungsdatei (Export). Liest denselben Datenbestand
  // wie loadCourseState(), aber zusätzlich chapters.status/is_free_preview/
  // current_round und chapter_comments (loadCourseState ist bewusst
  // lernerorientiert und lässt beides weg) sowie Karteikarten-Bilder als
  // eingebettete Base64-Data-URLs statt nur als Storage-Pfad -- eine
  // Sicherungsdatei muss auch ohne Zugriff auf den ursprünglichen Storage-
  // Bucket vollständig wiederherstellbar sein. onProgress(done, total) ist
  // optional und wird nur für den (potenziell langsamen) Bild-Download
  // aufgerufen.
  async function exportCourseBackup(courseId, onProgress) {
    const { data: course, error: courseErr } = await supabase.from("courses")
      .select("title, professor, semester, status, hochschule:hochschulen(name), course_studiengaenge(studiengaenge(name))")
      .eq("id", courseId).single();
    if (courseErr) throw courseErr;

    const { data: chapterRows, error: chErr } = await supabase.from("chapters")
      .select("id, position, title, subchapters, status, is_free_preview, current_round")
      .eq("course_id", courseId).order("position");
    if (chErr) throw chErr;

    const chapterIds = chapterRows.map(function (c) { return c.id; });
    const [contentRes, commentRes, courseContentRes] = await Promise.all([
      chapterIds.length ? supabase.from("chapter_content").select("chapter_id, type, content").in("chapter_id", chapterIds) : Promise.resolve({ data: [] }),
      chapterIds.length ? supabase.from("chapter_comments").select("chapter_id, author, role, text, content_type, sub_key, round_no, created_at").in("chapter_id", chapterIds) : Promise.resolve({ data: [] }),
      supabase.from("course_content").select("type, content").eq("course_id", courseId)
    ]);
    if (contentRes.error) throw contentRes.error;
    if (commentRes.error) throw commentRes.error;
    if (courseContentRes.error) throw courseContentRes.error;

    var contentByChapter = {};
    (contentRes.data || []).forEach(function (row) {
      contentByChapter[row.chapter_id] = contentByChapter[row.chapter_id] || {};
      contentByChapter[row.chapter_id][row.type] = row.content;
    });
    var commentsByChapter = {};
    (commentRes.data || []).forEach(function (row) {
      (commentsByChapter[row.chapter_id] = commentsByChapter[row.chapter_id] || []).push(row);
    });
    var courseContentByType = {};
    (courseContentRes.data || []).forEach(function (row) { courseContentByType[row.type] = row.content; });

    var imageJobs = [];
    var chaptersOut = chapterRows.map(function (row) {
      var c = contentByChapter[row.id] || {};
      var cards = ((c.karteikarten && c.karteikarten.cards) || []).map(function (card) {
        var out = { frage: card.frage || "", antwort: card.antwort || "", frageBild: null, antwortBild: null };
        if (card.frageBild) { imageJobs.push({ path: card.frageBild, target: out, field: "frageBild" }); }
        if (card.antwortBild) { imageJobs.push({ path: card.antwortBild, target: out, field: "antwortBild" }); }
        return out;
      });
      return {
        position: row.position, title: row.title, subchapters: row.subchapters || "",
        status: row.status, isFreePreview: !!row.is_free_preview, currentRound: row.current_round,
        content: {
          zusammenfassung: c.zusammenfassung || {},
          karteikarten: cards,
          uebungen: (c.uebungen && c.uebungen.items) || []
        },
        comments: (commentsByChapter[row.id] || []).map(function (cm) {
          return { author: cm.author, role: cm.role, text: cm.text, contentType: cm.content_type, subKey: cm.sub_key, roundNo: cm.round_no, createdAt: cm.created_at };
        })
      };
    });

    for (var i = 0; i < imageJobs.length; i++) {
      var job = imageJobs[i];
      if (onProgress) { onProgress(i, imageJobs.length); }
      var url = await getCardImageUrl(job.path);
      if (url) {
        var blob = await (await fetch(url)).blob();
        job.target[job.field] = await blobToDataUrl(blob);
      }
    }
    if (onProgress) { onProgress(imageJobs.length, imageJobs.length); }

    return {
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      course: {
        title: course.title, professor: course.professor || "", semester: course.semester || "",
        hochschule: course.hochschule ? course.hochschule.name : "",
        studiengaenge: (course.course_studiengaenge || []).map(function (x) { return x.studiengaenge.name; }),
        status: course.status
      },
      chapters: chaptersOut,
      courseWideContent: {
        altklausuren: (courseContentByType.altklausuren && courseContentByType.altklausuren.items) || [],
        tutorien: (courseContentByType.tutorien && courseContentByType.tutorien.items) || [],
        zusatzmodule: courseContentByType.zusatz || { enabled: false, modules: [] },
        lernplan: (courseContentByType.lernplan && courseContentByType.lernplan.items) || []
      }
    };
  }

  // Admin-only Wiederherstellung einer Sicherungsdatei -- legt IMMER einen
  // neuen Kurs an, nie ein Überschreiben. Zwei Phasen, in dieser Reihenfolge:
  //  1. restore_course_backup() (siehe Migration) legt Kurs/Kapitel/Inhalte/
  //     Kommentare/kursweite Inhalte in einer Transaktion an -- Karteikarten
  //     zunächst OHNE Bilder, und ein als "freigegeben" gesichertes Kapitel
  //     zunächst nur als "pruefung" (Details siehe Kommentar in der Migration).
  //  2. Hier (Client): pro Karteikarten-Bild hochladen (uploadCardImage(),
  //     derselbe Mechanismus wie im Creator-Wizard) und den chapter_content-
  //     Datensatz mit dem neuen Storage-Pfad aktualisieren -- erst DANACH
  //     werden die als "freigegeben" gesicherten Kapitel tatsächlich auf
  //     "freigegeben" gesetzt, damit der automatische Reopen-Trigger beim
  //     Bild-Update nicht dazwischenfunkt (er reagiert nur auf bereits
  //     "freigegeben"e Kapitel).
  async function restoreCourseBackup(backup, onProgress) {
    if (!backup || typeof backup !== "object") {
      throw new Error("Ungültige Sicherungsdatei.");
    }
    if (backup.backupVersion !== 1) {
      throw new Error("Nicht unterstützte Sicherungsdatei-Version (" + backup.backupVersion + ").");
    }
    var chapters = backup.chapters || [];

    // JSON-Import läuft komplett am Wizard-Autocomplete vorbei -- ohne diese
    // Prüfung würde jeder Tippfehler/jedes ungeprüfte Feld in der
    // Sicherungsdatei eine neue "Phantom-Hochschule" anlegen (siehe
    // resolveOrCreateHochschule() oben). requireKnownAlias=true bricht hart
    // ab, statt das stillschweigend zuzulassen; die aufgelöste (ggf. bereits
    // existierende) Hochschule wird 1:1 in den RPC-Payload übernommen, damit
    // deren eigene name-basierte Suche exakt dieselbe Zeile trifft.
    var hochschuleRow = await resolveOrCreateHochschule((backup.course || {}).hochschule, true);

    var chaptersForRpc = chapters.map(function (ch) {
      var content = ch.content || {};
      return {
        position: ch.position, title: ch.title, subchapters: ch.subchapters,
        status: ch.status, isFreePreview: ch.isFreePreview, currentRound: ch.currentRound,
        content: {
          zusammenfassung: content.zusammenfassung || {},
          karteikarten: (content.karteikarten || []).map(function (c) { return { frage: c.frage || "", antwort: c.antwort || "" }; }),
          uebungen: content.uebungen || []
        },
        comments: ch.comments || []
      };
    });

    const { data: courseId, error } = await supabase.rpc("restore_course_backup", {
      payload: {
        course: Object.assign({}, backup.course || {}, { hochschule: hochschuleRow.name }),
        chapters: chaptersForRpc, courseWideContent: backup.courseWideContent || {}
      }
    });
    if (error) throw error;

    const { data: newChapterRows, error: ncErr } = await supabase.from("chapters")
      .select("id, position").eq("course_id", courseId);
    if (ncErr) throw ncErr;
    var chapterIdByPosition = {};
    newChapterRows.forEach(function (r) { chapterIdByPosition[r.position] = r.id; });

    var imageJobs = [];
    chapters.forEach(function (ch) {
      var cards = (ch.content && ch.content.karteikarten) || [];
      if (cards.some(function (c) { return c.frageBild || c.antwortBild; })) {
        imageJobs.push({ position: ch.position, cards: cards });
      }
    });

    for (var i = 0; i < imageJobs.length; i++) {
      if (onProgress) { onProgress(i, imageJobs.length); }
      var job = imageJobs[i];
      var chapterId = chapterIdByPosition[job.position];
      if (!chapterId) { continue; }
      var newCards = [];
      for (var k = 0; k < job.cards.length; k++) {
        var card = job.cards[k];
        var frageBild = card.frageBild ? await uploadCardImage(courseId, await (await fetch(card.frageBild)).blob()) : null;
        var antwortBild = card.antwortBild ? await uploadCardImage(courseId, await (await fetch(card.antwortBild)).blob()) : null;
        newCards.push({ frage: card.frage || "", antwort: card.antwort || "", frageBild: frageBild, antwortBild: antwortBild });
      }
      const { error: upErr } = await supabase.from("chapter_content")
        .upsert(
          { chapter_id: chapterId, type: "karteikarten", content: { cards: newCards }, updated_at: new Date().toISOString() },
          { onConflict: "chapter_id,type" }
        );
      if (upErr) throw upErr;
    }
    if (onProgress) { onProgress(imageJobs.length, imageJobs.length); }

    // Erst jetzt (nach den Bild-Updates) die als "freigegeben" gesicherten
    // Kapitel tatsächlich freigeben -- siehe Kommentar oben.
    var freigegebenIds = chapters
      .filter(function (ch) { return ch.status === "freigegeben"; })
      .map(function (ch) { return chapterIdByPosition[ch.position]; })
      .filter(Boolean);
    if (freigegebenIds.length) {
      const { data: updated, error: relErr } = await supabase.from("chapters")
        .update({ status: "freigegeben" }).in("id", freigegebenIds).select("id");
      if (relErr) throw relErr;
      if (!updated || updated.length !== freigegebenIds.length) {
        throw new Error("Freigabestatus konnte nicht für alle Kapitel wiederhergestellt werden.");
      }
    }

    return courseId;
  }

  return {
    getSubmissions: getSubmissions,
    getForCourse: getForCourse,
    getOne: getOne,
    submit: submit,
    approve: approve,
    requestChanges: requestChanges,
    setFreePreview: setFreePreview,
    getOrCreateDraftCourse: getOrCreateDraftCourse,
    saveZusammenfassung: saveZusammenfassung,
    getZusammenfassung: getZusammenfassung,
    syncCourseContent: syncCourseContent,
    keepaliveSyncCourseContent: keepaliveSyncCourseContent,
    loadCourseState: loadCourseState,
    getChapterContent: getChapterContent,
    getCourseContent: getCourseContent,
    getChapterContentSnapshot: getChapterContentSnapshot,
    publishCourse: publishCourse,
    uploadCardImage: uploadCardImage,
    getCardImageUrl: getCardImageUrl,
    deleteCardImage: deleteCardImage,
    uploadTranscript: uploadTranscript,
    setTranscriptPath: setTranscriptPath,
    getPendingTranscripts: getPendingTranscripts,
    getAllUsersWithCourses: getAllUsersWithCourses,
    getTranscriptUrl: getTranscriptUrl,
    reviewTranscript: reviewTranscript,
    getAdminStats: getAdminStats,
    getRecentRegistrations: getRecentRegistrations,
    getRecentCourses: getRecentCourses,
    exportCourseBackup: exportCourseBackup,
    restoreCourseBackup: restoreCourseBackup
  };
})();

// ---------------------------------------------------------------------------
// KFCatalog — Hochschulen / Studiengänge / Kurse
// ---------------------------------------------------------------------------
window.KFCatalog = (function () {
  // bundle_note bewusst NICHT hier drin (Sicherheits-Audit 06.08.2026, Punkt
  // 4): dieser Select wird auch von der öffentlichen/anonymen Fächerliste
  // (getAllCourses -> getSubjectsFor/getHochschulen) verwendet -- bundle_note
  // ist jetzt nur noch über courses_public (Owner/Reviewer-Maske) bzw.
  // getOwnBundleNote() erreichbar, siehe unten.
  var COURSE_SELECT = "id, title, professor, semester, status, creator_id, transcript_status," +
    " hochschule:hochschulen ( name )," +
    " course_studiengaenge ( studiengaenge ( name ) )";

  function mapCourseRow(row) {
    return {
      id: row.id,
      creatorId: row.creator_id,
      title: row.title,
      prof: row.professor || "",
      hochschule: row.hochschule ? row.hochschule.name : "",
      sg: (row.course_studiengaenge || []).map(function (x) { return x.studiengaenge.name; }),
      semester: row.semester || "",
      desc: "",
      status: row.status,
      isDraft: row.status === "entwurf",
      bundleNote: row.bundle_note || "",
      transcriptStatus: row.transcript_status || null
    };
  }

  // Ersetzt den früheren bundle_note-Teil von COURSE_SELECT für den einzigen
  // legitimen Fall, wo ein eingeloggter Nutzer sein EIGENES bundle_note braucht
  // (Bundle-Partner-Freitext im Creator-Wizard vorausfüllen, siehe
  // refreshBundleField() in app.html). Läuft über courses_public, damit die
  // Owner/Reviewer-Maskierung konsistent bleibt statt eine zweite Ausnahme zu
  // pflegen.
  async function getOwnBundleNote(courseId) {
    const { data, error } = await supabase.from("courses_public")
      .select("bundle_note").eq("id", courseId).maybeSingle();
    if (error) { console.error(error); return ""; }
    return (data && data.bundle_note) || "";
  }

  async function hasPurchased(courseId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("purchases").select("id")
      .eq("user_id", user.id).eq("course_id", courseId).maybeSingle();
    return !!data;
  }

  // Records a placeholder "purchase" -- no real payment yet, just the row
  // access control (RLS) needs to test against.
  async function recordPlaceholderPurchase(courseId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nicht eingeloggt.");
    const { error } = await supabase.from("purchases")
      .upsert({ user_id: user.id, course_id: courseId }, { onConflict: "user_id,course_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  // Kauf-Fix für die Bundle-Kachel (Teil 1 des Specs vom 05.08.): ein Klick
  // auf "Beide im Bundle kaufen" schaltet bisher nur EINEN Kurs frei, obwohl
  // der Bundle-Preis für beide angezeigt wird. recordPlaceholderPurchase ist
  // bereits ein ignoreDuplicates-Upsert, also unkritisch bei Mehrfachklick.
  async function recordPlaceholderBundlePurchase(courseIdA, courseIdB) {
    await Promise.all([
      recordPlaceholderPurchase(courseIdA),
      recordPlaceholderPurchase(courseIdB)
    ]);
  }

  async function getMyPurchases() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase.from("purchases")
      .select("purchased_at, course:courses ( " + COURSE_SELECT + " )")
      .eq("user_id", user.id);
    if (error) { console.error(error); return []; }
    return data.filter(function (r) { return r.course; }).map(function (r) {
      var course = mapCourseRow(r.course);
      course.purchasedAt = r.purchased_at;
      return course;
    });
  }

  // learning_progress existed in the schema/RLS from the start but nothing
  // ever read or wrote it -- this is the first real use, for the Lernplan
  // baustein's day/task checkboxes (item_type='lernplan', item_id=index).
  async function getProgress(courseId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {};
    const { data, error } = await supabase.from("learning_progress")
      .select("item_type, item_id, state").eq("user_id", user.id).eq("course_id", courseId);
    if (error) { console.error(error); return {}; }
    var out = {};
    data.forEach(function (row) { out[row.item_type + ":" + row.item_id] = row.state; });
    return out;
  }

  async function setProgressItem(courseId, itemType, itemId, state) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nicht eingeloggt.");
    const { error } = await supabase.from("learning_progress")
      .upsert(
        { user_id: user.id, course_id: courseId, item_type: itemType, item_id: String(itemId), state: state, updated_at: new Date().toISOString() },
        { onConflict: "user_id,course_id,item_type,item_id" }
      );
    if (error) throw error;
  }

  async function getSettings() {
    const { data, error } = await supabase.from("settings").select("key, value");
    if (error) { console.error(error); return {}; }
    var out = {};
    data.forEach(function (row) { out[row.key] = row.value; });
    return out;
  }

  async function setBundleNote(courseId, note) {
    const { error } = await supabase.from("courses").update({ bundle_note: note || null }).eq("id", courseId);
    if (error) throw error;
  }

  // Admin-only full metadata edit (see "courses: admin update all" /
  // "course_studiengaenge: admin insert|delete all") -- lets an admin fix a
  // course stuck as "Unbenannter Kurs", or correct any other master-data
  // field, without needing to be the creator. One row update plus a
  // delete-then-insert of course_studiengaenge, analogous to
  // getOrCreateDraftCourse()'s studiengang handling, except this always
  // targets the given existing courseId directly (no upsert-by-title /
  // create fallback -- an admin edit must never spawn a second course row).
  //
  // .select("id") on the update (not just delete()) so an RLS-blocked update
  // (row filtered out, e.g. bad courseId) reports as an explicit error
  // instead of silently doing nothing while still showing a success toast --
  // the exact silent-no-op trap already documented on deleteCourse() above.
  async function adminUpdateCourseMeta(courseId, meta) {
    var hochschuleRow = (await supabase.from("hochschulen").select("id").eq("name", meta.hochschule).maybeSingle()).data;
    if (!hochschuleRow) {
      const { data: inserted, error: hErr } = await supabase.from("hochschulen")
        .insert({ name: meta.hochschule, status: "aktiv" }).select("id").single();
      if (hErr) throw hErr;
      hochschuleRow = inserted;
    }

    const { data: updated, error: uErr } = await supabase.from("courses")
      .update({
        hochschule_id: hochschuleRow.id, title: meta.fach,
        professor: meta.prof || null, semester: meta.semester || null
      })
      .eq("id", courseId)
      .select("id");
    if (uErr) throw uErr;
    if (!updated || !updated.length) throw new Error("Speichern nicht möglich -- Kurs nicht gefunden oder keine Berechtigung.");

    var sgNames = (meta.studiengaenge || []).map(function (s) { return s.trim(); }).filter(Boolean);
    var sgIds = [];
    for (var i = 0; i < sgNames.length; i++) {
      var sgRow = (await supabase.from("studiengaenge").select("id").eq("name", sgNames[i]).maybeSingle()).data;
      if (!sgRow) {
        const { data: insertedSg, error: sgErr } = await supabase.from("studiengaenge")
          .insert({ name: sgNames[i] }).select("id").single();
        if (sgErr) throw sgErr;
        sgRow = insertedSg;
      }
      sgIds.push(sgRow.id);
    }

    const { error: delErr } = await supabase.from("course_studiengaenge").delete().eq("course_id", courseId);
    if (delErr) throw delErr;
    if (sgIds.length) {
      const { error: insErr } = await supabase.from("course_studiengaenge")
        .insert(sgIds.map(function (id) { return { course_id: courseId, studiengang_id: id }; }));
      if (insErr) throw insErr;
    }
  }

  // RLS only allows this for the owning creator, and only while the course
  // isn't 'live' yet (see "courses: delete own if not live") -- the delete
  // button is hidden client-side for live courses too, this is just the
  // server-side backstop. Cascades to chapters/chapter_content/course_content/
  // chapter_comments/purchases/learning_progress via existing FK constraints.
  //
  // A DELETE that RLS's USING clause filters out matches zero rows rather
  // than erroring -- PostgREST reports that as success with an empty result,
  // not as an error. Without checking the returned row, a blocked delete
  // (live course, or not your own) would silently report "gelöscht" while
  // the course is still there. .select("id") makes the affected row (if any)
  // come back so that case can be told apart from a real deletion.
  async function deleteCourse(courseId) {
    const { data, error } = await supabase.from("courses").delete().eq("id", courseId).select("id");
    if (error) throw error;
    if (!data || !data.length) throw new Error("Löschen nicht möglich -- der Kurs ist bereits live oder gehört dir nicht.");
  }

  // RLS already restricts rows to: status='live' (public) OR own entwurf
  // courses OR everything for reviewers — no extra filter needed here.
  async function getAllCourses() {
    const { data, error } = await supabase.from("courses").select(COURSE_SELECT);
    if (error) { console.error(error); return []; }
    return data.map(mapCourseRow);
  }

  async function getHochschulen() {
    const [{ data: hs }, courses] = await Promise.all([
      supabase.from("hochschulen").select("name, subtitle, status"),
      getAllCourses()
    ]);
    var counts = {};
    courses.forEach(function (c) { counts[c.hochschule] = (counts[c.hochschule] || 0) + 1; });
    // status='vorschlag' (Sicherheits-Audit 06.08.2026, Punkt 3) ist noch nicht
    // vom Reviewer freigegeben und darf in der öffentlichen Hochschulauswahl
    // nicht auftauchen.
    return (hs || []).filter(function (h) { return h.status !== "vorschlag"; }).map(function (h) {
      if (h.status === "bald") { return { name: h.name, count: 0, soon: true, full: h.subtitle }; }
      return { name: h.name, count: counts[h.name] || 0 };
    });
  }

  async function getSubjectsFor(hochschule) {
    var all = await getAllCourses();
    return all.filter(function (c) { return c.hochschule === hochschule; });
  }

  async function getStudiengaengeFor(hochschule) {
    var subjects = await getSubjectsFor(hochschule);
    var set = {};
    subjects.forEach(function (c) { (c.sg || []).forEach(function (s) { set[s] = true; }); });
    return Object.keys(set);
  }

  // Alle je angelegten Studiengänge, unabhängig von Hochschule/Kurs -- anders
  // als getStudiengaengeFor() (nur die einem bestimmten Hochschul-Kurs bereits
  // zugeordneten) für die admin-seitige Kurs-Bearbeitung gedacht: dort soll
  // jeder real existierende Studiengang auswählbar sein, nicht nur die schon
  // an dieser Hochschule verwendeten.
  async function getAllStudiengaenge() {
    // status='vorschlag' bewusst ausgeschlossen (Sicherheits-Audit 06.08.2026,
    // Punkt 3) -- die Admin-Kursbearbeitung soll nur bereits freigegebene
    // Studiengänge zur Auswahl anbieten.
    const { data, error } = await supabase.from("studiengaenge").select("name").eq("status", "aktiv").order("name");
    if (error) { console.error(error); return []; }
    return data.map(function (r) { return r.name; });
  }

  // Reviewer-Werkzeug fürs Prüf-Dashboard (Sicherheits-Audit 06.08.2026, Punkt
  // 3): von Creators als status='vorschlag' angelegte Hochschulen/
  // Studiengänge freigeben (-> 'aktiv', dann öffentlich sichtbar) oder als
  // unbrauchbar (Tippfehler, Duplikat) wieder löschen. Die eigentliche
  // Berechtigung dafür kommt von den bestehenden "reviewer update"/
  // "reviewer delete"-Policies (20260728130000_security_audit_fixes.sql /
  // N2) -- hier nur die gebündelte Leseabfrage für die Liste.
  async function getPendingCatalogProposals() {
    const [{ data: hs, error: hErr }, { data: sg, error: sgErr }] = await Promise.all([
      supabase.from("hochschulen").select("id, name").eq("status", "vorschlag"),
      supabase.from("studiengaenge").select("id, name").eq("status", "vorschlag")
    ]);
    if (hErr) { console.error(hErr); }
    if (sgErr) { console.error(sgErr); }
    return {
      hochschulen: (hs || []).map(function (r) { return { id: r.id, name: r.name }; }),
      studiengaenge: (sg || []).map(function (r) { return { id: r.id, name: r.name }; })
    };
  }

  async function approveHochschule(id) {
    const { error } = await supabase.from("hochschulen").update({ status: "aktiv" }).eq("id", id);
    if (error) throw error;
  }

  async function rejectHochschule(id) {
    const { error } = await supabase.from("hochschulen").delete().eq("id", id);
    if (error) throw error;
  }

  async function approveStudiengang(id) {
    const { error } = await supabase.from("studiengaenge").update({ status: "aktiv" }).eq("id", id);
    if (error) throw error;
  }

  async function rejectStudiengang(id) {
    const { error } = await supabase.from("studiengaenge").delete().eq("id", id);
    if (error) throw error;
  }

  return {
    getAllCourses: getAllCourses,
    getHochschulen: getHochschulen,
    getSubjectsFor: getSubjectsFor,
    getStudiengaengeFor: getStudiengaengeFor,
    getAllStudiengaenge: getAllStudiengaenge,
    getPendingCatalogProposals: getPendingCatalogProposals,
    approveHochschule: approveHochschule,
    rejectHochschule: rejectHochschule,
    approveStudiengang: approveStudiengang,
    rejectStudiengang: rejectStudiengang,
    hasPurchased: hasPurchased,
    recordPlaceholderPurchase: recordPlaceholderPurchase,
    recordPlaceholderBundlePurchase: recordPlaceholderBundlePurchase,
    getMyPurchases: getMyPurchases,
    getProgress: getProgress,
    setProgressItem: setProgressItem,
    getSettings: getSettings,
    setBundleNote: setBundleNote,
    getOwnBundleNote: getOwnBundleNote,
    deleteCourse: deleteCourse,
    adminUpdateCourseMeta: adminUpdateCourseMeta
  };
})();

// ---------------------------------------------------------------------------
// KFBundles — Doppelmodul-Verknüpfungen zwischen zwei Kursen
// ---------------------------------------------------------------------------
window.KFBundles = (function () {
  // course_bundles has two FKs to courses -- name the embed explicitly so
  // PostgREST doesn't have to guess which one we mean. creator-E-Mail beider
  // Seiten mit drin (Sicherheits-Audit 06.08.2026, Punkt 6): course_id_a
  // schlägt vor (RLS erzwingt owns_course(course_id_a)), course_id_b bekommt
  // dabei nie eigenständig gefragt -- der Reviewer muss das im Pruef-Dashboard
  // sehen und selbst gegenprüfen, statt es blind zu bestätigen.
  var SELECT = "id, course_id_a, course_id_b, status, proposed_by," +
    " courseA:courses!course_bundles_course_id_a_fkey ( title, creator:profiles(email) )," +
    " courseB:courses!course_bundles_course_id_b_fkey ( title, creator:profiles(email) )";

  function mapRow(row, forCourseId) {
    var isA = row.course_id_a === forCourseId;
    return {
      id: row.id,
      status: row.status,
      partnerCourseId: isA ? row.course_id_b : row.course_id_a,
      partnerTitle: (isA ? row.courseB : row.courseA) ? (isA ? row.courseB.title : row.courseA.title) : "",
      courseIdA: row.course_id_a,
      courseIdB: row.course_id_b,
      courseATitle: row.courseA ? row.courseA.title : "",
      courseBTitle: row.courseB ? row.courseB.title : "",
      courseACreatorEmail: (row.courseA && row.courseA.creator) ? row.courseA.creator.email : "",
      courseBCreatorEmail: (row.courseB && row.courseB.creator) ? row.courseB.creator.email : ""
    };
  }

  // Creator schlägt vor, den eigenen Kurs mit einem bestehenden anderen Kurs
  // zu bündeln (Freitext-Partner läuft stattdessen über KFCatalog.setBundleNote).
  async function propose(courseId, partnerCourseId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nicht eingeloggt.");
    const { error } = await supabase.from("course_bundles")
      .insert({ course_id_a: courseId, course_id_b: partnerCourseId, proposed_by: user.id });
    if (error) throw error;
  }

  async function getForCourse(courseId) {
    const { data, error } = await supabase.from("course_bundles").select(SELECT)
      .or("course_id_a.eq." + courseId + ",course_id_b.eq." + courseId)
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data, courseId);
  }

  async function getPendingForReview() {
    const { data, error } = await supabase.from("course_bundles").select(SELECT).eq("status", "vorgeschlagen");
    if (error) { console.error(error); return []; }
    return data.map(function (row) { return mapRow(row, row.course_id_a); });
  }

  async function confirm(bundleId) {
    const { error } = await supabase.from("course_bundles").update({ status: "bestaetigt" }).eq("id", bundleId);
    if (error) throw error;
  }

  async function reject(bundleId) {
    const { error } = await supabase.from("course_bundles").delete().eq("id", bundleId);
    if (error) throw error;
  }

  return {
    propose: propose,
    getForCourse: getForCourse,
    getPendingForReview: getPendingForReview,
    confirm: confirm,
    reject: reject
  };
})();

// ---------------------------------------------------------------------------
// KFQuestions — Tutorfragen je Kursbaustein
// ---------------------------------------------------------------------------
window.KFQuestions = (function () {
  var SELECT = "id, course_id, chapter_id, content_type, asked_by, question_text, status, answer_text, answered_at, is_public, created_at";

  async function ask(courseId, chapterId, contentType, questionText) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nicht eingeloggt.");
    const { error } = await supabase.from("questions").insert({
      course_id: courseId, chapter_id: chapterId || null, content_type: contentType,
      asked_by: user.id, question_text: questionText
    });
    if (error) throw error;
  }

  // All questions RLS lets the current user see for exactly one baustein --
  // own questions (any status), the creator sees all, and everyone with
  // course access sees the ones marked public.
  async function getForBaustein(courseId, chapterId, contentType) {
    var query = supabase.from("questions").select(SELECT)
      .eq("course_id", courseId).eq("content_type", contentType);
    query = chapterId ? query.eq("chapter_id", chapterId) : query.is("chapter_id", null);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return data;
  }

  // Every question on courses the current user created -- used for the
  // creator's question inbox in "Meine Kurse". RLS also returns the user's
  // own asked questions and public questions on other visible courses, so
  // those are filtered back out client-side.
  async function getForMyCourses() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase.from("questions")
      .select(SELECT + ", course:courses ( title, creator_id ), chapter:chapters ( title )")
      .order("created_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return data.filter(function (q) { return q.course && q.course.creator_id === user.id; });
  }

  async function answer(questionId, answerText, isPublic) {
    const { error } = await supabase.from("questions")
      .update({ answer_text: answerText, status: "beantwortet", is_public: !!isPublic })
      .eq("id", questionId);
    if (error) throw error;
  }

  // Nachträgliches Ändern der Sichtbarkeit einer bereits beantworteten Frage
  // -- die "questions: creator answers"-Update-Policy (owns_course(course_id))
  // deckt das schon ab, ohne Spalten-Einschränkung, also keine RLS-Änderung
  // nötig.
  async function setPublic(questionId, value) {
    const { error } = await supabase.from("questions").update({ is_public: !!value }).eq("id", questionId);
    if (error) throw error;
  }

  return {
    ask: ask,
    getForBaustein: getForBaustein,
    getForMyCourses: getForMyCourses,
    answer: answer,
    setPublic: setPublic
  };
})();

// This module executes deferred (type="module" behaves like defer), which is
// after any classic inline <script> further down the page has already run —
// so code that calls KFAuth/KFStore/KFCatalog immediately on page load (not
// from a later user interaction) needs to wait for this event instead of
// assuming these globals already exist.
//
// Finishing any pending OAuth device-session claim BEFORE signaling kf-ready
// matters: every page's startSessionWatcher() runs an immediate consistency
// check as soon as kf-ready fires, and that check would otherwise race the
// claim and see a stale/mismatched token right after a Google redirect.
//
// authBootstrapped (result unused) makes kf-ready wait for the supabase-js
// client's own initial auth check -- without it, code that calls
// KFAuth.getSession()/getUser() right on kf-ready (e.g. app.html's
// storageUserIdReady) can occasionally race that check on a fresh page load
// and see "not logged in" for a moment, even though a valid session is on
// disk. onAuthStateChange's first callback is the SDK's own signal that this
// initial check has completed; the actual security-relevant checks still use
// getUser() elsewhere; unaffected by this.
var authBootstrapped = new Promise(function (resolve) {
  var sub = supabase.auth.onAuthStateChange(function () {
    sub.data.subscription.unsubscribe();
    resolve();
  });
});
Promise.all([
  authBootstrapped,
  window.KFAuth.claimPendingOAuthSession().catch(function () {})
]).then(function () {
  window.__kfReady = true;
  window.dispatchEvent(new Event("kf-ready"));
});
