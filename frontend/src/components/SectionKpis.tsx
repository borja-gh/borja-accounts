export interface SectionKpiItem {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}

export function SectionKpis({ items }: { items: SectionKpiItem[] }) {
  return (
    <div className="section-kpis">
      {items.map((it) => (
        <div className="section-kpi" key={it.label}>
          <div className="section-kpi-label">{it.label}</div>
          <div className={`section-kpi-value ${it.valueClass ?? ''}`}>{it.value}</div>
          {it.sub && <div className="section-kpi-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
