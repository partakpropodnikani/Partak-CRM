/* ═══════════════════════════════════════════════════════════════
   PARŤÁK OS · v1.2 ADD-ON
   Nemění existující kód v1.1 — pouze ho rozšiřuje (migration > rebuild).
   Přidává:
     1. Zdraví projektu (deterministické, konfigurovatelné)
     2. Další krok u projektu (management by exception)
     3. Milníky projektu
     4. Kontaktní osoby klienta (1 klient : N kontaktů)
     5. Stránka Rizika — řídicí centrum výjimek
     6. Command palette (Ctrl/Cmd+K) + globální hledání
     7. Timer pro měření času
     8. Audit log (kdo / co / kdy / z čeho / na co)
     9. Odkládání upozornění (snooze) + nové typy upozornění
    10. Uložené pohledy
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var W = window;

  /* ═══ 1. MIGRACE DAT (v1.1 → v1.2) ═══ */
  W.migruj12 = function () {
    if (!D) return;
    D.verze12 = 1;
    if (!Array.isArray(D.audit)) D.audit = [];
    if (!Array.isArray(D.pohledy)) D.pohledy = [];
    if (!D.odlozeno || typeof D.odlozeno !== 'object') D.odlozeno = {};
    if (!D.timer) D.timer = null;
    if (!D.zdraviPravidla) D.zdraviPravidla = {
      dnyBezAktivity: 10, dnyBezAktivityKrit: 21, dnyCekaniKlient: 7,
      deadlineBlizko: 7, hodinyVarovaniPct: 85,
      limitOranzova: 2, limitCervena: 5
    };
    D.ciselniky = D.ciselniky || {};
    if (!Array.isArray(D.ciselniky.balicky) || !D.ciselniky.balicky.length)
      D.ciselniky.balicky = ['S1 — Základ', 'S2 — Střední', 'S3 — Prémium', 'S4 — Automatizovaný', 'Hodinovka', 'Individuální'];
    if (!Array.isArray(D.ciselniky.funkce) || !D.ciselniky.funkce.length)
      D.ciselniky.funkce = ['Jednatel / majitel', 'Ekonomika a fakturace', 'Marketing', 'Provoz', 'IT', 'Asistent', 'Jiné'];

    (D.projekty || []).forEach(function (p) {
      if (p.dalsiKrok === undefined) p.dalsiKrok = '';
      if (p.dalsiKrokDatum === undefined) p.dalsiKrokDatum = '';
      if (!Array.isArray(p.milniky)) p.milniky = [];
    });

    (D.klienti || []).forEach(function (k) {
      if (!Array.isArray(k.kontakty)) {
        k.kontakty = [];
        if (k.kontakt || k.email || k.telefon)
          k.kontakty.push({
            id: uid('ko'), jmeno: k.kontakt || 'Hlavní kontakt', funkce: 'Jednatel / majitel',
            email: k.email || '', telefon: k.telefon || '', hlavni: true, pozn: ''
          });
      }
      if (k.balicek === undefined) k.balicek = '';
    });

    (D.ukoly || []).forEach(function (t) {
      if (!t.status) t.status = t.hotovo ? 'Hotovo' : 'Naplánováno';
      if (!Array.isArray(t.zavisiNa)) t.zavisiNa = [];
    });

    /* pipeline podle reality v Notionu: Lead → První kontakt → Diagnostika → Nabídka odeslána */
    try {
      LFAZE.splice(0, LFAZE.length,
        ['lead', 'Lead'], ['kontakt', 'První kontakt'], ['diagnostika', 'Diagnostika'], ['nabidka', 'Nabídka odeslána']);
      (D.leady || []).forEach(function (l) { if (l.faze === 'analyza') l.faze = 'diagnostika'; });
    } catch (e) { }

    /* ukázkové milníky a další kroky, jen u vzorových dat */
    if (D.__vzory) {
      var p1 = projekt('p1'), p3 = projekt('p3');
      if (p1 && !p1.milniky.length) {
        p1.milniky = [
          { id: uid('mi'), nazev: 'Schválený wireframe', termin: plusDni(dnesISO(), -14), hotovo: true, popis: '' },
          { id: uid('mi'), nazev: 'Schválené texty a design', termin: plusDni(dnesISO(), 3), hotovo: false, popis: 'Blokuje implementaci.' },
          { id: uid('mi'), nazev: 'Spuštění webu', termin: plusDni(dnesISO(), 18), hotovo: false, popis: '' }
        ];
        if (!p1.dalsiKrok) { p1.dalsiKrok = 'Projít texty s klientkou a odsouhlasit finální verzi'; p1.dalsiKrokDatum = plusDni(dnesISO(), 2); }
      }
      if (p3 && !p3.dalsiKrok) { p3.dalsiKrok = 'Urgovat mzdové podklady telefonicky'; p3.dalsiKrokDatum = plusDni(dnesISO(), -1); }
    }
    uloz();
  };

  /* ═══ 2. ZDRAVÍ PROJEKTU — deterministicky, bez AI ═══ */
  W.zdravi = function (p) {
    var R = D.zdraviPravidla, duvody = [], skore = 0, dnes = dnesISO();
    if (!p) return { skore: 0, stupen: 'zelena', duvody: [] };
    if (p.archiv || p.stav === 'Dokončeno' || p.stav === 'Archiv')
      return { skore: 0, stupen: 'zelena', duvody: ['uzavřeno'] };

    var po = (D.ukoly || []).filter(function (t) { return t.projektId === p.id && !t.hotovo && t.termin && t.termin < dnes; });
    if (po.length) { skore += po.length >= 3 ? 3 : 2; duvody.push(po.length + '× úkol po termínu'); }

    if (p.deadline) {
      var d = poDni(p.deadline);
      if (d < 0) { skore += 3; duvody.push('deadline prošel o ' + (-d) + ' dní'); }
      else if (d <= R.deadlineBlizko) { skore += 1; duvody.push('deadline za ' + d + ' dní'); }
    }

    var bez = pred(p.posledniAktivita || p.vytvoreno);
    if (bez >= R.dnyBezAktivityKrit) { skore += 3; duvody.push('bez aktivity ' + bez + ' dní'); }
    else if (bez >= R.dnyBezAktivity) { skore += 2; duvody.push('bez aktivity ' + bez + ' dní'); }

    if (p.stav === 'Čeká na klienta' && bez >= R.dnyCekaniKlient) { skore += 2; duvody.push('čeká na klienta ' + bez + ' dní'); }

    var hod = hodinyProjektu(p.id);
    if (p.rozpocetH && hod > p.rozpocetH) { skore += 2; duvody.push('hodiny ' + h1(hod) + ' / ' + p.rozpocetH + ' h'); }
    else if (p.rozpocetH && hod >= p.rozpocetH * (R.hodinyVarovaniPct / 100)) { skore += 1; duvody.push('rozpočet hodin na ' + Math.round(hod / p.rozpocetH * 100) + ' %'); }

    if (!p.dalsiKrok) { skore += 2; duvody.push('chybí další krok'); }
    else if (p.dalsiKrokDatum && p.dalsiKrokDatum < dnes) { skore += 1; duvody.push('další krok po termínu'); }

    if (!p.pm) { skore += 1; duvody.push('bez projektového manažera'); }

    (p.milniky || []).forEach(function (m) {
      if (!m.hotovo && m.termin && m.termin < dnes) { skore += 2; duvody.push('milník po termínu: ' + m.nazev); }
    });

    var stupen = skore >= R.limitCervena ? 'cervena' : (skore >= R.limitOranzova ? 'oranzova' : 'zelena');
    return { skore: skore, stupen: stupen, duvody: duvody };
  };

  var ZBARVA = { zelena: ['p-ok', 'Zdravý'], oranzova: ['p-warn', 'Pozor'], cervena: ['p-bad', 'V riziku'] };

  W.zdraviPill = function (p) {
    var z = zdravi(p), m = ZBARVA[z.stupen];
    return '<span class="pill ' + m[0] + '" title="' + esc(z.duvody.join(' · ') || 'bez zjištěných rizik') + '">' + m[1] + (z.skore ? ' · ' + z.skore : '') + '</span>';
  };

  /* pás pod záložkami detailu projektu: zdraví + další krok + milníky */
  W.pasDalsiKrok = function (p) {
    var z = zdravi(p), dnes = dnesISO();
    var pozde = p.dalsiKrokDatum && p.dalsiKrokDatum < dnes;
    var mOtev = (p.milniky || []).filter(function (m) { return !m.hotovo; });
    var nejblizsi = mOtev.slice().sort(function (a, b) { return String(a.termin || '9').localeCompare(String(b.termin || '9')); })[0];
    var barva = z.stupen === 'cervena' ? 'var(--bad)' : (z.stupen === 'oranzova' ? 'var(--warn)' : 'var(--ok)');
    return '<div class="card" style="margin-bottom:14px;border-left:3px solid ' + barva + '"><div class="card-b" style="padding:12px 16px">' +
      '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
      '<div>' + zdraviPill(p) + '</div>' +
      '<div style="flex:1;min-width:240px">' +
      '<div class="eyebrow">Další krok</div>' +
      (p.dalsiKrok
        ? '<div style="font-size:13.5px;color:' + (pozde ? 'var(--bad)' : 'var(--ink-1)') + '">' + esc(p.dalsiKrok) + (p.dalsiKrokDatum ? ' · ' + dat(p.dalsiKrokDatum) : '') + '</div>'
        : '<div style="font-size:13.5px;color:var(--bad)">Není definován — projekt nikdo neposouvá.</div>') +
      '</div>' +
      (nejblizsi ? '<div style="min-width:160px"><div class="eyebrow">Nejbližší milník</div><div style="font-size:13px">' + esc(nejblizsi.nazev) + (nejblizsi.termin ? ' · ' + dat(nejblizsi.termin) : '') + '</div></div>' : '') +
      '<div style="display:flex;gap:6px"><button class="btn btn-o btn-xs" onclick="formDalsiKrok(\'' + p.id + '\')">Nastavit další krok</button></div>' +
      '</div>' +
      (z.duvody.length ? '<div class="muted" style="font-size:11.5px;margin-top:7px">Zdraví: ' + esc(z.duvody.join(' · ')) + '</div>' : '') +
      '</div></div>';
  };

  W.formDalsiKrok = function (pid) {
    var p = projekt(pid); if (!p) return;
    modal('Další krok projektu',
      '<div class="f"><label>Co je konkrétně dalším krokem</label><input id="dk-text" value="' + esc(p.dalsiKrok || '') + '" placeholder="Např. Zavolat klientce a odsouhlasit texty"></div>' +
      '<div class="f"><label>Do kdy</label><input id="dk-datum" type="date" value="' + esc(p.dalsiKrokDatum || '') + '"></div>' +
      '<div class="muted" style="font-size:11.5px;margin-top:6px">Projekt bez dalšího kroku se v Rizicích označí jako problém. Cílem je, aby nikdy nenastal stav „nevíme, co se s projektem děje“.</div>',
      '<button class="btn btn-o btn-s" onclick="zavri()">Zrušit</button><button class="btn btn-g btn-s" onclick="ulozDalsiKrok(\'' + pid + '\')">Uložit</button>');
  };

  W.ulozDalsiKrok = function (pid) {
    var p = projekt(pid); if (!p) return;
    var stary = p.dalsiKrok;
    p.dalsiKrok = gv('dk-text'); p.dalsiKrokDatum = gv('dk-datum');
    zapisAudit('projekt', p.id, p.nazev, 'další krok', stary, p.dalsiKrok);
    zapisHistorii(p, 'Další krok: ' + (p.dalsiKrok || '—') + (p.dalsiKrokDatum ? ' (do ' + dat(p.dalsiKrokDatum) + ')' : ''));
    uloz(); zavri(); render(); toast('Další krok uložen');
  };

  /* ═══ 3. MILNÍKY ═══ */
  W.TABS12 = function (p) {
    var otev = (p.milniky || []).filter(function (m) { return !m.hotovo; }).length;
    return [['milniky', 'Milníky (' + otev + ')']];
  };

  W.TAB12 = function (p, t) {
    if (t !== 'milniky') return '';
    var dnes = dnesISO();
    var ms = (p.milniky || []).slice().sort(function (a, b) { return String(a.termin || '9').localeCompare(String(b.termin || '9')); });
    var h = '<div class="card"><div class="card-h"><h2>Milníky projektu</h2>' +
      '<span style="margin-left:auto"><button class="btn btn-g btn-xs" onclick="formMilnik(\'' + p.id + '\')">+ Nový milník</button></span></div><div class="card-b">';
    if (!ms.length) {
      h += '<div class="empty"><div class="big">Projekt nemá milníky</div>Milník je bod, po kterém se dá říct „tato část je hotová a odsouhlasená“. ' +
        'U webu například: schválený wireframe, schválené texty, spuštění. Bez milníků se pozná zpoždění až na konci.' +
        '<div style="margin-top:12px"><button class="btn btn-g btn-s" onclick="formMilnik(\'' + p.id + '\')">Vytvořit první milník</button></div></div>';
    } else {
      h += '<table><thead><tr><th style="width:34px"></th><th>Milník</th><th>Termín</th><th>Stav</th><th style="width:120px"></th></tr></thead><tbody>';
      ms.forEach(function (m) {
        var pozde = !m.hotovo && m.termin && m.termin < dnes;
        h += '<tr>' +
          '<td><input type="checkbox" ' + (m.hotovo ? 'checked' : '') + ' onchange="prepniMilnik(\'' + p.id + '\',\'' + m.id + '\')"></td>' +
          '<td><div style="font-weight:500' + (m.hotovo ? ';text-decoration:line-through;opacity:.6' : '') + '">' + esc(m.nazev) + '</div>' +
          (m.popis ? '<div class="muted" style="font-size:12px">' + esc(m.popis) + '</div>' : '') + '</td>' +
          '<td class="mono" style="' + (pozde ? 'color:var(--bad)' : '') + '">' + (m.termin ? dat(m.termin) : '—') + '</td>' +
          '<td>' + (m.hotovo ? '<span class="pill p-ok">Hotovo</span>' : (pozde ? '<span class="pill p-bad">Po termínu</span>' : '<span class="pill p-info">Otevřený</span>')) + '</td>' +
          '<td style="text-align:right"><button class="btn btn-o btn-xs" onclick="formMilnik(\'' + p.id + '\',\'' + m.id + '\')">Upravit</button> ' +
          '<button class="btn btn-o btn-xs" onclick="smazMilnik(\'' + p.id + '\',\'' + m.id + '\')">Smazat</button></td></tr>';
      });
      h += '</tbody></table>';
    }
    return h + '</div></div>';
  };

  W.formMilnik = function (pid, mid) {
    var p = projekt(pid); if (!p) return;
    var m = (p.milniky || []).find(function (x) { return x.id === mid; }) || { nazev: '', termin: '', popis: '', hotovo: false };
    modal((mid ? 'Upravit milník' : 'Nový milník'),
      '<div class="f"><label>Název milníku *</label><input id="mi-nazev" value="' + esc(m.nazev) + '" placeholder="Např. Schválené texty webu"></div>' +
      '<div class="f"><label>Termín</label><input id="mi-termin" type="date" value="' + esc(m.termin || '') + '"></div>' +
      '<div class="f"><label>Popis / podmínka splnění</label><textarea id="mi-popis" rows="3" placeholder="Co přesně musí být hotové, aby byl milník splněn">' + esc(m.popis || '') + '</textarea></div>',
      '<button class="btn btn-o btn-s" onclick="zavri()">Zrušit</button><button class="btn btn-g btn-s" onclick="ulozMilnik(\'' + pid + '\'' + (mid ? ',\'' + mid + '\'' : '') + ')">Uložit</button>');
  };

  W.ulozMilnik = function (pid, mid) {
    var p = projekt(pid); if (!p) return;
    var nazev = gv('mi-nazev');
    if (!nazev) { toast('Název milníku je povinný'); return; }
    if (!Array.isArray(p.milniky)) p.milniky = [];
    if (mid) {
      var m = p.milniky.find(function (x) { return x.id === mid; });
      if (m) { m.nazev = nazev; m.termin = gv('mi-termin'); m.popis = gv('mi-popis'); }
    } else {
      p.milniky.push({ id: uid('mi'), nazev: nazev, termin: gv('mi-termin'), popis: gv('mi-popis'), hotovo: false });
    }
    zapisHistorii(p, (mid ? 'Upraven milník: ' : 'Přidán milník: ') + nazev);
    zapisAudit('projekt', p.id, p.nazev, 'milník', '', nazev);
    uloz(); zavri(); render(); toast('Milník uložen');
  };

  W.prepniMilnik = function (pid, mid) {
    var p = projekt(pid); if (!p) return;
    var m = (p.milniky || []).find(function (x) { return x.id === mid; }); if (!m) return;
    m.hotovo = !m.hotovo; m.hotovoDatum = m.hotovo ? dnesISO() : '';
    zapisHistorii(p, (m.hotovo ? 'Splněn milník: ' : 'Znovu otevřen milník: ') + m.nazev);
    zapisAudit('projekt', p.id, p.nazev, 'milník ' + m.nazev, m.hotovo ? 'otevřený' : 'hotovo', m.hotovo ? 'hotovo' : 'otevřený');
    uloz(); render();
  };

  W.smazMilnik = function (pid, mid) {
    var p = projekt(pid); if (!p) return;
    if (!confirm('Smazat milník? Akce se zapíše do auditu.')) return;
    var m = (p.milniky || []).find(function (x) { return x.id === mid; });
    p.milniky = (p.milniky || []).filter(function (x) { return x.id !== mid; });
    zapisAudit('projekt', p.id, p.nazev, 'smazán milník', m ? m.nazev : mid, '');
    uloz(); render(); toast('Milník smazán');
  };

  /* ═══ 4. KONTAKTNÍ OSOBY KLIENTA ═══ */
  W.kartaKontakty = function (k) {
    var ks = k.kontakty || [];
    var h = '<div class="card" style="margin-top:14px"><div class="card-h"><h2>Kontaktní osoby</h2>' +
      '<span style="margin-left:auto"><button class="btn btn-o btn-xs" onclick="formKontakt(\'' + k.id + '\')">+ Kontakt</button></span></div><div class="card-b">';
    if (!ks.length) {
      h += '<div class="muted" style="font-size:13px">Zatím jen jeden kontakt v hlavičce klienta. U firmy s více lidmi (majitel, účetní, marketing) se vyplatí evidovat každého zvlášť — víš pak, komu co psát.</div>';
    } else {
      h += '<table><thead><tr><th>Jméno</th><th>Role</th><th>E-mail</th><th>Telefon</th><th style="width:110px"></th></tr></thead><tbody>';
      ks.forEach(function (o) {
        h += '<tr><td><div style="font-weight:500">' + esc(o.jmeno) + (o.hlavni ? ' <span class="pill p-gold">hlavní</span>' : '') + '</div>' +
          (o.pozn ? '<div class="muted" style="font-size:12px">' + esc(o.pozn) + '</div>' : '') + '</td>' +
          '<td>' + esc(o.funkce || '—') + '</td>' +
          '<td>' + (o.email ? '<a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a>' : '—') + '</td>' +
          '<td class="mono">' + esc(o.telefon || '—') + '</td>' +
          '<td style="text-align:right"><button class="btn btn-o btn-xs" onclick="formKontakt(\'' + k.id + '\',\'' + o.id + '\')">Upravit</button> ' +
          '<button class="btn btn-o btn-xs" onclick="smazKontakt(\'' + k.id + '\',\'' + o.id + '\')">Smazat</button></td></tr>';
      });
      h += '</tbody></table>';
    }
    return h + '</div></div>';
  };

  W.formKontakt = function (kid, oid) {
    var k = klient(kid); if (!k) return;
    var o = (k.kontakty || []).find(function (x) { return x.id === oid; }) || { jmeno: '', funkce: '', email: '', telefon: '', pozn: '', hlavni: false };
    modal((oid ? 'Upravit kontakt' : 'Nová kontaktní osoba'),
      '<div class="f"><label>Jméno a příjmení *</label><input id="ko-jmeno" value="' + esc(o.jmeno) + '"></div>' +
      '<div class="frow"><div class="f"><label>Role ve firmě</label>' + selOpt('ko-funkce', D.ciselniky.funkce, o.funkce) + '</div>' +
      '<div class="f"><label>Telefon</label><input id="ko-telefon" value="' + esc(o.telefon || '') + '"></div></div>' +
      '<div class="f"><label>E-mail</label><input id="ko-email" value="' + esc(o.email || '') + '"></div>' +
      '<div class="f"><label>Poznámka</label><input id="ko-pozn" value="' + esc(o.pozn || '') + '" placeholder="Např. rozhoduje o ceně, na e-mail reaguje pomalu"></div>' +
      '<div class="f"><label><input type="checkbox" id="ko-hlavni" ' + (o.hlavni ? 'checked' : '') + '> Hlavní kontakt</label></div>',
      '<button class="btn btn-o btn-s" onclick="zavri()">Zrušit</button><button class="btn btn-g btn-s" onclick="ulozKontakt(\'' + kid + '\'' + (oid ? ',\'' + oid + '\'' : '') + ')">Uložit</button>');
  };

  W.ulozKontakt = function (kid, oid) {
    var k = klient(kid); if (!k) return;
    var jmeno = gv('ko-jmeno');
    if (!jmeno) { toast('Jméno je povinné'); return; }
    if (!Array.isArray(k.kontakty)) k.kontakty = [];
    var data = { jmeno: jmeno, funkce: gv('ko-funkce'), email: gv('ko-email'), telefon: gv('ko-telefon'), pozn: gv('ko-pozn'), hlavni: gchk('ko-hlavni') };
    if (data.hlavni) k.kontakty.forEach(function (x) { x.hlavni = false; });
    if (oid) {
      var o = k.kontakty.find(function (x) { return x.id === oid; });
      if (o) Object.keys(data).forEach(function (key) { o[key] = data[key]; });
    } else {
      data.id = uid('ko'); k.kontakty.push(data);
    }
    var hl = k.kontakty.find(function (x) { return x.hlavni; });
    if (hl) { k.kontakt = hl.jmeno; k.email = hl.email; k.telefon = hl.telefon; }
    zapisAudit('klient', k.id, k.nazev, 'kontaktní osoba', '', jmeno);
    uloz(); zavri(); render(); toast('Kontakt uložen');
  };

  W.smazKontakt = function (kid, oid) {
    var k = klient(kid); if (!k) return;
    if (!confirm('Smazat kontaktní osobu?')) return;
    var o = (k.kontakty || []).find(function (x) { return x.id === oid; });
    k.kontakty = (k.kontakty || []).filter(function (x) { return x.id !== oid; });
    zapisAudit('klient', k.id, k.nazev, 'smazán kontakt', o ? o.jmeno : oid, '');
    uloz(); render(); toast('Kontakt smazán');
  };

  /* ═══ 5. AUDIT LOG ═══ */
  W.zapisAudit = function (entita, id, nazev, pole, stara, nova) {
    if (!Array.isArray(D.audit)) D.audit = [];
    D.audit.unshift({
      id: uid('a'), kdy: new Date().toISOString(), kdo: D.ja,
      entita: entita, entitaId: id, entitaNazev: nazev || '',
      pole: pole || '', stara: stara === undefined || stara === null ? '' : String(stara),
      nova: nova === undefined || nova === null ? '' : String(nova)
    });
    if (D.audit.length > 2000) D.audit.length = 2000;
  };

  /* obalení existujících funkcí — MUSÍ běžet až po načtení hlavního skriptu (z init12) */
  function wrap12() {
    var _zmenStav = W.zmenStavProjektu;
    if (typeof _zmenStav === 'function') W.zmenStavProjektu = function (id, stav) {
      var p = projekt(id), stary = p ? p.stav : '';
      _zmenStav(id, stav);
      if (p) zapisAudit('projekt', p.id, p.nazev, 'stav', stary, p.stav);
      uloz();
    };
    var _nastavFazi = W.nastavFazi;
    if (typeof _nastavFazi === 'function') W.nastavFazi = function (id, f) {
      var p = projekt(id), stara = p ? p.faze : '';
      _nastavFazi(id, f);
      if (p) zapisAudit('projekt', p.id, p.nazev, 'fáze', stara + '. ' + (FAZE[stara - 1] || ''), p.faze + '. ' + (FAZE[p.faze - 1] || ''));
      uloz();
    };
    var _dokoncit = W.dokoncitProjekt;
    if (typeof _dokoncit === 'function') W.dokoncitProjekt = function (id) {
      var p = projekt(id);
      _dokoncit(id);
      if (p) zapisAudit('projekt', p.id, p.nazev, 'dokončení projektu', '', p.stav);
      uloz();
    };
    var _upoz = W.upozorneni;
    if (typeof _upoz === 'function') W.upozorneni = function () {
      var u = [];
      try { u = _upoz() || []; } catch (e) { u = []; }
      return u.concat(upozorneni12()).filter(function (x) {
        var k = (x.klic || '') + '|' + (x.x || '');
        var od = D.odlozeno && D.odlozeno[k];
        return !(od && od >= dnesISO());
      });
    };
  }

  W.vAudit = function () {
    if (!smimAdmin()) return '<div class="empty"><div class="big">Audit je přístupný jen adminovi</div>Historii změn vidí vlastník systému. Členům týmu stačí historie na projektu.</div>';
    var f = sub || 'vse';
    var filtry = [['vse', 'Vše'], ['projekt', 'Projekty'], ['klient', 'Klienti'], ['finance', 'Finance'], ['system', 'Systém']];
    var h = '<div class="chips" style="margin-bottom:12px">' + filtry.map(function (x) {
      return '<button class="chip' + (f === x[0] ? ' on' : '') + '" onclick="jdi(\'audit\',null,\'' + x[0] + '\')">' + x[1] + '</button>';
    }).join('') + '</div>';
    var zaz = (D.audit || []).filter(function (a) { return f === 'vse' || a.entita === f; });
    h += '<div class="card"><div class="card-h"><h2>Audit změn</h2><span class="muted" style="margin-left:auto;font-size:12px">' + zaz.length + ' záznamů · uchováváme posledních 2 000</span></div><div class="card-b">';
    if (!zaz.length) {
      h += '<div class="empty"><div class="big">Zatím žádné auditované změny</div>Do auditu se zapisují změny stavu a fáze projektu, další krok, milníky, kontakty a dokončení projektu. ' +
        'V databázové verzi (Supabase) bude audit automatický na úrovni databáze, ne aplikace.</div>';
    } else {
      h += '<table><thead><tr><th>Kdy</th><th>Kdo</th><th>Záznam</th><th>Co</th><th>Z</th><th>Na</th></tr></thead><tbody>';
      zaz.slice(0, 300).forEach(function (a) {
        var u = uz(a.kdo);
        h += '<tr><td class="mono" style="white-space:nowrap">' + esc(a.kdy.slice(0, 10)) + ' ' + esc(a.kdy.slice(11, 16)) + '</td>' +
          '<td>' + (u ? esc(u.jmeno) : '—') + '</td>' +
          '<td>' + esc(a.entitaNazev || a.entitaId) + '</td>' +
          '<td>' + esc(a.pole) + '</td>' +
          '<td class="muted">' + esc(a.stara || '—') + '</td>' +
          '<td>' + esc(a.nova || '—') + '</td></tr>';
      });
      h += '</tbody></table>';
    }
    return h + '</div></div>';
  };

  /* ═══ 6. UPOZORNĚNÍ — nové typy + odkládání ═══ */
  function upozorneni12() {
    var u = [];
    var dnes = dnesISO();
    aktivniProjekty().forEach(function (p) {
      if (!p.dalsiKrok)
        u.push({ typ: 'warn', ic: '→', t: 'Projekt bez dalšího kroku', x: p.nazev + ' — nikdo neví, co se má stát dál', akce: function () { jdi('projekt', p.id); }, klic: 'dalsikrok' });
      else if (p.dalsiKrokDatum && p.dalsiKrokDatum < dnes)
        u.push({ typ: 'warn', ic: '→', t: 'Další krok je po termínu', x: p.nazev + ' · ' + p.dalsiKrok, akce: function () { jdi('projekt', p.id); }, klic: 'dalsikrokpo' });
      (p.milniky || []).forEach(function (m) {
        if (!m.hotovo && m.termin && m.termin < dnes)
          u.push({ typ: 'bad', ic: '◆', t: 'Milník po termínu', x: p.nazev + ' · ' + m.nazev + ' · ' + dat(m.termin), akce: function () { jdi('projekt', p.id, 'milniky'); }, klic: 'milnik' });
      });
      var z = zdravi(p);
      if (z.stupen === 'cervena')
        u.push({ typ: 'bad', ic: '▲', t: 'Projekt v riziku', x: p.nazev + ' · ' + z.duvody.slice(0, 3).join(' · '), akce: function () { jdi('rizika'); }, klic: 'zdravi' });
    });
    return u;
  }

  W.odloz = function (klic, text, dni) {
    if (!D.odlozeno) D.odlozeno = {};
    D.odlozeno[klic + '|' + text] = plusDni(dnesISO(), dni || 7);
    uloz(); render(); toast('Odloženo o ' + (dni || 7) + ' dní');
  };

  /* ═══ 7. STRÁNKA RIZIKA — management by exception ═══ */
  W.vRizika = function () {
    var dnes = dnesISO();
    var ps = viditelneProjekty().filter(function (p) { return !['Dokončeno', 'Archiv'].includes(p.stav); });
    var sZdravim = ps.map(function (p) { return { p: p, z: zdravi(p) }; })
      .sort(function (a, b) { return b.z.skore - a.z.skore; });
    var cerv = sZdravim.filter(function (x) { return x.z.stupen === 'cervena'; });
    var oran = sZdravim.filter(function (x) { return x.z.stupen === 'oranzova'; });
    var zel = sZdravim.filter(function (x) { return x.z.stupen === 'zelena'; });
    var bezKroku = ps.filter(function (p) { return !p.dalsiKrok; });
    var leadyBez = (D.leady || []).filter(function (l) { return !l.konvertovanoKlient && (!l.dalsiKrokDatum || l.dalsiKrokDatum < dnes); });

    var h = '<div class="grid g4" style="margin-bottom:16px">' +
      '<div class="stat' + (cerv.length ? ' bad' : '') + '"><div class="k">V riziku</div><div class="v">' + cerv.length + '</div><div class="n">vyžaduje rozhodnutí dnes</div></div>' +
      '<div class="stat' + (oran.length ? ' warn' : '') + '"><div class="k">Pozor</div><div class="v">' + oran.length + '</div><div class="n">sledovat tento týden</div></div>' +
      '<div class="stat"><div class="k">Zdravé</div><div class="v">' + zel.length + '</div><div class="n">běží podle plánu</div></div>' +
      '<div class="stat' + (bezKroku.length ? ' warn' : '') + '"><div class="k">Bez dalšího kroku</div><div class="v">' + bezKroku.length + '</div><div class="n">projekty bez pohybu</div></div></div>';

    h += '<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>Projekty podle zdraví</h2>' +
      '<span class="muted" style="margin-left:auto;font-size:12px">Pravidla nastavíš v Admin → Číselníky (zdraviPravidla v datech)</span></div><div class="card-b">';
    if (!sZdravim.length) {
      h += '<div class="empty"><div class="big">Žádné běžící projekty</div>Až budeš mít aktivní projekty, tady uvidíš jen ty, které potřebují pozornost — ne seznam všeho.</div>';
    } else {
      h += '<table><thead><tr><th>Projekt</th><th>Klient</th><th>Zdraví</th><th>Proč</th><th>Další krok</th><th style="width:150px"></th></tr></thead><tbody>';
      sZdravim.forEach(function (x) {
        var p = x.p, k = klient(p.klientId);
        var pozde = p.dalsiKrokDatum && p.dalsiKrokDatum < dnes;
        h += '<tr>' +
          '<td><a href="#" onclick="jdi(\'projekt\',\'' + p.id + '\');return false"><b>' + esc(p.nazev) + '</b></a>' +
          '<div class="muted" style="font-size:12px">' + esc(nazevSluzeb(p)) + ' · PM ' + esc((uz(p.pm) || {}).jmeno || '—') + '</div></td>' +
          '<td>' + (k ? esc(k.nazev) : '—') + '</td>' +
          '<td>' + zdraviPill(p) + '</td>' +
          '<td class="muted" style="font-size:12px">' + esc(x.z.duvody.join(' · ') || '—') + '</td>' +
          '<td style="font-size:12.5px;' + (pozde || !p.dalsiKrok ? 'color:var(--bad)' : '') + '">' + (p.dalsiKrok ? esc(p.dalsiKrok) + (p.dalsiKrokDatum ? '<div class="muted" style="font-size:11.5px">' + dat(p.dalsiKrokDatum) + '</div>' : '') : 'chybí') + '</td>' +
          '<td style="text-align:right"><button class="btn btn-o btn-xs" onclick="formDalsiKrok(\'' + p.id + '\')">Další krok</button> ' +
          '<button class="btn btn-o btn-xs" onclick="odloz(\'zdravi\',\'' + esc(p.nazev).replace(/'/g, '') + '\',7)">Odložit</button></td></tr>';
      });
      h += '</tbody></table>';
    }
    h += '</div></div>';

    /* leady bez dalšího kroku */
    h += '<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>Obchod — příležitosti bez dalšího kroku</h2></div><div class="card-b">';
    if (!leadyBez.length) {
      h += '<div class="muted" style="font-size:13px">Všechny leady mají naplánovaný další krok. Přesně tak to má být.</div>';
    } else {
      h += '<table><thead><tr><th>Lead</th><th>Fáze</th><th>Hodnota</th><th>Vlastník</th><th>Poslední krok</th><th></th></tr></thead><tbody>';
      leadyBez.forEach(function (l) {
        var fz = LFAZE.find(function (x) { return x[0] === l.faze; });
        h += '<tr><td><b>' + esc(l.nazev) + '</b><div class="muted" style="font-size:12px">' + esc(l.firma || '') + '</div></td>' +
          '<td>' + esc(fz ? fz[1] : l.faze) + '</td>' +
          '<td class="mono">' + kc(l.hodnota) + '</td>' +
          '<td>' + esc((uz(l.vlastnik) || {}).jmeno || '—') + '</td>' +
          '<td class="muted" style="font-size:12px">' + esc(l.dalsiKrok || 'nedefinováno') + (l.dalsiKrokDatum ? ' · ' + dat(l.dalsiKrokDatum) : '') + '</td>' +
          '<td style="text-align:right"><button class="btn btn-o btn-xs" onclick="formLead(\'' + l.id + '\')">Naplánovat krok</button></td></tr>';
      });
      h += '</tbody></table>';
    }
    h += '</div></div>';

    /* kapacita */
    var pretizeni = (D.uzivatele || []).map(function (us) {
      return { u: us, n: naplanovano(us.id, 7) };
    }).filter(function (x) { return x.u.kapacita && x.n > x.u.kapacita; });
    if (pretizeni.length) {
      h += '<div class="card"><div class="card-h"><h2>Kapacita — přetížení na příští týden</h2></div><div class="card-b">';
      pretizeni.forEach(function (x) {
        h += '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)">' +
          ownHtml(x.u.id) + '<div style="flex:1"><b>' + esc(x.u.jmeno) + '</b><div class="muted" style="font-size:12px">naplánováno ' + h1(x.n) + ' h při kapacitě ' + x.u.kapacita + ' h/týden</div></div>' +
          '<button class="btn btn-o btn-xs" onclick="jdi(\'tym\')">Rozdělit práci</button></div>';
      });
      h += '</div></div>';
    }
    return h;
  };

  /* ═══ 8. TIMER ═══ */
  W.timerStart = function (projektId, ukolId) {
    if (D.timer) { toast('Timer už běží — nejdřív ho zastav'); return; }
    D.timer = { projektId: projektId || '', ukolId: ukolId || '', start: new Date().toISOString(), uzivatel: D.ja };
    uloz(); kresliTimer(); toast('Timer spuštěn');
  };

  W.timerStop = function () {
    if (!D.timer) return;
    var t = D.timer, ms = new Date() - new Date(t.start);
    var hodiny = Math.max(0.05, Math.round(ms / 36e5 * 100) / 100);
    var pole = (D.projekty || []).map(function (p) { return '<option value="' + p.id + '"' + (p.id === t.projektId ? ' selected' : '') + '>' + esc(p.nazev) + '</option>'; }).join('');
    modal('Zastavit timer — zapsat čas',
      '<div class="f"><label>Projekt *</label><select id="tm-projekt"><option value="">— vyber —</option>' + pole + '</select></div>' +
      '<div class="frow"><div class="f"><label>Hodin</label><input id="tm-hodiny" value="' + hodiny + '"></div>' +
      '<div class="f"><label>Datum</label><input id="tm-datum" type="date" value="' + dnesISO() + '"></div></div>' +
      '<div class="f"><label>Co jsi dělal</label><input id="tm-pozn" placeholder="Např. Design podstránek"></div>' +
      '<div class="muted" style="font-size:11.5px;margin-top:6px">Naměřeno ' + hodiny + ' h. Hodnotu můžeš před uložením upravit.</div>',
      '<button class="btn btn-o btn-s" onclick="timerZrus()">Zahodit</button><button class="btn btn-g btn-s" onclick="timerZapis()">Zapsat čas</button>');
  };

  W.timerZapis = function () {
    var pid = gv('tm-projekt');
    if (!pid) { toast('Vyber projekt'); return; }
    var hod = gvn('tm-hodiny');
    if (!hod || hod <= 0) { toast('Zadej počet hodin'); return; }
    D.cas.push({ id: uid('c'), projektId: pid, ukolId: (D.timer || {}).ukolId || '', uzivatel: D.ja, datum: gv('tm-datum') || dnesISO(), hodiny: hod, pozn: gv('tm-pozn') });
    var p = projekt(pid); if (p) zapisHistorii(p, 'Zapsán čas ' + h1(hod) + ' h (' + (gv('tm-pozn') || 'bez poznámky') + ')');
    D.timer = null; uloz(); zavri(); kresliTimer(); render(); toast('Čas zapsán');
  };

  W.timerZrus = function () {
    if (!confirm('Zahodit naměřený čas bez zápisu?')) return;
    D.timer = null; uloz(); zavri(); kresliTimer();
  };

  W.kresliTimer = function () {
    var el = document.getElementById('tmr12');
    if (!el) return;
    if (!D.timer) {
      el.innerHTML = '<button class="tmr12-b" onclick="timerStart()" title="Spustit měření času">▶ Timer</button>';
      return;
    }
    var t = D.timer, p = projekt(t.projektId);
    var ms = new Date() - new Date(t.start), m = Math.floor(ms / 6e4);
    el.innerHTML = '<div class="tmr12-run"><span class="mono">' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + '</span>' +
      '<span class="tmr12-nm">' + esc(p ? p.nazev : 'bez projektu') + '</span>' +
      '<button class="tmr12-b" onclick="timerStop()">Zastavit</button></div>';
  };

  /* ═══ 9. COMMAND PALETTE + GLOBÁLNÍ HLEDÁNÍ ═══ */
  var AKCE = [
    { t: 'Nový projekt', f: 'formProjekt()' }, { t: 'Nový úkol', f: 'formUkol()' },
    { t: 'Nový klient', f: 'formKlient()' }, { t: 'Nový lead', f: 'formLead()' },
    { t: 'Nová schůzka', f: 'formSchuzka()' }, { t: 'Nový partner', f: 'formPartner()' },
    { t: 'Spustit timer', f: 'timerStart()' },
    { t: 'Přejít: Rizika', f: "jdi('rizika')" }, { t: 'Přejít: Dnes', f: "jdi('dashboard')" },
    { t: 'Přejít: Projekty', f: "jdi('projekty')" }, { t: 'Přejít: Pipeline', f: "jdi('obchod')" },
    { t: 'Přejít: Reporting', f: "jdi('reporting')" }, { t: 'Přejít: Audit', f: "jdi('audit')" },
    { t: 'Uložit tento pohled', f: 'ulozPohled()' }
  ];

  function hledej(q) {
    var v = [], s = q.toLowerCase();
    function m(text) { return String(text || '').toLowerCase().indexOf(s) >= 0; }
    (D.projekty || []).forEach(function (p) { if (m(p.nazev) || m(p.dalsiKrok)) v.push({ kat: 'Projekt', t: p.nazev, s: nazevSluzeb(p), f: "jdi('projekt','" + p.id + "')" }); });
    (D.klienti || []).forEach(function (k) {
      if (m(k.nazev) || m(k.kontakt) || m(k.email) || (k.kontakty || []).some(function (o) { return m(o.jmeno) || m(o.email); }))
        v.push({ kat: 'Klient', t: k.nazev, s: k.kontakt || '', f: "jdi('klient','" + k.id + "')" });
    });
    (D.leady || []).forEach(function (l) { if (m(l.nazev) || m(l.firma) || m(l.kontakt)) v.push({ kat: 'Lead', t: l.nazev, s: l.firma || '', f: "formLead('" + l.id + "')" }); });
    (D.ukoly || []).forEach(function (t) {
      if (m(t.nazev)) { var p = projekt(t.projektId); v.push({ kat: 'Úkol', t: t.nazev, s: p ? p.nazev : '', f: p ? "jdi('projekt','" + p.id + "','ukoly')" : "jdi('ukoly')" }); }
    });
    (D.partneri || []).forEach(function (pa) { if (m(pa.jmeno) || m(pa.spec)) v.push({ kat: 'Partner', t: pa.jmeno, s: pa.spec || '', f: "jdi('partneri')" }); });
    ['metodiky', 'sablony', 'sluzby'].forEach(function (kat) {
      ((D.kb || {})[kat] || []).forEach(function (a) { if (m(a.nazev) || m(a.obsah)) v.push({ kat: 'Knowledge Base', t: a.nazev, s: kat, f: "jdi('kb',null,'" + kat + "')" }); });
    });
    (D.pohledy || []).forEach(function (p) { if (m(p.nazev)) v.push({ kat: 'Uložený pohled', t: p.nazev, s: '', f: "jdi('" + p.route + "'," + (p.arg ? "'" + p.arg + "'" : 'null') + "," + (p.sub ? "'" + p.sub + "'" : 'null') + ")" }); });
    AKCE.forEach(function (a) { if (m(a.t)) v.push({ kat: 'Akce', t: a.t, s: '', f: a.f }); });
    return v.slice(0, 40);
  }

  W.paletaOtevri = function () {
    var el = document.getElementById('pal12');
    if (!el) return;
    el.innerHTML = '<div class="pal12-ov" onclick="if(event.target===this)paletaZavri()"><div class="pal12-box">' +
      '<input id="pal12-q" placeholder="Hledej projekt, klienta, úkol, partnera — nebo napiš akci (nový projekt, timer…)" autocomplete="off">' +
      '<div id="pal12-res" class="pal12-res"></div>' +
      '<div class="pal12-f">Enter otevře první výsledek · Esc zavře · Ctrl/Cmd + K</div></div></div>';
    var q = document.getElementById('pal12-q');
    q.addEventListener('input', function () { paletaVypis(q.value); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = document.querySelector('#pal12-res .pal12-i');
        if (first) first.click();
      }
    });
    paletaVypis('');
    q.focus();
  };

  W.paletaVypis = function (q) {
    var res = document.getElementById('pal12-res');
    if (!res) return;
    var items = q && q.length >= 1 ? hledej(q) : AKCE.map(function (a) { return { kat: 'Akce', t: a.t, s: '', f: a.f }; });
    if (!items.length) { res.innerHTML = '<div class="pal12-e">Nic nenalezeno. Zkus jiné slovo, nebo napiš „nový projekt“.</div>'; return; }
    res.innerHTML = items.map(function (i) {
      return '<button class="pal12-i" onclick="paletaZavri();' + i.f.replace(/"/g, '&quot;') + '">' +
        '<span class="pal12-k">' + esc(i.kat) + '</span><span class="pal12-t">' + esc(i.t) + '</span>' +
        (i.s ? '<span class="pal12-s">' + esc(i.s) + '</span>' : '') + '</button>';
    }).join('');
  };

  W.paletaZavri = function () { var el = document.getElementById('pal12'); if (el) el.innerHTML = ''; };

  W.ulozPohled = function () {
    var nazev = prompt('Název pohledu (např. „Moje kritické projekty“):');
    if (!nazev) return;
    D.pohledy.push({ id: uid('pv'), nazev: nazev, route: route, arg: arg, sub: sub, uzivatel: D.ja });
    uloz(); toast('Pohled uložen — najdeš ho v Ctrl+K');
  };

  /* ═══ 10. INIT ═══ */
  W.init12 = function () {
    /* CSS pro timer a paletu */
    var st = document.createElement('style');
    st.textContent =
      '#tmr12{position:fixed;right:18px;bottom:18px;z-index:60}' +
      '.tmr12-b{background:var(--ink);color:#fff;border:0;border-radius:5px;padding:9px 13px;font-size:12.5px;font-family:var(--f-b);cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18)}' +
      '.tmr12-run{display:flex;align-items:center;gap:10px;background:var(--white);border:1px solid var(--line-2);border-left:3px solid var(--gold-deep);border-radius:6px;padding:8px 11px;box-shadow:0 4px 14px rgba(0,0,0,.12)}' +
      '.tmr12-nm{font-size:12px;color:var(--ink-2);max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pal12-ov{position:fixed;inset:0;background:rgba(26,24,20,.45);z-index:90;display:flex;align-items:flex-start;justify-content:center;padding-top:9vh}' +
      '.pal12-box{width:min(680px,92vw);background:var(--white);border:1px solid var(--line-2);border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,.25);overflow:hidden}' +
      '#pal12-q{width:100%;border:0;border-bottom:1px solid var(--line);padding:15px 17px;font-size:14.5px;font-family:var(--f-b);outline:none}' +
      '.pal12-res{max-height:52vh;overflow:auto}' +
      '.pal12-i{display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);padding:10px 17px;cursor:pointer;font-family:var(--f-b);font-size:13px}' +
      '.pal12-i:hover{background:var(--paper)}' +
      '.pal12-k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);min-width:104px}' +
      '.pal12-t{flex:1;color:var(--ink-1);font-weight:500}' +
      '.pal12-s{font-size:11.5px;color:var(--ink-3)}' +
      '.pal12-f{padding:9px 17px;font-size:11px;color:var(--ink-3);background:var(--paper)}' +
      '.pal12-e{padding:16px 17px;font-size:13px;color:var(--ink-3)}';
    document.head.appendChild(st);

    var tw = document.createElement('div'); tw.id = 'tmr12'; document.body.appendChild(tw);
    var pw = document.createElement('div'); pw.id = 'pal12'; document.body.appendChild(pw);

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); paletaOtevri(); }
      if (e.key === 'Escape') paletaZavri();
    });

    wrap12();
    kresliTimer();
    setInterval(function () { if (D && D.timer) kresliTimer(); }, 30000);
  };
})();
