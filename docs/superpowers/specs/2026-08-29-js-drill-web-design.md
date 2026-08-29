# js-drill: lekcija + izvršiv zadatak

Dizajn, 2026-08-29.

## Problem

Trenutni sistem šalje jedno pitanje na telefon i rešenje sledeći put. Tri
stvari ne rade:

1. **Ne uči, samo ispituje.** Vežba pretpostavlja da temu već znaš. Traženo je
   da prvo objasni koncept, pa proveri razumevanje.
2. **Zadatak se ne može uraditi na telefonu.** Format `challenge` traži da
   napišeš funkciju. Na telefonu nemaš gde.
3. **Ništa se ne čuva.** `state.json` drži samo tekuću vežbu i prepisuje je
   svaki run (`drill.mjs:155`). `history` pamti samo oznake tema, poslednjih 25
   (`drill.mjs:157`). Tekst vežbe je nepovratno izgubljen posle ~12 sati.

## Cilj

Svako pokretanje isporuči **lekciju** pa **zadatak**. Zadatak rešavaš na
telefonu, u browseru, pisanjem koda koji se stvarno izvršava protiv test
slučajeva. Sve vežbe ostaju trajno sačuvane i čitljive.

Ono što ostaje netaknuto: Mac generiše, launchd raspoređuje, ntfy isporučuje.

## Arhitektura

```
08:00 / 20:00
     │
     ▼
  Mac (launchd) ──► claude -p ──► lekcija + zadatak + testovi
     │
     ├─► self-check: referentno rešenje se pokrene protiv testova
     │   (ako padne → regeneracija, do 3 pokušaja)
     │
     ├─► commit + push ──► GitHub repo
     │                        ├─ docs/drills/<id>.json   podaci + arhiva
     │                        └─ docs/index.html          stranica (Pages)
     │
     └─► ntfy ──► telefon
                    notifikacija 1: Lekcija
                    notifikacija 2: Zadatak  [Reši] ──► otvara stranicu
                                                          │
                                                     pišeš kod,
                                                     testovi u Web Worker-u,
                                                     prolazi / ne prolazi
```

GitHub je istovremeno skladište, arhiva i hosting. ntfy je samo kurir. Nema
baze, nema servera, nema mesečnog troška. Stranica radi i kad je Mac ugašen jer
čita statične fajlove.

**Jedan smer podataka.** Mac piše, telefon čita. Rezultat rešavanja ostaje u
`localStorage` browsera i ne vraća se na Mac. Time otpada povratni kanal,
drugi ntfy topic i svako rukovanje konkurentnim upisima. Ako se kasnije pokaže
da je istorija rešavanja potrebna na Mac-u, dodaje se posebno.

## Repo layout

```
~/js-drill/
  drill.mjs                 orkestracija, ~60 linija
  lib/
    state.mjs               učitavanje i snimanje state.json
    generate.mjs            prompt, poziv claude-a, validacija sheme
    verify.mjs              pokretanje referentnog rešenja protiv testova
    publish.mjs             ntfy push + osascript
    repo.mjs                commit i push
  bank.md                   profil i teme (nepromenjen)
  com.jsdrill.agent.plist
  state.json                lokalno, .gitignore
  drill.log                 lokalno, .gitignore
  docs/                     GitHub Pages root
    .nojekyll
    index.html
    app.js
    style.css
    drills/
      index.json            lista svih vežbi, najnovija prva
      2026-08-29-jutro.json
```

`drill.mjs` je danas 170 linija i sa ovim bi prešao 400. Deli se na module po
odgovornosti — svaki radi jednu stvar i može da se testira sam.

## Format vežbe

```json
{
  "id": "2026-08-29-jutro",
  "createdAt": "2026-08-29T06:00:00.000Z",
  "slot": "jutro",
  "format": "challenge",
  "topic": "Reference i kopiranje",
  "lesson": {
    "title": "Plitko vs duboko kopiranje",
    "body": "Markdown. 4-8 rečenica: šta je, kako se piše, kako se gradi, gde puca."
  },
  "task": {
    "title": "Duboko zamrzavanje",
    "brief": "Napiši funkciju koja rekurzivno zamrzava objekat.",
    "signature": "function deepFreeze(obj)",
    "starter": "function deepFreeze(obj) {\n  // tvoj kod\n}",
    "tests": [
      {
        "name": "zamrzava ugnježdeni objekat",
        "code": "const o = { a: { b: 1 } };\ndeepFreeze(o);\no.a.b = 2;\nassert.equal(o.a.b, 1);"
      }
    ]
  },
  "answer": "Referentno rešenje, pun kod.",
  "explanation": "Do 3 rečenice."
}
```

Testovi su JS isečci koji rade protiv globalno dostupne korisničke funkcije i
minimalnog `assert` helpera (`equal`, `deepEqual`, `throws`, `ok`). Ne uvodi se
test framework — helper je ~20 linija i deli ga i Node i browser.

Format i dalje rotira `mcq` → `challenge` → `debug`, ali sva tri sada nose
lekciju. Kod `mcq` i `debug` polje `task.tests` proverava izabrani odgovor
odnosno ispravljeni kod, pa je izvršavanje jedinstveno za sve formate.

## Generacija i samo-validacija

Najveći rizik nove sheme: model generiše testove koji su sami po sebi netačni.
Tada bi ti tačno rešenje prijavljivalo pad, što je gore od nepostojanja testova.

Zato `verify.mjs` pre objave pokreće **referentno rešenje** (`answer`) protiv
generisanih testova u Node-u, u odvojenom `node:worker_threads` radniku sa
timeout-om. Vežba se objavljuje samo ako svi testovi prođu. Ako padne, prompt se
ponavlja sa opisom greške, najviše tri puta; posle toga run se prekida i log
beleži razlog. Bolje preskočen termin nego pokvarena vežba.

Isti `assert` helper i isti runner koriste se i u browseru, pa je ponašanje
identično.

## Isporuka

Dve notifikacije po pokretanju, plus rešenje prethodne ako postoji:

| # | naslov | telo | priority | action |
|---|---|---|---|---|
| 0 | `Rešenje: <naslov>` | `answer` + `explanation` | 2 | — |
| 1 | `Lekcija: <lesson.title>` | `lesson.body` | 3 | — |
| 2 | `Zadatak: <task.title>` | `task.brief` | 4 | `view` → stranica |

`view` action vodi na `https://<user>.github.io/js-drill/?d=<id>`. ntfy dozvoljava
najviše tri action-a po poruci; koristi se jedan.

Rešenje i dalje stiže tek **sledećim** pokretanjem, da ostane vremena za
razmišljanje.

## Stranica

Jedan `index.html`, bez build koraka i bez zavisnosti. Otvara se iz notifikacije,
čita `?d=<id>`, dovlači `docs/drills/<id>.json` sa istog origin-a.

Prikaz odozgo naniže: lekcija, pa zadatak, pa editor sa `starter` kodom, pa
dugme **Pokreni**. Ispod dugmeta lista testova sa statusom.

Editor je `<textarea>` sa monospace fontom, tab handler-om i isključenim
autocapitalize/autocorrect. Nije CodeMirror — na telefonu pišeš pet linija, ne
treba ti IDE, a zavisnost bi bila veća od cele ostale stranice.

Kod se izvršava u **Web Worker-u** sa 2s timeout-om, da beskonačna petlja ne
zamrzne stranicu. Worker vraća rezultat po testu: prošao, pao sa porukom, ili
timeout.

Rešenje je skriveno iza `<details>` da ga ne vidiš slučajno pre nego što
probaš.

`docs/index.html` bez `?d` parametra prikazuje **arhivu** — listu svih vežbi iz
`drills/index.json`, najnovija prva, svaka vodi na svoju stranicu.

Dodaje se `manifest.json` sa `display: standalone` i ikonicom, pa se sa
"Add to Home Screen" ponaša kao app: ikonica, ceo ekran, bez URL bara.

Napredak (tvoj kod i rezultati) čuva se u `localStorage` po `id`-u vežbe, pa
zatvaranje taba ne gubi rad.

## Arhiva

Nastaje sama. Svaka vežba je jedan fajl u `docs/drills/`, svaki run je jedan
commit. Dobijaš je verzionisanu, sa datumima, pretraživu kroz `git log` i
`grep`, čitljivu na Mac-u, kroz GitHub UI, i kroz samu stranicu. Poseban
`archive.md` se ne pravi — dupliralo bi podatke.

`state.json` ostaje samo za `pending` i `history` i ne ide u git.

## Autentifikacija za push

**Ovo je nađeno pri proveri i mora da se reši pre nego što launchd proradi.**

Trenutno stanje: `gh` je ulogovan (nalog `NM193`, scope `repo`), ali
`git config credential.helper` je prazan i nema SSH ključa u `~/.ssh`. Znači
`git push` nema čime da se autentifikuje. Ručno bi tražio lozinku, a pod
launchd-om bi pukao bez traga.

Rešenje: SSH deploy ključ bez passphrase-a, dodat na GitHub nalog, i `remote`
preko `git@github.com`. Ne dira macOS Keychain, pa radi iz launchd konteksta bez
prompta.

Alternativa `gh auth setup-git` postavlja `gh` kao credential helper, ali on
čita token iz Keychain-a — a pristup Keychain-u iz LaunchAgent-a ume da traži
otključavanje i nije pouzdan bez interakcije. Zato SSH.

Push se izvršava sa `--quiet` i greška se hvata: ako push padne, notifikacije
svejedno odlaze (vežba je generisana), a log beleži da repo nije ažuriran.
Isporuka ne sme da zavisi od git-a.

## Rukovanje greškama

| slučaj | ponašanje |
|---|---|
| `claude` vrati nevalidan JSON | retry do 3 puta, pa prekid uz log |
| referentno rešenje padne na svojim testovima | retry do 3 puta, pa prekid uz log |
| test se vrti duže od 2s (Node ili browser) | prekid tog testa, prijavljen kao timeout |
| ntfy nedostupan | prekid uz log, `state.json` se ne menja da se vežba ne izgubi |
| `git push` padne | notifikacije ipak odlaze, log beleži |
| stranica ne nađe `?d` | prikazuje arhivu |
| stranica ne nađe fajl vežbe | poruka da vežba još nije objavljena |

`state.json` se snima **tek posle** uspešne isporuke, da neuspeo run ne pojede
vežbu.

## Testiranje

- `lib/verify.mjs` — testovi sa namerno tačnim i namerno netačnim rešenjem
- `lib/generate.mjs` — validacija sheme na fiksnim JSON uzorcima, bez poziva modela
- `assert` helper — svaki matcher, i prolaz i pad
- runner u browseru — ručna provera: tačno rešenje, netačno, beskonačna petlja
- end-to-end — `node drill.mjs` sa test topicom i test repoom

## Van opsega

Namerno izostavljeno dok se ne pokaže da treba:

- spaced repetition i vraćanje starih tema
- praćenje uspešnosti na Mac-u i statistika
- backend, baza, nalozi
- native app
- offline rad preko Service Worker-a
- A/B/C action dugmad — testovi ih zamenjuju

## Migracija

Postojeći `state.json` ostaje kompatibilan: `pending` iz stare sheme nema
`lesson` ni `task`, pa se njegovo rešenje isporuči po starom i posle toga se
prelazi na novu shemu. Bez ručnog brisanja.
