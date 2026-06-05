"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EditRulePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/rules/new");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-[#86909c]">跳转中...</p>
    </div>
  );
}
