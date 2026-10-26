# Skrypty (Vanilla JS / GSAP / Astro): zasady i lista kontrolna

Strona nie używa Reacta. Cała animacja to Vanilla TS + GSAP + Lenis w tagach `<script>` komponentów `.astro`
i modułach w `src/scripts/`. Ten dokument zbiera zasady, których pilnujemy, żeby nic nie "duchowało" po
nawigacji, zmianie rozmiaru okna ani przy powtórnym wejściu na stronę.

Dziś jest jedna strona (`index.astro`) i brak View Transitions, więc każde przejście to pełne przeładowanie.
Zasady są wdrożone "z góry", na dzień, w którym dojdą podstrony (`/our-cats`, `/gallery`, ...) albo `ClientRouter`.

---

## 1. Jak to jest zrobione w tym projekcie

| Zasada | Gdzie |
|---|---|
| Każdy skrypt komponentu działa w `mount(() => { ...; return destroy })` | [src/scripts/lifecycle.ts](../src/scripts/lifecycle.ts) |
| `mount` uruchamia setup od razu, a po `astro:after-swap` ponownie; przed `astro:before-swap` woła `destroy` | j.w. |
| Animacje GSAP w `gsap.matchMedia()` / `gsap.context()`, sprzątane przez `revert()` | `src/scripts/stage/*`, `src/scripts/cats/*` |
| Zwykłe nasłuchiwacze mają nazwane funkcje i parę `removeEventListener` w `destroy` | `NavPill`, `CursorTrail`, `ScrollExpand`, `Hero`, `Corridor`, `dolly-gallery` |
| Obserwatory (`ResizeObserver`, `IntersectionObserver`) mają `disconnect()` | `dolly-gallery.ts` |
| Smooth scroll (Lenis) ma `destroyLenis()` | [src/scripts/lenis.ts](../src/scripts/lenis.ts), wołane ze `Stage.astro` |
| Wszystkie liczby (czasy, odstępy, progi, zapytania medialne) w jednym pliku | [src/scripts/settings.ts](../src/scripts/settings.ts) |
| Typy sprawdza `npm run check` (`astro check`) | `package.json` |

Wzór komponentu:

```astro
<script>
  import { mount } from '../scripts/lifecycle';

  mount(() => {
    const root = document.getElementById('moj-komponent')!;
    const btn = root.querySelector<HTMLElement>('.przycisk')!;   // zawsze względem kontenera

    const onClick = () => root.classList.toggle('open');          // nazwana funkcja, żeby dało się ją zdjąć
    btn.addEventListener('click', onClick);

    return () => {                                                // destroy
      btn.removeEventListener('click', onClick);
    };
  });
</script>
```

Uwaga: skrypty bundlowane przez Astro wykonują się **raz na wizytę**, także z `ClientRouter`. Dlatego setup
siedzi w `mount`, a nie wprost w module: po przejściu `mount` odpala go ponownie na nowym DOM-ie.
Zdarzenie `astro:page-load` odpala się też przy pierwszym wczytaniu, więc `mount` używa `astro:after-swap`
(tylko po podmianie), żeby nie inicjalizować dwa razy.

---

## 2. Pułapki i test QA

### 2.1 "Duch" (brak sprzątania)
React ma `useEffect`, który czyści po sobie. W Vanilla musi być jawne `destroy()`.

Sprawdź w kodzie:
- czy każdy `addEventListener` ma swój `removeEventListener` (na tej samej, nazwanej funkcji),
- czy każdy `new IntersectionObserver` / `ResizeObserver` ma `disconnect()`,
- czy GSAP jest w `gsap.context()` / `gsap.matchMedia()` z `revert()` (albo `ScrollTrigger.kill()`) przy wyjściu.

Test QA: wejdź na stronę z komponentem, wyjdź, wejdź znowu. Animacja nie może przyspieszać ani się dublować.

### 2.2 "Globalny wzrok" (zakres DOM)
AI lubi `document.querySelector('.klasa')`, który szuka w całym dokumencie.

Sprawdź w kodzie: elementy szukamy **wewnątrz kontenera komponentu**:
`const container = document.querySelector('#moj-komponent'); const btn = container.querySelector('.przycisk');`

Test QA: ten sam komponent dwa razy na stronie. Oba muszą działać niezależnie.

Znane odstępstwo: część selektorów w `gsap.set` / `fromTo` jest tekstowa i globalna
(`'.fill'`, `'.progress'`, `'.cats-fill'`, `'.hero-content'`). Każda sekcja występuje na stronie raz, więc to działa,
ale dwie kopie tej samej sekcji by się gryzły. Przy powtarzaniu sekcji przekazywać kontekst: `gsap.utils.toArray(sel, kontener)`.

### 2.3 "Zombie animacji" (GSAP i Lenis)
Sprawdź w kodzie:
- animacje powstają w `gsap.context()` i są odwracane, a nie tworzone w kółko bez zabijania starych,
- animacja wywoływana wielokrotnie (hover, klik w menu) zabija poprzednią: `gsap.killTweensOf(el)` przed nową,
- `ScrollTrigger.refresh()` jest po załadowaniu fontów/obrazków i zmianie layoutu (`invalidateOnRefresh: true` na wartościach liczonych z okna).

Test QA: zmień rozmiar okna albo obróć tablet. Animacje nie mogą się "rozjechać" ani zostać w połowie ekranu.

### 2.4 "Zmiana stanu" (klasy ręcznie)
Sprawdź w kodzie:
- klasy typu `.active`, `.open`, `.is-animating` są zdejmowane po akcji,
- `e.currentTarget` tam, gdzie chodzi o element z listenerem (np. przycisk z ikoną w środku); `e.target` to element faktycznie kliknięty,
  więc używamy go świadomie (np. "czy kliknięto poza menu": `nav.contains(e.target)`),
- delegacja zdarzeń: `e.target.closest('selektor')`.

Test QA: kliknij hamburger 5 razy szybko. Menu nie może zostać "półotwarte", a `body` nie może zostać zablokowany.

### 2.5 View Transitions (`ClientRouter`)
Zabijają `DOMContentLoaded` i `window.onload` jako jedyny punkt startu. Inicjalizacja idzie przez `mount`
(`astro:after-swap`), sprzątanie przez `astro:before-swap`.

Test QA: kliknij link w menu, przejdź na inną podstronę. Animacje i scroll na nowej podstronie muszą działać.

Do zrobienia, gdy dojdzie `ClientRouter`: dodać `<ClientRouter />` w `Layout.astro` i przejść ręcznie każdy komponent z tej listy.
Elementy poza `<body>` podmienianym przy swapie (np. `class` na `<html>`: `intro-ready`) trzeba zresetować w `destroy`.

---

## 3. Kontrakt konwersji: React → Vanilla JS / Astro

Używamy go, gdy wklejamy komponent z React Bits (lub innego Reacta) i zamieniamy na kod do `.astro`.

**Rola:** Senior Frontend Developer (Vanilla JS, GSAP, Astro).
**Cel:** zamienić podany komponent React w czysty, wydajny i bezpieczny kod Vanilla JS, gotowy do wklejenia do pliku `.astro`.

### Zabronione
1. Globalny `document.querySelector` do wybierania elementów wewnątrz komponentu.
2. Aktywne `addEventListener`, `IntersectionObserver`, `gsap.to` / `ScrollTrigger` po zniszczeniu komponentu.
3. `e.target` tam, gdzie powinno być `e.currentTarget` (np. kliknięcia przycisków z ikonami w środku).

### Wymagania architektoniczne
1. **Izolacja zakresu (DOM).** Kod przyjmuje lub znajduje główny kontener
   (`const container = document.querySelector('#moj-komponent')`). Wszystkie wewnętrzne elementy wybieramy
   względem niego: `container.querySelector('.wewnetrzny-element')`.
2. **Pełny cykl życia (init i destroy).** Eksportujemy `init(container)` i `destroy(container)`.
   - `init`: dodawanie listenerów, tworzenie GSAP / ScrollTrigger.
   - `destroy`:
     - `removeEventListener` dla każdego listenera (nazwane funkcje, nie arrow functions wpisane w `addEventListener`),
     - `observer.disconnect()` dla `IntersectionObserver` / `MutationObserver`,
     - `gsap.context(() => { ... }, container).revert()` albo `ScrollTrigger.getAll().forEach((t) => t.kill())` dla animacji tego kontenera.
3. **Zgodność z Astro.** Kod może wykonać się po nawigacji. Nie opieramy się wyłącznie na jednorazowym
   `DOMContentLoaded` (albo wyraźnie to zaznaczamy). W tym projekcie: `mount()` z `src/scripts/lifecycle.ts`.
4. **Stan i klasy.** Zamiast `useState`: `classList.add/remove/toggle`. Jeśli animacja może być wywołana wielokrotnie
   (hover, klik w menu), zabijamy poprzednią (`gsap.killTweensOf(element)`) przed startem nowej.

### Oczekiwane wyjście (przy konwersji)
1. Krótkie wyjaśnienie (2–3 zdania): co zmieniono, żeby spełnić kontrakt
   (np. "nazwane funkcje listenerów, żeby dało się je zdjąć w `destroy`").
2. Kod Vanilla JS, gotowy do wklejenia w `<script>` w Astro albo do zewnętrznego pliku.
3. Przykład użycia w Astro: import i wywołanie `init` / `destroy` (w tym `astro:page-load` / `astro:after-swap`, jeśli dotyczy).

### Szablon promptu

```text
Przekształć poniższy komponent React w Vanilla JS zgodnie z kontraktem z docs/SCRIPTING.md
(sekcja 3). Zwróć: krótkie wyjaśnienie, kod, przykład użycia w Astro.

[WKLEJ TUTAJ KOD Z REACT BITS]
```

---

## 4. Co jeszcze nie jest zrobione

- Selektory tekstowe w GSAP są globalne (sekcja 2.2), bo każda sekcja jest jedna.
- `ClientRouter` nie jest włączony, więc ścieżka `astro:before-swap` / `astro:after-swap` nie była przetestowana w prawdziwej nawigacji
  (sprawdzono tylko ręcznym wywołaniem tych zdarzeń).
- Dwa tryby sceny "story" (laptop i telefon) mają osobne, podobne pętle przejść.
