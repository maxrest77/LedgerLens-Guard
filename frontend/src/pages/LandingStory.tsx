import { useEffect, useRef, useState } from 'react'
import { useScroll, useTransform, motion, MotionValue, useSpring } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import NoveltyExpandedCards from '../components/common/NoveltyExpandedCards'

const TOTAL_FRAMES = 190

// Define the exact visual milestones based on the actual 190 frames.
// This allows easy tuning if the underlying visual needs adjustment.
const STORY_STATES = [
  {
    id: 'hero',
    title: 'EVERY TRANSACTION.\nEVERY PAISA.\nCRYPTOGRAPHICALLY VERIFIED.',
    desc: 'Autonomous 4-way financial reconciliation engine and immutable WORM audit ledger engineered for multi-gateway scale.',
    frameStart: 0,
    frameEnd: 25,
    isHero: true,
  },
  {
    id: '01',
    title: 'MULTI-GATEWAY INGESTION.',
    desc: 'Real-time federated normalization across VelocePay, PrismPay, ISO 20022 CAMT.053, and clearinghouse bank feeds.',
    frameStart: 35,
    frameEnd: 55,
  },
  {
    id: '02',
    title: 'DETERMINISTIC 4-WAY RECON.',
    desc: 'PAYMENT GATEWAY\n→ SETTLEMENT BATCH\n→ BANK UTR\n→ VERIFIED ACCOUNT CREDIT',
    frameStart: 65,
    frameEnd: 85,
  },
  {
    id: '03',
    title: "ANOMALIES PINPOINTED INSTANTLY.",
    desc: 'MDR DRIFT • UNSETTLED PAYMENTS • TAX VARIANCES • DUPLICATE CHARGES\n\nAutomated root-cause scoring with counterfactual near-miss diagnosis.',
    frameStart: 95,
    frameEnd: 115,
  },
  {
    id: '04',
    title: 'EXACT PAISA MATHEMATICS.',
    desc: 'GROSS CAPTURED\n→ CONTRACTUAL MDR\n→ 18% GST DEDUCTION\n→ CHARGEBACK ADJUSTMENTS\n→ NET SETTLEMENT DUE\n→ VERIFIED BANK CREDIT',
    frameStart: 125,
    frameEnd: 145,
  },
  {
    id: '05',
    title: 'IMMUTABLE WORM AUDIT TRAIL.',
    desc: 'MAKER-CHECKER MULTI-SIG\n→ SHA-256 HASH CHAIN\n→ OPENTIMESTAMPS BITCOIN ANCHOR\n→ SEALED REGULATORY EVIDENCE PACK',
    frameStart: 155,
    frameEnd: 190, // Final state holds
  },
]

export default function LandingStory() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [images, setImages] = useState<HTMLImageElement[]>([])
  const [loaded, setLoaded] = useState(0)
  const navigate = useNavigate()

  // High scroll distance for a slow, premium reading experience
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  // Map 0-1 scroll directly to 0-189 frames. This guarantees perfect synchronization.
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 80, damping: 25, restDelta: 0.001 })
  const frameIndex = useTransform(smoothProgress, [0, 1], [0, TOTAL_FRAMES - 1])

  useEffect(() => {
    let isCancelled = false
    const loadImages = async () => {
      let loadedCount = 0
      const promises = []

      for (let i = 1; i <= TOTAL_FRAMES; i++) {
        const img = new Image()
        const num = i.toString().padStart(3, '0')
        img.src = `/frames/frame_${num}.png`
        
        const p = new Promise<HTMLImageElement>((resolve) => {
          img.onload = () => {
            if (isCancelled) return
            loadedCount++
            setLoaded(loadedCount)
            resolve(img)
          }
          img.onerror = () => resolve(img)
        })
        promises.push(p)
      }

      const loadedImages = await Promise.all(promises)
      
      if (!isCancelled) {
        setImages(loadedImages)
      }
    }
    loadImages()
    return () => { isCancelled = true }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (images.length > 0 && images[0]) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(images[0], 0, 0, canvas.width, canvas.height)
    }

    const unsubscribe = frameIndex.on('change', (latest) => {
      const idx = Math.floor(latest)
      if (images[idx] && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(images[idx], 0, 0, canvas.width, canvas.height)
      }
    })

    return () => unsubscribe()
  }, [images, frameIndex])

  return (
    <div className="bg-[#F8FAFC] min-h-screen text-slate-900 font-sans selection:bg-slate-200">
      
      {/* Loading Overlay */}
      {loaded < Math.min(20, TOTAL_FRAMES) && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#F8FAFC]">
          <div className="text-slate-900 font-mono mb-4 text-3xl animate-pulse">_</div>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Loading visualizer {Math.round((loaded / TOTAL_FRAMES) * 100)}%</p>
        </div>
      )}

      {/* Navbar - Premium Fintech Aesthetic */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 h-20 flex items-center justify-between px-8 md:px-12 transition-all">
        <div className="flex items-center gap-10">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-slate-900 cursor-pointer">
            <span className="text-red-600 font-mono">_</span>
            LEDGERLENS
          </h1>
          <div className="hidden lg:flex items-center gap-7 text-sm font-semibold text-slate-600">
            <span 
              className="hover:text-slate-900 cursor-pointer transition-colors"
              onClick={() => {
                const el = document.getElementById('recon-overview')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Reconciliation
            </span>
            <span 
              className="hover:text-slate-900 cursor-pointer transition-colors"
              onClick={() => {
                const el = document.getElementById('architecture-novelty')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Architecture
            </span>
            <button
              onClick={() => navigate('/journey')}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100/90 border border-blue-200/80 text-blue-700 font-semibold transition-all shadow-sm cursor-pointer group"
            >
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Engineering Journey</span>
              <span className="text-[0.65rem] bg-blue-600 text-white font-mono px-1.5 py-0.5 rounded font-bold tracking-wider uppercase group-hover:bg-blue-700 transition-colors">
                Story
              </span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="hidden md:inline-flex text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold h-11 px-6 rounded-lg" onClick={() => navigate('/login')}>
            Log In
          </Button>
          <Button className="bg-blue-600 text-white hover:bg-blue-700 font-semibold shadow-sm h-11 px-6 rounded-lg transition-colors" onClick={() => navigate('/login')}>
            Sign Up <span className="ml-1 opacity-70">→</span>
          </Button>
        </div>
      </nav>

      {/* Scroll Storytelling Region */}
      <div ref={containerRef} className="relative h-[1000vh]">
        <div className="sticky top-0 h-screen w-full flex overflow-hidden">
          
          {/* Right: Large 3D Visualization */}
          {/* It occupies the right ~60% of the screen but is allowed to bleed naturally */}
          <div className="absolute right-[-10%] md:right-[-5%] top-[5%] md:top-[10%] h-[90%] w-[120%] md:w-[70%] pointer-events-none z-0 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={1600}
              height={1200}
              className="w-full h-full object-contain drop-shadow-2xl opacity-90 transition-transform duration-1000 ease-out"
            />
          </div>

          {/* Left: Dynamic Story Container */}
          <div className="relative z-10 w-full h-full flex items-center px-6 md:px-16 lg:px-24 pointer-events-none">
            <div className="relative w-full max-w-lg lg:max-w-xl h-auto min-h-[400px]">
              
              {STORY_STATES.map((state) => (
                <StoryPanel key={state.id} state={state} frameIndex={frameIndex} navigate={navigate} />
              ))}

            </div>
          </div>
        </div>
      </div>

      {/* Normal Page Content - Post Hero */}
      <section id="recon-overview" className="py-32 bg-white relative z-20 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-blue-700 font-mono text-xs font-semibold uppercase tracking-wider">
            Enterprise Financial Integrity
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
            Institutional-Grade Reconciliation & Control
          </h2>
          <p className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            LedgerLens Guard unifies multi-PSP settlement feeds, ISO 20022 bank statements, and accounting entries into an automated source of truth. Detect variances with integer paisa precision, enforce Maker-Checker governance, and anchor proof to an immutable WORM audit chain.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12">
            <div className="p-8 md:p-10 bg-[#F8FAFC] border border-slate-200/80 rounded-3xl shadow-sm text-left hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between">
              <div>
                <div className="font-mono text-xs text-blue-600 font-bold uppercase tracking-wider mb-3">
                  01 / Matching Engine
                </div>
                <h3 className="font-bold text-xl mb-3 text-slate-900">Deterministic 4-Way Matching</h3>
                <p className="text-slate-600 text-sm md:text-base leading-relaxed">
                  Reconcile complex payment flows across Gateway Payments, Settlement Batches, Bank UTRs, and Account Credits with exact integer paisa arithmetic and zero rounding drift.
                </p>
              </div>
            </div>
            <div className="p-8 md:p-10 bg-[#F8FAFC] border border-slate-200/80 rounded-3xl shadow-sm text-left hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between">
              <div>
                <div className="font-mono text-xs text-blue-600 font-bold uppercase tracking-wider mb-3">
                  02 / Cryptographic WORM
                </div>
                <h3 className="font-bold text-xl mb-3 text-slate-900">Immutable Audit Chain</h3>
                <p className="text-slate-600 text-sm md:text-base leading-relaxed">
                  Every reviewer decision, threshold override, and case resolution is sealed in a sequential SHA-256 hash chain anchored to external Bitcoin calendar proofs—stopping silent tampering.
                </p>
              </div>
            </div>
            <div className="p-8 md:p-10 bg-[#F8FAFC] border border-slate-200/80 rounded-3xl shadow-sm text-left hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between">
              <div>
                <div className="font-mono text-xs text-blue-600 font-bold uppercase tracking-wider mb-3">
                  03 / Forensic Insights
                </div>
                <h3 className="font-bold text-xl mb-3 text-slate-900">Forensic Anomaly Intelligence</h3>
                <p className="text-slate-600 text-sm md:text-base leading-relaxed">
                  Automatically isolate MDR fee miscalculations, missing bank credits, and settlement timing gaps with counterfactual near-miss diagnosis and multi-signal risk clustering.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
 
      {/* Novelty & Differentiation - Expanding Flex Cards */}
      <NoveltyExpandedCards />

      {/* Access Terminal CTA */}
      <section className="py-32 bg-slate-900 text-white relative z-20">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-10">
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white">
            Ready to secure your ledger?
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Step into the Guard terminal and experience completely automated reconciliation.
          </p>
          <Button 
            size="lg" 
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold tracking-wide px-12 h-16 rounded-xl shadow-lg shadow-blue-900/20 text-lg transition-all"
            onClick={() => navigate('/login')}
          >
            Access Terminal
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-black text-center border-t border-white/10 relative z-20">
        <div className="flex items-center justify-center gap-3 text-slate-500">
          <span className="text-red-600 font-mono text-lg">_</span>
          <p className="font-mono text-sm tracking-widest uppercase font-medium">done by Karthikeyan_S</p>
        </div>
      </footer>
    </div>
  )
}

/**
 * StoryPanel Component
 * Handles the strict fade in/out synchronization for each story state based on frameIndex.
 */
function StoryPanel({ state, frameIndex, navigate }: { state: any, frameIndex: MotionValue<number>, navigate: any }) {
  // Increased fade duration slightly for smoother transition, combined with taller 1000vh container.
  const FADE_DUR = 5
  
  // Create strict visibility milestones based on actual frames
  const milestones = [
    state.frameStart - FADE_DUR, // invisible before
    state.frameStart,            // fully visible
    state.frameEnd,              // starts fading out
    state.frameEnd + FADE_DUR    // fully invisible after
  ]
  
  // Exception: if this is the final state, it holds forever instead of fading out
  const opacityOutput = state.frameEnd >= TOTAL_FRAMES - 1 
    ? [0, 1, 1, 1] 
    : [0, 1, 1, 0]

  // Exception: if this is the first state, it starts visible
  if (state.frameStart === 0) {
    milestones[0] = 0
    milestones[1] = 0
  }

  const opacity = useTransform(frameIndex, milestones, opacityOutput)
  
  // Y-axis movement creates a subtle settling effect. Increased vertical distance for smoother float.
  const yOutput = state.frameEnd >= TOTAL_FRAMES - 1
    ? [30, 0, 0, 0]
    : [30, 0, 0, -30]

  if (state.frameStart === 0) {
    yOutput[0] = 0
    yOutput[1] = 0
  }

  const y = useTransform(frameIndex, milestones, yOutput)

  return (
    <motion.div
      style={{ opacity, y }}
      className={`absolute inset-0 flex flex-col justify-center ${state.isHero ? 'pointer-events-auto' : ''}`}
    >
      <div className="relative overflow-hidden bg-white/20 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.06)] rounded-[2rem] p-8 md:p-10 w-full transition-all">
        {/* Subtle gradient overlay for true premium glass feel */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          {state.id !== 'hero' && (
            <div className="text-blue-600 font-mono text-xs font-bold tracking-widest mb-3 uppercase">
              PHASE {state.id}
            </div>
          )}
          
          {/* Smaller, more professional typography */}
          <h2 className="text-2xl md:text-3xl lg:text-[2.1rem] font-bold tracking-tight mb-5 text-slate-900 leading-[1.2]">
            {state.title.split('\n').map((line: string, i: number) => (
              <span key={i} className="block">{line}</span>
            ))}
          </h2>
          
          <div className="text-base text-slate-600 font-medium leading-relaxed max-w-md space-y-1">
            {state.desc.split('\n').map((line: string, i: number) => {
              if (line === '') {
                return <div key={i} className="h-2" />
              }
              const isArrow = line.startsWith('→')
              const isBulletList = line.includes('•')
              return (
                <span
                  key={i}
                  className={`block ${
                    isArrow
                      ? 'font-mono text-xs tracking-wider text-slate-800 font-semibold pl-1.5'
                      : isBulletList
                      ? 'font-mono text-[0.78rem] text-blue-700 font-semibold tracking-wide py-0.5'
                      : ''
                  }`}
                >
                  {line}
                </span>
              )
            })}
          </div>

          {state.isHero && (
            <div className="mt-8">
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11 px-8 rounded-lg shadow-sm transition-all"
                onClick={() => navigate('/login')}
              >
                Start Building →
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
