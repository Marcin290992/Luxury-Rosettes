# Błędy i poprawki

## About na mobile/tablecie: cofanie bez przejścia i ucięcie w połowie

**Objaw:** po cofnięciu z podstrony About na telefonie lub tablecie nie było przejścia między stronami. W połowie strona ucinała się twardo. Na innych podstronach działało poprawnie. Występowało tylko na mobile i tablecie, przy dużym portrecie ze zdjęciem.

**Przyczyna:** przy wyjściu ze strony kod wygaszał żywe warstwy, w tym duży portret z maską i filtrem. Na telefonie to się zacinało, a strona ucinała się w połowie.

**Poprawka:** na About, na ekranach do 1024px lub z dotykiem, strona jest zasłaniana jedną czarną warstwą (krycie 0 → 1 przez 0,5 s), zamiast wygaszania portretu.

**Plik:** `src/utils/pageTransitions.ts`, funkcja `preparePageExit`.

**Ograniczenie:** cofnięcie gestem krawędziowym w iOS Safari (swipe-back) ma animację przeglądarki, której kod strony nie przechwytuje.

## About na mobile: blur portretu zacinał animację

**Objaw:** portret na About miał na desktopie blur przy wejściu, a na mobile trzeba go było wyłączyć, bo animacja się zacinała.

**Przyczyna:** blur był animowany na kontenerze z maską, więc przy każdej klatce rozmywanie i maskowanie liczyło się od nowa.

**Poprawka:** blur jest tylko na samym zdjęciu, w jednym filtrze razem z szarością i jasnością (`grayscale contrast brightness blur`, 28px → 0). Kontener z maską animuje samo krycie.

**Plik:** `src/pages/about.astro`, funkcja `initAboutContent` (gałąź mobile).

**Gdyby zacinało:** zmniejszyć promień blura, np. do 16px.

## Why Bengals: skok na początku palenia i przesunięcie napisu

**Objaw:** gdy po napisie BENGALS zaczynało się palenie, plama pojawiała się od razu jako średnia, a napis lekko skakał. Miało rosnąć od małej plamki razem ze scrollem.

**Przyczyna:** trzy rzeczy naraz.
1. Miękka krawędź plamy w shaderze miała stałą szerokość (0,16), niezależną od promienia, więc już przy pierwszym ułamku scrolla pojawiała się plama o jej rozmiarze.
2. Napis w SVG ma `dominant-baseline: central`, a w canvasie (`bake`) było `textBaseline='middle'`. To różne środki, więc napis w canvasie leżał kilka px obok.
3. Po podmianie SVG na canvas canvas rysował się dopiero w następnej klatce, a zdjęcie i napis znikały od razu, więc przez jedną klatkę nie było nic.

**Poprawka:**
1. Szerokość miękkiej krawędzi rośnie z promieniem (`grow = clamp(uRadius / 0.35, 0.03, 1)`), a palenie ma łagodny start (`power1.in` zamiast `none`).
2. Linia bazowa napisu w canvasie liczona z metryk fontu (`fontBoundingBoxAscent` i `fontBoundingBoxDescent`), tekst z `textBaseline='alphabetic'`.
3. `show(true)` rysuje canvas natychmiast, zanim zniknie prawdziwe zdjęcie.

**Pliki:** `src/scripts/ember-burn.ts` (`FIELD_FRAGMENT`, `show`), `src/components/WhyBengals.astro` (`bake`, ease palenia).

**Gdyby wracało:** przyspieszony start → `power2.in` zamiast `power1.in`. Skok zdjęcia w literach → sprawdzić zgodność kadru (`object-position` w CSS i `0.35` w `drawImage`).

## Commity

- `51afbee` — wyjście z About na telefonie/tablecie przez czarną warstwę
- `f9dba08` — rozmyta kopia portretu (zastąpiona w kolejnym commicie)
- `d26577a` — prawdziwy blur na samym zdjęciu
