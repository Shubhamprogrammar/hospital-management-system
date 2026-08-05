"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, LogOutIcon, MenuIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/shared/components/ui/sheet";
import { Sidebar } from "@/shared/components/layout/Sidebar";
import { ThemeToggle } from "@/shared/components/layout/ThemeToggle";
import { DoctorProfileDialog } from "@/shared/components/layout/DoctorProfileDialog";
import { signOut, useSession } from "@/shared/lib/auth-client";
import { useNotifications } from "@/shared/lib/hooks/useNotifications";
import { useAppDispatch, useAppSelector } from "@/shared/store/hooks";
import { setMobileNavOpen } from "@/shared/store/slice/uiSlice";
import { cn } from "@/shared/lib/utils";
import { ROLES, type Role } from "@/shared/types";
import { getDoctorMe } from "@/shared/services/org.service";

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Topbar() {
  const router = useRouter();
  const { data: session } = useSession();
  const { notifications, unread, markRead, markAllRead } = useNotifications();
  const dispatch = useAppDispatch();
  const mobileNavOpen = useAppSelector((s) => s.ui.mobileNavOpen);
  const [doctorProfileOpen, setDoctorProfileOpen] = useState(false);

  const user = session?.user;
  const userRole = user?.role as Role | undefined;
  const doctorProfile = useQuery({
    queryKey: ["doctors", "me", "topbar"],
    queryFn: () => getDoctorMe(),
    enabled: userRole === ROLES.DOCTOR,
  });

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/60 px-4 backdrop-blur-xl">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => dispatch(setMobileNavOpen(true))}
        aria-label="Open navigation"
      >
        <MenuIcon />
      </Button>
      <Sheet open={mobileNavOpen} onOpenChange={(open) => dispatch(setMobileNavOpen(open))}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar role={userRole} className="border-none" />
        </SheetContent>
      </Sheet>

      <div className="hidden md:block" />

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <BellIcon />
              {unread > 0 && (
                <Badge
                  variant="default"
                  className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-gradient-brand px-1 text-[10px] text-white"
                >
                  {unread > 9 ? "9+" : unread}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 shadow-popover">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              {unread > 0 && (
                <button
                  className="text-xs font-normal text-primary hover:underline"
                  onClick={() => markAllRead.mutate()}
                >
                  Mark all read
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">No notifications yet</p>
            )}
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn(n.status !== "READ" ? "font-medium" : "text-muted-foreground")}
                onClick={() => !n.readAt && markRead.mutate(n.id)}
              >
                <div className="flex w-full flex-col gap-0.5">
                  <span className="truncate">{n.templateKey.replace(/-/g, " ")}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="size-7 bg-gradient-brand text-white">
                <AvatarFallback className="bg-transparent text-inherit">{initials(user?.name)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{user?.name ?? "Account"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="shadow-popover">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{user?.name}</span>
                </div>
            </DropdownMenuLabel>
            {userRole === ROLES.DOCTOR && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setDoctorProfileOpen(true)}>
                  Doctor profile
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOutIcon /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DoctorProfileDialog
        key={`${doctorProfile.data?.id ?? "none"}-${doctorProfileOpen ? "open" : "closed"}`}
        open={doctorProfileOpen}
        onOpenChange={setDoctorProfileOpen}
        doctorProfile={doctorProfile.data ?? null}
      />
    </header>
  );
}
