import { Skeleton } from "@/components/ui/display";

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando anúncios">
      <Skeleton className="h-12 w-72 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-[22px]" />
        ))}
      </div>
      <Skeleton className="h-[320px] rounded-[26px]" />
    </div>
  );
}
