import { Skeleton } from "@/components/ui/skeleton";

export default function BrowseLoading() {
  return <section className="mx-auto flex w-full max-w-xl flex-col gap-4 py-6" aria-label="화면 불러오는 중" aria-busy="true">
    <Skeleton className="h-8 w-36" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
  </section>;
}
