import { CreatorCard, EmptyState } from "@/components/ui";

export function CreatorGrid({
  creators,
  emptyTitle,
  emptyDescription,
}: {
  creators: Array<{
    handle: string | null;
    display_name: string | null;
    is_creator: boolean | null;
  }>;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  if (creators.length === 0)
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {creators.map((c) => (
        <li key={c.handle}>
          <CreatorCard
            handle={c.handle ?? ""}
            name={c.display_name ?? ""}
            verified={Boolean(c.is_creator)}
          />
        </li>
      ))}
    </ul>
  );
}
