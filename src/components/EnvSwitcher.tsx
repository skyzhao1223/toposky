'use client'

import { Segmented } from 'antd'
import { EnvType, ENV_LABELS, ENV_COLORS } from '@/types'

interface Props {
  currentEnv: EnvType
  onChange: (env: EnvType) => void
}

export default function EnvSwitcher({ currentEnv, onChange }: Props) {
  const options = (Object.keys(ENV_LABELS) as EnvType[]).map((env) => ({
    label: (
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: ENV_COLORS[env] }}
        />
        {ENV_LABELS[env]}
      </span>
    ),
    value: env,
  }))

  return (
    <Segmented
      size="small"
      value={currentEnv}
      onChange={(v) => onChange(v as EnvType)}
      options={options}
    />
  )
}
