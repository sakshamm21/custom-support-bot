import { isAdmin } from "@/lib/auth";
import { Login } from "@/components/admin/Login";
import { Dashboard } from "@/components/admin/Dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) return <Login />;
  return <Dashboard />;
}
