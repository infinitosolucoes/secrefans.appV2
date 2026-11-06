import { EmptyState, PageHeader } from "@/components/ui";

export function ComingSoon({
  title,
  sprint,
  description,
}: {
  title: string;
  sprint: string;
  description: string;
}) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title="Em breve" description={`${description} (previsto para a ${sprint}).`} />
    </>
  );
}
