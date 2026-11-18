'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Popover, Badge, Tooltip } from 'antd'
import { LinkOutlined } from '@ant-design/icons'
import { LAYER_COLORS, LAYER_LABELS, STATUS_COLORS, ENV_LABELS, APP_TYPE_LABELS, SystemLayer, AppType, EnvInfo, EnvType, SystemLinks, SystemContact, deriveScope, SCOPE_LABELS, SCOPE_COLORS } from '@/types'

interface SystemNodeData extends Record<string, unknown> {
  name: string
  description: string
  layer?: SystemLayer
  appType?: AppType
  owner?: string
  vendor?: string
  contacts?: SystemContact[]
  url?: string
  links?: SystemLinks
  envInfo?: EnvInfo
  currentEnv?: EnvType
  isMoreButton?: boolean
  isCollapse?: boolean
  groupKey?: string
  flowStep?: number
}

function LinkItem({ icon, label, url }: { icon: string; label: string; url: string }) {
  return (
    <Tooltip title={url} placement="right" mouseEnterDelay={0.3}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline py-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span>{icon}</span>
        <span>{label}</span>
        <LinkOutlined className="text-[10px] opacity-50" />
      </a>
    </Tooltip>
  )
}

function SystemNodeComponent(props: NodeProps) {
  const data = props.data as SystemNodeData
  const color = (data.layer && LAYER_COLORS[data.layer]) || '#8c8c8c'
  const scope = deriveScope(data.layer, data.appType)
  const envInfo = data.envInfo
  const statusColor = envInfo ? STATUS_COLORS[envInfo.status] : undefined
  const hasLinks = data.links && Object.values(data.links).some(Boolean)
  const hasEnvUrls = envInfo && (envInfo.url || envInfo.deployUrl)

  if (data.isMoreButton) {
    return (
      <div
        className="px-3 py-2 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg min-w-[100px] max-w-[140px] text-center cursor-pointer transition-all hover:bg-gray-100 hover:border-gray-400"
      >
        <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-1.5 !h-1.5" />
        <div className="font-medium text-xs text-gray-500 leading-tight">{data.name}</div>
        <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-1.5 !h-1.5" />
      </div>
    )
  }

  const popoverContent = (
    <div className="max-w-[300px] min-w-[200px]">
      <div className="text-xs text-gray-500 mb-1">
        {data.layer ? LAYER_LABELS[data.layer] : '未分层'}
        {data.appType ? ` · ${APP_TYPE_LABELS[data.appType]}` : ''}
        {` · ${SCOPE_LABELS[scope]}`}
        {data.vendor ? ` · 供应商：${data.vendor}` : ''}
        {data.owner ? ` · ${data.owner}` : ''}
      </div>
      <div className="text-xs text-gray-700 mb-2">{data.description}</div>

      {data.url && (
        <div className="pt-2 border-t border-gray-100">
          <LinkItem icon="🌐" label="访问地址" url={data.url} />
        </div>
      )}

      {hasLinks && (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-500 mb-1">相关链接</div>
          {data.links!.repo && <LinkItem icon="📦" label="代码仓库" url={data.links!.repo} />}
          {data.links!.ones && <LinkItem icon="📋" label="ONES 项目" url={data.links!.ones} />}
          {data.links!.wiki && <LinkItem icon="📖" label="文档/Wiki" url={data.links!.wiki} />}
          {data.links!.ci && <LinkItem icon="⚙️" label="CI/CD 流水线" url={data.links!.ci} />}
          {data.links!.monitoring && <LinkItem icon="📊" label="监控面板" url={data.links!.monitoring} />}
        </div>
      )}

      {data.contacts && data.contacts.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-500 mb-1">{data.vendor ? '供应商联系人' : '联系人'}</div>
          <div className="space-y-1.5">
            {data.contacts.map((c, i) => (
              <div key={i} className="text-xs text-gray-600">
                <span className="font-medium text-gray-700">{c.name}</span>
                {c.role && <span className="text-gray-400"> · {c.role}</span>}
                <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-2">
                  {c.phone && <a href={`tel:${c.phone}`} className="hover:text-blue-600">{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="hover:text-blue-600">{c.email}</a>}
                  {c.im && <span>{c.im}</span>}
                </div>
                {c.note && <div className="text-[10px] text-gray-400">{c.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {envInfo && data.currentEnv && (
        <div className="pt-2 mt-2 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-500 mb-1">{ENV_LABELS[data.currentEnv]}环境</div>
          <div className="text-xs text-gray-600 space-y-0.5">
            {envInfo.version && <div>版本: {envInfo.version}</div>}
            {envInfo.replicas !== undefined && <div>实例: {envInfo.replicas}</div>}
            {envInfo.lastDeploy && <div>部署时间: {envInfo.lastDeploy}</div>}
            {envInfo.notes && <div>备注: {envInfo.notes}</div>}
          </div>
          {hasEnvUrls && (
            <div className="mt-1">
              {envInfo.url && <LinkItem icon="🌐" label="访问地址" url={envInfo.url} />}
              {envInfo.deployUrl && <LinkItem icon="🚀" label="部署管理" url={envInfo.deployUrl} />}
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <Popover
      content={popoverContent}
      title={<span className="font-medium">{data.name}</span>}
      trigger="hover"
      mouseEnterDelay={0.4}
      mouseLeaveDelay={0.3}
      overlayInnerStyle={{ padding: '12px 16px' }}
    >
      <div
        className="px-2.5 py-1.5 bg-white border-2 rounded-lg min-w-[88px] max-w-[130px] text-center cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 relative"
        style={{ borderColor: color, borderStyle: data.flowStep ? 'solid' : 'solid' }}
      >
        <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-1.5 !h-1.5 !border-none" />
        {data.flowStep && (
          <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shadow z-10">
            {data.flowStep}
          </span>
        )}
        <div className="font-medium text-xs leading-tight flex items-center justify-center gap-1" style={{ color }}>
          {statusColor && <Badge color={statusColor} className="flex-shrink-0" />}
          <span className="truncate">{data.name}</span>
        </div>
        <span
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] leading-none px-1 py-0.5 rounded-full border bg-white whitespace-nowrap"
          style={{ color: SCOPE_COLORS[scope], borderColor: `${SCOPE_COLORS[scope]}55` }}
        >
          {SCOPE_LABELS[scope]}
        </span>
        <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-1.5 !h-1.5 !border-none" />
      </div>
    </Popover>
  )
}

export default memo(SystemNodeComponent)
