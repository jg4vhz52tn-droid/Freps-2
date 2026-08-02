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
  var parts = String(raw || "").split(/\[table\]([\s\S]*?)\[\/table\]/);
  return parts.map(function (part, i) {
    if (i % 2 === 1) { return renderTableBlock(part); }
    return escTableText(part).replace(/\n/g, "<br>");
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

  // Inserts one comment row per non-empty { key: text } entry -- lets a
  // reviewer leave a separate note per baustein, or per single entry within a
  // baustein. key is either "type" (baustein-wide) or "type::subKey" (one
  // entry within that baustein, e.g. one subchapter or one flashcard) -- see
  // Pruef-Dashboard.html's collectNotesByKey().
  async function insertReviewerNotes(chapterId, notesByKey) {
    var rows = Object.keys(notesByKey || {})
      .filter(function (key) { return notesByKey[key] && notesByKey[key].trim(); })
      .map(function (key) {
        var parts = key.split("::");
        var type = parts[0], subKey = parts.length > 1 ? parts[1] : null;
        return {
          chapter_id: chapterId, author: "Prüfer", role: "pruefer",
          text: notesByKey[key].trim(), content_type: type === "allgemein" ? null : type,
          sub_key: subKey
        };
      });
    if (rows.length) {
      // chapters.current_round already points at the round the NEXT
      // resubmission will get (it's bumped by the snapshot trigger at submit
      // time, before any reviewer ever sees it) -- so the round the reviewer
      // currently has open in front of them is always current_round - 1.
      const { data: chapterRow, error: chErr } = await supabase.from("chapters").select("current_round").eq("id", chapterId).single();
      if (chErr) throw chErr;
      var roundNo = (chapterRow.current_round || 1) - 1;
      rows.forEach(function (row) { row.round_no = roundNo; });
      const { error } = await supabase.from("chapter_comments").insert(rows);
      if (error) throw error;
    }
  }

  // Prüfer gibt frei
  async function approve(id, notesByKey) {
    const { error } = await supabase.from("chapters").update({ status: "freigegeben" }).eq("id", id);
    if (error) throw error;
    await insertReviewerNotes(id, notesByKey);
  }

  // Prüfer schickt zur Überarbeitung zurück (mit Kommentaren je Baustein/Eintrag)
  async function requestChanges(id, notesByKey) {
    const { error } = await supabase.from("chapters").update({ status: "ueberarbeitung" }).eq("id", id);
    if (error) throw error;
    await insertReviewerNotes(id, notesByKey);
  }

  // Creator markiert ein Kapitel als kostenlose Vorschau (oder nimmt das zurück)
  async function setFreePreview(chapterId, value) {
    const { error } = await supabase.from("chapters").update({ is_free_preview: !!value }).eq("id", chapterId);
    if (error) throw error;
  }

  // Holt den eigenen Entwurfskurs (per Fach-Titel) oder legt ihn an — ersetzt
  // die frühere Slug-ID aus courseIdentity(), die nur lokal existierte.
  async function getOrCreateDraftCourse(meta) {
    var hochschuleRow = (await supabase.from("hochschulen").select("id").eq("name", meta.hochschule).maybeSingle()).data;
    if (!hochschuleRow) {
      const { data: inserted, error: hErr } = await supabase.from("hochschulen")
        .insert({ name: meta.hochschule, status: "aktiv" }).select("id").single();
      if (hErr) throw hErr;
      hochschuleRow = inserted;
    }

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
        const { data: insertedSg, error: sgErr } = await supabase.from("studiengaenge")
          .insert({ name: meta.studiengang }).select("id").single();
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
  async function uploadTranscript(file) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nicht eingeloggt.");
    var ext = (file.name && file.name.split(".").pop()) || "pdf";
    var path = user.id + "/" + crypto.randomUUID() + "." + ext;
    const { error } = await supabase.storage.from("transcripts")
      .upload(path, file, { contentType: file.type || "application/pdf" });
    if (error) throw error;
    return path;
  }

  async function setTranscriptPath(courseId, path) {
    const { error } = await supabase.from("courses").update({ transcript_path: path }).eq("id", courseId);
    if (error) throw error;
  }

  // Reviewer-Werkzeuge fürs Notennachweis-Review -- läuft parallel zum
  // Kapitel-Workflow, blockiert also nicht das Bauen/Einreichen von Kapiteln,
  // wird aber selbst zur Voraussetzung fürs finale "live"-Gehen (siehe
  // enforce_course_status_transition in der DB).
  async function getPendingTranscripts() {
    const { data, error } = await supabase.from("courses")
      .select("id, title, professor, transcript_path, hochschule:hochschulen(name)")
      .eq("transcript_status", "ausstehend");
    if (error) { console.error(error); return []; }
    return data;
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
      .select("id, title, status, created_at, creator:profiles ( email ), hochschule:hochschulen ( name )")
      .order("created_at", { ascending: false })
      .limit(limit || 10);
    if (error) { console.error(error); return []; }
    return data.map(function (r) {
      return {
        id: r.id, title: r.title, status: r.status, createdAt: r.created_at,
        hochschule: r.hochschule ? r.hochschule.name : "",
        creatorEmail: r.creator ? r.creator.email : ""
      };
    });
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
    getTranscriptUrl: getTranscriptUrl,
    reviewTranscript: reviewTranscript,
    getAdminStats: getAdminStats,
    getRecentRegistrations: getRecentRegistrations,
    getRecentCourses: getRecentCourses
  };
})();

// ---------------------------------------------------------------------------
// KFCatalog — Hochschulen / Studiengänge / Kurse
// ---------------------------------------------------------------------------
window.KFCatalog = (function () {
  var COURSE_SELECT = "id, title, professor, semester, status, creator_id, bundle_note, transcript_status," +
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
    return (hs || []).map(function (h) {
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

  return {
    getAllCourses: getAllCourses,
    getHochschulen: getHochschulen,
    getSubjectsFor: getSubjectsFor,
    getStudiengaengeFor: getStudiengaengeFor,
    hasPurchased: hasPurchased,
    recordPlaceholderPurchase: recordPlaceholderPurchase,
    getMyPurchases: getMyPurchases,
    getProgress: getProgress,
    setProgressItem: setProgressItem,
    getSettings: getSettings,
    setBundleNote: setBundleNote,
    deleteCourse: deleteCourse
  };
})();

// ---------------------------------------------------------------------------
// KFBundles — Doppelmodul-Verknüpfungen zwischen zwei Kursen
// ---------------------------------------------------------------------------
window.KFBundles = (function () {
  // course_bundles has two FKs to courses -- name the embed explicitly so
  // PostgREST doesn't have to guess which one we mean.
  var SELECT = "id, course_id_a, course_id_b, status," +
    " courseA:courses!course_bundles_course_id_a_fkey ( title )," +
    " courseB:courses!course_bundles_course_id_b_fkey ( title )";

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
      courseBTitle: row.courseB ? row.courseB.title : ""
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

  return {
    ask: ask,
    getForBaustein: getForBaustein,
    getForMyCourses: getForMyCourses,
    answer: answer
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
