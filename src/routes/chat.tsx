import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/kitchen/app-shell";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Agent Chat · NutriSync" },
      { name: "description", content: "Your conversations with the NutriSync kitchen agents." },
      { property: "og:title", content: "Agent Chat · NutriSync" },
      { property: "og:description", content: "Your conversations with the NutriSync kitchen agents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  return (
    <>
      <PageHeader eyebrow="Agents" title="Chat" />
      <section className="flex min-h-80 flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center shadow-soft" aria-label="Agent conversations">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
          <MessageSquare className="h-6 w-6" />
        </span>
        <h2 className="text-xl font-semibold">No conversations yet</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">Your conversations with the Dietary, Menu and Inventory agents will appear here.</p>
      </section>
    </>
  );
}
