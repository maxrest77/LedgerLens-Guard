import { useEffect, useRef, useState } from 'react'
import { useScroll, useTransform, motion, MotionValue, useSpring } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'

const TOTAL_FRAMES = 190

// Define the exact visual milestones based on the actual 190 frames.
// This allows easy tuning if the underlying visual needs adjustment.
const STORY_STATES = [
  {
    id: 'hero',
    title: 'EVERY TRANSACTION.\nEVERY PAISA.\nACCOUNTED FOR.',
    desc: 'LedgerLens Guard acts as a unified source of truth, pulling together disparate payment gateways, banking systems, and accounting software.',
    frameStart: 0,
    frameEnd: 25,
    isHero: true,
  },
  {
    id: '01',
    title: 'EVERYTHING ENTERS.',
    desc: 'Payments, refunds, settlements, bank entries and adjustments enter a unified ledger.',
    frameStart: 35,
    frameEnd: 55,
  },
  {
    id: '02',
    title: 'EVERY MATCH HAS A TRAIL.',
    desc: 'PAYMENT\n→ SETTLEMENT\n→ UTR\n→ BANK CREDIT',
    frameStart: 65,
    frameEnd: 85,
  },
  {
    id: '03',
    title: "EXCEPTIONS DON'T HIDE.",
    desc: 'SHORTFALL • MISSING • FEE MISMATCH • DUPLICATE',
    frameStart: 95,
    frameEnd: 115,
  },
  {
    id: '04',
    title: 'EVERY AMOUNT IS TRACEABLE.',
    desc: 'GROSS\n→ MDR\n→ GST\n→ ADJUSTMENTS\n→ EXPECTED\n→ BANK CREDIT',
    frameStart: 125,
    frameEnd: 145,
  },
  {
    id: '05',
    title: 'EVERY ACTION LEAVES EVIDENCE.',
    desc: 'AUDIT CHAIN\n\n1024 → 1025 → 1026 → 1027 → 1028',
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
          <div className="hidden lg:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <span className="hover:text-slate-900 cursor-pointer transition-colors">Products</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">Banking+</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">Payroll</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">Resources</span>
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
      <section className="py-32 bg-white relative z-20 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
            Effortless Financial Reconciliation
          </h2>
          <p className="text-xl text-slate-500 max-w-3xl mx-auto leading-relaxed">
            LedgerLens Guard acts as a unified source of truth, pulling together disparate payment gateways, banking systems, and accounting software. Discover discrepancies instantly with deterministic rules.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-16">
            <div className="p-10 bg-[#F8FAFC] border border-slate-200 rounded-3xl shadow-sm text-left hover:shadow-md transition-shadow">
              <h3 className="font-bold text-xl mb-4 text-slate-900">Automated Matching</h3>
              <p className="text-slate-600 leading-relaxed">Match millions of transactions across UTRs, Settlement IDs, and Payment IDs with zero manual intervention.</p>
            </div>
            <div className="p-10 bg-[#F8FAFC] border border-slate-200 rounded-3xl shadow-sm text-left hover:shadow-md transition-shadow">
              <h3 className="font-bold text-xl mb-4 text-slate-900">Cryptographic Audit</h3>
              <p className="text-slate-600 leading-relaxed">Every reviewer action is hashed in an immutable blockchain ledger, preventing unauthorized changes.</p>
            </div>
            <div className="p-10 bg-[#F8FAFC] border border-slate-200 rounded-3xl shadow-sm text-left hover:shadow-md transition-shadow">
              <h3 className="font-bold text-xl mb-4 text-slate-900">Forensic Insights</h3>
              <p className="text-slate-600 leading-relaxed">Identify exact fee mismatches, missing credits, and duplicate entries with mathematically proven deltas.</p>
            </div>
          </div>
        </div>
      </section>

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
          
          <div className="text-base text-slate-600 font-medium leading-relaxed max-w-sm">
            {state.desc.split('\n').map((line: string, i: number) => (
              <span key={i} className="block">{line}</span>
            ))}
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
