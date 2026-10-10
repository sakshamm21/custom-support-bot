import { isAdmin } from "@/lib/auth";
import { Login } from "@/components/admin/Login";
import { ClientEditor } from "@/components/admin/ClientEditor";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return <Login />;
  const { id } = await params;
  return <ClientEditor id={id} />;
}
