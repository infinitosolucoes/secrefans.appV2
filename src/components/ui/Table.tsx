import { cn } from "@/lib/cn";

/**
 * Tabela de dados do DS: contorno `border`, cabeçalho `surface-alt` em `ink-muted`,
 * linhas separadas por `border`. Rola na horizontal no mobile (sem estourar a página).
 */
export function Table({
  caption,
  minWidth = 640,
  children,
}: {
  caption: string;
  minWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left type-label" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ columns }: { columns: string[] }) {
  return (
    <thead className="bg-surface-alt text-ink-muted">
      <tr>
        {columns.map((c) => (
          <th key={c} scope="col" className="px-4 py-3 font-semibold">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-t border-border align-top">{children}</tr>;
}

export function Td({
  children,
  muted,
  nowrap,
}: {
  children: React.ReactNode;
  muted?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td className={cn("px-4 py-3", muted && "text-ink-muted", nowrap && "whitespace-nowrap")}>
      {children}
    </td>
  );
}
