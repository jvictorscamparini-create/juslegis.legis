"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Section } from "@/components/admin/kit";

export function AdminCharts({ data }: { data: { label: string; users: number; tokens: number }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(350px,1fr))", gap: 20, marginTop: 20 }}>
      <Section title="Novos usuários por mês" desc="Tendência de cadastros na plataforma.">
        <div style={{ width: "100%", height: 280, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} allowDecimals={false} />
              <Tooltip formatter={(value) => [value ?? 0, "Usuários"]} />
              <Bar dataKey="users" fill="#1e293b" radius={[4, 4, 0, 0]} name="Novos Usuários" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Consumo de tokens de IA por mês" desc="Volume total de tokens (entrada + saída).">
        <div style={{ width: "100%", height: 280, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
              <Tooltip formatter={(value) => [Number(value ?? 0).toLocaleString("pt-BR"), "Tokens"]} />
              <Bar dataKey="tokens" fill="#b45309" radius={[4, 4, 0, 0]} name="Tokens de IA" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  );
}
