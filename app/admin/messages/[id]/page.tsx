import Link from "next/link";
import { notFound } from "next/navigation";

import { MessageActions } from "@/components/admin/message-actions";
import { Badge } from "@/components/ui/badge";
import { getAdminMessage } from "@/lib/queries/admin";

export default async function AdminMessagePage({ params }: PageProps<"/admin/messages/[id]">) {
  const { id } = await params;
  const message = await getAdminMessage(id);
  if (!message) notFound();

  // Re: in the subject and the original text quoted below it, so replying is one
  // click and the operator's mail client carries their own signature.
  const replyHref = `mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/messages" className="text-muted-foreground text-sm hover:underline">
          ← Messages
        </Link>
        <h1 className="text-display mt-2 text-2xl">{message.subject}</h1>
      </div>

      <div className="bg-card flex flex-col gap-4 rounded-lg border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{message.name}</span>
            <a href={replyHref} className="text-primary hover:underline">
              {message.email}
            </a>
            {message.phone ? <span className="text-data">{message.phone}</span> : null}
            <span className="text-muted-foreground text-xs">
              {message.createdAt.slice(0, 16).replace("T", " ")} · wrote in{" "}
              {message.locale ? message.locale.toUpperCase() : "—"}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2">
            {message.status === "new" ? (
              <Badge>unread</Badge>
            ) : (
              <Badge variant="outline">handled</Badge>
            )}
            <MessageActions id={message.id} status={message.status} subject={message.subject} />
          </div>
        </div>

        {/* whitespace-pre-line: the sender's line breaks are part of what they
            wrote, and collapsing them turns a list into a paragraph. */}
        <p className="border-t pt-4 text-sm leading-relaxed whitespace-pre-line">{message.message}</p>
      </div>
    </div>
  );
}
