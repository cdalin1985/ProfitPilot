"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface RequestChangesDialogProps {
  disabled?: boolean;
  onSubmit: (reason: string) => Promise<boolean>;
}

export function RequestChangesDialog({
  disabled,
  onSubmit,
}: RequestChangesDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(): Promise<void> {
    if (reason.trim().length < 10) {
      return;
    }
    setPending(true);
    const completed = await onSubmit(reason.trim());
    setPending(false);
    if (completed) {
      setOpen(false);
      setReason("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} variant="outline">
          Request changes
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request editorial changes</DialogTitle>
          <DialogDescription>
            Explain what must change. The reason is recorded in the approval audit.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="change-reason">Required changes</Label>
          <Textarea
            id="change-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Describe the required correction and the evidence or policy involved."
            rows={5}
            value={reason}
          />
          <p className="text-xs text-muted-foreground">Enter at least 10 characters.</p>
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={() => setOpen(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={pending || reason.trim().length < 10} onClick={submit}>
            {pending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
