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
  generatedAt: string;
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

function averageCommission(opportunity: Opportunity): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: opportunity.commissionCurrency,
  }).format(opportunity.averageCommission);
}

function productImage(productName: string): string | undefined {
  return productImages[productName];
}

function freshnessLabel(observedAt: string, generatedAt: string): string {
  const days = Math.max(
    0,
    Math.floor((Date.parse(generatedAt) - Date.parse(observedAt)) / 86_400_000),
  );
  if (days === 0) return "Today";
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function ProductThumbnail({ index, opportunity }: { index?: number; opportunity: Opportunity }) {
  const image = productImage(opportunity.productName);
  return image ? (
    <Image
      alt={index === undefined ? opportunity.productName : ""}
      className={
        index === undefined ? "mx-auto size-48 object-contain" : "size-12 rounded-md object-contain"
      }
      height={index === undefined ? 192 : 48}
      loading={index === 0 ? "eager" : "lazy"}
      src={image}
      width={index === undefined ? 192 : 48}
    />
  ) : (
    <span
      aria-hidden="true"
      className={
        index === undefined
          ? "mx-auto flex size-48 items-center justify-center rounded-lg border bg-muted text-5xl font-semibold"
          : "flex size-12 items-center justify-center rounded-md border bg-muted text-sm font-semibold"
      }
    >
      {opportunity.productName.charAt(0).toUpperCase()}
    </span>
  );
}

export function OpportunityTable({
  generatedAt,
  opportunities,
}: OpportunityTableProps): React.ReactNode {
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
                    <ProductThumbnail index={index} opportunity={opportunity} />
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
                    {opportunity.level[0]?.toUpperCase()}
                    {opportunity.level.slice(1)}
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
                    {averageCommission(opportunity)} avg
                  </span>
                </TableCell>
                <TableCell>
                  <span className="block text-sm">
                    {freshnessLabel(opportunity.observedAt, generatedAt)}
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
                <ProductThumbnail opportunity={selected} />
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
                    <dd className="mt-1 font-semibold">{averageCommission(selected)}</dd>
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
