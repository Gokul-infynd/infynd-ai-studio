"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

const formSchema = z.object({
    email: z.string().email({ message: "Invalid email address" }),
    password: z.string().min(8, { message: "Password must be at least 8 characters" }),
});

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    const getErrorMessage = (error: unknown) => {
        if (error instanceof Error) return error.message;
        return "Invalid credentials. Please try again.";
    };

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: values.email,
                password: values.password,
            });

            if (error) throw error;

            toast.success("Successfully logged in", {
                description: `Welcome back, ${data.user?.email}`,
            });
            const nextPath = searchParams.get("next");
            router.push(nextPath || "/dashboard");
        } catch (error: unknown) {
            toast.error("Login failed", {
                description: getErrorMessage(error),
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="w-full flex min-h-screen bg-background transition-colors duration-500">

            {/* ===== LEFT PANE - with all effects ===== */}
            <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden border-r border-border/40">

                {/* --- Background Effects (ONLY inside left pane) --- */}
                {/* Large red gradient orb - top right corner */}
                <div
                    className="absolute rounded-full animate-pulse pointer-events-none"
                    style={{
                        top: '-150px',
                        right: '-80px',
                        width: '600px',
                        height: '600px',
                        background: 'radial-gradient(circle, rgba(198,40,40,0.45) 0%, rgba(198,40,40,0.15) 35%, transparent 65%)',
                        filter: 'blur(40px)',
                        animationDuration: '6s',
                    }}
                />
                {/* Red gradient orb - bottom left */}
                <div
                    className="absolute rounded-full animate-pulse pointer-events-none"
                    style={{
                        bottom: '-200px',
                        left: '-100px',
                        width: '500px',
                        height: '500px',
                        background: 'radial-gradient(circle, rgba(255,82,82,0.35) 0%, rgba(255,82,82,0.1) 40%, transparent 65%)',
                        filter: 'blur(50px)',
                        animationDuration: '8s',
                        animationDelay: '2s',
                    }}
                />
                {/* Center accent glow */}
                <div
                    className="absolute rounded-full animate-pulse pointer-events-none"
                    style={{
                        top: '40%',
                        left: '30%',
                        width: '400px',
                        height: '400px',
                        background: 'radial-gradient(circle, rgba(198,40,40,0.2) 0%, transparent 55%)',
                        filter: 'blur(50px)',
                        animationDuration: '10s',
                        animationDelay: '3s',
                    }}
                />
                {/* Grid overlay */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
                        backgroundSize: '60px 60px',
                    }}
                />
                {/* Glowing star particles */}
                <div className="absolute w-2 h-2 rounded-full animate-pulse pointer-events-none" style={{ top: '8%', left: '12%', background: 'white', boxShadow: '0 0 20px 6px rgba(255,255,255,0.7)', animationDuration: '3s' }} />
                <div className="absolute w-1.5 h-1.5 rounded-full animate-pulse pointer-events-none" style={{ top: '22%', right: '15%', background: 'white', boxShadow: '0 0 15px 4px rgba(255,255,255,0.5)', animationDuration: '4s', animationDelay: '1s' }} />
                <div className="absolute w-2.5 h-2.5 rounded-full animate-pulse pointer-events-none" style={{ top: '60%', left: '70%', background: '#ff5252', boxShadow: '0 0 30px 8px rgba(255,82,82,0.7)', animationDuration: '3.5s', animationDelay: '0.5s' }} />
                <div className="absolute w-1.5 h-1.5 rounded-full animate-pulse pointer-events-none" style={{ bottom: '25%', left: '20%', background: 'white', boxShadow: '0 0 18px 5px rgba(255,255,255,0.6)', animationDuration: '5s', animationDelay: '2s' }} />
                <div className="absolute w-2 h-2 rounded-full animate-pulse pointer-events-none" style={{ bottom: '45%', right: '25%', background: '#ff5252', boxShadow: '0 0 22px 6px rgba(255,82,82,0.6)', animationDuration: '6s', animationDelay: '3s' }} />
                <div className="absolute w-1 h-1 rounded-full animate-pulse pointer-events-none" style={{ top: '75%', left: '45%', background: 'white', boxShadow: '0 0 12px 3px rgba(255,255,255,0.4)', animationDuration: '7s', animationDelay: '4s' }} />
                <div className="absolute w-1 h-1 rounded-full animate-pulse pointer-events-none" style={{ top: '5%', left: '55%', background: 'white', boxShadow: '0 0 10px 3px rgba(255,255,255,0.5)', animationDuration: '4.5s', animationDelay: '1.5s' }} />
                {/* --- End Background Effects --- */}

                {/* Logo */}
                <div className="relative z-10">
                    <Link href="/" className="flex items-center gap-2 group transition-all duration-300">
                        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 rotate-0 group-hover:rotate-6 transition-transform">
                            <span className="text-primary-foreground font-black text-2xl">F</span>
                        </div>
                        <span className="text-3xl font-bold tracking-tight text-white">
                            inFynd
                            <span className="text-primary">.</span>
                        </span>
                    </Link>
                </div>

                {/* Center Graphic UI */}
                <div className="relative z-10 flex-1 flex items-center justify-center w-full my-12 pointer-events-none">
                    <div className="w-[85%] max-w-[340px] aspect-[4/3] relative">
                        {/* Main Glass Card */}
                        <div className="absolute inset-0 rounded-[2.5rem] flex flex-col p-8 glass shadow-2xl shadow-black/40">
                            <div className="flex items-center justify-between mb-8">
                                <div className="space-y-2">
                                    <div className="h-2.5 w-24 bg-white/10 rounded-full"></div>
                                    <div className="h-2 w-16 bg-white/5 rounded-full"></div>
                                </div>
                                <div className="h-10 w-10 h-10 rounded-xl flex items-center justify-center glass border-white/10">
                                    <div className="h-3 w-3 bg-primary rounded-sm animate-pulse shadow-[0_0_15px_rgba(234,45,45,0.8)]"></div>
                                </div>
                            </div>
                            <div className="flex-1 flex items-end gap-2 sm:gap-3 justify-between mt-auto px-2">
                                {[35, 60, 45, 80, 55, 100, 75].map((height, i) => (
                                    <div key={i} className="w-full rounded-t-sm relative" style={{ height: '100%', background: 'rgba(255,255,255,0.04)' }}>
                                        <div
                                            className="absolute bottom-0 w-full rounded-t-sm"
                                            style={{ height: `${height}%`, background: 'linear-gradient(to top, #c62828, #ff5252)', boxShadow: '0 0 10px rgba(244,67,54,0.3)' }}
                                        >
                                            <div className="absolute top-0 w-full h-[2px]" style={{ background: 'rgba(255,255,255,0.4)' }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Floating 96k card */}
                        <div className="absolute -top-8 -right-8 w-36 rounded-2xl p-4 animate-[bounce_4s_infinite]" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <div className="h-2 w-12 bg-white/20 rounded-full"></div>
                                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                </div>
                                <div className="text-3xl font-bold tracking-tighter text-white">96k</div>
                                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Outreach emails</div>
                            </div>
                        </div>

                        {/* Floating conversion card */}
                        <div className="absolute -bottom-6 -left-8 rounded-2xl p-4 flex items-center gap-4 animate-[bounce_5s_infinite_reverse] glass shadow-2xl border-white/10">
                            <div className="h-12 w-12 rounded-full flex items-center justify-center bg-background/40 border border-white/10">
                                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            </div>
                            <div className="flex flex-col pr-2">
                                <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Conversion</span>
                                <span className="text-xl font-bold text-white">+24.5%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Text */}
                <div className="relative z-10 max-w-md">
                    <h1 className="text-4xl font-semibold tracking-tight text-white mb-6 leading-tight">
                        Data to Maximize your Deal
                    </h1>
                    <p className="text-lg text-gray-400 font-light mb-8">
                        InFynd turns your B2B data into results—automating outreach, tracking performance, and boosting ROI at every stage.
                    </p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex -space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gray-800 border-2 border-black flex items-center justify-center text-xs text-white">JD</div>
                            <div className="w-10 h-10 rounded-full bg-gray-700 border-2 border-black flex items-center justify-center text-xs text-white">AK</div>
                            <div className="w-10 h-10 rounded-full bg-gray-600 border-2 border-black flex items-center justify-center text-xs text-white">SL</div>
                            <div className="w-10 h-10 rounded-full bg-gray-500 border-2 border-black flex items-center justify-center text-xs text-white">+1k</div>
                        </div>
                        <p>Trusted by 1000+ leading companies</p>
                    </div>
                </div>
            </div>

            {/* ===== RIGHT PANE - Clean solid background ===== */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 relative z-10" style={{ background: '#050505' }}>
                <div className="w-full max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex flex-col space-y-2 text-left">
                        <Link href="/" className="lg:hidden inline-flex items-center mb-6 group">
                             <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-2">
                                <span className="text-primary-foreground font-black text-lg">F</span>
                            </div>
                            <span className="text-2xl font-bold tracking-tight text-white">inFynd</span>
                        </Link>
                        <h2 className="text-3xl font-semibold tracking-tight text-white">Welcome back</h2>
                        <p className="text-sm text-gray-400 font-light">
                            Enter your credentials to access your workspace.
                        </p>
                    </div>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-gray-300">Work Email</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="name@company.com"
                                                {...field}
                                                className="h-12 bg-accent/30 border-border/50 text-white placeholder:text-gray-600 focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl transition-all"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-primary opacity-80" />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center justify-between">
                                            <FormLabel className="text-gray-300">Password</FormLabel>
                                            <Link href="/forgot-password" title="Forgot password?" className="text-xs text-primary/80 hover:text-primary transition-colors font-medium">
                                                Forgot password?
                                            </Link>
                                        </div>
                                        <FormControl>
                                            <Input
                                                type="password"
                                                placeholder="••••••••"
                                                {...field}
                                                className="h-12 bg-accent/30 border-border/50 text-white placeholder:text-gray-600 focus-visible:ring-1 focus-visible:ring-primary/40 rounded-xl transition-all"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-primary opacity-80" />
                                    </FormItem>
                                )}
                            />

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-base font-bold transition-all hover:translate-y-[-1px] active:translate-y-[1px] shadow-xl shadow-primary/20 hover:shadow-primary/30"
                            >
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    <span className="flex items-center">
                                        Sign In <ArrowRight className="ml-2 h-4 w-4" />
                                    </span>
                                )}
                            </Button>
                        </form>
                    </Form>

                    <p className="text-center text-sm text-gray-400 mt-8">
                        Don&apos;t have an account?{" "}
                        <Link href="/register" className="text-white hover:text-primary font-bold transition-colors">
                            Sign up for free
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
