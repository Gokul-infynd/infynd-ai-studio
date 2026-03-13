"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, Menu, X, LogOut } from "lucide-react";
import { Lineicons } from "@lineiconshq/react-lineicons";
import { DashboardSquare1Bulk, UserMultiple4Bulk, Database2Bulk, CreditCardMultipleBulk, Gear1Bulk, Hammer1Bulk } from "@lineiconshq/free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { ModeToggle } from "@/components/mode-toggle";
import { useAuth } from "@/lib/auth-provider";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const { user, signOut } = useAuth();
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    type LineiconProps = ComponentProps<typeof Lineicons>;

    const handleLogout = async () => {
        try {
            await signOut();
            toast.success("Logged out successfully");
        } catch {
            toast.error("Logout failed");
        }
    };

    const navItems = [
        { name: "Dashboard", href: "/dashboard", icon: (props: LineiconProps) => <Lineicons icon={DashboardSquare1Bulk} {...props} /> },
        { name: "Agents", href: "/dashboard/agents", icon: (props: LineiconProps) => <Lineicons icon={UserMultiple4Bulk} {...props} /> },
        { name: "Workflows", href: "/dashboard/workflows", icon: (props: LineiconProps) => <Lineicons icon={Database2Bulk} {...props} /> },
        { name: "Agent Flow Builder", href: "/dashboard/agent-flow-builder", icon: (props: LineiconProps) => <Lineicons icon={UserMultiple4Bulk} {...props} /> },
        { name: "Tools", href: "/dashboard/tools", icon: (props: LineiconProps) => <Lineicons icon={Hammer1Bulk} {...props} /> },
        { name: "Knowledge Base", href: "/dashboard/knowledge-bases", icon: (props: LineiconProps) => <Lineicons icon={Database2Bulk} {...props} /> },
        { name: "Billing", href: "/dashboard/billing", icon: (props: LineiconProps) => <Lineicons icon={CreditCardMultipleBulk} {...props} /> },
        { name: "Settings", href: "/dashboard/settings", icon: (props: LineiconProps) => <Lineicons icon={Gear1Bulk} {...props} /> },
    ];

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors duration-300">

            {/* Left Side Navigation Bar */}
            <div
                className={`fixed inset-y-0 left-0 z-50 w-72 shrink-0 border-r border-sidebar-border bg-sidebar shadow-2xl transition-transform duration-300 transform lg:relative lg:z-auto lg:h-screen lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                <div className="flex h-full min-h-0 flex-col overflow-hidden pt-6 pb-4">
                    <div className="px-6 flex items-center justify-between mb-8">
                        <Link href="/" className="flex items-center gap-2 group transition-all duration-300">
                            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 rotate-0 group-hover:rotate-6 transition-transform">
                                <span className="text-primary-foreground font-black text-xl">F</span>
                            </div>
                            <span className="text-2xl font-bold tracking-tight text-foreground">
                                inFynd
                                <span className="text-primary">.</span>
                            </span>
                        </Link>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden text-foreground/70 hover:text-foreground hover:bg-accent"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 group relative ${isActive
                                        ? "bg-primary/10 text-primary font-semibold shadow-sm"
                                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:translate-x-1"
                                        }`}
                                    onClick={() => setSidebarOpen(false)}
                                >
                                    {isActive && (
                                        <div className="absolute left-0 w-1 h-5 bg-primary rounded-r-full" />
                                    )}
                                    <item.icon className={`h-5 w-5 transition-colors duration-300 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                                    <span className="text-[15px]">{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="px-6 mt-auto pb-4">
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-accent/50 via-accent/30 to-transparent border border-border/50 mb-4 group cursor-pointer transition-all hover:bg-accent/60">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold border border-primary/20">
                                    {(user?.user_metadata?.full_name || user?.email || "U").charAt(0)}
                                </div>
                                <div className="min-w-0 pr-1">
                                    <p className="text-sm font-semibold text-foreground truncate">{user?.user_metadata?.full_name || "User"}</p>
                                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                                </div>
                            </div>
                        </div>
                        <Button
                            onClick={handleLogout}
                            variant="ghost"
                            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all gap-3 rounded-xl px-4 py-2"
                        >
                            <LogOut className="h-5 w-5" />
                            <span className="text-[15px]">Sign Out</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300">

                {/* Top Navbar */}
                <header className="glass-darker z-40 flex h-20 shrink-0 items-center justify-between border-b border-border/60 px-6 shadow-sm shadow-black/5 transition-all duration-300 sm:px-8">
                    <div className="flex items-center gap-4">
                        {/* Mobile menu toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden p-0 mr-1 hover:bg-accent/50 rounded-xl"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <Menu className="h-6 w-6" />
                        </Button>
                        <div className="flex flex-col lg:hidden">
                             <Link href="/" className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                                    <span className="text-primary-foreground font-black text-lg">F</span>
                                </div>
                                <span className="text-xl font-bold tracking-tight text-foreground">inFynd</span>
                            </Link>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center bg-accent/30 rounded-full px-3 py-1 border border-border/50">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></div>
                            <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">System Online</span>
                        </div>
                        <div className="h-8 w-px bg-border/50 mx-1 hidden sm:block"></div>
                        <ModeToggle />
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-xl hover:bg-accent/50 relative">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full border border-background"></span>
                        </Button>
                        <div className="flex items-center gap-3 pl-2">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-primary to-primary/60 flex items-center justify-center text-sm font-bold text-primary-foreground cursor-pointer transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-primary/20">
                                {(user?.user_metadata?.full_name || user?.email || "U").charAt(0)}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 min-h-0 overflow-hidden w-full">
                    <div className="h-full min-h-0 p-4 sm:p-6 lg:p-8">
                        {children}
                    </div>
                </main>
            </div>

            {/* Mobile Back-drop */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setSidebarOpen(false)}
                />
            )}
        </div>
    );
}
