'use client'

import { memo, useState } from 'react'
import { LAYER_COLORS, LAYER_LABELS, LAYER_ORDER, RELATION_LABELS, SystemLayer, RelationType } from '@/types'

const layerEntries = LAYER_ORDER.map((key) => [key, LAYER_LABELS[key]] as [SystemLayer, string])
const relationEntries = Object.entries(RELATION_LABELS) as [RelationType, string][]

function Legend() {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="bg-white/90 backdrop-blur-sm border border-gray-200/60 rounded-lg px-3 py-1.5 text-xs text-gray-500 shadow-sm hover:shadow hover:text-gray-700 hover:bg-white transition-all"
      >
        图例 ▸
      </button>
    )
  }

  return (
    <div className="bg-white/90 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm p-3 min-w-[150px]">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-gray-600">图例</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[10px] text-gray-400 hover:text-gray-600 leading-none transition-colors"
        >
          收起 ◂
        </button>
      </div>

      <div className="mb-2.5">
        <div className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">架构分层</div>
        <div className="space-y-1.5">
          {layerEntries.map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded border-2 flex-shrink-0" style={{ borderColor: LAYER_COLORS[key] }} />
              <span className="text-[11px] text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <div className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">连线类型</div>
        <div className="space-y-1.5">
          {relationEntries.map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <svg width="18" height="8" className="flex-shrink-0">
                <line x1="0" y1="4" x2="13" y2="4" stroke="#8c8c8c" strokeWidth="1.5" strokeDasharray={key === 'depends_on' ? '3,2' : undefined} />
                <polygon points="13,1 17,4 13,7" fill="#8c8c8c" />
              </svg>
              <span className="text-[11px] text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(Legend)
