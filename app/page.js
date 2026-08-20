import Landing from "./Landing";
import { faqStructuredData } from "./structured-data";

// Site-wide JSON-LD (SoftwareApplication + Organization) is rendered from
// app/layout.js. The FAQPage node belongs to this page specifically — it
// describes the "Preguntas frecuentes sobre Pangui" section in Landing.jsx.
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <Landing />
    </>
  );
}
