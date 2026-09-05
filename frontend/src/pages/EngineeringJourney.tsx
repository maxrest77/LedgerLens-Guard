import { useRef, useState } from 'react'
import { motion, useScroll, useSpring } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert,
  Sparkles,
  Layers,
  Lock,
  Cpu,
  Scale,
  Fingerprint,
  Compass
} from 'lucide-react'
import { Button } from '../components/ui/button'

interface StoryChapter {
  id: string
  chapterNumber: string
  tagline: string
  title: string
  narrativeOverview: string
  theCrisis: {
    label: string
    description: string
  }
  theBreakthrough: {
    label: string
    description: string
  }
  howItBehaves: {
    label: string
    description: string
  }
  architecturalPillar: string
  icon: typeof ShieldCheck
  themeGlow: string
  badgeStyle: string
}

const CHAPTERS: StoryChapter[] = [
  {
    id: '01',
    chapterNumber: 'ACT I',
    tagline: 'THE SILENT BALANCE LEAK',
    title: 'The Multi-Gateway Discrepancy Paradox',
    narrativeOverview: 
      'In high-volume commerce, money is fragmented across multiple payment gateways, merchant aggregators, and clearing banks. Every provider issues different settlement batches on disparate schedules, creating an optical illusion of balance while actual capital quietly bleeds away.',
    theCrisis: {
      label: 'The Hidden Breakdown',
      description: 'Standard enterprise systems rely on floating-point arithmetic and asynchronous webhooks. Over millions of transactions, fractional rounding errors compound into massive unaccounted sums. When webhooks fail or drop silently, internal ledgers diverge from bank credits, and finance teams spend weeks chasing ghost discrepancies across spreadsheets.'
    },
    theBreakthrough: {
      label: 'The Unified Truth Model',
      description: 'We eliminated floating-point operations entirely, enforcing an immutable integer-arithmetic engine that operates at the individual paisa level with exact contractual MDR and statutory tax rules. Every payment is cross-referenced through a deterministic 4-way validation pipeline: Customer Payment, Gateway Settlement, Bank UTR Credit, and Internal Ledger.'
    },
    howItBehaves: {
      label: 'Autonomous Robustness',
      description: 'The engine ingests chaotic, out-of-order batches from Razorpay, Stripe, and direct banking channels, automatically normalizing them into structured state machines. Micro-rounding anomalies within strict thresholds auto-resolve, while real anomalies are immediately categorized with forensic precision.'
    },
    architecturalPillar: 'Deterministic Integer Precision: Zero tolerance for floating-point drift across millions of daily events.',
    icon: Layers,
    themeGlow: 'from-blue-500/20 to-indigo-950/40 border-blue-500/40 text-blue-400',
    badgeStyle: 'bg-blue-500/10 text-blue-400 border-blue-500/30'
  },
  {
    id: '02',
    chapterNumber: 'ACT II',
    tagline: 'THE CRUCIBLE OF AUDITS',
    title: 'Confronting Vulnerabilities & Eradicating Assumptions',
    narrativeOverview: 
      'Early in our architecture, we subjected the system to an adversarial audit. We asked the hardest question possible: "If a bad actor, an untrusted DBA, or an adversarial gateway feeds corrupted records, can the system be deceived?" The answer forced a total reimagining.',
    theCrisis: {
      label: 'The Vulnerability Exposed',
      description: 'Traditional databases permit direct record mutation. A database administrator with update permissions can alter transaction amounts or mark uncollected funds as settled without leaving a trace. Furthermore, heuristic systems often rely on unchecked assumptions, risking silent false positives during high-stress flash sales.'
    },
    theBreakthrough: {
      label: 'Cryptographic WORM Architecture',
      description: 'We introduced Write-Once-Read-Many (WORM) audit integrity. Every single reconciliation event, reviewer action, and fee adjustment is permanently linked to the previous record through cryptographic hash chaining. Altering even a single character in past history invalidates every subsequent block.'
    },
    howItBehaves: {
      label: 'Autonomous Robustness',
      description: 'The ledger self-verifies continuously. Even if an internal database credential is compromised, the cryptographic hash sequence rejects any retroactively altered record, safeguarding the enterprise against internal fraud and unauthorized ledger tampering.'
    },
    architecturalPillar: 'Tamper-Evident Permanence: History can be appended, but never rewritten or erased.',
    icon: AlertTriangle,
    themeGlow: 'from-amber-500/20 to-orange-950/40 border-amber-500/40 text-amber-400',
    badgeStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
  },
  {
    id: '03',
    chapterNumber: 'ACT III',
    tagline: 'INDUSTRIAL HARDENING',
    title: 'The Resilience Overhaul: Eliminating Failure Points',
    narrativeOverview: 
      'A prototype can afford downtime or memory spikes; an institutional financial engine cannot. We systematically dismantled every performance bottleneck, silent warning, and structural vulnerability to ensure seamless 24/7 reliability under massive traffic peaks.',
    theCrisis: {
      label: 'Systemic Fragility Risks',
      description: 'Unbounded database queries loading millions of settlements caused memory exhaustion. Monolithic frontend bundles slowed down operations on reviewer workstations. Deprecated timing standards risked subtle UTC conversion drift across cross-border settlement windows.'
    },
    theBreakthrough: {
      label: 'Zero-Downtime Hardening',
      description: 'We executed a full-stack hardening initiative: centralized fail-fast security configurations, strict atomic database transactions, paginated aggregation queries that return in milliseconds, and modular code splitting that slashed application bundle size by over 96%.'
    },
    howItBehaves: {
      label: 'Autonomous Robustness',
      description: 'If an unexpected network disruption or third-party API timeout occurs, localized error boundaries prevent cascade failures. The interface remains responsive, data mutations safely roll back, and detailed correlation telemetry tracks every lifecycle event without leaking sensitive credentials.'
    },
    architecturalPillar: 'Defensive Fault Isolation: Every subsystem fails gracefully without compromising core ledger operations.',
    icon: Cpu,
    themeGlow: 'from-purple-500/20 to-indigo-950/40 border-purple-500/40 text-purple-400',
    badgeStyle: 'bg-purple-500/10 text-purple-400 border-purple-500/30'
  },
  {
    id: '04',
    chapterNumber: 'ACT IV',
    tagline: 'AUTONOMOUS DEFENSE',
    title: 'Two-Person Governance & The System-Wide Lockdown',
    narrativeOverview: 
      'Human error and internal collusion remain the single greatest threats to financial stability. We designed LedgerLens Guard so that no single human being—regardless of privilege level—can independently dismiss significant financial discrepancies.',
    theCrisis: {
      label: 'The Single-Operator Hazard',
      description: 'In traditional review queues, an analyst under pressure can rubber-stamp high-risk discrepancies, approve artificial fee waivers, or mark disputed refunds as resolved without secondary verification, exposing the enterprise to multi-crore audit fines.'
    },
    theBreakthrough: {
      label: 'Maker-Checker Multi-Sig & Lockdown Daemons',
      description: 'We implemented strict dual-authorization: when a critical discrepancy arises, one operator can only propose a resolution (the Maker), while an independent senior approver must counter-sign it (the Checker). Simultaneously, an autonomous background daemon actively monitors ledger integrity every 30 seconds.'
    },
    howItBehaves: {
      label: 'Autonomous Robustness',
      description: 'If the daemon detects any chain divergence or unauthorized tampering, the platform immediately activates a two-strike automated lockdown. All settlement approvals are instantly frozen, escalation notifications fire, and the platform protects balance reserves until human and forensic review is complete.'
    },
    architecturalPillar: 'Multi-Signature Governance: Critical financial decisions demand distributed, cryptographic consensus.',
    icon: Lock,
    themeGlow: 'from-emerald-500/20 to-teal-950/40 border-emerald-500/40 text-emerald-400',
    badgeStyle: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
  },
  {
    id: '05',
    chapterNumber: 'ACT V',
    tagline: 'PREDICTIVE RESILIENCE',
    title: 'Dynamic Rule Intelligence & Forensic Counterfactuals',
    narrativeOverview: 
      'Payment rules are not static. Gateways alter merchant discount rates overnight, interchange tiers shift during festive sales, and bank holidays delay settlement windows. The platform needed to adapt dynamically without requiring code releases.',
    theCrisis: {
      label: 'The Code Deployment Bottleneck',
      description: 'In legacy platforms, adjusting fee tolerances or gateway parameters requires developer intervention, database migrations, and testing cycles. By the time changes deploy, hundreds of false alerts have already overwhelmed operations teams.'
    },
    theBreakthrough: {
      label: 'Zero-Risk Rule Prototyping & Root-Cause Analysis',
      description: 'We engineered an interactive rule sandbox that allows compliance officers to simulate new tolerance thresholds against historical data before applying them. Coupled with an intelligent root-cause engine, the platform instantly distinguishes between systemic fee deviations, gateway timing delays, and fraudulent chargebacks.'
    },
    howItBehaves: {
      label: 'Autonomous Robustness',
      description: 'When an exception triggers, the system automatically runs counterfactual checks: "If the settlement fee was 1.8% instead of 2.0%, would this match?" Reviewers receive human-readable explanations and actionable resolution paths rather than opaque error codes.'
    },
    architecturalPillar: 'Adaptive Policy Modeling: Test future financial rules safely before making them legal reality.',
    icon: Compass,
    themeGlow: 'from-cyan-500/20 to-blue-950/40 border-cyan-500/40 text-cyan-400',
    badgeStyle: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
  },
  {
    id: '06',
    chapterNumber: 'ACT VI',
    tagline: 'PROVEN GROUND TRUTH',
    title: 'Mathematical Harmony & Auditor Certainty',
    narrativeOverview: 
      'The destination of our journey: a platform where every single paisa is accounted for, every transaction is cryptographically certified, and external statutory audits transition from a month-long panic into a single-click verification.',
    theCrisis: {
      label: 'The Audit Ordeal',
      description: 'Statutory compliance (RBI, PCI-DSS, Big-4 audits) usually involves frantic data dumps, fragile Excel sheets, and months of retroactive sampling. Regulators are left wondering if the data presented matches actual real-time bank credits.'
    },
    theBreakthrough: {
      label: 'One-Click Sealed Compliance Vaults',
      description: 'We built self-contained, cryptographically signed audit packages. Regulators and compliance officers can download complete historical bundles sealed with immutable calendar proofs, cryptographic hashes, and exact lineage traces for every transaction.'
    },
    howItBehaves: {
      label: 'Autonomous Robustness',
      description: 'Every algorithmic path, tax computation, webhook signature check, and approval transition is perpetually verified under hundreds of automated institutional assertions. When regulators inspect the ledger, mathematical certainty speaks for itself.'
    },
    architecturalPillar: 'Absolute Verifiability: Trust earned through mathematical and cryptographic proof.',
    icon: CheckCircle2,
    themeGlow: 'from-blue-600/20 to-teal-950/40 border-teal-500/40 text-teal-400',
    badgeStyle: 'bg-teal-500/10 text-teal-400 border-teal-500/30'
  }
]

export default function EngineeringJourney() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeChapter, setActiveChapter] = useState<string>('01')

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end']
  })

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 25,
    restDelta: 0.001
  })

  return (
    <div className="min-h-screen bg-[#05070e] text-slate-100 font-sans selection:bg-blue-600/30 selection:text-white">
      
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[750px] h-[500px] bg-blue-600/10 blur-[160px] rounded-full" />
        <div className="absolute top-1/3 right-10 w-[650px] h-[650px] bg-indigo-600/10 blur-[170px] rounded-full" />
        <div className="absolute bottom-10 left-1/3 w-[850px] h-[450px] bg-emerald-600/10 blur-[180px] rounded-full" />
      </div>

      {/* Top Floating Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#05070e]/85 border-b border-slate-800/80 h-20 flex items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-semibold group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Overview</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-red-500 font-mono text-xl font-bold">_</span>
            <span className="font-bold tracking-tight text-white text-lg">LEDGERLENS</span>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 uppercase font-semibold ml-2">
              The Evolution Story
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate('/login')}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm h-10 px-5 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Terminal className="w-4 h-4 mr-2" />
            Launch Terminal
          </Button>
        </div>
      </header>

      {/* Main Journey Container */}
      <main ref={containerRef} className="relative z-10 max-w-6xl mx-auto px-6 py-20">

        {/* Hero Header */}
        <div className="text-center max-w-3xl mx-auto mb-28 space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 font-mono text-xs font-semibold uppercase tracking-widest"
          >
            <Sparkles className="w-3.5 h-3.5" />
            The Origin, Hardening & Institutional Reality
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.15]"
          >
            How We Built the <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-400">
              Uncompromising Ledger Fortress
            </span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto"
          >
            A behind-the-scenes narrative of the vulnerabilities we confronted, the assumptions we dismantled, and how LedgerLens Guard evolved into an autonomous, mathematically certain financial guardian.
          </motion.p>

          {/* Quick Pillar Counters */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8"
          >
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-2xl md:text-3xl font-bold text-white font-mono">4-Way</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Deterministic Matching</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-2xl md:text-3xl font-bold text-emerald-400 font-mono">0 Paisa</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Unaccounted Float Drift</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-2xl md:text-3xl font-bold text-blue-400 font-mono">30s</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Autonomous Integrity Heartbeat</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-2xl md:text-3xl font-bold text-indigo-400 font-mono">Multi-Sig</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Maker-Checker Governance</div>
            </div>
          </motion.div>
        </div>

        {/* Evolving Tree Timeline Container */}
        <div className="relative">

          {/* Center Vertical Trunk - Desktop */}
          <div className="absolute left-1/2 -translate-x-1/2 top-4 bottom-16 w-1 hidden md:block z-0">
            {/* Background inactive trunk line */}
            <div className="w-full h-full bg-slate-800/80 rounded-full" />
            {/* Active illuminated glowing trunk line driven by scroll */}
            <motion.div 
              style={{ scaleY: smoothProgress }}
              className="absolute top-0 left-0 w-full bg-gradient-to-b from-blue-500 via-indigo-400 via-emerald-400 to-teal-300 origin-top shadow-[0_0_16px_rgba(59,130,246,0.6)]"
            />
          </div>

          {/* Milestone Nodes */}
          <div className="space-y-24 md:space-y-36 relative z-10">
            {CHAPTERS.map((chapter, idx) => {
              const isEven = idx % 2 === 0
              const Icon = chapter.icon

              return (
                <div 
                  key={chapter.id}
                  className={`flex flex-col md:flex-row items-center gap-8 md:gap-16 ${
                    isEven ? 'md:flex-row-reverse' : ''
                  }`}
                  onMouseEnter={() => setActiveChapter(chapter.id)}
                >
                  {/* Story Card */}
                  <div className="w-full md:w-[calc(50%-2.5rem)]">
                    <motion.div
                      initial={{ opacity: 0, y: 35 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-60px' }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                      className="relative rounded-3xl border border-slate-800/90 p-7 sm:p-9 bg-slate-900/85 backdrop-blur-xl shadow-2xl hover:border-slate-700 transition-all duration-300 group"
                    >
                      {/* Top Header & Tag */}
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <span className={`font-mono text-xs font-bold px-3 py-1 rounded-full border ${chapter.badgeStyle}`}>
                          {chapter.tagline}
                        </span>
                        <span className="font-mono text-xs text-slate-500 font-semibold tracking-wider">
                          {chapter.chapterNumber}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-4 leading-snug">
                        {chapter.title}
                      </h3>

                      {/* Narrative Overview */}
                      <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6 font-normal">
                        {chapter.narrativeOverview}
                      </p>

                      {/* Dual Problem & Solution Comparison */}
                      <div className="space-y-3.5 pt-4 border-t border-slate-800/80 text-sm">
                        
                        {/* The Crisis */}
                        <div className="p-4 rounded-2xl bg-red-950/25 border border-red-900/35 space-y-1.5">
                          <div className="flex items-center gap-2 text-red-400 font-semibold font-mono text-xs uppercase tracking-wider">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{chapter.theCrisis.label}</span>
                          </div>
                          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                            {chapter.theCrisis.description}
                          </p>
                        </div>

                        {/* The Breakthrough */}
                        <div className="p-4 rounded-2xl bg-blue-950/25 border border-blue-900/35 space-y-1.5">
                          <div className="flex items-center gap-2 text-blue-400 font-semibold font-mono text-xs uppercase tracking-wider">
                            <Sparkles className="w-4 h-4 shrink-0" />
                            <span>{chapter.theBreakthrough.label}</span>
                          </div>
                          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                            {chapter.theBreakthrough.description}
                          </p>
                        </div>

                        {/* How It Behaves Robustly */}
                        <div className="p-4 rounded-2xl bg-emerald-950/25 border border-emerald-900/35 space-y-1.5">
                          <div className="flex items-center gap-2 text-emerald-400 font-semibold font-mono text-xs uppercase tracking-wider">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{chapter.howItBehaves.label}</span>
                          </div>
                          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                            {chapter.howItBehaves.description}
                          </p>
                        </div>

                      </div>

                      {/* Architectural Law Banner */}
                      <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-400 font-medium">
                        <Scale className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <span className="italic leading-relaxed">
                          {chapter.architecturalPillar}
                        </span>
                      </div>

                    </motion.div>
                  </div>

                  {/* Central Tree Node Orb */}
                  <div className="relative flex items-center justify-center shrink-0 z-20">
                    <motion.div 
                      whileHover={{ scale: 1.15 }}
                      className={`w-14 h-14 rounded-full bg-slate-950 border-2 border-blue-500/70 shadow-[0_0_24px_rgba(59,130,246,0.4)] flex items-center justify-center text-white transition-transform ${
                        activeChapter === chapter.id ? 'ring-4 ring-blue-500/20 border-blue-400' : ''
                      }`}
                    >
                      <Icon className="w-6 h-6 text-blue-400" />
                    </motion.div>

                    {/* Horizontal connector branch on desktop */}
                    <div className={`hidden md:block absolute top-1/2 -translate-y-1/2 h-0.5 w-14 bg-gradient-to-r from-blue-500/60 to-indigo-500/60 ${
                      isEven ? 'right-full' : 'left-full'
                    }`} />
                  </div>

                  {/* Empty Spacer Column for Desktop Balance */}
                  <div className="w-full md:w-[calc(50%-2.5rem)] hidden md:block" />

                </div>
              )
            })}
          </div>

        </div>

        {/* The Four Core Pillars of Operation */}
        <div className="mt-36 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              What the Engine Delivers in Production
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Every lesson learned from our engineering journey crystallizes into four autonomous capabilities running non-stop.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 relative overflow-hidden group hover:border-slate-700 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Layers className="w-6 h-6" />
              </div>
              <h4 className="text-xl font-bold text-white tracking-tight">Deterministic 4-Way Ingestion</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Connects directly to multiple PSPs, internal checkout databases, and core banking feeds. Ingests raw batch reports, reconciles every individual event with exact integer paisa arithmetic, and leaves zero unresolved float drift.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 relative overflow-hidden group hover:border-slate-700 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h4 className="text-xl font-bold text-white tracking-tight">Autonomous Threat Lockdown</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                A non-stop background verification daemon validates hash chain integrity across all blocks. If database tampering or unauthorized record injection is discovered, the engine enforces an immediate two-strike lockdown to protect merchant funds.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 relative overflow-hidden group hover:border-slate-700 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Fingerprint className="w-6 h-6" />
              </div>
              <h4 className="text-xl font-bold text-white tracking-tight">Maker-Checker Dual Governance</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Critical exposure exceptions cannot be dismissed by a single reviewer. The platform requires a multi-sig approval workflow where one operator proposes the adjustment and an independent senior approver verifies and confirms it.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 relative overflow-hidden group hover:border-slate-700 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="text-xl font-bold text-white tracking-tight">One-Click Sealed Compliance</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Transforms weeks of regulatory audit preparations into a one-second download. Generates sealed compliance vaults with tamper-evident cryptographic proofs, transaction lineage, and complete immutable history for RBI and Big-4 audits.
              </p>
            </div>

          </div>
        </div>

        {/* Final Call To Action */}
        <div className="mt-32 p-10 sm:p-14 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 text-center space-y-6 relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-blue-600/5 pointer-events-none" />
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-semibold uppercase">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Battle-Tested & Production Ready
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white max-w-2xl mx-auto">
            Experience the Hardened Reconciliation Engine
          </h2>

          <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            Step directly into the live LedgerLens Guard terminal. Explore live 4-way matching, inspect the immutable audit chain, or test maker-checker governance workflows in real time.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => navigate('/login')}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 h-12 rounded-xl shadow-lg shadow-blue-900/30 cursor-pointer"
            >
              <Terminal className="w-4 h-4 mr-2" />
              Access Guard Terminal
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/')}
              className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-semibold px-8 h-12 rounded-xl cursor-pointer"
            >
              Back to Overview
            </Button>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="py-12 bg-black text-center border-t border-slate-900 text-slate-500 text-sm">
        <p className="font-mono text-xs uppercase tracking-widest">
          LedgerLens Guard • The Engineering Odyssey
        </p>
      </footer>

    </div>
  )
}
