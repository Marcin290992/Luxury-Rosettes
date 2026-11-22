# Sanity: co zostało do zrobienia przed premierą

Stan na 2026-11-22. Sanity działa dla strony Available kittens na adresie próbnym `https://main-prototype--luxury-tester.netlify.app/`. Reszta ustawień jest zaplanowana na czas przed premierą.

## Co już jest zrobione

- Projekt Sanity **„Luxury Bengal Cattery”**, ID `rmtqqab1`, dataset `production` (to projekt NOWEJ strony). Projekt „Luxury Rosettes” (ID `qol3jzg4`) należy do STAREJ strony i na razie go nie ruszamy.
- Studio w folderze `studio/`, wdrożone pod `https://luxury-rosettes-studio.sanity.studio/` (appId zapisany w `studio/sanity.cli.ts`).
- Jeden dokument „Available kittens” z listą kociąt (zdjęcie, nazwa, kilka słów, opis, opis zdjęcia). Pierścień na górze strony jest stały i nie jest edytowalny.
- Strona pobiera kocięta z Sanity w czasie buildu (`src/lib/sanity.ts`, `src/data/litters.ts`). Bez konfiguracji używa przykładowych danych.
- Netlify (projekt `luxury-tester`): zmienne `SANITY_PROJECT_ID` i `SANITY_DATASET` dodane, gałąź `main-prototype` buduje się z Sanity.
- Kod wypchnięty na `dev` i `main-prototype` (commit `649a380`).

## Do zrobienia przed premierą

### 1. Webhook, żeby publikacja w Studio odświeżała stronę
1. Netlify → **Project configuration → Build & deploy → Build hooks**. Użyj hooka `sanity` (gałąź `main-prototype`) albo utwórz nowy.
2. Skopiuj jego adres. Traktuj go jak hasło, nie wklejaj go publicznie.
3. Sanity: sanity.io/manage → projekt **Luxury Bengal Cattery** → **API → Webhooks → Create webhook**.
   - Name: `Netlify rebuild`
   - URL: adres hooka
   - Dataset: `production`
   - Trigger on: Create, Update, Delete
   - Metoda: POST
4. Test: w Studio zmień opis kocięcia, kliknij **Publish**, po 1–2 minutach sprawdź stronę. Potem przywróć właściwy opis.

### 2. Zakres zmiennych w Netlify (opcjonalnie)
Zmienne `SANITY_PROJECT_ID` i `SANITY_DATASET` przy zakresie „All scopes” działają też dla wdrożeń z `dev`. Jeśli `dev` ma nie używać Sanity, ogranicz je do gałęzi `main-prototype` (Environment variables → zmienna → Branch deploys).

### 3. Klientka w Studio
1. sanity.io/manage → projekt **Luxury Bengal Cattery** → **Members → Invite**.
2. E-mail klientki, rola **Editor** (nie Administrator).
3. Wyślij jej adres Studio: `https://luxury-rosettes-studio.sanity.studio/`.
4. Pokaż jej, jak dodać kocię: Kittens → Add item → zdjęcie, nazwa, opis → **Publish**. Kocię, które znalazło dom, usuwa z listy.

### 4. Sprzątanie
1. Sanity → projekt **Luxury Bengal Cattery** → **API → Tokens**: usuń token „import” (klucz zapisu użyty do jednorazowego importu).
2. Plik `.env` już nie zawiera `SANITY_WRITE_TOKEN`. Sprawdź to jeszcze raz.
3. Skrypt `scripts/seed-kittens.mjs` jest jednorazowy. Można go zostawić (nie zawiera sekretów) albo usunąć.

### 5. Gałąź produkcyjna
Produkcja Netlify buduje obecnie z `main`, a `main` jest starą wersją bez Sanity. Wybierz jedno:
- **Zalecane:** scal `main-prototype` do `main`, a produkcję zostaw na `main`. Wtedy dodaj drugi build hook dla `main` i drugi webhook w Sanity (albo zmień adres w istniejącym).
- Albo w Netlify: **Project configuration → Build & deploy → Branches → Production branch** ustaw `main-prototype`. Webhook z punktu 1 zostaje bez zmian.

### 6. Domena
1. Netlify → **Domain management → Add a domain** → `luxuryrosettes.co.uk` (oraz `www`).
2. U rejestratora zmień DNS według instrukcji Netlify. Do tej pory domena wskazuje na starą stronę.
3. Poczekaj na propagację DNS i certyfikat HTTPS (Netlify robi to sam).
4. Sprawdź `https://luxuryrosettes.co.uk` oraz `/available-kittens`.
5. W Sanity nic nie zmieniasz: dane są pobierane w buildzie, więc CORS ani domena nie mają znaczenia.

### 7. Po premierze
1. Zrób jeszcze raz test z webhookiem (punkt 1.4), tym razem na domenie produkcyjnej.
2. Usuń stary projekt Sanity starej strony, czyli **„Luxury Rosettes”** (ID `qol3jzg4`; sanity.io/manage → ten projekt → **Settings → Delete**). NIE usuwaj „Luxury Bengal Cattery”, bo to projekt nowej strony, ale dopiero po tym, jak nowa strona przejmie domenę.

## Przydatne informacje

- **Lokalnie:** Studio `cd studio` i `npm run dev` (`http://localhost:3333`). Strona `npm run dev` w głównym folderze (`http://localhost:4321`).
- **Aktualizacja Studio w sieci** (tylko po zmianie schematów): `cd studio`, `npm run deploy`. Same treści edytuje się bez ponownego wdrażania.
- **Logowanie Sanity** (`npx sanity login`) wymaga wolnego portu: wyłącz serwer strony (Ctrl+C), bo zajmuje ten sam port.
- **Minuty budowania:** każdy Publish w Studio uruchamia build w Netlify. Darmowy plan ma limit minut w miesiącu, przy tej stronie to nie powinien być problem.
- **Nie klikaj „Publish deploy”** na wdrożeniu z gałęzi próbnej, bo podmienia wersję produkcyjną.
- **Nie ma jeszcze w Sanity:** nagród, kotów rodziców, galerii i FAQ. Są nadal wpisane w kodzie i czekają na zdjęcia i teksty.
