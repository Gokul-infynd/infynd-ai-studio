"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, Menu, X, LogOut, LayoutDashboard, Database, Shield, Settings } from "lucide-react";
import { Lineicons } from "@lineiconshq/react-lineicons";
import { DashboardSquare1Bulk, Database2Bulk, Gear1Bulk } from "@lineiconshq/free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { useAuth } from "@/lib/auth-provider";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, signOut, isLoading } = useAuth();
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!isLoading && (!user || !user.isAdmin)) {
            // Check for specific admin email for dev mode
            if (user?.email !== "gokulakrishnan74@gmail.com") {
                toast.error("Access Denied: Admin privileges required");
                router.push("/dashboard");
            }
        }
    }, [user, isLoading, router]);

    const handleLogout = async () => {
        try {
            await signOut();
            toast.success("Logged out successfully");
        } catch (error) {
            toast.error("Logout failed");
        }
    };

    const navItems = [
        { name: "Global Tools", href: "/admin/tools", icon: (props: any) => <Lineicons icon={Gear1Bulk} {...props} /> },
        { name: "Users", href: "/admin/users", icon: (props: any) => <LayoutDashboard className="h-5 w-5" /> },
        { name: "Back to Studio", href: "/dashboard", icon: (props: any) => <LayoutDashboard className="h-5 w-5" /> },
    ];

    if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-foreground">Verifying admin access...</div>;

    return (
        <div className="flex min-h-screen bg-background text-foreground transition-colors duration-300">
            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border shadow-2xl transition-transform duration-300 transform lg:relative lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
                <div className="h-full flex flex-col pt-6 pb-4">
                    <div className="px-6 flex items-center justify-between mb-8">
                        <Link href="/admin" className="flex items-center gap-2">
                            <div className="bg-primary/10 p-1.5 rounded-lg border border-primary/20">
                                <Shield className="h-6 w-6 text-primary" />
                            </div>
                            <span className="text-2xl font-bold tracking-tighter">
                                Admin<span className="text-foreground">Panel</span>
                            </span>
                        </Link>
                        <Button variant="ghost" size="icon" className="lg:hidden text-foreground/70 hover:text-foreground hover:bg-accent" onClick={() => setSidebarOpen(false)}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                                    onClick={() => setSidebarOpen(false)}
                                >
                                    <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="px-6 mt-auto">
                        <Button onClick={handleLogout} variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent transition-colors gap-3">
                            <LogOut className="h-5 w-5" />
                            Sign Out
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
                <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 transition-colors duration-300">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="lg:hidden p-0 mr-1" onClick={() => setSidebarOpen(true)}>
                            <Menu className="h-6 w-6" />
                        </Button>
                        <h2 className="hidden text-sm font-medium text-muted-foreground lg:block">System Administration</h2>
                    </div>

                    <div className="flex items-center gap-3">
                        <ModeToggle />
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
                            {user?.user_metadata?.full_name?.charAt(0) || "A"}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-x-hidden overflow-y-auto w-full">
                    <div className="h-full p-4 sm:p-6 lg:p-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
