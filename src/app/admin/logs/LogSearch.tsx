"use client";

import { useState, useMemo } from "react";
import { DataTable } from "@/components/admin/kit";
import ExportCsvButton from "@/components/admin/ExportCsvButton";

export type LogItem = {
  date: string;
  admin: string;
  action: string;
  target: string;
};

export function LogSearch({ initialRows }: { initialRows: LogItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return initialRows;
    return initialRows.filter(
      (r) =>
        r.action.toLowerCase().includes(q) ||
        r.admin.toLowerCase().includes(q) ||
        r.target.toLowerCase().includes(q)
    );
  }, [initialRows, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          className="input"
          placeholder="Filtrar por ação ou e-mail do administrador..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 380, fontSize: 13, padding: "10px 14px", borderRadius: 10 }}
        />
        <ExportCsvButton
          filename="juslegis-admin-logs"
          headers={["Data", "Administrador", "Ação", "Alvo"]}
          rows={filtered.map((r) => [r.date, r.admin, r.action, r.target])}
        />
      </div>
      <DataTable
        cols={["Data", "Administrador", "Ação", "Alvo"]}
        rows={filtered.map((r) => [r.date, r.admin, r.action, r.target])}
        empty="Nenhum registro encontrado."
      />
    </div>
  );
}
