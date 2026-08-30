"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DemoWindow } from "@/components/demo/demo-window";

export function DemoLauncher({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function close() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Try live demo</Button>
      {open ? <DemoWindow organizationId={organizationId} onClose={close} /> : null}
    </>
  );
}
