'use client';
import { useEffect, useState } from 'react';
import styles from './InstallPrompt.module.css';

const DISMISSED_KEY = 'pangi_install_dismissed';

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState(null); // 'ios' | 'android' | 'desktop'
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform(isIOS() ? 'ios' : 'android');
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS doesn't fire beforeinstallprompt
    if (isIOS()) {
      setPlatform('ios');
      setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Show desktop banner after a short delay if no prompt fired and not iOS
  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (isIOS()) return;

    const timer = setTimeout(() => {
      if (!deferredPrompt && !show) {
        setPlatform('desktop');
        setShow(true);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [deferredPrompt, show]);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setShow(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') localStorage.setItem(DISMISSED_KEY, 'true');
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.icon}>
        <img src="/icons/icon-192.png" alt="Pangi" width={36} height={36} />
      </div>

      <div className={styles.body}>
        {platform === 'ios' && (
          <>
            <div className={styles.title}>Instala Pangi en tu iPhone</div>
            <div className={styles.hint}>
              Toca{' '}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              {' '}y luego <strong>«Agregar a pantalla de inicio»</strong>
            </div>
          </>
        )}
        {platform === 'android' && (
          <>
            <div className={styles.title}>Instala Pangi para acceso rápido</div>
          </>
        )}
        {platform === 'desktop' && (
          <>
            <div className={styles.title}>Instala Pangi en tu escritorio</div>
            {!deferredPrompt && (
              <div className={styles.hint}>Menú <strong>⋮</strong> → <strong>Instalar Pangi…</strong></div>
            )}
          </>
        )}
      </div>

      <div className={styles.actions}>
        {platform === 'ios' ? (
          <button className={styles.btnPrimary} onClick={dismiss}>Entendido</button>
        ) : deferredPrompt ? (
          <>
            <button className={styles.btnGhost} onClick={dismiss}>Ahora no</button>
            <button className={styles.btnPrimary} onClick={install}>Instalar</button>
          </>
        ) : (
          <button className={styles.btnPrimary} onClick={dismiss}>Entendido</button>
        )}
        <button className={styles.close} onClick={dismiss} aria-label="Cerrar">✕</button>
      </div>
    </div>
  );
}
