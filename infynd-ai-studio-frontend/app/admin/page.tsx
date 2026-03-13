"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/admin/tools");
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-pulse text-muted-foreground">Redirecting to Admin Tools...</div>
        </div>
    );
}
