"use client";

import { Icon } from "@/components/icons";

export default function ExportCsvButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}) {
  const exportCsv = () => {
    if (!rows.length) return;
    const csvContent = [
      headers.join(";"),
      ...rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={exportCsv}
      className="btn btn-outline"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "8px 14px", height: 36 }}
      disabled={!rows.length}
    >
      <Icon name="files" size={15} color="currentColor" />
      Exportar CSV
    </button>
  );
}
