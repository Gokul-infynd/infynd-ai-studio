"use client";

import { Users, Search, Mail, Shield, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AdminUsersPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                <p className="text-muted-foreground">Manage platform users and their access levels.</p>
            </div>

            <div className="flex items-center gap-4 bg-card p-4 rounded-xl border border-border">
                <Search className="h-5 w-5 text-muted-foreground" />
                <Input placeholder="Search users by name or email..." className="border-none focus-visible:ring-0" />
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wider font-bold text-muted-foreground border-b border-border">
                        <tr>
                            <th className="px-6 py-4">User</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Joined</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        <tr className="hover:bg-accent/20 transition-colors">
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">GK</div>
                                    <div>
                                        <div className="font-medium">Gokulakrishnan K</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> gokulakrishnan74@gmail.com</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-tight">
                                    <Shield className="h-3 w-3" /> Admin
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <span className="h-2 w-2 rounded-full bg-green-500 inline-block mr-2 animate-pulse"></span>
                                <span className="text-sm">Active</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">Mar 10, 2026</td>
                            <td className="px-6 py-4 text-right">
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div className="p-8 text-center border-t border-border">
                    <p className="text-sm text-muted-foreground italic">Full user management backend integration coming soon.</p>
                </div>
            </div>
        </div>
    );
}
