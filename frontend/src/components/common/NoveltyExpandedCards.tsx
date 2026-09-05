import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Binary, 
  ShieldCheck, 
  Users, 
  SearchCode, 
  LockKeyhole, 
  ArrowUpRight,
  CheckCircle2
} from 'lucide-react'

interface NoveltyCard {
  id: string
  number: string
  tag: string
  title: string
  subtitle: string
  description: string
  highlights: string[]
  icon: typeof Binary
  gradient: string
  accentColor: string
  borderColor: string
}

const NOVELTY_CARDS: NoveltyCard[] = [
  {
    id: '01',
    number: '01',
    tag: 'MATHEMATICAL PRECISION',
    title: 'Deterministic 4-Way Engine',
    subtitle: 'Integer-paisa arithmetic eliminating floating-point rounding drift.',
    description: 'While legacy reconcilers rely on 2-way batch comparisons and lossy floats, LedgerLens Guard executes strict integer-paisa arithmetic across Gateway Payments, Settlement Batches, Bank UTRs, and Account Credits—accounting for exact half-up MDR and 18% GST splits.',
    highlights: ['Exact integer-paisa math', '4-way payment-to-credit recon', 'Razorpay half-up parity'],
    icon: Binary,
    gradient: 'from-blue-600/20 via-indigo-900/40 to-slate-950',
    accentColor: 'text-blue-400',
    borderColor: 'border-blue-500/40'
  },
  {
    id: '02',
    number: '02',
    tag: 'CRYPTOGRAPHIC PROOF',
    title: 'WORM Chain & Bitcoin Anchor',
    subtitle: 'Write-Once-Read-Many ledger anchored with OpenTimestamps.',
    description: 'Audit logs in standard databases are vulnerable to silent DBA tampering. LedgerLens Guard seals every action in a sequential SHA-256 hash chain and periodically commits root anchors to the Bitcoin blockchain via OpenTimestamps—creating undeniable mathematical proof of ledger integrity.',
    highlights: ['SHA-256 hash-chained blocks', 'OpenTimestamps Bitcoin calendar anchor', 'Zero silent mutation'],
    icon: ShieldCheck,
    gradient: 'from-emerald-600/20 via-teal-900/40 to-slate-950',
    accentColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/40'
  },
  {
    id: '03',
    number: '03',
    tag: 'INSTITUTIONAL GOVERNANCE',
    title: 'Maker-Checker Multi-Sig',
    subtitle: 'Cryptographically verified 2-party sign-off for critical exposure.',
    description: 'Prevents single-point rogue overrides and catastrophic misstatements. Critical and high-exposure cases mandate dual cryptographic role authorization: a Reviewer proposal followed by a Senior Approver counter-signature before ledger mutation is finalized.',
    highlights: ['Strict role-based multi-sig', '2-person integrity rule', 'Anti-rubber-stamping telemetry'],
    icon: Users,
    gradient: 'from-amber-600/20 via-orange-900/40 to-slate-950',
    accentColor: 'text-amber-400',
    borderColor: 'border-amber-500/40'
  },
  {
    id: '04',
    number: '04',
    tag: 'ANOMALY FORENSICS',
    title: 'Near-Miss Explainability',
    subtitle: 'Mathematical diagnosis beyond generic "unmatched" flags.',
    description: 'When payments fail to match, traditional tools halt without explanation. Our deterministic engine computes counterfactual near-miss diagnosis—revealing precisely whether a mismatch stems from MDR contract revisions, settlement timing gaps, or GST classification errors.',
    highlights: ['Root-cause delta isolation', 'Multi-signal risk clustering', 'Deterministic narrative validation'],
    icon: SearchCode,
    gradient: 'from-purple-600/20 via-violet-900/40 to-slate-950',
    accentColor: 'text-purple-400',
    borderColor: 'border-purple-500/40'
  },
  {
    id: '05',
    number: '05',
    tag: 'STATUTORY PRIVACY',
    title: 'DPDP Crypto-Shredding',
    subtitle: 'Statutory Right-to-Erasure without breaking hash chain validity.',
    description: 'Solves the fundamental conflict between privacy laws (India DPDP Act 2023, GDPR) and immutable audit ledgers. PII is pre-hashed and encrypted with tenant keys: statutory erasure destroys the decryption key (shredding PII) while preserving 100% of the audit chain\'s cryptographic verification.',
    highlights: ['DPDP Act 2023 Section 12', 'Chain-preserving erasure', '1-click sealed regulator package'],
    icon: LockKeyhole,
    gradient: 'from-rose-600/20 via-red-900/40 to-slate-950',
    accentColor: 'text-rose-400',
    borderColor: 'border-rose-500/40'
  }
]

export default function NoveltyExpandedCards() {
  const [activeId, setActiveId] = useState<string>('01')

  return (
    <section id="architecture-novelty" className="py-28 bg-[#090D16] text-white relative z-20 border-t border-slate-800 overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[350px] bg-blue-600/10 blur-[130px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 right-10 w-[500px] h-[300px] bg-indigo-600/10 blur-[120px] pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-xs font-semibold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Platform Architecture & Novelty
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight">
            Why LedgerLens Guard Stands Out
          </h2>
          
          <p className="text-base md:text-lg text-slate-400 leading-relaxed">
            Engineered to overcome the fundamental vulnerabilities of traditional financial reconciliation: float rounding errors, mutable SQL audit logs, rogue approvals, and compliance paradoxes.
          </p>
        </div>

        {/* Desktop: Expanding Flex Cards Accordion (Framer style) */}
        <div className="hidden lg:flex gap-4 h-[470px] w-full items-stretch">
          {NOVELTY_CARDS.map((card) => {
            const isActive = activeId === card.id
            const Icon = card.icon

            return (
              <motion.div
                key={card.id}
                onClick={() => setActiveId(card.id)}
                onMouseEnter={() => setActiveId(card.id)}
                layout
                transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                className={`relative rounded-3xl cursor-pointer overflow-hidden border transition-all duration-300 ${
                  isActive 
                    ? `flex-[3.6] ${card.borderColor} shadow-[0_12px_40px_rgba(0,0,0,0.6)]` 
                    : 'flex-[1] border-slate-800/80 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                {/* Background gradient */}
                <div className={`absolute inset-0 bg-gradient-to-b ${card.gradient} opacity-90 pointer-events-none`} />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent pointer-events-none" />

                {/* Card Container */}
                <div className="relative z-10 h-full flex flex-col justify-between p-7">
                  
                  {/* Top Bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center bg-slate-900/80 border ${isActive ? card.borderColor : 'border-slate-800'} backdrop-blur-md shadow-inner`}>
                        <Icon className={`w-5 h-5 ${card.accentColor}`} />
                      </div>
                      {isActive && (
                        <motion.span 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="font-mono text-xs font-bold tracking-widest text-slate-400 uppercase"
                        >
                          {card.tag}
                        </motion.span>
                      )}
                    </div>
                    <span className="font-mono text-sm font-bold tracking-wider text-slate-500">
                      {card.number}
                    </span>
                  </div>

                  {/* Collapsed State: Vertical Text */}
                  {!isActive && (
                    <div className="my-auto flex flex-col items-center justify-center">
                      <div className="[writing-mode:vertical-rl] rotate-180 font-bold text-lg tracking-wide text-slate-400 whitespace-nowrap">
                        {card.title}
                      </div>
                    </div>
                  )}

                  {/* Expanded State Content */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.25 }}
                        className="space-y-5 my-auto max-w-xl"
                      >
                        <div>
                          <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">
                            {card.title}
                          </h3>
                          <p className={`text-sm font-medium ${card.accentColor}`}>
                            {card.subtitle}
                          </p>
                        </div>

                        <p className="text-sm md:text-[0.95rem] text-slate-300 leading-relaxed">
                          {card.description}
                        </p>

                        {/* Highlights checklist */}
                        <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 gap-2">
                          {card.highlights.map((point, i) => (
                            <div key={i} className="flex items-center gap-2.5 text-xs md:text-sm text-slate-200">
                              <CheckCircle2 className={`w-4 h-4 shrink-0 ${card.accentColor}`} />
                              <span>{point}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Bottom Indicator */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 font-mono">
                    <span>STATUS: ACTIVE</span>
                    <ArrowUpRight className={`w-4 h-4 transition-transform ${isActive ? 'rotate-45 text-white' : 'text-slate-600'}`} />
                  </div>

                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Mobile & Tablet: Stacked Expandable Cards */}
        <div className="flex flex-col lg:hidden gap-4">
          {NOVELTY_CARDS.map((card) => {
            const isActive = activeId === card.id
            const Icon = card.icon

            return (
              <div
                key={card.id}
                onClick={() => setActiveId(isActive ? '' : card.id)}
                className={`rounded-2xl border p-6 transition-all duration-300 relative overflow-hidden ${
                  isActive
                    ? `${card.borderColor} bg-slate-900 shadow-xl`
                    : 'border-slate-800 bg-slate-900/50'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-b ${card.gradient} opacity-40 pointer-events-none`} />

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-slate-900 border ${card.borderColor}`}>
                        <Icon className={`w-5 h-5 ${card.accentColor}`} />
                      </div>
                      <div>
                        <span className="font-mono text-[0.7rem] text-slate-400 font-bold uppercase tracking-wider block">
                          {card.tag}
                        </span>
                        <h3 className="font-bold text-lg text-white">
                          {card.title}
                        </h3>
                      </div>
                    </div>
                    <span className="font-mono text-sm text-slate-500 font-bold">
                      {card.number}
                    </span>
                  </div>

                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 pt-2 border-t border-slate-800/80"
                      >
                        <p className={`text-xs font-medium ${card.accentColor}`}>
                          {card.subtitle}
                        </p>
                        <p className="text-sm text-slate-300 leading-relaxed">
                          {card.description}
                        </p>
                        <div className="space-y-2 pt-1">
                          {card.highlights.map((point, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-slate-200">
                              <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${card.accentColor}`} />
                              <span>{point}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </section>
  )
}
