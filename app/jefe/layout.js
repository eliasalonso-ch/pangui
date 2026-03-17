import JefeShell from "./JefeShell";

export const metadata = {
  title: "Pangi · Jefe mantención",
};

export default function JefeLayout({ children }) {
  return <JefeShell>{children}</JefeShell>;
}
