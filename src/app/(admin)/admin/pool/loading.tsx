import { TablePageSkeleton } from "@/components/console/skeletons";

export default function Loading() {
  return <TablePageSkeleton stats={6} filters cols={6} />;
}
