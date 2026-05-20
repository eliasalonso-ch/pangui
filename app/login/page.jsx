import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getServerUser();
  if (user) redirect("/ordenes");
  return <LoginForm />;
}
