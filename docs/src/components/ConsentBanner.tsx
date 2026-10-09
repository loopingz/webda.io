import React, { useEffect, useState } from "react";
import Link from "@docusaurus/Link";
import styles from "./ConsentBanner.module.css";

/** localStorage key of the visitor's choice. */
export const CONSENT_KEY = "webda.consent";

/**
 * Stored choice, if any.
 *
 * @returns `granted`, `denied` or `null`
 */
function storedChoice(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

/**
 * Record the choice and update Consent Mode.
 *
 * @param choice - the visitor's choice
 */
function applyChoice(choice: "granted" | "denied"): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // storage may be unavailable
  }
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.("consent", "update", { analytics_storage: choice });
}

/**
 * Small Consent Mode v2 banner: accept or decline analytics cookies.
 *
 * Usage events are sent either way (cookieless when denied, the consent-mode
 * behaviour); the choice only governs `analytics_storage`.
 *
 * @returns the banner, or null once a choice is stored
 */
export function ConsentBanner(): React.JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(storedChoice() === null);
  }, []);

  if (!visible) return null;

  const choose = (choice: "granted" | "denied") => {
    applyChoice(choice);
    setVisible(false);
  };

  return (
    <div className={styles.banner} role="dialog" aria-live="polite" aria-label="Analytics consent">
      <p className={styles.text}>
        This site measures how the documentation and the debug dashboard are used with Google Analytics. Allow analytics
        cookies? Without them, only cookieless, anonymous events are sent.{" "}
        <Link to="/docs/Debug/DebugDashboard#telemetry">What is collected</Link>
      </p>
      <div className={styles.actions}>
        <button type="button" className="button button--secondary button--sm" onClick={() => choose("denied")}>
          Decline
        </button>
        <button type="button" className="button button--primary button--sm" onClick={() => choose("granted")}>
          Accept
        </button>
      </div>
    </div>
  );
}
