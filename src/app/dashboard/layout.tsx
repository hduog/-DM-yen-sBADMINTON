import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guard";
import { DashboardNav } from "@/components/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <DashboardNav fullName={admin.full_name} />
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
