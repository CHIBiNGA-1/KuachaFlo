import { notFound } from "next/navigation";
import { ShopApp } from "@/components/shop-app";
import { resources } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { section } = await params;
  const { filter } = await searchParams;
  if (![...resources, "reports", "settings"].includes(section)) notFound();
  return <ShopApp initialFilter={filter || ""} />;
}
