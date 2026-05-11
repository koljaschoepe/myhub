import { useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogFooter } from "./Dialog";
import { Button } from "./Button";

export default {
  title: "ui/Dialog",
};

export const Basic = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Confirm delete"
          description="This can't be undone — the file will be moved to Trash."
          size="sm"
        >
          <p className="text-fg-muted">Are you sure you want to delete this file?</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const TriggerForm = () => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="secondary">Edit profile</Button>
    </DialogTrigger>
    <DialogContent title="Edit profile" size="md">
      <p className="text-fg-muted">Form goes here.</p>
      <DialogFooter>
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const Sizes = () => {
  const [size, setSize] = useState<"sm" | "md" | "lg" | "xl" | null>(null);
  return (
    <div className="flex gap-2">
      {(["sm", "md", "lg", "xl"] as const).map((s) => (
        <Button key={s} variant="secondary" onClick={() => setSize(s)}>{s}</Button>
      ))}
      <Dialog open={size !== null} onOpenChange={(o) => !o && setSize(null)}>
        <DialogContent
          title={`Size ${size}`}
          description={`Dialog rendered at size="${size}"`}
          size={size ?? "md"}
        >
          <div className="h-32 bg-overlay rounded-md grid place-items-center text-fg-muted">
            Content area
          </div>
          <DialogFooter>
            <Button variant="primary" onClick={() => setSize(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
