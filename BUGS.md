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

## Page transition na telefonie: skoki wysokości przy przewiniętej stronie

**Objaw:** na Chrome Androidzie przy przejściu między stronami przewinięta strona „podskakiwała” o wysokość paska adresu zanim ruszyła animacja (karta rysowana za wysoko). Dlatego przejście było wyłączone.

**Przyczyna:** natywny View Transition rysuje zrzut strony w przestrzeni największego okna (pasek adresu schowany), a ekran pokazuje okno z paskiem. Różnica pojawia się tylko wtedy, gdy przewija się cały dokument, bo to on chowa i pokazuje pasek.

**Poprawka:** na urządzeniach dotykowych (`pointer: coarse`) dokument się nie przewija, tylko pełnoekranowy kontener `#scroll-root` (tak jak `.projects` w demo codegrid). Pasek adresu się nie rusza, okno ma stałą wysokość, więc zrzut nie ma czego przesuwać. ScrollTrigger dostaje ten kontener jako `scroller` (piny `fixed`), a odczyt i ustawianie scrolla idzie przez `scripts/scroller.ts`. Na laptopie nic się nie zmienia (`#scroll-root` ma tam `display: contents`, przewija okno i Lenis).

**Pliki:** `src/scripts/scroller.ts`, `src/layouts/Layout.astro` (`#scroll-root`, CSS pod `@media (pointer: coarse)`), `src/scripts/lifecycle.ts` (import ustawiający domyślny scroller przed komponentami).

**Pamiętaj przy nowym kodzie:** nie czytaj `window.scrollY` ani nie wołaj `window.scrollTo` — użyj `getScrollY` / `setScrollY` / `onPageScroll` ze `scripts/scroller.ts` (zdarzenie `scroll` kontenera nie dochodzi do `window` bez fazy przechwytywania). Przy `gsap.context()` selektor `scroller` nie działa (szuka tylko w zakresie kontekstu), dlatego domyślny scroller jest elementem, ustawianym po każdym swapie.

**Skutek uboczny:** na telefonie pasek adresu nie chowa się już przy przewijaniu.

### Jak to zrobiono, krok po kroku

**0. Co było wcześniej (i dlaczego nie wystarczyło).** Przez wiele commitów próbowano walczyć ze skutkiem, nie z przyczyną: mierzenie przesunięcia zrzutu (`--vt-old`, `--vt-new`, `measureScb`, `probeScb`), własne karty z kopii DOM (`touch-transition.ts`), welon z logo (`?vt=calm`), Lenis na dotyku i zamrażanie go przed zrzutem (`?vtkeep`). Żadne nie dało pewności, bo dokument nadal się przewijał, a przeglądarka dalej zmieniała wysokość okna. Na końcu przejście wyłączono (`PT_OFF`, `document.startViewTransition = undefined`).

**1. Diagnoza.** Demo codegrid (`src/codegrid-view-page-transition`) skacze tylko dlatego, że jego strony `.home`/`.info` są `100svh`, a `.projects` ma własny `overflow-y: auto`. Czyli tam, gdzie przewija się kontener, a nie dokument, nie ma ruchu paska adresu. Stąd decyzja: przenieść przewijanie z dokumentu do kontenera.

**2. Kontener `#scroll-root` (`Layout.astro`).**
- `<body><div id="scroll-root"><slot /></div></body>`.
- Domyślnie `display: contents` (laptop: kontener nie istnieje dla układu, przewija się okno, działa Lenis, nic się nie zmienia).
- W `@media (pointer: coarse)`: `html, body { height: 100%; overflow: hidden; overscroll-behavior: none }`, a `#scroll-root` to `position: fixed; inset: 0; overflow-y: auto` z ukrytym paskiem i `overscroll-behavior: none`. Podczas preloadera (`html.preloading`) kontener ma `overflow: hidden`, tak jak wcześniej dokument.
- `<ClientRouter>` podmienia `<body>`, więc nowy `#scroll-root` powstaje z każdą stroną; stan scrolla nowej strony zaczyna od 0.

**3. Moduł `src/scripts/scroller.ts`.** Jedno miejsce, które wie, gdzie jest scroll:
- `innerScroll()` — czy to dotyk (`pointer: coarse`),
- `scrollBox()`, `getScrollY()`, `setScrollY(y)` — odczyt/ustawienie pozycji (kontener na dotyku, okno na desktopie),
- `onPageScroll(fn)` — nasłuch na `window` w fazie przechwytywania (zdarzenie `scroll` kontenera nie bąbelkuje do `window`),
- `ScrollTrigger.defaults({ scroller: <element #scroll-root>, pinType: 'fixed' })` ustawiane przy starcie i po każdym `astro:after-swap`.

**4. Podmiana odczytów scrolla** na funkcje z `scroller.ts`: `NavPill.astro` (stan `is-scrolled`, „wróć na górę”), `Corridor.astro`, `ScrollExpand.astro`, `scroll-stack.ts` (nasłuch scrolla), `award-orbit.ts` (`setScrollY`), `scroll-restore.ts` (wymuszanie pozycji 0 po swapie), `touch-transition.ts` (kopia strony przewija się razem z kontenerem, wysokość liczona z kontenera). `lifecycle.ts` importuje `scroller.ts`, żeby domyślny scroller był ustawiony zanim komponenty utworzą triggery.

**5. Włączenie przejścia.** Usunięto skrypt zerujący `document.startViewTransition` i flagę `PT_OFF`; własne karty (`touch-transition.ts`) są tylko opcją testową (`?vt=cards`, `?vt=calm`, `?vt=native` wyłącza). Usunięto kod korygujący przesunięcie zrzutu (pomiary, `lift`, sondę `probeScb`, owijkę `startViewTransition`), bo przy `scrollY = 0` nic nie robi.

### Błąd po drodze: `Cannot read properties of undefined (reading '_gsap')`

Pierwsza wersja ustawiała `ScrollTrigger.defaults({ scroller: '#scroll-root' })` jako selektor. Komponenty budują triggery wewnątrz `gsap.context()`, a tam selektor jest szukany tylko w zakresie kontekstu, więc `#scroll-root` (leży na zewnątrz) nie był znaleziony i `ScrollTrigger` wywalał się przy tworzeniu (`cats/mobile.ts`, `WhyBengals.astro` itd.). **Rozwiązanie:** domyślny scroller to sam element, a nie selektor, ustawiany od nowa po każdym swapie (każda strona ma nowy element).

### Jak sprawdzono

- `npx astro check`: 0 błędów.
- Emulacja Pixel 7 (Chromium, `pointer: coarse`): `scrollY` dokumentu zawsze 0, `#scroll-root.scrollTop` rośnie; `innerHeight` = `clientHeight` kontenera (839) przez cały czas; piny i animacje na stronie głównej działają (zrzuty ekranu przy 400/2000/5000/9000 px).
- Nawigacja `/` → `/awards` → wstecz: `startViewTransition` wywołane raz, nowa strona na górze (`scrollTop = 0`), jeden `#scroll-root` w DOM, brak błędów w konsoli poza 404 na zewnętrznym zasobie.
- Próbkowanie `::view-transition-old/new(root)` co klatkę: stary widok kurczy się do 0,6, obraca i odjeżdża w lewo-dół, nowy wjeżdża z prawej-dołu, rośnie do 1; wysokość grupy stała (839px) — brak skoku wysokości.
- Porównanie z wersją sprzed zmian (stash): ten sam błąd `_gsap` nie występował, co pokazało, że to nasza zmiana — stąd poprawka z elementem zamiast selektora.

### Czego NIE sprawdzono (do przetestowania na telefonie)

- Prawdziwy Chrome Android przy przewiniętej stronie (czy zniknął skok o wysokość paska).
- Safari iOS (potrzebne iOS 18+ dla natywnego View Transition przy nawigacji między dokumentami/ClientRouter; niżej strony tylko się podmieniają). Sprawdzić też, czy kontener `position: fixed` nie zostawia pustego pasa pod paskiem narzędzi i czy gest cofnięcia krawędzią działa.
- Wszystkie pozostałe podstrony (`/our-cats`, `/available-kittens`) w trybie dotykowym; w razie problemów szukać odczytów `window.scrollY`/`getBoundingClientRect` zależnych od okna.

### Jak wrócić, gdyby coś się psuło

Najszybciej: w `Layout.astro` usunąć blok `@media (pointer: coarse)` dla `html, body, #scroll-root` (strona wraca do przewijania dokumentu; `scroller.ts` wtedy też przestaje działać, bo `scrollBox()` znajdzie kontener bez przewijania — wtedy zmienić `innerScroll()` na `false`). Żeby tylko wyłączyć przejście: w `<head>` dodać `document.startViewTransition = undefined;`.

### Safari mobile: miganie treści i menu znikające szybciej + za długie czekanie

**Objaw:** na Safari podczas przejścia treść czasem migała, a pasek menu (nav pill) znikał szybciej niż strona. Na wszystkich przeglądarkach przejście trwało za długo.

**Przyczyna (menu):** nav pill ma `backdrop-filter: blur`, a w przejściu jest osobną warstwą (`view-transition-name: navbar`), więc blur nie ma czego próbkować i Safari rysuje go inaczej (miga albo gaśnie przed resztą).

**Poprawka (menu):** na czas przejścia `html` dostaje klasę `vt-run` (ustawianą w `astro:after-preparation`, czyli przed zrzutem, zdejmowaną po `viewTransition.finished`, z zabezpieczeniem 4 s), a pill ma wtedy pełne, nieprzezroczyste tło bez blura (`NavPill.astro`).

**Poprawka (czas):** animacja telefonu 1100 → 800 ms, laptopa 1500 → 1100 ms (`Layout.astro`), karty własne `DURATION` 800 ms (`touch-transition.ts`). Klatki kluczowe są procentowe, więc skracają się proporcjonalnie.

**Nie zweryfikowane na Safari iOS** (brak urządzenia). Jeśli nadal miga: sprawdzić `will-change: transform` na `::view-transition-old/new(root)` (można zdjąć) i czy miga treść pod `#scroll-root` (wtedy spróbować `-webkit-transform: translateZ(0)` na kontenerze). Jeśli nadal za wolno: skrócić czekanie 650 ms na zwinięcie menu w `NavPill.astro` (`leaving`).

### Lenis na telefonie

Lenis był na dotyku wyłączony (commity `cf632b9`, `1e68e90`, `cc3d8e1`), bo przewijał dokument: po `window.scrollTo` w trakcie zrzutu i przez zmianę klas `lenis` na `<html>` (wysokość dokumentu) przejście skakało. Teraz dokument stoi, więc `initLenis()` dostaje `wrapper: #scroll-root, content: #scroll-root` (`lenis.ts`), a klasy `lenis` trafiają na kontener, nie na `<html>`. Zniszczenie/odtworzenie po swapie działa jak na desktopie (`mount`). Test w emulacji Pixel 7: kontener ma klasę `lenis`, gest przewija płynnie (`scrollY` dokumentu = 0), nawigacja bez błędów. Parametry gładkości na dotyku: `SMOOTH_TOUCH` w `settings.ts`. Wyłączenie testowe: `?nolenis=1`.

## Commity

- `51afbee` — wyjście z About na telefonie/tablecie przez czarną warstwę
- `f9dba08` — rozmyta kopia portretu (zastąpiona w kolejnym commicie)
- `d26577a` — prawdziwy blur na samym zdjęciu
