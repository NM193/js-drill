# js-drill

Dve male JS vezbe dnevno, na telefon. Mac generise, ntfy isporucuje.

```
08:00  ->  pitanje
20:00  ->  resenje jutarnjeg + novo pitanje
08:00  ->  resenje veceranjeg + novo pitanje
...
```

Format rotira: `mcq` -> `challenge` -> `debug`.

## 1. Telefon

1. Instaliraj **ntfy** iz Play Store-a.
2. Pretplati se na topic sa nasumicnim imenom, npr. `js-drill-7f2k9qx`.
   Topic je javan svakome ko pogodi ime, zato koristi nasumican string.

## 2. Mac

```bash
mv js-drill ~/js-drill
cd ~/js-drill

# Putevi koje treba da upises u plist:
which node
which claude
echo $HOME
```

Otvori `com.jsdrill.agent.plist` i zameni sva tri `ZAMENI` mesta:
`USERNAME`, put do `node`, put do `claude`, i `NTFY_TOPIC`.

## 3. Probni run

```bash
cd ~/js-drill
NTFY_TOPIC=js-drill-7f2k9qx node drill.mjs
```

Ako notifikacija stigne na telefon, radi. Ako ne, pogledaj `drill.log`.

## 4. Ukljuci raspored

```bash
cp com.jsdrill.agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.jsdrill.agent.plist

# Provera
launchctl list | grep jsdrill
```

Da iskljucis:

```bash
launchctl unload ~/Library/LaunchAgents/com.jsdrill.agent.plist
```

## Napomene

- Ako je Mac uspavan u 08:00, launchd pokrece zadatak cim se probudi.
  Ako je ugasen, taj termin se preskace.
- `state.json` cuva pending vezbu i istoriju tema (zadnjih 25) da se
  pitanja ne ponavljaju. Obrisi ga za cist start.
- Menjanje tema i tezine: `bank.md`. To je jedini fajl koji treba da dirash
  u normalnom radu.
- Menjanje termina: `StartCalendarInterval` u plist-u, pa `unload` + `load`.
