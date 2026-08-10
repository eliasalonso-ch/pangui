"use client";

import { useEffect } from "react";

// Public marketing/legal pages are always light, but the dashboard theme is
// stored on <html> (data-theme + an inline background-color set by the
// pre-paint script in app/layout.js). Both sit above the page's own wrapper and
// paint the overscroll area, so the only way to keep these pages light is to
// tag <html> itself. The inline <script> runs before paint to avoid a dark
// flash on first load; the effect handles client-side navigation and cleans up
// when the user moves back into the app.
const APPLY_SCRIPT = `(function(){try{var d=document.documentElement;d.classList.add("pangui-public");d.dataset.panguiThemeBg=d.style.backgroundColor||"";d.style.backgroundColor="#ffffff";d.style.colorScheme="light";}catch(e){}})();`;

export default function PublicPageTheme() {
  useEffect(() => {
    const el = document.documentElement;
    // On first load the inline script above already ran and stashed the
    // dashboard's background in this dataset key; on client-side navigation it
    // did not, so capture the current value here instead.
    if (el.dataset.panguiThemeBg === undefined) {
      el.dataset.panguiThemeBg = el.style.backgroundColor || "";
    }

    el.classList.add("pangui-public");
    el.style.backgroundColor = "#ffffff";
    el.style.colorScheme = "light";

    return () => {
      el.classList.remove("pangui-public");
      // Restore whatever the dashboard theme had set, so navigating from a
      // public page back into the app doesn't strand it on the light canvas.
      el.style.backgroundColor = el.dataset.panguiThemeBg || "";
      el.style.colorScheme = "";
      delete el.dataset.panguiThemeBg;
    };
  }, []);

  return <script dangerouslySetInnerHTML={{ __html: APPLY_SCRIPT }} />;
}
