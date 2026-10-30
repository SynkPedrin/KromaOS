import { Skeleton } from "@/components/ui/display";

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando anúncios">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-[22px]" />
        ))}
      </div>
      <Skeleton className="h-[380px] rounded-[26px]" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-[300px] rounded-[26px]" />
        <Skeleton className="h-[300px] rounded-[26px]" />
      </div>
    </div>
  );
}
