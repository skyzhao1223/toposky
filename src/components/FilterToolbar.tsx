'use client'

import { Select, Input, Tag, Segmented } from 'antd'
import { SearchOutlined, GroupOutlined, AppstoreOutlined, ApartmentOutlined, EyeOutlined, EyeInvisibleOutlined, BranchesOutlined, DeploymentUnitOutlined } from '@ant-design/icons'
import {
  SystemLayer,
  LAYER_LABELS,
  LAYER_COLORS,
  LAYER_ORDER,
  RelationType,
  RELATION_LABELS,
  TopologyData,
} from '@/types'
import { EdgeMode } from './TopologyGraph'
import type { ArchAxis } from './layouts'

export type ClusterMode = 'none' | 'layer' | 'owner'

const ARCH_AXIS_OPTIONS: { label: string; value: ArchAxis }[] = [
  { label: '业务线', value: 'businessLine' },
  { label: '业务域', value: 'domain' },
  { label: '团队', value: 'owner' },
]

interface Props {
  data: TopologyData
  selectedLayers: SystemLayer[]
  onLayerChange: (layers: SystemLayer[]) => void
  selectedOwners: string[]
  onOwnerChange: (owners: string[]) => void
  searchKeyword: string
  onSearchChange: (keyword: string) => void
  clusterMode: ClusterMode
  onClusterModeChange: (mode: ClusterMode) => void
  edgeMode: EdgeMode
  onEdgeModeChange: (mode: EdgeMode) => void
  selectedRelationTypes: RelationType[]
  onRelationTypeChange: (types: RelationType[]) => void
  archMode: boolean
  onArchModeChange: (on: boolean) => void
  archAxis: ArchAxis
  onArchAxisChange: (axis: ArchAxis) => void
}

export default function FilterToolbar({
  data,
  selectedLayers,
  onLayerChange,
  selectedOwners,
  onOwnerChange,
  searchKeyword,
  onSearchChange,
  clusterMode,
  onClusterModeChange,
  edgeMode,
  onEdgeModeChange,
  selectedRelationTypes,
  onRelationTypeChange,
  archMode,
  onArchModeChange,
  archAxis,
  onArchAxisChange,
}: Props) {
  const owners = Array.from(new Set(data.nodes.map((n) => n.owner).filter(Boolean))) as string[]

  const layerOptions = LAYER_ORDER.map((value) => ({
    label: (
      <Tag color={LAYER_COLORS[value]} className="mr-0">
        {LAYER_LABELS[value]}
      </Tag>
    ),
    value,
  }))

  const relationTypeOptions = Object.entries(RELATION_LABELS).map(([value, label]) => ({
    label, value,
  }))

  const activeFilterCount = selectedLayers.length + selectedOwners.length + selectedRelationTypes.length

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="搜索系统... (⌘F)"
          prefix={<SearchOutlined className="text-gray-400" />}
          value={searchKeyword}
          onChange={(e) => onSearchChange(e.target.value)}
          allowClear
          className="!w-[180px]"
          size="small"
        />

        <Select
          mode="multiple"
          placeholder="层级"
          value={selectedLayers}
          onChange={onLayerChange}
          options={layerOptions}
          allowClear
          maxTagCount={1}
          className="min-w-[110px] max-w-[180px]"
          size="small"
          popupMatchSelectWidth={false}
        />

        <Select
          mode="multiple"
          placeholder="负责人"
          value={selectedOwners}
          onChange={onOwnerChange}
          options={owners.map((o) => ({ label: o, value: o }))}
          allowClear
          maxTagCount={1}
          className="min-w-[100px] max-w-[180px]"
          size="small"
          popupMatchSelectWidth={false}
        />

        <Select
          mode="multiple"
          placeholder="关系类型"
          value={selectedRelationTypes}
          onChange={onRelationTypeChange}
          options={relationTypeOptions}
          allowClear
          maxTagCount={1}
          className="min-w-[110px] max-w-[180px]"
          size="small"
          popupMatchSelectWidth={false}
        />

        {activeFilterCount > 0 && (
          <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">
            {activeFilterCount}
          </span>
        )}
      </div>

      <div className="h-4 w-px bg-gray-200" />

      <div className="flex items-center gap-2">
        <Segmented
          size="small"
          value={edgeMode}
          onChange={(v) => onEdgeModeChange(v as EdgeMode)}
          options={[
            { label: '隐藏', value: 'none', icon: <EyeInvisibleOutlined /> },
            { label: '聚焦', value: 'related', icon: <BranchesOutlined /> },
            { label: '全部', value: 'all', icon: <EyeOutlined /> },
          ]}
        />

        {archMode ? (
          <Segmented
            size="small"
            value={archAxis}
            onChange={(v) => onArchAxisChange(v as ArchAxis)}
            options={ARCH_AXIS_OPTIONS}
          />
        ) : (
          <Segmented
            size="small"
            value={clusterMode}
            onChange={(v) => onClusterModeChange(v as ClusterMode)}
            options={[
              { label: '平铺', value: 'none', icon: <AppstoreOutlined /> },
              { label: '层级', value: 'layer', icon: <GroupOutlined /> },
              { label: '团队', value: 'owner', icon: <ApartmentOutlined /> },
            ]}
          />
        )}

        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md cursor-pointer transition-all ${archMode ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 border border-transparent hover:border-gray-200'}`}
          onClick={() => onArchModeChange(!archMode)}
        >
          <DeploymentUnitOutlined className="text-xs" />
          <span className="text-xs font-medium whitespace-nowrap">架构图</span>
        </div>
      </div>
    </div>
  )
}
