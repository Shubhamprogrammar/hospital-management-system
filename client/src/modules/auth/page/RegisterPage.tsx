import Link from "next/link";
import { ActivityIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { RegisterForm } from "@/modules/auth/component/RegisterForm";

export function RegisterPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ActivityIcon className="size-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">HMS Portal</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create your account</CardTitle>
            <CardDescription>
              New accounts get patient-portal access. Staff accounts are provisioned by an administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
