import AppShell from "./AppShell";

export const metadata = {
  title: "Pangui",
};

export default function AppLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}
