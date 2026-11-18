'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { normalizeRoutePath } from '../../scripts/lib/demo-path.mjs'
import { APP_NAME, APP_NAME_EN, APP_MARK } from '@/lib/branding'
import {
  DashboardOutlined,
  DeploymentUnitOutlined,
  DatabaseOutlined,
  AlertOutlined,
  ScheduleOutlined,
  ProfileOutlined,
} from '@ant-design/icons'

const NAV_ITEMS = [
  { href: '/', label: '总览', icon: <DashboardOutlined /> },
  { href: '/topology', label: '系统拓扑', icon: <DeploymentUnitOutlined /> },
  { href: '/processes', label: '业务流程', icon: <ScheduleOutlined /> },
  { href: '/assets', label: '资产目录', icon: <DatabaseOutlined /> },
  { href: '/impact', label: '影响分析', icon: <AlertOutlined /> },
  { href: '/metadata', label: '元数据', icon: <ProfileOutlined /> },
]

export default function PlatformNav() {
  const pathname = normalizeRoutePath(usePathname(), process.env.NEXT_PUBLIC_BASE_PATH || '')

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold">
            {APP_MARK}
          </div>
          <div>
            <div className="font-semibold text-sm text-gray-800 leading-tight">{APP_NAME}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{APP_NAME_EN}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-3 px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${
                active
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className={`text-[15px] ${active ? 'text-blue-600' : 'text-gray-400'}`}>{item.icon}</span>
              <span>{item.label}</span>
              {active && <span className="ml-auto w-1 h-4 rounded-full bg-blue-500" />}
            </Link>
          )
        })}
      </nav>
      <div className="px-5 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 font-medium">平台正常</div>
            <div className="text-[9px] text-gray-400">数据源 topology.json</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
