"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { fixtureContentId } from "@profit-pilot/fixtures";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CreateContentButton(): React.ReactNode {
  const router = useRouter();
  const [created, setCreated] = useState(false);
  const [open, setOpen] = useState(false);

  function continueToDraft(): void {
    setCreated(true);
  }

  function openDraft(): void {
    setOpen(false);
    router.push(`/content/${fixtureContentId}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setCreated(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-11 px-5 text-sm font-semibold">Create content</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-green-50 text-healthy">
                <CheckCircle2 aria-hidden="true" className="size-5" />
              </div>
              <DialogTitle>Brief created</DialogTitle>
              <DialogDescription>
                The draft is grounded in the selected product record and will require validation
                before review.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={openDraft}>
                Open draft
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create content</DialogTitle>
              <DialogDescription>
                Start from a normalized product and an approved editorial format.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-2">
              <div className="grid gap-2">
                <Label htmlFor="content-product">Product</Label>
                <Select defaultValue="northline">
                  <SelectTrigger id="content-product" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="northline">Northline Thermal Mug</SelectItem>
                    <SelectItem value="nomad">Nomad 65W Travel Charger</SelectItem>
                    <SelectItem value="ridgeway">Ridgeway Running Watch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="content-format">Format</Label>
                <Select defaultValue="buying-guide">
                  <SelectTrigger id="content-format" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buying-guide">Buyer’s guide</SelectItem>
                    <SelectItem value="comparison">Comparison</SelectItem>
                    <SelectItem value="product-overview">Product overview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={continueToDraft}>Create brief</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
