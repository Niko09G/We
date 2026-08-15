'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { RewardUnitIcon } from '@/components/reward/RewardUnitIcon'

export type FlyingBeatCoin = {
  id: string
  tableId: string
  points: number
  startX: number
  startY: number
  endX: number
  endY: number
}

export function BeatCoinFlyLayer({ coins }: { coins: FlyingBeatCoin[] }) {
  const [visible, setVisible] = useState<FlyingBeatCoin[]>(coins)

  useEffect(() => {
    setVisible(coins)
  }, [coins])

  return (
    <div className="pointer-events-none absolute inset-0 z-[26] overflow-hidden" aria-hidden>
      <AnimatePresence>
        {visible.map((coin) => (
          <motion.div
            key={coin.id}
            className="absolute flex items-center gap-0.5 rounded-full bg-amber-400/95 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow-lg"
            initial={{
              left: coin.startX,
              top: coin.startY,
              opacity: 0,
              scale: 0.6,
            }}
            animate={{
              left: coin.endX,
              top: coin.endY,
              opacity: [0, 1, 1, 0],
              scale: [0.6, 1.1, 1, 0.85],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.35, ease: [0.22, 0.85, 0.25, 1] }}
            onAnimationComplete={() =>
              setVisible((prev) => prev.filter((c) => c.id !== coin.id))
            }
          >
            <RewardUnitIcon size={12} displayVariant="default" />
            <span className="tabular-nums">+{coin.points}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
