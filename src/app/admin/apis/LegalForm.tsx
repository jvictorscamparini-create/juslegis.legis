"use client";

import { useState } from "react";
import { SaveSettingButton, Section, ToggleRow } from "@/components/admin/kit";
import type { Settings } from "@/lib/settings";

const SOURCES: [keyof Settings["legal"]["sources"], string, string][] = [
  ["legislation", "Legislação", "Exige fonte oficial"],
  ["summaries", "Súmulas", "Exige fonte oficial"],
  ["case_law", "Jurisprudência", "Exige fonte verificável"],
  ["doctrine", "Doutrina licenciada", "Exige licença"],
  ["process_lookup", "Consulta processual", "Exige fornecedor autorizado"],
];

export default function LegalForm({ initial }: { initial: Settings["legal"] }) {
  const [v, setV] = useState(initial);
  return (
    <Section title="Fornecedor e contrato" desc="Nenhuma fonte jurídica é apresentada como disponível até a conexão e a licença estarem confirmadas.">
      <div className="grid-auto">
        <label className="field">
          Fornecedor
          <select className="select" value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value as Settings["legal"]["provider"] })}>
            <option value="">Nenhum fornecedor selecionado</option>
            <option value="oficial">Fontes oficiais (acesso público)</option>
            <option value="lic">Fornecedor licenciado</option>
          </select>
        </label>
        <label className="field">
          Contrato / licença
          <select className="select" value={v.contract} onChange={(e) => setV({ ...v, contract: e.target.value as Settings["legal"]["contract"] })}>
            <option value="nc">Sem contrato</option>
            <option value="neg">Em negociação</option>
            <option value="at">Contrato ativo</option>
          </select>
        </label>
      </div>
      <div>
        {SOURCES.map(([k, l, h]) => (
          <ToggleRow key={k} label={l} hint={h} on={v.sources[k]} onClick={() => setV({ ...v, sources: { ...v.sources, [k]: !v.sources[k] } })} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <SaveSettingButton settingKey="legal" value={v} what="o fornecedor jurídico" />
      </div>
    </Section>
  );
}
