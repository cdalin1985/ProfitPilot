"use client";

import { ArrowDown, EllipsisVertical, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import type { Opportunity } from "@profit-pilot/contracts";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OpportunityTableProps {
  opportunities: readonly Opportunity[];
}

const productImages: Readonly<Record<string, string>> = {
  "Northline Thermal Mug": "/products/northline-thermal-mug.png",
  "Nomad 65W Travel Charger": "/products/nomad-65w-travel-charger.png",
  "Ridgeway Running Watch": "/products/ridgeway-running-watch.png",
};

function networkLabel(network: Opportunity["network"]): string {
  const labels: Record<Opportunity["network"], string> = {
    awin: "Awin",
    cj_affiliate: "CJ Affiliate",
    amazon_associates: "Amazon Associates",
    manual_feed: "Manual feed",
  };
  return labels[network];
}

export function OpportunityTable({ opportunities }: OpportunityTableProps): React.ReactNode {
  const [selected, setSelected] = useState<Opportunity | undefined>();

  return (
    <>
      <div className="scrollbar-subtle overflow-x-auto">
        <Table className="min-w-[700px] table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[220px] pl-0">Product</TableHead>
              <TableHead className="w-20">Network</TableHead>
              <TableHead className="w-[115px]">
                <span className="inline-flex items-center gap-1">
                  Opportunity
                  <ArrowDown aria-hidden="true" className="size-3.5" />
                </span>
              </TableHead>
              <TableHead className="w-[100px]">Commission</TableHead>
              <TableHead className="w-[95px]">Freshness</TableHead>
              <TableHead className="w-[90px] pr-0 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {opportunities.map((opportunity, index) => (
              <TableRow key={opportunity.id} className="h-[82px]">
                <TableCell className="pl-0">
                  <div className="flex items-center gap-3">
                    <Image
                      alt=""
                      className="size-12 rounded-md object-contain"
                      height={48}
                      loading={index === 0 ? "eager" : "lazy"}
                      src={
                        productImages[opportunity.productName] ??
                        productImages["Northline Thermal Mug"]
                      }
                      width={48}
                    />
                    <span className="max-w-40 whitespace-normal text-sm font-semibold leading-5">
                      {opportunity.productName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{networkLabel(opportunity.network)}</TableCell>
                <TableCell>
                  <span
                    className={opportunity.level === "high" ? "text-primary" : "text-amber-700"}
                  >
                    {opportunity.level === "high" ? "High" : "Medium"}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                    Score {opportunity.score}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="block font-mono text-sm">
                    {opportunity.commissionRate.toFixed(2)}%
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                    ${opportunity.averageCommission.toFixed(2)} avg
                  </span>
                </TableCell>
                <TableCell>
                  <span className="block text-sm">
                    {Math.max(
                      1,
                      Math.round(
                        (Date.parse("2026-07-27T09:00:00.000Z") -
                          Date.parse(opportunity.observedAt)) /
                          86_400_000,
                      ),
                    )}{" "}
                    day{opportunity.observedAt.startsWith("2026-07-26") ? "" : "s"} ago
                  </span>
                  <span
                    className={`mt-0.5 inline-flex items-center gap-1 text-xs ${
                      opportunity.freshnessTrend === "steady"
                        ? "text-muted-foreground"
                        : "text-healthy"
                    }`}
                  >
                    {opportunity.freshnessTrend === "rising" && (
                      <TrendingUp aria-hidden="true" className="size-3" />
                    )}
                    {opportunity.freshnessTrend[0]?.toUpperCase()}
                    {opportunity.freshnessTrend.slice(1)}
                  </span>
                </TableCell>
                <TableCell className="pr-0 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      aria-label={`View ${opportunity.productName}`}
                      onClick={() => setSelected(opportunity)}
                      size="sm"
                      variant="outline"
                    >
                      View
                    </Button>
                    <Button
                      aria-label={`More actions for ${opportunity.productName}`}
                      onClick={() => setSelected(opportunity)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <EllipsisVertical aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open: boolean) => !open && setSelected(undefined)}
      >
        <SheetContent className="sm:max-w-md">
          {selected && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{selected.productName}</SheetTitle>
                <SheetDescription>
                  Opportunity score {selected.score} from {networkLabel(selected.network)}
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-6 p-5">
                <Image
                  alt={selected.productName}
                  className="mx-auto size-48 object-contain"
                  height={192}
                  src={
                    productImages[selected.productName] ?? productImages["Northline Thermal Mug"]
                  }
                  width={192}
                />
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Opportunity</dt>
                    <dd className="mt-1 font-semibold">{selected.score}/100</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Commission rate</dt>
                    <dd className="mt-1 font-semibold">{selected.commissionRate.toFixed(2)}%</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Average commission</dt>
                    <dd className="mt-1 font-semibold">${selected.averageCommission.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Freshness</dt>
                    <dd className="mt-1 font-semibold capitalize">{selected.freshnessTrend}</dd>
                  </div>
                </dl>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
