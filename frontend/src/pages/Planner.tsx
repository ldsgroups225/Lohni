import { Link } from 'react-router-dom'
import Planner from "../components/planner/Planner"

export default function PlannerPage() {
    return (
        <div className="bg-background text-foreground min-h-screen pb-28 md:pb-0 w-full md:pl-28">
            <main className="py-2">
                <div className="mx-auto max-w-6xl">
                    <header className="flex items-center justify-between pt-4 z-10 relative mb-6">
                        <div className="flex items-center gap-3">
                            <Link
                                to='/'
                                className="p-2 rounded-xl bg-surface border border-border hover:bg-surface transition-colors"
                                aria-label="Retour"
                            >
                                <svg viewBox="0 0 24 24" className="size-5 text-foreground" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                                </svg>
                            </Link>
                            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">Planning des devoirs</h1>
                            <span className="px-2 py-0.5 rounded-full bg-tint border border-border text-foreground text-[10px] font-medium">BÊTA</span>
                        </div>
                    </header>
                    <Planner />
                </div>
            </main>
        </div>
    )
}
