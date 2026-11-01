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

## Hero i druga sekcja zostają przyciemnione po powrocie na górę

**Objaw:** po przewinięciu strony w dół i powrocie na samą górę hero (razem z napisem) było ciemniejsze, jakby leżała na nim szara warstwa. Zostawało tak już na stałe, do odświeżenia strony. Dotyczyło laptopów i szerszych ekranów.

**Przyczyna:** hero przyciemnia się (`.stage-dim`), gdy zasłania je następna sekcja. Trigger tego przyciemnienia zależy od pozycji tej sekcji, która z kolei zależy od pin-spacera hero. Przy zmianie rozmiaru okna (także zmiana skali strony, otwarcie DevTools) ScrollTrigger mierzy wszystko od nowa. Trigger przyciemnienia był wtedy mierzony przed pin-spacerem hero, więc dostawał start `-870` i koniec `0`. Dla niego scroll od zawsze był „za końcem”, więc przyciemnienie zostawało na 0,5 na każdej pozycji. Odtworzone testem: przewinąć w głąb, zmienić rozmiar okna, wrócić na górę.

**Poprawka:** hero ma `refreshPriority: 2` (mierzone pierwsze), a trigger przyciemnienia `refreshPriority: 1` i `invalidateOnRefresh: true`. Po zmianie rozmiaru start wraca do tej samej wartości co przed nią (4680), a przyciemnienie na górze jest 0.

**Plik:** `src/scripts/stage/desktop.ts` (timeline hero i przyciemnienie przy zasłanianiu).

**Gdyby wracało:** to ten sam mechanizm, co przy WhyBengals: trigger zależny od pozycji elementu pod pinem musi mieć niższy `refreshPriority` niż pin, od którego zależy. Sprawdzić `ScrollTrigger.getAll()` po zmianie rozmiaru: start i koniec triggera nie mogą być ujemne.

## Commity

- `51afbee` — wyjście z About na telefonie/tablecie przez czarną warstwę
- `f9dba08` — rozmyta kopia portretu (zastąpiona w kolejnym commicie)
- `d26577a` — prawdziwy blur na samym zdjęciu
