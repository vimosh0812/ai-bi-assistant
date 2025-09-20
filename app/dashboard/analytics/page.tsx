"use client";

import TableauViz from "@/components/tableauviz";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";

export default function AnalyticsPage() {
  return (
    <DashboardLayout>
      <div style={{ height: "calc(100%)" }}> 
        <TableauViz src="https://public.tableau.com/views/WorldIndicators_17297174004850/GDPpercapita" />
      </div>
    </DashboardLayout>
  );
}
