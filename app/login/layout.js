// /login is a functional auth screen with no content to rank. Without this it
// inherits robots:{index:true} from the root layout and competes in the index.
export const metadata = {
  title: "Iniciar sesión · Pangui",
  description: "Accede a tu cuenta de Pangui.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }) {
  return children;
}
