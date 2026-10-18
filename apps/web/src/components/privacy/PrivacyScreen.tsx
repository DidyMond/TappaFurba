import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CONTACT_EMAIL, PROJECT_REPO_URL } from "../../lib/links";
import { BackIcon } from "../icons";

/** Data dell'ultima revisione del testo: da aggiornare a ogni modifica di ciò che l'app fa con i dati. */
export const PRIVACY_UPDATED = "18 ottobre 2026";

const link = "text-on-primary-fixed-variant underline underline-offset-2 hover:no-underline";

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
      {children}
    </a>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={`privacy-${id}`}
      data-testid={`privacy-section-${id}`}
      className="rounded-lg bg-surface-container-lowest shadow-sm border border-outline-variant/30 px-space-xl py-space-lg flex flex-col gap-space-sm"
    >
      <h2 id={`privacy-${id}`} className="text-headline-sm font-headline-sm text-on-surface">
        {title}
      </h2>
      <div className="flex flex-col gap-space-sm text-body-md font-body-md text-on-surface-variant [&_strong]:text-on-surface [&_strong]:font-semibold">{children}</div>
    </section>
  );
}

const List = ({ children }: { children: ReactNode }) => <ul className="list-disc pl-space-xl flex flex-col gap-space-xs marker:text-on-surface-variant">{children}</ul>;

/**
 * «Privacy e note legali» (rotta /privacy). Il testo descrive ciò che il codice fa davvero: ogni affermazione ha un riscontro in
 * `apps/web` (geolocalizzazione in SearchForm, `localStorage` in settings/recentRoutes/mapStyle), in `apps/api` (log senza
 * indirizzi in `app.ts` e `redact.ts`, ricerche in memoria per 15 minuti) e in `docs/ATTRIBUTION.md`. Se cambia il
 * comportamento va riletto e va aggiornata `PRIVACY_UPDATED`. Non è una consulenza legale: il titolare deve rileggerlo.
 */
export function PrivacyScreen() {
  // Si arriva da un link in fondo a un'altra schermata: la pagina parte dall'alto.
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, []);

  return (
    <main
      data-testid="privacy-screen"
      className="flex-1 w-full bg-surface pt-24 pb-28 px-margin max-w-md md:max-w-3xl md:px-8 mx-auto flex flex-col gap-space-lg"
    >
      <header className="flex flex-col gap-space-sm">
        <Link to="/settings" className="self-start inline-flex items-center gap-1 text-label-lg font-label-lg text-on-primary-fixed-variant hover:underline">
          <BackIcon className="w-4 h-4" />
          Impostazioni
        </Link>
        <h1 className="text-headline-md font-headline-md md:text-headline-lg md:font-headline-lg text-on-surface">Privacy e note legali</h1>
        <p className="text-body-sm font-body-sm text-on-surface-variant">Ultimo aggiornamento: {PRIVACY_UPDATED}.</p>
      </header>

      <Section id="sintesi" title="In breve">
        <List>
          <li>
            <strong>Nessun account, nessun cookie, nessuna pubblicità.</strong> TappaFurba non ti chiede di registrarti e non usa strumenti di analisi o di
            profilazione.
          </li>
          <li>
            Le tue <strong>preferenze e i tragitti recenti restano sul tuo dispositivo</strong>. Non li conserviamo su nessun server.
          </li>
          <li>
            Per trovare le stazioni, <strong>indirizzi e posizione vengono inviati ai nostri server e a Mapbox</strong> (geocoding, percorso, mappa). La
            posizione si legge solo se premi il pulsante «Usa la posizione attuale».
          </li>
          <li>
            Come ogni sito, il server registra l&apos;<strong>indirizzo IP</strong> di chi lo visita, per un periodo limitato (vedi «Log del server»).
          </li>
        </List>
      </Section>

      <Section id="titolare" title="Chi è il titolare">
        <p>
          TappaFurba è un progetto personale e gratuito, sviluppato e gestito da <strong>Davide Dimo</strong>, titolare del trattamento dei dati
          descritto in questa pagina. Per qualsiasi domanda o richiesta sui tuoi dati scrivi a{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section id="dati" title="Quali dati tratta l'app, e perché">
        <p>
          Servono solo a fare ciò che chiedi: trovare il distributore più conveniente lungo il tuo percorso. Non vengono usati per nessun altro scopo, né
          venduti o ceduti per scopi commerciali.
        </p>
        <List>
          <li>
            <strong>Indirizzi che digiti.</strong> Mentre scrivi in «Partenza» o «Destinazione», il testo (e, se hai usato la posizione attuale, le tue
            coordinate, per proporre prima i luoghi vicini a te) va alla nostra API, che lo passa al servizio di geocoding di Mapbox per ottenere i
            suggerimenti.
          </li>
          <li>
            <strong>Posizione del dispositivo.</strong> Il browser ti chiede il permesso solo quando premi «Usa la posizione attuale». Le coordinate servono
            come punto di partenza della ricerca e, tramite Mapbox, per ricavarne un indirizzo da mostrarti. Non si leggono in altri momenti, non vengono
            salvate sul dispositivo (nello storico resta solo l&apos;indicazione «posizione attuale», mai le coordinate) né sul server. Puoi revocare il
            permesso in qualsiasi momento dalle impostazioni del browser.
          </li>
          <li>
            <strong>La ricerca.</strong> Partenza e arrivo (come coordinate), carburante, litri, consumo, deviazione massima, valore del tempo e opzioni di
            percorso vanno alla nostra API. Questa chiede il percorso a Mapbox (servizio Directions), cerca le stazioni nel nostro archivio dei prezzi e,
            per avere prezzi più freschi, interroga l&apos;Osservaprezzi del MIMIT per zone fisse di 14 km lungo il percorso, senza inviare i tuoi dati
            personali. Il risultato resta{" "}
            <strong>15 minuti nella memoria</strong> dell&apos;API (serve ad aprire il dettaglio di una stazione) e poi si cancella: non finisce in nessun
            database.
          </li>
          <li>
            <strong>La mappa.</strong> Nella schermata Risultati il tuo browser scarica stile e tessere della mappa direttamente da Mapbox, che quindi
            riceve il tuo indirizzo IP. La libreria della mappa può inviare a Mapbox anche dati anonimi di utilizzo, come descritto nella loro informativa.
          </li>
          <li>
            <strong>Font.</strong> I caratteri (Inter e Plus Jakarta Sans) si caricano da Google Fonts: il tuo browser contatta{" "}
            <code>fonts.googleapis.com</code> e <code>fonts.gstatic.com</code> e Google riceve il tuo indirizzo IP. Dopo il primo caricamento i font
            restano nella cache del dispositivo.
          </li>
        </List>
        <p>
          Non chiediamo né raccogliamo nome, email, telefono, targa o dati di pagamento. Il campo «Modello» del profilo veicolo è testo libero che resta solo sul
          tuo dispositivo: non scriverci dati che non vuoi vedere lì.
        </p>
      </Section>

      <Section id="dispositivo" title="Cosa resta sul tuo dispositivo">
        <p>
          Tutto è nel <code>localStorage</code> del browser (non sono cookie e non vengono inviati ai server a ogni richiesta):
        </p>
        <List>
          <li>
            <strong>Preferenze</strong> (veicolo, consumo, carburante, valore del tempo, soglie): chiave <code>tappafurba.settings.v1</code>.
          </li>
          <li>
            <strong>Tragitti frequenti</strong>: i testi di partenza e arrivo delle ultime ricerche (al massimo 10), mai coordinate: chiave{" "}
            <code>tappafurba.recent-routes.v1</code>. Li cancelli da Impostazioni → «Notifiche &amp; Dati di Sistema» → «Cancella cronologia».
          </li>
          <li>
            <strong>Tema della mappa</strong>: chiave <code>tappafurba.mapStyle</code>.
          </li>
          <li>
            Un promemoria nella sessione (<code>sessionStorage</code>) per non riproporti il banner di installazione.
          </li>
          <li>
            La <strong>cache dell&apos;app</strong> (service worker): pagine, script, font e loghi, per farla aprire anche senza rete. I prezzi, le ricerche
            e i suggerimenti non vengono mai messi in cache.
          </li>
        </List>
        <p>Per cancellare tutto basta svuotare i dati del sito dalle impostazioni del browser, o disinstallare l&apos;app.</p>
      </Section>

      <Section id="log" title="Log del server">
        <List>
          <li>
            <strong>Server web (nginx, davanti a sito e API).</strong> Come ogni web server registra, per ogni richiesta, indirizzo IP, data e ora,
            percorso richiesto (<em>senza</em> i parametri: gli indirizzi che digiti e le coordinate non vengono registrati), esito e browser dichiarato (user
            agent). Servono alla sicurezza e al funzionamento del servizio, e si cancellano con la normale rotazione dei log del server (entro 14 giorni).
          </li>
          <li>
            <strong>API.</strong> I suoi registri contengono solo metodo, percorso (senza parametri), esito e tempi di risposta, oltre agli errori tecnici,
            ripuliti dai codici di accesso ai servizi. Non contengono IP, indirizzi digitati né coordinate.
          </li>
          <li>
            L&apos;API limita il numero di richieste al minuto per indirizzo IP, contandole solo in memoria. Tiene inoltre un contatore{" "}
            <em>anonimo</em> mensile delle chiamate a Mapbox, per non superare i limiti del piano gratuito.
          </li>
        </List>
      </Section>

      <Section id="terzi" title="Con chi vengono condivisi i dati">
        <List>
          <li>
            <strong>Mapbox, Inc.</strong> (Stati Uniti): geocoding, calcolo dei percorsi e mappa. Riceve il testo degli indirizzi, le coordinate di
            partenza e arrivo e, per la mappa, l&apos;IP del browser. <External href="https://www.mapbox.com/legal/privacy">Informativa di Mapbox</External>.
          </li>
          <li>
            <strong>Google LLC</strong> (Stati Uniti): solo per i font di Google Fonts, che riceve l&apos;IP del browser.{" "}
            <External href="https://policies.google.com/privacy">Informativa di Google</External>.
          </li>
          <li>
            <strong>Host.it</strong>: fornitore del server (situato a Torino) su cui girano sito e API; gestisce i dati che il server riceve e registra, come descritto sopra.
          </li>
          <li>
            <strong>MIMIT, Osservaprezzi Carburanti</strong>: è la fonte dei prezzi; non riceve dati dei visitatori (le richieste ai suoi servizi partono dal
            nostro server e riguardano zone geografiche, non persone).
          </li>
        </List>
        <p>
          Mapbox e Google hanno sede fuori dall&apos;Unione europea: il trasferimento dei dati è regolato dalle loro informative e dai loro strumenti di
          garanzia. Non vendiamo i dati e non li condividiamo con altri soggetti.
        </p>
      </Section>

      <Section id="base" title="Perché li trattiamo">
        <p>
          Per erogare il servizio che stai usando (indirizzi, posizione e ricerca: li tratti tu stesso azionando l&apos;app) e per il nostro legittimo interesse
          a mantenere il servizio sicuro e funzionante (log del server, limiti di richieste). Non c&apos;è profilazione né decisione automatizzata sulle persone.
        </p>
      </Section>

      <Section id="diritti" title="I tuoi diritti">
        <p>
          Hai diritto di chiedere l&apos;accesso ai dati che ti riguardano, la rettifica o la cancellazione, la limitazione o l&apos;opposizione al
          trattamento e, dove applicabile, la portabilità (artt. 15–22 del Regolamento UE 2016/679, «GDPR»). Scrivi a{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          Poiché non abbiamo account, possiamo associare dei dati a una persona solo tramite i log del server: per cercarli servono il tuo indirizzo IP
          e l&apos;intervallo di date in cui hai usato il servizio. Tutto il resto sta sul tuo dispositivo e lo controlli tu (vedi «Cosa resta sul tuo
          dispositivo»).
        </p>
        <p>
          Se ritieni che il trattamento violi la normativa, puoi presentare reclamo al{" "}
          <External href="https://www.garanteprivacy.it">Garante per la protezione dei dati personali</External>.
        </p>
      </Section>

      <Section id="attribuzioni" title="Fonti, marchi e note legali">
        <List>
          <li>
            <strong>Prezzi e impianti:</strong> dati aperti del Ministero delle Imprese e del Made in Italy (MIMIT), «Osservaprezzi Carburanti», licenza{" "}
            <External href="https://www.dati.gov.it/iodl/2.0/">IODL 2.0</External>. I dati sono stati rielaborati (normalizzazione, ordinamento, calcolo di
            risparmi e deviazioni): le cifre dei prezzi sono quelle dichiarate dai gestori, gli altri valori sono calcoli di TappaFurba, non dati ufficiali.
          </li>
          <li>
            <strong>Mappa e luoghi:</strong> © Mapbox e © <External href="https://www.openstreetmap.org/copyright">contributori di OpenStreetMap</External>{" "}
            (licenza ODbL). I loro crediti compaiono sulla mappa.
          </li>
          <li>
            <strong>Loghi dei distributori:</strong> marchi dei rispettivi titolari, forniti dall&apos;Osservaprezzi Carburanti del MIMIT e mostrati solo per
            riconoscere il distributore. I titolari che desiderano la rimozione di un logo possono scrivere al contatto indicato sopra.
          </li>
          <li>
            <strong>Font:</strong> Inter e Plus Jakarta Sans, licenza SIL Open Font License 1.1.
          </li>
          <li>
            TappaFurba <strong>non è affiliato, sponsorizzato o approvato</strong> da MIMIT, Mapbox, Google o dai titolari dei marchi citati.
          </li>
          <li>
            <strong>Esattezza dei prezzi:</strong> i prezzi sono comunicati dai gestori e possono cambiare; il file giornaliero fotografa lo stato del giorno
            precedente, e anche i prezzi «in tempo reale» possono non coincidere con quello alla colonnina. Il servizio è fornito «così com&apos;è», senza
            garanzie: verifica sempre il prezzo prima di fare rifornimento.
          </li>
          <li>
            Il codice è pubblicato su <External href={PROJECT_REPO_URL}>GitHub</External> con licenza Apache-2.0; il nome «TappaFurba» e il marchio grafico
            ne sono esclusi. L&apos;elenco completo delle attribuzioni è nel file <code>docs/ATTRIBUTION.md</code> del repository.
          </li>
        </List>
      </Section>

      <Section id="modifiche" title="Modifiche a questa pagina">
        <p>
          Se cambia ciò che l&apos;app fa con i dati, questa pagina viene aggiornata e la data in alto cambia. Le versioni precedenti restano nella cronologia
          del repository.
        </p>
      </Section>
    </main>
  );
}
