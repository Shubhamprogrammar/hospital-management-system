"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { AmbulanceIcon, PlusIcon } from "lucide-react";
import { requestSchema, vehicleSchema, type RequestValues, type VehicleValues } from "@/modules/ambulance/constant/schemas";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
  addVehicle, assignVehicle, listRequests, listVehicles, raiseRequest,
} from "@/shared/services/ambulance.service";
import type { AmbulanceRequest, AmbulanceVehicle } from "@/shared/types/domain";

export default function AmbulancePage() {
  const queryClient = useQueryClient();

  const vehicles = useListQuery<AmbulanceVehicle>({ queryKey: ["ambulance", "vehicles"], queryFn: (params) => listVehicles(params) });
  const requests = useListQuery<AmbulanceRequest>({ queryKey: ["ambulance", "requests"], queryFn: (params) => listRequests(params) });

  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const vehicleForm = useForm<VehicleValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { registrationNo: "", type: "BASIC" },
  });
  const requestForm = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { pickupAddress: "", dropAddress: "", urgency: "ROUTINE" },
  });

  const createVehicle = useMutation({
    mutationFn: (v: VehicleValues) => addVehicle(v),
    onSuccess: () => {
      toast.success("Vehicle added");
      setVehicleOpen(false);
      vehicleForm.reset();
      queryClient.invalidateQueries({ queryKey: ["ambulance", "vehicles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createRequest = useMutation({
    mutationFn: (v: RequestValues) => raiseRequest(v),
    onSuccess: () => {
      toast.success("Request raised");
      setRequestOpen(false);
      requestForm.reset();
      queryClient.invalidateQueries({ queryKey: ["ambulance", "requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: ({ id, vehicleId }: { id: string; vehicleId: string }) => assignVehicle(id, { vehicleId }),
    onSuccess: () => {
      toast.success("Vehicle assigned");
      queryClient.invalidateQueries({ queryKey: ["ambulance", "requests"] });
      queryClient.invalidateQueries({ queryKey: ["ambulance", "vehicles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Ambulance"
        description="Fleet management and dispatch requests."
        actions={
          <>
            <Button variant="outline" onClick={() => setRequestOpen(true)}><PlusIcon /> Raise request</Button>
            <Button onClick={() => setVehicleOpen(true)}><PlusIcon /> Add vehicle</Button>
          </>
        }
      />

      <Tabs defaultValue="requests">
        <TabsList className="mb-4">
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <div className="rounded-lg border border-border bg-card">
            {requests.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : requests.isError ? (
              <ErrorState error={requests.error} />
            ) : requests.data?.items.length === 0 ? (
              <EmptyState icon={AmbulanceIcon} title="No requests" description="Dispatch requests appear here." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pickup</TableHead>
                    <TableHead>Drop</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.data?.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-52 truncate">{r.pickupAddress}</TableCell>
                      <TableCell className="max-w-52 truncate text-muted-foreground">{r.dropAddress ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={r.urgency} /></TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-right">
                        {r.status === "PENDING" && (
                          <Select onValueChange={(v) => assign.mutate({ id: r.id, vehicleId: v })}>
                            <SelectTrigger className="ml-auto h-8 w-40"><SelectValue placeholder="Assign vehicle" /></SelectTrigger>
                            <SelectContent>
                              {vehicles.data?.items.filter((v) => v.status === "AVAILABLE").map((v) => (
                                <SelectItem key={v.id} value={v.id}>{v.registrationNo}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="p-4"><PaginationBar meta={requests.meta} onPageChange={requests.setPage} /></div>
          </div>
        </TabsContent>

        <TabsContent value="vehicles">
          <div className="rounded-lg border border-border bg-card">
            {vehicles.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : vehicles.isError ? (
              <ErrorState error={vehicles.error} />
            ) : vehicles.data?.items.length === 0 ? (
              <EmptyState icon={AmbulanceIcon} title="No vehicles" description="Add an ambulance to your fleet." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Registration</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Driver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.data?.items.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs font-medium">{v.registrationNo}</TableCell>
                      <TableCell>{v.type}</TableCell>
                      <TableCell><StatusBadge status={v.status} /></TableCell>
                      <TableCell>{v.driver?.name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="p-4"><PaginationBar meta={vehicles.meta} onPageChange={vehicles.setPage} /></div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={vehicleOpen} onOpenChange={setVehicleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add vehicle</DialogTitle><DialogDescription>Register an ambulance.</DialogDescription></DialogHeader>
          <Form {...vehicleForm}>
            <form onSubmit={vehicleForm.handleSubmit((v) => createVehicle.mutate(v))} className="flex flex-col gap-4">
              <FormField control={vehicleForm.control} name="registrationNo" render={({ field }) => (
                <FormItem><FormLabel>Registration no.</FormLabel><FormControl><Input placeholder="MH-01-AB-1234" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={vehicleForm.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="BASIC">Basic</SelectItem>
                      <SelectItem value="ICU">ICU</SelectItem>
                      <SelectItem value="MORTUARY">Mortuary</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter><Button type="submit" disabled={createVehicle.isPending}>{createVehicle.isPending ? "Adding…" : "Add vehicle"}</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise request</DialogTitle><DialogDescription>Create a dispatch request.</DialogDescription></DialogHeader>
          <Form {...requestForm}>
            <form onSubmit={requestForm.handleSubmit((v) => createRequest.mutate(v))} className="flex flex-col gap-4">
              <FormField control={requestForm.control} name="pickupAddress" render={({ field }) => (
                <FormItem><FormLabel>Pickup address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={requestForm.control} name="dropAddress" render={({ field }) => (
                <FormItem><FormLabel>Drop address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={requestForm.control} name="urgency" render={({ field }) => (
                <FormItem>
                  <FormLabel>Urgency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="EMERGENCY">Emergency</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                      <SelectItem value="ROUTINE">Routine</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter><Button type="submit" disabled={createRequest.isPending}>{createRequest.isPending ? "Raising…" : "Raise request"}</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
