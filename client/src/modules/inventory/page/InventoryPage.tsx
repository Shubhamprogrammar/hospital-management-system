"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PackageIcon, PlusIcon } from "lucide-react";
import { itemSchema, type ItemValues } from "@/modules/inventory/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/shared/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { PaginationBar } from "@/shared/components/ui/pagination";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import { createItem, getInventoryAlerts, getStock, listItems } from "@/shared/services/pharmacy.service";
import type { InventoryItem } from "@/shared/types/domain";

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const items = useListQuery<InventoryItem>({ queryKey: ["inventory", "items"], queryFn: (params) => listItems(params) });
  const stock = useQuery({ queryKey: ["inventory", "stock"], queryFn: () => getStock({ limit: 20 }) });
  const alerts = useQuery({ queryKey: ["inventory", "alerts"], queryFn: () => getInventoryAlerts() });

  const form = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: { name: "", category: "DRUG", unit: "", reorderPoint: "10", reorderQuantity: "50" },
  });

  const create = useMutation({
    mutationFn: (v: ItemValues) =>
      createItem({ ...v, reorderPoint: Number(v.reorderPoint), reorderQuantity: Number(v.reorderQuantity) }),
    onSuccess: () => {
      toast.success("Item created");
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels, items, and reorder alerts."
        actions={<Button onClick={() => setCreateOpen(true)}><PlusIcon /> Add item</Button>}
      />

      {alerts.data?.lowStock && alerts.data.lowStock.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="mb-2 text-sm font-medium text-warning">⚠ {alerts.data.lowStock.length} low-stock item{alerts.data.lowStock.length > 1 ? "s" : ""} require attention</p>
          <div className="flex flex-wrap gap-2">
            {alerts.data.lowStock.slice(0, 6).map((item) => (
              <Badge key={item.id} variant="warning">
                {item.name} · {item.stockLevel ?? 0} left
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="items">
        <TabsList className="mb-4">
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <div className="rounded-lg border border-border bg-card">
            {items.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : items.isError ? (
              <ErrorState error={items.error} />
            ) : items.data?.items.length === 0 ? (
              <EmptyState icon={PackageIcon} title="No items" description="Add inventory items to get started." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Reorder point</TableHead>
                    <TableHead>Reorder qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.data?.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell><Badge variant="secondary">{i.category}</Badge></TableCell>
                      <TableCell>{i.unit ?? "—"}</TableCell>
                      <TableCell>{i.reorderPoint}</TableCell>
                      <TableCell>{i.reorderQuantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="p-4"><PaginationBar meta={items.meta} onPageChange={items.setPage} /></div>
          </div>
        </TabsContent>

        <TabsContent value="stock">
          <div className="rounded-lg border border-border bg-card">
            {stock.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : stock.isError ? (
              <ErrorState error={stock.error} />
            ) : stock.data?.items.length === 0 ? (
              <EmptyState icon={PackageIcon} title="No stock recorded" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>On hand</TableHead>
                    <TableHead>Batches</TableHead>
                    <TableHead>Nearest expiry</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock.data?.items.map((s) => (
                    <TableRow key={s.item.id}>
                      <TableCell className="font-medium">{s.item.name}</TableCell>
                      <TableCell>{s.totalQuantity} {s.item.unit ?? ""}</TableCell>
                      <TableCell>{s.batchCount}</TableCell>
                      <TableCell className="text-muted-foreground">{s.nearestExpiry ? new Date(s.nearestExpiry).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.lowStock ? "warning" : "success"}>{s.lowStock ? "Low" : "OK"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add item</DialogTitle>
            <DialogDescription>Create a new inventory item.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Name</FormLabel><FormControl><Input placeholder="Paracetamol 500mg" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="DRUG">Drug</SelectItem>
                      <SelectItem value="CONSUMABLE">Consumable</SelectItem>
                      <SelectItem value="EQUIPMENT">Equipment</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="unit" render={({ field }) => (
                <FormItem><FormLabel>Unit</FormLabel><FormControl><Input placeholder="tablet" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="reorderPoint" render={({ field }) => (
                <FormItem><FormLabel>Reorder point</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="reorderQuantity" render={({ field }) => (
                <FormItem><FormLabel>Reorder qty</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add item"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
