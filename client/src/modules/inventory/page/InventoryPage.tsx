"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PackageIcon, PlusIcon, TruckIcon } from "lucide-react";
import { itemSchema, type ItemValues } from "@/modules/inventory/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
import { StatusBadge } from "@/shared/components/feedback/StatusBadge";
import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import {
  adjustStock, createItem, createPurchaseOrder, createSupplier, getInventoryAlerts, getStock,
  listItems, listPurchaseOrders, listSuppliers, receiveBatch, receivePurchaseOrder,
} from "@/shared/services/pharmacy.service";
import type { InventoryItem, PurchaseOrder, Supplier } from "@/shared/types/domain";

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveFor, setReceiveFor] = useState<InventoryItem | null>(null);
  const [adjustFor, setAdjustFor] = useState<InventoryItem | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [receivePoFor, setReceivePoFor] = useState<PurchaseOrder | null>(null);

  const items = useListQuery<InventoryItem>({ queryKey: ["inventory", "items"], queryFn: (params) => listItems(params) });
  const stock = useQuery({ queryKey: ["inventory", "stock"], queryFn: () => getStock({ limit: 20 }) });
  const alerts = useQuery({ queryKey: ["inventory", "alerts"], queryFn: () => getInventoryAlerts() });
  const suppliers = useListQuery<Supplier>({ queryKey: ["inventory", "suppliers"], queryFn: (params) => listSuppliers(params) });
  const purchaseOrders = useListQuery<PurchaseOrder>({ queryKey: ["inventory", "pos"], queryFn: (params) => listPurchaseOrders(params) });

  const form = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: { name: "", category: "DRUG", unit: "", reorderPoint: "10", reorderQuantity: "50" },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["inventory"] });

  const create = useMutation({
    mutationFn: (v: ItemValues) =>
      createItem({ ...v, reorderPoint: Number(v.reorderPoint), reorderQuantity: Number(v.reorderQuantity) }),
    onSuccess: () => {
      toast.success("Item created");
      setCreateOpen(false);
      form.reset();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receiveBatchMut = useMutation({
    mutationFn: (input: { batchNo: string; expiryDate: string; supplierId?: string; quantity: number; unitCost?: number }) =>
      receiveBatch({ ...input, itemId: receiveFor!.id }),
    onSuccess: () => { toast.success("Batch received"); setReceiveFor(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const adjustMut = useMutation({
    mutationFn: (input: { quantityDelta: number; reason?: string }) => adjustStock({ ...input, itemId: adjustFor!.id }),
    onSuccess: () => { toast.success("Stock adjusted"); setAdjustFor(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const receivePoMut = useMutation({
    mutationFn: (items: Array<{ itemId: string; quantityReceived: number }>) => receivePurchaseOrder(receivePoFor!.id, { items }),
    onSuccess: () => { toast.success("Purchase order received"); setReceivePoFor(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels, items, suppliers, and purchase orders."
        actions={
          <>
            <Button variant="outline" onClick={() => setSupplierOpen(true)}><PlusIcon /> Add supplier</Button>
            <Button variant="outline" onClick={() => setPoOpen(true)}><PlusIcon /> Create PO</Button>
            <Button onClick={() => setCreateOpen(true)}><PlusIcon /> Add item</Button>
          </>
        }
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
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="purchase-orders">Purchase orders</TabsTrigger>
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
                    <TableHead className="text-right">Actions</TableHead>
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setReceiveFor(i)}>Receive batch</Button>
                          <Button size="sm" variant="outline" onClick={() => setAdjustFor(i)}>Adjust</Button>
                        </div>
                      </TableCell>
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

        <TabsContent value="suppliers">
          <div className="rounded-lg border border-border bg-card">
            {suppliers.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : suppliers.isError ? (
              <ErrorState error={suppliers.error} />
            ) : suppliers.data?.items.length === 0 ? (
              <EmptyState icon={TruckIcon} title="No suppliers" description="Add suppliers to create purchase orders." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.data?.items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell><Badge variant={s.isActive ? "success" : "secondary"}>{s.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="p-4"><PaginationBar meta={suppliers.meta} onPageChange={suppliers.setPage} /></div>
          </div>
        </TabsContent>

        <TabsContent value="purchase-orders">
          <div className="rounded-lg border border-border bg-card">
            {purchaseOrders.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : purchaseOrders.isError ? (
              <ErrorState error={purchaseOrders.error} />
            ) : purchaseOrders.data?.items.length === 0 ? (
              <EmptyState icon={PackageIcon} title="No purchase orders" description="Create a PO to start procurement." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.data?.items.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-mono text-xs">{po.id.slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">{po.supplier?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {po.items?.map((it) => `${it.item?.name ?? "?"} ×${it.quantityOrdered}`).join(", ") || "—"}
                      </TableCell>
                      <TableCell><StatusBadge status={po.status} /></TableCell>
                      <TableCell className="text-right">
                        {(po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED") && (
                          <Button size="sm" variant="outline" onClick={() => setReceivePoFor(po)}>Receive</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="p-4"><PaginationBar meta={purchaseOrders.meta} onPageChange={purchaseOrders.setPage} /></div>
          </div>
        </TabsContent>
      </Tabs>

      <AddItemDialog open={createOpen} onOpenChange={setCreateOpen} form={form} pending={create.isPending} onSubmit={(v) => create.mutate(v)} />

      {receiveFor && (
        <ReceiveBatchDialog
          item={receiveFor}
          suppliers={suppliers.data?.items ?? []}
          pending={receiveBatchMut.isPending}
          onClose={() => setReceiveFor(null)}
          onSubmit={(input) => receiveBatchMut.mutate(input)}
        />
      )}

      {adjustFor && (
        <AdjustStockDialog
          item={adjustFor}
          pending={adjustMut.isPending}
          onClose={() => setAdjustFor(null)}
          onSubmit={(input) => adjustMut.mutate(input)}
        />
      )}

      <AddSupplierDialog open={supplierOpen} onOpenChange={setSupplierOpen} />
      <CreatePoDialog open={poOpen} onOpenChange={setPoOpen} suppliers={suppliers.data?.items ?? []} items={items.data?.items ?? []} />
      {receivePoFor && (
        <ReceivePoDialog
          po={receivePoFor}
          pending={receivePoMut.isPending}
          onClose={() => setReceivePoFor(null)}
          onSubmit={(items) => receivePoMut.mutate(items)}
        />
      )}
    </div>
  );
}

function AddItemDialog({
  open, onOpenChange, form, pending, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ReturnType<typeof useForm<ItemValues>>;
  pending: boolean;
  onSubmit: (v: ItemValues) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add item</DialogTitle>
          <DialogDescription>Create a new inventory item.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => onSubmit(v))} className="grid grid-cols-2 gap-4">
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
              <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add item"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveBatchDialog({
  item, suppliers, pending, onClose, onSubmit,
}: {
  item: InventoryItem;
  suppliers: Array<{ id: string; name: string }>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { batchNo: string; expiryDate: string; supplierId?: string; quantity: number; unitCost?: number }) => void;
}) {
  const [v, setV] = useState({ batchNo: "", expiryDate: "", supplierId: "", quantity: "0", unitCost: "0" });
  const valid = v.batchNo.trim() && v.expiryDate && Number(v.quantity) > 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive batch</DialogTitle>
          <DialogDescription>{item.name}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="text-xs">Batch no.</Label>
            <Input className="mt-1" value={v.batchNo} onChange={(e) => setV((p) => ({ ...p, batchNo: e.target.value }))} placeholder="LOT-2026-001" />
          </div>
          <div>
            <Label className="text-xs">Expiry</Label>
            <Input className="mt-1" type="date" value={v.expiryDate} onChange={(e) => setV((p) => ({ ...p, expiryDate: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Quantity</Label>
            <Input className="mt-1" type="number" min={1} value={v.quantity} onChange={(e) => setV((p) => ({ ...p, quantity: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Unit cost (₹)</Label>
            <Input className="mt-1" type="number" min={0} value={v.unitCost} onChange={(e) => setV((p) => ({ ...p, unitCost: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Supplier</Label>
            <Select value={v.supplierId} onValueChange={(s) => setV((p) => ({ ...p, supplierId: s }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid || pending}
            onClick={() =>
              onSubmit({
                batchNo: v.batchNo.trim(),
                expiryDate: v.expiryDate,
                supplierId: v.supplierId || undefined,
                quantity: Number(v.quantity),
                unitCost: v.unitCost ? Number(v.unitCost) : undefined,
              })
            }
          >
            Receive batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustStockDialog({
  item, pending, onClose, onSubmit,
}: {
  item: InventoryItem;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { quantityDelta: number; reason?: string }) => void;
}) {
  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("");
  const n = Number(delta);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>{item.name} · positive adds stock, negative writes off.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="text-xs">Delta (can be negative)</Label>
            <Input type="number" className="mt-1" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged stock, cycle count correction" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!n || pending} onClick={() => onSubmit({ quantityDelta: n, reason: reason.trim() || undefined })}>Apply adjustment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSupplierDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => createSupplier({ name: name.trim() }),
    onSuccess: () => {
      toast.success("Supplier added");
      setName("");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add supplier</DialogTitle><DialogDescription>Register a vendor for purchase orders.</DialogDescription></DialogHeader>
        <div>
          <Label className="text-xs">Supplier name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="MedPlus Distributors" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Adding…" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreatePoDialog({
  open, onOpenChange, suppliers, items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string }>;
}) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Array<{ itemId: string; quantityOrdered: string; unitCost: string }>>([{ itemId: "", quantityOrdered: "1", unitCost: "" }]);

  const create = useMutation({
    mutationFn: () =>
      createPurchaseOrder({
        supplierId,
        items: lines
          .filter((l) => l.itemId && Number(l.quantityOrdered) > 0)
          .map((l) => ({ itemId: l.itemId, quantityOrdered: Number(l.quantityOrdered), unitCost: l.unitCost ? Number(l.unitCost) : undefined })),
      }),
    onSuccess: () => {
      toast.success("Purchase order created");
      setLines([{ itemId: "", quantityOrdered: "1", unitCost: "" }]);
      setSupplierId("");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = !!supplierId && lines.some((l) => l.itemId && Number(l.quantityOrdered) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create purchase order</DialogTitle>
          <DialogDescription>Order stock from a supplier.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label className="text-xs">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Order lines</p>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_100px] items-center gap-2">
                <Select value={line.itemId} onValueChange={(v) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, itemId: v } : l)))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Item" /></SelectTrigger>
                  <SelectContent>
                    {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  className="h-9"
                  value={line.quantityOrdered}
                  onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantityOrdered: e.target.value } : l)))}
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Unit cost"
                  className="h-9"
                  value={line.unitCost}
                  onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unitCost: e.target.value } : l)))}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLines((prev) => [...prev, { itemId: "", quantityOrdered: "1", unitCost: "" }])}
            >
              + Add line
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceivePoDialog({
  po, pending, onClose, onSubmit,
}: {
  po: PurchaseOrder;
  pending: boolean;
  onClose: () => void;
  onSubmit: (items: Array<{ itemId: string; quantityReceived: number }>) => void;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const lines = po.items ?? [];
  const ready = lines.some((l) => Number(qty[l.itemId] ?? 0) > 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive purchase order</DialogTitle>
          <DialogDescription>{po.supplier?.name ?? "Supplier"} · {po.id.slice(0, 8)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-[1fr_80px_80px] items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span>{l.item?.name ?? "Item"}</span>
              <span className="text-xs text-muted-foreground">ordered {l.quantityOrdered}</span>
              <Input
                type="number"
                min={0}
                max={l.quantityOrdered}
                className="h-8"
                placeholder="received"
                value={qty[l.itemId] ?? ""}
                onChange={(e) => setQty((prev) => ({ ...prev, [l.itemId]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!ready || pending}
            onClick={() =>
              onSubmit(lines.map((l) => ({ itemId: l.itemId, quantityReceived: Number(qty[l.itemId] ?? 0) })).filter((x) => x.quantityReceived > 0))
            }
          >
            Receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
