// Demo dataset — twelve plausible German SMB leads. Dates are generated
// relative to "now" so staleness signals stay meaningful whenever the demo
// is opened, including weeks after submission.

function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 24, 0, 0);
  return d.toISOString();
}

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

let seq = 0;
function lead(data) {
  seq += 1;
  return {
    id: `L-${String(seq).padStart(3, '0')}`,
    numericId: seq,
    role: '',
    source: 'manual',
    createdAt: daysAgo(data.ageDays + 20),
    notes: [],
    nextStep: null,
    ...data,
  };
}

export function seedLeads() {
  seq = 0;
  return [
    lead({
      company: 'Mahlwerck Porzellan GmbH', contact: 'Katharina Mahlwerck', role: 'Geschäftsführerin',
      email: 'k.mahlwerck@mahlwerck-porzellan.de', city: 'Stuttgart', value: 14400, stage: 'proposal',
      lastTouch: daysAgo(3), ageDays: 24,
      notes: ['Sucht Abnehmer für Restposten der Jubiläumsserie (1.200 Teile).'],
      timeline: [
        { ts: daysAgo(24), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(18), type: 'call', actor: 'human', summary: 'Erstgespräch: 20 Min, sehr interessiert an B2B-Bundles.' },
        { ts: daysAgo(9), type: 'stage', actor: 'human', summary: 'Moved contacted → qualified' },
        { ts: daysAgo(3), type: 'email', actor: 'human', summary: 'Angebot SW-1042 versendet (Staffelpreise, 90 Tage Zahlungsziel).' },
      ],
      nextStep: { date: inDays(2), text: 'Angebot nachfassen' },
    }),
    lead({
      company: 'Alba Mechanik KG', contact: 'Jonas Briem', role: 'Einkaufsleitung',
      email: 'briem@alba-mechanik.de', city: 'Esslingen', value: 22600, stage: 'qualified',
      lastTouch: daysAgo(21), ageDays: 40,
      notes: ['Zerspanungsbetrieb, 45 MA. Braucht Q4-Lieferplanung für Alu-Profilteile.'],
      timeline: [
        { ts: daysAgo(40), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(31), type: 'call', actor: 'human', summary: 'Telefonat: Budget freigegeben, Entscheidungsprozess bis Mitte Q4.' },
        { ts: daysAgo(21), type: 'note', actor: 'human', summary: 'Musterzeichnungen erhalten, Prüfung läuft.' },
      ],
    }),
    lead({
      company: 'Café Haldenengl', contact: 'Miriam Osei', role: 'Inhaberin',
      email: 'hallo@cafe-haldenengl.de', city: 'Stuttgart-Bad Cannstatt', value: 3200, stage: 'contacted',
      lastTouch: daysAgo(16), ageDays: 30,
      notes: ['Second-Specialty-Café. Interessiert an Kaffee-Pauschale für 60 Stammkunden.'],
      timeline: [
        { ts: daysAgo(30), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(16), type: 'email', actor: 'human', summary: 'Intro-Mail mit Preisliste gesendet.' },
      ],
    }),
    lead({
      company: 'Donaubau Immobilien GmbH', contact: 'Stefan Kienzle', role: 'Prokurist',
      email: 'kienzle@donaubau.de', city: 'Ulm', value: 48000, stage: 'qualified',
      lastTouch: daysAgo(27), ageDays: 55,
      notes: ['Objektbetreuer für 14 Gewerbeimmobilien. Wartungsvertrag über 24 Monate im Gespräch.'],
      timeline: [
        { ts: daysAgo(55), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(41), type: 'call', actor: 'human', summary: 'Bedarfsanalyse: 14 Objekte, Winterdienst + Techniker-Setup gewünscht.' },
        { ts: daysAgo(27), type: 'meeting', actor: 'human', summary: 'Vor-Ort-Termin Ulm, technische Begehung Objekt Donaucenter.' },
      ],
      nextStep: { date: inDays(-2), text: 'Wartungsvertrag-Entwurf schicken' },
    }),
    lead({
      company: 'Textilreinigung Nowak', contact: 'Petra Nowak', role: 'Inhaberin',
      email: 'info@nowak-reinigung.de', city: 'Ludwigsburg', value: 5400, stage: 'new',
      lastTouch: daysAgo(35), ageDays: 35,
      notes: ['Über Empfehlung von Café Haldenengl. Zwei Standorte, Themen: Textilien + Serviceverträge.'],
      timeline: [
        { ts: daysAgo(35), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
      ],
    }),
    lead({
      company: 'Bergmann Elektrotechnik e.K.', contact: 'Uwe Bergmann', role: 'Inhaber',
      email: 'u.bergmann@bergmann-et.de', city: 'Waiblingen', value: 18700, stage: 'proposal',
      lastTouch: daysAgo(6), ageDays: 48,
      notes: ['Elektro-Großhandel, will Lieferantenrabatte für 220 Gewerbekunden bündeln.'],
      timeline: [
        { ts: daysAgo(48), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(33), type: 'call', actor: 'human', summary: 'Scoping: Rabattmodell + Co-Marketing interessiert ihn stark.' },
        { ts: daysAgo(6), type: 'email', actor: 'human', summary: 'Konditionen v2 + Rahmenvertrag-Entwurf geschickt.' },
      ],
    }),
    lead({
      company: 'Praxis Dr. Teufel', contact: 'Dr. Anke Teufel', role: 'Zahnärztin',
      email: 'praxis@dr-teufel.de', city: 'Stuttgart', value: 7600, stage: 'contacted',
      lastTouch: daysAgo(12), ageDays: 26,
      notes: ['Großpraxis (6 Behandler). Interesse: Hygienematerial-Pauschale quartalsweise.'],
      timeline: [
        { ts: daysAgo(26), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(12), type: 'call', actor: 'human', summary: 'Termin mit Praxismanagerin vereinbart (Fr. Spohr).' },
      ],
      nextStep: { date: inDays(5), text: 'Termin Praxismanagerin' },
    }),
    lead({
      company: 'Fesseler Druck & Medien', contact: 'Roman Fesseler', role: 'Geschäftsführer',
      email: 'r.fesseler@fesseler-druck.de', city: 'Heilbronn', value: 26800, stage: 'won',
      lastTouch: daysAgo(2), ageDays: 62,
      notes: ['Druckerei, 28 MA. Rahmenvertrag über Papier + Chemie signed (12 Monate).'],
      timeline: [
        { ts: daysAgo(62), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(44), type: 'call', actor: 'human', summary: 'Angebot v1, Verhandlung über Zahlungsziel.' },
        { ts: daysAgo(15), type: 'stage', actor: 'human', summary: 'Moved proposal → won' },
        { ts: daysAgo(2), type: 'note', actor: 'human', summary: 'Unterschriebener Vertrag ist da, Onboarding geplant.' },
      ],
    }),
    lead({
      company: 'Härterei Kraus Söhne', contact: 'Wilhelm Kraus', role: 'Betriebsleiter',
      email: 'wkraus@haerterei-kraus.de', city: 'Göppingen', value: 31200, stage: 'contacted',
      lastTouch: daysAgo(19), ageDays: 37,
      notes: ['Wärmebehandlung. Sucht Ersatzteillage für Ofenanlagen (Druckluft + Brenner).'],
      timeline: [
        { ts: daysAgo(37), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(19), type: 'call', actor: 'human', summary: 'Gutes Gespräch, will Angebotsvergleich mit bisherigem Lieferanten.' },
      ],
    }),
    lead({
      company: 'Loop Fitnessstudio GmbH', contact: 'Deniz Aydin', role: 'COO',
      email: 'aydin@loop-fitness.de', city: 'Stuttgart', value: 9900, stage: 'new',
      lastTouch: daysAgo(44), ageDays: 44,
      notes: ['Drei Standorte. Leads kamen über Messekontakt FIBO-Nachbericht.'],
      timeline: [
        { ts: daysAgo(44), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
      ],
    }),
    lead({
      company: 'Weingut Reustein', contact: 'Eva Reustein', role: 'Weingutsleitung',
      email: 'eve@reustein.de', city: 'Esslingen-Mettingen', value: 4100, stage: 'won',
      lastTouch: daysAgo(8), ageDays: 51,
      notes: ['Direktvertrieb. Konsignationslager für Gastronomie-Bundles läuft seit Juni.'],
      timeline: [
        { ts: daysAgo(51), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(23), type: 'stage', actor: 'human', summary: 'Moved proposal → won' },
        { ts: daysAgo(8), type: 'call', actor: 'human', summary: 'Erste Nachbestellung, Zufriedenheit hoch.' },
      ],
    }),
    lead({
      company: 'Südledochnik Handl GmbH', contact: 'Bernd Handl', role: 'Technischer Geschäftsführer',
      email: 'b.handl@suedledochnik.de', city: 'Reutlingen', value: 36200, stage: 'qualified',
      lastTouch: daysAgo(24), ageDays: 58,
      notes: ['Lohnfertigung für Hydraulik. Ausschreibung für Dichtungsset läuft Ende Q4 aus.'],
      timeline: [
        { ts: daysAgo(58), type: 'stage', actor: 'system', summary: 'Created in stage “new”' },
        { ts: daysAgo(38), type: 'call', actor: 'human', summary: 'Ausschreibungsunterlagen angefordert.' },
        { ts: daysAgo(24), type: 'email', actor: 'human', summary: 'Unterlagen erhalten, technisches Matching begonnen.' },
      ],
    }),
  ];
}
