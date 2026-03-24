'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_REWARD_UNIT,
  fetchRewardUnitConfig,
  type RewardUnitConfig,
} from '@/lib/reward-unit'

type Ctx = {
  config: RewardUnitConfig
  loading: boolean
  /** Re-fetch from server (e.g. after admin saves currency). */
  reload: () => Promise<void>
}

const RewardUnitContext = createContext<Ctx>({
  config: DEFAULT_REWARD_UNIT,
  loading: true,
  reload: async () => {},
})

export function RewardUnitProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RewardUnitConfig>(DEFAULT_REWARD_UNIT)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const c = await fetchRewardUnitConfig()
      setConfig(c)
    } catch {
      setConfig(DEFAULT_REWARD_UNIT)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo(() => ({ config, loading, reload }), [config, loading, reload])

  return (
    <RewardUnitContext.Provider value={value}>{children}</RewardUnitContext.Provider>
  )
}

export function useRewardUnit(): Ctx {
  return useContext(RewardUnitContext)
}
