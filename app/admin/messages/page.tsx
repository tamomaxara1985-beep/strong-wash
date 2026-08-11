import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { listAdminMessages } from "@/lib/queries/admin";

export default async function AdminMessagesPage() {
  const messages = await listAdminMessages();
  const unread = messages.filter((message) => message.status === "new").length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display text-2xl">Messages</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {unread} unread, {messages.length} in total. Sent from the contact page; unread first.
        </p>
      </header>

      {messages.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border p-6 text-sm">
          No messages yet. They arrive here when a visitor uses the contact form.
        </p>
      ) : (
        <div className="bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Received</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">From</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Subject</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id} className="border-t">
                  <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                    {message.createdAt.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2">
                    <div className={message.status === "new" ? "font-semibold" : undefined}>
                      {message.name}
                    </div>
                    <div className="text-muted-foreground text-xs">{message.email}</div>
                  </td>
                  <td className="max-w-96 px-3 py-2">
                    <Link
                      href={`/admin/messages/${message.id}`}
                      className={`hover:underline ${message.status === "new" ? "font-semibold" : ""}`}
                    >
                      {message.subject}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {message.status === "new" ? (
                      <Badge>unread</Badge>
                    ) : (
                      <Badge variant="outline">handled</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
