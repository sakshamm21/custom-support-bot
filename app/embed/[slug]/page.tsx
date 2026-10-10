import { notFound } from "next/navigation";
import { getClient } from "@/lib/engine";
import { ChatWindow } from "@/components/ChatWindow";

export const dynamic = "force-dynamic";

export default async function EmbedPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ standalone?: string }> }) {
  const { slug } = await params;
  const { standalone } = await searchParams;
  const client = await getClient(slug);
  if (!client || !client.active) notFound();
  return (
    <main className={standalone ? "embed standalone" : "embed"}>
      <ChatWindow slug={client.slug} name={client.name} widget={client.widget} embedded={!standalone} />
    </main>
  );
}
