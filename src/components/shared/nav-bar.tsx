"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Upload, Settings, ListOrdered, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "导入下单", icon: Upload },
  { href: "/rules", label: "规则管理", icon: Settings },
  { href: "/orders", label: "运单列表", icon: ListOrdered },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#0fc6c2] shadow-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-white no-underline">
          <Sparkles className="h-6 w-6" />
          <span className="text-lg font-bold tracking-wide">万能导入 V2</span>
        </Link>

        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 no-underline",
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
