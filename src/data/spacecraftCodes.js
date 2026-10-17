// Übersetzungen der CelesTrak-SATCAT-Codes ins Deutsche.
// Grundlage: CelesTrak „SATCAT Sources“ (celestrak.org/satcat/sources.php), „Launch Sites“
// (celestrak.org/satcat/launchsites.php) und „Operational Status“ (celestrak.org/satcat/status.php), Stand 2026-10.
// Codes, die in der Liste fehlen, aber im Katalog vorkommen (SVK, KWT, JOR, UGA), sind ergänzt.

export const OWNER_DE = {
  AB: 'Arabsat (Arabische Satellitenorganisation)', ABS: 'Asia Broadcast Satellite', AC: 'AsiaSat',
  ALG: 'Algerien', ANG: 'Angola', ARGN: 'Argentinien', ARM: 'Armenien', ASRA: 'Österreich', AUS: 'Australien', AZER: 'Aserbaidschan',
  BEL: 'Belgien', BELA: 'Belarus', BERM: 'Bermuda', BGD: 'Bangladesch', BHR: 'Bahrain', BHUT: 'Bhutan', BOL: 'Bolivien', BRAZ: 'Brasilien',
  BUL: 'Bulgarien', BWA: 'Botsuana', CA: 'Kanada', CHBZ: 'China/Brasilien', CHTU: 'China/Türkei', CHLE: 'Chile',
  CIS: 'Sowjetunion/GUS (Russland)', COL: 'Kolumbien', CRI: 'Costa Rica', CZCH: 'Tschechien (ehem. Tschechoslowakei)', DEN: 'Dänemark',
  DJI: 'Dschibuti', ECU: 'Ecuador', EGYP: 'Ägypten', ESA: 'Europäische Weltraumorganisation (ESA)', ESRO: 'ESRO (Vorläufer der ESA)',
  EST: 'Estland', ETH: 'Äthiopien', EUME: 'EUMETSAT', EUTE: 'Eutelsat', FGER: 'Frankreich/Deutschland', FIN: 'Finnland', FR: 'Frankreich',
  FRIT: 'Frankreich/Italien', GER: 'Deutschland', GHA: 'Ghana', GLOB: 'Globalstar', GREC: 'Griechenland', GRSA: 'Griechenland/Saudi-Arabien',
  GUAT: 'Guatemala', HRV: 'Kroatien', HUN: 'Ungarn', IM: 'Inmarsat', IND: 'Indien', INDO: 'Indonesien', IRAN: 'Iran', IRAQ: 'Irak',
  IRID: 'Iridium', IRL: 'Irland', ISRA: 'Israel', ISRO: 'Indische Raumfahrtorganisation (ISRO)', ISS: 'Internationale Raumstation',
  IT: 'Italien', ITSO: 'Intelsat', JOR: 'Jordanien', JPN: 'Japan', KAZ: 'Kasachstan', KEN: 'Kenia', KWT: 'Kuwait', LAOS: 'Laos',
  LKA: 'Sri Lanka', LTU: 'Litauen', LUXE: 'Luxemburg', MA: 'Marokko', MALA: 'Malaysia', MCO: 'Monaco', MDA: 'Moldau', MEX: 'Mexiko',
  MMR: 'Myanmar', MNE: 'Montenegro', MNG: 'Mongolei', MUS: 'Mauritius', NATO: 'NATO', NETH: 'Niederlande', NICO: 'New ICO',
  NIG: 'Nigeria', NKOR: 'Nordkorea', NOR: 'Norwegen', NPL: 'Nepal', NZ: 'Neuseeland', O3B: 'O3b Networks', ORB: 'Orbcomm',
  PAKI: 'Pakistan', PERU: 'Peru', POL: 'Polen', POR: 'Portugal', PRC: 'China', PRY: 'Paraguay', PRES: 'China/ESA', QAT: 'Katar',
  RASC: 'RascomStar-QAF', ROC: 'Taiwan', ROM: 'Rumänien', RP: 'Philippinen', RWA: 'Ruanda', SAFR: 'Südafrika', SAUD: 'Saudi-Arabien',
  SDN: 'Sudan', SEAL: 'Sea Launch', SEN: 'Senegal', SES: 'SES', SGJP: 'Singapur/Japan', SING: 'Singapur', SKOR: 'Südkorea',
  SLB: 'Salomonen', SPN: 'Spanien', STCT: 'Singapur/Taiwan', SVK: 'Slowakei', SVN: 'Slowenien', SWED: 'Schweden', SWTZ: 'Schweiz',
  TBD: 'noch nicht zugeordnet', THAI: 'Thailand', TMMC: 'Turkmenistan/Monaco', TUN: 'Tunesien', TURK: 'Türkei', UAE: 'Vereinigte Arabische Emirate',
  UGA: 'Uganda', UK: 'Vereinigtes Königreich', UKR: 'Ukraine', UNK: 'unbekannt', URY: 'Uruguay', US: 'USA', USBZ: 'USA/Brasilien',
  VAT: 'Vatikanstadt', VENZ: 'Venezuela', VTNM: 'Vietnam', ZWE: 'Simbabwe',
};

export const SITE_DE = {
  AFETR: 'Cape Canaveral / Kennedy (Florida, USA)', AFWTR: 'Vandenberg (Kalifornien, USA)', ANDSP: 'Andøya (Norwegen)',
  ALCLC: 'Alcântara (Brasilien)', BOS: 'Bowen Orbital Spaceport (Australien)', CAS: 'Luftraum über den Kanaren (Luftstart)',
  DLS: 'Dombarowski/Jasny (Russland)', ERAS: 'Luftraum Eastern Range (Luftstart, USA)', FRGUI: 'Kourou (Französisch-Guayana)',
  HGSTR: 'Hammaguir (Algerien)', JJSLA: 'Seestartgebiet Jeju (Südkorea)', JSC: 'Jiuquan (China)', KODAK: 'Kodiak (Alaska, USA)',
  KSCUT: 'Uchinoura/Kagoshima (Japan)', KWAJ: 'Kwajalein-Atoll (Marshallinseln)', KYMSC: 'Kapustin Jar (Russland)', NSC: 'Naro (Südkorea)',
  PLMSC: 'Plessezk (Russland)', RLLB: 'Mahia (Neuseeland, Rocket Lab)', SCSLA: 'Seestartgebiet Südchinesisches Meer (China)',
  SEAL: 'Sea-Launch-Plattform (Pazifik)', SEMLS: 'Semnan (Iran)', SMTS: 'Schahrud (Iran)', SNMLP: 'San-Marco-Plattform (Kenia)',
  SPKII: 'Spaceport Kii (Japan)', SRILR: 'Satish Dhawan, Sriharikota (Indien)', STARB: 'Starbase (Texas, USA)', SUBL: 'U-Boot-Start (mobil)',
  SVOBO: 'Swobodny (Russland)', TAISC: 'Taiyuan (China)', TANSC: 'Tanegashima (Japan)', TYMSC: 'Baikonur (Kasachstan)', UNK: 'unbekannt',
  VOSTO: 'Wostotschny (Russland)', WLPIS: 'Wallops Island (Virginia, USA)', WOMRA: 'Woomera (Australien)',
  WRAS: 'Luftraum Western Range (Luftstart, USA)', WSC: 'Wenchang (China)', XICLF: 'Xichang (China)', YAVNE: 'Palmachim/Yavne (Israel)',
  YSLA: 'Seestartgebiet Gelbes Meer (China)', YUN: 'Sohae/Yunsong (Nordkorea)',
};

export const TYPE_DE = { PAY: 'Nutzlast', 'R/B': 'Raketenstufe', DEB: 'Trümmer', UNK: 'unbekannt' };

export const OPS_DE = {
  '+': 'in Betrieb', '-': 'außer Betrieb', P: 'teilweise in Betrieb', B: 'Reserve/Standby', S: 'Ersatz (noch nicht aktiviert)',
  X: 'erweiterte Mission', D: 'verglüht/zurückgekehrt', '?': 'unbekannt',
};

// Bahnzentrum (ORBIT_CENTER); Zahlen = NORAD-Nummer des Objekts, an das gekoppelt ist (z. B. 25544 = ISS)
export const CENTER_DE = {
  EA: 'Erde', SU: 'Sonne', MO: 'Mond', MA: 'Mars', VE: 'Venus', ME: 'Merkur', JU: 'Jupiter', SA: 'Saturn', AS: 'Asteroid',
  EM: 'Erde–Mond-System', EL1: 'Sonne–Erde-L1', EL2: 'Sonne–Erde-L2', SS: 'Fluchtbahn aus dem Sonnensystem',
};
export const ORBITTYPE_DE = { ORB: 'Umlaufbahn', LAN: 'gelandet', IMP: 'eingeschlagen/verglüht', DOC: 'angekoppelt', ROT: 'Rücklauf', 'R/T': 'Hin- und Rückflug' };
