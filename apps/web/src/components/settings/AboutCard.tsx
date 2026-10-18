import { Link } from "react-router-dom";
import { PRIVACY_PATH, DONATE_URL, PROJECT_REPO_URL } from "../../lib/links";
import { ChevronRightIcon, ExternalIcon } from "../icons";

const row =
  "flex items-center justify-between gap-space-md py-space-md text-label-lg font-label-lg text-on-surface hover:text-on-primary-fixed-variant transition-colors";

/**
 * «Informazioni e sostegno»: privacy e note legali (rotta interna), codice sorgente su GitHub e donazione. Non è una sezione a
 * fisarmonica: i link devono restare sempre visibili e non fanno parte della bozza delle preferenze.
 */
export function AboutCard() {
  return (
    <section data-testid="settings-about" aria-labelledby="settings-about-title" className="rounded-lg bg-surface-container-lowest shadow-sm border border-outline-variant/30 px-space-xl py-space-lg">
      <h2 id="settings-about-title" className="text-headline-sm font-headline-sm text-on-surface">
        Informazioni e sostegno
      </h2>
      <ul className="mt-space-sm divide-y divide-outline-variant/30">
        <li>
          <Link to={PRIVACY_PATH} data-testid="link-privacy" className={row}>
            <span>Privacy e note legali</span>
            <ChevronRightIcon className="text-on-surface-variant" />
          </Link>
        </li>
        <li>
          <a href={PROJECT_REPO_URL} target="_blank" rel="noopener noreferrer" data-testid="link-repo" className={row}>
            <span>
              Codice sorgente su GitHub
              <span className="sr-only"> (si apre in una nuova scheda)</span>
            </span>
            <ExternalIcon className="text-on-surface-variant" />
          </a>
        </li>
        <li>
          <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" data-testid="link-donate" className={row}>
            <span>
              Sostieni il progetto con una donazione
              <span className="sr-only"> (si apre in una nuova scheda)</span>
            </span>
            <ExternalIcon className="text-on-surface-variant" />
          </a>
        </li>
      </ul>
    </section>
  );
}
