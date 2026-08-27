// /login is a functional auth screen with no content to rank. Without this it
// inherits robots:{index:true} from the root layout and competes in the index.
// The brand is NOT repeated here: the root layout's "%s | Pangui" template
// appends it, and spelling it out again rendered "Iniciar sesión · Pangui |
// Pangui" in the tab.
export const metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu cuenta de Pangui.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }) {
  return children;
}
