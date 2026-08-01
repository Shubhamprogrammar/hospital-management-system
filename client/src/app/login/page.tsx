import { Suspense } from "react";

import { LoginPage } from "@/modules/auth/page/LoginPage";

export default function Login() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
