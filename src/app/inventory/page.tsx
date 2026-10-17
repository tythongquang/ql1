"use client";
import { useState } from "react";
import Catalog from "@/components/inventory/Catalog";
import Stock from "@/components/inventory/Stock";
import Prices from "@/components/inventory/Prices";

const TABS = [
  ["catalog", "Danh mục"],
  ["stock", "Xuất nhập tồn"],
  ["prices", "Giá & lãi"],
] as const;

export default function InventoryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("catalog");
  return (
    <div>
      <div className="mb-3 flex gap-1">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-sky-600 text-white" : "bg-white text-slate-700 hover:bg-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "catalog" && <Catalog />}
      {tab === "stock" && <Stock />}
      {tab === "prices" && <Prices />}
    </div>
  );
}
