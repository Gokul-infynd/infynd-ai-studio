import Link from "next/link";

export default function ForgotPasswordPage() {
    return (
        <div className="w-full flex min-h-screen items-center justify-center relative overflow-hidden bg-black">
            {/* Ambient Nebula Background */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[#c62828] opacity-[0.03] mix-blend-screen" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #c62828 0%, transparent 60%)' }}></div>
                {/* Star dot pattern */}
                <div className="absolute inset-0 opacity-[0.1]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }}></div>

                {/* Floating "stars" / particles */}
                <div className="absolute top-[15%] left-[20%] w-1.5 h-1.5 bg-white rounded-full animate-pulse opacity-60 shadow-[0_0_12px_white]"></div>
                <div className="absolute top-[30%] right-[25%] w-2 h-2 bg-white rounded-full animate-pulse opacity-40 shadow-[0_0_15px_white]" style={{ animationDelay: '1.2s' }}></div>
                <div className="absolute bottom-[20%] left-[30%] w-1 h-1 bg-white rounded-full animate-pulse opacity-30 shadow-[0_0_10px_white]" style={{ animationDelay: '0.8s' }}></div>
                <div className="absolute bottom-[35%] right-[20%] w-1.5 h-1.5 bg-[#f44336] rounded-full animate-pulse opacity-50 shadow-[0_0_12px_#f44336]" style={{ animationDelay: '2.5s' }}></div>
                <div className="absolute top-[60%] left-[70%] w-1 h-1 bg-white rounded-full animate-pulse opacity-40 shadow-[0_0_10px_white]" style={{ animationDelay: '1.8s' }}></div>
                <div className="absolute top-[10%] right-[10%] w-2.5 h-2.5 bg-white rounded-full animate-pulse opacity-20 shadow-[0_0_20px_white]" style={{ animationDelay: '3s' }}></div>

                {/* Mist glows */}
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#c62828]/10 blur-[100px] rounded-full mix-blend-screen"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#f44336]/5 blur-[120px] rounded-full mix-blend-screen"></div>
            </div>

            <div className="w-full max-w-[400px] p-8 space-y-8 relative z-10 bg-black/60 backdrop-blur-md border border-white/5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col space-y-2 text-center">
                    <Link href="/" className="inline-flex items-center justify-center mb-6">
                        <span className="text-3xl font-bold tracking-tighter flex items-center gap-1 text-white">
                            in<span className="text-gray-300">Fynd</span>
                            <span className="w-2.5 h-2.5 rounded-full bg-[#f44336] ml-0.5 mt-1"></span>
                        </span>
                    </Link>
                    <h2 className="text-2xl font-semibold tracking-tight text-white">Reset your password</h2>
                    <p className="text-sm text-gray-400 font-light">
                        Enter your email and we'll send you a reset link.
                    </p>
                </div>

                <form className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none text-gray-300">Email Address</label>
                        <input
                            type="email"
                            placeholder="name@company.com"
                            className="flex h-12 w-full bg-white/5 border border-white/10 text-white placeholder:text-gray-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f44336] rounded-xl px-3 py-1 transition-all"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full h-12 inline-flex items-center justify-center bg-[#c62828] hover:bg-[#b71c1c] text-white rounded-xl text-sm font-medium shadow-lg shadow-[#c62828]/20 transition-all hover:translate-y-[-1px] active:translate-y-[1px]"
                    >
                        Send Reset Link
                    </button>
                </form>

                <p className="text-center text-sm text-gray-400">
                    Remember your password?{" "}
                    <Link href="/login" className="text-white hover:text-[#f44336] font-medium transition-colors">
                        Back to login
                    </Link>
                </p>
            </div>
        </div>
    );
}
