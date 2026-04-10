import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { Breadcrumbs } from "./Breadcrumbs";

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <MobileNav />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
