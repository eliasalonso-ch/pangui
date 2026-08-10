const SITE_URL = "https://getpangui.com";

export default function sitemap() {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/industrias`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/casos-de-exito`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/casos-de-exito/electrilam`, lastModified, changeFrequency: "yearly", priority: 0.7 },
    { url: `${SITE_URL}/precios`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/demo`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/registro`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/login`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacidad`, lastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terminos`, lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
