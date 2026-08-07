import { AttachmentList } from "@/components/admin/attachment-list";
import { listAttachments } from "@/lib/queries/admin";

export default async function AdminAttachmentsPage() {
  const rows = await listAttachments();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-display text-2xl">Quote attachments</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Files customers sent with their enquiries — {rows.length} in total. Viewable
          and deletable, but not replaceable: an attachment is the record of what was
          actually submitted.
        </p>
      </header>

      <AttachmentList rows={rows} />
    </div>
  );
}
