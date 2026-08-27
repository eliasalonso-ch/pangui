// Invitation links are single-use and user-specific — never index them.
export const metadata = {
  title: "Invitación",
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }) {
  return children;
}
